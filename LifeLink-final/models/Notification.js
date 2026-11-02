/**
 * ==============================================================================
 * LifeLink — Notification Model
 * ==============================================================================
 * 
 * In-app notifications for patients, donors, and hospitals.
 * Triggered on status updates, written responses, and clinical reviews.
 * ==============================================================================
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipientRole: {
    type: String,
    enum: ['patient', 'hospital', 'donor'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['patient_request', 'donor_application', 'system'],
    default: 'system'
  },
  relatedId: {
    type: String,
    trim: true
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Notification', notificationSchema);
