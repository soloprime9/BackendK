const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/User");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const verifyToken = require("../middleware/verifyToken");
const Post = require("../models/Post");
const { isValidPhoneNumber } = require("libphonenumber-js"); 
const Notification = require("../models/Notification");
const { getIO } = require("../socket");

function emitRealtimeEvent(event, data) {
  try {
    const io = getIO();
    if (io) io.emit(event, data);
  } catch (_) {}
}

// Case-insensitive, handle-clean, and ObjectId-safe User lookup query builder
function buildUserLookupQuery(rawIdentifier) {
  if (!rawIdentifier) return null;
  const clean = String(rawIdentifier).trim().replace(/^@/, "");
  if (!clean) return null;

  const isObjectId = mongoose.Types.ObjectId.isValid(clean) && clean.length === 24;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (isObjectId) {
    return {
      $or: [
        { _id: new mongoose.Types.ObjectId(clean) },
        { username: clean.toLowerCase() },
        { username: new RegExp(`^${escaped}$`, "i") }
      ]
    };
  }

  return {
    $or: [
      { username: clean.toLowerCase() },
      { username: new RegExp(`^${escaped}$`, "i") }
    ]
  };
}

dotenv.config();

// 0. GET CURRENT AUTHENTICATED USER
router.get("/me", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.UserId || req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized: Invalid token payload" });
    }
    const user = await User.findById(userId).select("-password -phone -ipAddress");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Fetch Me Error:", error);
    return res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
});

// 1. GET ALL USERS (Sanitized - never expose passwords)
router.get("/mango/getall", async (req, res) => {
    try {
        const Users = await User.find().select("-password");
        res.status(200).json(Users);
        console.log("Fetched users count:", Users.length);
    } catch(error) {
        res.status(500).json("Error Fetching Data");
    }
});

// 1B. GET SUGGESTED CREATORS (Cold-Start & Discovery for new users)
router.get("/suggested-creators", async (req, res) => {
  try {
    const creators = await User.find({
      username: { $exists: true, $ne: "" }
    })
      .select("username name profilePicture profilePic avatar isVerified bio category Followers tagline")
      .limit(25)
      .lean();

    // Normalize avatar across all field naming variations
    const formatted = creators.map((c) => {
      const pic = c.profilePicture || c.profilePic || c.avatar || "/Fondpeace.jpg";
      return {
        ...c,
        profilePicture: pic,
        profilePic: pic,
        avatar: pic
      };
    });

    // Sort by most followers / popularity
    formatted.sort((a, b) => (b.Followers?.length || 0) - (a.Followers?.length || 0));

    res.status(200).json({
      success: true,
      creators: formatted.slice(0, 10),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not fetch suggested creators" });
  }
});

// --- SMART USERNAME SUGGESTIONS ENGINE ---
async function generateUniqueSuggestions(seed) {
  const cleanSeed = (seed || "user")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 15) || "user";

  const year = new Date().getFullYear().toString().slice(-2);
  const candidates = [
    cleanSeed,
    `${cleanSeed}_peace`,
    `real_${cleanSeed}`,
    `iam_${cleanSeed}`,
    `${cleanSeed}_${year}`,
    `${cleanSeed}${Math.floor(100 + Math.random() * 900)}`,
    `${cleanSeed}_official`,
    `the_${cleanSeed}`
  ];

  const existingUsers = await User.find({ username: { $in: candidates } }).select("username");
  const existingSet = new Set(existingUsers.map(u => (u.username || "").toLowerCase()));

  const available = candidates.filter(c => !existingSet.has(c.toLowerCase()));
  return available.slice(0, 5);
}

// 2. FRICTIONLESS SIGNUP (Instant Account Creation + Token Generation)
router.post('/add', async (req, res) => {
  const { username, email, password, name, phone, country, city, bio } = req.body;

  try {
    // 1. Mandatory fields check (Frictionless: Only core 3 required)
    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email, and password are required" });
    }

    const cleanUsername = username.toLowerCase().trim();
    const cleanEmail = email.toLowerCase().trim();

    // 2. Handle format check (letters, numbers, underscore, dots)
    if (!/^[a-zA-Z0-9._]{3,30}$/.test(cleanUsername)) {
      return res.status(400).json({ 
        message: "Username must be 3-30 characters (letters, numbers, underscores, and dots only)" 
      });
    }

    // 3. Optional Phone Validation (if provided)
    if (phone && phone.trim() !== "" && !isValidPhoneNumber(phone)) {
      return res.status(400).json({ message: "Invalid phone number format (e.g. +12025550199)" });
    }

    // 4. Check duplicate username + Return Live Suggestions if taken
    const checkUser = await User.findOne({ username: cleanUsername });
    if (checkUser) {
      const suggestions = await generateUniqueSuggestions(cleanUsername);
      return res.status(409).json({ 
        message: "Username already taken", 
        suggestions 
      });
    }

    // 5. Check duplicate email
    const checkEmail = await User.findOne({ email: cleanEmail });
    if (checkEmail) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // 6. Cryptographically hash password (2026 Security Standard)
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name: name ? name.trim() : cleanUsername, // Defaults cleanly to username if name not given
      username: cleanUsername,
      email: cleanEmail,
      password: hashedPassword,
      phone: phone ? phone.trim() : "",
      country: country || "",
      city: city || "",
      bio: bio || "Hey there! I am using FondPeace.",
      ipAddress: req.ip
    });

    const savedUser = await newUser.save();
    
    // Auto-login token: User doesn't need to re-login right after registration!
    const secret = process.env.JWT_SECRET || "fondpeace_jwt_secret_key_2026";
    const token = jwt.sign({ UserId: savedUser._id }, secret, { expiresIn: "30d" });

    const userResponse = savedUser.toObject();
    delete userResponse.password;

    // 7. Success response
    res.status(201).json({
      message: "Your Account Successfully Created",
      token,
      user: userResponse
    });

    console.log("New user registered:", savedUser.username);

  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({
      message: "Internal Server Error"
    });
  }
});

