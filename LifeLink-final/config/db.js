/**
 * ==============================================================================
 * LifeLink — MongoDB Connection Manager (Mongoose)
 * ==============================================================================
 * 
 * Configures connection to MongoDB (Local or MongoDB Atlas) using Mongoose.
 * Strict Error Handling: Never silently falls back to in-memory or localStorage data.
 * Exports connection status helpers and automated initial data seeding when connected.
 * ==============================================================================
 */

const mongoose = require('mongoose');

let isConnected = false;

/**
 * Connect to MongoDB using MONGODB_URI from environment variables.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('================================================================');
    console.error(' [CRITICAL ERROR] MONGODB_URI is not defined in .env');
    console.error(' Please set MONGODB_URI in .env (e.g., mongodb://localhost:27017/lifelink)');
    console.error(' or configure a MongoDB Atlas connection string.');
    console.error('================================================================');
    isConnected = false;
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s if server unreachable
    });

    isConnected = true;
    console.log('================================================================');
    console.log(` [DATABASE SUCCESS] MongoDB Connected: ${conn.connection.host}`);
    console.log(` Database Name: ${conn.connection.name}`);
    console.log('================================================================');

    // Run initial verified database seeding if collection is empty
    const seedData = require('./seedData');
    await seedData();

    return true;
  } catch (error) {
    isConnected = false;
    console.error('================================================================');
    console.error(' [DATABASE ERROR] Failed to connect to MongoDB:');
    console.error(` ${error.message}`);
    console.error('----------------------------------------------------------------');
    console.error(' TROUBLESHOOTING INSTRUCTIONS:');
    console.error(' 1. To use local MongoDB: Ensure "mongod" service is running on port 27017.');
    console.error(' 2. To use MongoDB Atlas: Paste your Atlas connection string into .env:');
    console.error('    MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxx.mongodb.net/lifelink');
    console.error(' 3. Note: The application will NOT silently fall back to fake in-memory data.');
    console.error('    API calls requiring database persistence will return HTTP 503.');
    console.error('================================================================');
    return false;
  }
};

// Monitor connection events
mongoose.connection.on('connected', () => {
  isConnected = true;
});

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  console.warn(' [DATABASE WARNING] MongoDB connection lost.');
});

mongoose.connection.on('error', (err) => {
  isConnected = false;
  console.error(` [DATABASE ERROR] Mongoose connection error: ${err.message}`);
});

/**
 * Check if the database connection is currently alive.
 */
const isDatabaseConnected = () => {
  return isConnected && mongoose.connection.readyState === 1;
};

/**
 * Express middleware to guard routes requiring database access.
 */
const requireDatabase = (req, res, next) => {
  if (!isDatabaseConnected()) {
    return res.status(503).json({
      success: false,
      error: 'DATABASE_UNAVAILABLE',
      message: 'MongoDB database is currently unavailable. Please verify MONGODB_URI in your .env file or start local MongoDB (mongod).',
      configurationHelp: 'Set MONGODB_URI in .env to a valid local MongoDB or MongoDB Atlas connection string.'
    });
  }
  next();
};

module.exports = {
  connectDB,
  isDatabaseConnected,
  requireDatabase
};
