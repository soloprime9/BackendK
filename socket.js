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
    // 👤 Register user's personal notification room
    socket.on("join_user", (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
      }
    });

    // 💬 Join specific conversation room
    socket.on("join_conversation", (conversationId) => {
      if (conversationId) {
        socket.join(`conversation_${conversationId}`);
      }
    });

    // 🚪 Leave conversation room
    socket.on("leave_conversation", (conversationId) => {
      if (conversationId) {
        socket.leave(`conversation_${conversationId}`);
      }
    });

    // ⌨️ Typing Indicator Live Broadcast
    socket.on("typing_start", ({ conversationId, userId, username }) => {
      if (conversationId) {
        socket.to(`conversation_${conversationId}`).emit("user_typing", {
          conversationId,
          userId,
          username,
          isTyping: true
        });
      }
    });

    socket.on("typing_stop", ({ conversationId, userId }) => {
      if (conversationId) {
        socket.to(`conversation_${conversationId}`).emit("user_typing", {
          conversationId,
          userId,
          isTyping: false
        });
      }
    });

    socket.on("disconnect", () => {
      // Socket disconnected cleanly
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
