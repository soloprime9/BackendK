const express = require("express");
const router = express.Router();

const Notification = require("../models/Notification");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ CREATE NOTIFICATION (ADMIN ONLY)
// -----------------------------------------
router.post("/create", verifyToken, isAdmin, async (req, res) => {
  try {
    const { userId, message, link } = req.body;
    if (!userId || !message) return res.status(400).json({ error: "User and message are required" });

    const notification = new Notification({
      user: userId,
      message,
      link: link || ""
    });

    await notification.save();
    res.json({ success: true, message: "Notification created", notification });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create notification" });
  }
});

// -----------------------------------------
// ⭐ GET NOTIFICATIONS FOR LOGGED-IN USER
// -----------------------------------------
router.get("/", verifyToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// -----------------------------------------
// ⭐ MARK NOTIFICATION AS READ
// -----------------------------------------
router.put("/read/:id", verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, user: req.user._id });
    if (!notification) return res.status(404).json({ error: "Notification not found" });

    notification.read = true;
    await notification.save();

    res.json({ success: true, message: "Notification marked as read", notification });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// -----------------------------------------
// ⭐ DELETE NOTIFICATION (ADMIN OR OWNER)
// -----------------------------------------
router.delete("/delete/:id", verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id });
    if (!notification) return res.status(404).json({ error: "Notification not found" });

    // Only admin or owner can delete
    if (req.user.role !== "admin" && notification.user.toString() !== req.user._id.toString())
      return res.status(403).json({ error: "Not authorized to delete this notification" });

    await notification.deleteOne();
    res.json({ success: true, message: "Notification deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

module.exports = router;
