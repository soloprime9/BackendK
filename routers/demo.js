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

// Debug helpers
const log = (...args) => console.log("🟩 [DEBUG]", ...args);
const errLog = (...args) => console.error("❌ [ERROR]", ...args);

// Cloudflare R2 Client
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

// Multer in-memory
const upload = multer({ storage: multer.memoryStorage() });

// Convert seconds → ISO 8601
function secondsToISO(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `PT${h ? h + "H" : ""}${m ? m + "M" : ""}${s}S`;
}

// Get video duration in seconds
function getVideoDurationInSeconds(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const totalSeconds = Math.floor(metadata.format.duration || 0);
      resolve(totalSeconds);
    });
  });
}

// Upload route
router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
  const { file } = req;
  const userId = req.user.UserId;
  const { title, tags } = req.body;

  if (!file) return res.status(400).json({ error: "No file uploaded" });

  log("Upload started for:", file.originalname);
  log("Media type:", file.mimetype);

  try {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const safeFileKey = `${timestamp}${ext}`;
    const mediaType = file.mimetype;

    // Step 1: Upload video/image to R2
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
    let thumbnailUrl = mediaUrl; // default for images
    let durationSeconds = 0;

    // Step 2: Handle video
    if (mediaType.startsWith("video")) {
      const tempVideoPath = `/tmp/${timestamp}${ext}`;
      const thumbFileName = `thumb-${timestamp}.png`;
      const thumbPath = `/tmp/${thumbFileName}`;
      fs.writeFileSync(tempVideoPath, file.buffer);

      try {
        // Generate high-quality thumbnail safely
        await new Promise((resolve) => {
          ffmpeg(tempVideoPath)
            .screenshots({
              timestamps: ["00:00:01.000", "00:00:00.000"], // fallback
              filename: thumbFileName,
              folder: "/tmp",
              size: "1280x720", // HD 16:9
            })
            .on("end", resolve)
            .on("error", (err) => {
              errLog("⚠️ Thumbnail generation failed:", err);
              resolve(); // continue anyway
            });
        });

        // Upload thumbnail if exists
        if (fs.existsSync(thumbPath)) {
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
          fs.unlinkSync(thumbPath); // cleanup
        } else {
          log("⚠️ Thumbnail missing, using video URL as fallback");
        }

        // Duration
        durationSeconds = await getVideoDurationInSeconds(tempVideoPath);
      } catch (err) {
        errLog("❌ Video processing error:", err);
        thumbnailUrl = mediaUrl;
        durationSeconds = 0;
      } finally {
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath); // cleanup temp video
      }
    }

    // Step 3: Save post in MongoDB
    const newPost = new Post({
      userId,
      title,
      tags: tags ? tags.split(",").map((t) => t.trim()) : [],
      media: mediaUrl,
      thumbnail: thumbnailUrl,
      mediaType,
      duration: durationSeconds, // store as number
      likes: [],
      comments: [],
    });

    const savedPost = await newPost.save();

    res.status(200).json({
      success: true,
      post: savedPost,
      mediaUrl,
      thumbnailUrl,
      duration: durationSeconds,
      durationISO: secondsToISO(durationSeconds), // frontend/Google-ready
    });

    log("✅ Upload completed successfully for:", file.originalname);
  } catch (error) {
    errLog("❌ Upload failed:", error);
    res.status(500).json({ error: error.message || "Upload failed" });
  }
});

// Optional check route
router.get("/check", (req, res) => res.json({ message: "Access granted!" }));

module.exports = router;









// const express = require("express");
// const router = express.Router();
// const multer = require("multer");
// const ffmpeg = require("fluent-ffmpeg");
// const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
// const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
// const dotenv = require("dotenv");
// const fs = require("fs");
// const path = require("path");
// const Post = require("../models/Post");
// const verifyToken = require("../middleware/verifyToken");

// dotenv.config();
// ffmpeg.setFfmpegPath(ffmpegPath);

// // 🟩 Debug Log Helper
// const log = (...args) => console.log("🟩 [DEBUG]", ...args);
// const errLog = (...args) => console.error("❌ [ERROR]", ...args);

// // ✅ Cloudflare R2 (AWS SDK v3)
// const r2Client = new S3Client({
//   region: "auto",
//   endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
//   credentials: {
//     accessKeyId: process.env.R2_ACCESS_KEY_ID,
//     secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
//   },
// });

// const BUCKET_NAME = process.env.R2_BUCKET_NAME;
// const PUBLIC_BASE_URL = `https://${process.env.R2_PUBLIC_DOMAIN}`;


// // 🎬 Convert video duration → ISO 8601 format (Google-friendly)
// function getVideoDurationISO(filePath) {
//   return new Promise((resolve, reject) => {
//     ffmpeg.ffprobe(filePath, (err, metadata) => {
//       if (err) return reject(err);

//       const totalSeconds = Math.floor(metadata.format.duration);

