// const express = require("express");
// const router = express.Router();
// const multer = require("multer");
// const fs = require("fs");
// const path = require("path");

// const ffmpeg = require("fluent-ffmpeg");
// const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
// ffmpeg.setFfmpegPath(ffmpegPath);

// const { InputFile } = require("node-appwrite/file");
// const { Client, Storage, ID, Permission, Role } = require("node-appwrite");

// const verifyToken = require("../middleware/verifyToken");
// const Post = require("../models/Post");
// const User = require("../models/User");

// const upload = multer({ storage: multer.memoryStorage() });

// const client = new Client()
//   .setEndpoint('https://nyc.cloud.appwrite.io/v1')
//   .setProject('fondpeace')
//   .setKey('standard_9cb8608dc006c334c4b845280bdb2ffbe860b8487d3e23d394e6bd01c3c64bda113c5d24cc1517f73dea2cdb18c7e634b6f61777b6e154b6f968c070890382653269d818aba5b98158c37f2152c8a589f3283e70ff7478d2fdff081275f0f5318e3f037b111670a563680b6868871322935f3aac43bbf9befbb2a691f58c2bfa');

// const storage = new Storage(client);
// const BUCKET_ID = "685fc9880036ec074baf";

// router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
//   const timestamp = Date.now();
//   const tmpDir = path.join(__dirname, "../tmp");
//   const inputPath = path.join(tmpDir, `input-${timestamp}.mp4`);
//   const thumbPath = path.join(tmpDir, `thumb-${timestamp}.png`);

//   try {
//     const { file } = req;
//     const userId = req.user.UserId;
//     const { title, tags } = req.body;

//     if (!file) return res.status(400).json({ error: "No file uploaded" });

//     if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

//     fs.writeFileSync(inputPath, file.buffer);

//     const mediaType = file.mimetype;
//     if (!mediaType.startsWith("video"))
//       return res.status(400).json({ error: "Only video files allowed" });

//     const uploadedVideo = await storage.createFile(
//       BUCKET_ID,
//       ID.unique(),
//       InputFile.fromBuffer(file.buffer, file.originalname),
//       [Permission.read(Role.any())]
//     );

//     const endpoint = client.config.endpoint;
//     const project = client.config.project;
//     const mediaUrl = `${endpoint}/storage/buckets/${BUCKET_ID}/files/${uploadedVideo.$id}/view?project=${project}`;

//     // Generate thumbnail
//     await new Promise((resolve, reject) => {
//       ffmpeg(inputPath)
//         .on("end", resolve)
//         .on("error", reject)
//         .screenshots({
//           timestamps: ["00:00:01.000"],
//           filename: path.basename(thumbPath),
//           folder: path.dirname(thumbPath),
//           size: "320x240",
//         });
//     });

//     const thumbnailBuffer = fs.readFileSync(thumbPath);
//     const uploadedThumb = await storage.createFile(
//       BUCKET_ID,
//       ID.unique(),
//       InputFile.fromBuffer(thumbnailBuffer, "thumbnail.png"),
//       [Permission.read(Role.any())]
//     );

//     const thumbnailUrl = `${endpoint}/storage/buckets/${BUCKET_ID}/files/${uploadedThumb.$id}/preview?project=${project}`;

//     const newPost = new Post({
//       userId,
//       title,
//       tags: tags ? tags.split(",").map(tag => tag.trim()) : [],
//       media: mediaUrl,
//       thumbnail: thumbnailUrl,
//       mediaType,
//       likes: [],
//       comments: [],
//       medias: {
//         url: mediaUrl,
//         type: mediaType,
//       },
//     });

//     const savedPost = await newPost.save();

//     res.status(200).json({
//       success: true,
//       post: savedPost,
//       mediaUrl,
//       thumbnail: thumbnailUrl,
//     });
//   } catch (err) {
//     console.error("🔥 Thumbnail-only upload error:", err);
//     res.status(500).json({ error: err.message || "Internal Server Error" });
//   } finally {
//     if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
//     if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
//   }
// });


const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs"); // Still needed for potential in-memory buffer operations if direct stream is not feasible with ffmpeg
const path = require("path");

const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

const { InputFile } = require("node-appwrite/file");
const { Client, Storage, ID, Permission, Role } = require("node-appwrite");

const verifyToken = require("../middleware/verifyToken");
const Post = require("../models/Post");
const User = require("../models/User");

const upload = multer({ storage: multer.memoryStorage() });

