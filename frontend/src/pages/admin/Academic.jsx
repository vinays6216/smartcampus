import { useState } from 'react';
import { del, get, post, put } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import { Async, Badge, Empty, PageHeader, Tabs } from '../../components/ui';
import { fmtDate } from '../../utils/format';
import { clean, errMsg } from '../../utils/helpers';

const SEMESTERS = Array.from({ length: 8 }, (_, i) => ({ value: i + 1, label: `Semester ${i + 1}` }));

// One entry per backend resource: /api/academic/<path>
//   columns: what the table shows.  fields: the create / edit form (names = request body keys).
const buildConfig = (lookups, needsSpec, specOptions) => ({
  departments: {
    title: 'Departments',
    columns: [['Code', (r) => r.code], ['Name', (r) => r.name]],
    fields: [{ name: 'code', label: 'Code', required: true, half: true }, { name: 'name', label: 'Name', required: true, half: true }],
  },
  programs: {
    title: 'Programs',
    columns: [['Code', (r) => r.code], ['Name', (r) => r.name], ['Department', (r) => r.departmentName], ['Semesters', (r) => r.durationSemesters],
      ['Specialization from sem', (r) => r.specializationStartSem ?? '-']],
    fields: [
      { name: 'departmentId', label: 'Department', type: 'select', required: true, options: lookups.departments },
      { name: 'code', label: 'Code (e.g. MCA)', required: true, half: true },
      { name: 'name', label: 'Name', required: true, half: true },
      { name: 'durationSemesters', label: 'Number of semesters', type: 'number', min: 1, max: 12, default: 4, half: true },
      { name: 'specializationStartSem', label: 'Specialization starts in semester', type: 'number', min: 1, max: 12, half: true,
        hint: 'MCA: 3. Leave empty if the program has no specializations.' },
    ],
  },
  specializations: {
    title: 'Specializations',
    columns: [['Program', (r) => r.programCode], ['Code', (r) => r.code], ['Name', (r) => r.name]],
    fields: [
      { name: 'programId', label: 'Program', type: 'select', required: true, options: lookups.programs },
      { name: 'code', label: 'Code (e.g. WAD, DS, AIML)', required: true, half: true },
      { name: 'name', label: 'Name', required: true, half: true },
    ],
  },
  'academic-years': {
    title: 'Academic years',
    columns: [['Label', (r) => r.label], ['Start', (r) => fmtDate(r.startDate)], ['End', (r) => fmtDate(r.endDate)],
      ['Current', (r) => (r.isCurrent ? <Badge value="active">Current</Badge> : '')]],
    fields: [
      { name: 'label', label: 'Label (e.g. 2026-27)', required: true },
      { name: 'startDate', label: 'Start date', type: 'date', required: true, half: true },
      { name: 'endDate', label: 'End date', type: 'date', required: true, half: true },
      { name: 'isCurrent', type: 'checkbox', label: '', checkLabel: 'This is the current academic year' },
    ],
  },
  sections: {
    title: 'Sections',
    columns: [['Program', (r) => r.programCode], ['Year', (r) => r.academicYear], ['Semester', (r) => r.semesterNo],
      ['Specialization', (r) => r.specializationName || '-'], ['Section', (r) => r.name]],
    fields: [
      { name: 'programId', label: 'Program', type: 'select', required: true, options: lookups.programs },
      { name: 'academicYearId', label: 'Academic year', type: 'select', required: true, options: lookups.years },
      { name: 'semesterNo', label: 'Semester', type: 'select', required: true, half: true, options: SEMESTERS },
      { name: 'name', label: 'Section name (A, B...)', required: true, half: true },
      { name: 'specializationId', label: 'Specialization', type: 'select', required: true, options: specOptions, show: needsSpec,
        placeholder: 'Select specialization', hint: 'From the specialization semester (MCA: Sem 3) every section belongs to one specialization.' },
    ],
  },
  subjects: {
    title: 'Subjects',
    columns: [['Code', (r) => r.code], ['Name', (r) => r.name], ['Program', (r) => r.programCode], ['Sem', (r) => r.semesterNo],
      ['Specialization', (r) => r.specializationName || 'Common'], ['Credits', (r) => r.credits], ['Type', (r) => r.subjectType]],
    fields: [
      { name: 'programId', label: 'Program', type: 'select', required: true, options: lookups.programs },
      { name: 'code', label: 'Subject code', required: true, half: true },
      { name: 'name', label: 'Subject name', required: true, half: true },
      { name: 'semesterNo', label: 'Semester', type: 'select', required: true, half: true, options: SEMESTERS },
      { name: 'credits', label: 'Credits', type: 'number', min: 0, max: 10, default: 3, half: true },
      { name: 'subjectType', label: 'Type', type: 'select', default: 'theory', half: true,
        options: ['theory', 'lab', 'elective', 'project'].map((v) => ({ value: v, label: v })) },
      { name: 'specializationId', label: 'Specialization', type: 'select', options: specOptions, show: needsSpec,
        placeholder: 'Common to all specializations', hint: 'Choose a specialization only for subjects taught to that specialization alone.' },
    ],
  },
});

