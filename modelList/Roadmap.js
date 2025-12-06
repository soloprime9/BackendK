const { Schema, model } = require("../connection");

const RoadmapSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product" },
    title: String,
    description: String,
    stage: { 
        type: String,
        enum: ["planned", "in-progress", "completed"],
        default: "planned"
    }
});

module.exports = model("Roadmap", RoadmapSchema);
