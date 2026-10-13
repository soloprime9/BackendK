const { Schema, model } = require("../connection");

const ConversationSchema = new Schema(
  {
    isGroup: { 
      type: Boolean, 
      default: false 
    },
    groupName: { 
      type: String, 
      default: "" 
    },
    groupDescription: {
      type: String,
      default: ""
    },
    groupAvatar: { 
      type: String, 
      default: "" 
    },
    onlyAdminsCanMessage: {
      type: Boolean,
      default: false
    },
    onlyAdminsCanEditInfo: {
      type: Boolean,
      default: true
    },
    groupAdmins: [
      { 
        type: Schema.Types.ObjectId, 
        ref: "User" 
      }
    ],
    participants: [
      { 
        type: Schema.Types.ObjectId, 
        ref: "User", 
        required: true 
      }
    ],
    lastMessage: {
      text: { type: String, default: "" }, // Encrypted snippet
      sender: { type: Schema.Types.ObjectId, ref: "User" },
      createdAt: { type: Date, default: Date.now },
      messageType: { type: String, default: "text" }
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {}
    },
    pinnedBy: [
      { 
        type: Schema.Types.ObjectId, 
        ref: "User" 
      }
    ]
  },
  { timestamps: true }
);

// Index to quickly find user's conversations
ConversationSchema.index({ participants: 1, updatedAt: -1 });

module.exports = model("Conversation", ConversationSchema);