// 3. LOGIN (Supports Email or Username, Case-Insensitive, Bcrypt & Auto-Upgrade)
router.post("/login", async (req, res) => {
   const { email, username, password } = req.body;

   try {
       if (!password) {
           return res.status(400).json({ message: "Password is required" });
       }

       const rawIdentifier = (email || username || req.body.identifier || "").trim();
       if (!rawIdentifier) {
           return res.status(400).json({ message: "Email or username is required" });
       }

       const cleanIdentifier = rawIdentifier.toLowerCase();
       const user = await User.findOne({
           $or: [
               { email: cleanIdentifier },
               { username: cleanIdentifier },
               { email: rawIdentifier },
               { username: rawIdentifier }
           ]
       });

       if (!user) {
           return res.status(404).json({ message: "Account not found with this email or username" });
       }

       let isMatch = false;

       // Attempt bcrypt comparison
       try {
           isMatch = await bcrypt.compare(password, user.password);
       } catch (_) {
           isMatch = false;
       }

       // Backward compatibility: If bcrypt didn't match, test legacy plaintext
       if (!isMatch && user.password === password) {
           isMatch = true;
           // Silently upgrade password to bcrypt hash in MongoDB
           try {
               user.password = await bcrypt.hash(password, 10);
               await user.save();
               console.log(`[Security Upgrade] Migrated password to bcrypt for: ${user.email}`);
           } catch (upgradeErr) {
               console.error("Failed to upgrade legacy password hash:", upgradeErr);
           }
       }

       if (!isMatch) {
           return res.status(401).json({ message: "Wrong password, please try again" });
       }

       const secret = process.env.JWT_SECRET || "fondpeace_jwt_secret_key_2026";
       const token = jwt.sign(
           { UserId: user._id, id: user._id, username: user.username },
           secret,
           { expiresIn: "30d" }
       );
       
       const userDetail = user.toObject();
       delete userDetail.password;

       return res.status(200).json({
           message: "Logged in successfully",
           UserDetail: userDetail,
           user: userDetail,
           token: token,
       });
   } catch (error) {
       console.error("Login error:", error);
       return res.status(500).json({ message: "Internal server error" });
   }
});

// 3.5 GOOGLE ONE TAP & OAUTH AUTHENTICATION
router.post("/google-auth", async (req, res) => {
  const { credential, email, name, avatar, googleId } = req.body;

  try {
    let userEmail = (email || "").toLowerCase().trim();
    let userName = (name || "").trim();
    let userAvatar = avatar || "";

    // If credential JWT was sent by Google Identity Services, decode it safely
    if (credential) {
      try {
        const decoded = jwt.decode(credential);
        if (decoded) {
          if (decoded.email) userEmail = decoded.email.toLowerCase().trim();
          if (decoded.name) userName = decoded.name.trim();
          if (decoded.picture) userAvatar = decoded.picture;
        }
      } catch (decErr) {
        console.error("Error decoding Google credential:", decErr.message);
      }
    }

    if (!userEmail) {
      return res.status(400).json({ success: false, message: "Valid Google email is required" });
    }

    // 1. Check if user already exists by email
    let user = await User.findOne({ email: userEmail });

    if (user) {
      // If user exists, update avatar if missing
      if (userAvatar && (!user.profilePicture || user.profilePicture === "/Fondpeace.jpg")) {
        user.profilePicture = userAvatar;
        await user.save();
      }
    } else {
      // 2. Create new user smoothly
      let baseUsername = (userEmail.split("@")[0] || "user")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 18);
      if (baseUsername.length < 3) baseUsername = `user_${Date.now().toString().slice(-4)}`;

      // Ensure unique username
      let uniqueUsername = baseUsername;
      const existing = await User.findOne({ username: uniqueUsername });
      if (existing) {
        uniqueUsername = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
      }

      const randomPassword = await bcrypt.hash(`google_${Date.now()}_${Math.random()}`, 10);

      user = new User({
        name: userName || uniqueUsername,
        username: uniqueUsername,
        email: userEmail,
        password: randomPassword,
        profilePicture: userAvatar || "/Fondpeace.jpg",
        bio: "Hey there! I am using FondPeace.",
        ipAddress: req.ip
      });

      await user.save();
      console.log(`[Google One Tap] New user registered: @${user.username} (${user.email})`);
    }

    // Issue JWT token
    const secret = process.env.JWT_SECRET || "fondpeace_jwt_secret_key_2026";
    const token = jwt.sign(
      { UserId: user._id, id: user._id, username: user.username },
      secret,
      { expiresIn: "30d" }
    );

    const userDetail = user.toObject();
    delete userDetail.password;

    return res.status(200).json({
      success: true,
      message: "Google sign-in successful",
      token,
      user: userDetail,
      UserDetail: userDetail
    });
  } catch (err) {
    console.error("Google Auth error:", err);
    return res.status(500).json({ success: false, message: "Google authentication failed" });
  }
});

