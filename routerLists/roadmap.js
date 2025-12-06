const express = require("express");
const router = express.Router();

const Roadmap = require("../models/Roadmap");
const Product = require("../models/Product");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ CREATE ROADMAP ITEM
// -----------------------------------------
router.post("/create", verifyToken, async (req, res) => {
  try {
    const { productId, title, description, stage } = req.body;
    if (!productId || !title) return res.status(400).json({ error: "Product and title are required" });

    const roadmap = new Roadmap({
      product: productId,
      title,
      description: description || "",
      stage: stage || "planned"
    });

    await roadmap.save();
    res.json({ success: true, message: "Roadmap item created", roadmap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create roadmap item" });
  }
});

// -----------------------------------------
// ⭐ GET ROADMAP FOR A PRODUCT
// -----------------------------------------
router.get("/product/:productId", async (req, res) => {
  try {
    const roadmap = await Roadmap.find({ product: req.params.productId }).sort({ stage: 1 });
    res.json(roadmap);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch roadmap" });
  }
});

// -----------------------------------------
// ⭐ UPDATE ROADMAP ITEM
// -----------------------------------------
router.put("/update/:id", verifyToken, async (req, res) => {
  try {
    const roadmap = await Roadmap.findById(req.params.id);
    if (!roadmap) return res.status(404).json({ error: "Roadmap item not found" });

    // Only admin or product owner can update
    // Here you can add owner check if needed

    const { title, description, stage } = req.body;
    if (title) roadmap.title = title;
    if (description) roadmap.description = description;
    if (stage) roadmap.stage = stage;

    await roadmap.save();
    res.json({ success: true, message: "Roadmap item updated", roadmap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update roadmap item" });
  }
});

// -----------------------------------------
// ⭐ DELETE ROADMAP ITEM
// -----------------------------------------
router.delete("/delete/:id", verifyToken, async (req, res) => {
  try {
    const roadmap = await Roadmap.findById(req.params.id);
    if (!roadmap) return res.status(404).json({ error: "Roadmap item not found" });

    await roadmap.deleteOne();
    res.json({ success: true, message: "Roadmap item deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete roadmap item" });
  }
});

module.exports = router;
