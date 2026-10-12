const mongoose = require("mongoose");
const PostAnalytics = require("../models/PostAnalytics");
const { getIO } = require("../socket");

// Helper: Extract rich client telemetry (IP, Country, City, Region, Device, User-Agent) passively
function extractClientTelemetry(req) {
  if (!req) return { ip: "0.0.0.0", country: "Unknown", city: "Unknown", region: "", userAgent: "Unknown", deviceType: "unknown" };

  const forwardedFor = req.headers ? req.headers["x-forwarded-for"] : null;
  const ip = (
    (req.headers && req.headers["cf-connecting-ip"]) ||
    (req.headers && req.headers["x-real-ip"]) ||
    (forwardedFor ? forwardedFor.split(",")[0].trim() : null) ||
    req.socket?.remoteAddress ||
    "0.0.0.0"
  ).replace(/^::ffff:/, "");

  const country =
    (req.headers && (req.headers["cf-ipcountry"] || req.headers["x-vercel-ip-country"] || req.headers["x-country"])) ||
    "Unknown";

  const city =
    (req.headers && (req.headers["cf-ipcity"] || req.headers["x-vercel-ip-city"] || req.headers["x-city"])) ||
    "Unknown";

  const region =
    (req.headers && (req.headers["x-vercel-ip-country-region"] || req.headers["cf-region"])) ||
    "";

  const userAgent = (req.headers && req.headers["user-agent"]) || "Unknown";

  let deviceType = "desktop";
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(userAgent)) {
    deviceType = "mobile";
  } else if (/ipad|tablet/i.test(userAgent)) {
    deviceType = "tablet";
  } else if (/bot|crawler|spider|googlebot|bingbot/i.test(userAgent)) {
    deviceType = "bot";
  }

  return { ip, country, city, region, userAgent, deviceType };
}

// Global passive activity logger (Non-blocking, never fails parent request)
async function recordActivity({
  req,
  userId = null,
  postId = null,
  path = "/",
  action = "page_view",
  referrer = "",
  screen = "",
  duration = 0,
  completed = false,
  isShort = false,
  metadata = {},
  source = "platform",
}) {
  try {
    const telemetry = extractClientTelemetry(req);

    const logEntry = new PostAnalytics({
      postId: postId && mongoose.Types.ObjectId.isValid(postId) ? postId : null,
      userId: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null,
      ip: telemetry.ip,
      country: telemetry.country,
      city: telemetry.city,
      region: telemetry.region,
      userAgent: telemetry.userAgent,
      deviceType: telemetry.deviceType,
      screenResolution: screen || "",
      path: String(path || "/").slice(0, 255),
      action: String(action || "page_view").slice(0, 50),
      referrer: String(referrer || "").slice(0, 500),
      watchDuration: Number(duration) || 0,
      completed: Boolean(completed),
      isShort: Boolean(isShort || (path && path.startsWith("/short"))),
      metadata: typeof metadata === "object" ? metadata : {},
      source: source || "platform",
      timestamp: new Date(),
    });

    await logEntry.save();

    // Broadcast live to Admin dashboard
    try {
      const io = getIO();
      if (io) {
        io.emit("newActivityGlobal", {
          _id: logEntry._id,
          ip: telemetry.ip,
          country: telemetry.country,
          city: telemetry.city,
          path: logEntry.path,
          action: logEntry.action,
          deviceType: telemetry.deviceType,
          timestamp: logEntry.timestamp,
        });
      }
    } catch (_) {}

    return logEntry;
  } catch (err) {
    console.error("[Telemetry] Failed to record activity:", err?.message);
    return null;
  }
}

module.exports = {
  extractClientTelemetry,
  recordActivity,
};
