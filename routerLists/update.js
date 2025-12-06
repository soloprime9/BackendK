const express = require("express");
const router = express.Router();

const Update = require("../models/Update");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ CREATE UPDATE
// -----------------------------------------
router.post("/create", verifyToken, async (req, res) => {
  try {
    const { productId, title, description, version } = req.body;
    if (!productId || !title) return res.status(400).json({ error: "Product and title are required" });

    const update = new Update({
      product: productId,
      title,
      description: description || "",
      version: version || "1.0.0"
    });

    await update.save();
    res.json({ success: true, message: "Update created", update });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create update" });
  }
});

// -----------------------------------------
// ⭐ GET ALL UPDATES FOR A PRODUCT
// -----------------------------------------
router.get("/product/:productId", async (req, res) => {
  try {
    const updates = await Update.find({ product: req.params.productId }).sort({ createdAt: -1 });
    res.json(updates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch updates" });
  }
});

// -----------------------------------------
// ⭐ UPDATE AN UPDATE
// -----------------------------------------
router.put("/update/:id", verifyToken, async (req, res) => {
  try {
    const update = await Update.findById(req.params.id);
    if (!update) return res.status(404).json({ error: "Update not found" });

    const { title, description, version } = req.body;
    if (title) update.title = title;
    if (description) update.description = description;
    if (version) update.version = version;

    await update.save();
    res.json({ success: true, message: "Update updated", update });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update" });
  }
});

// -----------------------------------------
// ⭐ DELETE AN UPDATE
// -----------------------------------------
router.delete("/delete/:id", verifyToken, async (req, res) => {
  try {
    const update = await Update.findById(req.params.id);
    if (!update) return res.status(404).json({ error: "Update not found" });

    await update.deleteOne();
    res.json({ success: true, message: "Update deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete" });
  }
});

module.exports = router;