// 4. AUTHENTICATED PROFILE
router.get("/profile/:username", verifyToken, async (req, res) => {
    try {
        const loggedinUser = req.user?.UserId || req.user?.id || req.user?._id;
        const query = buildUserLookupQuery(req.params.username);
        if (!query) {
            return res.status(404).json({ message: "User not found" });
        }

        const user = await User.findOne(query).select("-password");
        if (!user) { 
            return res.status(404).json({ message: "User not found" });
        }

        const OwnerId = (loggedinUser && user._id) ? user._id.toString() === loggedinUser.toString() : false;
        const posts = await Post.find({ userId: user._id }).populate("userId", "username");

        res.status(200).json({
            Profile: {
                user: user,
                posts,
                OwnerId
            }
        });
    } catch (error) {
        console.error("Auth Profile Error:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});

// 5. PUBLIC PROFILE (Safe - excludes password, phone, ipAddress)
router.get("/profile-public/:username", async (req, res) => {
    try {
        const query = buildUserLookupQuery(req.params.username);
        if (!query) {
            return res.status(404).json({ message: "User not found" });
        }

        const user = await User.findOne(query).select("-password -phone -ipAddress");
        if (!user) { 
            return res.status(404).json({ message: "User not found" });
        }

        let OwnerId = false;
        const authHeader = req.header("authorization") || req.header("x-auth-token");
        if (authHeader) {
          try {
            const token = authHeader.replace(/^Bearer\s+/i, "").trim();
            const secret = process.env.JWT_SECRET || "fondpeace_jwt_secret_key_2026";
            const decoded = jwt.verify(token, secret);
            const loggedinId = decoded?.UserId || decoded?.id || decoded?._id;
            if (loggedinId && user._id.toString() === loggedinId.toString()) {
              OwnerId = true;
            }
          } catch (_) {}
        }

        const posts = await Post.find({ userId: user._id }).populate("userId", "username");

        res.status(200).json({
            Profile: {
                user: user,
                posts,
                OwnerId
            }
        });
    } catch (error) {
        console.error("Public Profile Error:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});

// 6. SEARCH USERS (Sanitized - searches name, username, and email)
router.get("/mango/search", async (req, res) => {
    try {
        const query = req.query.query;
        if (!query) return res.status(200).json([]);
        const regex = new RegExp(query, 'i');

        const users = await User.find({
            $or: [
                { name: regex },
                { username: regex },
                { email: regex }
            ]
        }).select("-password -phone -ipAddress");

        res.status(200).json(users);
    } catch(error) {
        res.status(500).json(error);
    }
});

// 7. TWO-WAY FOLLOW / UNFOLLOW SYNCHRONIZATION
router.post("/follow/:userId", verifyToken, async (req, res) => {
    const targetUserId = req.params.userId;
    const loggedinUserId = req.user.UserId;

    if (targetUserId.toString() === loggedinUserId.toString()) {
        return res.status(400).json({ message: "You cannot follow yourself" });
    }

    try {
        const [targetUser, currentUser] = await Promise.all([
            User.findById(targetUserId),
            User.findById(loggedinUserId)
        ]);

        if (!targetUser || !currentUser) {
            return res.status(404).json({ message: "User Not Found" });
        }

        // Verify existing follow status comparing string IDs
        const isFollowing = targetUser.Followers.some(
            id => id.toString() === loggedinUserId.toString()
        );

        if (isFollowing) {
            // Unfollow: update both Followers & Followings
            targetUser.Followers = targetUser.Followers.filter(
                id => id.toString() !== loggedinUserId.toString()
            );
            currentUser.Followings = currentUser.Followings.filter(
                id => id.toString() !== targetUserId.toString()
            );
            await Promise.all([targetUser.save(), currentUser.save()]);
            console.log(`Unfollowed: ${currentUser.username} -> ${targetUser.username}`);
        } else {
            // Follow: update both Followers & Followings
            targetUser.Followers.push(loggedinUserId);
            currentUser.Followings.push(targetUserId);
            await Promise.all([targetUser.save(), currentUser.save()]);
            console.log(`Followed: ${currentUser.username} -> ${targetUser.username}`);

            try {
                await Notification.create({
                    recipient: targetUserId,
                    sender: loggedinUserId,
                    type: "follow"
                });
            } catch (nErr) {
                console.error("Persist follow notification error:", nErr.message);
            }

            emitRealtimeEvent("new_notification", {
                type: "follow",
                byUser: loggedinUserId,
                targetUser: targetUserId,
                timestamp: new Date()
            });
        }

        const sanitizedTarget = targetUser.toObject();
        delete sanitizedTarget.password;
        delete sanitizedTarget.phone;
        delete sanitizedTarget.ipAddress;

        res.status(200).json({
            isFollowing: !isFollowing,
            user: sanitizedTarget
        });
    } catch(error) {
        console.error("Follow Error:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
});

// 8. CHECK EMAIL AVAILABILITY
router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.json({ available: false });
    } else {
      return res.json({ available: true });
    }
  } catch (error) {
    console.error('Error checking email availability:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================================
// 🚀 PHASE 3: IDENTITY, SMART USERNAME SUGGESTER & RECOMMENDATIONS
// =====================================================================

// 9. CHECK USERNAME AVAILABILITY & LIVE SUGGESTIONS
router.post('/check-username', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "Username is required" });

    const cleanUsername = username.toLowerCase().trim();
    if (!/^[a-zA-Z0-9._]{3,30}$/.test(cleanUsername)) {
      return res.status(200).json({
        available: false,
        message: "Username must be 3-30 characters (letters, numbers, underscores, and dots only)"
      });
    }

    const existingUser = await User.findOne({ username: cleanUsername });
    if (existingUser) {
      const suggestions = await generateUniqueSuggestions(cleanUsername);
      return res.status(200).json({
        available: false,
        message: "Username is already taken",
        suggestions
      });
    }

    return res.status(200).json({
      available: true,
      message: "Username is available!"
    });
  } catch (error) {
    console.error("Check Username Error:", error);
    res.status(500).json({ message: "Server error checking username" });
  }
});

// 10. GENERATE USERNAME SUGGESTIONS FROM NAME OR SEED
router.post('/suggest-usernames', async (req, res) => {
  try {
    const { name, username } = req.body;
    const seed = name || username || "creator";
    const suggestions = await generateUniqueSuggestions(seed);
    return res.status(200).json({
      success: true,
      suggestions
    });
  } catch (error) {
    console.error("Suggest Usernames Error:", error);
    res.status(500).json({ message: "Server error generating suggestions" });
  }
});

// 11. PROFILE UPDATE (Edit Name, Username, Bio, Tagline, Category, Location, Avatar, Banner, Website, Social Links)
router.put('/profile/update', verifyToken, async (req, res) => {
  try {
    const userId = req.user?.UserId || req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: Invalid token payload" });
    }

    const {
      name,
      username,
      bio,
      tagline,
      category,
      location,
      city,
      country,
      website,
      profilePicture,
      coverImage,
      socialLinks,
      pronouns,
      accountType
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 1. Handle Username Update (if requested & changed)
    if (username !== undefined && typeof username === "string") {
      const cleanUsername = username.trim().replace(/^@/, "").toLowerCase();
      if (cleanUsername && cleanUsername !== user.username) {
        // Validate handle format
        if (!/^[a-zA-Z0-9._]{3,30}$/.test(cleanUsername)) {
          return res.status(400).json({
            message: "Username must be 3-30 characters (letters, numbers, underscores, and dots only)"
          });
        }
        // Ensure uniqueness
        const conflict = await User.findOne({ username: cleanUsername, _id: { $ne: user._id } });
        if (conflict) {
          const suggestions = await generateUniqueSuggestions(cleanUsername);
          return res.status(409).json({
            message: "Username is already taken by another account",
            suggestions
          });
        }
        user.username = cleanUsername;
      }
    }

    // 2. Handle Name
    if (name !== undefined && typeof name === "string") {
      const cleanName = name.trim();
      if (cleanName) user.name = cleanName;
    }

    // 3. Handle Bio & Tagline
    if (bio !== undefined && typeof bio === "string") {
      user.bio = bio.trim();
    }
    if (tagline !== undefined && typeof tagline === "string") {
      user.tagline = tagline.trim();
    }

    // 4. Handle Category
    if (category !== undefined && typeof category === "string") {
      user.category = category.trim();
    }

    // 5. Handle Location / City / Country
    if (location !== undefined && typeof location === "string") {
      user.location = location.trim();
      // If city and country aren't explicitly provided, parse location
      if (!city && !country && user.location.includes(",")) {
        const parts = user.location.split(",").map(p => p.trim());
        if (parts[0]) user.city = parts[0];
        if (parts[1]) user.country = parts.slice(1).join(", ");
      }
    }
    if (city !== undefined && typeof city === "string") {
      user.city = city.trim();
    }
    if (country !== undefined && typeof country === "string") {
      user.country = country.trim();
    }

    // 6. Handle Website
    if (website !== undefined && typeof website === "string") {
      user.website = website.trim();
    }

    // 7. Handle Profile Picture & Cover Image (SAFELY PRESERVE EXISTING IMAGES)
    // Never overwrite an existing image with empty string or null unless explicitly removed
    const incomingPic = profilePicture !== undefined ? profilePicture : (req.body.profilePic !== undefined ? req.body.profilePic : req.body.avatar);
    if (incomingPic !== undefined) {
      if (typeof incomingPic === "string" && incomingPic.trim().length > 0) {
        user.profilePicture = incomingPic.trim();
        user.profilePic = user.profilePicture;
        user.avatar = user.profilePicture;
      } else if (req.body.removeProfilePicture === true) {
        user.profilePicture = "/Fondpeace.jpg";
        user.profilePic = "/Fondpeace.jpg";
        user.avatar = "/Fondpeace.jpg";
      }
    }

    if (coverImage !== undefined) {
      if (typeof coverImage === "string" && coverImage.trim().length > 0) {
        user.coverImage = coverImage.trim();
      } else if (req.body.removeCoverImage === true) {
        user.coverImage = "";
      }
    }

    // 8. Handle Social Links
    if (socialLinks && typeof socialLinks === "object") {
      user.socialLinks = {
        instagram: socialLinks.instagram !== undefined ? String(socialLinks.instagram).trim() : (user.socialLinks?.instagram || ""),
        twitter: socialLinks.twitter !== undefined ? String(socialLinks.twitter).trim() : (user.socialLinks?.twitter || ""),
        youtube: socialLinks.youtube !== undefined ? String(socialLinks.youtube).trim() : (user.socialLinks?.youtube || ""),
        github: socialLinks.github !== undefined ? String(socialLinks.github).trim() : (user.socialLinks?.github || ""),
        linkedin: socialLinks.linkedin !== undefined ? String(socialLinks.linkedin).trim() : (user.socialLinks?.linkedin || "")
      };
    }

    // 9. Optional Pronouns & Account Type
    if (pronouns !== undefined && typeof pronouns === "string") {
      user.pronouns = pronouns.trim();
    }
    if (accountType !== undefined && ["viewer", "creator", "brand"].includes(accountType)) {
      user.accountType = accountType;
    }

    await user.save();

    // 10. Generate Fresh Token so session stays active
    const secret = process.env.JWT_SECRET || "fondpeace_jwt_secret_key_2026";
    const freshToken = jwt.sign({ UserId: user._id }, secret, { expiresIn: "30d" });

    const sanitizedUser = user.toObject();
    delete sanitizedUser.password;
    delete sanitizedUser.phone;
    delete sanitizedUser.ipAddress;

    // Real-time broadcast so open tabs update
    emitRealtimeEvent("user_profile_updated", {
      userId: user._id,
      username: user.username,
      name: user.name,
      profilePicture: user.profilePicture,
      coverImage: user.coverImage,
      tagline: user.tagline,
      bio: user.bio,
      category: user.category,
      location: user.location,
      socialLinks: user.socialLinks
    });

    return res.status(200).json({
      message: "Profile updated successfully! ✨",
      token: freshToken,
      user: sanitizedUser
    });
  } catch (error) {
    console.error("Profile Update Error:", error);
    res.status(500).json({ message: "Server error updating profile", error: error.message });
  }
});

// 12. "WHO TO FOLLOW" / CREATOR RECOMMENDATIONS ENGINE
router.get('/recommendations', async (req, res) => {
  try {
    let excludeIds = [];

    // Check if requester has token
    const authHeader = req.header("authorization") || req.header("x-auth-token");
    if (authHeader) {
      try {
        const token = authHeader.replace(/^Bearer\s+/i, "");
        const secret = process.env.JWT_SECRET || "fondpeace_jwt_secret_key_2026";
        const decoded = jwt.verify(token, secret);
        if (decoded?.UserId) {
          const me = await User.findById(decoded.UserId);
          if (me) {
            excludeIds = [me._id, ...(me.Followings || [])];
          }
        }
      } catch (_) {}
    }

    const query = excludeIds.length > 0 ? { _id: { $nin: excludeIds } } : {};

    // Rank by verified badge first, then follower count, then newest
    const creators = await User.find(query)
      .sort({ isVerified: -1, Followers: -1, createdAt: -1 })
      .limit(10)
      .select("name username bio profilePicture coverImage isVerified Followers");

    const formatted = creators.map(u => ({
      _id: u._id,
      name: u.name || u.username,
      username: u.username,
      bio: u.bio,
      profilePicture: u.profilePicture || "/Fondpeace.jpg",
      coverImage: u.coverImage || "",
      isVerified: u.isVerified || false,
      followersCount: u.Followers ? u.Followers.length : 0
    }));

    return res.status(200).json({
      success: true,
      recommendations: formatted
    });
  } catch (error) {
    console.error("Recommendations Error:", error);
    res.status(500).json({ message: "Error fetching creator recommendations" });
  }
});

// 13. BLOCK / UNBLOCK USER (Safety & Moderation)
router.post("/block/:userId", verifyToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user.UserId;

    if (targetUserId.toString() === currentUserId.toString()) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    if (!currentUser.blockedUsers) currentUser.blockedUsers = [];

    const isBlocked = currentUser.blockedUsers.some(
      id => id && id.toString() === targetUserId.toString()
    );

    if (isBlocked) {
      // Unblock
      currentUser.blockedUsers = currentUser.blockedUsers.filter(
        id => id && id.toString() !== targetUserId.toString()
      );
      await currentUser.save();
      return res.status(200).json({
        success: true,
        isBlocked: false,
        message: "User successfully unblocked"
      });
    } else {
      // Block
      currentUser.blockedUsers.push(targetUserId);

      // Auto-unfollow both ways if blocked
      currentUser.Followings = (currentUser.Followings || []).filter(
        id => id && id.toString() !== targetUserId.toString()
      );
      currentUser.Followers = (currentUser.Followers || []).filter(
        id => id && id.toString() !== targetUserId.toString()
      );

      await Promise.all([
        currentUser.save(),
        User.findByIdAndUpdate(targetUserId, {
          $pull: { Followers: currentUserId, Followings: currentUserId }
        })
      ]);

      return res.status(200).json({
        success: true,
        isBlocked: true,
        message: "User successfully blocked"
      });
    }
  } catch (error) {
    console.error("Block User Error:", error);
    return res.status(500).json({ message: "Error updating block status", error: error.message });
  }
});

// 14. MUTE / UNMUTE USER (Soft Safety - hides posts without blocking)
router.post("/mute/:userId", verifyToken, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user.UserId;

    if (targetUserId.toString() === currentUserId.toString()) {
      return res.status(400).json({ message: "You cannot mute yourself" });
    }

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    if (!currentUser.mutedUsers) currentUser.mutedUsers = [];

    const isMuted = currentUser.mutedUsers.some(
      id => id && id.toString() === targetUserId.toString()
    );

    if (isMuted) {
      currentUser.mutedUsers = currentUser.mutedUsers.filter(
        id => id && id.toString() !== targetUserId.toString()
      );
      await currentUser.save();
      return res.status(200).json({
        success: true,
        isMuted: false,
        message: "User successfully unmuted"
      });
    } else {
      currentUser.mutedUsers.push(targetUserId);
      await currentUser.save();
      return res.status(200).json({
        success: true,
        isMuted: true,
        message: "User muted. Their posts will no longer appear in your feed."
      });
    }
  } catch (error) {
    console.error("Mute User Error:", error);
    return res.status(500).json({ message: "Error updating mute status", error: error.message });
  }
});

// 15. MANAGE MUTED KEYWORDS / HASHTAGS
router.post("/muted-keywords", verifyToken, async (req, res) => {
  try {
    const currentUserId = req.user.UserId;
    const { keyword, action = "add" } = req.body;

    if (!keyword || typeof keyword !== "string") {
      return res.status(400).json({ message: "Keyword is required" });
    }

    const cleanWord = keyword.trim().toLowerCase().replace(/^#/, "");
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    if (!currentUser.mutedKeywords) currentUser.mutedKeywords = [];

    if (action === "remove") {
      currentUser.mutedKeywords = currentUser.mutedKeywords.filter(k => k !== cleanWord);
    } else {
      if (!currentUser.mutedKeywords.includes(cleanWord)) {
        currentUser.mutedKeywords.push(cleanWord);
      }
    }

    await currentUser.save();
    return res.status(200).json({
      success: true,
      mutedKeywords: currentUser.mutedKeywords,
      message: action === "remove" ? `Removed "${cleanWord}" from muted words` : `Muted posts containing "${cleanWord}"`
    });
  } catch (error) {
    console.error("Muted Keywords Error:", error);
    return res.status(500).json({ message: "Error updating muted keywords", error: error.message });
  }
});

// 16. GET USER MUTED LIST (Muted Users & Keywords)
router.get("/muted-list", verifyToken, async (req, res) => {
  try {
    const currentUserId = req.user.UserId;
    const currentUser = await User.findById(currentUserId)
      .populate("mutedUsers", "name username profilePicture isVerified");

    if (!currentUser) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      success: true,
      mutedUsers: currentUser.mutedUsers || [],
      mutedKeywords: currentUser.mutedKeywords || []
    });
  } catch (error) {
    console.error("Fetch Muted List Error:", error);
    return res.status(500).json({ message: "Error fetching muted list", error: error.message });
  }
});

// 17. GET USER NOTIFICATION PREFERENCES
router.get("/notification-settings", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.UserId).select("notificationPreferences");
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.status(200).json({
      success: true,
      preferences: user.notificationPreferences || {
        notifyLikes: true,
        notifyComments: true,
        notifyMentions: true,
        notifyReposts: true,
        notifyFollows: true
      }
    });
  } catch (error) {
    console.error("Get Notification Settings Error:", error);
    return res.status(500).json({ message: "Error fetching settings", error: error.message });
  }
});

