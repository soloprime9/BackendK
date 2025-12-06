const { Schema, model } = require("../connection");

const AnalyticsSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    searchAppearances: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Analytics", AnalyticsSchema);
