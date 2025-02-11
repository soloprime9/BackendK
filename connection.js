const mongoose = require("mongoose");


mongoose.connect("mongodb+srv://javapython5750:soloprime9@abdikansh.5ae2w.mongodb.net/?retryWrites=true&w=majority&appName=Abdikansh")



.then((result) => {
    console.log("Connected to Database");
})
.catch((error) => {
    console.log("Not Connected to Database");
})

module.exports = mongoose;