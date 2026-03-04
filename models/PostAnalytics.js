const { Schema, model } = require("../connection");

const PostAnalyticsSchema = new Schema({
  postId: {
    type: Schema.Types.ObjectId,
    ref: "Post",
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  ip: String,
  userAgent: String
});

PostAnalyticsSchema.index({ postId: 1, timestamp: -1 });

module.exports = model("PostAnalytics", PostAnalyticsSchema);
