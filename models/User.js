
const {Schema, model} = require("../connection");



const UserSchema = Schema({
    name: { type: String, default: "" }, // Display Name (e.g. "Rohit Sharma")
    username: { type: String, default: "", unique: true, lowercase: true, trim: true }, // Unique Handle (e.g. "rohit_sharma")
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, default: "", sparse: true }, // Optional phone for frictionless signup
    country: { type: String, default: "" },
    city: { type: String, default: "" },
    location: { type: String, default: "" },
    ipAddress: { type: String, default: "" },
    bio: { type: String, default: "Hey there! I am using FondPeace." },
    profilePicture: { type: String, default: "/Fondpeace.jpg" },
    profilePic: { type: String, default: "/Fondpeace.jpg" },
    avatar: { type: String, default: "/Fondpeace.jpg" },
    coverImage: { type: String, default: "" },
    website: { type: String, default: "" },
    isVerified: { type: Boolean, default: false }, // Blue verification tick
    isEmailVerified: { type: Boolean, default: false }, // Email OTP verified badge
    emailOtp: { type: String, default: null },
    emailOtpExpiresAt: { type: Date, default: null },
    isPhoneVerified: { type: Boolean, default: false },
    phoneOtp: { type: String, default: null },
    phoneOtpExpiresAt: { type: Date, default: null },
    accountType: { type: String, enum: ["viewer", "creator", "brand"], default: "viewer" },
    category: { type: String, default: "General" },
    tagline: { type: String, default: "" },
    interests: [{ type: String, trim: true }],
    socialLinks: {
      instagram: { type: String, default: "" },
      twitter: { type: String, default: "" },
      youtube: { type: String, default: "" },
      github: { type: String, default: "" },
      linkedin: { type: String, default: "" }
    },
    dateOfBirth: { type: Date, default: null },
    pronouns: { type: String, default: "" },
    Followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    Followings: [{ type: Schema.Types.ObjectId, ref: "User" }],
    bookmarks: [{ type: Schema.Types.ObjectId, ref: "Post" }],
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    mutedUsers: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    mutedKeywords: [{ type: String, trim: true, lowercase: true, default: [] }],
    notificationPreferences: {
      notifyLikes: { type: Boolean, default: true },
      notifyComments: { type: Boolean, default: true },
      notifyMentions: { type: Boolean, default: true },
      notifyReposts: { type: Boolean, default: true },
      notifyFollows: { type: Boolean, default: true }
    },
    posts: [{ type: Schema.Types.ObjectId, ref: "Post" }],
}, { timestamps: true });

UserSchema.pre("save", function(next) {
  if (this.profilePicture) {
    this.profilePic = this.profilePicture;
    this.avatar = this.profilePicture;
  } else if (this.profilePic) {
    this.profilePicture = this.profilePic;
    this.avatar = this.profilePic;
  } else if (this.avatar) {
    this.profilePicture = this.avatar;
    this.profilePic = this.avatar;
  }
  next();
});

const User = model("User", UserSchema);
  
module.exports = User;


 
