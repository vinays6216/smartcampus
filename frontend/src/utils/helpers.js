// Removes '', null and undefined so optional fields are simply left out of the request
export const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined));

// Builds multipart/form-data (files + fields). Arrays are appended repeatedly (assignment "files").
export function toFormData(values) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === '' || value === null || value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, v));
    else fd.append(key, value);
  }
  return fd;
}

// Turns an axios error into one readable message (uses the backend's { message, details })
export function errMsg(err) {
  const d = err?.response?.data;
  if (!d) return err?.message || 'Something went wrong';
  const details = Array.isArray(d.details) && d.details.length
    ? ': ' + d.details.map((x) => `${x.field} ${x.message}`).join(', ')
    : '';
  return (d.message || 'Request failed') + details;
}

const TONES = {
  present: 'green', approved: 'green', submitted: 'green', Submitted: 'green', active: 'green', published: 'blue',
  absent: 'red', rejected: 'red', Overdue: 'red', closed: 'red', dropped: 'red', suspended: 'red', urgent: 'red', inactive: 'red',
  late: 'amber', open: 'amber', 'Due soon': 'amber', Pending: 'amber', important: 'amber', not_submitted: 'amber',
  excused: 'gray', draft: 'gray', normal: 'gray', withdrawn: 'gray', passed_out: 'gray',
};
export const tone = (status) => TONES[status] || 'gray';
export const label = (s) => String(s ?? '').replace(/_/g, ' ');

export const classLabel = (t) =>
  `${t.subjectCode} - ${t.subjectName} | ${t.programCode} Sem ${t.semesterNo} Sec ${t.sectionName}`;
export const sectionLabel = (s) => `${s.programCode} ${s.academicYear} Sem ${s.semesterNo} Sec ${s.name}`;

export function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
