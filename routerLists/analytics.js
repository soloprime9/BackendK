const express = require("express");
const router = express.Router();

const Analytics = require("../models/Analytics");
const Product = require("../models/Product");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ GET ANALYTICS FOR A PRODUCT
// -----------------------------------------
router.get("/product/:productId", async (req, res) => {
  try {
    const analytics = await Analytics.findOne({ product: req.params.productId });
    if (!analytics) return res.status(404).json({ error: "Analytics not found" });

    res.json(analytics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch analytics" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: GET ALL ANALYTICS
// -----------------------------------------
router.get("/all", verifyToken, isAdmin, async (req, res) => {
  try {
    const allAnalytics = await Analytics.find().sort({ createdAt: -1 });
    res.json(allAnalytics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch analytics" });
  }
});

// -----------------------------------------
// ⭐ INCREMENT VIEWS / CLICKS / SHARES / SEARCH
// -----------------------------------------
router.post("/increment/:productId", async (req, res) => {
  try {
    const { views, clicks, shares, searchAppearances } = req.body;

    let analytics = await Analytics.findOne({ product: req.params.productId });
    if (!analytics) {
      analytics = new Analytics({ product: req.params.productId });
    }

    if (views) analytics.views += views;
    if (clicks) analytics.clicks += clicks;
    if (shares) analytics.shares += shares;
    if (searchAppearances) analytics.searchAppearances += searchAppearances;

    await analytics.save();

    res.json({ success: true, message: "Analytics updated", analytics });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update analytics" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: RESET ANALYTICS FOR A PRODUCT
// -----------------------------------------
router.delete("/reset/:productId", verifyToken, isAdmin, async (req, res) => {
  try {
    const analytics = await Analytics.findOne({ product: req.params.productId });
    if (!analytics) return res.status(404).json({ error: "Analytics not found" });

    analytics.views = 0;
    analytics.clicks = 0;
    analytics.shares = 0;
    analytics.searchAppearances = 0;

    await analytics.save();

    res.json({ success: true, message: "Analytics reset", analytics });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset analytics" });
  }
});

module.exports = router;
