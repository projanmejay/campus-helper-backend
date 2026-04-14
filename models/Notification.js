const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // Who receives this notification
    recipientEmail: {
      type: String,
      required: true,
      index: true,
    },
    // Who triggered it
    senderUsername: {
      type: String,
      required: true,
    },
    // "comment" | "reply"
    type: {
      type: String,
      required: true,
    },
    // Reference to the discussion post
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Discussion",
      required: true,
    },
    postTitle: {
      type: String,
      required: true,
    },
    // Preview of the comment/reply text
    snippet: {
      type: String,
      default: "",
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
