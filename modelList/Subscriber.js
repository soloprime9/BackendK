const { Schema, model } = require("../connectionList");

const SubscriberSchema = new Schema({
    email: { type: String, unique: true },
    subscribedAt: { type: Date, default: Date.now }
});

module.exports = model("Subscriber", SubscriberSchema);

