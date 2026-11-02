/**
 * ==============================================================================
 * LifeLink — Donor Profile Model
 * ==============================================================================
 * 
 * Stores verified donor records, blood groups, hospital associations,
 * reported availability, and self-reported health screening metrics.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const donorProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Donor full name is required'],
    trim: true
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [18, 'Minimum donor age is 18'],
    max: [70, 'Maximum donor age is 70']
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: [true, 'Gender is required']
  },
  bloodGroup: {
    type: String,
    required: [true, 'Blood group is required'],
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  },
  contact: {
    type: String,
    required: [true, 'Contact number is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email address is required'],
    trim: true
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true
  },
  locality: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    default: 'Punjab',
    trim: true
  },
  pincode: {
    type: String,
    trim: true
  },
  // Real coordinates for proximity calculation
  coordinates: {
    lat: { type: Number, required: false },
    lng: { type: Number, required: false }
  },
  donationType: {
    type: String,
    required: [true, 'Donation category is required'],
    trim: true
  },
  // Associated / preferred hospital
  associatedHospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HospitalProfile',
    required: false
  },
  associatedHospitalName: {
    type: String,
    trim: true
  },
  // Self-reported availability (not to be confused with confirmed medical eligibility)
  availability: {
    type: String,
    enum: ['Available', 'Unavailable', 'Under Review'],
    default: 'Available'
  },
  healthInformation: {
    weight: { type: Number },
    hemoglobin: { type: Number },
    bloodPressure: { type: String, trim: true },
    chronicDisease: { type: String, default: 'No' },
    medication: { type: String, default: 'No' },
    allergies: { type: String, default: 'None' },
    smoker: { type: String, default: 'No' }
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

module.exports = mongoose.model('DonorProfile', donorProfileSchema);
