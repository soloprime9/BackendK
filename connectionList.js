const mongoose = require("mongoose");
require("dotenv").config(); // Make sure you have a .env file and dotenv installed

const uri = process.env.MONGODB; // MongoDB URI from your environment variable

mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    console.log("Connected to Database");
})
.catch((error) => {
    console.error("Not Connected to Database", error);
});

module.exports = mongoose;
