const {Schema, model} = require("../connection");


const PostSchema = Schema ({
    userId : {type: Schema.Types.ObjectId, ref: "User"},
    title: {type: String, default : ""},
    tags : [{type: String, trim: true}],
    media: {type: String, required: true}, //Cloudary give Url
    // likes: [{type: String, default : 0}],
    likes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],

    comments: [{
        CommentText: {type: String, required: true},
        userId : {type: Schema.Types.ObjectId, ref: "User"},
        likes: {type: Number, default: 0},
        timestamps: {type: Date, default: Date.now}

    },
    ],  

},

    {timestamps: true}


);


module.exports = model("Post", PostSchema);