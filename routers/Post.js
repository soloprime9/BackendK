const express = require("express");
const cron = require("node-cron");
const axios = require("axios");
const router = express.Router();
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs"); // Still needed for potential in-memory buffer operations if direct stream is not feasible with ffmpeg
const path = require("path");

const PostAnalytics = require("../models/PostAnalytics");
const { recordActivity } = require("../utils/telemetry");

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

const { getIO } = require("../socket");
const verifyToken = require("../middleware/verifyToken");
const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Report = require("../models/Report");

const jwt = require("jsonwebtoken");

// Helper to safely emit real-time events without crashing if socket is absent
function emitRealtimeEvent(event, data) {
  try {
    const io = getIO();
    if (io) io.emit(event, data);
  } catch (_) {}
}

// Helper: Extract authenticated userId from token headers if present
function extractUserId(req) {
  const token =
    req.headers["x-auth-token"] ||
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null);
  if (!token) return null;
  try {
    const decoded = jwt.decode(token);
    return decoded?.UserId || decoded?.id || decoded?.userId || null;
  } catch {
    return null;
  }
}

// Helper to create notification while respecting recipient's notification preferences
async function dispatchNotification({ recipient, sender, type, post = null, commentText = "" }) {
  try {
    if (!recipient || !sender || recipient.toString() === sender.toString()) return null;

    const recipientUser = await User.findById(recipient).select("notificationPreferences");
    if (recipientUser && recipientUser.notificationPreferences) {
      const prefs = recipientUser.notificationPreferences;
      if (type === "like" && prefs.notifyLikes === false) return null;
      if (type === "comment" && prefs.notifyComments === false) return null;
      if (type === "mention" && prefs.notifyMentions === false) return null;
      if (type === "repost" && prefs.notifyReposts === false) return null;
      if (type === "follow" && prefs.notifyFollows === false) return null;
    }

    const notif = await Notification.create({ recipient, sender, type, post, commentText });
    emitRealtimeEvent("new_notification", {
      type,
      postId: post,
      byUser: sender,
      targetUser: recipient,
      timestamp: new Date()
    });
    return notif;
  } catch (err) {
    console.error("dispatchNotification error:", err.message);
    return null;
  }
}




// 🛡️ ANTI-SPAM IN-MEMORY SLIDING WINDOW RATE LIMITER
const rateLimitMap = new Map();
function checkRateLimit(key, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  const recent = timestamps.filter(t => now - t < windowMs);
  if (recent.length >= maxRequests) return false;
  recent.push(now);
  rateLimitMap.set(key, recent);
  if (rateLimitMap.size > 10000) rateLimitMap.clear();
  return true;
}

// 🔗 OPENGRAPH LINK PREVIEW EXTRACTOR
async function extractOpenGraph(rawUrl) {
  try {
    if (!rawUrl || typeof rawUrl !== "string") return null;
    let validUrl = rawUrl.trim();
    if (!/^https?:\/\//i.test(validUrl)) validUrl = `https://${validUrl}`;

    const parsedUrl = new URL(validUrl);

    // 1. YouTube official oEmbed (instant, never blocked)
    if (parsedUrl.hostname.includes("youtube.com") || parsedUrl.hostname.includes("youtu.be")) {
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(validUrl)}&format=json`);
        if (oembedRes.ok) {
          const ytData = await oembedRes.json();
          return {
            url: validUrl,
            title: ytData.title || "YouTube Video",
            description: `Watch on YouTube • by ${ytData.author_name || "Creator"}`,
            image: ytData.thumbnail_url || "",
            siteName: "YouTube",
            favicon: "https://www.youtube.com/favicon.ico"
          };
        }
      } catch (_) {}
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(validUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
      }
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const html = await res.text();
    const getMeta = (prop) => {
      const regex = new RegExp(`<meta\\s+[^>]*?(?:property|name)=["'](?:og:|twitter:)?${prop}["'][^>]*?content=["']([^"']*)["']`, "i");
      const altRegex = new RegExp(`<meta\\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["'](?:og:|twitter:)?${prop}["']`, "i");
      const match = html.match(regex) || html.match(altRegex);
      return match ? match[1].trim() : "";
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = getMeta("title") || (titleMatch ? titleMatch[1].trim() : "");
    const description = getMeta("description");
    const image = getMeta("image");
    const siteName = getMeta("site_name") || parsedUrl.hostname.replace(/^www\./, "");

    const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i);
    let favicon = faviconMatch ? faviconMatch[1] : "/favicon.ico";
    if (favicon && !favicon.startsWith("http")) {
      try { favicon = new URL(favicon, validUrl).href; } catch (_) {}
    }

    let finalImage = image;
    // YouTube thumbnail fallback
    if (!finalImage && (parsedUrl.hostname.includes("youtube.com") || parsedUrl.hostname.includes("youtu.be"))) {
      let vidId = null;
      if (parsedUrl.hostname.includes("youtu.be")) {
        vidId = parsedUrl.pathname.slice(1).split(/[?&]/)[0];
      } else {
        vidId = parsedUrl.searchParams.get("v");
      }
      if (vidId) {
        finalImage = `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`;
      }
    }

    if (!title && !description && !finalImage) return null;

    return {
      url: validUrl,
      title: title.slice(0, 180),
      description: description.slice(0, 250),
      image: finalImage || "",
      siteName,
      favicon: favicon || ""
    };
  } catch (_) {
    return null;
  }
}

// CREATE POST (Supports text posts, media, hashtags & interactive polls)
router.post(["/create", "/add"], verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;

    // 1. Anti-spam check (Max 8 posts per minute per user)
    if (!checkRateLimit(`post_${userId}`, 8, 60000)) {
      return res.status(429).json({ message: "Slow down! You can only create up to 8 posts per minute." });
    }

    const { title, media, mediaType, thumbnail, category, tags, poll, linkPreview, location } = req.body;

    if (!title && !media && !poll && !linkPreview) {
      return res.status(400).json({ message: "Post must have text content, media, a link, or a poll" });
    }

    // Auto-detect URL in title for link preview if not explicitly passed
    let finalLinkPreview = linkPreview;
    if (!finalLinkPreview && title) {
      const urlMatch = title.match(/https?:\/\/[^\s]+/i);
      if (urlMatch) {
        finalLinkPreview = await extractOpenGraph(urlMatch[0]);
      }
    }

    const resolvedTitle = (title || finalLinkPreview?.title || "Shared Post").trim();

    // Extract hashtags from title
    const extractedTags = Array.isArray(tags) ? tags : [];
    const titleTags = ((resolvedTitle || "").match(/#\w+/g) || []).map(t => t.replace("#", ""));
    const allTags = [...new Set([...extractedTags, ...titleTags])];

    // Generate slug
    const baseSlug = (resolvedTitle || "post")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 50)
      .replace(/^-+|-+$/g, "");
    const slug = `${baseSlug || "post"}-${Date.now()}`;

    // Validate poll if provided (Supports custom expiry duration in hours)
    let pollData = undefined;
    if (poll && poll.question && Array.isArray(poll.options) && poll.options.length >= 2) {
      const durationHours = parseInt(poll.durationHours) || (poll.duration ? parseInt(poll.duration) : 24);
      pollData = {
        question: poll.question.trim(),
        options: poll.options.map((opt) => {
          const val = typeof opt === "string" ? opt.trim() : (opt.optionText || opt.text || "");
          return {
            optionText: val,
            votes: []
          };
        }),
        expiresAt: poll.expiresAt ? new Date(poll.expiresAt) : new Date(Date.now() + durationHours * 3600000)
      };
    }

    // Auto-detect YouTube links vs Any other web link
    let finalMediaType = mediaType || (media ? "image" : (finalLinkPreview ? "link" : "text"));
    let finalThumbnail = thumbnail || (finalLinkPreview?.image || "");
    const allTextToCheck = `${resolvedTitle || ""} ${media || ""} ${finalLinkPreview?.url || ""}`;
    const ytMatch = allTextToCheck.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/|live\/)|youtu\.be\/)([^"&?\/\s]{11})/i
    );
    if (ytMatch && ytMatch[1]) {
      if (!finalThumbnail) {
        finalThumbnail = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
      }
    }

    const newPost = new Post({
      userId,
      title: resolvedTitle,
      slug,
      media: media || "",
      mediaType: finalMediaType,
      thumbnail: finalThumbnail,
      category: category || "Entertainment",
      tags: allTags,
      poll: pollData,
      linkPreview: finalLinkPreview || undefined,
      location: location?.trim() || "",
      trendingScore: 10,
      likes: [],
      comments: []
    });

    const saved = await newPost.save();

    // Auto-detect and notify @mentions in post title
    const mentionedHandles = ((title || "").match(/@([a-zA-Z0-9_]+)/g) || [])
      .map(m => m.replace("@", "").toLowerCase());

    if (mentionedHandles.length > 0) {
      try {
        const mentionedUsers = await User.find({
          username: { $in: mentionedHandles },
          _id: { $ne: userId }
        }).select("_id");

        for (const u of mentionedUsers) {
          await Notification.create({
            recipient: u._id,
            sender: userId,
            type: "mention",
            post: saved._id,
            commentText: title || ""
          });

          emitRealtimeEvent("new_notification", {
            type: "mention",
            postId: saved._id,
            byUser: userId,
            targetUser: u._id,
            timestamp: new Date()
          });
        }
      } catch (mentionErr) {
        console.error("Post mention error:", mentionErr.message);
      }
    }

    const populated = await Post.findById(saved._id).populate("userId", "name username profilePicture isVerified");

    // Passive telemetry recording: log post/short creation
    const isVideoShort = Boolean(
      (saved.mediaType && /video/i.test(saved.mediaType)) ||
      (saved.media && /\.(mp4|mov|webm|mkv)$/i.test(saved.media))
    );
    recordActivity({
      req,
      userId,
      postId: saved._id,
      path: isVideoShort ? `/shorts/${saved._id}` : `/post/${saved._id}`,
      action: isVideoShort ? "short_created" : "post_created",
      isShort: isVideoShort,
      metadata: {
        title: (saved.title || "").slice(0, 100),
        category: saved.category || "general",
      },
      source: "content_creation",
    }).catch(() => {});

    return res.status(201).json(populated);
  } catch (error) {
    console.error("Create Post Error:", error);
    return res.status(500).json({ message: "Error creating post", error: error.message });
  }
});

