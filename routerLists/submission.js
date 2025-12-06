const express = require("express");
const router = express.Router();

const Submission = require("../models/Submission");
const Product = require("../models/Product");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -------------------------------
// ⭐ USER SUBMITS A PRODUCT
// -------------------------------
router.post("/submit", verifyToken, async (req, res) => {
  try {
    const user = req.user; // user from middleware
    const data = req.body;

    const submission = new Submission({
      ...data,
      submitter: user ? user._id : null,
      status: user.role === "admin" ? "approved" : "pending", 
    });

    await submission.save();

    // If admin → auto create Product
    if (user.role === "admin") {
      const product = new Product({
        title: submission.name,
        slug: submission.name.toLowerCase().replace(/\s+/g, "-"),
        description: submission.tagline || "",
        thumbnail: submission.logo,
        gallery: submission.images,
        websiteUrl: submission.website,
        createdBy: user._id,
        status: "published"
      });

      await product.save();

      submission.product = product._id;
      await submission.save();
    }

    res.json({
      success: true,
      message: user.role === "admin"
        ? "Approved automatically (admin submitted)"
        : "Submitted successfully. Awaiting approval.",
      submission,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Submission failed" });
  }
});

// -------------------------------
// ⭐ ADMIN: APPROVE SUBMISSION
// -------------------------------
router.put("/approve/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ error: "Not found" });

    if (submission.status === "approved") {
      return res.json({ message: "Already approved", submission });
    }

    // Create product from submission
    const product = new Product({
      title: submission.name,
      slug: submission.name.toLowerCase().replace(/\s+/g, "-"),
      description: submission.tagline || "",
      thumbnail: submission.logo,
      gallery: submission.images,
      websiteUrl: submission.website,
      status: "published",
      createdBy: submission.submitter || null,
    });

    await product.save();

    submission.status = "approved";
    submission.product = product._id;
    await submission.save();

    res.json({ success: true, message: "Submission approved", submission });

  } catch (err) {
    res.status(500).json({ error: "Approval failed" });
  }
});

// -------------------------------
// ⭐ ADMIN: REJECT SUBMISSION
// -------------------------------
router.put("/reject/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ error: "Not found" });

    submission.status = "rejected";
    submission.adminNotes = req.body.adminNotes || "";

    await submission.save();

    res.json({ success: true, message: "Submission rejected", submission });
  } catch (err) {
    res.status(500).json({ error: "Reject failed" });
  }
});

// -------------------------------
// ⭐ ADMIN: GET ALL SUBMISSIONS
// -------------------------------
router.get("/all", verifyToken, isAdmin, async (req, res) => {
  try {
    const submissions = await Submission.find().sort({ createdAt: -1 });
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: "Cannot fetch submissions" });
  }
});

// -------------------------------
// ⭐ USER: GET MY SUBMISSIONS
// -------------------------------
router.get("/my", verifyToken, async (req, res) => {
  try {
    const mySubs = await Submission.find({ submitter: req.user._id })
      .sort({ createdAt: -1 });

    res.json(mySubs);
  } catch (err) {
    res.status(500).json({ error: "Cannot fetch my submissions" });
  }
});

module.exports = router;
