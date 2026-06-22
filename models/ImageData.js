const mongoose = require("mongoose");

const imageDataSchema = new mongoose.Schema(
  {
    id: {
      type:     String,
      required: true,
      unique:   true,
    },
    base64: {
      type:     String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ImageData", imageDataSchema);
