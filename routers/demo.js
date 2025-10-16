const express = require("express");
const router = express.Router();
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const Post = require("../models/Post");
const verifyToken = require("../middleware/verifyToken");

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

// 🟩 Debug Log Helper
const log = (...args) => console.log("🟩 [DEBUG]", ...args);
const errLog = (...args) => console.error("❌ [ERROR]", ...args);

// ✅ Cloudflare R2 (AWS SDK v3)
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const PUBLIC_BASE_URL = `https://${process.env.R2_PUBLIC_DOMAIN}`;

// ✅ Multer (in-memory)
const upload = multer({ storage: multer.memoryStorage() });


router.get("/check", (req, res) => {
  res.json({ message: "Access granted!", user: req.user });
});

// ✅ UPLOAD ROUTE WITH DEBUGGING
router.post("/upload", upload.single("file"), async (req, res) => {
  const { file } = req;
  const userId = req.user.UserId;
  const { title, tags } = req.body;
res.json({ message: "Access granted!", user: req.user });
  if (!file) {
    errLog("No file uploaded!");
    return res.status(400).json({ error: "No file uploaded" });
  }

  log("Upload started for:", file.originalname);
  log("Media type:", file.mimetype);

  try {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const safeFileKey = `${timestamp}${ext}`;
    const mediaType = file.mimetype;

    // ✅ Step 1: Upload to R2
    log("Uploading file to R2...");
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: safeFileKey,
        Body: file.buffer,
        ContentType: mediaType,
      })
    );
    log("✅ File uploaded to R2:", safeFileKey);

    const mediaUrl = `${PUBLIC_BASE_URL}/${safeFileKey}`;
    let thumbnailUrl = "";

    // ✅ Step 2: Generate Thumbnail for Video
    if (mediaType.startsWith("video")) {
      log("Generating video thumbnail...");
      const tempVideoPath = `/tmp/${timestamp}${ext}`;
      const thumbFileName = `thumb-${timestamp}.png`;
      const thumbPath = `/tmp/${thumbFileName}`;

      fs.writeFileSync(tempVideoPath, file.buffer);
      log("Temp video file written:", tempVideoPath);

      await new Promise((resolve, reject) => {
        ffmpeg(tempVideoPath)
          .screenshots({
            timestamps: ["00:00:01.000"],
            filename: thumbFileName,
            folder: "/tmp",
            size: "320x240",
          })
          .on("end", () => {
            log("✅ Thumbnail generated:", thumbFileName);
            resolve();
          })
          .on("error", (error) => {
            errLog("❌ Thumbnail generation failed:", error);
            reject(error);
          });
      });

      const thumbBuffer = fs.readFileSync(thumbPath);
      await r2Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: thumbFileName,
          Body: thumbBuffer,
          ContentType: "image/png",
        })
      );
      log("✅ Thumbnail uploaded to R2:", thumbFileName);
      thumbnailUrl = `${PUBLIC_BASE_URL}/${thumbFileName}`;
    } else if (mediaType.startsWith("image")) {
      log("Image upload detected — no thumbnail generation needed.");
      thumbnailUrl = mediaUrl;
    } else {
      errLog("Unsupported file type:", mediaType);
      return res.status(400).json({ error: "Unsupported file type" });
    }

    // ✅ Step 3: Save Post in MongoDB
    log("Saving post in MongoDB...");
    const newPost = new Post({
      userId,
      title,
      tags: tags ? tags.split(",").map((t) => t.trim()) : [],
      media: mediaUrl,
      thumbnail: thumbnailUrl,
      mediaType,
      likes: [],
      comments: [],
    });

    const savedPost = await newPost.save();
    log("✅ Post saved successfully:", savedPost._id);

    res.status(200).json({
      success: true,
      post: savedPost,
      mediaUrl,
      thumbnailUrl,
    });

    log("✅ Upload completed successfully for:", file.originalname);
  } catch (error) {
    errLog("Upload failed:", error);
    res.status(500).json({ error: error.message || "Upload failed" });
  }
});

// ✅ Global crash logger (for Render/Vercel)
process.on("unhandledRejection", (reason) => {
  errLog("💥 Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  errLog("💥 Uncaught Exception:", error);
});

module.exports = router;






