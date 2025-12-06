const express = require("express");
const router = express.Router();

const Badge = require("../models/Badge");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ ADMIN: CREATE BADGE
// -----------------------------------------
router.post("/create", verifyToken, isAdmin, async (req, res) => {
  try {
    const { name, icon, color } = req.body;

    if (!name) return res.status(400).json({ error: "Badge name is required" });

    const badge = new Badge({
      name,
      icon: icon || "",
      color: color || "#000000",
    });

    await badge.save();

    res.json({ success: true, message: "Badge created", badge });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create badge" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: UPDATE BADGE
// -----------------------------------------
router.put("/update/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const badge = await Badge.findById(req.params.id);
    if (!badge) return res.status(404).json({ error: "Badge not found" });

    Object.keys(req.body).forEach((key) => {
      badge[key] = req.body[key];
    });

    await badge.save();

    res.json({ success: true, message: "Badge updated", badge });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update badge" });
  }
});

// -----------------------------------------
// ⭐ ADMIN: DELETE BADGE
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const badge = await Badge.findByIdAndDelete(req.params.id);
    if (!badge) return res.status(404).json({ error: "Badge not found" });

    res.json({ success: true, message: "Badge deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete badge" });
  }
});

// -----------------------------------------
// ⭐ GET ALL BADGES
// -----------------------------------------
router.get("/all", async (req, res) => {
  try {
    const badges = await Badge.find().sort({ name: 1 });
    res.json(badges);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch badges" });
  }
});

// -----------------------------------------
// ⭐ GET SINGLE BADGE BY ID
// -----------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const badge = await Badge.findById(req.params.id);
    if (!badge) return res.status(404).json({ error: "Badge not found" });
    res.json(badge);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cannot fetch badge" });
  }
});

module.exports = router;
