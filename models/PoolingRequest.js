const mongoose = require("mongoose");

const poolingRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    userPhone: { type: String, required: true },
    pickup: { type: String, required: true },
    destination: { 
      type: String, 
      required: true, 
      enum: ["Hijli Station", "Kharagpur Station", "Kolkata Airport (CCU)"] 
    },
    dateTime: { type: Date, required: true },
    passengers: { type: Number, default: 1 },
    status: { 
      type: String, 
      enum: ["PENDING", "JOIN_REQUESTED", "GROUPED"], 
      default: "PENDING" 
    },
    joinRequests: [
      {
        userId: String,
        userName: String,
        userPhone: String,
        status: { type: String, enum: ["PENDING", "ACCEPTED", "REJECTED"], default: "PENDING" }
      }
    ],
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "PoolingGroup", default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PoolingRequest", poolingRequestSchema);
