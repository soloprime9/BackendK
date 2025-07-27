const express = require("express");
const router = express.Router();
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const AWS = require("aws-sdk");
const { Readable } = require("stream");
const dotenv = require("dotenv");

const verifyToken = require("../middleware/verifyToken");
const Post = require("../models/Post");

dotenv.config();
ffmpeg.setFfmpegPath(ffmpegPath);

// Configure AWS S3 for Cloudflare R2
const r2 = new AWS.S3({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: "auto",
  signatureVersion: "v4",
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
  const { file } = req;
  const userId = req.user.UserId;
  const { title, tags } = req.body;

  if (!file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const timestamp = Date.now();
    const fileKey = `${timestamp}-${file.originalname}`;
    const mediaType = file.mimetype;

    // Upload the media file to Cloudflare R2
    const mediaUpload = await r2.upload({
      Bucket: BUCKET_NAME,
      Key: fileKey,
      Body: file.buffer,
      ContentType: mediaType,
    }).promise();

    const mediaUrl = `https://${r2.endpoint.host}/${BUCKET_NAME}/${fileKey}`;
    let thumbnailUrl = "";

    // If video, generate and upload thumbnail
    if (mediaType.startsWith("video")) {
      const buffers = [];

      await new Promise((resolve, reject) => {
        ffmpeg(Readable.from(file.buffer))
          .on("error", reject)
          .on("end", resolve)
          .screenshots({
            count: 1,
            size: "320x240",
            filename: "thumbnail.png",
          })
          .outputFormat("image2pipe")
          .pipe()
          .on("data", (chunk) => buffers.push(chunk));
      });

      const thumbnailBuffer = Buffer.concat(buffers);
      const thumbKey = `thumb-${timestamp}.png`;

      const thumbUpload = await r2.upload({
        Bucket: BUCKET_NAME,
        Key: thumbKey,
        Body: thumbnailBuffer,
        ContentType: "image/png",
      }).promise();

      thumbnailUrl = `https://${r2.endpoint.host}/${BUCKET_NAME}/${thumbKey}`;
    } else if (mediaType.startsWith("image")) {
      thumbnailUrl = mediaUrl;
    } else {
      return res.status(400).json({ error: "Unsupported file type." });
    }

    // Save post in MongoDB
    const newPost = new Post({
      userId,
      title,
      tags: tags ? tags.split(",").map(tag => tag.trim()) : [],
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
