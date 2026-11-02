/**
 * ==============================================================================
 * LifeLink — Hospital Profile Model
 * ==============================================================================
 * 
 * Stores accredited medical facility profile data, locality, contact information,
 * and geographic coordinates (latitude and longitude) used for real proximity calculation.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const hospitalProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  hospitalName: {
    type: String,
    required: [true, 'Hospital name is required'],
    trim: true
  },
  licenseNumber: {
    type: String,
    required: [true, 'Medical license / accreditation number is required'],
    trim: true
  },
  address: {
    type: String,
    required: [true, 'Facility address is required'],
    trim: true
  },
  locality: {
    type: String,
    required: [true, 'Locality is required (e.g. Sector 16, Mohali Phase 7)'],
    trim: true
  },
  city: {
    type: String,
    required: [true, 'City is required'],
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
  contact: {
    type: String,
    required: [true, 'Emergency contact phone number is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Administrative email is required'],
    trim: true
  },
  // Real geographic coordinates for distance calculation
  coordinates: {
    lat: {
      type: Number,
      required: false
    },
    lng: {
      type: Number,
      required: false
    }
  },
  availableBloodStock: [
    {
      bloodGroup: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
      },
      units: {
        type: Number,
        default: 0
      },
      lastUpdated: {
        type: Date,
        default: Date.now
      }
    }
  ],
  active: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('HospitalProfile', hospitalProfileSchema);
