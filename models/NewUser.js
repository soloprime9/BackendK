const { Schema, model } = require("../connection");

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true } // In production, hash this!
}, { timestamps: true });

module.exports = model("User", UserSchema);
