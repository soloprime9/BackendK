const express = require("express");
const router = express.Router();

const PricingPlan = require("../models/PricingPlan");
const Product = require("../models/Product");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ ADMIN: CREATE PRICING PLAN
// -----------------------------------------
router.post("/create", verifyToken, isAdmin, async (req, res) => {
  try {
    const {
      product,
      name,
      description,
      price,
      currency,
      interval,
      features,
      trialDays,
      availability,
      sku,
      url,
      active,
    } = req.body;

    if (!product || !name)
      return res.status(400).json({ error: "Product and name are required" });

    // Check if product exists
    const prod = await Product.findById(product);
    if (!prod) return res.status(404).json({ error: "Product not found" });

    const plan = new PricingPlan({
      product,
      name,
      description: description || "",
      price: price || 0,
      currency: currency || "USD",
      interval: interval || "once",
      features: features || [],
      trialDays: trialDays || 0,
      availability: availability || "https://schema.org/InStock",
      sku: sku || "",
      url: url || "",
      active: active !== undefined ? active : true,
    });

    await plan.save();

    // Attach plan to product
    prod.plans.push(plan._id);
    await prod.save();

    res.json({ success: true, message: "Pricing plan created", plan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create pricing plan" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: UPDATE PRICING PLAN
// -----------------------------------------
router.put("/update/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const plan = await PricingPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: "Pricing plan not found" });

    Object.keys(req.body).forEach((key) => {
      plan[key] = req.body[key];
    });

    await plan.save();

    res.json({ success: true, message: "Pricing plan updated", plan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update pricing plan" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: DELETE PRICING PLAN
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const plan = await PricingPlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ error: "Pricing plan not found" });

    // Remove reference from product
    await Product.findByIdAndUpdate(plan.product, { $pull: { plans: plan._id } });

    res.json({ success: true, message: "Pricing plan deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete pricing plan" });
  }
});

// -----------------------------------------
// ⭐ GET ALL PRICING PLANS
// -----------------------------------------
router.get("/all", async (req, res) => {
  try {
    const plans = await PricingPlan.find().sort({ createdAt: -1 });
    res.json(plans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch pricing plans" });
  }
});

// -----------------------------------------
// ⭐ GET PRICING PLANS BY PRODUCT
// -----------------------------------------
router.get("/product/:productId", async (req, res) => {
  try {
    const plans = await PricingPlan.find({ product: req.params.productId }).sort({ price: 1 });
    res.json(plans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch plans for product" });
  }
});

// -----------------------------------------
// ⭐ GET SINGLE PLAN
// -----------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const plan = await PricingPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json(plan);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch plan" });
  }
});

module.exports = router;
