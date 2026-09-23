const { Schema, model } = require("../connection");

const NotificationSchema = new Schema({
  recipient: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
  additionalSenders: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  count: { type: Number, default: 1 },
  type: { 
    type: String, 
    enum: ["like", "comment", "follow", "repost", "mention"], 
    required: true 
  },
  post: { type: Schema.Types.ObjectId, ref: "Post", default: null },
  commentText: { type: String, default: "" },
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = model("Notification", NotificationSchema);
