const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Notification = require("../models/Notification");
const verifyToken = require("../middleware/verifyToken");
const webPushHelper = require("../utils/webPushHelper");

// 1. GET NOTIFICATIONS FOR LOGGED-IN USER (Supports Tabs: all, mentions, unread)
router.get("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.UserId || req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid token payload" });
    }
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

// 2. MARK ALL OR SPECIFIC NOTIFICATIONS AS READ (Supports PUT and POST)
const handleMarkRead = async (req, res) => {
  try {
    const userId = req.user?.UserId || req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid token" });
    }
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

    const unreadCount = await Notification.countDocuments({ recipient: userId, read: false });

    return res.status(200).json({
      success: true,
      unreadCount,
      message: "Notifications marked as read"
    });
  } catch (error) {
    console.error("Mark Read Error:", error);
    return res.status(500).json({ message: "Error updating notification status", error: error.message });
  }
};

router.put("/mark-read", verifyToken, handleMarkRead);
router.post("/mark-read", verifyToken, handleMarkRead);

// 3. DELETE NOTIFICATION
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.UserId || req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid token payload" });
    }
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

    // 1. Fetch populated notification for real-time delivery
    let populated = null;
    try {
      populated = await Notification.findById(notification._id)
        .populate("sender", "name username profilePicture isVerified")
        .populate("additionalSenders", "name username profilePicture isVerified")
        .populate("post", "title thumbnail media mediaType");

      if (io && populated) {
        io.to(recipient.toString()).emit("new_notification", populated);
      }
    } catch (sErr) {
      console.error("Socket emit notification error:", sErr.message);
    }

    // 2. Native Web Push (PWA OS Alert) delivery
    try {
      const senderName = populated?.sender?.name || populated?.sender?.username || "Someone";
      let pushTitle = "FondPeace Alert";
      let pushBody = "You have a new update on FondPeace";

      if (type === "like") {
        pushTitle = `${senderName} liked your post ❤️`;
        pushBody = populated?.post?.title ? `"${populated.post.title.slice(0, 45)}..."` : "Check out who liked your post!";
      } else if (type === "comment") {
        pushTitle = `${senderName} commented 💬`;
        pushBody = commentText ? `"${commentText.slice(0, 50)}"` : "View comment on your post";
      } else if (type === "follow") {
        pushTitle = "New Follower 🎉";
        pushBody = `${senderName} started following your profile`;
      } else if (type === "mention") {
        pushTitle = `${senderName} mentioned you 🏷️`;
        pushBody = commentText || "You were mentioned in a post";
      }

      const postUrl = post ? `/post/${post}` : "/notifications";
      webPushHelper.sendPushToUser(recipient, {
        title: pushTitle,
        body: pushBody,
        url: postUrl,
        icon: populated?.sender?.profilePicture || "/Fondpeace.jpg",
        badge: "/Fondpeace.jpg",
        data: { url: postUrl }
      }).catch(pErr => console.warn("Background webpush warning:", pErr.message));
    } catch (pErr) {
      console.warn("Push dispatch error:", pErr.message);
    }

    return notification;
  } catch (err) {
    console.error("createOrAggregateNotification Error:", err);
    return null;
  }
}

// 5. GET VAPID PUBLIC KEY (Used by frontend browsers to subscribe to Web Push)
router.get("/push/public-key", (req, res) => {
  return res.status(200).json({
    success: true,
    publicKey: webPushHelper.getPublicKey()
  });
});

// 6. SAVE PUSH SUBSCRIPTION (Supports authenticated users and guest visitors)
router.post("/push/subscribe", async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ success: false, message: "Invalid subscription payload" });
    }

    // Attempt optional token extraction if user is logged in
    let userId = null;
    let isGuest = true;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "fondpeace_secret");
        userId = decoded?.UserId || decoded?.id || decoded?._id;
        if (userId) isGuest = false;
      } catch (tokenErr) {
        // Silently treat invalid or expired tokens as guest
      }
    }

    const saved = await webPushHelper.saveSubscription({
      subscription,
      userId,
      isGuest,
      userAgent: req.headers["user-agent"] || ""
    });

    return res.status(200).json({
      success: true,
      message: "Push subscription saved successfully",
      isGuest: saved.isGuest,
      subscriptionId: saved._id
    });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 7. BROADCAST PUSH NOTIFICATION (Admin or system alerts to real users & guests)
router.post("/push/broadcast", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"] || req.query.adminKey;
    if (adminKey !== (process.env.ADMIN_KEY || "fondpeace_secret")) {
      return res.status(403).json({ success: false, message: "Unauthorized admin access" });
    }

    const { title, body, url = "/", isGuestOnly = false } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, message: "Title and body are required" });
    }

    const result = await webPushHelper.broadcastPush({
      title,
      body,
      url,
      icon: "/Fondpeace.jpg",
      badge: "/Fondpeace.jpg",
      data: { url }
    }, { isGuestOnly });

    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.error("Broadcast push error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.createOrAggregateNotification = createOrAggregateNotification;

module.exports = router;
