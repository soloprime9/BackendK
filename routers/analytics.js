const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const Post = require("../models/Post");
const User = require("../models/User");
const PostAnalytics = require("../models/PostAnalytics");
const { getIO } = require("../socket"); // ✅ use socket helper

// Helper: Extract rich client telemetry (IP, Country, City, Region, Device, User-Agent) passively
function extractClientTelemetry(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    (forwardedFor ? forwardedFor.split(",")[0].trim() : null) ||
    req.socket?.remoteAddress ||
    "0.0.0.0"
  ).replace(/^::ffff:/, "");

  const country =
    req.headers["cf-ipcountry"] ||
    req.headers["x-vercel-ip-country"] ||
    req.headers["x-country"] ||
    "Unknown";

  const city =
    req.headers["cf-ipcity"] ||
    req.headers["x-vercel-ip-city"] ||
    req.headers["x-city"] ||
    "Unknown";

  const region =
    req.headers["x-vercel-ip-country-region"] ||
    req.headers["cf-region"] ||
    "";

  const userAgent = req.headers["user-agent"] || "Unknown";

  let deviceType = "desktop";
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(userAgent)) {
    deviceType = "mobile";
  } else if (/ipad|tablet/i.test(userAgent)) {
    deviceType = "tablet";
  } else if (/bot|crawler|spider|googlebot|bingbot/i.test(userAgent)) {
    deviceType = "bot";
  }

  return { ip, country, city, region, userAgent, deviceType };
}

// Helper: Extract authenticated userId if token is provided in headers
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

/* ==============================
   GET POSTS (PAGINATED)
============================== */

router.get("/debug-analytics", async (req, res) => {
  const all = await PostAnalytics.find().sort({ timestamp: -1 }).limit(25);
  res.json(all);
});

router.get("/mango/getall", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .populate("comments.replies.userId", "username profilePic");

    res.status(200).json(posts);
  } catch (error) {
    console.error("Get posts error:", error);
    res.status(500).json({
      message: "Error fetching posts",
      error: error.message,
    });
  }
});

