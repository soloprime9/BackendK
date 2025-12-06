const { Schema, model } = require("../connection");

const FollowSchema = new Schema({
    follower: { type: Schema.Types.ObjectId, ref: "User" },
    following: { type: Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Follow", FollowSchema);