router.get("/related/mango/getall", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    // 1. Native uploaded videos
    const nativeVideoCondition = {
      $or: [
        { mediaType: { $regex: /video/i } },
        { media: { $regex: /\.(mp4|mov|webm|mkv|m4v)$/i } }
      ],
      media: { $not: /(?:youtube\.com|youtu\.be)/i }
    };

    // 2. Playable YouTube link posts
    const youtubeVideoCondition = {
      $or: [
        { media: { $regex: /(?:youtube\.com|youtu\.be)/i } },
        { "linkPreview.url": { $regex: /(?:youtube\.com|youtu\.be)/i } },
        { "linkPreview.siteName": { $regex: /youtube/i } },
        { title: { $regex: /(?:youtube\.com|youtu\.be)/i } }
      ]
    };

    const populateConfig = [
      { path: "userId", select: "username name profilePicture profilePic avatar isVerified" },
      { path: "comments.userId", select: "username name profilePicture profilePic avatar isVerified" }
    ];

    const sortOptions = { isPinned: -1, trendingScore: -1, views: -1, createdAt: -1 };

    const nativeQuota = Math.ceil(limit * 0.65);
    const youtubeQuota = Math.ceil(limit * 0.45);

    const [nativeVideos, youtubeVideos] = await Promise.all([
      Post.find(nativeVideoCondition)
        .sort(sortOptions)
        .skip(skip)
        .limit(nativeQuota)
        .populate(populateConfig[0])
        .populate(populateConfig[1])
        .lean(),
      Post.find(youtubeVideoCondition)
        .sort({ isPinned: -1, createdAt: -1 })
        .skip(Math.floor(skip * 0.5))
        .limit(youtubeQuota)
        .populate(populateConfig[0])
        .populate(populateConfig[1])
        .lean()
    ]);

    // Enrich and normalize YouTube video posts so frontend renders and plays them seamlessly
    const enrichedYouTubeVideos = (youtubeVideos || []).map((p) => {
      const ytId = getPostYouTubeId(p);
      return {
        ...p,
        youtubeId: ytId,
        media: p.media || (ytId ? `https://www.youtube.com/watch?v=${ytId}` : p.linkPreview?.url || ""),
        thumbnail: p.thumbnail || p.linkPreview?.image || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : ""),
        linkPreview: p.linkPreview || (ytId ? {
          url: `https://www.youtube.com/watch?v=${ytId}`,
          title: p.title || "YouTube Video",
          siteName: "YouTube",
          image: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
        } : null),
        mediaType: "video",
        isYouTubeShort: Boolean(ytId)
      };
    });

    // Top-K Fisher-Yates Jitter: guarantees fresh dynamic rotation on every visit/refresh
    const jitterTop = (arr, k = 6) => {
      if (!Array.isArray(arr) || arr.length <= 1) return arr || [];
      const top = arr.slice(0, Math.min(arr.length, k));
      const rest = arr.slice(k);
      for (let i = top.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [top[i], top[j]] = [top[j], top[i]];
      }
      return [...top, ...rest];
    };

    const jitteredNative = jitterTop(nativeVideos, 8);
    const jitteredYt = jitterTop(enrichedYouTubeVideos, 6);

    // Interleave smoothly with anti-clustering: 2 native -> 1 youtube -> 2 native -> 1 youtube
    const blended = [];
    const seenIds = new Set();
    const seenTitles = new Set();

    const normalizeTitle = (t) => (t || "").toLowerCase().trim().replace(/[^\w\s]/gi, "").substring(0, 25);

    const tryAdd = (post) => {
      if (!post) return false;
      const pid = String(post._id);
      if (seenIds.has(pid)) return false;
      const norm = normalizeTitle(post.title);
      if (norm && seenTitles.has(norm)) return false;
      seenIds.add(pid);
      if (norm) seenTitles.add(norm);
      blended.push(post);
      return true;
    };

    let nIdx = 0;
    let yIdx = 0;

    while (blended.length < limit && (nIdx < jitteredNative.length || yIdx < jitteredYt.length)) {
      if (nIdx < jitteredNative.length) tryAdd(jitteredNative[nIdx++]);
      if (blended.length >= limit) break;
      if (nIdx < jitteredNative.length) tryAdd(jitteredNative[nIdx++]);
      if (blended.length >= limit) break;
      if (yIdx < jitteredYt.length) tryAdd(jitteredYt[yIdx++]);
      if (blended.length >= limit) break;
    }

    // Backfill if needed
    for (const p of [...jitteredNative, ...jitteredYt]) {
      if (blended.length >= limit) break;
      tryAdd(p);
    }

    res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=60");
    return res.status(200).json(blended);

  } catch (error) {
    console.error("Error fetching related videos:", error);
    return res.status(500).json({
      message: "Error fetching related videos",
      error: error.message,
    });
  }
});


// router.get("/related/mango/getall", async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = 30;
//     const skip = (page - 1) * limit;

//     // 1️⃣ Strict Match: Filters only videos (Supports your explicit mediaType flag OR classic regex file extension check)
//     const videoFilter = {
//       $or: [
//         { mediaType: { $regex: /video/i } },
//         { media: { $regex: /\.(mp4|mov|webm|mkv)$/i } }
//       ]
//     };

//     // 2️⃣ Fetch Posts: Only videos, sorted by latest first, handling pagination pipelines safely
//     let posts = await Post.find(videoFilter)
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .populate("userId", "username profilePic")
//       // Including structural fields needed for full interactions/comments in the client UI
//       .populate({
//         path: "comments.userId",
//         select: "username profilePic"
//       });

//     // 3️⃣ Random injection for discovery (Page 1 Only)
//     // Injects a localized selection of unexpected videos to keep the layout feeling dynamic
//     if (page === 1 && posts.length > 0) {
//       try {
//         const randomVideos = await Post.aggregate([
//           { $match: videoFilter },
//           { $sample: { size: 4 } },
//           {
//             $lookup: {
//               from: "users",
//               localField: "userId",
//               foreignField: "_id",
//               as: "userId"
//             }
//           },
//           {
//             $unwind: {
//               path: "$userId",
//               preserveNullAndEmptyArrays: true
//             }
//           }
//         ]);

//         // Merge discovery items with chronological feed
//         posts = [...posts, ...randomVideos];
//       } catch (aggError) {
//         console.error("Non-blocking aggregation failure:", aggError.message);
//       }
//     }

//     // 4️⃣ Deduplicate entries cleanly matching internal IDs
//     const uniqueMap = new Map();
//     posts.forEach(post => {
//       if (post && post._id) {
//         uniqueMap.set(post._id.toString(), post);
//       }
//     });
//     posts = Array.from(uniqueMap.values());

//     // 5️⃣ Soft Shuffle (Page 1 Only)
//     // Enhances user engagement patterns on initial mount
//     if (page === 1) {
//       posts.sort(() => Math.random() - 0.5);
//     }

//     // 6️⃣ Enforce strict boundary response layout limits
//     posts = posts.slice(0, limit);

//     return res.status(200).json(posts);

//   } catch (error) {
//     console.error("Pipeline breakdown fetching assets:", error);
//     return res.status(500).json({
//       message: "Error fetching video pipeline content",
//       error: error.message,
//     });
//   }
// });


router.post("/number/sync-contacts", (req, res) => {
  console.log("==================================");
  console.log("📩 CONTACT SYNC REQUEST RECEIVED");
  console.log("==================================");

  console.log("RAW BODY:", req.body);

  if (req.body.contacts) {
    console.log("CONTACTS ARRAY:");
    console.table(req.body.contacts);
  } else {
    console.log("❌ No contacts received");
  }

  console.log("==================================");

  return res.json({
    success: true,
    message: "Data received successfully",
    receivedData: req.body
  });
});


router.get("/all-slugs", async (req, res) => {
  const posts = await Post.find(
    { slug: { $exists: true, $ne: "" } },
    "slug category updatedAt createdAt"
  ).sort({ createdAt: -1 });

  res.json(posts);
});


router.get("/all-ids", async (req, res) => {
  const posts = await Post.find({}, "_id updatedAt createdAt")
    .sort({ createdAt: -1 }); // 🔥 newest first

  res.json(posts);
});

// router.get("/:category/:slug", async (req, res) => {
//   try {
//     const { category, slug } = req.params;

//     const post = await Post.findOne({ slug })
//       .populate("userId", "name")
//       .lean();

//     if (!post) return res.status(404).json({ message: "Not found" });

//     // ✅ Fix category slug
//     const categorySlug = post.category.toLowerCase().replace(/\s+/g, "-");

//     if (categorySlug !== category) {
//       return res.status(301).json({
//         redirect: `/${categorySlug}/${post.slug}`
//       });
//     }

//     // 🔥 Related logic (mix: category + trending + random)
//     const related = await Post.aggregate([
//       { $match: { slug: { $ne: slug } } },
//       {
//         $addFields: {
//           score: {
//             $cond: [
//               { $eq: ["$category", post.category] },
//               3, // same category priority
//               1
//             ]
//           }
//         }
//       },
//       { $sort: { score: -1, createdAt: -1 } }, // new + category
//       { $limit: 6 },
//       {
//         $project: {
//           title: 1,
//           slug: 1,
//           category: 1,
//           thumbnail: 1,
//           createdAt: 1
//         }
//       }
//     ]);

//     res.json({ post, related });

//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });


