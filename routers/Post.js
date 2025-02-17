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

// Multer Storage for File Uploads (Memory Storage for Buffer)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// API Endpoint for Image Upload
router.post("/uploader", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        // Upload Image to Cloudinary
        cloudinary.uploader.upload_stream({ resource_type: "auto" }, (error, uploadResult) => {
            if (error) {
                console.error("Cloudinary Upload Error:", error);
                return res.status(500).json({ success: false, message: "Upload failed", error });
            }

            res.status(200).json({
                success: true,
                message: "Upload successful",
                imageUrl: uploadResult.secure_url
            });
        }).end(req.file.buffer); // End the stream properly
        

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ success: false, message: "Internal server error", error });
    }
});




// Upload Route
router.post("/upload",verifyToken, upload.single("file"), async (req, res) => {
    
        const title = req.body.title;
        const UserId = req.user.UserId;
        const user = await User.findById(UserId);
        if (!user) {
            return res.status(404).json("User Not Found");
        }

        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: "No file uploaded" });
            }

            const PromiseTimeOut = new Promise((resolve, reject) => {
              setTimeout(() => {
                    reject(new Error("Time Out"));
              }, 25000);
            });
    
            // Upload Image to Cloudinary
            const UploadPromise = new Promise ((resolve, reject ) => {
                
            const stream = cloudinary.uploader.upload_stream({ resource_type: "auto" }, (error, result) => error ? reject(error) : resolve(result));
                
            stream.end(req.file.buffer);
            });

            const uploadResult = await Promise.race([UploadPrmomise, PromiseTimeOut]);
    
                // Extracting User ID (from JWT token or request body)
                // const userId = req.user.id || req.body.userId; // Adjust based on your JWT implementation
    
                // Creating a New Post in MongoDB
                const newPost = new Post({
                    userId: UserId,
                    title: req.body.title,
                    media: uploadResult.secure_url, // Store Cloudinary URL
                    tags: req.body.title.split("#").slice(1).map(tag => tag.trim().split(" ")[0]),
                    likes: [],
                    comments: [],
                });
    
                await newPost.save(); // Save post to MongoDB
    
                res.status(200).json({ success: true, message: "Upload successful", post: newPost });
                console.log("Success:", newPost);
            }).end(req.file.buffer); // End the stream properly
    
        } catch (error) {
            console.error("Server Error:", error);
            res.status(500).json({ success: false, message: error.message.includes('timeout') ? : "Time Out - Try Small File to Upload" : "Upload Failed" });
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
