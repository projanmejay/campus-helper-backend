const express = require("express");
const router = express.Router();
const Discussion = require("../models/Discussion");
const User = require("../models/User");


/* ================= CREATE DISCUSSION POST ================= */

router.post("/create", async (req, res) => {

  try {

    const { title, description, email, category } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.username) {
      return res.status(400).json({
        success: false,
        message: "You must create a username before posting"
      });
    }

    const post = new Discussion({
      title,
      description,
      author: user.username,
      category
    });

    await post.save();

    res.json({
      success: true,
      message: "Discussion created",
      post
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      error: error.message
    });

  }

});


/* ================= GET ALL POSTS ================= */

router.get("/all", async (req, res) => {

  try {

    const posts = await Discussion.find()
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      posts
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      error: error.message
    });

  }

});


/* ================= UPVOTE ================= */

router.post("/upvote/:id", async (req, res) => {

  try {

    const post = await Discussion.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found"
      });
    }

    post.upvotes += 1;

    await post.save();

    res.json({
      success: true,
      score: post.upvotes - post.downvotes
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      error: error.message
    });

  }

});


/* ================= DOWNVOTE ================= */

router.post("/downvote/:id", async (req, res) => {

  try {

    const post = await Discussion.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found"
      });
    }

    post.downvotes += 1;

    await post.save();

    res.json({
      success: true,
      score: post.upvotes - post.downvotes
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      error: error.message
    });

  }

});


/* ================= ADD COMMENT ================= */

router.post("/comment", async (req, res) => {

  try {

    const { postId, email, comment } = req.body;

    if (!postId || !email || !comment) {
      return res.status(400).json({
        success: false,
        message: "postId, email and comment required"
      });
    }

    const user = await User.findOne({ email });

    if (!user || !user.username) {
      return res.status(400).json({
        success: false,
        message: "You must create a username before commenting"
      });
    }

    const post = await Discussion.findById(postId);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found"
      });
    }

    post.comments.push({
      user: user.username,
      comment
    });

    await post.save();

    res.json({
      success: true,
      message: "Comment added",
      post
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      error: error.message
    });

  }

});

module.exports = router;