const rateLimit = require("express-rate-limit");

/**
 * 🛡️ Dedicated rate limiter for sensitive authentication endpoints
 * (login, signup/add, password reset, OTP verification)
 * Limits brute-force password guessing & automated credential stuffing.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: 30, // 30 attempts per 15 minutes per IP
  standardHeaders: true, // Return RateLimit-* headers in response
  legacyHeaders: false, // Disable X-RateLimit-* headers
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: "Too many authentication attempts from this IP address. Please try again after 15 minutes.",
  },
});

/**
 * ⚡ General rate limiter for API endpoints to prevent abusive bursts and scrapers
 */
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1-minute window
  max: 300, // 300 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Rate limit exceeded. Please slow down your requests.",
  },
});

module.exports = {
  authLimiter,
  apiLimiter,
};