const client = new Client()
  .setEndpoint('https://nyc.cloud.appwrite.io/v1')
  .setProject('fondpeace')
  .setKey('standard_9cb8608dc006c334c4b845280bdb2ffbe860b8487d3e23d394e6bd01c3c64bda113c5d24cc1517f73dea2cdb18c7e634b6f61777b6e154b6f968c070890382653269d818aba5b98158c37f2152c8a589f3283e70ff7478d2fdff081275f0f5318e3f037b111670a563680b6868871322935f3aac43bbf9befbb2a691f58c2bfa');

const storage = new Storage(client);
const BUCKET_ID = "685fc9880036ec074baf";

router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
  let mediaUrl;
  let thumbnailUrl;

  try {
    const { file } = req;
    const userId = req.user.UserId;
    const { title, tags } = req.body;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const mediaType = file.mimetype;

    // Upload the main file (video or image)
    const uploadedFile = await storage.createFile(
      BUCKET_ID,
      ID.unique(),
      InputFile.fromBuffer(file.buffer, file.originalname),
      [Permission.read(Role.any())]
    );

    const endpoint = client.config.endpoint;
    const project = client.config.project;
    mediaUrl = `${endpoint}/storage/buckets/${BUCKET_ID}/files/${uploadedFile.$id}/view?project=${project}`;

    if (mediaType.startsWith("video")) {
      // Generate thumbnail for video
      const buffers = [];
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(require('stream').Readable.from(file.buffer)) // Input directly from buffer
          .on("end", () => {
            console.log("Thumbnail generation finished");
            resolve();
          })
          .on("error", (err) => {
            console.error("Error generating thumbnail:", err);
            reject(err);
          })
          .outputOptions([
            "-vf", "thumbnail",
            "-frames:v", "1",
            "-s", "320x240" // Specify thumbnail size
          ])
          .outputFormat("image2pipe")
          .pipe()
          .on('data', (chunk) => buffers.push(chunk))
          .on('end', () => {
            // This is crucial: collect all data chunks into a single buffer
            // and resolve the promise after all chunks have been received.
            // The actual Appwrite upload will happen outside this promise.
          })
          .on('close', () => { // Use 'close' for when the pipe finishes
            // This 'close' event handler is where you should resolve the promise
            // and perform the Appwrite upload with the collected buffer.
            // However, the Appwrite upload should happen AFTER the Promise resolves.
          });
      });

      const thumbnailBuffer = Buffer.concat(buffers); // Concatenate all collected chunks
      const uploadedThumb = await storage.createFile(
        BUCKET_ID,
        ID.unique(),
        InputFile.fromBuffer(thumbnailBuffer, "thumbnail.png"),
        [Permission.read(Role.any())]
      );
      thumbnailUrl = `${endpoint}/storage/buckets/${BUCKET_ID}/files/${uploadedThumb.$id}/preview?project=${project}`;

    } else if (mediaType.startsWith("image")) {
      // For images, the media URL is the thumbnail URL
      thumbnailUrl = `${endpoint}/storage/buckets/${BUCKET_ID}/files/${uploadedFile.$id}/preview?project=${project}`;
    } else {
      return res.status(400).json({ error: "Unsupported file type. Only videos and images are allowed." });
    }

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
      thumbnail: thumbnailUrl,
    });
  } catch (err) {
    console.error("🔥 Upload error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  }
});


// // Cloudinary Configure
// cloudinary.config({
//     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,

//     api_key: process.env.CLOUDINARY_API_KEY,
//     api_secret: process.env.CLOUDINARY_API_SECRET 
// });

// console.log({
//     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//     api_key: process.env.CLOUDINARY_API_KEY,
//     api_secret: process.env.CLOUDINARY_API_SECRET
// });

// // Multer Storage for File Uploads (Memory Storage for Buffer)
// const storage = multer.memoryStorage();
// const upload = multer({ storage });




// router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
//     const title = req.body.title;
//     const UserId = req.user.UserId;
    
//     try {
//         // ✅ Check if User Exists
//         const user = await User.findById(UserId);
//         if (!user) {
//             return res.status(404).json({ success: false, message: "User Not Found" });
//         }

//         // ✅ Check if File is Uploaded
//         if (!req.file) {
//             return res.status(400).json({ success: false, message: "No file uploaded" });
//         }

//         // ✅ Set Upload Timeout (25 Seconds)
//         const PromiseTimeOut = new Promise((_, reject) => {
//             setTimeout(() => reject(new Error("Time Out - Try Smaller File")), 25000);
//         });

