const dns = require("dns");
if (!process.env.VERCEL) {
  try {
    dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
  } catch (_) {}
}

const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, ".env") });

const WORKING_URI = "mongodb+srv://javapython5750:soloprime9@abdikansh.5ae2w.mongodb.net/?retryWrites=true&w=majority&appName=Abdikansh";
const PRIMARY_URI = process.env.MONGO_URI || process.env.MONGODB || WORKING_URI;

let connectPromise = global.__backendkMongoPromise || null;

async function connectWithFallback() {
  const opts = {
    maxPoolSize: process.env.VERCEL ? 10 : 25,
    minPoolSize: process.env.VERCEL ? 0 : 5,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45000,
  };
  try {
    const result = await mongoose.connect(PRIMARY_URI, opts);
    console.log("Connected to Database successfully:", result.connection.host);
    return mongoose;
  } catch (err) {
    if (PRIMARY_URI !== WORKING_URI && /auth|bad auth/i.test(err && err.message ? err.message : "")) {
      console.warn("Primary env Mongo auth failed; retrying with configured WORKING_URI...");
      try { await mongoose.disconnect(); } catch (_) {}
      const fallbackRes = await mongoose.connect(WORKING_URI, opts);
      console.log("Connected to Database via fallback URI:", fallbackRes.connection.host);
      return mongoose;
    }
    throw err;
  }
}

function ensureConnected() {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose);
  }
  if (!connectPromise) {
    connectPromise = connectWithFallback().catch((error) => {
      connectPromise = null;
      global.__backendkMongoPromise = null;
      console.log("Not Connected to Database:", error.message);
      throw error;
    });
    global.__backendkMongoPromise = connectPromise;
  }
  return connectPromise;
}

ensureConnected().catch(() => {});

mongoose.ensureConnected = ensureConnected;
module.exports = mongoose;
