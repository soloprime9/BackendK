const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Post = require("../models/Post");
const PostAnalytics = require("../models/PostAnalytics");

/* ==============================
   TRACK VIEW (ANTI SPAM + SAFE)
============================== */


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
    res.status(500).json({
      message: "Error fetching posts",
      error: error.message,
    });
  }
});




router.post("/view/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const ip = req.ip;

    // prevent spam (same IP 10 min)
    const existing = await PostAnalytics.findOne({
      postId: id,
      ip,
      timestamp: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
    });

    if (existing) {
      return res.json({ success: true });
    }

    await Post.findByIdAndUpdate(id, {
      $inc: { views: 1 }
    });

    const country = req.headers["x-user-country"] || "Unknown";

    await PostAnalytics.create({
      postId: id,
      country,
      ip,
      userAgent: req.headers["user-agent"]
    });

    req.app.get("io").emit("newViewGlobal");

    res.json({ success: true });

  } catch (err) {
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
    res.status(500).json({ error: err.message });
  }
});

/* ==============================
   SINGLE POST DETAILS
============================== */

router.get("/admin/post/:id/details", async (req, res) => {
  try {
    const { id } = req.params;

    const traffic = {
      "1m": await PostAnalytics.countDocuments({
        postId: id,
        timestamp: { $gte: new Date(Date.now() - 60 * 1000) }
      }),
      "5m": await PostAnalytics.countDocuments({
        postId: id,
        timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
      }),
      "1h": await PostAnalytics.countDocuments({
        postId: id,
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }
      }),
      "24h": await PostAnalytics.countDocuments({
        postId: id,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      "7d": await PostAnalytics.countDocuments({
        postId: id,
        timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
    };

    const locations = await PostAnalytics.aggregate([
      { $match: { postId: new mongoose.Types.ObjectId(id) } },
      {
        $group: {
          _id: "$country",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({ traffic, locations });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
