/**
 * ==============================================================================
 * LifeLink — Donor Application Model (Decision Workflow)
 * ==============================================================================
 * 
 * Represents volunteer donor applications routed to specific hospitals.
 * Distinct from patient emergency requests.
 * Uses clinical decision workflow: Pending Review, Under Review, Accepted, Rejected, More Info.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const donorApplicationSchema = new mongoose.Schema({
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  donorName: {
    type: String,
    required: [true, 'Donor full legal name is required'],
    trim: true
  },
  donorAge: {
    type: Number
  },
  gender: {
    type: String
  },
  donorContact: {
    type: String,
    required: [true, 'Contact phone number is required'],
    trim: true
  },
  donorEmail: {
    type: String,
    required: [true, 'Email address is required'],
    trim: true
  },
  city: {
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
  hospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'HospitalProfile',
    required: [true, 'Target hospital reference is required']
  },
  hospitalName: {
    type: String,
    required: [true, 'Target hospital name is required'],
    trim: true
  },
  donationType: {
    type: String,
    required: [true, 'Donation category is required (e.g. Blood, Kidney, Liver)'],
    trim: true
  },
  donationCategory: {
    type: String,
    enum: ['Blood', 'Organ/Tissue'],
    default: 'Blood'
  },
  bloodGroup: {
    type: String,
    trim: true
  },
  requiredUnits: {
    type: Number,
    default: 1
  },
  preferredDonationDate: {
    type: String,
    trim: true
  },
  selectedOrgan: {
    type: String,
    trim: true
  },
  organCity: {
    type: String,
    trim: true
  },
  additionalInfo: {
    type: String,
    trim: true
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
  emergencyLevel: {
    type: String,
    default: 'Medium'
  },
  // Distinct Decision Status Workflow (Section 5B)
  status: {
    type: String,
    enum: [
      'Pending Review',
      'Under Review',
      'Accepted',
      'Rejected',
      'More Information Required'
    ],
    default: 'Pending Review'
  },
  // Clinical decision records
  hospitalDecision: {
    decision: {
      type: String
    },
    explanation: {
      type: String,
      trim: true
    },
    instructions: {
      type: String,
      trim: true
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    decidedAt: {
      type: Date
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

donorApplicationSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('DonorApplication', donorApplicationSchema);
