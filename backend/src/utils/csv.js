/**
 * Lightweight, zero-dependency RFC 4180 compliant CSV parser and serializer.
 */

function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];

  // Strip UTF-8 BOM if present
  let str = text;
  if (str.charCodeAt(0) === 0xfeff) {
    str = str.slice(1);
  }

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = str.length;

  while (i < len) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote ""
          field += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        row.push(field);
        field = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
        continue;
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
        continue;
      } else {
        field += char;
        i++;
        continue;
      }
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Filter out empty lines
  const cleanRows = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (cleanRows.length === 0) return [];

  const headers = cleanRows[0].map((h) => h.trim());
  const data = [];
  for (let r = 1; r < cleanRows.length; r++) {
    const record = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = cleanRows[r][c] !== undefined ? cleanRows[r][c].trim() : '';
    }
    data.push(record);
  }
  return data;
}

function escapeCSVField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function serializeCSV(headers, rows) {
  const headerLine = headers.map(escapeCSVField).join(',');
  const lines = rows.map((row) =>
    headers.map((h) => escapeCSVField(row[h] !== undefined ? row[h] : '')).join(',')
  );
  return [headerLine, ...lines].join('\r\n');
}

/**
 * Normalizes a raw CSV record object by matching various common column header variations.
 */
function normalizeStudentHeaders(raw) {
  const normalized = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = key.toLowerCase().replace(/[\s_-]+/g, '');
    if (['fullname', 'name', 'studentname'].includes(k)) {
      normalized.fullName = value;
    } else if (['usn', 'usnno', 'rollno', 'rollnumber', 'regno'].includes(k)) {
      normalized.usn = value;
    } else if (['email', 'mail', 'emailaddress'].includes(k)) {
      normalized.email = value;
    } else if (['phone', 'phoneno', 'mobile', 'contact'].includes(k)) {
      normalized.phone = value;
    } else if (['password', 'pass'].includes(k)) {
      normalized.password = value;
    } else if (['program', 'programcode', 'programid'].includes(k)) {
      normalized.program = value;
    } else if (['section', 'sectionname', 'sectionid'].includes(k)) {
      normalized.section = value;
    } else if (['admissionyear', 'year', 'batch'].includes(k)) {
      normalized.admissionYear = value;
    } else if (['dateofbirth', 'dob', 'birthdate'].includes(k)) {
      normalized.dateOfBirth = value;
    } else if (['gender', 'sex'].includes(k)) {
      normalized.gender = value.toLowerCase();
    } else if (['address'].includes(k)) {
      normalized.address = value;
    } else if (['guardianname', 'parentname', 'guardian'].includes(k)) {
      normalized.guardianName = value;
    } else if (['guardianphone', 'parentphone'].includes(k)) {
      normalized.guardianPhone = value;
    }
  }
  return normalized;
}

module.exports = {
  parseCSV,
  serializeCSV,
  normalizeStudentHeaders,
};
