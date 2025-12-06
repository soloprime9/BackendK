const { Schema, model } = require("../connection");

const FeatureRequestSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    title: String,
    description: String,
    votes: { type: Number, default: 0 },
    status: { 
        type: String,
        enum: ["planned", "in-progress", "done"],
        default: "planned"
    }
});

module.exports = model("FeatureRequest", FeatureRequestSchema);
