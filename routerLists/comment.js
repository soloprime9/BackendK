const express = require("express");
const router = express.Router();

const Comment = require("../models/Comment");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ ADD COMMENT
// -----------------------------------------
router.post("/add", async (req, res) => {
  try {
    const { productId, message, name } = req.body;

    if (!productId || !message) return res.status(400).json({ error: "Product and message are required" });

    const commentData = {
      product: productId,
      message,
      name: name || undefined,
    };

    // If user is logged in
    if (req.headers.authorization) {
      try {
        const user = await verifyToken(req, res, () => {});
        if (user) commentData.user = user._id;
      } catch (err) {}
    }

    const comment = new Comment(commentData);
    await comment.save();

    res.json({ success: true, message: "Comment added", comment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// -----------------------------------------
// ⭐ ADD REPLY TO COMMENT
// -----------------------------------------
router.post("/reply/:commentId", async (req, res) => {
  try {
    const { message, name } = req.body;
    const { commentId } = req.params;

    if (!message) return res.status(400).json({ error: "Message is required" });

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    const reply = {
      message,
      name: name || undefined,
    };

    if (req.headers.authorization) {
      try {
        const user = await verifyToken(req, res, () => {});
        if (user) reply.user = user._id;
      } catch (err) {}
    }

    comment.replies.push(reply);
    await comment.save();

    res.json({ success: true, message: "Reply added", comment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add reply" });
  }
});

// -----------------------------------------
// ⭐ GET COMMENTS FOR PRODUCT
// -----------------------------------------
router.get("/product/:productId", async (req, res) => {
  try {
    const comments = await Comment.find({ product: req.params.productId }).populate("user", "username avatar").sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// -----------------------------------------
// ⭐ DELETE COMMENT (ADMIN ONLY)
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const comment = await Comment.findByIdAndDelete(req.params.id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    res.json({ success: true, message: "Comment deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

module.exports = router;
