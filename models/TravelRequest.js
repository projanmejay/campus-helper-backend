const mongoose = require("mongoose");

const travelRequestSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    studentName: { type: String, required: true },
    studentPhone: { type: String, required: true },
    studentHall: { type: String, required: true },
    source: { type: String, required: true },
    destination: { type: String, required: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    time: { type: String, required: true }, // Format: HH:MM
    status: {
      type: String,
      enum: ["pending", "assigned", "completed", "cancelled"],
      default: "pending",
    },
    fcmToken: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TravelRequest", travelRequestSchema);
