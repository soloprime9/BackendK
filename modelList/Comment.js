const { Schema, model } = require("../connection");

const CommentSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    user: { type: Schema.Types.ObjectId, ref: "User" }, // optional
    name: String, // for public comments without signup
    message: String,
    replies: [
        {
            user: { type: Schema.Types.ObjectId, ref: "User" },
            name: String,
            message: String,
            createdAt: { type: Date, default: Date.now }
        }
    ],
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Comment", CommentSchema);
