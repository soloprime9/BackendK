const mongoose = require("mongoose");
    
mongoose.connect("mongodb+srv://pratikkumar5750:mheekd9tSQqWF3ui@cluster0.x12xsyl.mongodb.net/?appName=Cluster0")
    .then((result) => 
        console.log("Connected SuccessFully ")
    )

    .catch(() => {
        console.log("Not Connected To MongoDataBase")
    })

module.exports = mongoose;
