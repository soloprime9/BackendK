const { Schema, model } = require("../connection");

const UpdateSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    title: String,
    description: String,
    version: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Update", UpdateSchema);