router.get("/blog/:category/:slug", async (req, res) => {
  try {
    const { category, slug } = req.params;

    console.log("🌐 Incoming Request:");
    console.log("➡️ category (URL):", category);
    console.log("➡️ slug (URL):", slug);

    // 🔍 Find post
    const post = await Post.findOne({ slug })
      .populate("userId", "username")
      .lean();

    console.log("📦 DB Post Result:", post);

    // ❌ If not found
    if (!post) {
      console.log("❌ Post NOT FOUND for slug:", slug);
      return res.status(404).json({ message: "Not found" });
    }

    // 🔄 Convert DB category → URL format
    const categorySlug = post.category.toLowerCase().replace(/\s+/g, "-");

    console.log("📂 DB category:", post.category);
    console.log("🔁 Converted categorySlug:", categorySlug);
    console.log("🌍 URL category:", category);

    // ⚠️ Category mismatch
    if (categorySlug !== category) {
      console.log("⚠️ CATEGORY MISMATCH!");
      console.log("👉 Should be:", `/${categorySlug}/${post.slug}`);

      return res.status(301).json({
        redirect: `/${categorySlug}/${post.slug}`
      });
    }

    // 🔥 Related posts
    const related = await Post.aggregate([
      { $match: { slug: { $ne: slug } } },
      {
        $addFields: {
          score: {
            $cond: [
              { $eq: ["$category", post.category] },
              3,
              1
            ]
          }
        }
      },
      { $sort: { score: -1, createdAt: -1 } },
      { $limit: 6 },
      {
        $project: {
          title: 1,
          slug: 1,
          category: 1,
          thumbnail: 1,
          createdAt: 1
        }
      }
    ]);

    console.log("✅ SUCCESS: Post + related sent");

    res.json({ post, related });

  } catch (err) {
    console.error("🔥 ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


router.get("/fix-image-types", async (req, res) => {
  const result = await Post.updateMany(
    { mediaType: { $regex: /^image\// } }, // image/jpeg, image/png etc
    { $set: { mediaType: { $regex: /image/i } } }
  );

  res.json({
    message: "Image types normalized",
    modified: result.modifiedCount
  });
});


router.get("/fix-mediaType-full", async (req, res) => {
  // ✅ VIDEO detect
  const videoResult = await Post.updateMany(
    {
      $or: [
        { media: { $regex: /\.(mp4|mov|webm|mkv|avi|flv|m4v)$/i } },
        { "medias.url": { $regex: /\.(mp4|mov|webm|mkv|avi|flv|m4v)$/i } }
      ]
    },
    {
      $set: { mediaType: { $regex: /video/i } }
    }
  );

  // ✅ IMAGE detect
  const imageResult = await Post.updateMany(
    {
      $or: [
        { media: { $regex: /\.(jpg|jpeg|png|gif|webp)$/i } },
        { "medias.url": { $regex: /\.(jpg|jpeg|png|gif|webp)$/i } }
      ]
    },
    {
      $set: { mediaType: { $regex: /image/i } }
    }
  );

  res.json({
    message: "FULL FIX DONE",
    videoUpdated: videoResult.modifiedCount,
    imageUpdated: imageResult.modifiedCount
  });
});


router.get("/check-mediaType", async (req, res) => {
  const data = await Post.aggregate([
    {
      $group: {
        _id: "$mediaType",
        count: { $sum: 1 }
      }
    }
  ]);

  res.json(data);
});


router.get("/fix-mediaType-smart", async (req, res) => {
  const result = await Post.updateMany(
    {
      $or: [
        { media: { $regex: /\.(mp4|mov|webm|mkv|avi|flv|m4v)$/i } },
        { "medias.url": { $regex: /\.(mp4|mov|webm|mkv|avi|flv|m4v)$/i } }
      ]
    },
    {
      $set: { mediaType: { $regex: /video/i } }
    }
  );

  res.json({
    message: "Video posts updated",
    modifiedCount: result.modifiedCount
  });
});

router.post("/like/:postId", verifyToken, async (req, res) => {
  try {
    const UserId = req.user.UserId; // jwt me id
    const postId = req.params.postId;
    console.log("UserId, postId:", UserId, postId);

    const like = await Post.findById(postId);
    if (!like) {
      return res.status(404).json("Post not found");
    }

    const userObjectId = new mongoose.Types.ObjectId(UserId);

    // ✅ Null-safe check
    const UserExist = like.likes.some(
      (id) => id && id.toString() === UserId
    );

    if (UserExist) {
      like.likes = like.likes.filter(
        (id) => id && id.toString() !== UserId
      );
    } else {
      like.likes.push(userObjectId);
      if (like.userId && like.userId.toString() !== UserId.toString()) {
        await dispatchNotification({
          recipient: like.userId,
          sender: UserId,
          type: "like",
          post: like._id
        });
      }
    }

    // Optional: Clean null/invalid entries
    like.likes = like.likes.filter(id => id);

    await like.save();

    emitRealtimeEvent("post_like_update", {
      postId: like._id,
      likesCount: like.likes.length,
      likes: like.likes,
      userId: UserId
    });

    return res.status(200).json({ likes: like.likes });
  } catch (error) {
    console.log("LIKE ERROR:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});


router.post("/view/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await Post.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});



router.get("/mango/getall", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 12, 30);
    const skip = (page - 1) * limit;
    const type = (req.query.type || "").toLowerCase();
    const tag = req.query.tag;
    const category = req.query.category;
    const sort = req.query.sort;

    let queryFilter = {};

    // 1. Tag filter
    if (tag) {
      const cleanTag = tag.replace(/^#/, "");
      queryFilter.$or = [
        { tags: { $in: [cleanTag, `#${cleanTag}`] } },
        { title: { $regex: `#${cleanTag}\\b`, $options: "i" } }
      ];
    }

    // 2. Category filter
    if (category && category !== "All") {
      queryFilter.category = category;
    }

    // 2B. Location filter (Find posts near or from a city)
    const locationQuery = req.query.location;
    if (locationQuery) {
      queryFilter.location = { $regex: locationQuery.trim(), $options: "i" };
    }

    // 2C. Personalized Topics filter (Multi-topic preference)
    const topics = req.query.topics;
    if (topics && (!category || category === "All")) {
      const topicList = topics.split(",").map((t) => t.trim()).filter(Boolean);
      if (topicList.length > 0) {
        queryFilter.$or = [
          { category: { $in: topicList } },
          { tags: { $in: topicList } },
          { tags: { $in: topicList.map((t) => `#${t}`) } }
        ];
      }
    }

    const videoCondition = {
      $or: [
        { mediaType: { $regex: /video/i } },
        { media: { $regex: /\.(mp4|mov|webm|mkv)$/i } },
        { media: { $regex: /(youtube\.com|youtu\.be)/i } },
        { "linkPreview.url": { $regex: /(youtube\.com|youtu\.be)/i } },
        { "linkPreview.siteName": { $regex: /youtube/i } }
      ]
    };

    // 3. Intelligent Media Type Filter (Supports ALL mixed content by default, or specific filters)
    if (type === "video") {
      queryFilter.$and = queryFilter.$and || [];
      queryFilter.$and.push(videoCondition);
    } else if (type === "image" || type === "photo") {
      queryFilter.$and = queryFilter.$and || [];
      queryFilter.$and.push({
        $or: [
          { mediaType: { $regex: /image/i } },
          { media: { $regex: /\.(jpg|jpeg|png|webp|gif|bmp)$/i } }
        ]
      });
    } else if (type === "discussion" || type === "text") {
      queryFilter.$and = queryFilter.$and || [];
      queryFilter.$and.push({
        $or: [
          { mediaType: "text" },
          { media: "" },
          { media: null },
          { media: { $exists: false } },
          { "poll.question": { $exists: true, $ne: "" } }
        ]
      });
    } else if (type === "poll") {
      queryFilter["poll.question"] = { $exists: true, $ne: "" };
    }

    // 4. Sort order
    let sortOptions = { isPinned: -1, createdAt: -1 };
    if (sort === "trending") {
      sortOptions = { views: -1, trendingScore: -1, createdAt: -1 };
    }

    // 5. Intelligent Multi-Format Harmonious Discovery Algorithm (Dynamic Multi-Pool Jitter & Anti-Clustering)
    if (!type || type === "all") {
      const nativeVideoCondition = {
        $or: [
          { mediaType: { $regex: /video/i } },
          { media: { $regex: /\.(mp4|mov|webm|mkv)$/i } }
        ]
      };

      const youtubeVideoCondition = {
        $or: [
          { media: { $regex: /(youtube\.com|youtu\.be)/i } },
          { "linkPreview.url": { $regex: /(youtube\.com|youtu\.be)/i } },
          { "linkPreview.siteName": { $regex: /youtube/i } }
        ]
      };

      // Non-YouTube rich web link posts (news, articles, blogs with link previews)
      const webLinkCondition = {
        $and: [
          { "linkPreview.url": { $exists: true, $ne: "" } },
          { "linkPreview.url": { $not: /(youtube\.com|youtu\.be)/i } },
          { media: { $not: /(youtube\.com|youtu\.be|\.(mp4|mov|webm|mkv)$)/i } }
        ]
      };

      // Community images (photos)
      const imageCondition = {
        $and: [
          {
            $or: [
              { mediaType: { $in: ["image", "image/jpeg", "image/png", "image/webp"] } },
              { media: { $regex: /\.(jpg|jpeg|png|webp|gif|bmp)$/i } }
            ]
          },
          { media: { $not: /\.(mp4|mov|webm|mkv)$/i } }
        ]
      };

      // Community text discussions and polls
      const discussionCondition = {
        $or: [
          { mediaType: { $in: ["text", "discussion", "poll"] } },
          { "poll.question": { $exists: true, $ne: "" } },
          {
            $and: [
              { media: { $in: ["", null] } },
              { "linkPreview.url": { $in: ["", null] } }
            ]
          }
        ]
      };

      const buildScopedQuery = (condition) => {
        const clauses = [];
        if (queryFilter && Object.keys(queryFilter).length > 0) {
          clauses.push(queryFilter);
        }
        if (condition) {
          clauses.push(condition);
        }
        return clauses.length === 1 ? clauses[0] : clauses.length > 1 ? { $and: clauses } : {};
      };

      // Balanced candidate fetching: generous windows so top candidates can be dynamically jittered
      const videoQuota = Math.max(6, Math.floor(limit * 0.5));
      const communityQuota = Math.max(6, Math.floor(limit * 0.5));
      const linkQuota = Math.max(4, Math.floor(limit * 0.3));
      const latestQuota = Math.max(4, Math.floor(limit * 0.3));

      const populateUser = {
        path: "userId",
        select: "username name profilePic profilePicture avatar isVerified isEmailVerified category tagline"
      };
      const populateComments = {
        path: "comments.userId",
        select: "username name profilePic profilePicture avatar isVerified isEmailVerified"
      };

      // High-velocity sort: Pinned first, then trending/views, then recency
      const videoSortOptions = { isPinned: -1, trendingScore: -1, createdAt: -1 };

      const [nativeVideos, youtubeVideos, communityImages, communityDiscussions, webLinks, latestPosts] = await Promise.all([
        Post.find(buildScopedQuery(nativeVideoCondition))
          .sort(videoSortOptions)
          .skip((page - 1) * Math.floor(videoQuota / 2))
          .limit(videoQuota)
          .populate(populateUser)
          .populate(populateComments),
        Post.find(buildScopedQuery(youtubeVideoCondition))
          .sort(sortOptions)
          .skip((page - 1) * Math.floor(videoQuota / 2))
          .limit(videoQuota)
          .populate(populateUser)
          .populate(populateComments),
        Post.find(buildScopedQuery(imageCondition))
          .sort(sortOptions)
          .skip((page - 1) * Math.floor(communityQuota / 2))
          .limit(communityQuota)
          .populate(populateUser)
          .populate(populateComments),
        Post.find(buildScopedQuery(discussionCondition))
          .sort(sortOptions)
          .skip((page - 1) * Math.floor(communityQuota / 2))
          .limit(communityQuota)
          .populate(populateUser)
          .populate(populateComments),
        Post.find(buildScopedQuery(webLinkCondition))
          .sort(sortOptions)
          .skip((page - 1) * linkQuota)
          .limit(linkQuota)
          .populate(populateUser)
          .populate(populateComments),
        Post.find(buildScopedQuery(null))
          .sort({ isPinned: -1, createdAt: -1 })
          .skip((page - 1) * latestQuota)
          .limit(latestQuota)
          .populate(populateUser)
          .populate(populateComments)
      ]);

      // Top-K Fisher-Yates Jitter: Rotates top candidates so the exact same video is NEVER stuck at Slot 2
      const jitterTopCandidates = (list, k = 6) => {
        if (!Array.isArray(list) || list.length <= 1) return list || [];
        const top = list.slice(0, Math.min(list.length, k));
        const rest = list.slice(k);
        for (let i = top.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [top[i], top[j]] = [top[j], top[i]];
        }
        return [...top, ...rest];
      };

      // Combine video sources (Native Video Reels + YouTube Videos) with rotational diversity
      const allVideos = jitterTopCandidates([...nativeVideos, ...youtubeVideos], 8);
      const allImages = jitterTopCandidates(communityImages, 6);
      const allDiscussions = jitterTopCandidates(communityDiscussions, 6);
      const allWebLinks = jitterTopCandidates(webLinks, 6);
      const allLatest = jitterTopCandidates(latestPosts, 4);

      const blended = [];
      const seenIds = new Set();
      const seenTitles = new Set();

      const normalizeTitle = (t) => (t || "").toLowerCase().trim().replace(/[^\w\s]/gi, "").substring(0, 25);

      const isVideoPost = (p) => {
        if (!p) return false;
        const m = p.media || "";
        const mt = (p.mediaType || "").toLowerCase();
        const lp = p.linkPreview?.url || "";
        return (
          mt.includes("video") ||
          /\.(mp4|mov|webm|mkv)$/i.test(m) ||
          /(youtube\.com|youtu\.be)/i.test(m) ||
          /(youtube\.com|youtu\.be)/i.test(lp) ||
          /youtube/i.test(p.linkPreview?.siteName || "")
        );
      };

      let lastWasVideo = false;

      const tryAdd = (post, allowVideoConsecutive = false) => {
        if (!post) return false;
        const id = String(post._id);
        if (seenIds.has(id)) return false;

        const normTitle = normalizeTitle(post.title);
        if (normTitle && seenTitles.has(normTitle)) {
          return false;
        }

        const isVid = isVideoPost(post);
        // Anti-clustering: Do not place 2 videos consecutively if avoidVideo is requested
        if (isVid && lastWasVideo && !allowVideoConsecutive) {
          return false;
        }

        seenIds.add(id);
        if (normTitle) seenTitles.add(normTitle);
        blended.push(post);
        lastWasVideo = isVid;
        return true;
      };

      // Multi-format rhythmic distribution
      let vIdx = 0, imgIdx = 0, discIdx = 0, linkIdx = 0, latIdx = 0;

      while (
        blended.length < limit &&
        (latIdx < allLatest.length ||
          vIdx < allVideos.length ||
          imgIdx < allImages.length ||
          linkIdx < allWebLinks.length ||
          discIdx < allDiscussions.length)
      ) {
        // Step A: Latest / Trending Discovery Post
        if (latIdx < allLatest.length) {
          tryAdd(allLatest[latIdx++]);
        }
        if (blended.length >= limit) break;

        // Step B: Rotated Video / Short (Dynamic jitter prevents video #1 from locking Slot 2)
        if (vIdx < allVideos.length) {
          tryAdd(allVideos[vIdx++]);
        }
        if (blended.length >= limit) break;

        // Step C: High-Fidelity Image or Rich Web Link Preview
        if (imgIdx < allImages.length) {
          tryAdd(allImages[imgIdx++]);
        } else if (linkIdx < allWebLinks.length) {
          tryAdd(allWebLinks[linkIdx++]);
        }
        if (blended.length >= limit) break;

        // Step D: Community Discussion or Poll
        if (discIdx < allDiscussions.length) {
          tryAdd(allDiscussions[discIdx++]);
        }
        if (blended.length >= limit) break;

        // Step E: Rich Web Link Article if available
        if (linkIdx < allWebLinks.length) {
          tryAdd(allWebLinks[linkIdx++]);
        }
        if (blended.length >= limit) break;

        // Step F: Alternate Video (guaranteed anti-clustered because Step C/D/E set lastWasVideo to false)
        if (vIdx < allVideos.length) {
          tryAdd(allVideos[vIdx++]);
        }
        if (blended.length >= limit) break;

        // Step G: Image
        if (imgIdx < allImages.length) {
          tryAdd(allImages[imgIdx++]);
        }
      }

      // Backfill with remaining candidates if pools were exhausted
      const allRemaining = [...allLatest, ...allVideos, ...allImages, ...allWebLinks, ...allDiscussions];
      for (const p of allRemaining) {
        if (blended.length >= limit) break;
        tryAdd(p, true); // Allow backfill without strict anti-clustering
      }

      if (blended.length > 0) {
        res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=60");
        return res.status(200).json(blended);
      }
    }

    const posts = await Post.find(queryFilter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .populate("userId", "username name profilePic profilePicture avatar isVerified isEmailVerified category tagline")
      .populate({
        path: "comments.userId",
        select: "username name profilePic profilePicture avatar isVerified isEmailVerified"
      });

    res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=60");
    return res.status(200).json(posts);

  } catch (error) {
    console.error("Error fetching feed posts:", error);

    return res.status(500).json({
      message: "Error fetching feed posts",
      error: error.message,
    });
  }
});



// router.get("/mango/getall", async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = 30;
//     const skip = (page - 1) * limit;

//     // 📅 Time filters
//     const sevenDaysAgo = new Date();
//     sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

//     const threeDaysAgo = new Date();
//     threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

//     // 1️⃣ Latest (apply skip + limit properly)
//     const latest = await Post.find({
//       createdAt: { $gte: sevenDaysAgo }
//     })
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .populate("userId", "username profilePic");

//     // 2️⃣ Trending (apply skip + limit properly)
//     const trending = await Post.find({
//       createdAt: { $gte: threeDaysAgo }
//     })
//       .sort({ views: -1 })
//       .skip(skip)
//       .limit(limit)
//       .populate("userId", "username profilePic");

//     // 3️⃣ Random (only first page)
//     let random = [];
//     if (page === 1) {
//       random = await Post.aggregate([
//         { $sample: { size: 4 } }
//       ]);
//     }

//     // 4️⃣ Merge
//     let posts = [...latest, ...trending, ...random];

//     // 5️⃣ Remove duplicates
//     const uniqueMap = new Map();
//     posts.forEach(post => {
//       uniqueMap.set(post._id.toString(), post);
//     });

//     posts = Array.from(uniqueMap.values());

//     // 6️⃣ Shuffle only first page
//     if (page === 1) {
//       posts.sort(() => Math.random() - 0.5);
//     }

//     // 7️⃣ Final limit control
//     posts = posts.slice(0, limit);

//     return res.status(200).json(posts);

//   } catch (error) {
//     return res.status(500).json({
//       message: "Error fetching posts",
//       error: error.message,
//     });
//   }
// });

// router.get("/mango/getall", async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = 20;
//     const skip = (page - 1) * limit;

//     const posts = await Post.find()
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .populate("userId", "username profilePic")
//       .populate("comments.userId", "username profilePic")
//       .populate("comments.replies.userId", "username profilePic");

//     res.status(200).json(posts);

//   } catch (error) {
//     res.status(500).json({
//       message: "Error fetching posts",
//       error: error.message,
//     });
//   }
// });






router.get("/single/search", async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) return res.json([]);

    // 1️⃣ Split query into words
    const words = q.split(/\s+/).filter(Boolean);

    // 2️⃣ Build OR conditions
    const orConditions = [];

    words.forEach(word => {
      const regex = new RegExp(word, "i");

      orConditions.push({ title: regex });
      orConditions.push({ hashtags: regex });
    });

    // 3️⃣ Query DB
    const posts = await Post.find({
      $or: orConditions,
    })
      .select("title thumbnail media mediaType likes comments views userId createdAt")
      .populate("userId", "username profilePic")
      .sort({ createdAt: -1 })
      .limit(30);

    res.json(posts);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});




// router.get("/single/search", async (req, res) => {
//   try {
//     const q = req.query.q?.trim();
//     if (!q) return res.json([]);

//     const posts = await Post.find({
//       $or: [
//         { title: { $regex: q, $options: "i" } },
//         { hashtags: { $regex: q, $options: "i" } },
//       ],
//     })
//       .select("title thumbnail media mediaType likes comments views userId")
//       .populate("userId", "username profilePic")
//       .sort({ createdAt: -1 })
//       .limit(30);

//     res.json(posts);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });



router.delete("/delete/:postId", async (req, res) => {
    try{
    const postId = req.params.postId;
    const delet = await Post.findByIdAndDelete(postId);
    if(!delet){
        res.status(404).json("Post Id is wrong");
    }

    await res.status(200).json(delet);
    console.log("successfully Deleted");

    }
    catch(error){
        res.status(500).json(error);
    }

})


/* =========================================================================
   SHORTS & REELS RECOMMENDATION FEED (DEDUPLICATED & DIVERSE)
   Endpoints: GET /shorts, GET /shorts/feed
   Supports:
   - Native uploaded MP4s + YouTube link posts stored in MongoDB
   - Client session exclusion list (seen IDs)
   - Server-side user watch history exclusion (last 7 days)
   - Creator diversity constraint (no consecutive videos from same creator)
   - Full creator profile & verification badge population
   - Master isolated kill-switch for YouTube integration
========================================================================= */

// Master feature flag for external YouTube shorts integration on backend
const ENABLE_YOUTUBE_SHORTS_IN_FEED = true;

function extractYouTubeId(str) {
  if (!str || typeof str !== "string") return null;
  const match = str.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/|live\/)|youtu\.be\/)([^"&?\/\s]{11})/i
  );
  return match && match[1] ? match[1] : null;
}

function getPostYouTubeId(post) {
  if (!post) return null;
  return (
    extractYouTubeId(post.media) ||
    extractYouTubeId(post.linkPreview?.url) ||
    extractYouTubeId(post.title)
  );
}

router.get(['/shorts', '/shorts/feed'], async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 6, 20);

    // 1. Parse client-provided exclude IDs (Session Seen Cache)
    let rawExclude = [];
    if (req.query.exclude) {
      rawExclude = Array.isArray(req.query.exclude)
        ? req.query.exclude
        : req.query.exclude.split(',');
    }

    const validClientExclude = rawExclude
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    // 2. Check if user is authenticated to fetch their server-side watch history (last 7 days)
    const userId = extractUserId(req);
    let userWatchedIds = [];
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const userDoc = await User.findById(userId, { watchedShorts: 1 }).lean();
      if (userDoc?.watchedShorts?.length) {
        userWatchedIds = userDoc.watchedShorts
          .filter((w) => w.postId && new Date(w.watchedAt) >= sevenDaysAgo)
          .map((w) => new mongoose.Types.ObjectId(w.postId));
      }
    }

    // Combine all excluded IDs uniquely
    const allExcludeMap = new Map();
    [...validClientExclude, ...userWatchedIds].forEach((id) => {
      allExcludeMap.set(id.toString(), id);
    });
    const allExcludeObjectIds = Array.from(allExcludeMap.values());

    const sortMode = req.query.sort === "latest"
      ? { createdAt: -1 }
      : { views: -1, last24hViews: -1, createdAt: -1 };

    // Native videos filter
    const nativeQuery = {
      $and: [
        {
          $or: [
            { mediaType: { $regex: /video/i } },
            { media: { $regex: /\.(mp4|mov|webm|mkv|m4v)$/i } },
          ],
        },
        { media: { $not: /(?:youtube\.com|youtu\.be)/i } },
        ...(allExcludeObjectIds.length ? [{ _id: { $nin: allExcludeObjectIds } }] : []),
      ],
    };

    // YouTube link posts filter from MongoDB
    const youtubeQuery = {
      $and: [
        {
          $or: [
            { media: { $regex: /(?:youtube\.com|youtu\.be)/i } },
            { "linkPreview.url": { $regex: /(?:youtube\.com|youtu\.be)/i } },
            { title: { $regex: /(?:youtube\.com|youtu\.be)/i } },
          ],
        },
        ...(allExcludeObjectIds.length ? [{ _id: { $nin: allExcludeObjectIds } }] : []),
      ],
    };

    const populateConfig = [
      { path: "userId", select: "username name profilePicture profilePic avatar isVerified Followers" },
      { path: "comments.userId", select: "username name profilePicture profilePic avatar isVerified" },
    ];

    // Fetch candidate pools
    let [nativeCandidates, ytCandidates] = await Promise.all([
      Post.find(nativeQuery).sort(sortMode).limit(limit * 2).populate(populateConfig[0]).populate(populateConfig[1]).lean(),
      ENABLE_YOUTUBE_SHORTS_IN_FEED
        ? Post.find(youtubeQuery).sort({ createdAt: -1 }).limit(limit * 2).populate(populateConfig[0]).populate(populateConfig[1]).lean()
        : Promise.resolve([]),
    ]);

    // Fallback Pool if everything has been watched
    let isFallback = false;
    if (!nativeCandidates.length && !ytCandidates.length && allExcludeObjectIds.length > 0) {
      isFallback = true;
      const immediateExclude = validClientExclude.slice(-3);
      const fallbackNative = {
        $or: [
          { mediaType: { $regex: /video/i } },
          { media: { $regex: /\.(mp4|mov|webm|mkv|m4v)$/i } },
        ],
        ...(immediateExclude.length ? { _id: { $nin: immediateExclude } } : {}),
      };
      const fallbackYt = {
        $or: [
          { media: { $regex: /(?:youtube\.com|youtu\.be)/i } },
          { "linkPreview.url": { $regex: /(?:youtube\.com|youtu\.be)/i } },
          { title: { $regex: /(?:youtube\.com|youtu\.be)/i } },
        ],
        ...(immediateExclude.length ? { _id: { $nin: immediateExclude } } : {}),
      };

      [nativeCandidates, ytCandidates] = await Promise.all([
        Post.find(fallbackNative).sort(sortMode).limit(limit).populate(populateConfig[0]).populate(populateConfig[1]).lean(),
        ENABLE_YOUTUBE_SHORTS_IN_FEED
          ? Post.find(fallbackYt).sort({ createdAt: -1 }).limit(limit).populate(populateConfig[0]).populate(populateConfig[1]).lean()
          : Promise.resolve([]),
      ]);
    }

    // Normalize and enrich YouTube posts with thumbnail and direct ID
    ytCandidates = ytCandidates.map((p) => {
      const ytId = getPostYouTubeId(p);
      return {
        ...p,
        youtubeId: ytId,
        media: p.media || (ytId ? `https://www.youtube.com/shorts/${ytId}` : p.linkPreview?.url || ""),
        thumbnail: p.thumbnail || p.linkPreview?.image || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : ""),
        mediaType: "video",
        isYouTubeShort: true,
      };
    });

    // Interleave / blend smoothly: 2 native -> 1 YouTube -> 2 native -> 1 YouTube
    const blended = [];
    let nIdx = 0;
    let yIdx = 0;

    while (blended.length < limit && (nIdx < nativeCandidates.length || yIdx < ytCandidates.length)) {
      if (nIdx < nativeCandidates.length && blended.length < limit) {
        blended.push(nativeCandidates[nIdx++]);
      }
      if (nIdx < nativeCandidates.length && blended.length < limit) {
        blended.push(nativeCandidates[nIdx++]);
      }
      if (yIdx < ytCandidates.length && blended.length < limit) {
        blended.push(ytCandidates[yIdx++]);
      }
      if (nIdx >= nativeCandidates.length && yIdx < ytCandidates.length && blended.length < limit) {
        blended.push(ytCandidates[yIdx++]);
      }
      if (yIdx >= ytCandidates.length && nIdx < nativeCandidates.length && blended.length < limit) {
        blended.push(nativeCandidates[nIdx++]);
      }
    }

    const totalAvailable = nativeCandidates.length + ytCandidates.length;

    return res.status(200).json({
      page,
      limit,
      total: totalAvailable,
      hasMore: (nativeCandidates.length > nIdx || ytCandidates.length > yIdx),
      isFallback,
      videos: blended,
    });
  } catch (error) {
    console.error("Error fetching shorts feed:", error);
    return res.status(500).json({
      message: "Server error fetching shorts feed",
      error: error.message,
    });
  }
});



// router.post("/like/:postId", verifyToken, async (req, res) => {
//   try {
//     const UserId = req.user.UserId;
//     const postId = req.params.postId;

//     const post = await Post.findById(postId);
//     if (!post) return res.status(404).json("Post not found");

//     const isLiked = post.likes.includes(UserId);
//     const update = isLiked
//       ? { $pull: { likes: UserId } }
//       : { $push: { likes: UserId } };

//     await Post.updateOne({ _id: postId }, update);

//     const updatedPost = await Post.findById(postId).select("likes"); // only likes
//     return res.status(200).json({ likes: updatedPost.likes });
//   } catch (error) {
//     console.log(error);
//     return res.status(500).json(error.message || "Server error");
//   }
// });



// router.post("/comment/:postId", verifyToken, async (req, res) => {
//   try {
//     const CommentText = req.body.CommentText;
//     const userId = req.user.UserId;
//     const postId = req.params.postId;

//     const post = await Post.findById(postId);
//     if (!post) return res.status(404).json("Post Not Found");

//     const comment = {
//       UserId: userId,
//       CommentText,
//       likes: 0,
//       createdAt: new Date(),
//     };

//     post.comments.push(comment);
//     await post.save({ validateModifiedOnly: true });

//     // Fetch the last comment with populated user info
//     const newComment = post.comments[post.comments.length - 1];
//     const populatedComment = await Post.findOne(
//       { _id: postId },
//       { comments: { $slice: -1 } }
//     )
//       .populate("comments.UserId", "username profilePic")
//       .then((p) => p.comments[0]);

//     return res.status(200).json({ comment: populatedComment });
//   } catch (error) {
//     console.error("Error adding comment:", error);
//     res.status(500).json(error.message || "Server Error");
//   }
// });




// router.post("/like/:postId", verifyToken, async (req, res) => {
//   try {
//     const UserId = req.user.UserId;
//     const postId = req.params.postId;

//     const post = await Post.findById(postId);
//     if (!post) return res.status(404).json("Post not found");

//     const isLiked = post.likes.includes(UserId);

//     let update;
//     if (isLiked) {
//       update = { $pull: { likes: UserId } };
//     } else {
//       update = { $push: { likes: UserId } };
//     }

//     await Post.updateOne({ _id: postId }, update);

//     const updatedPost = await Post.findById(postId); // Fetch updated post if needed

//     res.status(200).json(updatedPost);
//     console.log(isLiked ? "Unliked:" : "Liked:", updatedPost.likes);
//   } catch (error) {
//     console.log(error);
//     return res.status(500).json(error.message || "Server error");
//   }
// });




router.post("/comment/:postId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId; // from decoded token

    // Anti-spam check (Max 20 comments per minute per user)
    if (!checkRateLimit(`comment_${userId}`, 20, 60000)) {
      return res.status(429).json({ message: "Slow down! You can only post up to 20 comments per minute." });
    }

    const CommentText = req.body.CommentText;
    const postId = req.params.postId;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json("Post Not Found");
    }

    const comment = {
      userId,
      CommentText,
      likes: [], // ✅ must be an array of ObjectId
      createdAt: new Date(),
      replies: [] // ✅ optional, but better to initialize
    };

    if (!Array.isArray(post.comments)) {
      post.comments = [];
    }
    post.comments.push(comment);
    await post.save({ validateModifiedOnly: true });

    if (post.userId && post.userId.toString() !== userId.toString()) {
      try {
        await Notification.create({
          recipient: post.userId,
          sender: userId,
          type: "comment",
          post: post._id,
          commentText: CommentText
        });
      } catch (notifErr) {
        console.error("Persist comment notification error:", notifErr.message);
      }
      emitRealtimeEvent("new_notification", {
        type: "comment",
        postId: post._id,
        commentText: CommentText,
        byUser: userId,
        targetUser: post.userId,
        timestamp: new Date()
      });
    }

    // Auto-detect and notify @mentions in comment text
    const commentMentions = ((CommentText || "").match(/@([a-zA-Z0-9_]+)/g) || [])
      .map(m => m.replace("@", "").toLowerCase());

    if (commentMentions.length > 0) {
      try {
        const mentionedUsers = await User.find({
          username: { $in: commentMentions },
          _id: { $ne: userId }
        }).select("_id");

        for (const u of mentionedUsers) {
          // Avoid duplicate notification if mentioned user is already the post author
          if (!post.userId || u._id.toString() !== post.userId.toString()) {
            await Notification.create({
              recipient: u._id,
              sender: userId,
              type: "mention",
              post: post._id,
              commentText: CommentText
            });

            emitRealtimeEvent("new_notification", {
              type: "mention",
              postId: post._id,
              commentText: CommentText,
              byUser: userId,
              targetUser: u._id,
              timestamp: new Date()
            });
          }
        }
      } catch (mentionErr) {
        console.error("Comment mention error:", mentionErr.message);
      }
    }

    // Populate post with full author and comment author details before returning
    const populatedPost = await Post.findById(post._id)
      .populate("userId", "username name profilePic profilePicture avatar isVerified isEmailVerified")
      .populate({
        path: "comments.userId",
        select: "username name profilePic profilePicture avatar isVerified isEmailVerified"
      })
      .populate({
        path: "comments.replies.userId",
        select: "username name profilePic profilePicture avatar isVerified isEmailVerified"
      });

    const addedComment = populatedPost?.comments && populatedPost.comments.length > 0
      ? populatedPost.comments[populatedPost.comments.length - 1]
      : null;

    emitRealtimeEvent("post_comment_update", {
      postId: post._id,
      comment: addedComment,
      commentsCount: populatedPost?.comments?.length || post.comments.length
    });

    res.status(200).json(populatedPost || post);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json(error.message || "Server Error");
  }
});






