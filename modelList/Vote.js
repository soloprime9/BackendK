const { Schema, model } = require("../connection");

const VoteSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    user: { type: Schema.Types.ObjectId, ref: "User" }, // optional, can be IP-based
    userIp: String, // for anonymous votes
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Vote", VoteSchema);