//       const hours = Math.floor(totalSeconds / 3600);
//       const minutes = Math.floor((totalSeconds % 3600) / 60);
//       const seconds = totalSeconds % 60;

//       const iso =
//         "PT" +
//         (hours > 0 ? `${hours}H` : "") +
//         (minutes > 0 ? `${minutes}M` : "") +
//         (seconds > 0 ? `${seconds}S` : "");

//       resolve(iso);
//     });
//   });
// }



// // ✅ Multer (in-memory)
// const upload = multer({ storage: multer.memoryStorage() });


// router.get("/check", (req, res) => {
//   res.json({ message: "Access granted!", user: req.user });
// });

// // ✅ UPLOAD ROUTE WITH DEBUGGING
// router.post("/upload",verifyToken, upload.single("file"), async (req, res) => {
//   const { file } = req;
//   const userId = req.user.UserId;
//   const { title, tags } = req.body;

//   if (!file) {
//     errLog("No file uploaded!");
//     return res.status(400).json({ error: "No file uploaded" });
//   }

//   log("Upload started for:", file.originalname);
//   log("Media type:", file.mimetype);

//   try {
//     const timestamp = Date.now();
//     const ext = path.extname(file.originalname);
//     const safeFileKey = `${timestamp}${ext}`;
//     const mediaType = file.mimetype;

//     // ✅ Step 1: Upload to R2
//     log("Uploading file to R2...");
//     await r2Client.send(
//       new PutObjectCommand({
//         Bucket: BUCKET_NAME,
//         Key: safeFileKey,
//         Body: file.buffer,
//         ContentType: mediaType,
//       })
//     );
//     log("✅ File uploaded to R2:", safeFileKey);

//     const mediaUrl = `${PUBLIC_BASE_URL}/${safeFileKey}`;
//     let thumbnailUrl = "";
//     let durationISO = null; // ⭐ will store video duration


//     // ✅ Step 2: Generate Thumbnail for Video
//     if (mediaType.startsWith("video")) {
//       log("Generating video thumbnail...");
//       const tempVideoPath = `/tmp/${timestamp}${ext}`;
//       const thumbFileName = `thumb-${timestamp}.png`;
//       const thumbPath = `/tmp/${thumbFileName}`;

//       fs.writeFileSync(tempVideoPath, file.buffer);
//       log("Temp video file written:", tempVideoPath);

//       await new Promise((resolve, reject) => {
//         ffmpeg(tempVideoPath)
//           .screenshots({
//             timestamps: ["00:00:01.000"],
//             filename: thumbFileName,
//             folder: "/tmp",
//             size: "320x240",
//           })
//           .on("end", () => {
//             log("✅ Thumbnail generated:", thumbFileName);
//             resolve();
//           })
//           .on("error", (error) => {
//             errLog("❌ Thumbnail generation failed:", error);
//             reject(error);
//           });
//       });

//       const thumbBuffer = fs.readFileSync(thumbPath);
//       await r2Client.send(
//         new PutObjectCommand({
//           Bucket: BUCKET_NAME,
//           Key: thumbFileName,
//           Body: thumbBuffer,
//           ContentType: "image/png",
//         })
//       );
//       log("✅ Thumbnail uploaded to R2:", thumbFileName);
//       thumbnailUrl = `${PUBLIC_BASE_URL}/${thumbFileName}`;
      
//       durationISO = await getVideoDurationISO(tempVideoPath);
//       log("🎬 ISO Duration:", durationISO);

      
//     } else if (mediaType.startsWith("image")) {
//       log("Image upload detected — no thumbnail generation needed.");
//       thumbnailUrl = mediaUrl;
//     } else {
//       errLog("Unsupported file type:", mediaType);
//       return res.status(400).json({ error: "Unsupported file type" });
//     }

//     // ✅ Step 3: Save Post in MongoDB
//     log("Saving post in MongoDB...");
//     const newPost = new Post({
//       userId,
//       title,
//       tags: tags ? tags.split(",").map((t) => t.trim()) : [],
//       media: mediaUrl,
//       thumbnail: thumbnailUrl,
//       mediaType,
//       duration: durationISO,
//       likes: [],
//       comments: [],
//     });

//     const savedPost = await newPost.save();
//     log("✅ Post saved successfully:", savedPost._id);

//     res.status(200).json({
//       success: true,
//       post: savedPost,
//       mediaUrl,
//       thumbnailUrl,
//       duration: durationISO,
//     });

//     log("✅ Upload completed successfully for:", file.originalname);
//   } catch (error) {
//     errLog("Upload failed:", error);
//     res.status(500).json({ error: error.message || "Upload failed" });
//   }
// });

// // ✅ Global crash logger (for Render/Vercel)
// process.on("unhandledRejection", (reason) => {
//   errLog("💥 Unhandled Rejection:", reason);
// });

// process.on("uncaughtException", (error) => {
//   errLog("💥 Uncaught Exception:", error);
// });

// module.exports = router;











