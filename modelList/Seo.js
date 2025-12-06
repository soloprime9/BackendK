const { Schema, model } = require("../connection");

const SeoSchema = new Schema({
    metaTitle: String,
    metaDescription: String,
    metaKeywords: [String],
    canonicalUrl: String,
    ogImage: String,
    ogTitle: String,
    ogDescription: String,
    twitterCard: String,
    schemaType: { type: String, default: "Product" },
});

module.exports = model("Seo", SeoSchema);
