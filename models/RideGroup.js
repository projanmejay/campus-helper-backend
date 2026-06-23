const mongoose = require('mongoose');

const rideGroupSchema = new mongoose.Schema(
  {
    rideDate: { type: String, required: true },
    rideTime: { type: String, required: true },
    pickupArea: { type: String, required: true }, // Aggregated/General pickup area
    destination: { type: String, required: true },
    passengers: [
      {
        userId: { type: String, required: true },
        requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'RideRequest', required: true },
        passengerCount: { type: Number, required: true },
        contactNumber: { type: String, required: true },
        bookingAmountPaid: { type: Number, required: true },
        status: { type: String, enum: ['AWAITING_FINAL_PAYMENT', 'CONFIRMED', 'CANCELLED'], default: 'AWAITING_FINAL_PAYMENT' }
      }
    ],
    finalPassengerCount: { type: Number, default: 0 },
    totalTaxiFare: { type: Number, required: true },
    farePerPassenger: { type: Number, required: true },
    status: {
      type: String,
      enum: ['UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
      default: 'UPCOMING',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RideGroup', rideGroupSchema);
