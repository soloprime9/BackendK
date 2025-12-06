const { Schema, model } = require("../connection");

const SubmissionSchema = new Schema(
  {
    // Link to product (created after approval)
    product: { type: Schema.Types.ObjectId, ref: "Product", default: null },

    // Who submitted (null means admin)
    submitter: { type: Schema.Types.ObjectId, ref: "User", default: null },

    // Basic info required at submission time
    name: { type: String, required: true },
    tagline: { type: String },
    email: { type: String },

    // Extra info asked in submission form only
    website: String,
    logo: String,
    images: [String],

    // Category & tags suggested by user (not official)
    suggestedCategory: String,
    suggestedTags: [String],

    // Status workflow
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending"
    },

    // Launch info (optional)
    launchDate: { type: Date },
    featured: { type: Boolean, default: false },

    // Internal moderation notes
    adminNotes: String,

    // Stats (optional for admin review)
    views: { type: Number, default: 0 },
    upvotes: { type: Number, default: 0 },

  },
  { timestamps: true }
);

module.exports = model("Submission", SubmissionSchema);
