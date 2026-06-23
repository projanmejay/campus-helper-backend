const mongoose = require('mongoose');

const taxiSettingSchema = new mongoose.Schema(
  {
    maxPassengers: { type: Number, default: 6 },
    minPassengers: { type: Number, default: 4 },
    timeWindowHours: { type: Number, default: 2 },
    confirmationDays: { type: Number, default: 2 },
    bookingAdvance: { type: Number, default: 50 },
    cancellationCharge: { type: Number, default: 0 },
    paymentDeadlineHours: { type: Number, default: 24 },
    fixedTaxiFare: { type: Number, default: 1200 },
    remindersEnabled: { type: Boolean, default: true },
    reminderIntervals: { type: Number, default: 12 }, // hours
  },
  { timestamps: true }
);

module.exports = mongoose.model('TaxiSetting', taxiSettingSchema);
