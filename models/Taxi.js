const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  creator: String,
  from: String,
  to: String,
  dateTime: String,
  seatsLeft: Number,
  driverName: String,
  driverNumber: String
});

module.exports = mongoose.model('Ride', rideSchema);
