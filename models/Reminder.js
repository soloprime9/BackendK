const { Schema, model } = require("../connection");

const ReminderSchema = new Schema({
  // 1. User & Ownership
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  
  // 2. Core Content
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 2000 },
  
  // 3. Sub-tasks (Advanced Checklist Feature)
  checklist: [{
    text: String,
    isCompleted: { type: Boolean, default: false }
  }],

  // 4. Media Attachments (For Voice Reminders or Photos)
  attachments: [{
    fileUrl: String,
    fileType: { type: String, enum: ['image', 'audio', 'pdf'] }
  }],

  // 5. Advanced Scheduling & Smart Snooze
  scheduling: {
    dueDate: { type: Date, required: true, index: true },
    timezone: { type: String, default: "UTC" },
    lastSnoozedAt: Date,
    snoozeCount: { type: Number, default: 0 },
    priority: { 
      type: String, 
      enum: ['low', 'medium', 'high', 'critical'], 
      default: 'medium' 
    }
  },

  // 6. Intelligent Recurrence (RRule Standard)
  recurrence: {
    isRecurring: { type: Boolean, default: false },
    frequency: { type: String, enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'] },
    interval: { type: Number, default: 1 }, // e.g., every "2" weeks
    daysOfWeek: [Number], // 0-6 (Sunday-Saturday)
    endDate: Date
  },

  // 7. Advanced Location Trigger (Geo-fencing)
  // Uses MongoDB 2dsphere index for "Remind me when I'm near"
  locationTrigger: {
    enabled: { type: Boolean, default: false },
    address: String,
    coords: {
      type: { type: String, default: "Point" },
      coordinates: [Number] // [longitude, latitude]
    },
    radius: { type: Number, default: 100 }, // Meters
    triggerCondition: { type: String, enum: ['onArrival', 'onDeparture'] }
  },

  // 8. System & Metadata
  status: { 
    type: String, 
    enum: ['pending', 'completed', 'archived', 'deleted'], 
    default: 'pending' 
  },
  pushToken: String, // The device ID to send the notification to
  
  // 9. AI Assistance (Predictive Analysis)
  aiMetadata: {
    suggestedTime: Date,
    categoryTag: String, // e.g., "Health", "Work", "Finance"
    sentimentScore: Number // Detects if the task is urgent/stressful
  }

}, { 
  timestamps: true // Automatically adds createdAt and updatedAt
});

// Indexes for high-performance searching
ReminderSchema.index({ "locationTrigger.coords": "2dsphere" });
ReminderSchema.index({ "scheduling.dueDate": 1, "status": 1 });

module.exports = model("Reminder", ReminderSchema);