router.get("/comment/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;

    const post = await Post.findById(postId)
      .populate({
        path: 'comments.userId',
        select: 'username profilePicture isVerified name'
      })
      .populate({
        path: 'comments.replies.userId',
        select: 'username profilePicture isVerified name'
      });

    if (!post) {
      return res.status(404).json("Post Not Found");
    }

    res.status(200).json(post.comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});



router.post("/comment/:postId/reply/:commentId", verifyToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { replyText } = req.body;
    const userId = req.user.UserId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json("Post not found");

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json("Comment not found");

    comment.replies.push({
      userId,
      replyText,
      likes: [], // ✅ Must be array of ObjectId
      createdAt: new Date()
    });

    await post.save({ validateModifiedOnly: true });

    const populatedPost = await Post.findById(postId).populate({
      path: 'comments.replies.userId',
      select: 'username profilePicture isVerified name'
    });
    const updatedComment = populatedPost ? populatedPost.comments.id(commentId) : comment;
    res.status(200).json(updatedComment ? updatedComment.replies : comment.replies);
  } catch (error) {
    console.error("Reply error:", error);
    res.status(500).json("Server Error");
  }
});



// POST /comment/:postId/like/:commentId
router.post("/comment/:postId/like/:commentId", verifyToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const UserId = req.user.UserId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json("Post not found");

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json("Comment not found");

    const userObjectId = new mongoose.Types.ObjectId(UserId);

    const liked = comment.likes.some(id => id.toString() === UserId);

    if (liked) {
      comment.likes = comment.likes.filter(id => id.toString() !== UserId);
    } else {
      comment.likes.push(userObjectId);
    }

    await post.save();
    res.status(200).json({ liked: !liked, likesCount: comment.likes.length });
  } catch (error) {
    console.error("Comment like error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});


// POST /comment/:postId/like-reply/:commentId/:replyId
router.post("/comment/:postId/like-reply/:commentId/:replyId", verifyToken, async (req, res) => {
  try {
    const { postId, commentId, replyId } = req.params;
    const UserId = req.user.UserId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json("Post not found");

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json("Comment not found");

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json("Reply not found");

    const userObjectId = new mongoose.Types.ObjectId(UserId);

    const liked = reply.likes.some(id => id.toString() === UserId);

    if (liked) {
      reply.likes = reply.likes.filter(id => id.toString() !== UserId);
    } else {
      reply.likes.push(userObjectId);
    }

    await post.save();
    res.status(200).json({ liked: !liked, likesCount: reply.likes.length });
  } catch (error) {
    console.error("Reply like error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});


router.get("/single/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const videoFilter = {
      mediaType: "video"
    };

    const userFields = "username name profilePic profilePicture avatar isVerified isEmailVerified Followers Followings category tagline accountType";
    const commentUserFields = "username name profilePic profilePicture avatar isVerified isEmailVerified";

    const selectedPost = await Post.findById(id)
      .populate("userId", userFields)
      .populate("comments.userId", commentUserFields)
      .populate("comments.replies.userId", commentUserFields);

    if (!selectedPost) {
      return res.status(404).json({ message: "Post not found" });
    }

    await Post.findByIdAndUpdate(id, { $inc: { views: 1 } });

    // 1. Playable video conditions for related video feed
    const nativeCondition = {
      _id: { $ne: new mongoose.Types.ObjectId(id) },
      $or: [
        { mediaType: { $regex: /video/i } },
        { media: { $regex: /\.(mp4|mov|webm|mkv|m4v)$/i } }
      ],
      media: { $not: /(?:youtube\.com|youtu\.be)/i }
    };

    const youtubeCondition = {
      _id: { $ne: new mongoose.Types.ObjectId(id) },
      $or: [
        { media: { $regex: /(?:youtube\.com|youtu\.be)/i } },
        { "linkPreview.url": { $regex: /(?:youtube\.com|youtu\.be)/i } },
        { "linkPreview.siteName": { $regex: /youtube/i } },
        { title: { $regex: /(?:youtube\.com|youtu\.be)/i } }
      ]
    };

    // 2. Contextual Category Affinity (if selectedPost has a defined category)
    let categoryQuery = null;
    if (selectedPost.category && selectedPost.category !== "All" && selectedPost.category !== "Community") {
      categoryQuery = {
        _id: { $ne: new mongoose.Types.ObjectId(id) },
        category: selectedPost.category,
        $or: [
          { mediaType: { $regex: /video/i } },
          { media: { $regex: /\.(mp4|mov|webm|mkv|m4v)$/i } },
          { media: { $regex: /(?:youtube\.com|youtu\.be)/i } },
          { "linkPreview.url": { $regex: /(?:youtube\.com|youtu\.be)/i } }
        ]
      };
    }

    const sortOptions = { isPinned: -1, trendingScore: -1, views: -1, createdAt: -1 };

    const [categoryRelated, trendingNative, latestNative, youtubeRelated, randomNative] = await Promise.all([
      categoryQuery
        ? Post.find(categoryQuery).sort(sortOptions).limit(5).populate("userId", userFields).lean()
        : Promise.resolve([]),
      Post.find(nativeCondition).sort(sortOptions).limit(8).populate("userId", userFields).lean(),
      Post.find(nativeCondition).sort({ createdAt: -1 }).limit(6).populate("userId", userFields).lean(),
      Post.find(youtubeCondition).sort({ isPinned: -1, createdAt: -1 }).limit(6).populate("userId", userFields).lean(),
      Post.aggregate([
        {
          $match: {
            _id: { $ne: new mongoose.Types.ObjectId(id) },
            $or: [
              { mediaType: { $regex: /video/i } },
              { media: { $regex: /\.(mp4|mov|webm|mkv|m4v)$/i } }
            ],
            media: { $not: /(?:youtube\.com|youtu\.be)/i }
          }
        },
        { $sample: { size: 4 } }
      ]).then((docs) => Post.populate(docs, { path: "userId", select: userFields }))
    ]);

    // Enrich YouTube posts so they render with direct IDs, valid thumbnails, and playable embed links
    const enrichedYouTube = (youtubeRelated || []).map((p) => {
      const ytId = getPostYouTubeId(p);
      return {
        ...p,
        youtubeId: ytId,
        media: p.media || (ytId ? `https://www.youtube.com/watch?v=${ytId}` : p.linkPreview?.url || ""),
        thumbnail: p.thumbnail || p.linkPreview?.image || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : ""),
        linkPreview: p.linkPreview || (ytId ? {
          url: `https://www.youtube.com/watch?v=${ytId}`,
          title: p.title || "YouTube Video",
          siteName: "YouTube",
          image: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
        } : null),
        mediaType: "video",
        isYouTubeShort: Boolean(ytId)
      };
    });

    // Top-K Fisher-Yates Jitter for non-repetitive rotating related videos
    const jitterList = (arr) => {
      if (!Array.isArray(arr) || arr.length <= 1) return arr || [];
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };

    const jitteredCategory = jitterList(categoryRelated);
    const jitteredTrending = jitterList(trendingNative);
    const jitteredLatest = jitterList(latestNative);
    const jitteredYt = jitterList(enrichedYouTube);
    const jitteredRandom = jitterList(randomNative);

    const blendedRelated = [];
    const seenIds = new Set([String(id)]);
    const seenTitles = new Set();
    const normalizeTitle = (t) => (t || "").toLowerCase().trim().replace(/[^\w\s]/gi, "").substring(0, 25);
    if (selectedPost.title) {
      seenTitles.add(normalizeTitle(selectedPost.title));
    }

    const tryAddRelated = (post) => {
      if (!post) return false;
      const pid = String(post._id);
      if (seenIds.has(pid)) return false;
      const norm = normalizeTitle(post.title);
      if (norm && seenTitles.has(norm)) return false;
      seenIds.add(pid);
      if (norm) seenTitles.add(norm);
      blendedRelated.push(post);
      return true;
    };

    // Cadence: Category affinity -> Trending -> YouTube -> Random -> Latest
    let cIdx = 0, tIdx = 0, yIdx = 0, rIdx = 0, lIdx = 0;
    while (
      blendedRelated.length < 12 &&
      (cIdx < jitteredCategory.length ||
        tIdx < jitteredTrending.length ||
        yIdx < jitteredYt.length ||
        rIdx < jitteredRandom.length ||
        lIdx < jitteredLatest.length)
    ) {
      if (cIdx < jitteredCategory.length) tryAddRelated(jitteredCategory[cIdx++]);
      if (tIdx < jitteredTrending.length) tryAddRelated(jitteredTrending[tIdx++]);
      if (yIdx < jitteredYt.length) tryAddRelated(jitteredYt[yIdx++]);
      if (rIdx < jitteredRandom.length) tryAddRelated(jitteredRandom[rIdx++]);
      if (lIdx < jitteredLatest.length) tryAddRelated(jitteredLatest[lIdx++]);
    }

    // Backfill if needed
    for (const p of [...jitteredCategory, ...jitteredTrending, ...jitteredYt, ...jitteredRandom, ...jitteredLatest]) {
      if (blendedRelated.length >= 12) break;
      tryAddRelated(p);
    }

    const finalPosts = blendedRelated.slice(0, 10);

    res.status(200).json({
      post: selectedPost,
      related: finalPosts,
      relatedIds: finalPosts.map((p) => p._id)
    });

  } catch (error) {
    console.error("Error fetching single post:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// router.get("/single/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     const selectedPost = await Post.findById(id)
//       .populate("userId", "username")
//       .populate("comments.userId", "username profilePicture");
    
//     if (!selectedPost) {
//       return res.status(404).json({ message: "Post not found" });
//     }

//     Post.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec();

//     const { tags, title, mediaType } = selectedPost;

//     const titleKeywords = title
//       ? title.split(" ").filter((word) => word.length > 2)
//       : [];

//     // 🔥 Regex Escape Function
//     function escapeRegex(str) {
//       return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
//     }

//     const titleRegex = titleKeywords.length
//       ? {
//           $or: titleKeywords.map((word) => ({
//             title: { $regex: escapeRegex(word), $options: "i" },
//           })),
//         }
//       : {};

//     const query = {
//       _id: { $ne: id },
//       $or: [
//         { tags: { $in: tags } },
//         { mediaType: mediaType },
//         ...(titleRegex.$or || []),
//       ],
//     };

//     const relatedPosts = await Post.find(query)
//       .populate("userId", "username")
//       .sort({ mediaType: -1, createdAt: -1 })
//       .limit(10);

//     res.status(200).json({
//       post: selectedPost,
//       related: relatedPosts,
//     });

//   } catch (error) {
//     console.error("Error fetching single post & related:", error);
//     res.status(500).json({ message: "Server Error", error: error.message });
//   }
// });


// router.get("/image/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     // 1. Fetch Post with Full Nesting
//     const selectedPost = await Post.findById(id)
//       .populate("userId", "username profilePic")
//       .populate({
//         path: "comments.userId",
//         select: "username profilePicture"
//       })
//       .populate({
//         path: "comments.replies.userId",
//         select: "username profilePicture"
//       });

//     if (!selectedPost) return res.status(404).json({ message: "Post not found" });

//     // 2. View Increment (Non-blocking)
//     Post.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec();

//     // 3. Smart Related Posts Logic
//     // Pura title use karne ke bajaye main keywords nikalenge
//     const titleKeywords = selectedPost.title
//       ? selectedPost.title.split(" ").filter(word => word.length > 3)
//       : [];

//     // Search Query: Match Keywords OR just show Latest
//     let query = { _id: { $ne: id } };
//     if (titleKeywords.length > 0) {
//       query.$or = [
//         { title: { $regex: titleKeywords.join("|"), $options: "i" } },
//         { tags: { $in: selectedPost.tags } } // Tags matching bhi check karega
//       ];
//     }

//     let relatedPosts = await Post.find(query)
//       .populate("userId", "username")
//       .sort({ createdAt: -1 }) // Pehle latest dikhao
//       .limit(10);

//     // Agar matching posts kam hain (Manlo 4 hi mile), toh baki 6 latest videos/posts se bhar do
//     if (relatedPosts.length < 6) {
//       const extraPosts = await Post.find({ 
//         _id: { $ne: id, $nin: relatedPosts.map(p => p._id) } 
//       })
//       .sort({ createdAt: -1 })
//       .limit(10 - relatedPosts.length);
      
//       relatedPosts = [...relatedPosts, ...extraPosts];
//     }

//     res.status(200).json({
//       post: selectedPost,
//       related: relatedPosts
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Server Error", error: error.message });
//   }
// });

// router.get("/image/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     // 1. Fetch Post with Full Nesting
//     const selectedPost = await Post.findById(id)
//       .populate("userId", "username profilePic")
//       .populate({
//         path: "comments.userId",
//         select: "username profilePicture"
//       })
//       .populate({
//         path: "comments.replies.userId",
//         select: "username profilePicture"
//       });

//     if (!selectedPost) {
//       return res.status(404).json({ message: "Post not found" });
//     }

//     // 🔹 Check if main post is an image
//     const mediaUrl = selectedPost.media || selectedPost.mediaUrl;
//     const isImage =
//       /^image\//i.test(selectedPost.mediaType || "") ||
//       /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|svg|jfif)$/i.test(mediaUrl || "");

//     if (!isImage) {
//       return res
//         .status(400)
//         .json({ message: "This post is not an image." });
//     }

//     // 🔹 Increment views
//     Post.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec();

//     const { tags, title, mediaType } = selectedPost;

//     // 🔹 Build regex for title keywords
//     const titleKeywords = title
//       ? title.split(" ").filter((word) => word.length > 2)
//       : [];

//     function escapeRegex(str) {
//       return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
//     }

//     const titleRegex = titleKeywords.length
//       ? {
//           $or: titleKeywords.map((word) => ({
//             title: { $regex: escapeRegex(word), $options: "i" },
//           })),
//         }
//       : {};

//     // 🔹 Related posts: latest videos only
//     const query = {
//       _id: { $ne: id },
//       mediaType: { $not: /^image\//i }, // exclude images
//       ...(titleRegex.$or ? { $or: titleRegex.$or } : {}),
//     };

//     const relatedPosts = await Post.find(query)
//       .populate("userId", "username")
//       .sort({ createdAt: -1 }) // latest videos
//       .limit(10);

//     res.status(200).json({
//       post: selectedPost,
//       related: relatedPosts,
//     });
//   } catch (error) {
//     console.error("Error fetching single image & related videos:", error);
//     res.status(500).json({ message: "Server Error", error: error.message });
//   }
// });



// router.get("/image/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     // =========================
//     // 1. GET MAIN POST
//     // =========================
//     const selectedPost = await Post.findById(id)
//       .populate("userId", "username profilePic")
//       .populate({
//         path: "comments.userId",
//         select: "username profilePicture",
//       })
//       .populate({
//         path: "comments.replies.userId",
//         select: "username profilePicture",
//       });

//     if (!selectedPost) {
//       return res.status(404).json({ message: "Post not found" });
//     }

//     // update views async
//     Post.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec();

//     const { mediaType, tags = [], title } = selectedPost;

//     // =========================
//     // 2. BUILD DYNAMIC FILTER
//     // =========================

//     const isVideo = mediaType === "video";
//     const isImage = mediaType === "image";

//     // avoid empty tags issue
//     const tagFilter =
//       tags.length > 0 ? { tags: { $in: tags } } : {};

//     // title keyword matching (optional boost)
//     const titleKeywords = title
//       ? title.split(" ").filter((w) => w.length > 2)
//       : [];

//     const titleFilter =
//       titleKeywords.length > 0
//         ? {
//             $or: titleKeywords.map((word) => ({
//               title: { $regex: word, $options: "i" },
//             })),
//           }
//         : {};

//     // =========================
//     // 3. RELATED POSTS QUERY
//     // =========================

//     const relatedPosts = await Post.find({
//       _id: { $ne: id },

//       // 🔥 SAME TYPE ONLY (fix mixed image/video issue)
//       mediaType: mediaType,

//       // tag + title boost
//       ...tagFilter,
//       ...(titleFilter.$or ? { $or: titleFilter.$or } : {}),
//     })
//       .populate("userId", "username")
//       .sort({
//         trendingScore: -1,
//         createdAt: -1,
//       })
//       .limit(10)
//       .lean();

//     // =========================
//     // 4. REMOVE DUPLICATES (extra safety)
//     // =========================
//     const uniqueRelated = Array.from(
//       new Map(relatedPosts.map((p) => [p._id.toString(), p])).values()
//     );

//     // =========================
//     // RESPONSE
//     // =========================

//     return res.status(200).json({
//       post: selectedPost,
//       related: uniqueRelated,
//     });
//   } catch (error) {
//     console.error("Error fetching post:", error);
//     return res.status(500).json({
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });






router.get("/image/:id", async (req, res) => {

  try {

    const { id } = req.params;

    // =========================
    // GET SELECTED POST
    // =========================

    const selectedPost =
      await Post.findById(id)

        .populate(
          "userId",
          "username profilePic"
        )

        .populate({
          path: "comments.userId",
          select:
            "username profilePicture",
        })

        .populate({
          path:
            "comments.replies.userId",
          select:
            "username profilePicture",
        });

    if (!selectedPost) {

      return res.status(404).json({
        message: "Post not found",
      });
    }






    // =========================
    // INCREASE MAIN POST VIEW
    // =========================

    await Post.findByIdAndUpdate(
      id,
      {
        $inc: {
          views: 1,
        },
      }
    );






    // =========================
    // RELATED POSTS
    // ONLY VIDEOS
    // LATEST FIRST
    // RANDOM UNIQUE
    // =========================

    const relatedPosts =
      await Post.aggregate([

        // REMOVE CURRENT POST
        {
          $match: {
            _id: {
              $ne:
                new mongoose.Types.ObjectId(
                  id
                ),
            },
          },
        },






        // ONLY VIDEO POSTS
        // ONLY VIDEO POSTS (Native + YouTube Playable Videos)
        {
          $match: {
            $or: [
              {
                mediaType: { $regex: /video/i },
              },
              {
                media: {
                  $regex: /\.(mp4|mov|webm|mkv|m4v)$/i,
                },
              },
              {
                media: {
                  $regex: /(?:youtube\.com|youtu\.be)/i,
                },
              },
              {
                "linkPreview.url": {
                  $regex: /(?:youtube\.com|youtu\.be)/i,
                },
              },
              {
                "linkPreview.siteName": {
                  $regex: /youtube/i,
                },
              },
              {
                title: {
                  $regex: /(?:youtube\.com|youtu\.be)/i,
                },
              },
            ],
          },
        },

        // RANDOM VALUE
        {
          $addFields: {
            random: {
              $rand: {},
            },
          },
        },

        // DYNAMIC RANDOM ROTATION
        {
          $sort: {
            random: 1,
            createdAt: -1,
          },
        },






        // LIMIT
        {
          $limit: 20,
        },






        // POPULATE USER
        {
          $lookup: {

            from: "users",

            localField: "userId",

            foreignField: "_id",

            as: "userId",

          },
        },






        {
          $unwind: {
            path: "$userId",
            preserveNullAndEmptyArrays: true,
          },
        },






        // CLEAN USER DATA
        {
          $project: {

            title: 1,
            media: 1,
            mediaType: 1,
            createdAt: 1,
            views: 1,
            likes: 1,
            tags: 1,

            "userId.username": 1,
            "userId.profilePic": 1,

          },
        },

      ]);






    // =========================
    // REMOVE DUPLICATES
    // =========================

    const uniqueRelated =
      Array.from(

        new Map(

          relatedPosts.map(
            (post) => [
              post._id.toString(),
              post,
            ]
          )

        ).values()

      );






    // =========================
    // RESPONSE
    // =========================

    return res.status(200).json({

      post: selectedPost,

      related: uniqueRelated,

    });

  } catch (error) {

    console.error(
      "Error fetching post:",
      error
    );

    return res.status(500).json({

      message: "Server Error",

      error: error.message,

    });
  }
});





// router.get("/image/:id", async (req, res) => {

//   function escapeRegex(text) {
//     return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
//   }

//   try {
//     const { id } = req.params;

//     const selectedPost = await Post.findById(id)
//       .populate("userId", "username profilePic")
//       .populate({
//         path: "comments.userId",
//         select: "username profilePicture",
//       })
//       .populate({
//         path: "comments.replies.userId",
//         select: "username profilePicture",
//       });

//     if (!selectedPost) {
//       return res.status(404).json({ message: "Post not found" });
//     }

//     // increase views
//     Post.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec();

//     const { tags = [], title } = selectedPost;

//     // =========================
//     // FILTER BUILD
//     // =========================

//     const tagFilter =
//       tags.length > 0 ? { tags: { $in: tags } } : {};

//     const titleKeywords = title
//       ? title.split(" ").filter((w) => w.length > 2)
//       : [];

//     const titleFilter =
//       titleKeywords.length > 0
//         ? {
//             $or: titleKeywords.map((word) => ({
//               title: { $regex: escapeRegex(word), $options: "i" },
//             })),
//           }
//         : {};

//     // =========================
//     // 1. PRIMARY RELATED POSTS (FIXED FOR FRESH + NO REPEAT)
//     // =========================

//     let relatedPosts = await Post.aggregate([
//   {
//     $match: {
//       _id: { $ne: new mongoose.Types.ObjectId(id) },
//       ...tagFilter,
//       ...(titleFilter.$or ? { $or: titleFilter.$or } : {}),
//     },
//   },

//   // 🔥 ADD VIDEO PRIORITY + FIX OLD POSTS
//   {
//     $addFields: {
//       isVideo: {
//         $cond: [
//           {
//             $or: [
//               { $eq: ["$mediaType", "video"] },
//               {
//                 $regexMatch: {
//                   input: "$media",
//                   regex: /\.(mp4|webm|mov)$/i,
//                 },
//               },
//             ],
//           },
//           1,
//           0,
//         ],
//       },

//       // 🔥 KEEP YOUR SCORE BUT IMPROVE "LATEST ONLY"
//       score: {
//         $add: [
//           // your existing freshness logic
//           {
//             $multiply: [
//               1,
//               {
//                 $divide: [
//                   1,
//                   {
//                     $add: [
//                       1,
//                       {
//                         $divide: [
//                           { $subtract: [new Date(), "$createdAt"] },
//                           1000 * 60 * 60 * 24,
//                         ],
//                       },
//                     ],
//                   },
//                 ],
//               },
//             ],
//           },

//           { $ifNull: ["$trendingScore", 0] },

//           // 🔥 reduce randomness so OLD posts don't dominate
//           { $multiply: [{ $rand: {} }, 0.5] },
//         ],
//       },
//     },
//   },

//   // 🔥 NEW SORTING LOGIC (VIDEO FIRST + LATEST FIRST)
//   {
//     $sort: {
//       isVideo: -1,     // videos first
//       score: -1,       // relevance
//       createdAt: -1,   // latest priority
//     },
//   },

//   // 🔥 INCREASE LIMIT (you asked ~20)
//   { $limit: 20 },
// ]);

//     // =========================
//     // 2. FALLBACK → LATEST ANY POSTS (ALSO RANDOM)
//     // =========================

//     if (!relatedPosts || relatedPosts.length === 0) {
//       relatedPosts = await Post.aggregate([
//         {
//           $match: {
//             _id: { $ne: new mongoose.Types.ObjectId(id) },
//           },
//         },
//         {
//           $addFields: {
//             rand: { $rand: {} },
//           },
//         },
//         {
//           $sort: {
//             createdAt: -1,
//             rand: 1,
//           },
//         },
//         { $limit: 10 },
//       ]);
//     }

//     // =========================
//     // REMOVE DUPLICATES SAFELY
//     // =========================

//     const uniqueRelated = Array.from(
//       new Map(relatedPosts.map((p) => [p._id.toString(), p])).values()
//     );

//     return res.status(200).json({
//       post: selectedPost,
//       related: uniqueRelated,
//     });

//   } catch (error) {
//     console.error("Error fetching post:", error);
//     return res.status(500).json({
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });



// router.get("/image/:id", async (req, res) => {

//   function escapeRegex(text) {
//   return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// }
//   try {
//     const { id } = req.params;

//     const selectedPost = await Post.findById(id)
//       .populate("userId", "username profilePic")
//       .populate({
//         path: "comments.userId",
//         select: "username profilePicture",
//       })
//       .populate({
//         path: "comments.replies.userId",
//         select: "username profilePicture",
//       });

//     if (!selectedPost) {
//       return res.status(404).json({ message: "Post not found" });
//     }

//     // increase views
//     Post.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec();

//     const { tags = [], title } = selectedPost;

//     // =========================
//     // FILTER BUILD
//     // =========================

//     const tagFilter =
//       tags.length > 0 ? { tags: { $in: tags } } : {};

//     const titleKeywords = title
//       ? title.split(" ").filter((w) => w.length > 2)
//       : [];

//     const titleFilter =
//   titleKeywords.length > 0
//     ? {
//         $or: titleKeywords.map((word) => ({
//           title: { $regex: escapeRegex(word), $options: "i" },
//         })),
//       }
//     : {};

//     // =========================
//     // 1. PRIMARY RELATED POSTS
//     // =========================

//     let relatedPosts = await Post.find({
//       _id: { $ne: id },
      
//       ...tagFilter,
//       ...(titleFilter.$or ? { $or: titleFilter.$or } : {}),
//     })
//       .populate("userId", "username")
//       .sort({ trendingScore: -1, createdAt: -1 })
//       .limit(10)
//       .lean();

//     // =========================
//     // 2. FALLBACK → LATEST SAME TYPE
//     // =========================

//     if (relatedPosts.length === 0) {
//       relatedPosts = await Post.find({
//         _id: { $ne: id }
        
//       })
//         .populate("userId", "username")
//         .sort({ createdAt: -1 })
//         .limit(10)
//         .lean();
//     }

//     // =========================
//     // 3. FINAL FALLBACK → ANY LATEST
//     // =========================

//     if (relatedPosts.length === 0) {
//       relatedPosts = await Post.find({
//         _id: { $ne: id },
//       })
//         .populate("userId", "username")
//         .sort({ createdAt: -1 })
//         .limit(10)
//         .lean();
//     }

//     // =========================
//     // REMOVE DUPLICATES
//     // =========================

//     const uniqueRelated = Array.from(
//       new Map(relatedPosts.map((p) => [p._id.toString(), p])).values()
//     );

//     return res.status(200).json({
//       post: selectedPost,
//       related: uniqueRelated,
//     });

//   } catch (error) {
//     console.error("Error fetching post:", error);
//     return res.status(500).json({
//       message: "Server Error",
//       error: error.message,
//     });
//   }
// });




router.get("/video/getall", async (req, res) => {
  try {
    const posts = await Post.find({
      mediaType: { $regex: /^video/i }
    })
      .sort({ _id: -1 }) // 🔥 BEST for latest upload
      .lean();

    res.status(200).json(posts);

  } catch (error) {
    res.status(500).json({
      message: "Error fetching video posts",
      error: error.message,
    });
  }
});



// router.get("/video/getall", async (req, res) => {
//   try {
//     // Sirf video posts fetch karo
//     const posts = await Post.find({ mediaType: { $regex: /^video/i } }) // sirf video
//       .sort({ _id: -1 })
//       .lean();
//       .populate("userId", "username profilePic")
//       .populate("comments.userId", "username profilePic")
//       .populate("comments.replies.userId", "username profilePic");

//     res.status(200).json(posts);

//   } catch (error) {
//     res.status(500).json({
//       message: "Error fetching video posts",
//       error: error.message,
//     });
//   }
// });




// =====================================================================
// 🚀 PHASE 2: CORE SOCIAL PLATFORM ENGINE (2026 SOCIAL STANDARD)
// =====================================================================

// 1. FOR YOU ALGORITHMIC FEED (Trending, Engagement & Latest Social Content)
router.get("/feed/for-you", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // High velocity blend: Recent posts with engagement weight
    const posts = await Post.find()
      .sort({ createdAt: -1, trendingScore: -1, views: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "username bio profilePicture")
      .populate({
        path: "repostOf",
        populate: { path: "userId", select: "username profilePicture" }
      })
      .populate({
        path: "comments.userId",
        select: "username profilePicture"
      });

    const totalPosts = await Post.countDocuments();

    return res.status(200).json({
      page,
      limit,
      totalPosts,
      hasMore: skip + posts.length < totalPosts,
      posts
    });
  } catch (error) {
    console.error("For-You Feed Error:", error);
    return res.status(500).json({ message: "Error loading For You feed", error: error.message });
  }
});

// 2. FOLLOWING FEED (Chronological updates exclusively from followed creators)
router.get("/feed/following", verifyToken, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const currentUserId = req.user.UserId;

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!currentUser.Followings || currentUser.Followings.length === 0) {
      return res.status(200).json({
        page: 1,
        totalPosts: 0,
        hasMore: false,
        posts: [],
        message: "You are not following anyone yet. Discover creators in For You!"
      });
    }

    let validFollowings = currentUser.Followings || [];
    if (currentUser.mutedUsers && currentUser.mutedUsers.length > 0) {
      validFollowings = validFollowings.filter(
        id => id && !currentUser.mutedUsers.some(m => m && m.toString() === id.toString())
      );
    }

    const feedFilter = { userId: { $in: validFollowings } };

    if (currentUser.mutedKeywords && currentUser.mutedKeywords.length > 0) {
      feedFilter.tags = { $nin: currentUser.mutedKeywords };
    }

    const posts = await Post.find(feedFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "username bio profilePicture")
      .populate({
        path: "repostOf",
        populate: { path: "userId", select: "username profilePicture" }
      })
      .populate({
        path: "comments.userId",
        select: "username profilePicture"
      });

    const totalPosts = await Post.countDocuments(feedFilter);

    return res.status(200).json({
      page,
      limit,
      totalPosts,
      hasMore: skip + posts.length < totalPosts,
      posts
    });
  } catch (error) {
    console.error("Following Feed Error:", error);
    return res.status(500).json({ message: "Error loading Following feed", error: error.message });
  }
});

