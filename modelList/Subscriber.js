const { Schema, model } = require("../connection");

const SubscriberSchema = new Schema({
    email: { type: String, unique: true },
    subscribedAt: { type: Date, default: Date.now }
});

module.exports = model("Subscriber", SubscriberSchema);
