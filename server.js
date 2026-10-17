const bufferModule = require('buffer');
if (!bufferModule.SlowBuffer) { bufferModule.SlowBuffer = bufferModule.Buffer; }
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const { initSocket } = require("./socket"); // 👈 IMPORT

const Post = require("./routers/Post");
const User = require("./routers/User");
const Search = require("./routers/autoai");
const Demo = require("./routers/demo");
const analyticsRoutes = require("./routers/analytics");
const pwaAnalyticsRoute = require("./routers/pwaAnalytics");
const reminderRoutes = require("./routers/reminder");
const notificationRoutes = require("./routers/notification");
const chatRoutes = require("./routers/chat");


const compression = require("compression");

const app = express();
const server = http.createServer(app);

// ✅ INIT SOCKET
const io = initSocket(server);

app.set("trust proxy", 1);

// ================= MIDDLEWARE =================

// High-Performance Gzip/Brotli Compression (Reduces JSON payload sizes by 70-80%)
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers["x-no-compression"]) return false;
    return compression.filter(req, res);
  }
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      origin.includes("vercel.app") ||
      origin.includes("fondpeace.com")
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

// ================= ROUTES =================

app.use("/user", User);
app.use("/post", Post);
app.use("/autoai", Search);
app.use("/demo", Demo);
app.use("/analytics", analyticsRoutes);
app.use("/api/pwa", pwaAnalyticsRoute);
app.use("/reminder", reminderRoutes);
app.use("/notification", notificationRoutes);
app.use("/chat", chatRoutes);


// ================= START SERVER =================

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});







// const express = require("express");
// const app = express();
// const mongoose = require("mongoose");
// const jsonwebtoken = require("jsonwebtoken");
// const Post = require("./routers/Post");
// const User = require("./routers/User");
// // const Content = require("./routers/content");
// const Search = require("./routers/autoai");
// const Demo = require("./routers/demo");
// const cors = require("cors") ;
// const path = require("path");

// // const ProductList = require("./routerLists/product");
// // const UserList = require("./routerLists/user");



// // const server = require("http").createServer(app);
// // const io = require("./Socket");

// app.use(express.json());
// // app.use(cors());

// app.use(cors({
//   origin: ['https://computer-xrfg.vercel.app', 'https://www.fondpeace.com', 'http://localhost:3000', "http://localhost:8081"]
// }));




// // server.listen(4000, ()=> {
// //     console.log("Connected to the server 4000");
// // })

// app.get("/", (req, res) => {
//     res.send("Hello Mafia");
// })

// app.use(express.json({ limit: '50mb' }));
// app.use(express.urlencoded({ limit: "50mb", extended: true }));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// // app.use(express.static(path.join(__dirname, 'uploads')));

// app.use("/user", User);
// app.use("/post", Post);
// // app.use("/content", Content);
// app.use("/autoai", Search);
// app.use("/demo", Demo);



// // Listing URLs 
// // app.use("/product", ProductList);
// // app.use("/user", UserList);



// app.listen(4000, console.log("Running on Demo 4000"));

