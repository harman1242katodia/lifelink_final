/**
 * ==============================================================================
 * LifeLink — Notification Routes
 * ==============================================================================
 * 
 * Provides endpoints for in-app notifications across Patient, Hospital, and Donor:
 * 1. GET   /api/notifications: Retrieve authenticated user's notifications
 * 2. PATCH /api/notifications/:id/read: Mark single notification as read (ownership verified)
 * 3. PATCH /api/notifications/read-all: Mark all notifications as read for current user
 * ==============================================================================
 */

const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const { requireDatabase } = require('../config/db');

// All notification routes require MongoDB and valid authentication
router.use(requireDatabase);
router.use(protect);

/**
 * @route   GET /api/notifications
 * @desc    Retrieve all in-app notifications for authenticated user
 * @access  Private (Patient, Hospital, Donor)
 */
router.get('/', async (req, res) => {
  try {
    const { unreadOnly } = req.query;
    const filter = { recipient: req.user._id };

    if (unreadOnly === 'true') {
      filter.read = false;
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      read: false
    });

    res.status(200).json({
      success: true,
      unreadCount,
      count: notifications.length,
      data: notifications
    });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving notifications.'
    });
  }
});

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark a specific notification as read (enforces ownership)
 * @access  Private
 */
router.patch('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found.'
      });
    }

    // Ownership check: Can only mark own notifications as read
    if (notification.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_RECORD',
        message: 'Access denied: You cannot modify notifications belonging to another user.'
      });
    }

    notification.read = true;
    await notification.save();

    res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      data: notification
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating notification status.'
    });
  }
});

/**
 * @route   PATCH /api/notifications/read-all
 * @desc    Mark all unread notifications for current user as read
 * @access  Private
 */
router.patch('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { $set: { read: true } }
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read.'
    });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating notifications.'
    });
  }
});

module.exports = router;
