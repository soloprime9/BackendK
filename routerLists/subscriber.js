const express = require("express");
const router = express.Router();

const Subscriber = require("../models/Subscriber");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ ADD SUBSCRIBER
// -----------------------------------------
router.post("/add", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    let existing = await Subscriber.findOne({ email });
    if (existing) return res.status(400).json({ error: "Already subscribed" });

    const subscriber = new Subscriber({ email });
    await subscriber.save();
    res.json({ success: true, message: "Subscribed successfully", subscriber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to subscribe" });
  }
});

// -----------------------------------------
// ⭐ GET ALL SUBSCRIBERS (ADMIN ONLY)
// -----------------------------------------
router.get("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const subscribers = await Subscriber.find().sort({ subscribedAt: -1 });
    res.json(subscribers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch subscribers" });
  }
});

// -----------------------------------------
// ⭐ DELETE SUBSCRIBER (ADMIN ONLY)
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const subscriber = await Subscriber.findByIdAndDelete(req.params.id);
    if (!subscriber) return res.status(404).json({ error: "Subscriber not found" });

    res.json({ success: true, message: "Subscriber deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete subscriber" });
  }
});

module.exports = router;
