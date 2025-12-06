const { Schema, model } = require("../connection");

const NotificationSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: "User" },
    message: String,
    read: { type: Boolean, default: false },
    link: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Notification", NotificationSchema);
