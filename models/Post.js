const { Schema, model } = require("../connection");

const ReplySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  replyText: { type: String, required: true },
  likes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const CommentSchema = new Schema({
  CommentText: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  likes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],,
  createdAt: { type: Date, default: Date.now },
  replies: [ReplySchema]  // ✅ Nested replies supported
}, { _id: true });


const PostSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  title: { type: String, default: "" },
  tags: [{ type: String, trim: true }],
  media: { type: String, required: true },
  thumbnail: { type: String, default: "" },
  medias: {
    type: new Schema({
      public_id: { type: String, default: "" },
      url: { type: String, required: true },
      type: { type: String, required: true }
    }, { _id: false })
  },
  mediaType: { type: String, required: true },
  duration: { type: Number, default: 0 },
  views : {type: Number, default: 0},
  likes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  comments: [CommentSchema],
}, { timestamps: true });

module.exports = model("Post", PostSchema);









// const {Schema, model} = require("../connection");


// const PostSchema = Schema ({
//     userId : {type: Schema.Types.ObjectId, ref: "User"},
//     title: {type: String, default : ""},
//     tags : [{type: String, trim: true}],
//     media: {type: String, required: true}, //Cloudary give Url
//     thumbnail: { type: String, default: "" },
//     medias: {
//           type: new Schema({
//             public_id: { type: String, default: "" },
//             url: { type: String, required: true },
//             type: { type: String, required: true }
//           }, { _id: false })  // ✅ _id: false = avoid nested _id
//         },

//     mediaType: { type: String, required: true },
//     // likes: [{type: String, default : 0}],
//     likes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],

//     comments: [{
//         CommentText: {type: String, required: true},
//         userId : {type: Schema.Types.ObjectId, ref: "User"},
//         likes: {type: Number, default: 0},
//         timestamps: {type: Date, default: Date.now}

//     },
//     ],  

// },

//     {timestamps: true}


// );


// module.exports = model("Post", PostSchema);
