// routes/upload.js
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

// ✅ Configure Cloudflare R2 (AWS SDK v3)
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

// ✅ Multer (in-memory storage)
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Upload route (with thumbnail for video)
router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
  const { file } = req;
  const userId = req.user.UserId;
  const { title, tags } = req.body;

  if (!file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const safeFileKey = `${timestamp}${ext}`;
    const mediaType = file.mimetype;

    // ✅ Upload file to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: safeFileKey,
        Body: file.buffer,
        ContentType: mediaType,
      })
    );

    const mediaUrl = `${PUBLIC_BASE_URL}/${safeFileKey}`;
    let thumbnailUrl = "";

    // ✅ Generate thumbnail for videos
    if (mediaType.startsWith("video")) {
      const tempVideoPath = `/tmp/${timestamp}${ext}`;
      const thumbFileName = `thumb-${timestamp}.png`;
      const thumbPath = `/tmp/${thumbFileName}`;

      fs.writeFileSync(tempVideoPath, file.buffer);

      await new Promise((resolve, reject) => {
        ffmpeg(tempVideoPath)
          .screenshots({
            timestamps: ["00:00:01.000"],
            filename: thumbFileName,
            folder: "/tmp",
            size: "320x240",
          })
          .on("end", resolve)
          .on("error", reject);
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

      thumbnailUrl = `${PUBLIC_BASE_URL}/${thumbFileName}`;
    } else if (mediaType.startsWith("image")) {
      thumbnailUrl = mediaUrl;
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    // ✅ Save post in MongoDB
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

    res.status(200).json({
      success: true,
      post: savedPost,
      mediaUrl,
      thumbnailUrl,
    });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

module.exports = router;
           


















