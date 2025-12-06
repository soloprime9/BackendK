const { Schema, model } = require("../connection");

const userSchema = new Schema(
  {
    username: { type: String, required: true, index: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    avatar: { type: String, default: "" },
    bio: { type: String, default: "" },

    // SEO Fields
    location: { type: String, index: true },
    country: { type: String, index: true },
    
    views: { type: Number, default: 0 },

    isVerified: { type: Boolean, default: false },
    role: { type: String, enum: ["admin", "user"], default: "user" },


    purchasedPlan: { type: Schema.Types.ObjectId, ref: "Plan" }, // Connected
  },
  { timestamps: true }
);

module.exports = model("User", userSchema);