// 18. UPDATE USER NOTIFICATION PREFERENCES
router.put("/notification-settings", verifyToken, async (req, res) => {
  try {
    const { notifyLikes, notifyComments, notifyMentions, notifyReposts, notifyFollows } = req.body;
    const user = await User.findById(req.user.UserId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.notificationPreferences) {
      user.notificationPreferences = {};
    }

    if (typeof notifyLikes === "boolean") user.notificationPreferences.notifyLikes = notifyLikes;
    if (typeof notifyComments === "boolean") user.notificationPreferences.notifyComments = notifyComments;
    if (typeof notifyMentions === "boolean") user.notificationPreferences.notifyMentions = notifyMentions;
    if (typeof notifyReposts === "boolean") user.notificationPreferences.notifyReposts = notifyReposts;
    if (typeof notifyFollows === "boolean") user.notificationPreferences.notifyFollows = notifyFollows;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Notification preferences updated successfully",
      preferences: user.notificationPreferences
    });
  } catch (error) {
    console.error("Update Notification Settings Error:", error);
    return res.status(500).json({ message: "Error updating settings", error: error.message });
  }
});

// 19. CREATOR PROFILE ANALYTICS ENGINE
router.get("/creator-analytics", verifyToken, async (req, res) => {
  try {
    const currentUserId = req.user.UserId;
    const user = await User.findById(currentUserId).select("name username profilePicture isVerified Followers Followings");
    if (!user) return res.status(404).json({ message: "User not found" });

    const posts = await Post.find({ userId: currentUserId }).lean();

    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalReposts = 0;
    let totalBookmarks = 0;

    posts.forEach(p => {
      totalViews += (p.views || 0);
      totalLikes += (p.likes ? p.likes.length : 0);
      totalComments += (p.comments ? p.comments.length : 0);
      totalReposts += (p.repostsCount || 0);
      totalBookmarks += (p.bookmarksCount || 0);
    });

    const totalInteractions = totalLikes + totalComments + totalReposts + totalBookmarks;
    const engagementRate = totalViews > 0 
      ? ((totalInteractions / totalViews) * 100).toFixed(2) 
      : (posts.length > 0 ? "100.00" : "0.00");

    // Top 3 best performing posts
    const topPosts = [...posts]
      .sort((a, b) => {
        const scoreA = (a.views || 0) + (a.likes ? a.likes.length * 3 : 0) + (a.comments ? a.comments.length * 5 : 0);
        const scoreB = (b.views || 0) + (b.likes ? b.likes.length * 3 : 0) + (b.comments ? b.comments.length * 5 : 0);
        return scoreB - scoreA;
      })
      .slice(0, 3)
      .map(p => ({
        _id: p._id,
        title: p.title,
        media: p.media,
        views: p.views || 0,
        likesCount: p.likes ? p.likes.length : 0,
        commentsCount: p.comments ? p.comments.length : 0,
        repostsCount: p.repostsCount || 0,
        createdAt: p.createdAt
      }));

    return res.status(200).json({
      success: true,
      creator: {
        _id: user._id,
        username: user.username,
        name: user.name,
        followersCount: user.Followers ? user.Followers.length : 0,
        followingsCount: user.Followings ? user.Followings.length : 0
      },
      overview: {
        totalPosts: posts.length,
        totalViews,
        totalLikes,
        totalComments,
        totalReposts,
        totalBookmarks,
        totalInteractions,
        engagementRate: `${engagementRate}%`
      },
      topPosts
    });
  } catch (error) {
    console.error("Creator Analytics Error:", error);
    return res.status(500).json({ message: "Error fetching creator analytics", error: error.message });
  }
});

