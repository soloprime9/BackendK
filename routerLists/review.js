const express = require("express");
const router = express.Router();

const Review = require("../models/Review");
const Product = require("../models/Product");
const { verifyToken } = require("../middlewares/VerifyTokenv5/");

// -----------------------------------------
// ⭐ ADD A REVIEW
// -----------------------------------------
router.post("/add/:productId", verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, title, review } = req.body;

    if (!rating) return res.status(400).json({ error: "Rating is required" });

    // Check if user already reviewed
    let existingReview = await Review.findOne({ product: productId, user: req.user._id });
    if (existingReview) {
      existingReview.rating = rating;
      existingReview.title = title;
      existingReview.review = review;
      await existingReview.save();
    } else {
      const newReview = new Review({
        product: productId,
        user: req.user._id,
        rating,
        title,
        review
      });
      await newReview.save();
    }

    // Update average rating in Product
    const allReviews = await Review.find({ product: productId });
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await Product.findByIdAndUpdate(productId, { avgRating });

    res.json({ success: true, message: "Review submitted/updated" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// -----------------------------------------
// ⭐ GET ALL REVIEWS FOR A PRODUCT
// -----------------------------------------
router.get("/:productId", async (req, res) => {
  try {
    const reviews = await Review.find({ product: req.params.productId }).populate("user", "username avatar");
    res.json(reviews);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// -----------------------------------------
// ⭐ DELETE REVIEW (USER OR ADMIN)
// -----------------------------------------
router.delete("/delete/:id", verifyToken, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: "Review not found" });

    // Only admin or owner can delete
    if (req.user.role !== "admin" && review.user.toString() !== req.user._id.toString())
      return res.status(403).json({ error: "Not authorized to delete this review" });

    await review.deleteOne();

    // Update average rating in Product
    const allReviews = await Review.find({ product: review.product });
    const avgRating = allReviews.length
      ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      : 0;
    await Product.findByIdAndUpdate(review.product, { avgRating });

    res.json({ success: true, message: "Review deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete review" });
  }
});

module.exports = router;
