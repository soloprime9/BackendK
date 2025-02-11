const {Server} = require("socket.io");

let io = new Server();
io.on("connection", (socket) => {
    console.log("Connection ho gya");

    socket.on("disconnect", () => {
        console.log("Disconnected ho gaya")
    })


})

module.exports = io;