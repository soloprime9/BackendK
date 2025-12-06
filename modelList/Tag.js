const { Schema, model } = require("../connection");

const TagSchema = new Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true }
});

module.exports = model("Tag", TagSchema);
