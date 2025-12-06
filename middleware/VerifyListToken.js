// verifyToken

require("dotenv").config();
 
function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Login required" });

    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    

    console.log("JWT SECRET = ", process.env.JWT_SECRET);

    next();

  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
    console.log(err);
  }
}

// Admin middleware
function isAdmin(req, res, next) {
  if (req.user.role !== "admin")
    return res.status(403).json({ error: "Admin only" });
  next();
}

module.exports = { verifyToken, isAdmin };
