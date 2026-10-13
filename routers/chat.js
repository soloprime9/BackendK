const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const verifyToken = require("../middleware/verifyToken");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");
const { getIO } = require("../socket");

// Safe helper to emit realtime events
function emitChatEvent(room, event, data) {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (_) {}
}

const USER_FIELDS = "username name profilePicture profilePic avatar isVerified category";

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET ALL CONVERSATIONS FOR CURRENT USER
// ─────────────────────────────────────────────────────────────────────────────
router.get("/conversations", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const conversations = await Conversation.find({
      participants: userId
    })
      .sort({ updatedAt: -1 })
      .populate("participants", USER_FIELDS)
      .populate("groupAdmins", USER_FIELDS)
      .populate("lastMessage.sender", "username name")
      .lean();

    // Map unread counts and pin status for this specific user
    const formatted = conversations.map((conv) => {
      const unread = conv.unreadCounts ? (conv.unreadCounts[userId] || 0) : 0;
      const isPinned = conv.pinnedBy ? conv.pinnedBy.some((id) => id.toString() === userId.toString()) : false;
      return {
        ...conv,
        unreadCount: unread,
        isPinned
      };
    });

    return res.status(200).json({ success: true, conversations: formatted });
  } catch (error) {
    console.error("Fetch conversations error:", error);
    return res.status(500).json({ success: false, error: "Failed to load chats" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET OR CREATE 1-ON-1 CONVERSATION
// ─────────────────────────────────────────────────────────────────────────────
router.post("/conversation", verifyToken, async (req, res) => {
  try {
    const currentUserId = req.user.UserId;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: "targetUserId is required" });
    }

    if (String(currentUserId) === String(targetUserId)) {
      return res.status(400).json({ error: "Cannot create chat with yourself" });
    }

    // Check if 1-on-1 conversation already exists
    let conv = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [currentUserId, targetUserId], $size: 2 }
    })
      .populate("participants", USER_FIELDS)
      .populate("lastMessage.sender", "username name");

    if (!conv) {
      conv = await Conversation.create({
        isGroup: false,
        participants: [currentUserId, targetUserId],
        unreadCounts: {
          [currentUserId]: 0,
          [targetUserId]: 0
        }
      });

      conv = await Conversation.findById(conv._id)
        .populate("participants", USER_FIELDS);
    }

    return res.status(200).json({ success: true, conversation: conv });
  } catch (error) {
    console.error("Create conversation error:", error);
    return res.status(500).json({ success: false, error: "Failed to initiate chat" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CREATE GROUP CHAT
// ─────────────────────────────────────────────────────────────────────────────
router.post("/group", verifyToken, async (req, res) => {
  try {
    const adminId = req.user.UserId;
    const { groupName, participantIds = [] } = req.body;

    if (!groupName || !groupName.trim()) {
      return res.status(400).json({ error: "Group name is required" });
    }

    // Unique participant IDs including the group admin
    const uniqueParticipants = Array.from(
      new Set([adminId, ...participantIds.filter((id) => mongoose.Types.ObjectId.isValid(id))])
    );

    if (uniqueParticipants.length < 2) {
      return res.status(400).json({ error: "Group must have at least 2 members" });
    }

    const unreadMap = {};
    uniqueParticipants.forEach((id) => {
      unreadMap[id] = 0;
    });

    const group = await Conversation.create({
      isGroup: true,
      groupName: groupName.trim().slice(0, 50),
      groupAdmins: [adminId],
      participants: uniqueParticipants,
      unreadCounts: unreadMap
    });

    const populated = await Conversation.findById(group._id)
      .populate("participants", USER_FIELDS)
      .populate("groupAdmins", USER_FIELDS);

    // Notify all participants via socket
    uniqueParticipants.forEach((userId) => {
      emitChatEvent(`user_${userId}`, "new_group_created", populated);
    });

    return res.status(201).json({ success: true, conversation: populated });
  } catch (error) {
    console.error("Create group error:", error);
    return res.status(500).json({ success: false, error: "Failed to create group" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET MESSAGES FOR A CONVERSATION
// ─────────────────────────────────────────────────────────────────────────────
router.get("/messages/:conversationId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation ID" });
    }

    // Verify user is a member of this conversation
    const conv = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    }).select("_id");

    if (!conv) {
      return res.status(403).json({ error: "Access denied to this conversation" });
    }

    const messages = await Message.find({
      conversationId,
      isDeleted: false
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("sender", USER_FIELDS)
      .populate({
        path: "replyTo",
        select: "encryptedText iv sender messageType linkPreview",
        populate: { path: "sender", select: "username name" }
      })
      .lean();

    // Reverse to return in chronological order (oldest to newest)
    return res.status(200).json({ success: true, messages: messages.reverse() });
  } catch (error) {
    console.error("Fetch messages error:", error);
    return res.status(500).json({ success: false, error: "Failed to load messages" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SEND MESSAGE (Zero-storage: Encrypted Text + Optional Rich Link)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/send", verifyToken, async (req, res) => {
  try {
    const senderId = req.user.UserId;
    const { conversationId, encryptedText, iv, messageType = "text", linkPreview = null, replyTo = null } = req.body;

    if (!conversationId || !encryptedText || !iv) {
      return res.status(400).json({ error: "conversationId, encryptedText and iv are required" });
    }

    // Verify conversation membership
    const conv = await Conversation.findOne({
      _id: conversationId,
      participants: senderId
    });

    if (!conv) {
      return res.status(403).json({ error: "Not a member of this chat" });
    }

    // Check if group restricts messaging to admins only
    if (conv.isGroup && conv.onlyAdminsCanMessage) {
      const isAdmin = conv.groupAdmins?.some((a) => a.toString() === senderId.toString());
      if (!isAdmin) {
        return res.status(403).json({ error: "Only admins are allowed to send messages in this group" });
      }
    }

    const message = await Message.create({
      conversationId,
      sender: senderId,
      encryptedText,
      iv,
      messageType: linkPreview?.url ? "link" : messageType,
      linkPreview: linkPreview || undefined,
      replyTo: replyTo && mongoose.Types.ObjectId.isValid(replyTo) ? replyTo : null,
      readBy: [senderId],
      deliveredTo: [senderId]
    });

    // Update conversation lastMessage & increment unread counts for others
    const unreadMap = conv.unreadCounts || new Map();
    conv.participants.forEach((pId) => {
      const pStr = pId.toString();
      if (pStr !== senderId.toString()) {
        const currentCount = unreadMap.get(pStr) || unreadMap[pStr] || 0;
        unreadMap.set(pStr, currentCount + 1);
      }
    });

    conv.lastMessage = {
      text: encryptedText.slice(0, 40),
      sender: senderId,
      createdAt: new Date(),
      messageType: linkPreview?.url ? "link" : messageType
    };
    conv.unreadCounts = unreadMap;
    await conv.save();

    const populated = await Message.findById(message._id)
      .populate("sender", USER_FIELDS)
      .populate({
        path: "replyTo",
        select: "encryptedText iv sender messageType linkPreview",
        populate: { path: "sender", select: "username name" }
      });

    // Broadcast live to the conversation room
    emitChatEvent(`conversation_${conversationId}`, "new_message", populated);

    // Also notify participants' personal rooms for inbox list updates
    conv.participants.forEach((pId) => {
      emitChatEvent(`user_${pId}`, "conversation_updated", {
        conversationId: conv._id,
        lastMessage: conv.lastMessage
      });
    });

    return res.status(201).json({ success: true, message: populated });
  } catch (error) {
    console.error("Send message error:", error);
    return res.status(500).json({ success: false, error: "Failed to send message" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. TOGGLE EMOJI REACTION ON MESSAGE
// ─────────────────────────────────────────────────────────────────────────────
router.post("/react", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { messageId, emoji } = req.body;

    if (!messageId || !emoji) {
      return res.status(400).json({ error: "messageId and emoji are required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const existingIndex = message.reactions.findIndex(
      (r) => r.user.toString() === userId.toString() && r.emoji === emoji
    );

    if (existingIndex > -1) {
      // Remove reaction if already toggled
      message.reactions.splice(existingIndex, 1);
    } else {
      // Add reaction
      message.reactions.push({ user: userId, emoji });
    }

    await message.save();

    emitChatEvent(`conversation_${message.conversationId}`, "message_reaction", {
      messageId: message._id,
      reactions: message.reactions
    });

    return res.status(200).json({ success: true, reactions: message.reactions });
  } catch (error) {
    console.error("React to message error:", error);
    return res.status(500).json({ success: false, error: "Reaction failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. MARK CONVERSATION AS READ
// ─────────────────────────────────────────────────────────────────────────────
router.post("/read/:conversationId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { conversationId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation ID" });
    }

    // Reset unread count for this user
    const conv = await Conversation.findById(conversationId);
    if (conv && conv.unreadCounts) {
      if (typeof conv.unreadCounts.set === "function") {
        conv.unreadCounts.set(userId.toString(), 0);
      } else {
        conv.unreadCounts[userId.toString()] = 0;
      }
      await conv.save();
    }

    // Update readBy on unread messages
    await Message.updateMany(
      { conversationId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    emitChatEvent(`conversation_${conversationId}`, "messages_read", {
      conversationId,
      readByUserId: userId
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Mark read error:", error);
    return res.status(500).json({ success: false, error: "Failed to mark as read" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. TOTAL UNREAD MESSAGES COUNT (For Navbar & Sidebar Badges)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/unread-count", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const conversations = await Conversation.find({
      participants: userId
    }).select("unreadCounts").lean();

    let totalUnread = 0;
    conversations.forEach((conv) => {
      if (conv.unreadCounts) {
        totalUnread += Number(conv.unreadCounts[userId] || 0);
      }
    });

    return res.status(200).json({ success: true, totalUnread, unreadCount: totalUnread });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. TOGGLE PIN CONVERSATION
// ─────────────────────────────────────────────────────────────────────────────
router.post("/pin/:conversationId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { conversationId } = req.params;

    const conv = await Conversation.findById(conversationId);
    if (!conv) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const index = conv.pinnedBy.findIndex((id) => id.toString() === userId.toString());
    const isPinned = index === -1;

    if (isPinned) {
      conv.pinnedBy.push(userId);
    } else {
      conv.pinnedBy.splice(index, 1);
    }

    await conv.save();
    return res.status(200).json({ success: true, isPinned });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. EDIT MESSAGE (Sender Only)
// ─────────────────────────────────────────────────────────────────────────────
router.put("/message/edit/:messageId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { messageId } = req.params;
    const { encryptedText, iv } = req.body;

    if (!encryptedText || !iv) {
      return res.status(400).json({ error: "encryptedText and iv are required" });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }

    if (message.isDeleted) {
      return res.status(400).json({ error: "Cannot edit a deleted message" });
    }

    message.encryptedText = encryptedText;
    message.iv = iv;
    message.isEdited = true;
    message.editedAt = new Date();
    await message.save();

    emitChatEvent(`conversation_${message.conversationId}`, "message_edited", {
      messageId: message._id,
      encryptedText: message.encryptedText,
      iv: message.iv,
      isEdited: true,
      editedAt: message.editedAt
    });

    return res.status(200).json({ success: true, message });
  } catch (error) {
    console.error("Edit message error:", error);
    return res.status(500).json({ success: false, error: "Failed to edit message" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. DELETE MESSAGE (Sender or Group Admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/message/delete/:messageId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    const conv = await Conversation.findById(message.conversationId);
    const isSender = message.sender.toString() === userId.toString();
    const isGroupAdmin = conv?.isGroup && conv.groupAdmins?.some((a) => a.toString() === userId.toString());

    if (!isSender && !isGroupAdmin) {
      return res.status(403).json({ error: "You do not have permission to delete this message" });
    }

    message.isDeleted = true;
    message.encryptedText = "";
    message.linkPreview = undefined;
    message.reactions = [];
    await message.save();

    emitChatEvent(`conversation_${message.conversationId}`, "message_deleted", {
      messageId: message._id,
      conversationId: message.conversationId
    });

    return res.status(200).json({ success: true, messageId: message._id });
  } catch (error) {
    console.error("Delete message error:", error);
    return res.status(500).json({ success: false, error: "Failed to delete message" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. UPDATE GROUP SETTINGS & PERMISSIONS (Admin or Allowed Members)
// ─────────────────────────────────────────────────────────────────────────────
router.put("/group/settings/:conversationId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { conversationId } = req.params;
    const { groupName, groupDescription, onlyAdminsCanMessage, onlyAdminsCanEditInfo } = req.body;

    const conv = await Conversation.findOne({
      _id: conversationId,
      isGroup: true,
      participants: userId
    });

    if (!conv) {
      return res.status(404).json({ error: "Group not found or not a member" });
    }

    const isAdmin = conv.groupAdmins?.some((a) => a.toString() === userId.toString());

    if (conv.onlyAdminsCanEditInfo && !isAdmin) {
      return res.status(403).json({ error: "Only admins can edit group settings" });
    }

    if (typeof groupName === "string" && groupName.trim()) {
      conv.groupName = groupName.trim();
    }
    if (typeof groupDescription === "string") {
      conv.groupDescription = groupDescription.trim();
    }

    // Only admins can change administration permission flags
    if (isAdmin) {
      if (typeof onlyAdminsCanMessage === "boolean") {
        conv.onlyAdminsCanMessage = onlyAdminsCanMessage;
      }
      if (typeof onlyAdminsCanEditInfo === "boolean") {
        conv.onlyAdminsCanEditInfo = onlyAdminsCanEditInfo;
      }
    }

    await conv.save();

    const updated = await Conversation.findById(conversationId)
      .populate("participants", USER_FIELDS)
      .populate("groupAdmins", USER_FIELDS);

    emitChatEvent(`conversation_${conversationId}`, "group_settings_updated", updated);

    return res.status(200).json({ success: true, conversation: updated });
  } catch (error) {
    console.error("Update group settings error:", error);
    return res.status(500).json({ success: false, error: "Failed to update group settings" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. ADD MEMBER TO GROUP
// ─────────────────────────────────────────────────────────────────────────────
router.post("/group/add-member/:conversationId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { conversationId } = req.params;
    const { newUserId } = req.body;

    if (!newUserId) {
      return res.status(400).json({ error: "newUserId is required" });
    }

    const conv = await Conversation.findOne({
      _id: conversationId,
      isGroup: true,
      participants: userId
    });

    if (!conv) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isAdmin = conv.groupAdmins?.some((a) => a.toString() === userId.toString());
    if (conv.onlyAdminsCanEditInfo && !isAdmin) {
      return res.status(403).json({ error: "Only admins can add members" });
    }

    const alreadyMember = conv.participants.some((p) => p.toString() === newUserId.toString());
    if (alreadyMember) {
      return res.status(400).json({ error: "User is already in this group" });
    }

    conv.participants.push(newUserId);
    await conv.save();

    const updated = await Conversation.findById(conversationId)
      .populate("participants", USER_FIELDS)
      .populate("groupAdmins", USER_FIELDS);

    emitChatEvent(`conversation_${conversationId}`, "group_settings_updated", updated);
    emitChatEvent(`user_${newUserId}`, "conversation_joined", updated);

    return res.status(200).json({ success: true, conversation: updated });
  } catch (error) {
    console.error("Add member error:", error);
    return res.status(500).json({ success: false, error: "Failed to add member" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. REMOVE MEMBER FROM GROUP (Admin Only)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/group/remove-member/:conversationId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { conversationId } = req.params;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: "targetUserId is required" });
    }

    const conv = await Conversation.findOne({
      _id: conversationId,
      isGroup: true,
      participants: userId
    });

    if (!conv) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isAdmin = conv.groupAdmins?.some((a) => a.toString() === userId.toString());
    if (!isAdmin) {
      return res.status(403).json({ error: "Only group admins can remove members" });
    }

    conv.participants = conv.participants.filter((p) => p.toString() !== targetUserId.toString());
    conv.groupAdmins = conv.groupAdmins.filter((a) => a.toString() !== targetUserId.toString());
    await conv.save();

    const updated = await Conversation.findById(conversationId)
      .populate("participants", USER_FIELDS)
      .populate("groupAdmins", USER_FIELDS);

    emitChatEvent(`conversation_${conversationId}`, "group_settings_updated", updated);
    emitChatEvent(`user_${targetUserId}`, "group_removed", { conversationId });

    return res.status(200).json({ success: true, conversation: updated });
  } catch (error) {
    console.error("Remove member error:", error);
    return res.status(500).json({ success: false, error: "Failed to remove member" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. PROMOTE / DEMOTE ADMIN (Admin Only)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/group/toggle-admin/:conversationId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { conversationId } = req.params;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: "targetUserId is required" });
    }

    const conv = await Conversation.findOne({
      _id: conversationId,
      isGroup: true,
      participants: userId
    });

    if (!conv) {
      return res.status(404).json({ error: "Group not found" });
    }

    const isAdmin = conv.groupAdmins?.some((a) => a.toString() === userId.toString());
    if (!isAdmin) {
      return res.status(403).json({ error: "Only admins can change admin roles" });
    }

    const index = conv.groupAdmins.findIndex((a) => a.toString() === targetUserId.toString());
    if (index > -1) {
      if (conv.groupAdmins.length <= 1) {
        return res.status(400).json({ error: "Group must have at least one admin" });
      }
      conv.groupAdmins.splice(index, 1);
    } else {
      conv.groupAdmins.push(targetUserId);
    }

    await conv.save();

    const updated = await Conversation.findById(conversationId)
      .populate("participants", USER_FIELDS)
      .populate("groupAdmins", USER_FIELDS);

    emitChatEvent(`conversation_${conversationId}`, "group_settings_updated", updated);

    return res.status(200).json({ success: true, conversation: updated });
  } catch (error) {
    console.error("Toggle admin error:", error);
    return res.status(500).json({ success: false, error: "Failed to update admin role" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. LEAVE GROUP
// ─────────────────────────────────────────────────────────────────────────────
router.post("/group/leave/:conversationId", verifyToken, async (req, res) => {
  try {
    const userId = req.user.UserId;
    const { conversationId } = req.params;

    const conv = await Conversation.findOne({
      _id: conversationId,
      isGroup: true,
      participants: userId
    });

    if (!conv) {
      return res.status(404).json({ error: "Group not found" });
    }

    conv.participants = conv.participants.filter((p) => p.toString() !== userId.toString());
    conv.groupAdmins = conv.groupAdmins.filter((a) => a.toString() !== userId.toString());

    if (conv.groupAdmins.length === 0 && conv.participants.length > 0) {
      conv.groupAdmins.push(conv.participants[0]);
    }

    await conv.save();

    const updated = await Conversation.findById(conversationId)
      .populate("participants", USER_FIELDS)
      .populate("groupAdmins", USER_FIELDS);

    emitChatEvent(`conversation_${conversationId}`, "group_settings_updated", updated);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Leave group error:", error);
    return res.status(500).json({ success: false, error: "Failed to leave group" });
  }
});

module.exports = router;
