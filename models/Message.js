const { Schema, model } = require("../connection");

const MessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    // 🔐 End-To-End Encrypted Content (AES-256-GCM Ciphertext)
    encryptedText: {
      type: String,
      required: true
    },
    // Initialization Vector (IV) required for AES-GCM decryption
    iv: {
      type: String,
      required: true
    },
    messageType: {
      type: String,
      enum: ["text", "link"],
      default: "text"
    },
    // Optional zero-storage link preview (YouTube, article, blog, fondpeace link)
    linkPreview: {
      url: { type: String, default: "" },
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      image: { type: String, default: "" },
      siteName: { type: String, default: "" },
      favicon: { type: String, default: "" }
    },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },
    reactions: [
      {
        user: { type: Schema.Types.ObjectId, ref: "User" },
        emoji: { type: String, required: true }
      }
    ],
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User"
      }
    ],
    isDeleted: {
      type: Boolean,
      default: false
    },
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// Index to quickly fetch chronologically sorted messages
MessageSchema.index({ conversationId: 1, createdAt: 1 });

module.exports = model("Message", MessageSchema);
