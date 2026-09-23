const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const verifyToken = require("../middleware/verifyToken");

// 1. GET NOTIFICATIONS FOR LOGGED-IN USER (Supports Tabs: all, mentions, unread)
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const tab = (req.query.tab || "all").toLowerCase();

    const filter = { recipient: userId };
    if (tab === "mentions") {
      filter.type = "mention";
    } else if (tab === "unread") {
      filter.read = false;
    }

    const [notifications, unreadCount, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "name username profilePicture isVerified")
        .populate("additionalSenders", "name username profilePicture isVerified")
        .populate("post", "title thumbnail media mediaType"),
      Notification.countDocuments({ recipient: userId, read: false }),
      Notification.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      tab,
      unreadCount,
      total,
      page,
      limit,
      notifications
    });
  } catch (error) {
    console.error("Fetch Notifications Error:", error);
    return res.status(500).json({ message: "Error fetching notifications", error: error.message });
  }
});

// 2. MARK ALL OR SPECIFIC NOTIFICATIONS AS READ
router.put("/mark-read", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { notificationId } = req.body;

    if (notificationId) {
      // Mark single notification read
      await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: userId },
        { read: true }
      );
    } else {
      // Mark all unread as read for current user
      await Notification.updateMany(
        { recipient: userId, read: false },
        { read: true }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Notifications marked as read"
    });
  } catch (error) {
    console.error("Mark Read Error:", error);
    return res.status(500).json({ message: "Error updating notification status", error: error.message });
  }
});

// 3. DELETE NOTIFICATION
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const notificationId = req.params.id;

    const deleted = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId
    });

    if (!deleted) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted"
    });
  } catch (error) {
    console.error("Delete Notification Error:", error);
    return res.status(500).json({ message: "Error deleting notification", error: error.message });
  }
});

const User = require("../models/User");

// 4. SMART NOTIFICATION DISPATCHER & AGGREGATOR (Exported for Post.js and User.js)
async function createOrAggregateNotification(io, { recipient, sender, type, post = null, commentText = "" }) {
  try {
    if (!recipient || !sender || recipient.toString() === sender.toString()) {
      return null;
    }

    // Check recipient's notification preferences
    const recipientUser = await User.findById(recipient).select("notificationPreferences");
    if (recipientUser && recipientUser.notificationPreferences) {
      const prefs = recipientUser.notificationPreferences;
      if (type === "like" && prefs.notifyLikes === false) return null;
      if (type === "comment" && prefs.notifyComments === false) return null;
      if (type === "mention" && prefs.notifyMentions === false) return null;
      if (type === "repost" && prefs.notifyReposts === false) return null;
      if (type === "follow" && prefs.notifyFollows === false) return null;
    }

    let notification;

    // Aggregate likes on the same post within 24 hours
    if (type === "like" && post) {
      const existing = await Notification.findOne({
        recipient,
        post,
        type: "like",
        read: false
      });

      if (existing) {
        if (existing.sender.toString() !== sender.toString()) {
          const alreadyAdded = existing.additionalSenders.some(s => s.toString() === sender.toString());
          if (!alreadyAdded) {
            existing.additionalSenders.push(sender);
            existing.count = (existing.count || 1) + 1;
            existing.createdAt = new Date();
            await existing.save();
          }
        }
        notification = existing;
      }
    }

    if (!notification) {
      notification = await Notification.create({
        recipient,
        sender,
        type,
        post,
        commentText
      });
    }

    // Real-time socket delivery if socket is initialized
    if (io) {
      try {
        const populated = await Notification.findById(notification._id)
          .populate("sender", "name username profilePicture isVerified")
          .populate("additionalSenders", "name username profilePicture isVerified")
          .populate("post", "title thumbnail media mediaType");

        io.to(recipient.toString()).emit("new_notification", populated);
      } catch (sErr) {
        console.error("Socket emit notification error:", sErr.message);
      }
    }

    return notification;
  } catch (err) {
    console.error("createOrAggregateNotification Error:", err);
    return null;
  }
}

router.createOrAggregateNotification = createOrAggregateNotification;

module.exports = router;