/* ==============================
   PASSIVE SHORTS WATCH TELEMETRY
   Logs IP, country, city, device, watch duration, completion
   without requiring user input.
============================== */
router.post("/shorts/watch", async (req, res) => {
  try {
    const { postId, duration = 0, completed = false, screen = "", source = "shorts_feed" } = req.body;

    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: "Invalid postId" });
    }

    const telemetry = extractClientTelemetry(req);
    const userId = extractUserId(req);

    // Anti-spam check: prevent duplicate view counts from same IP within 30 seconds
    const recentDuplicate = await PostAnalytics.findOne({
      postId,
      ip: telemetry.ip,
      timestamp: { $gte: new Date(Date.now() - 30 * 1000) }
    });

    let currentViews = 0;
    if (!recentDuplicate) {
      const updatedPost = await Post.findByIdAndUpdate(
        postId,
        { $inc: { views: 1, last24hViews: 1 } },
        { new: true, select: "views" }
      );
      if (updatedPost) currentViews = updatedPost.views;
    }

    // Record rich telemetry entry
    await PostAnalytics.create({
      postId,
      userId: userId && mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null,
      ip: telemetry.ip,
      country: telemetry.country,
      city: telemetry.city,
      region: telemetry.region,
      userAgent: telemetry.userAgent,
      deviceType: telemetry.deviceType,
      screenResolution: screen || "",
      watchDuration: Number(duration) || 0,
      completed: Boolean(completed),
      isShort: true,
      source: source || "shorts_feed",
      timestamp: new Date()
    });

    // If user is logged in, passively update their watchedShorts history (capped to 500 items)
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      await User.findByIdAndUpdate(userId, {
        $push: {
          watchedShorts: {
            $each: [{ postId: new mongoose.Types.ObjectId(postId), watchedAt: new Date() }],
            $slice: -500
          }
        }
      }).catch(() => {});
    }

    // Real-time socket broadcast
    try {
      const io = getIO();
      if (io && currentViews) io.emit("newViewGlobal", { postId, views: currentViews });
    } catch (_) {}

    return res.status(200).json({
      success: true,
      logged: {
        ip: telemetry.ip,
        country: telemetry.country,
        city: telemetry.city,
        deviceType: telemetry.deviceType,
        watchDuration: Number(duration) || 0
      }
    });

  } catch (err) {
    console.error("Shorts watch telemetry error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ==============================
   INSPECT RECENT PASSIVE TELEMETRY
============================== */
router.get("/shorts/recent-telemetry", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const records = await PostAnalytics.find({ isShort: true })
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate("postId", "title thumbnail media")
      .populate("userId", "username email");

    res.status(200).json({
      count: records.length,
      records
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ==============================
   TRACK VIEW (STANDARD)
============================== */

router.post("/view/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const telemetry = extractClientTelemetry(req);
    const userId = extractUserId(req);

    // Prevent spam: same IP within 10 min
    const existing = await PostAnalytics.findOne({
      postId: id,
      ip: telemetry.ip,
      timestamp: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
    });

    if (existing) {
      return res.json({ success: true, cached: true });
    }

    // Increment main post view counter
    const post = await Post.findByIdAndUpdate(
      id,
      { $inc: { views: 1, last24hViews: 1 } },
      { new: true }
    );

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // Store analytics with all useful info
    await PostAnalytics.create({
      postId: id,
      userId: userId && mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null,
      country: telemetry.country,
      ip: telemetry.ip,
      city: telemetry.city,
      region: telemetry.region,
      userAgent: telemetry.userAgent,
      deviceType: telemetry.deviceType,
      mediaType: post.mediaType,
      timestamp: new Date()
    });

    // Emit socket event for live dashboard
    try {
      const io = getIO();
      if (io) io.emit("newViewGlobal", { postId: id, views: post.views });
    } catch (_) {}

    res.json({ success: true, country: telemetry.country, ip: telemetry.ip, city: telemetry.city, deviceType: telemetry.deviceType });

  } catch (err) {
    console.error("View tracking error:", err);
    res.status(500).json({ success: false });
  }
});
/* ==============================
   TRENDING (7 DAYS)
============================== */

router.get("/admin/all-traffic", async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const result = await PostAnalytics.aggregate([
      { $match: { timestamp: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: "$postId",
          views7d: { $sum: 1 }
        }
      },
      { $sort: { views7d: -1 } }
    ]);

    const populated = await Post.populate(result, {
      path: "_id",
      select: "title thumbnail views mediaType createdAt"
    });

    res.json(populated);

  } catch (err) {
    console.error("Trending error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ==============================
   SINGLE POST DETAILS
============================== */

router.get("/admin/post/:id/details", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const objectId = new mongoose.Types.ObjectId(id);

    // TRAFFIC COUNTS
    const traffic = {
      "1m": await PostAnalytics.countDocuments({
        postId: objectId,
        timestamp: { $gte: new Date(Date.now() - 60 * 1000) }
      }),
      "5m": await PostAnalytics.countDocuments({
        postId: objectId,
        timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
      }),
      "1h": await PostAnalytics.countDocuments({
        postId: objectId,
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
      }),
      "24h": await PostAnalytics.countDocuments({
        postId: objectId,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      "7d": await PostAnalytics.countDocuments({
        postId: objectId,
        timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
    };

    // LOCATIONS WITH COUNTRY + CITY
    const locations = await PostAnalytics.aggregate([
      { $match: { postId: objectId } },
      {
        $group: {
          _id: { country: "$country", city: "$city" },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({ traffic, locations });

  } catch (err) {
    console.error("Post details error:", err);
    res.status(500).json({ error: err.message });
  }
});


/* ==============================
   LIVE TRAFFIC (MULTIPLE TIMEFRAMES)
============================== */
router.get("/admin/live-traffic", async (req, res) => {
  try {
    const timeframes = {
      "1m": 60 * 1000,
      "2m": 2 * 60 * 1000,
      "5m": 5 * 60 * 1000,
      "30m": 30 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000
    };

    const { time } = req.query; // e.g., ?time=5m
    const duration = timeframes[time] || 60 * 1000;
    const since = new Date(Date.now() - duration);

    // Aggregate views per post
    const traffic = await PostAnalytics.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: "$postId",
          views: { $sum: 1 }
        }
      },
      { $sort: { views: -1 } }
    ]);

    // Populate post details
    const populated = await Post.populate(traffic, {
      path: "_id",
      select: "title thumbnail views mediaType createdAt"
    });

    res.json({ traffic: populated });
  } catch (err) {
    console.error("Live traffic error:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
