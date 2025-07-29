const express = require("express");
const router = express.Router();

const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const AWS = require("aws-sdk");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

const verifyToken = require("../middleware/verifyToken");
const Post = require("../models/Post");

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

// ✅ Cloudflare R2 AWS SDK setup
const r2 = new AWS.S3({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: "auto",
  signatureVersion: "v4",
});

// ✅ Use public `.r2.dev` base domain for public access
const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const PUBLIC_BASE_URL = `https://${process.env.R2_PUBLIC_DOMAIN}`;

// ✅ Multer (in-memory)
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Upload Route
router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
  const { file } = req;
  const userId = req.user.UserId;
  const { title, tags } = req.body;

  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const safeFileKey = `${timestamp}${ext}`;
    const mediaType = file.mimetype;

    // ✅ Upload original file to R2
    await r2
      .upload({
        Bucket: BUCKET_NAME,
        Key: safeFileKey,
        Body: file.buffer,
        ContentType: mediaType,
      })
      .promise();

    const mediaUrl = `${PUBLIC_BASE_URL}/${safeFileKey}`;
    let thumbnailUrl = "";

    // ✅ Generate video thumbnail
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

      await r2
        .upload({
          Bucket: BUCKET_NAME,
          Key: thumbFileName,
          Body: thumbBuffer,
          ContentType: "image/png",
        })
        .promise();

      thumbnailUrl = `${PUBLIC_BASE_URL}/${thumbFileName}`;
    } else if (mediaType.startsWith("image")) {
      thumbnailUrl = mediaUrl;
    } else {
      return res.status(400).json({ error: "Unsupported file type." });
    }

    // ✅ Save post to MongoDB
    const newPost = new Post({
      userId,
      title,
      tags: tags ? tags.split(",").map((tag) => tag.trim()) : [],
      media: mediaUrl,
      thumbnail: thumbnailUrl,
      mediaType,
      likes: [],
      comments: [],
      medias: {
        url: mediaUrl,
        type: mediaType,
      },
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
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