// --- EMAIL / PHONE OTP VERIFICATION & ONBOARDING SUITE ---

// Helper function to send email via nodemailer if available or safe fallback
async function dispatchEmailOtp(toEmail, otpCode, username) {
  try {
    const nodemailer = require("nodemailer");
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"FondPeace" <${process.env.SMTP_USER}>`,
        to: toEmail,
        subject: `Your FondPeace Verification Code: ${otpCode} 🛡️`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 800;">FondPeace</h2>
              <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">Empowering Gen Z Creators & Viewers</p>
            </div>
            <p style="font-size: 15px; color: #1e293b;">Hey <strong>${username || "there"}</strong>,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.5;">Use the following 6-digit verification code to verify your email on FondPeace. This code is valid for 10 minutes:</p>
            <div style="text-align: center; margin: 28px 0;">
              <span style="display: inline-block; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #1d4ed8; background: #eff6ff; padding: 14px 28px; border-radius: 10px; border: 1px dashed #93c5fd;">
                ${otpCode}
              </span>
            </div>
            <p style="font-size: 12px; color: #94a3b8; text-align: center;">If you didn't request this code, you can safely ignore this email.</p>
          </div>
        `,
      });
      return { sent: true, method: "smtp" };
    }
  } catch (err) {
    console.warn("Nodemailer dispatch warning (falling back):", err.message);
  }

  // Safe fallback / console logger in development or without SMTP
  console.log(`[FondPeace OTP Service] 📧 Email to: ${toEmail} | Code: ${otpCode} (Valid 10m)`);
  return { sent: true, method: "console_simulated" };
}

