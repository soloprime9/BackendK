
const {Schema, model} = require("../connection");



const UserSchema = Schema({
    username: {type: String, default: "", unique:true },
    email: {type: String, required: true},
    password: {type: String, required: true},
    bio: {type: String, default: "Add About You"},
    Followers: [{type: Schema.Types.ObjectId, ref: "User"}],
    Followings: [{type: Schema.Types.ObjectId, ref: "User"}],
    posts: [{type: Schema.Types.ObjectId, ref: "Post"}],
    timestamps: {type: Date, default: Date.now}

})

const User = model("User", UserSchema);
  
module.exports = User;


 