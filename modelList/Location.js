const { Schema, model } = require("../connectionList");

const LocationSchema = new Schema({
    country: String,
    state: String,
    city: String,
    coordinates: {
        lat: Number,
        lng: Number
    }
});

module.exports = model("Location", LocationSchema);

