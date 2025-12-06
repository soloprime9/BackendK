const express = require("express");
const router = express.Router();

const FeatureRequest = require("../models/FeatureRequest");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ CREATE FEATURE REQUEST
// -----------------------------------------
router.post("/create", verifyToken, async (req, res) => {
  try {
    const { productId, title, description } = req.body;

    if (!productId || !title || !description)
      return res.status(400).json({ error: "Product, title and description are required" });

    const feature = new FeatureRequest({
      product: productId,
      title,
      description
    });

    await feature.save();
    res.json({ success: true, message: "Feature request created", feature });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create feature request" });
  }
});

// -----------------------------------------
// ⭐ GET ALL FEATURE REQUESTS FOR PRODUCT
// -----------------------------------------
router.get("/product/:productId", async (req, res) => {
  try {
    const features = await FeatureRequest.find({ product: req.params.productId }).sort({ votes: -1 });
    res.json(features);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch feature requests" });
  }
});

// -----------------------------------------
// ⭐ VOTE FOR FEATURE REQUEST
// -----------------------------------------
router.post("/vote/:id", verifyToken, async (req, res) => {
  try {
    const feature = await FeatureRequest.findById(req.params.id);
    if (!feature) return res.status(404).json({ error: "Feature request not found" });

    feature.votes += 1;
    await feature.save();

    res.json({ success: true, message: "Voted successfully", votes: feature.votes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to vote" });
  }
});

// -----------------------------------------
// ⭐ UPDATE FEATURE REQUEST STATUS (ADMIN ONLY)
// -----------------------------------------
router.put("/update-status/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["planned", "in-progress", "done"].includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const feature = await FeatureRequest.findById(req.params.id);
    if (!feature) return res.status(404).json({ error: "Feature request not found" });

    feature.status = status;
    await feature.save();

    res.json({ success: true, message: "Feature request status updated", feature });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update feature request" });
  }
});

// -----------------------------------------
// ⭐ DELETE FEATURE REQUEST (ADMIN ONLY)
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const feature = await FeatureRequest.findByIdAndDelete(req.params.id);
    if (!feature) return res.status(404).json({ error: "Feature request not found" });

    res.json({ success: true, message: "Feature request deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete feature request" });
  }
});

module.exports = router;
