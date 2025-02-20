const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const multer = require("multer");
const verifyToken = require("../middleware/verifyToken");
const User = require("../models/User");
const { v2: cloudinary } = require("cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require("dotenv").config();

// Cloudinary Configure
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,

    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET 
   
});

console.log({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
    
});

router.get("/signature", async(req, res) => {
    const timestamp = Math.round(Date.now() / 1000);
const signature = cloudinary.utils.api_sign_request(
    { timestamp, upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET },
    process.env.CLOUDINARY_API_SECRET
);
res.json({
    timestamp,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY,
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
});
    console.log(timestamp,
    signature,
    "apiKey: ", process.env.CLOUDINARY_API_KEY,
    "uploadPreset: ", process.env.CLOUDINARY_UPLOAD_PRESET,
    "cloudName: ", process.env.CLOUDINARY_CLOUD_NAME,)

})

// API Endpoint for Image Upload

// Upload Route
router.post("/upload", verifyToken, async (req, res) => {
  const { title, publicId } = req.body;
  console.log("Received title and publicId:", title, publicId);

  const UserId = req.user.UserId;
  const user = await User.findById(UserId);
  if (!user) {
    return res.status(404).json("User Not Found");
  }

  try {
    if (!publicId) {
      return res.status(400).json({ success: false, message: "No media uploaded" });
    }

    const asset = await cloudinary.api.resource(publicId);
    if (!asset) {
      return res.status(400).json({ message: "Invalid Media" });
    }

    const newPost = new Post({
      userId: UserId,
      title: req.body.title,
      media: asset.secure_url,
      medias: {
        public_id: publicId,
        url: asset.secure_url,
        type: asset.resource_type,
      },
      tags: req.body.title.split("#").slice(1).map(tag => tag.trim().split(" ")[0]),
      likes: [],
      comments: [],
    });

    await newPost.save(); // Save post to MongoDB
    res.status(200).json({ success: true, message: "Upload successful", post: newPost });
    console.log("Success:", newPost);

  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ success: false, message: "Upload Failed" });
  }
});



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

router.post("/comment/:postId", verifyToken, async(req, res) =>{
    try{
    const userId = req.user.UserId;
    const CommentText = req.body.CommentText;
    const postId = req.params.postId;
    
    const post = await Post.findById(postId);
    if(!post){
        return res.status(404).json("Post Not Found");
        
    }

    console.log(post);

    // const CheckUser = post.comments.includes(userId);
    // if(CheckUser){
    //     post.comments = post.comments.filter((id) => id != userId);
    //     post.comments.save();
    //     console.log("")
    // }

    const comment = ({
        userId: userId,
        CommentText: CommentText,
        like: [],

    })

    await post.comments.push(comment);
    post.save();
    res.status(200).json(post);
    console.log("Comments: ", post);
    }

    catch(error){
        res.status(500).json(error);
        console.log(error);
    }

})

module.exports = router;
