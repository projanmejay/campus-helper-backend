const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  hall: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  // discussion username
  username: {
    type: String,
    unique: true,
    sparse: true,       // allows multiple null values (users without usernames)
  },
  // ensures username can only be set once
  usernameConfirmed: {
    type: Boolean,
    default: false,
  },
  phone: {
    type: String,
    default: '',
  },
  role: {
    type: String,
    enum: ['student', 'owner', 'admin'],
    default: 'student',
  },
});

module.exports = mongoose.model("User", userSchema);