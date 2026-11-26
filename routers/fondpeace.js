const express = require("express");
const router = express.Router();
const Post = require("../models/Post");

const POPULATE_USER = {
  path: "userId",
  select: "username name profilePic profilePicture avatar isVerified isEmailVerified category tagline",
};

const POPULATE_COMMENTS = {
  path: "comments.userId",
  select: "username name profilePic profilePicture avatar isVerified isEmailVerified",
};

const POPULATE_REPOST = {
  path: "repostOf",
  populate: {
    path: "userId",
    select: "username name profilePic profilePicture avatar isVerified isEmailVerified",
  },
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFeedFilter(query) {
  const type = String(query.type || "all").trim().toLowerCase();
  const tag = typeof query.tag === "string" ? query.tag.trim() : "";
  const category = typeof query.category === "string" ? query.category.trim() : "";
  const locationQuery = typeof query.location === "string" ? query.location.trim() : "";
  const topics = typeof query.topics === "string" ? query.topics.trim() : "";

  const andClauses = [];

  if (tag) {
    const cleanTag = tag.replace(/^#/, "");
    const safeTag = escapeRegex(cleanTag);
    andClauses.push({
      $or: [
        { tags: { $in: [cleanTag, `#${cleanTag}`] } },
        { title: { $regex: `#${safeTag}\\b`, $options: "i" } },
      ],
    });
  }

  if (category && category !== "All") {
    andClauses.push({ category });
  }

  if (locationQuery) {
    andClauses.push({
      location: { $regex: escapeRegex(locationQuery), $options: "i" },
    });
  }

  if (topics && (!category || category === "All")) {
    const topicList = topics
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (topicList.length > 0) {
      andClauses.push({
        $or: [
          { category: { $in: topicList } },
          { tags: { $in: topicList } },
          { tags: { $in: topicList.map((t) => `#${t}`) } },
        ],
      });
    }
  }

  if (type === "video") {
    andClauses.push({
      $or: [
        { mediaType: { $regex: /video/i } },
        { media: { $regex: /\.(mp4|mov|webm|mkv|m4v)$/i } },
        { media: { $regex: /(youtube\.com|youtu\.be)/i } },
        { "linkPreview.url": { $regex: /(youtube\.com|youtu\.be)/i } },
        { "linkPreview.siteName": { $regex: /youtube/i } },
      ],
    });
  } else if (type === "image" || type === "photo") {
    andClauses.push({
      $and: [
        {
          $or: [
            { mediaType: { $regex: /image/i } },
            { media: { $regex: /\.(jpg|jpeg|png|webp|gif|bmp|avif|jfif)$/i } },
          ],
        },
        { media: { $not: /\.(mp4|mov|webm|mkv|m4v)$/i } },
      ],
    });
  } else if (type === "discussion" || type === "text") {
    andClauses.push({
      $or: [
        { mediaType: { $in: ["text", "discussion", "poll"] } },
        { "poll.question": { $exists: true, $ne: "" } },
        {
          $and: [
            { media: { $in: ["", null] } },
            { "linkPreview.url": { $in: ["", null] } },
          ],
        },
      ],
    });
  } else if (type === "poll") {
    andClauses.push({ "poll.question": { $exists: true, $ne: "" } });
  } else if (type === "link") {
    andClauses.push({
      $or: [
        { mediaType: "link" },
        { "linkPreview.url": { $exists: true, $ne: "" } },
      ],
    });
  }

  if (andClauses.length === 0) return {};
  if (andClauses.length === 1) return andClauses[0];
  return { $and: andClauses };
}

/**
 * Dedicated FondPeace chronological feed endpoint.
 * Supports all filter conditions of /post/mango/getall while guaranteeing strict
 * latest-first (createdAt: -1) ordering across all pages without random shuffling.
 */
router.get(["/feed", "/getall"], async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const sortMode = String(req.query.sort || "latest").trim().toLowerCase();

    const queryFilter = buildFeedFilter(req.query);
    const sortOptions =
      sortMode === "trending"
        ? { views: -1, trendingScore: -1, createdAt: -1, _id: -1 }
        : { createdAt: -1, _id: -1 };

    const [posts, totalPosts] = await Promise.all([
      Post.find(queryFilter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate(POPULATE_USER)
        .populate(POPULATE_COMMENTS)
        .populate(POPULATE_REPOST),
      Post.countDocuments(queryFilter),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalPosts / limit));
    const hasMore = skip + posts.length < totalPosts;

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("X-FondPeace-API", "fondpeace-feed-latest-v1");
    res.setHeader("X-Total-Posts", String(totalPosts));
    res.setHeader("X-Total-Pages", String(totalPages));
    res.setHeader("X-Has-More", String(hasMore));

    if (String(req.query.format || "").toLowerCase() === "array") {
      return res.status(200).json(posts);
    }

    return res.status(200).json({
      success: true,
      api: "fondpeace-feed",
      order: sortMode === "trending" ? "trending" : "latest-first",
      page,
      limit,
      totalPosts,
      totalPages,
      hasMore,
      posts,
    });
  } catch (error) {
    console.error("FondPeace feed error:", error);
    return res.status(500).json({
      success: false,
      api: "fondpeace-feed",
      message: "Error fetching FondPeace feed posts",
      error: error.message,
    });
  }
});

module.exports = router;
