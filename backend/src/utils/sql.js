// buildUpdate({ fullName: 'full_name' }, { fullName: 'Ravi' }) -> { sets: ['full_name=?'], values: ['Ravi'] }
exports.buildUpdate = (fieldMap, body) => {
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (body[key] !== undefined) {
      sets.push(`${column}=?`);
      values.push(body[key]);
    }
  }
  return { sets, values };
};

// Converts "2026-10-20T17:00" (datetime-local) or an ISO string to "YYYY-MM-DD HH:mm:ss" (server local time).
exports.toSqlDateTime = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// Today's date as YYYY-MM-DD in server local time.
exports.todayLocal = () => new Date().toLocaleDateString('en-CA');
