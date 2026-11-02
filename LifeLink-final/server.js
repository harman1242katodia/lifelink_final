/**
 * ==============================================================================
 * LifeLink — Blood & Organ Donation Platform
 * Backend Server Entry Point (Node.js, Express & MongoDB / Mongoose)
 * ==============================================================================
 * 
 * Strict Architecture:
 * - Persistent storage with MongoDB / Mongoose
 * - JWT authentication with bcrypt password hashing
 * - Role-based authorization: Patient, Hospital, Donor
 * - Distinct workflows: Emergency Patient Requests vs. Volunteer Donor Applications
 * - Deterministic triage prioritization heuristic
 * - No fake data fallback: Strictly fails or warns if database is disconnected
 * ==============================================================================
 */

const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const { connectDB, isDatabaseConnected } = require('./config/db');

// Load environment configuration from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ==============================================================================
 * 1. MIDDLEWARE CONFIGURATION
 * ============================================================================== */

// Body parsing middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// Static frontend delivery from LifeLink directory and subdirectories
app.use(express.static(path.join(__dirname, 'LifeLink')));
app.use(express.static(path.join(__dirname, 'LifeLink', 'home')));

// Static file delivery for uploaded profile images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ==============================================================================
 * 2. SYSTEM HEALTH CHECK
 * ============================================================================== */

app.get('/api/health', (req, res) => {
  const dbConnected = isDatabaseConnected();
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'UP' : 'DEGRADED',
    database: dbConnected ? 'Connected (MongoDB)' : 'Disconnected (MongoDB Unavailable)',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

/* ==============================================================================
 * 3. MOUNT REST API ROUTES
 * ============================================================================== */

// Authentication & Profile routes (Patient, Hospital, Donor)
app.use('/api/auth', require('./routes/authRoutes'));

// Patient Portal routes (Emergency Requests, Profile, Smart Donor Match)
app.use('/api/patient', require('./routes/patientRoutes'));

// Hospital Portal routes (Assigned Requests, Clinical Review & Response, Donor Applications)
app.use('/api/hospital', require('./routes/hospitalRoutes'));

// Donor Portal routes (Volunteer Applications, Profile)
app.use('/api/donor', require('./routes/donorRoutes'));

// Notification routes (In-app alerts for all roles)
app.use('/api/notifications', require('./routes/notificationRoutes'));

/* ==============================================================================
 * 4. DEPRECATION HANDLERS FOR LEGACY PROTOTYPE ENDPOINTS
 * ==============================================================================
 * Disables the Milestone 1 in-memory mock store without silent fake data fallback.
 */

app.all(['/api/requests', '/api/requests/*'], (req, res) => {
  res.status(410).json({
    success: false,
    error: 'ENDPOINT_DEPRECATED',
    message: 'The prototype in-memory /api/requests endpoint has been deprecated and retired. Real medical records are persisted in MongoDB. Please use the authenticated role-specific endpoints (/api/patient/requests, /api/hospital/requests, or /api/donor/applications).'
  });
});

/* ==============================================================================
 * 5. ROOT LANDING & FALLBACK
 * ============================================================================== */

// Landing page route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'LifeLink', 'home', 'home.html'));
});

// 404 handler for unmatched API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.method} ${req.originalUrl}' does not exist.`
  });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error occurred.',
    timestamp: new Date().toISOString()
  });
});

/* ==============================================================================
 * 6. SERVER INITIALIZATION WITH DATABASE CONNECTION
 * ============================================================================== */

async function startServer() {
  console.log(' Connecting to MongoDB database...');
  const connected = await connectDB();

  if (!connected) {
    console.warn('⚠️  WARNING: MongoDB connection could not be established on startup.');
    console.warn('⚠️  Database-dependent API calls will return HTTP 503 until connection is restored.');
  }

  const server = app.listen(PORT, () => {
    console.log('====================================================');
    console.log(` LifeLink Server running on http://localhost:${PORT}`);
    console.log(` Database:    ${isDatabaseConnected() ? 'Connected (MongoDB)' : 'Disconnected'}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(` Health:      http://localhost:${PORT}/api/health`);
    console.log(` Home Page:   http://localhost:${PORT}/home/home.html`);
    console.log('====================================================');
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
