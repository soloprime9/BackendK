const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  let token = req.header("x-auth-token") || req.header("authorization");

  if (!token) {
    return res.status(401).json({ message: "Token required" });
  }

  if (token.startsWith("Bearer ") || token.startsWith("bearer ")) {
    token = token.slice(7).trim();
  }

  try {
    const secret = process.env.JWT_SECRET || "fondpeace_jwt_secret_key_2026";
    const decoded = jwt.verify(token, secret);
    req.user = decoded; // { UserId }
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = verifyToken;
