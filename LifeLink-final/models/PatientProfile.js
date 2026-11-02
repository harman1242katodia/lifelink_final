/**
 * ==============================================================================
 * LifeLink — Patient Profile Model
 * ==============================================================================
 * 
 * Stores verified patient medical registry data, locality, coordinates,
 * and emergency contacts.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const patientProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Patient name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  age: {
    type: Number
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  address: {
    type: String,
    trim: true
  },
  locality: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  coordinates: {
    lat: { type: Number, required: false },
    lng: { type: Number, required: false }
  },
  emergencyContact: {
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    relationship: { type: String, trim: true }
  },
  medicalCondition: {
    type: String,
    trim: true
  },
  organRequirement: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  pincode: {
    type: String,
    trim: true
  },
  isProfileComplete: {
    type: Boolean,
    default: false
  },
  profilePicture: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PatientProfile', patientProfileSchema);
