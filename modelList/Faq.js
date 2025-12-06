const { Schema, model } = require("../connection");

const FaqSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    question: String,
    answer: String
});

module.exports = model("Faq", FaqSchema);
