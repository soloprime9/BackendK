const mongoose = require("mongoose");
require("dotenv").config(); // Make sure you have a .env file and dotenv installed

const uri = process.env.MONGODB; // MongoDB URI from your environment variable

mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log("Connected to Database GGGGG");
})
.catch((error) => {
    console.error("Not Connected to Database VVVVV", error);
});

module.exports = mongoose;