//         // ✅ Upload to Cloudinary
//         const UploadPromise = new Promise((resolve, reject) => {
//             const stream = cloudinary.uploader.upload_stream({ resource_type: "auto" },
//                 (error, result) => (error ? reject(error) : resolve(result))
//             );
//             stream.end(req.file.buffer);
//         });

//         // // ✅ Wait for Cloudinary Upload (With Timeout Protection)
//         // const uploadResult = await Promise.race([UploadPromise, PromiseTimeOut]);

//         // // ✅ Create New Post in MongoDB
//         // const newPost = new Post({
//         //     userId: UserId,
//         //     title: req.body.title,
//         //     media: uploadResult.secure_url, // ✅ Cloudinary URL
//         //     tags: req.body.title.split("#").slice(1).map(tag => tag.trim().split(" ")[0]),
//         //     likes: [],
//         //     comments: [],
//         // });

//         // Wait for Cloudinary Upload (With Timeout Protection)
//         const uploadResult = await Promise.race([UploadPromise, PromiseTimeOut]);
        
//         // Extract the secure URL from the upload result
//         const mediaUrl = uploadResult.secure_url;
        
//         // Initialize the thumbnail variable
//         let thumbnail = "";
        
//         // Determine if the uploaded media is a video
//         if (mediaUrl.includes("/video/")) {
//           // Extract the public ID of the video from the URL
//           const publicId = mediaUrl
//             .split("/upload/")[1]
//             .split(".")[0];
        
//           // Construct the thumbnail URL by requesting a frame at 2 seconds
//           thumbnail = `https://res.cloudinary.com/dczulxzko/video/upload/so_2/${publicId}.jpg`;
//             } else {
//               // If the media is an image, use the same URL as the thumbnail
//               thumbnail = mediaUrl;
//             }
            
//             // Create a new Post document in MongoDB
//             const newPost = new Post({
//               userId: UserId,
//               title: req.body.title,
//               media: mediaUrl, // Cloudinary URL
//               thumbnail: thumbnail, // Generated thumbnail URL
//               tags: req.body.title
//                 .split("#")
//                 .slice(1)
//                 .map((tag) => tag.trim().split(" ")[0]),
//               likes: [],
//               comments: [],
//             });
            
//             // Save the new post to MongoDB
//             await newPost.save();


//         // await newPost.save(); // ✅ Save Post to MongoDB

//         console.log("Upload Success:", newPost);
//         return res.status(200).json({ success: true, message: "Upload successful", post: newPost });

//     } catch (error) {
//         console.error("Upload Error:", error);
        
//         return res.status(500).json({ 
//             success: false, 
//             message: error.message.includes("Time Out") ? "Time Out - Try Smaller File" : "Upload Failed"
//         });
//     }
// });


router.get("/mango/getall", async (req, res) => {
    try {
      const posts = await Post.find({}).populate("userId", "username").populate("comments", "userId");
      
      
  
       res.status(200).json(posts);
      
    } catch (error) {
      return res.status(500).json({ message: "Error fetching posts", error: error.message });
    }
  });
  
router.delete("/delete/:postId", async (req, res) => {
    try{
    const postId = req.params.postId;
    const delet = await Post.findByIdAndDelete(postId);
    if(!delet){
        res.status(404).json("Post Id is wrong");
    }

    await res.status(200).json(delet);
    console.log("successfully Deleted");

    }
    catch(error){
        res.status(500).json(error);
    }

})


router.get('/shorts', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 5;
  const skip = (page - 1) * limit;

  try {
    const total = await Post.countDocuments({ media: { $regex: /\.mp4$/i } });

    const videos = await Post.find({ mediaType: { $regex: /^video\// } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username')
        .populate('comments', 'userId')
        .populate('likes', 'userId');


    res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      videos,
    });
  } catch (error) {
    console.error('Error fetching shorts:', error);
    res.status(500).json({ message: 'Server error', error });
  }
});


// router.post("/like/:postId", verifyToken, async(req, res) => {
    
//     try{
//     const UserId = req.user.UserId;
//     console.log(UserId);
//     const postId = req.params.postId;
//     const like = await Post.findById(postId);
//     if(!like){
//         res.status(404).json("Post is not Found");
//     }
    

//     const UserExist = like.likes.includes(UserId);
//     if(UserExist){
//         like.likes = like.likes.filter((id) => id !== UserId);
//     }
//     else{
//         like.likes.push(UserId);
//     }

