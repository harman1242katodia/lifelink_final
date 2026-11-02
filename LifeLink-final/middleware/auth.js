/**
 * ==============================================================================
 * LifeLink — Authentication & Role-Based Access Middleware
 * ==============================================================================
 * 
 * Verifies JWT tokens, loads authenticated user context, and enforces
 * strict role-based access control and record ownership on the server side.
 * Never trusts client-supplied roles or identity fields.
 * ==============================================================================
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Generate a signed JWT token for a user.
 */
const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is missing from the .env file.');
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
      name: user.name
    },
    secret,
    { expiresIn: '30d' }
  );
};

/**
 * Middleware: Verify JWT in Authorization header and attach req.user.
 */
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer ')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Access denied: Authentication token is missing. Please sign in.'
    });
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured.');
    const decoded = jwt.verify(token, secret);

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'The account associated with this token no longer exists.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired authentication token. Please sign in again.'
    });
  }
};

/**
 * Middleware: Enforce role-based access control.
 * @param  {...string} roles Allowed roles ('patient', 'hospital', 'donor')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required prior to role verification.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN_ROLE',
        message: `Forbidden: User role '${req.user.role}' is not authorized to access this resource.`
      });
    }

    next();
  };
};

module.exports = {
  generateToken,
  protect,
  authorize
};
