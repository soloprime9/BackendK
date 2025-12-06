const express = require("express");
const router = express.Router();

const Report = require("../models/Report");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ CREATE A REPORT (USER ONLY)
// -----------------------------------------
router.post("/create", verifyToken, async (req, res) => {
  try {
    const { productId, reason, message } = req.body;
    if (!productId || !reason) return res.status(400).json({ error: "Product and reason are required" });

    const report = new Report({
      product: productId,
      user: req.user._id,
      reason,
      message: message || ""
    });

    await report.save();
    res.json({ success: true, message: "Report submitted", report });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

// -----------------------------------------
// ⭐ GET ALL REPORTS (ADMIN ONLY)
// -----------------------------------------
router.get("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("product", "title slug thumbnail")
      .populate("user", "username email");
    res.json(reports);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
});

// -----------------------------------------
// ⭐ DELETE REPORT (ADMIN ONLY)
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const report = await Report.findByIdAndDelete(req.params.id);
    if (!report) return res.status(404).json({ error: "Report not found" });

    res.json({ success: true, message: "Report deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

module.exports = router;
