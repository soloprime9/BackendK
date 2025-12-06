const { Schema, model } = require("../connection");

const BookmarkSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: "User" },
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Bookmark", BookmarkSchema);
