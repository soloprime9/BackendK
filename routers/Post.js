const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
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


router.post("/like/:postId", verifyToken, async (req, res) => {
  try {
    const UserId = req.user.UserId; // jwt me id
    const postId = req.params.postId;
    console.log("UserId, postId:", UserId, postId);

    const like = await Post.findById(postId);
    if (!like) {
      return res.status(404).json("Post not found");
    }

    const userObjectId = new mongoose.Types.ObjectId(UserId);

    // ✅ Null-safe check
    const UserExist = like.likes.some(
      (id) => id && id.toString() === UserId
    );

    if (UserExist) {
      like.likes = like.likes.filter(
        (id) => id && id.toString() !== UserId
      );
    } else {
      like.likes.push(userObjectId);
    }

    // Optional: Clean null/invalid entries
    like.likes = like.likes.filter(id => id);

    await like.save();

    return res.status(200).json({ likes: like.likes });
  } catch (error) {
    console.log("LIKE ERROR:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});


router.post("/view/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await Post.findByIdAndUpdate(
      id,
      { $inc: { views: 1 } },
      { new: true }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});


router.get("/mango/getall", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .populate("comments.replies.userId", "username profilePic");

    res.status(200).json(posts);

  } catch (error) {
    res.status(500).json({
      message: "Error fetching posts",
      error: error.message,
    });
  }
});



router.get("/single/search", async (req, res) => {
  try {
    const q = req.query.q?.trim();
    if (!q) return res.json([]);

    // 1️⃣ Split query into words
    const words = q.split(/\s+/).filter(Boolean);

    // 2️⃣ Build OR conditions
    const orConditions = [];

    words.forEach(word => {
      const regex = new RegExp(word, "i");

      orConditions.push({ title: regex });
      orConditions.push({ hashtags: regex });
    });

    // 3️⃣ Query DB
    const posts = await Post.find({
      $or: orConditions,
    })
      .select("title thumbnail media mediaType likes comments views userId createdAt")
      .populate("userId", "username profilePic")
      .sort({ createdAt: -1 })
      .limit(30);

    res.json(posts);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: "Search failed" });
  }
});




// router.get("/single/search", async (req, res) => {
//   try {
//     const q = req.query.q?.trim();
//     if (!q) return res.json([]);

//     const posts = await Post.find({
//       $or: [
//         { title: { $regex: q, $options: "i" } },
//         { hashtags: { $regex: q, $options: "i" } },
//       ],
//     })
//       .select("title thumbnail media mediaType likes comments views userId")
//       .populate("userId", "username profilePic")
//       .sort({ createdAt: -1 })
//       .limit(30);

//     res.json(posts);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });



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
    const videoExtensions = /\.(mp4|mov|webm|mkv|avi|flv|m4v)$/i;

    const query = { media: { $regex: videoExtensions } };
    const total = await Post.countDocuments(query);

    const videos = await Post.find(query)
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



// router.post("/like/:postId", verifyToken, async (req, res) => {
//   try {
//     const UserId = req.user.UserId;
//     const postId = req.params.postId;

//     const post = await Post.findById(postId);
//     if (!post) return res.status(404).json("Post not found");

//     const isLiked = post.likes.includes(UserId);
//     const update = isLiked
//       ? { $pull: { likes: UserId } }
//       : { $push: { likes: UserId } };

//     await Post.updateOne({ _id: postId }, update);

//     const updatedPost = await Post.findById(postId).select("likes"); // only likes
//     return res.status(200).json({ likes: updatedPost.likes });
//   } catch (error) {
//     console.log(error);
//     return res.status(500).json(error.message || "Server error");
//   }
// });



// router.post("/comment/:postId", verifyToken, async (req, res) => {
//   try {
//     const CommentText = req.body.CommentText;
//     const userId = req.user.UserId;
//     const postId = req.params.postId;

//     const post = await Post.findById(postId);
//     if (!post) return res.status(404).json("Post Not Found");

//     const comment = {
//       UserId: userId,
//       CommentText,
//       likes: 0,
//       createdAt: new Date(),
//     };

//     post.comments.push(comment);
//     await post.save({ validateModifiedOnly: true });