// 1. Send Email Verification Code
router.post("/otp/send-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: "User account with this email not found" });
    }

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.emailOtp = otp;
    user.emailOtpExpiresAt = expiresAt;
    await user.save();

    await dispatchEmailOtp(cleanEmail, otp, user.username);

    return res.status(200).json({
      success: true,
      message: `6-digit verification code sent to ${cleanEmail}`,
      expiresAt,
      devOtp: process.env.NODE_ENV !== "production" ? otp : undefined,
    });
  } catch (error) {
    console.error("Send Email OTP Error:", error);
    return res.status(500).json({ success: false, message: "Error sending verification code", error: error.message });
  }
});

// 2. Verify Email OTP Code
router.post("/otp/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and 6-digit code are required" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found" });
    }

    if (!user.emailOtp || !user.emailOtpExpiresAt) {
      return res.status(400).json({ success: false, message: "No active verification code found. Please request a new one." });
    }

    if (new Date() > new Date(user.emailOtpExpiresAt)) {
      return res.status(400).json({ success: false, message: "Verification code has expired. Please request a new one." });
    }

    if (user.emailOtp !== cleanOtp) {
      return res.status(400).json({ success: false, message: "Invalid verification code. Please check and re-enter." });
    }

    // Mark as email verified
    user.isEmailVerified = true;
    user.emailOtp = null;
    user.emailOtpExpiresAt = null;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Email successfully verified! Verified Shield badge unlocked 🛡️✨",
      isEmailVerified: true,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        isEmailVerified: true,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error("Verify Email OTP Error:", error);
    return res.status(500).json({ success: false, message: "Error verifying code", error: error.message });
  }
});

