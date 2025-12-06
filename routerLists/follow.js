const express = require("express");
const router = express.Router();

const Follow = require("../models/Follow");
const { verifyToken } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ FOLLOW A USER
// -----------------------------------------
router.post("/follow/:userId", verifyToken, async (req, res) => {
  try {
    const followerId = req.user._id;
    const followingId = req.params.userId;

    if (followerId.toString() === followingId)
      return res.status(400).json({ error: "You cannot follow yourself" });

    const exists = await Follow.findOne({ follower: followerId, following: followingId });
    if (exists) return res.status(400).json({ error: "Already following this user" });

    const follow = new Follow({ follower: followerId, following: followingId });
    await follow.save();

    res.json({ success: true, message: "User followed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to follow user" });
  }
});

// -----------------------------------------
// ⭐ UNFOLLOW A USER
// -----------------------------------------
router.delete("/unfollow/:userId", verifyToken, async (req, res) => {
  try {
    const followerId = req.user._id;
    const followingId = req.params.userId;

    const unfollow = await Follow.findOneAndDelete({ follower: followerId, following: followingId });
    if (!unfollow) return res.status(404).json({ error: "Follow not found" });

    res.json({ success: true, message: "User unfollowed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to unfollow user" });
  }
});

// -----------------------------------------
// ⭐ GET FOLLOWERS OF USER
// -----------------------------------------
router.get("/followers/:userId", async (req, res) => {
  try {
    const followers = await Follow.find({ following: req.params.userId }).populate("follower", "username avatar");
    res.json(followers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch followers" });
  }
});

// -----------------------------------------
// ⭐ GET FOLLOWING OF USER
// -----------------------------------------
router.get("/following/:userId", async (req, res) => {
  try {
    const following = await Follow.find({ follower: req.params.userId }).populate("following", "username avatar");
    res.json(following);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch following" });
  }
});

// -----------------------------------------
// ⭐ CHECK IF USER IS FOLLOWING ANOTHER
// -----------------------------------------
router.get("/check/:userId", verifyToken, async (req, res) => {
  try {
    const followerId = req.user._id;
    const followingId = req.params.userId;

    const exists = await Follow.findOne({ follower: followerId, following: followingId });
    res.json({ following: !!exists });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to check follow status" });
  }
});

module.exports = router;
