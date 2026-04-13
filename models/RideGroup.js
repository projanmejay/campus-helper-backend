const mongoose = require("mongoose");

const rideGroupSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ownerName: { type: String, required: true },
    ownerPhone: { type: String, required: true },
    ownerHall: { type: String, required: true }, // Add Hall for owner as requested
    studentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    requestIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TravelRequest",
      },
    ],
    taxiDetails: {
      carModel: { type: String, default: "" },
      carNumber: { type: String, default: "" },
    },
    source: { type: String, required: true },
    destination: { type: String, required: true },
    departureTime: { type: Date, required: true },
    isNotified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RideGroup", rideGroupSchema);
