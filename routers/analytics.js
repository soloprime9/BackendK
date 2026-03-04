const geoip = require("geoip-lite");
const PostAnalytics = require("../models/PostAnalytics");
const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const User = require("../models/User");


router.post("/view/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await Post.findByIdAndUpdate(id, {
      $inc: { views: 1 }
    });

    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress;

    const geo = geoip.lookup(ip);

    await PostAnalytics.create({
      postId: id,
      ip,
      country: geo?.country || "Unknown",
      city: geo?.city || "Unknown",
      userAgent: req.headers["user-agent"]
    });

    // 🔥 emit live update
    req.app.get("io").emit("newViewGlobal", {
      postId: id
    });

    res.status(200).json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

router.get("/admin/all-traffic", async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const result = await PostAnalytics.aggregate([
      {
        $match: { timestamp: { $gte: sevenDaysAgo } }
      },
      {
        $group: {
          _id: "$postId",
          views7d: { $sum: 1 }
        }
      },
      {
        $sort: { views7d: -1 }
      }
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


router.get("/admin/post/:id/details", async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();

    const ranges = {
      "1m": new Date(now - 60 * 1000),
      "5m": new Date(now - 5 * 60 * 1000),
      "30m": new Date(now - 30 * 60 * 1000),
      "1h": new Date(now - 60 * 60 * 1000),
      "24h": new Date(now - 24 * 60 * 60 * 1000),
      "7d": new Date(now - 7 * 24 * 60 * 60 * 1000)
    };

    const traffic = {};

    for (let key in ranges) {
      traffic[key] = await PostAnalytics.countDocuments({
        postId: id,
        timestamp: { $gte: ranges[key] }
      });
    }

    const locations = await PostAnalytics.aggregate([
      { $match: { postId: new mongoose.Types.ObjectId(id) } },
      {
        $group: {
          _id: "$country",
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      traffic,
      locations
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
