/**
 * ==============================================================================
 * LifeLink — Patient Donation Request Model (Review & Response Workflow)
 * ==============================================================================
 * 
 * Represents high-priority medical donation requests initiated by patients.
 * Distinct from donor applications.
 * Implements clinical Review-and-Response workflow (not immediate Accept/Reject).
 * ==============================================================================
 */

const mongoose = require('mongoose');

const patientRequestSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  patientName: {
    type: String,
    required: [true, 'Patient name is required'],
    trim: true
  },
  patientContact: {
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
    required: [true, 'Hospital name is required'],
    trim: true
  },
  donationType: {
    type: String,
    required: [true, 'Donation category is required (e.g. Blood, Kidney, Liver)'],
    trim: true
  },
  bloodGroup: {
    type: String,
    trim: true
  },
  organRequired: {
    type: String,
    trim: true
  },
  requiredUnits: {
    type: Number,
    default: 1
  },
  urgency: {
    type: String,
    enum: ['Critical', 'High', 'Normal'],
    default: 'Normal'
  },
  priority: {
    type: String,
    enum: ['High', 'Medium', 'Low'],
    default: 'Medium'
  },
  priorityReason: {
    type: String,
    trim: true
  },
  location: {
    type: String,
    required: [true, 'Patient location/ward is required'],
    trim: true
  },
  locality: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Clinical description is required'],
    trim: true
  },
  // Distinct Review & Response Status Workflow (Section 5A)
  status: {
    type: String,
    enum: [
      'Pending Review',
      'Under Review',
      'Reviewed — Response Sent',
      'More Information Required',
      'Unable to Proceed — Explanation Sent',
      'Completed'
    ],
    default: 'Pending Review'
  },
  // Audit trail of written hospital responses and status transitions
  responses: [
    {
      senderUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      senderName: {
        type: String,
        trim: true
      },
      hospitalName: {
        type: String,
        trim: true
      },
      message: {
        type: String,
        required: [true, 'Response text is required'],
        trim: true
      },
      statusAtResponse: {
        type: String
      },
      timestamp: {
        type: Date,
        default: Date.now
      }
    }
  ],
  // Matched donor reference if linked via Smart Donor Match
  matchedDonor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DonorProfile'
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

// Update timestamp before saving
patientRequestSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model('PatientRequest', patientRequestSchema);