// 3. TRENDING HASHTAGS ENGINE (Aggregates top tags across community posts)
router.get("/trending/hashtags", async (req, res) => {
  try {
    const trendingTags = await Post.aggregate([
      { $match: { tags: { $exists: true, $ne: [] } } },
      { $unwind: "$tags" },
      {
        $project: {
          tag: {
            $toLower: {
              $replaceAll: { input: "$tags", find: "#", replacement: "" }
            }
          }
        }
      },
      { $match: { tag: { $ne: "" } } },
      { $group: { _id: "$tag", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    const formatted = trendingTags.map(item => ({
      hashtag: `#${item._id}`,
      name: item._id,
      postsCount: item.count
    }));

    return res.status(200).json({
      success: true,
      trending: formatted
    });
  } catch (error) {
    console.error("Trending Hashtags Error:", error);
    return res.status(500).json({ message: "Error loading trending hashtags", error: error.message });
  }
});

// 4. HASHTAG POSTS SEARCH (Explore all posts matching a specific hashtag)
router.get("/hashtag/:tag", async (req, res) => {
  try {
    const rawTag = req.params.tag.replace(/^#/, "").trim();
    const tagRegex = new RegExp(`^#?${rawTag}$`, "i");

    const posts = await Post.find({ tags: tagRegex })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("userId", "username profilePicture");

    return res.status(200).json({
      hashtag: `#${rawTag}`,
      totalPosts: posts.length,
      posts
    });
  } catch (error) {
    console.error("Hashtag Search Error:", error);
    return res.status(500).json({ message: "Error searching hashtag", error: error.message });
  }
});

// 5. BOOKMARKS / SAVED POSTS API (Toggle Save/Unsave)
router.post("/bookmark/:postId", verifyToken, async (req, res) => {
  try {
    const postId = req.params.postId;
    const currentUserId = req.user.UserId;

    const [post, user] = await Promise.all([
      Post.findById(postId),
      User.findById(currentUserId)
    ]);

    if (!post || !user) {
      return res.status(404).json({ message: "Post or user not found" });
    }

    if (!user.bookmarks) {
      user.bookmarks = [];
    }

    const isBookmarked = user.bookmarks.some(
      id => id && id.toString() === postId.toString()
    );

    if (isBookmarked) {
      // Remove bookmark
      user.bookmarks = user.bookmarks.filter(
        id => id && id.toString() !== postId.toString()
      );
      post.bookmarksCount = Math.max(0, (post.bookmarksCount || 1) - 1);
    } else {
      // Add bookmark
      user.bookmarks.push(post._id);
      post.bookmarksCount = (post.bookmarksCount || 0) + 1;
    }

    await Promise.all([user.save(), post.save()]);

    return res.status(200).json({
      bookmarked: !isBookmarked,
      bookmarksCount: post.bookmarksCount,
      message: isBookmarked ? "Post removed from bookmarks" : "Post saved to bookmarks"
    });
  } catch (error) {
    console.error("Bookmark Error:", error);
    return res.status(500).json({ message: "Error toggling bookmark", error: error.message });
  }
});

// 6. GET ALL BOOKMARKED POSTS FOR LOGGED-IN USER
router.get("/user/bookmarks", verifyToken, async (req, res) => {
  try {
    const currentUserId = req.user.UserId;
    const user = await User.findById(currentUserId).populate({
      path: "bookmarks",
      populate: { path: "userId", select: "username profilePicture" }
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      total: user.bookmarks ? user.bookmarks.length : 0,
      bookmarks: user.bookmarks || []
    });
  } catch (error) {
    console.error("Get Bookmarks Error:", error);
    return res.status(500).json({ message: "Error fetching bookmarks", error: error.message });
  }
});

// 7. REPOST / QUOTE POST ENGINE (Viral Twitter/X Style Distribution)
router.post("/repost/:postId", verifyToken, async (req, res) => {
  try {
    const originalPostId = req.params.postId;
    const currentUserId = req.user.UserId;
    const { comment } = req.body;

    const originalPost = await Post.findById(originalPostId);
    if (!originalPost) {
      return res.status(404).json({ message: "Original post not found" });
    }

    // Create Repost
    const repost = new Post({
      userId: currentUserId,
      title: comment || originalPost.title,
      media: originalPost.media,
      mediaType: originalPost.mediaType,
      thumbnail: originalPost.thumbnail,
      tags: originalPost.tags,
      repostOf: originalPost._id,
      category: originalPost.category || "Entertainment"
    });

    originalPost.repostsCount = (originalPost.repostsCount || 0) + 1;

    await Promise.all([repost.save(), originalPost.save()]);

    // Emit Realtime Notification to original post owner
    if (originalPost.userId && originalPost.userId.toString() !== currentUserId.toString()) {
      await dispatchNotification({
        recipient: originalPost.userId,
        sender: currentUserId,
        type: "repost",
        post: originalPost._id
      });
    }

    const populatedRepost = await Post.findById(repost._id)
      .populate("userId", "username profilePicture")
      .populate({
        path: "repostOf",
        populate: { path: "userId", select: "username profilePicture" }
      });

    return res.status(201).json({
      message: "Post successfully shared to your feed!",
      repost: populatedRepost
    });
  } catch (error) {
    console.error("Repost Error:", error);
    return res.status(500).json({ message: "Error creating repost", error: error.message });
  }
});

// 8. INTERACTIVE POLL VOTING ENGINE
router.post("/poll/vote/:postId", verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { optionIndex } = req.body;
    const userId = req.user.UserId;

    if (optionIndex === undefined || optionIndex === null) {
      return res.status(400).json({ message: "optionIndex is required" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!post.poll || !Array.isArray(post.poll.options) || post.poll.options.length === 0) {
      return res.status(400).json({ message: "This post does not contain an active poll" });
    }

    if (post.poll.expiresAt && new Date(post.poll.expiresAt) < new Date()) {
      return res.status(400).json({ message: "This poll has ended" });
    }

    const idx = parseInt(optionIndex);
    if (isNaN(idx) || idx < 0 || idx >= post.poll.options.length) {
      return res.status(400).json({ message: "Invalid option index" });
    }

    // Check if user already voted in any option of this poll
    const alreadyVoted = post.poll.options.some(opt =>
      (opt.votes || []).some(id => id && id.toString() === userId.toString())
    );

    if (alreadyVoted) {
      return res.status(400).json({ message: "You have already voted in this poll" });
    }

    if (!post.poll.options[idx].votes) {
      post.poll.options[idx].votes = [];
    }
    post.poll.options[idx].votes.push(userId);
    await post.save();

    // Calculate aggregated results
    const totalVotes = post.poll.options.reduce((sum, opt) => sum + (opt.votes ? opt.votes.length : 0), 0);
    const optionsWithStats = post.poll.options.map((opt, i) => {
      const count = opt.votes ? opt.votes.length : 0;
      const label = opt.optionText || opt.text || "";
      return {
        index: i,
        optionText: label,
        text: label,
        votesCount: count,
        percentage: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
        hasVoted: i === idx
      };
    });

    return res.status(200).json({
      success: true,
      message: "Vote registered successfully",
      totalVotes,
      poll: {
        question: post.poll.question,
        expiresAt: post.poll.expiresAt,
        options: optionsWithStats
      }
    });
  } catch (error) {
    console.error("Poll Vote Error:", error);
    return res.status(500).json({ message: "Error recording vote", error: error.message });
  }
});

// 9. PIN / UNPIN POST (Profile Spotlight)
router.post("/pin/:postId", verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.UserId;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (!post.userId || post.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You can only pin your own posts" });
    }

    if (post.isPinned) {
      post.isPinned = false;
      await post.save();
      return res.status(200).json({
        success: true,
        isPinned: false,
        message: "Post unpinned from your profile"
      });
    } else {
      // Unpin any existing pinned post by this user
      await Post.updateMany({ userId: userId, isPinned: true }, { isPinned: false });
      post.isPinned = true;
      await post.save();
      return res.status(200).json({
        success: true,
        isPinned: true,
        message: "Post pinned to the top of your profile!"
      });
    }
  } catch (error) {
    console.error("Pin Post Error:", error);
    return res.status(500).json({ message: "Error updating pin status", error: error.message });
  }
});

// 10. CONTENT REPORTING / SAFETY MODERATION
router.post("/report/:postId", verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.UserId;
    const { reason, details } = req.body;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const report = new Report({
      reportedBy: userId,
      post: post._id,
      user: post.userId,
      reason: reason || "inappropriate_content",
      details: (details || "").trim().slice(0, 500)
    });

    await report.save();

    return res.status(201).json({
      success: true,
      message: "Thank you for keeping FondPeace safe. Our team will review this report promptly.",
      reportId: report._id
    });
  } catch (error) {
    console.error("Report Post Error:", error);
    return res.status(500).json({ message: "Error submitting report", error: error.message });
  }
});

// 11. UNIFIED SEARCH DISCOVERY SUITE (Creators, Posts, Videos & Tags)
router.get("/search/unified", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const type = (req.query.type || "all").toLowerCase();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    if (!q) {
      return res.status(200).json({
        success: true,
        query: "",
        people: [],
        posts: [],
        total: 0
      });
    }

    // Escape special characters in query string for safe regex search
    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(escapedQuery, "i");

    const tasks = [];

    // Search People / Creators if requested
    if (type === "all" || type === "people" || type === "creators") {
      tasks.push(
        User.find({
          $or: [
            { username: searchRegex },
            { name: searchRegex },
            { bio: searchRegex }
          ]
        })
          .select("name username bio profilePicture isVerified Followers")
          .limit(10)
          .lean()
      );
    } else {
      tasks.push(Promise.resolve([]));
    }

    // Search Posts / Media if requested
    if (type === "all" || type === "posts" || type === "videos" || type === "tags") {
      const postFilter = {
        $or: [
          { title: searchRegex },
          { tags: searchRegex },
          { category: searchRegex }
        ]
      };

      if (type === "videos") {
        postFilter.$and = [
          {
            $or: [
              { mediaType: { $regex: /video/i } },
              { media: { $regex: /\.(mp4|mov|webm|mkv)$/i } }
            ]
          }
        ];
      }

      tasks.push(
        Post.find(postFilter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("userId", "name username profilePicture isVerified")
          .lean()
      );

      tasks.push(Post.countDocuments(postFilter));
    } else {
      tasks.push(Promise.resolve([]));
      tasks.push(Promise.resolve(0));
    }

    const [people, posts, postsTotal] = await Promise.all(tasks);

    // Format people with follower counts
    const formattedPeople = (people || []).map(p => ({
      _id: p._id,
      name: p.name || p.username,
      username: p.username,
      bio: p.bio,
      profilePicture: p.profilePicture || "/Fondpeace.jpg",
      isVerified: !!p.isVerified,
      followersCount: p.Followers ? p.Followers.length : 0
    }));

    return res.status(200).json({
      success: true,
      query: q,
      type,
      page,
      limit,
      results: {
        people: formattedPeople,
        posts: posts || [],
        postsTotal: postsTotal || 0
      }
    });
  } catch (error) {
    console.error("Unified Search Error:", error);
    return res.status(500).json({ message: "Error performing search", error: error.message });
  }
});

