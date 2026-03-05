const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Post = require("../models/Post");
const PostAnalytics = require("../models/PostAnalytics");
const { getIO } = require("../socket"); // ✅ use socket helper

/* ==============================
   GET POSTS (PAGINATED)
============================== */

router.get("/debug-analytics", async (req, res) => {
  const all = await PostAnalytics.find().limit(10);
  res.json(all);
});


router.get("/mango/getall", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
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
   TRACK VIEW (ANTI-SPAM)
============================== */

router.post("/view/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    // ✅ Get correct IP (Vercel proxy support)
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket?.remoteAddress ||
      "0.0.0.0";

    // ✅ Get country from Vercel header
    const country = req.headers["x-vercel-ip-country"] || "Unknown";

    // Prevent spam: same IP within 10 min
    const existing = await PostAnalytics.findOne({
      postId: id,
      ip,
      timestamp: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
    });

    if (existing) {
      return res.json({ success: true });
    }

    // Increment main post view counter
    const post = await Post.findByIdAndUpdate(
      id,
      { $inc: { views: 1, last24hViews: 1 } }, // last24hViews for trending
      { new: true }
    );

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    // Store analytics with all useful info
    await PostAnalytics.create({
      postId: id,
      country,
      ip,
      city: req.headers["x-vercel-ip-city"] || "Unknown", // optional if available
      userAgent: req.headers["user-agent"] || "Unknown",
      mediaType: post.mediaType, // store type for analytics/trending
      timestamp: new Date()
    });

    // ✅ Emit socket event for live dashboard (Render)
    try {
      const io = getIO();
      io.emit("newViewGlobal", { postId: id, views: post.views });
    } catch (socketErr) {
      console.log("Socket not ready:", socketErr.message);
    }

    res.json({ success: true, country, ip });

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
