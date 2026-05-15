const express = require("express");

const router = express.Router();

const PwaAnalytics =
require("../models/PwaAnalytics");



// ============================
// TRACK EVENT
// ============================

router.post("/track", async (req, res) => {

  try {

    const {
      type,
      browser,
      device,
      os,
    } = req.body;

    await PwaAnalytics.create({
      type,
      browser,
      device,
      os,
    });

    res.status(200).json({
      success: true,
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
});



// ============================
// GET ANALYTICS
// ============================

router.get("/stats", async (req, res) => {

  try {

    // TOTAL INSTALLS
    const totalInstalls =
      await PwaAnalytics.countDocuments({
        type: "installed",
      });

    // TODAY INSTALLS
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    const todayInstalls =
      await PwaAnalytics.countDocuments({
        type: "installed",

        createdAt: {
          $gte: today,
        },
      });

    // POPUP SHOWN
    const popupShown =
      await PwaAnalytics.countDocuments({
        type: "popup_shown",
      });

    // INSTALL CLICKS
    const installClicks =
      await PwaAnalytics.countDocuments({
        type: "install_clicked",
      });

    // ACTIVE USERS
    const activeUsers =
      await PwaAnalytics.countDocuments({
        type: "active_user",
      });

    // CONVERSION RATE
    const conversionRate =
      popupShown > 0
        ? (
            (totalInstalls /
              popupShown) *
            100
          ).toFixed(2)
        : 0;

    // TOP DEVICES
    const topDevices =
      await PwaAnalytics.aggregate([
        {
          $match: {
            type: "installed",
          },
        },

        {
          $group: {
            _id: "$device",

            count: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            count: -1,
          },
        },
      ]);

    res.json({
      success: true,

      totalInstalls,
      todayInstalls,
      popupShown,
      installClicks,
      activeUsers,
      conversionRate,
      topDevices,
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
});

module.exports = router;
