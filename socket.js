const { Server } = require("socket.io");

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: [
        "https://computer-xrfg.vercel.app",
        "https://www.fondpeace.com",
        "https://fondpeace.com",
        "http://localhost:3000"
      ],
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ["websocket", "polling"] // ✅ allow fallback
  });

  io.on("connection", (socket) => {
    console.log("✅ Socket Connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("❌ Socket Disconnected:", socket.id);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
}

module.exports = { initSocket, getIO };
