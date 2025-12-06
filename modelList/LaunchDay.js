const { Schema, model } = require("../connection");

const LaunchDaySchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    scheduledDate: Date,
    rank: Number,
    votes: Number
});

module.exports = model("LaunchDay", LaunchDaySchema);
