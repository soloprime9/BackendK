const { Schema, model } = require("../connection");

const ReportSchema = new Schema({
  reportedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  post: { type: Schema.Types.ObjectId, ref: "Post", default: null },
  user: { type: Schema.Types.ObjectId, ref: "User", default: null },
  reason: { type: String, required: true },
  details: { type: String, default: "" },
  status: { 
    type: String, 
    enum: ["pending", "resolved", "dismissed"], 
    default: "pending" 
  },
  createdAt: { type: Date, default: Date.now, index: true }
});

module.exports = model("Report", ReportSchema);