//     // Fetch the last comment with populated user info
//     const newComment = post.comments[post.comments.length - 1];
//     const populatedComment = await Post.findOne(
//       { _id: postId },
//       { comments: { $slice: -1 } }
//     )
//       .populate("comments.UserId", "username profilePic")
//       .then((p) => p.comments[0]);

//     return res.status(200).json({ comment: populatedComment });
//   } catch (error) {
//     console.error("Error adding comment:", error);
//     res.status(500).json(error.message || "Server Error");
//   }
// });




// router.post("/like/:postId", verifyToken, async (req, res) => {
//   try {
//     const UserId = req.user.UserId;
//     const postId = req.params.postId;

//     const post = await Post.findById(postId);
//     if (!post) return res.status(404).json("Post not found");

//     const isLiked = post.likes.includes(UserId);

//     let update;
//     if (isLiked) {
//       update = { $pull: { likes: UserId } };
//     } else {
//       update = { $push: { likes: UserId } };
//     }

//     await Post.updateOne({ _id: postId }, update);

//     const updatedPost = await Post.findById(postId); // Fetch updated post if needed

//     res.status(200).json(updatedPost);
//     console.log(isLiked ? "Unliked:" : "Liked:", updatedPost.likes);
//   } catch (error) {
//     console.log(error);
//     return res.status(500).json(error.message || "Server error");
//   }
// });




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
      userId,
      CommentText,
      likes: [], // ✅ must be an array of ObjectId
      createdAt: new Date(),
      replies: [] // ✅ optional, but better to initialize
    };

    post.comments.push(comment);
    await post.save({ validateModifiedOnly: true });

    res.status(200).json(post);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json(error.message || "Server Error");
  }
});






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
      likes: [], // ✅ Must be array of ObjectId
      createdAt: new Date()
    });

    await post.save({ validateModifiedOnly: true });
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
    const UserId = req.user.UserId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json("Post not found");

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json("Comment not found");

    const userObjectId = new mongoose.Types.ObjectId(UserId);

    const liked = comment.likes.some(id => id.toString() === UserId);

    if (liked) {
      comment.likes = comment.likes.filter(id => id.toString() !== UserId);
    } else {
      comment.likes.push(userObjectId);
    }

    await post.save();
    res.status(200).json({ liked: !liked, likesCount: comment.likes.length });
  } catch (error) {
    console.error("Comment like error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});


// POST /comment/:postId/like-reply/:commentId/:replyId
router.post("/comment/:postId/like-reply/:commentId/:replyId", verifyToken, async (req, res) => {
  try {
    const { postId, commentId, replyId } = req.params;
    const UserId = req.user.UserId;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json("Post not found");

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json("Comment not found");

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json("Reply not found");

    const userObjectId = new mongoose.Types.ObjectId(UserId);

    const liked = reply.likes.some(id => id.toString() === UserId);

    if (liked) {
      reply.likes = reply.likes.filter(id => id.toString() !== UserId);
    } else {
      reply.likes.push(userObjectId);
    }

    await post.save();
    res.status(200).json({ liked: !liked, likesCount: reply.likes.length });
  } catch (error) {
    console.error("Reply like error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});





router.get("/single/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const selectedPost = await Post.findById(id)
      .populate("userId", "username")
      .populate("comments.userId", "username profilePicture");
    
    if (!selectedPost) {
      return res.status(404).json({ message: "Post not found" });
    }

    Post.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec();

    const { tags, title, mediaType } = selectedPost;

    const titleKeywords = title
      ? title.split(" ").filter((word) => word.length > 2)
      : [];

    // 🔥 Regex Escape Function
    function escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    const titleRegex = titleKeywords.length
      ? {
          $or: titleKeywords.map((word) => ({
            title: { $regex: escapeRegex(word), $options: "i" },
          })),
        }
      : {};

    const query = {
      _id: { $ne: id },
      $or: [
        { tags: { $in: tags } },
        { mediaType: mediaType },
        ...(titleRegex.$or || []),
      ],
    };

    const relatedPosts = await Post.find(query)
      .populate("userId", "username")
      .sort({ mediaType: -1, createdAt: -1 })
      .limit(10);

    res.status(200).json({
      post: selectedPost,
      related: relatedPosts,
    });

  } catch (error) {
    console.error("Error fetching single post & related:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});


// router.get("/image/:id", async (req, res) => {
//   try {
//     const { id } = req.params;

//     // 1. Fetch Post with Full Nesting
//     const selectedPost = await Post.findById(id)
//       .populate("userId", "username profilePic")
//       .populate({
//         path: "comments.userId",
//         select: "username profilePicture"
//       })
//       .populate({
//         path: "comments.replies.userId",
//         select: "username profilePicture"
//       });

//     if (!selectedPost) return res.status(404).json({ message: "Post not found" });

//     // 2. View Increment (Non-blocking)
//     Post.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec();

//     // 3. Smart Related Posts Logic
//     // Pura title use karne ke bajaye main keywords nikalenge
//     const titleKeywords = selectedPost.title
//       ? selectedPost.title.split(" ").filter(word => word.length > 3)
//       : [];

//     // Search Query: Match Keywords OR just show Latest
//     let query = { _id: { $ne: id } };
//     if (titleKeywords.length > 0) {
//       query.$or = [
//         { title: { $regex: titleKeywords.join("|"), $options: "i" } },
//         { tags: { $in: selectedPost.tags } } // Tags matching bhi check karega
//       ];
//     }

//     let relatedPosts = await Post.find(query)
//       .populate("userId", "username")
//       .sort({ createdAt: -1 }) // Pehle latest dikhao
//       .limit(10);

//     // Agar matching posts kam hain (Manlo 4 hi mile), toh baki 6 latest videos/posts se bhar do
//     if (relatedPosts.length < 6) {
//       const extraPosts = await Post.find({ 
//         _id: { $ne: id, $nin: relatedPosts.map(p => p._id) } 
//       })
//       .sort({ createdAt: -1 })
//       .limit(10 - relatedPosts.length);
      
//       relatedPosts = [...relatedPosts, ...extraPosts];
//     }

//     res.status(200).json({
//       post: selectedPost,
//       related: relatedPosts
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Server Error", error: error.message });
//   }
// });

router.get("/image/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch Post with Full Nesting
    const selectedPost = await Post.findById(id)
      .populate("userId", "username profilePic")
      .populate({
        path: "comments.userId",
        select: "username profilePicture"
      })
      .populate({
        path: "comments.replies.userId",
        select: "username profilePicture"
      });

    if (!selectedPost) {
      return res.status(404).json({ message: "Post not found" });
    }

    // 🔹 Check if main post is an image
    const mediaUrl = selectedPost.media || selectedPost.mediaUrl;
    const isImage =
      /^image\//i.test(selectedPost.mediaType || "") ||
      /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|svg|jfif)$/i.test(mediaUrl || "");

    if (!isImage) {
      return res
        .status(400)
        .json({ message: "This post is not an image." });
    }

    // 🔹 Increment views
    Post.findByIdAndUpdate(id, { $inc: { views: 1 } }).exec();

    const { tags, title, mediaType } = selectedPost;

    // 🔹 Build regex for title keywords
    const titleKeywords = title
      ? title.split(" ").filter((word) => word.length > 2)
      : [];

    function escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    const titleRegex = titleKeywords.length
      ? {
          $or: titleKeywords.map((word) => ({
            title: { $regex: escapeRegex(word), $options: "i" },
          })),
        }
      : {};

    // 🔹 Related posts: latest videos only
    const query = {
      _id: { $ne: id },
      mediaType: { $not: /^image\//i }, // exclude images
      ...(titleRegex.$or ? { $or: titleRegex.$or } : {}),
    };

    const relatedPosts = await Post.find(query)
      .populate("userId", "username")
      .sort({ createdAt: -1 }) // latest videos
      .limit(10);

    res.status(200).json({
      post: selectedPost,
      related: relatedPosts,
    });
  } catch (error) {
    console.error("Error fetching single image & related videos:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});



router.get("/video/getall", async (req, res) => {
  try {
    // Sirf video posts fetch karo
    const posts = await Post.find({ mediaType: "video/mp4" }) // sirf video
      .sort({ createdAt: -1 }) // newest first
      .populate("userId", "username profilePic")
      .populate("comments.userId", "username profilePic")
      .populate("comments.replies.userId", "username profilePic");

    res.status(200).json(posts);

  } catch (error) {
    res.status(500).json({
      message: "Error fetching video posts",
      error: error.message,
    });
  }
});




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

module.exports = router;
