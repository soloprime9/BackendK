const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { verifyToken } = require("../middlewares/VerifyToken");

const router = express.Router();
require("dotenv").config();

// SECRET KEY (change in production)
const SECRET = process.env.JWT_SECRET;

// -----------------------------------------------------
// REGISTER — FIRST USER = ADMIN
// -----------------------------------------------------
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if email already exists
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // Check how many users are present
    const userCount = await User.countDocuments();

    // ⭐ FIRST USER = ADMIN ⭐
    const role = userCount === 0 ? "admin" : "user";

    // Password hash
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role,
    });

    res.json({
      success: true,
      message: `Account created as ${role}`,
      user,
    });
  } catch (error) {
    res.status(500).json({ message: "Register error", error });
  }
});

// -----------------------------------------------------
// LOGIN
// -----------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "User not found" });

    // Password check
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Wrong password" });

    // Create token
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
      },
      SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user,
    });
    console.log("Token: ", token);
  } catch (error) {
    res.status(500).json({ message: "Login error", error });
  }
});

// -----------------------------------------------------
// AUTH MIDDLEWARE
// -----------------------------------------------------

// -----------------------------------------------------
// GET LOGGED-IN USER (PROFILE)
// -----------------------------------------------------
router.get("/me", verifyToken, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json(user);
});

module.exports = router;
