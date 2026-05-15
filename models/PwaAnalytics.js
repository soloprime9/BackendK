const mongoose = require("mongoose");
const { Schema, model } = require("../connection");

const PwaAnalyticsSchema = Schema({

  type: {
    type: String,
    enum: [
      "popup_shown",
      "install_clicked",
      "installed",
      "active_user",
    ],
    required: true,
  },

  browser: {
    type: String,
  },

  device: {
    type: String,
  },

  os: {
    type: String,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

});

module.exports =
  model(
    "pwaanalytics",
    PwaAnalyticsSchema
  );
