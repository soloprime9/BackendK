const express = require("express");
const router = express.Router();

const Bookmark = require("../models/Bookmark");
const { verifyToken } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ ADD BOOKMARK
// -----------------------------------------
router.post("/add", verifyToken, async (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user._id;

    if (!productId)
      return res.status(400).json({ error: "Product ID is required" });

    // Check if already bookmarked
    const exists = await Bookmark.findOne({ user: userId, product: productId });
    if (exists) return res.status(400).json({ error: "Product already bookmarked" });

    const bookmark = new Bookmark({ user: userId, product: productId });
    await bookmark.save();

    res.json({ success: true, message: "Product bookmarked", bookmark });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add bookmark" });
  }
});

// -----------------------------------------
// ⭐ REMOVE BOOKMARK
// -----------------------------------------
router.delete("/remove/:productId", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const bookmark = await Bookmark.findOneAndDelete({ user: userId, product: productId });
    if (!bookmark) return res.status(404).json({ error: "Bookmark not found" });

    res.json({ success: true, message: "Bookmark removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove bookmark" });
  }
});

// -----------------------------------------
// ⭐ GET ALL BOOKMARKS FOR USER
// -----------------------------------------
router.get("/my", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;

    const bookmarks = await Bookmark.find({ user: userId }).populate("product");
    res.json(bookmarks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

// -----------------------------------------
// ⭐ CHECK IF PRODUCT IS BOOKMARKED
// -----------------------------------------
router.get("/check/:productId", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId } = req.params;

    const exists = await Bookmark.findOne({ user: userId, product: productId });
    res.json({ bookmarked: !!exists });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to check bookmark" });
  }
});

module.exports = router;