export default function Academic() {
  const toast = useToast();
  const [tab, setTab] = useState('departments');
  const [form, setForm] = useState(null); // { row } (row = null when creating)

  // dropdown data used by the forms
  const departments = useFetch(() => get('/academic/departments'), []);
  const programs = useFetch(() => get('/academic/programs'), []);
  const specs = useFetch(() => get('/academic/specializations'), []);
  const years = useFetch(() => get('/academic/academic-years'), []);
  const lookups = {
    departments: (departments.data || []).map((d) => ({ value: d.id, label: d.name })),
    programs: (programs.data || []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` })),
    years: (years.data || []).map((y) => ({ value: y.id, label: y.label })),
  };

  // The specialization field is shown only when the chosen program has specializations
  // and the chosen semester is at or after the semester they start in (MCA: Sem 3).
  const startSemOf = (programId) => (programs.data || []).find((p) => String(p.id) === String(programId))?.specializationStartSem ?? null;
  const needsSpec = (v) => {
    const start = startSemOf(v.programId);
    return start !== null && Number(v.semesterNo) >= start;
  };
  const specOptions = (v) => (specs.data || [])
    .filter((s) => String(s.programId) === String(v.programId))
    .map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }));

  const config = buildConfig(lookups, needsSpec, specOptions);
  const cfg = config[tab];

  const f = useFetch(() => get(`/academic/${tab}`), [tab]);

  const save = async (v) => {
    const body = clean(v);
    if ((tab === 'sections' || tab === 'subjects') && !needsSpec(v)) delete body.specializationId;
    if (form.row) await put(`/academic/${tab}/${form.row.id}`, body);
    else await post(`/academic/${tab}`, body);
    toast.success('Saved');
    setForm(null);
    f.reload();
    // refresh dropdown sources after changing them
    departments.reload(); programs.reload(); specs.reload(); years.reload();
  };

  const remove = async (row) => {
    if (!window.confirm('Delete this record?')) return;
    try { await del(`/academic/${tab}/${row.id}`); toast.success('Deleted'); f.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  const initialFor = (row) => (row ? { ...row, isCurrent: !!row.isCurrent } : {});

  return (
    <>
      <PageHeader title="Academic Setup" subtitle="Departments, programs, specializations, years, sections and subjects. Set these up before adding students.">
        <button className="btn btn-primary" onClick={() => setForm({ row: null })}>+ Add</button>
      </PageHeader>

      <div className="alert alert-info">
        <strong>MCA set-up order:</strong> program (specialization starts in semester 3) &rarr; its specializations (WAD, DS, AIML) &rarr; academic year &rarr;
        sections (Sem 1-2 common, Sem 3-4 one per specialization) &rarr; subjects (common, or tied to a specialization).
      </div>

      <Tabs active={tab} onChange={setTab} items={Object.entries(config).map(([key, c]) => ({ key, label: c.title }))} />

      <div className="card">
        <Async f={f.loading ? { ...f, body: null } : f}>
          {!f.data?.length && <Empty>Nothing added yet.</Empty>}
          {!!f.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr>{cfg.columns.map(([h]) => <th key={h}>{h}</th>)}<th /></tr></thead>
                <tbody>
                  {f.data.map((row) => (
                    <tr key={row.id}>
                      {cfg.columns.map(([h, render]) => <td key={h}>{render(row)}</td>)}
                      <td><span className="btn-group">
                        <button className="btn btn-sm" onClick={() => setForm({ row })}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(row)}>Delete</button>
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>

      <FormModal
        open={!!form}
        title={`${form?.row ? 'Edit' : 'Add'} - ${cfg.title}`}
        fields={cfg.fields}
        initial={initialFor(form?.row)}
        onSubmit={save}
        onClose={() => setForm(null)}
      />
    </>
  );
}
