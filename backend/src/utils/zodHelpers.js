const { z } = require('zod');

const id = z.coerce.number().int().positive();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:MM');

// Booleans arrive as "true"/"false"/"1" strings in multipart forms.
const boolOpt = z.preprocess(
  (v) => (v === undefined ? undefined : v === true || v === 'true' || v === '1' || v === 1),
  z.boolean().optional()
);
const bool = (defaultValue) => boolOpt.default(defaultValue);

const idParam = z.object({ id });

module.exports = { z, id, dateStr, timeStr, bool, boolOpt, idParam };
