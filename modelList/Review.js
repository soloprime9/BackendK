const { Schema, model } = require("../connection");

const ReviewSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    rating: { type: Number, min: 1, max: 5 },
    title: String,
    review: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Review", ReviewSchema);
