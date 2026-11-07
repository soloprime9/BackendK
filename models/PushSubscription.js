const { Schema, model } = require("../connection");

const PushSubscriptionSchema = new Schema({
  endpoint: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    default: null, 
    index: true 
  },
  isGuest: { 
    type: Boolean, 
    default: false,
    index: true
  },
  userAgent: { 
    type: String, 
    default: "" 
  },
  subscribedTopics: [{ 
    type: String, 
    trim: true 
  }],
  isActive: { 
    type: Boolean, 
    default: true,
    index: true
  },
  lastActive: { 
    type: Date, 
    default: Date.now 
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  }
});

module.exports = model("PushSubscription", PushSubscriptionSchema);