//     await like.save();    
//     await res.status(200).json(like);
    
//     }
//     catch(error){
//         res.status(500).json(error);
//         console.log(error);
//     }

// })


router.post("/like/:postId", verifyToken, async (req, res) => {
    try {
        const UserId = req.user.UserId;
        const postId = req.params.postId;
        const like = await Post.findById(postId);
        
        if (!like) {
            return res.status(404).json("Post not found");
        }

        // Ensure the 'likes' array exists (it should, if your schema is set up correctly)
        // if (!like.likes) {
        //     like.likes = [];
        // }

        const UserExist = like.likes.includes(UserId);
        if (UserExist) {
            like.likes = like.likes.filter((id) => id != UserId);
            await like.save();
            

            
            console.log("unlike: ", like.likes);
        } else {
            like.likes.push(UserId);
            await like.save();
            console.log("like: ", like.likes);
        }

        
         res.status(200).json(like);
         console.log(like);
        
    } catch (error) {
        console.log(error);
        return res.status(500).json(error);
    }
});

router.post("/comment/:postId", verifyToken, async (req, res) => {
  try {
    const CommentText = req.body.CommentText;
    const userId = req.user.UserId; // from decoded token
    const postId = req.params.postId;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json("Post Not Found");
    }

    const comment = {
      UserId: userId,
      CommentText,
      likes: 0,
      createdAt: new Date(),
    };

    post.comments.push(comment);
    await post.save();

    res.status(200).json(post);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json(error.message || "Server Error");
  }
});


// router.post("/comment/:postId", async (req, res) => {
//   try {
//     const { userId, CommentText } = req.body; // Destructure userId and CommentText from the request body
//     const postId = req.params.postId;

//     const post = await Post.findById(postId);
//     if (!post) {
//       return res.status(404).json("Post Not Found");
//     }

//     const comment = {
//       userId,
//       CommentText,
//       likes: 0,
//       createdAt: new Date(),
//     };

//     post.comments.push(comment);
//     await post.save();

//     res.status(200).json(post);
//   } catch (error) {
//     console.error("Error adding comment:", error);
//     res.status(500).json(error.message || "Server Error");
//   }
// });




router.get("/comment/:postId", async (req, res) => {
  try {
    const postId = req.params.postId;

    const post = await Post.findById(postId).populate({
      path: 'comments.userId',
      select: 'username profilePicture'
    });

    if (!post) {
      return res.status(404).json("Post Not Found");
    }

    res.status(200).json(post.comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});



router.post("/comment/:postId/reply/:commentId", verifyToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { replyText } = req.body;
    const userId = req.user.UserId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json("Post not found");

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json("Comment not found");

    comment.replies.push({
      userId,
      replyText,
      likes: []
    });

    await post.save();
    res.status(200).json(comment.replies);
  } catch (error) {
    console.error("Reply error:", error);
    res.status(500).json("Server Error");
  }
});


// POST /comment/:postId/like/:commentId
router.post("/comment/:postId/like/:commentId", verifyToken, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const userId = req.user.UserId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json("Post not found");

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json("Comment not found");

    const index = comment.likes.indexOf(userId);

    if (index === -1) {
      comment.likes.push(userId);
    } else {
      comment.likes.splice(index, 1); // Unlike
    }

    await post.save();
    res.status(200).json({ liked: index === -1 });
  } catch (error) {
    console.error("Comment like error:", error);
    res.status(500).json("Server Error");
  }
});


// POST /comment/:postId/like-reply/:commentId/:replyId
router.post("/comment/:postId/like-reply/:commentId/:replyId", verifyToken, async (req, res) => {
  try {
    const { postId, commentId, replyId } = req.params;
    const userId = req.user.UserId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json("Post not found");

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json("Comment not found");

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json("Reply not found");

    const index = reply.likes.indexOf(userId);

    if (index === -1) {
      reply.likes.push(userId);
    } else {
      reply.likes.splice(index, 1); // Unlike
    }

    await post.save();
    res.status(200).json({ liked: index === -1 });
  } catch (error) {
    console.error("Reply like error:", error);
    res.status(500).json("Server Error");
  }
});



router.get("/single/:id", async(req, res) =>{
    
   try{
    const{ id } = req.params;
    const celect = await Post.findById(id).populate('userId', 'username');    
    if(!celect){
        return res.status(400).json("Post not found");

    }
    res.status(200).json(celect)

   }
   catch(error){
    console.log(error)
   }

})

module.exports = router;