// 3. Update Rich Creator & Profile Details
router.post("/profile/update-rich-details", async (req, res) => {
  try {
    const {
      userId,
      accountType,
      category,
      tagline,
      interests,
      socialLinks,
      pronouns,
      dateOfBirth,
      bio,
      website,
      name
    } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "UserId is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (name !== undefined) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (website !== undefined) user.website = website;
    if (accountType !== undefined) user.accountType = accountType;
    if (category !== undefined) user.category = category;
    if (tagline !== undefined) user.tagline = tagline;
    if (pronouns !== undefined) user.pronouns = pronouns;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;

    if (Array.isArray(interests)) {
      user.interests = interests.map((t) => (t.startsWith("#") ? t : `#${t}`.trim()));
    }

    if (socialLinks && typeof socialLinks === "object") {
      user.socialLinks = {
        ...user.socialLinks,
        ...socialLinks
      };
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile details updated successfully! ✨",
      user: {
        _id: user._id,
        username: user.username,
        name: user.name,
        accountType: user.accountType,
        category: user.category,
        tagline: user.tagline,
        interests: user.interests,
        socialLinks: user.socialLinks,
        pronouns: user.pronouns,
        isEmailVerified: user.isEmailVerified,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error("Update Rich Details Error:", error);
    return res.status(500).json({ success: false, message: "Error updating profile details", error: error.message });
  }
});

module.exports = router;
