const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

// Reads "Authorization: Bearer <token>" and sets req.user = { id, role, profileId }
// id        -> users.id
// profileId -> students.id / lecturers.id / admins.id (depends on the role)
exports.authenticate = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Authentication required'));
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    req.user = { id: payload.sub, role: payload.role, profileId: payload.pid };
    next();
  } catch (err) {
    next(err);
  }
};

// Usage: authorize('admin', 'lecturer')
exports.authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission to perform this action'));
  }
  next();
};
