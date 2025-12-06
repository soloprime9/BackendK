const { Schema, model } = require("../connection");

const ProductSchema = new Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },

    description: { type: String, required: true },
    longDescription: String,

    thumbnail: String,
    gallery: [String],
    videoDemo: String,

    category: { type: Schema.Types.ObjectId, ref: "Category" },
    tags: [{ type: Schema.Types.ObjectId, ref: "Tag" }],

    // 🔥 Pricing Plans Connection
    plans: [{ type: Schema.Types.ObjectId, ref: "PricingPlan" }],

    seo: { type: Schema.Types.ObjectId, ref: "Seo" },

    // Ratings
    ratings: [
        {
            userId: { type: Schema.Types.ObjectId, ref: "User" },
            stars: { type: Number, min: 1, max: 5 },
            comment: String,
            createdAt: { type: Date, default: Date.now }
        }
    ],
    avgRating: { type: Number, default: 0 },

    // Views & Clicks
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },

    featured: { type: Boolean, default: false },
    trendingScore: { type: Number, default: 1 },

    location: { type: Schema.Types.ObjectId, ref: "Location" },

    websiteUrl: String,
    appStoreLink: String,
    playStoreLink: String,
    chromeExtension: String,

    social: {
        twitter: String,
        facebook: String,
        linkedin: String,
        youtube: String,
        instagram: String,
        discord: String,
        github: String,
    },

    launchDate: { type: Date, default: Date.now },
    launchStatus: {
        type: String,
        enum: ["beta", "live", "coming_soon"],
        default: "live"
    },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" },

    team: [
        {
            name: String,
            role: String,
            avatar: String,
            userId: { type: Schema.Types.ObjectId, ref: "User" }
        }
    ],

    votes: [{ type: Schema.Types.ObjectId, ref: "Vote" }],
    comments: [{ type: Schema.Types.ObjectId, ref: "Comment" }],
    reviews: [{ type: Schema.Types.ObjectId, ref: "Review" }],

    analytics: { type: Schema.Types.ObjectId, ref: "Analytics" },

    status: { type: String, default: "published" },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = model("Product", ProductSchema);