// 12. INSTANT SEARCH AUTOCOMPLETE / SUGGESTIONS
router.get("/search/suggest", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q || q.length < 2) {
      return res.status(200).json({
        success: true,
        suggestions: { users: [], tags: [], titles: [] }
      });
    }

    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefixRegex = new RegExp(`^${escapedQuery}`, "i");
    const anyRegex = new RegExp(escapedQuery, "i");

    const [users, posts] = await Promise.all([
      User.find({
        $or: [{ username: prefixRegex }, { name: anyRegex }]
      })
        .select("name username profilePicture isVerified")
        .limit(5)
        .lean(),
      Post.find({
        $or: [{ title: anyRegex }, { tags: prefixRegex }]
      })
        .select("title tags mediaType")
        .limit(8)
        .lean()
    ]);

    // Extract unique matching tags
    const matchedTags = new Set();
    const cleanQ = q.toLowerCase().replace(/^#/, "");
    posts.forEach(p => {
      (p.tags || []).forEach(t => {
        if (t.toLowerCase().includes(cleanQ)) {
          matchedTags.add(t.toLowerCase());
        }
      });
    });

    return res.status(200).json({
      success: true,
      query: q,
      suggestions: {
        users: (users || []).map(u => ({
          _id: u._id,
          name: u.name || u.username,
          username: u.username,
          profilePicture: u.profilePicture || "/Fondpeace.jpg",
          isVerified: !!u.isVerified
        })),
        tags: Array.from(matchedTags).slice(0, 6),
        titles: (posts || []).slice(0, 5).map(p => p.title).filter(Boolean)
      }
    });
  } catch (error) {
    console.error("Search Suggest Error:", error);
    return res.status(500).json({ message: "Error fetching suggestions", error: error.message });
  }
});

