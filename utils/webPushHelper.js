const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "BB5Q16oeAgiqmWG_sNfGlwqkZ9wtRQyOhQFykrPozxNzeSw6jIHJ_7052G3oVV_RZlueBftUzWp86WZpk4AP3gA";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "OHtBXoyAlOL7cmDIin0tENkTdeqqwS4zXF_i6Chwohc";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:support@fondpeace.com";

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (err) {
  console.warn("VAPID setup warning:", err.message);
}

function getPublicKey() {
  return VAPID_PUBLIC_KEY;
}

/**
 * Save or update push subscription for logged-in or guest users
 */
async function saveSubscription({ subscription, userId = null, isGuest = false, userAgent = "" }) {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new Error("Invalid push subscription object");
  }

  const updateData = {
    keys: subscription.keys,
    userAgent: userAgent || "",
    isActive: true,
    lastActive: new Date()
  };

  if (userId) {
    updateData.userId = userId;
    updateData.isGuest = false;
  } else {
    updateData.isGuest = true;
  }

  const record = await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { $set: updateData },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return record;
}

/**
 * Send Web Push to all devices belonging to a specific user
 */
async function sendPushToUser(userId, payload) {
  if (!userId) return { success: false, reason: "No userId provided" };

  try {
    const subscriptions = await PushSubscription.find({
      userId,
      isActive: true
    }).limit(10);

    if (!subscriptions || subscriptions.length === 0) {
      return { success: true, sent: 0, reason: "No active push subscriptions" };
    }

    const payloadString = typeof payload === "string" ? payload : JSON.stringify(payload);
    let sentCount = 0;

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys
            },
            payloadString
          );
          sentCount++;
        } catch (err) {
          // If 410 Gone or 404 Not Found, browser subscription expired or revoked
          if (err.statusCode === 410 || err.statusCode === 404) {
            await PushSubscription.updateOne(
              { _id: sub._id },
              { $set: { isActive: false } }
            );
          }
        }
      })
    );

    return { success: true, sent: sentCount };
  } catch (err) {
    console.error("sendPushToUser error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Broadcast notification to all active devices (supports guests and logged-in)
 */
async function broadcastPush(payload, { isGuestOnly = false, limit = 500 } = {}) {
  try {
    const filter = { isActive: true };
    if (isGuestOnly) filter.isGuest = true;

    const subscriptions = await PushSubscription.find(filter)
      .sort({ lastActive: -1 })
      .limit(limit);

    const payloadString = typeof payload === "string" ? payload : JSON.stringify(payload);
    let sentCount = 0;

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: sub.keys
            },
            payloadString
          );
          sentCount++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await PushSubscription.updateOne(
              { _id: sub._id },
              { $set: { isActive: false } }
            );
          }
        }
      })
    );

    return { success: true, sent: sentCount, total: subscriptions.length };
  } catch (err) {
    console.error("broadcastPush error:", err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  getPublicKey,
  saveSubscription,
  sendPushToUser,
  broadcastPush
};
