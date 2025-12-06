const express = require("express");
const router = express.Router();

const LaunchDay = require("../models/LaunchDay");
const { verifyToken, isAdmin } = require("../middlewares/VerifyToken");

// -----------------------------------------
// ⭐ SCHEDULE A LAUNCH (ADMIN ONLY)
// -----------------------------------------
router.post("/create", verifyToken, isAdmin, async (req, res) => {
  try {
    const { productId, scheduledDate, rank, votes } = req.body;
    if (!productId || !scheduledDate) return res.status(400).json({ error: "Product and scheduled date are required" });

    const launch = new LaunchDay({
      product: productId,
      scheduledDate,
      rank: rank || 0,
      votes: votes || 0
    });

    await launch.save();
    res.json({ success: true, message: "Launch scheduled", launch });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to schedule launch" });
  }
});

// -----------------------------------------
// ⭐ GET ALL LAUNCHES
// -----------------------------------------
router.get("/", async (req, res) => {
  try {
    const launches = await LaunchDay.find().populate("product", "title slug thumbnail").sort({ scheduledDate: 1 });
    res.json(launches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch launches" });
  }
});

// -----------------------------------------
// ⭐ GET LAUNCHES BY DATE
// -----------------------------------------
router.get("/date/:date", async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const launches = await LaunchDay.find({ scheduledDate: date }).populate("product", "title slug thumbnail");
    res.json(launches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch launches by date" });
  }
});

// -----------------------------------------
// ⭐ UPDATE LAUNCH (ADMIN ONLY)
// -----------------------------------------
router.put("/update/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const launch = await LaunchDay.findById(req.params.id);
    if (!launch) return res.status(404).json({ error: "Launch not found" });

    const { scheduledDate, rank, votes } = req.body;
    if (scheduledDate) launch.scheduledDate = scheduledDate;
    if (rank !== undefined) launch.rank = rank;
    if (votes !== undefined) launch.votes = votes;

    await launch.save();
    res.json({ success: true, message: "Launch updated", launch });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update launch" });
  }
});

// -----------------------------------------
// ⭐ DELETE LAUNCH (ADMIN ONLY)
// -----------------------------------------
router.delete("/delete/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const launch = await LaunchDay.findByIdAndDelete(req.params.id);
    if (!launch) return res.status(404).json({ error: "Launch not found" });

    res.json({ success: true, message: "Launch deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete launch" });
  }
});

module.exports = router;