// Alias for trending tags
router.get("/trending-tags", async (req, res) => {
  try {
    const trendingTags = await Post.aggregate([
      { $match: { tags: { $exists: true, $ne: [] } } },
      { $unwind: "$tags" },
      {
        $project: {
          tag: {
            $toLower: {
              $replaceAll: { input: "$tags", find: "#", replacement: "" }
            }
          }
        }
      },
      { $match: { tag: { $ne: "" } } },
      { $group: { _id: "$tag", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const formatted = trendingTags.map(item => ({
      hashtag: `#${item._id}`,
      name: item._id,
      postsCount: item.count
    }));

    return res.status(200).json({
      success: true,
      trending: formatted
    });
  } catch (error) {
    console.error("Trending Tags Error:", error);
    return res.status(500).json({ message: "Error loading trending tags", error: error.message });
  }
});

// 13. DYNAMIC OPENGRAPH LINK PREVIEW API
router.get(["/preview-link", "/preview/link"], async (req, res) => {
  try {
    const rawUrl = (req.query.url || "").trim();
    if (!rawUrl) {
      return res.status(400).json({ success: false, message: "URL parameter 'url' is required" });
    }

    const preview = await extractOpenGraph(rawUrl);
    if (!preview) {
      return res.status(404).json({ success: false, message: "Could not extract metadata from provided URL" });
    }

    return res.status(200).json({
      success: true,
      preview
    });
  } catch (error) {
    console.error("Preview Link Error:", error);
    return res.status(500).json({ success: false, message: "Error parsing link preview", error: error.message });
  }
});

// 14. DEEP POST ANALYTICS & PERFORMANCE METRICS
router.get("/analytics/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;
    const post = await Post.findById(postId)
      .populate("userId", "name username profilePicture isVerified")
      .lean();

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const views = post.views || 0;
    const likesCount = post.likes ? post.likes.length : 0;
    const commentsCount = post.comments ? post.comments.length : 0;
    const repostsCount = post.repostsCount || 0;
    const bookmarksCount = post.bookmarksCount || 0;

    let pollVotes = 0;
    if (post.poll && post.poll.options) {
      post.poll.options.forEach(opt => {
        pollVotes += (opt.votes ? opt.votes.length : 0);
      });
    }

    const totalInteractions = likesCount + commentsCount + repostsCount + bookmarksCount + pollVotes;
    const engagementRate = views > 0 
      ? `${((totalInteractions / views) * 100).toFixed(2)}%`
      : (totalInteractions > 0 ? "100.00%" : "0.00%");

    return res.status(200).json({
      success: true,
      postId: post._id,
      title: post.title,
      creator: post.userId,
      metrics: {
        views,
        likesCount,
        commentsCount,
        repostsCount,
        bookmarksCount,
        pollVotes,
        totalInteractions,
        engagementRate,
        trendingScore: post.trendingScore || 0
      },
      createdAt: post.createdAt
    });
  } catch (error) {
    console.error("Post Analytics Error:", error);
    return res.status(500).json({ message: "Error generating post analytics", error: error.message });
  }
});

module.exports = router;
