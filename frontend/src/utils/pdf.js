import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

// Printable PDF reports: college header, title + details, table, signature lines, page numbers.
// College name comes from VITE_COLLEGE_NAME (frontend/.env), e.g. "ABC College of Engineering".
const COLLEGE = import.meta.env.VITE_COLLEGE_NAME || 'Smart Campus';
const BLUE = [37, 99, 235];
const STATUS = { present: 'P', absent: 'A', late: 'L', excused: 'E' };

// The built-in PDF fonts only cover Latin-1 (WinAnsi). Swap the few other characters we use, drop the rest.
const MAP = { '\u2212': '-', '\u2013': '-', '\u2014': '-', '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2026': '...', '\u2264': '<=', '\u2265': '>=' };
export const pdfText = (v) => String(v ?? '').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, (c) => MAP[c] ?? '');
const clean = (rows) => rows.map((r) => r.map((c) => (typeof c === 'number' ? c : pdfText(c))));

function makeDoc({ landscape, title, details }) {
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(20, 30, 50);
  doc.text(pdfText(COLLEGE), w / 2, 16, { align: 'center' });
  doc.setFontSize(12).setTextColor(...BLUE);
  doc.text(pdfText(title), w / 2, 23, { align: 'center' });
  doc.setDrawColor(...BLUE).setLineWidth(0.5).line(14, 26, w - 14, 26);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60, 70, 90);
  details.forEach((line, i) => doc.text(pdfText(line), 14, 32 + i * 5));
  return { doc, startY: 32 + details.length * 5 };
}

function finish(doc, filename, signatures, note) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  let y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : 60;
  if (note) {
    doc.setFontSize(8).setTextColor(90, 100, 120);
    doc.splitTextToSize(pdfText(note), w - 28).forEach((l) => { doc.text(l, 14, y); y += 4; });
  }
  // signature lines at the bottom of the last page (new page if no room)
  if (y > h - 40) { doc.addPage(); y = 30; }
  const sy = Math.max(y + 22, h - 30);
  const gap = (w - 28) / signatures.length;
  doc.setDrawColor(120).setLineWidth(0.2).setFontSize(9).setTextColor(40, 50, 70);
  signatures.forEach((s, i) => {
    const x = 14 + i * gap + 6;
    doc.line(x, sy, x + gap - 18, sy);
    doc.text(pdfText(s), x, sy + 5);
  });
  // footer on every page
  const pages = doc.getNumberOfPages();
  const stamp = `Generated ${new Date().toLocaleString('en-IN')} · Smart Campus`;
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5).setTextColor(130);
    doc.text(stamp, 14, h - 8);
    doc.text(`Page ${p} of ${pages}`, w - 14, h - 8, { align: 'right' });
  }
  doc.save(filename);
}

const tableStyle = {
  theme: 'grid',
  styles: { fontSize: 8, cellPadding: 1.5, lineColor: [210, 215, 225], lineWidth: 0.1 },
  headStyles: { fillColor: BLUE, textColor: 255, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: [245, 247, 252] },
  margin: { left: 14, right: 14, bottom: 16 },
};

// Day-wise register: rows = students, columns = classes (P/A/L/E), totals and %.
export function registerPdf({ classLabel, from, to, register, minPercent }) {
  const { sessions, students } = register.data;
  const { doc, startY } = makeDoc({
    landscape: true,
    title: 'Attendance Register',
    details: [`Class: ${classLabel}`, `Period: ${from} to ${to} · ${sessions.length} class(es) · Minimum ${minPercent}%`],
  });
  autoTable(doc, {
    ...tableStyle,
    startY: startY + 2,
    styles: { ...tableStyle.styles, fontSize: sessions.length > 25 ? 6 : 7.5, halign: 'center' },
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'left', cellWidth: 38 } },
    head: [['USN', 'Name', ...sessions.map((s) => `${s.sessionDate.slice(8, 10)}/${s.sessionDate.slice(5, 7)}\nP${s.periodNo}`), 'Held', 'Att.', '%']],
    body: clean(students.map((r) => [r.usn, r.fullName, ...r.statuses.map((x) => (x ? STATUS[x] : '-')), r.totalClasses, r.attendedClasses, r.attendancePercentage ?? '-'])),
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      if (d.cell.raw === 'A') d.cell.styles.textColor = [200, 30, 30];
      const pct = students[d.row.index]?.attendancePercentage;
      if (d.column.index === d.table.columns.length - 1 && pct !== null && pct < minPercent) { d.cell.styles.textColor = [200, 30, 30]; d.cell.styles.fontStyle = 'bold'; }
    },
  });
  finish(doc, `attendance-register_${from}_${to}.pdf`, ['Lecturer', 'Head of Department', 'Principal'],
    `P = present, A = absent, L = late, E = excused, - = no record. ${register.rule?.text || ''}.`);
}

// Shortage list: students below the limit, one row per student and subject, with classes needed.
export function shortagePdf({ scopeLabel, from, to, rows, below, ruleText }) {
  const { doc, startY } = makeDoc({
    landscape: false,
    title: `Attendance Shortage List (below ${below}%)`,
    details: [scopeLabel, `Period: ${from} to ${to} · ${new Set(rows.map((r) => r.usn)).size} student(s), ${rows.length} subject entr${rows.length === 1 ? 'y' : 'ies'}`],
  });
  autoTable(doc, {
    ...tableStyle,
    startY: startY + 2,
    head: [['#', 'USN', 'Name', 'Subject', 'Held', 'Attended', '%', 'Classes needed']],
    body: clean(rows.map((r, i) => [i + 1, r.usn, r.fullName, `${r.subjectCode} ${r.subjectName}`, r.totalClasses, r.attendedClasses, r.attendancePercentage, r.classesToReach])),
    columnStyles: { 0: { cellWidth: 8 }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center', textColor: [200, 30, 30], fontStyle: 'bold' }, 7: { halign: 'center' } },
  });
  if (!rows.length) {
    doc.setFontSize(10).setTextColor(40, 120, 60).text('No student is below the limit for this period.', 14, (doc.lastAutoTable?.finalY || startY) + 8);
  }
  finish(doc, `attendance-shortage_${from}_${to}.pdf`, ['Class Teacher', 'Head of Department', 'Principal'],
    `${ruleText || ''}. "Classes needed" = classes in a row the student must attend to reach the minimum.`);
}
