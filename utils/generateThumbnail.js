const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const os = require("os");
const fs = require("fs");

let hasFfmpeg = false;
try {
  const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
  if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    hasFfmpeg = true;
  }
} catch (_) {}

function generateThumbnail(tempFilePath, thumbFileName) {
  const outputPath = path.join(os.tmpdir(), thumbFileName);

  return new Promise((resolve) => {
    if (!hasFfmpeg || !fs.existsSync(tempFilePath)) {
      if (!fs.existsSync(tempFilePath)) console.log("❌ Input file not found:", tempFilePath);
      return resolve(null);
    }

    ffmpeg(tempFilePath)
      .on("start", (cmd) => {
        console.log("🎬 FFmpeg started:", cmd);
      })
      .on("end", () => {
        console.log("✅ Thumbnail done:", outputPath);
        resolve(outputPath);
      })
      .on("error", (err) => {
        console.log("❌ Error:", err.message);
        resolve(null); // fail-safe (server crash नहीं होगा)
      })
      .outputOptions([
        "-vf thumbnail,scale=1280:-1:flags=lanczos", // ⭐ BEST QUALITY
        "-frames:v 1",
        "-q:v 8"
      ])
      .output(outputPath)
      .run(); // 🔥 IMPORTANT (save() भी चल सकता है, but run is safer here)
  });
}

module.exports = generateThumbnail;
