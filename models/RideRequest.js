const mongoose = require('mongoose');

const rideRequestSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    pickup: { type: String, required: true },
    destination: { type: String, required: true },
    rideDate: { type: String, required: true },
    rideTime: { type: String, required: true },
    passengerCount: { type: Number, required: true },
    contactNumber: { type: String, required: true },
    bookingAmountPaid: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['PENDING_GROUPING', 'AWAITING_FINAL_PAYMENT', 'CONFIRMED', 'CANCELLED'],
      default: 'PENDING_GROUPING',
    },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'RideGroup', default: null },
    // Razorpay tracking (for refunds)
    razorpayAdvancePaymentId: { type: String, default: null },
    razorpayFinalPaymentId:   { type: String, default: null },
    // Admin cancellation tracking
    cancelledByAdmin:  { type: Boolean, default: false },
    refundInitiated:   { type: Boolean, default: false },
    refundAmount:      { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RideRequest', rideRequestSchema);
