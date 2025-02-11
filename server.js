const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jsonwebtoken = require("jsonwebtoken");
const Post = require("./routers/Post");
const User = require("./routers/User");
const cors = require("cors") ;
const path = require("path");




// const server = require("http").createServer(app);
// const io = require("./Socket");

app.use(express.json());
app.use(cors());

app.use(cors({
    // origin:  "https://computer-xrfg.vercel.app"
    origin: "http://localhost:3000"

}));


// server.listen(4000, ()=> {
//     console.log("Connected to the server 4000");
// })

app.get("/", (req, res) => {
    res.send("Hello Mafia");
})

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// app.use(express.static(path.join(__dirname, 'uploads')));

app.use("/user", User);
app.use("/post", Post);

// app.listen(4000, console.log("This Program run on 4000 Port"));


app.listen(4000, console.log("Running on Demo 4000"));
