const { Schema, model } = require("../connectionList");

const BadgeSchema = new Schema({
    name: String, // "Trending", "New", "Verified"
    icon: String,
    color: String
});

module.exports = model("Badge", BadgeSchema);

