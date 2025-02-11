const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next)=> {
    const token = req.header("x-auth-token");
    try{
    if(!token){
        return res.status(404).json("Bro Token is Required")
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log(req.user);
    next();
    }
    catch(error){
       return res.status(500).json("Error in Token Checking");
    }

}

module.exports =verifyToken;