const { Schema, model } = require("../connection");

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
