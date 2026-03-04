const { Schema, model } = require("../connection");

const SeoSchema = new Schema({
  postId: { type: Schema.Types.ObjectId, ref: "Post" },
  metaTitle: String,
  metaDescription: String,
  keywords: [String],
  indexed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = model("SeoMeta", SeoSchema);
