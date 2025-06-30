const express = require("express");
const router = express.Router();
const User = require("../models/User");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const verifyToken = require("../middleware/verifyToken");
const Post = require("../models/Post");

dotenv.config();


router.get("/mango/getall", verifyToken, async (req, res) => {
    
    try{
    const Users = await User.find();
   
    res.status(200).json(Users);
    
    console.log("UserId:", req.user.UserId, "Users: ", Users.length );

    }
    catch(error) {
        res.status(500).json("Error Fetching Data");
      }
})

router.post('/add', async (req, res) => {
    const {username, email, password} = req.body;
  try{
    const checkuser = await User.findOne({username});
    if(checkuser) {
       return res.status(404).json({message: "username Already Exists"});
    }
    checkEmail = await User.findOne({email});
    if(checkEmail){
        return res.status(404).json({message: "Email Already Exists"});
    }
    const  UserDetail = await new User(req.body).save();
      res.status(200).json({message: "Your Account Successfully Created", UserDetail});
      console.log(UserDetail);

    }
    catch(error){
        res.status(500).json({message: "Internal Server Error"});
       console.log(error)
    }
})

router.post("/login", async (req, res) => {
   const {email, password} = req.body;
   const user = await User.findOne({email});
   if(!user){
    return res.status(404).json({message:"Email Not Found, Try Again"});
   }
   if(user.password !== password){
    return res.status(404).json({message: "Wrong Password, Try Again"});
   }

   
   const token = jwt.sign({UserId: user._id}, process.env.JWT_SECRET, {expiresIn: "1h"} )
   console.log("token:", token);
   return res.status(200).json({UserDetail: user,token: token, message:"Loggin Successfull"});

   

})

router.get("/:username",verifyToken, async (req, res) => {

    const loggedinUser = req.user.UserId;
    const username = req.params.username;
   const user = await User.findOne({username})
    if(!user){ 
        return res.status(404).json("user not found");
    }


    const OwnerId = user._id.toString() === loggedinUser;
    
    console.log("Owner:" ,OwnerId, "Id", user._id);
    if(OwnerId){
        const posts = await Post.find({userId: req.user.UserId}).populate("userId", "username");
        res.status(200).json({
            Profile: {
                user: user,
                posts,
                OwnerId: true
            }
        })
       
    }

    else{
        const posts = await Post.find({userId: user._id}).populate("userId", "username");

        res.status(200).json({
            Profile: {
                user: user,
                posts,
                OwnerId: false
            }
        })

    }
    
})

router.get("/mango/search", async(req, res) => {
    try{
    const query = req.query.query;
    const regex = new RegExp(query, 'i');

    const user = await User.find({
        $or: [
            {username: regex},
            {email: regex}
        ]
    });

    res.status(200).json(user);
    }
    catch(error){
        res.status(500).json(error)
    }
    

})

router.post("/follow/:userId",verifyToken, async(req, res) => {
    const userId = req.params.userId
    const loggedinUser = req.user.UserId;
    try{
    const user = await User.findById(userId);
    if(!user){
        res.status(404).json("User Not Found");
    }

    const UserExist = user.Followers.includes(loggedinUser);
    if(UserExist){
        user.Followers = user.Followers.filter((id) => id !== loggedinUser);
        await user.save();
        console.log("UnFollow", user);

    }
    else{
        user.Followers.push(loggedinUser);
        await user.save();
    }
    
    res.status(200).json(user);
    console.log("Success", user)
    }

    catch(error){
        res.status(500).json(error);
    }
})

router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.json({ available: false });
    } else {
      return res.json({ available: true });
    }
  } catch (error) {
    console.error('Error checking email availability:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router;
