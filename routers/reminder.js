const express = require("express");
const router = express.Router();
const Reminder = require("../models/Reminder");
// Assuming you have an auth middleware to get req.user.id
// const auth = require("../middleware/auth"); 

/**
 * @route   POST /api/reminders
 * @desc    Create an advanced reminder
 */
router.post("/", async (req, res) => {
  try {
    const { 
        title, description, dueDate, priority, 
        checklist, location, recurrence, pushToken 
    } = req.body;

    const reminder = new Reminder({
      userId: req.body.userId, // Replace with req.user.id in production
      title,
      description,
      checklist, // Array of objects { text, isCompleted }
      scheduling: {
        dueDate,
        priority: priority || 'medium',
      },
      recurrence,
      locationTrigger: location ? {
        enabled: true,
        address: location.address,
        coords: {
          type: "Point",
          coordinates: [location.lng, location.lat] // GeoJSON: Longitude first
        },
        radius: location.radius || 100
      } : undefined,
      pushToken
    });

    await reminder.save();
    res.status(201).json({ success: true, data: reminder });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/reminders
 * @desc    Get all active reminders for a user with filters
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const { status, priority } = req.query;
    let query = { userId: req.params.userId, status: status || 'pending' };
    
    if (priority) query["scheduling.priority"] = priority;

    const reminders = await Reminder.find(query)
      .sort({ "scheduling.dueDate": 1 })
      .lean();

    res.json({ success: true, count: reminders.length, data: reminders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PATCH /api/reminders/:id/snooze
 * @desc    Advanced Smart Snooze (Increments count and pushes date)
 */
router.patch("/:id/snooze", async (req, res) => {
  try {
    const { minutes } = req.body; // How long to snooze
    const reminder = await Reminder.findById(req.params.id);

    if (!reminder) return res.status(404).json({ message: "Not found" });

    const newDate = new Date(Date.now() + minutes * 60000);
    
    reminder.scheduling.dueDate = newDate;
    reminder.scheduling.lastSnoozedAt = new Date();
    reminder.scheduling.snoozeCount += 1;
    reminder.status = 'pending';

    await reminder.save();
    res.json({ success: true, nextTrigger: newDate, snoozeCount: reminder.scheduling.snoozeCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PATCH /api/reminders/:id/checklist
 * @desc    Toggle a specific sub-task in the checklist
 */
router.patch("/:id/checklist", async (req, res) => {
  try {
    const { itemId, isCompleted } = req.body;
    
    const reminder = await Reminder.findOneAndUpdate(
      { _id: req.params.id, "checklist._id": itemId },
      { $set: { "checklist.$.isCompleted": isCompleted } },
      { new: true }
    );

    res.json({ success: true, data: reminder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/reminders/nearby
 * @desc    Geo-spatial query to find reminders near current GPS
 */
router.get("/nearby", async (req, res) => {
  try {
    const { lng, lat, userId } = req.query;

    const nearbyReminders = await Reminder.find({
      userId,
      status: 'pending',
      "locationTrigger.enabled": true,
      "locationTrigger.coords": {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: 500 // 500 meters
        }
      }
    });

    res.json({ success: true, data: nearbyReminders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   PUT /api/reminders/:id/complete
 * @desc    Mark as complete or handle recurrence
 */
router.put("/:id/complete", async (req, res) => {
    try {
      const reminder = await Reminder.findById(req.params.id);
      
      if (reminder.recurrence.isRecurring) {
          // Logic: Calculate next date based on frequency (Daily, Weekly, etc)
          // For demo: Add 1 day
          let nextDate = new Date(reminder.scheduling.dueDate);
          nextDate.setDate(nextDate.getDate() + 1);
          
          reminder.scheduling.dueDate = nextDate;
          // Keep status as pending because it's recurring
      } else {
          reminder.status = 'completed';
      }
  
      await reminder.save();
      res.json({ success: true, data: reminder });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

module.exports = router;
