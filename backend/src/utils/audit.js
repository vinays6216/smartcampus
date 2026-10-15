const { pool } = require('../config/db');

// Writes one row to audit_logs. Never throws (an audit failure must not break the request).
exports.audit = async (req, action, entityType, entityId, oldValues = null, newValues = null, conn = pool) => {
  try {
    await conn.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user ? req.user.id : null,
        action,
        entityType,
        entityId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null,
        req.ip,
      ]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};
