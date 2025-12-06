const express = require("express");
const router = express.Router();

const Vote = require("../models/Vote");
const Product = require("../models/Product");
const { verifyToken } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ CAST VOTE
// -----------------------------------------
router.post("/cast", async (req, res) => {
  try {
    const { productId, userId } = req.body;
    const userIp = req.ip;

    if (!productId) return res.status(400).json({ error: "Product ID is required" });

    // Check for duplicate vote
    let existingVote;
    if (userId) {
      existingVote = await Vote.findOne({ product: productId, user: userId });
    } else {
      existingVote = await Vote.findOne({ product: productId, userIp });
    }

    if (existingVote) return res.status(400).json({ error: "You have already voted" });

    const vote = new Vote({
      product: productId,
      user: userId || null,
      userIp: userId ? null : userIp
    });

    await vote.save();

    // Update product votes
    const votesCount = await Vote.countDocuments({ product: productId });
    await Product.findByIdAndUpdate(productId, { $set: { votes: votesCount } });

    res.json({ success: true, message: "Vote cast successfully", votesCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to cast vote" });
  }
});

// -----------------------------------------
// ⭐ GET VOTES COUNT FOR PRODUCT
// -----------------------------------------
router.get("/product/:productId", async (req, res) => {
  try {
    const votesCount = await Vote.countDocuments({ product: req.params.productId });
    res.json({ productId: req.params.productId, votesCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch votes" });
  }
});

// -----------------------------------------
// ⭐ DELETE VOTE (ADMIN ONLY)
// -----------------------------------------
router.delete("/delete/:id", verifyToken, async (req, res) => {
  try {
    const vote = await Vote.findById(req.params.id);
    if (!vote) return res.status(404).json({ error: "Vote not found" });

    await vote.deleteOne();
    res.json({ success: true, message: "Vote deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete vote" });
  }
});

module.exports = router;
