const { Schema, model } = require("../connection");

const ReportSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    user: { type: Schema.Types.ObjectId, ref: "User" },
    reason: String,
    message: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = model("Report", ReportSchema);
