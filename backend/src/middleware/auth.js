const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { adminAccess, AREAS } = require('../utils/permissions');

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

// Admins need the permission for this area (platform admins have all). Lecturers and students pass through,
// so it can follow authorize('lecturer', 'admin'). Checked on every request, so changes apply immediately.
exports.adminCan = (area) => async (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') return next();
  try {
    const access = req.adminAccess || (req.adminAccess = await adminAccess(req.user.profileId));
    if (!access.active) return next(new ApiError(403, 'Your account is not active. Contact the platform admin.'));
    if (!access.permissions.includes(area)) {
      return next(new ApiError(403, `Your admin account does not have the "${AREAS[area] || area}" permission`));
    }
    next();
  } catch (err) { next(err); }
};

// Platform admins only (manage admin accounts and permissions).
exports.platformOnly = async (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') return next(new ApiError(403, 'Only the platform admin can do this'));
  try {
    const access = req.adminAccess || (req.adminAccess = await adminAccess(req.user.profileId));
    if (!access.ready) return next(new ApiError(503, 'Admin permissions are not set up yet: run database/migrations/002_admin_permissions.sql'));
    if (!access.active || !access.platform) return next(new ApiError(403, 'Only the platform admin can do this'));
    next();
  } catch (err) { next(err); }
};
