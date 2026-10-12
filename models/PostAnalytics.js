const { Schema, model } = require("../connection");

const PostAnalyticsSchema = new Schema({
  postId: {
    type: Schema.Types.ObjectId,
    ref: "Post",
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true,
  },
  ip: {
    type: String,
    default: "0.0.0.0",
    index: true,
  },
  country: {
    type: String,
    default: "Unknown",
  },
  city: {
    type: String,
    default: "Unknown",
  },
  region: {
    type: String,
    default: "",
  },
  userAgent: {
    type: String,
    default: "Unknown",
  },
  deviceType: {
    type: String,
    enum: ["mobile", "tablet", "desktop", "bot", "unknown"],
    default: "unknown",
  },
  screenResolution: {
    type: String,
    default: "",
  },
  watchDuration: {
    type: Number,
    default: 0,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  isShort: {
    type: Boolean,
    default: false,
  },
  source: {
    type: String,
    default: "feed",
  },
  path: {
    type: String,
    default: "/",
    index: true,
  },
  action: {
    type: String,
    default: "page_view",
    index: true,
  },
  referrer: {
    type: String,
    default: "",
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

PostAnalyticsSchema.index({ postId: 1, timestamp: -1 });
PostAnalyticsSchema.index({ userId: 1, timestamp: -1 });
PostAnalyticsSchema.index({ ip: 1, timestamp: -1 });
PostAnalyticsSchema.index({ path: 1, timestamp: -1 });
PostAnalyticsSchema.index({ action: 1, timestamp: -1 });

module.exports = model("PostAnalytics", PostAnalyticsSchema);
