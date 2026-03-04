const mongoose = require("mongoose");

const discussionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },

  description: {
    type: String,
    required: true
  },

  author: {
    type: String,
    required: true
  },

  category: {
    type: String,
    default: "General"
  },

  upvotes: {
    type: Number,
    default: 0
  },

  comments: [
    {
      user: String,
      comment: String,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ]

}, { timestamps: true });

module.exports = mongoose.model("Discussion", discussionSchema);