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
        message: "You must create a username before posting",
      });
    }

    const post = new Discussion({
      title,
      description,
      author: user.username,
      authorEmail: email,
      category,
    });

    await post.save();

    res.json({ success: true, message: "Discussion created", post });

  } catch (error) {
    console.error("CREATE DISCUSSION ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= GET ALL POSTS ================= */

router.get("/all", async (req, res) => {
  try {
    const posts = await Discussion.find().sort({ createdAt: -1 });
    res.json({ success: true, posts });
  } catch (error) {
    console.error("GET ALL DISCUSSIONS ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= VOTE POST ================= */

router.post("/vote/:id", async (req, res) => {
  try {
    const { email, vote } = req.body; // vote = 1 or -1

    const post = await Discussion.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    const existingVote = post.votes.find(v => v.email === email);

    if (existingVote) {
      // Undo old vote
      if (existingVote.vote === vote) {
        if (vote === 1)  post.upvotes   -= 1;
        if (vote === -1) post.downvotes -= 1;
        post.votes = post.votes.filter(v => v.email !== email);
        await post.save();
        return res.json({
          success: true,
          message: "Vote removed",
          upvotes: post.upvotes,
          downvotes: post.downvotes,
        });
      }
      // Undo old vote count
      if (existingVote.vote === 1)  post.upvotes   -= 1;
      if (existingVote.vote === -1) post.downvotes -= 1;

      existingVote.vote = vote;
    } else {
      post.votes.push({ email, vote });
    }

    if (vote === 1)  post.upvotes   += 1;
    if (vote === -1) post.downvotes += 1;

    await post.save();

    res.json({ success: true, upvotes: post.upvotes, downvotes: post.downvotes });

  } catch (error) {
    console.error("VOTE POST ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= ADD COMMENT ================= */

router.post("/comment", async (req, res) => {
  try {
    const { postId, email, comment } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.username) {
      return res.status(400).json({ success: false, message: "Create username first" });
    }

    const post = await Discussion.findById(postId);

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    post.comments.push({ user: user.username, authorEmail: email, comment });

    await post.save();

    res.json({ success: true, post });

  } catch (error) {
    console.error("ADD COMMENT ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= COMMENT VOTE ================= */

router.post("/comment/vote", async (req, res) => {
  try {
    const { postId, commentId, email, vote } = req.body;

    const post = await Discussion.findById(postId);

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    const comment = post.comments.id(commentId);

    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    const existingVote = comment.votes.find(v => v.email === email);

    if (existingVote) {
      if (existingVote.vote === vote) {
        if (vote === 1)  comment.upvotes   -= 1;
        if (vote === -1) comment.downvotes -= 1;
        comment.votes = comment.votes.filter(v => v.email !== email);
        await post.save();
        return res.json({ success: true, comment });
      }
      if (existingVote.vote === 1)  comment.upvotes   -= 1;
      if (existingVote.vote === -1) comment.downvotes -= 1;

      existingVote.vote = vote;
    } else {
      comment.votes.push({ email, vote });
    }

    if (vote === 1)  comment.upvotes   += 1;
    if (vote === -1) comment.downvotes += 1;

    await post.save();

    res.json({ success: true, comment });

  } catch (error) {
    console.error("COMMENT VOTE ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= REPLY TO COMMENT ================= */

router.post("/reply", async (req, res) => {
  try {
    const { postId, commentId, email, comment } = req.body;

    const user = await User.findOne({ email });

    if (!user || !user.username) {
      return res.status(400).json({ success: false, message: "Create username first" });
    }

    const post = await Discussion.findById(postId);

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    const parentComment = post.comments.id(commentId);

    if (!parentComment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    parentComment.replies.push({ user: user.username, authorEmail: email, comment });

    await post.save();

    res.json({ success: true, post });

  } catch (error) {
    console.error("REPLY ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= REPLY VOTE ================= */

router.post("/reply/vote", async (req, res) => {
  try {
    const { postId, commentId, replyId, email, vote } = req.body;

    const post = await Discussion.findById(postId);

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    const comment = post.comments.id(commentId);

    if (!comment) {
      return res.status(404).json({ success: false, message: "Comment not found" });
    }

    const reply = comment.replies.id(replyId);

    if (!reply) {
      return res.status(404).json({ success: false, message: "Reply not found" });
    }

    const existingVote = reply.votes.find(v => v.email === email);

    if (existingVote) {
      if (existingVote.vote === vote) {
        if (vote === 1)  reply.upvotes   -= 1;
        if (vote === -1) reply.downvotes -= 1;
        reply.votes = reply.votes.filter(v => v.email !== email);
        await post.save();
        return res.json({ success: true, reply });
      }
      if (existingVote.vote === 1)  reply.upvotes   -= 1;
      if (existingVote.vote === -1) reply.downvotes -= 1;

      existingVote.vote = vote;
    } else {
      reply.votes.push({ email, vote });
    }

    if (vote === 1)  reply.upvotes   += 1;
    if (vote === -1) reply.downvotes += 1;

    await post.save();

    res.json({ success: true, reply });

  } catch (error) {
    console.error("REPLY VOTE ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= DELETE POST ================= */
router.post("/delete-post/:id", async (req, res) => {
  try {
    const { email } = req.body;
    const post = await Discussion.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    if (post.authorEmail !== email) return res.status(403).json({ success: false, message: "Unauthorized" });

    await Discussion.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Post deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= DELETE COMMENT ================= */
router.post("/delete-comment", async (req, res) => {
  try {
    const { postId, commentId, email } = req.body;
    const post = await Discussion.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });
    if (comment.authorEmail !== email) return res.status(403).json({ success: false, message: "Unauthorized" });

    post.comments.pull({ _id: commentId });
    await post.save();
    res.json({ success: true, message: "Comment deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= DELETE REPLY ================= */
router.post("/delete-reply", async (req, res) => {
  try {
    const { postId, commentId, replyId, email } = req.body;
    const post = await Discussion.findById(postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json({ success: false, message: "Reply not found" });
    if (reply.authorEmail !== email) return res.status(403).json({ success: false, message: "Unauthorized" });

    comment.replies.pull({ _id: replyId });
    await post.save();
    res.json({ success: true, message: "Reply deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= INCREMENT VIEWS ================= */
router.post("/increment-views/:id", async (req, res) => {
  try {
    const post = await Discussion.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, views: post.views });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= REPORT POST ================= */
router.post("/report/:id", async (req, res) => {
  try {
    const { email, reason } = req.body;
    const post = await Discussion.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });

    post.reports.push({ email, reason });
    await post.save();
    res.json({ success: true, message: "Report submitted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= ADMIN: GET ALL REPORTS ================= */
router.get("/admin/reports", async (req, res) => {
  try {
    // Return all posts that have at least one report
    const reportedPosts = await Discussion.find({ "reports.0": { $exists: true } }).sort({ updatedAt: -1 });
    res.json({ success: true, reports: reportedPosts });
  } catch (error) {
    console.error("ADMIN GET REPORTS ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= ADMIN: RESOLVE (CLEAR) REPORTS ================= */
router.post("/admin/resolve-report/:id", async (req, res) => {
  try {
    const post = await Discussion.findByIdAndUpdate(
      req.params.id,
      { $set: { reports: [] } },
      { new: true }
    );
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, message: "Reports cleared" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/* ================= ADMIN: MASTER DELETE POST ================= */
router.post("/admin/delete-post/:id", async (req, res) => {
  try {
    const post = await Discussion.findByIdAndDelete(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, message: "Post removed by Admin" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
