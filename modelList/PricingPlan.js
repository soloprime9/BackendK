const { Schema, model } = require("../connection");

const PricingPlanSchema = new Schema({
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true }, // attach to product

    name: { type: String, required: true },      // Example: Free, Pro, Premium
    description: { type: String, default: "" },  // Details about the plan

    price: { type: Number, default: 0 },         // Price number
    currency: { type: String, default: "USD" },  // Currency (ISO Code)
    interval: { type: String, enum: ["once", "monthly", "yearly"], default: "once" }, // billing interval

    features: [{ type: String }],                // list of features included
    trialDays: { type: Number, default: 0 },     // free trial duration if any

    availability: {                              // For SEO structured data
        type: String,
        enum: ["https://schema.org/InStock", "https://schema.org/OutOfStock", "https://schema.org/PreOrder"],
        default: "https://schema.org/InStock"
    },

    sku: { type: String },                        // optional SKU for Google
    url: { type: String },                        // optional link to the plan page

    active: { type: Boolean, default: true },     // is this plan active or deprecated?

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = model("PricingPlan", PricingPlanSchema);
