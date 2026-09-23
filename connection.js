const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (_) {}

const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const WORKING_URI = "mongodb+srv://javapython5750:soloprime9@abdikansh.5ae2w.mongodb.net/?retryWrites=true&w=majority&appName=Abdikansh";
const MONGO_URI = process.env.MONGO_URI || WORKING_URI;

mongoose.connect(MONGO_URI)
  .then((result) => {
    console.log("Connected to Database successfully:", result.connection.host);
  })
  .catch((error) => {
    console.log("Not Connected to Database:", error.message);
  });

module.exports = mongoose;
