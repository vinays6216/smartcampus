import { useState } from 'react';
import { del, get, post } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import { Async, Empty, PageHeader } from '../../components/ui';
import { clean, errMsg, sectionLabel } from '../../utils/helpers';

// Teaching assignment = lecturer + subject + section. Attendance, assignments and materials all depend on it.
export default function Teaching() {
  const toast = useToast();
  const [filters, setFilters] = useState({ lecturerId: '', sectionId: '' });
  const [creating, setCreating] = useState(false);

  const f = useFetch(() => get('/teaching', clean(filters)), [filters]);
  const lecturers = useFetch(() => get('/admin/lecturers', { limit: 100 }), []);
  const sections = useFetch(() => get('/academic/sections'), []);
  const subjects = useFetch(() => get('/academic/subjects'), []);

  const lecturerOptions = (lecturers.data || []).map((l) => ({ value: l.id, label: `${l.fullName} (${l.employeeCode})` }));
  const sectionOptions = (sections.data || []).map((s) => ({ value: s.id, label: sectionLabel(s) }));

  // only subjects of the selected section's program and semester are valid
  const subjectOptions = (v) => {
    const sec = (sections.data || []).find((s) => String(s.id) === String(v.sectionId));
    return (subjects.data || [])
      .filter((s) => !sec || (s.programId === sec.programId && s.semesterNo === sec.semesterNo))
      .map((s) => ({ value: s.id, label: `${s.code} - ${s.name}` }));
  };

  const fields = [
    { name: 'lecturerId', label: 'Lecturer', type: 'select', required: true, options: lecturerOptions },
    { name: 'sectionId', label: 'Section', type: 'select', required: true, options: sectionOptions },
    { name: 'subjectId', label: 'Subject', type: 'select', required: true, options: subjectOptions, hint: 'Shows subjects of the same program and semester as the section.' },
  ];

  const create = async (v) => {
    await post('/teaching', clean(v));
    toast.success('Teaching assignment added');
    setCreating(false);
    f.reload();
  };

  const remove = async (row) => {
    if (!window.confirm('Remove this teaching assignment?')) return;
    try { await del(`/teaching/${row.id}`); toast.success('Removed'); f.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <>
      <PageHeader title="Teaching Assignments" subtitle="Which lecturer teaches which subject to which section">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Assign lecturer</button>
      </PageHeader>

      <div className="card filters">
        <div><label>Lecturer</label>
          <select value={filters.lecturerId} onChange={(e) => setFilters({ ...filters, lecturerId: e.target.value })}>
            <option value="">All</option>{lecturerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div><label>Section</label>
          <select value={filters.sectionId} onChange={(e) => setFilters({ ...filters, sectionId: e.target.value })}>
            <option value="">All</option>{sectionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
      </div>

      <div className="card">
        <Async f={f}>
          {!f.data?.length && <Empty>No teaching assignments yet.</Empty>}
          {!!f.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Lecturer</th><th>Subject</th><th>Class</th><th>Year</th><th>Students</th><th /></tr></thead>
                <tbody>
                  {f.data.map((t) => (
                    <tr key={t.id}>
                      <td>{t.lecturerName}</td>
                      <td><strong>{t.subjectCode}</strong> {t.subjectName}</td>
                      <td>{t.programCode} Sem {t.semesterNo} Sec {t.sectionName}</td>
                      <td>{t.academicYear}</td>
                      <td>{t.studentCount}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => remove(t)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>

      <FormModal open={creating} title="Assign lecturer to a class" fields={fields} submitLabel="Assign" onSubmit={create} onClose={() => setCreating(false)} />
    </>
  );
}
