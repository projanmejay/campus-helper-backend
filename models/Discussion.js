const mongoose = require("mongoose");

const replySchema = new mongoose.Schema({
  user:      { type: String },
  comment:   { type: String },
  authorEmail: { type: String },
  upvotes:   { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  votes: [
    {
      email: String,
      vote:  Number, // 1 = upvote, -1 = downvote
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

const commentSchema = new mongoose.Schema({
  user:      { type: String },
  comment:   { type: String },
  authorEmail: { type: String },
  upvotes:   { type: Number, default: 0 },
  downvotes: { type: Number, default: 0 },
  votes: [
    {
      email: String,
      vote:  Number, // 1 = upvote, -1 = downvote
    },
  ],
  replies:   [replySchema],
  createdAt: { type: Date, default: Date.now },
});

const discussionSchema = new mongoose.Schema(
  {
    title: {
      type:     String,
      required: true,
    },
    description: {
      type:     String,
      required: true,
    },
    author: {
      type:     String,
      required: true,
    },
    authorEmail: {
      type:     String,
      required: true,
    },
    authorRealName: {
      type: String,
    },
    phoneNumber: {
      type: String,
    },
    imageUrl: {
      type: String,
    },
    category: {
      type:    String,
      default: "General",
    },
    upvotes:   { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    views:     { type: Number, default: 0 },
    votes: [
      {
        email: String,
        vote:  Number, // 1 = upvote, -1 = downvote
      },
    ],
    comments: [commentSchema],
    reports: [
      {
        email: String,
        reason: String,
        createdAt: { type: Date, default: Date.now }
      }
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Discussion", discussionSchema);