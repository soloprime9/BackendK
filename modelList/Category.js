const { Schema, model } = require("../connection");

const CategorySchema = new Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    icon: String,
    description: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Category", CategorySchema);
