const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const User = require("../models/User");

// Middleware to check if user exists
const checkUser = async (req, res, next) => {
  const { username } = req.query;
  if (!username) {
    return res.status(400).json({ error: "username query parameter is required" });
  }
  const user = await User.findOne({ username });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  next();
};

// GET /chat/threads?username=...
// Returns a list of all conversations for this user, with the latest message for each
router.get("/threads", checkUser, async (req, res) => {
  try {
    const { username } = req.query;

    // Find all messages involving this user
    const messages = await Message.find({
      $or: [{ senderUsername: username }, { receiverUsername: username }]
    }).sort({ createdAt: -1 });

    const threads = {};

    messages.forEach(msg => {
      // Determine the *other* person's username
      const otherUsername = msg.senderUsername === username ? msg.receiverUsername : msg.senderUsername;

      // Group by the other username. We only store the *latest* message because they are pre-sorted correctly.
      if (!threads[otherUsername]) {
        threads[otherUsername] = {
          otherUsername,
          latestMessage: msg,
          unreadCount: (msg.receiverUsername === username && !msg.read) ? 1 : 0
        };
      } else if (msg.receiverUsername === username && !msg.read) {
        // Just increment unread count for older unread messages in this thread
        threads[otherUsername].unreadCount++;
      }
    });

    res.json(Object.values(threads));

  } catch (error) {
    console.error("GET /chat/threads ERROR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /chat/:otherUsername?username=...
// Fetch the entire chronological message history between two users
router.get("/:otherUsername", checkUser, async (req, res) => {
  try {
    const { username } = req.query;
    const { otherUsername } = req.params;

    // Optional: check if otherUsername exists
    const otherUser = await User.findOne({ username: otherUsername });
    if (!otherUser) {
      // Instead of failing completely, returning empty chat if user doesn't exist yet might be fine or we return 404
      // Let's just return 404 to ensure they message valid usernames
      return res.status(404).json({ error: "The user you are trying to message does not exist" });
    }

    const messages = await Message.find({
      $or: [
        { senderUsername: username, receiverUsername: otherUsername },
        { senderUsername: otherUsername, receiverUsername: username }
      ]
    }).sort({ createdAt: 1 }); // Oldest first

    // Mark messages received by 'username' as read
    const unreadMessages = messages.filter(msg => msg.receiverUsername === username && !msg.read);
    if (unreadMessages.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessages.map(m => m._id) } },
        { $set: { read: true } }
      );
    }

    res.json(messages);

  } catch (error) {
    console.error(`GET /chat/:otherUsername ERROR:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /chat/send
router.post("/send", async (req, res) => {
  try {
    const { senderUsername, receiverUsername, text } = req.body;

    if (!senderUsername || !receiverUsername || !text) {
      return res.status(400).json({ error: "senderUsername, receiverUsername, and text are required" });
    }

    if (senderUsername === receiverUsername) {
      return res.status(400).json({ error: "Cannot send message to yourself" });
    }

    const receiver = await User.findOne({ username: receiverUsername });
    if (!receiver) {
      return res.status(404).json({ error: "The user you are trying to message does not exist" });
    }

    const msg = new Message({
      senderUsername,
      receiverUsername,
      text
    });

    await msg.save();
    res.status(201).json(msg);

  } catch (error) {
    console.error("POST /chat/send ERROR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
