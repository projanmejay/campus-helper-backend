const mongoose = require('mongoose');

const rideRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    pickup: { type: String, required: true },
    destination: { type: String, required: true },
    rideDate: { type: String, required: true }, // Format: YYYY-MM-DD
    rideTime: { type: String, required: true }, // Format: HH:mm
    passengerCount: { type: Number, required: true },
    contactNumber: { type: String, required: true },
    bookingAmountPaid: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['PENDING_GROUPING', 'AWAITING_FINAL_PAYMENT', 'CONFIRMED', 'CANCELLED'],
      default: 'PENDING_GROUPING',
    },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'RideGroup', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RideRequest', rideRequestSchema);
