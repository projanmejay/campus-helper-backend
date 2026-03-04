const express = require("express");
const router = express.Router();
const Discussion = require("../models/Discussion");


// CREATE DISCUSSION POST
router.post("/create", async (req, res) => {
  try {

    const { title, description, author, category } = req.body;

    const post = new Discussion({
      title,
      description,
      author,
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


// GET ALL POSTS
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
// ADD COMMENT TO A POST
router.post("/comment", async (req, res) => {

  try {

    const { postId, user, comment } = req.body;

    if (!postId || !user || !comment) {
      return res.status(400).json({
        success: false,
        message: "postId, user and comment required"
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
      user,
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