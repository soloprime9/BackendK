const mongoose = require("mongoose");


mongoose.connect("mongodb+srv://pratikkumar5750:mheekd9tSQqWF3ui@cluster0.x12xsyl.mongodb.net/testdb?retryWrites=true&w=majority&appName=Cluster0")



.then((result) => {
    console.log("Connected to Database");
})
.catch((error) => {
    console.log("Not Connected to Database");
})

module.exports = mongoose;
