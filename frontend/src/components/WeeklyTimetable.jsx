import { useState } from 'react';
import { del, get, post, put } from '../api/client';
import useFetch from '../hooks/useFetch';
import { useToast } from '../context/ToastContext';
import FormModal from './FormModal';
import { Async, Empty } from './ui';
import { errMsg } from '../utils/helpers';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hhmm = (t) => (t ? t.slice(0, 5) : '');

// Weekly grid: days down the side, periods across the top.
// Admin (editable) works on one section; students see their section; lecturers see their own classes.
export default function WeeklyTimetable({ sectionId, editable, showSection }) {
  const toast = useToast();
  const slots = useFetch(() => get('/timetables/slots', sectionId ? { sectionId } : undefined), [sectionId]);
  const classes = useFetch(() => (editable && sectionId ? get('/teaching', { sectionId }) : Promise.resolve({ data: [] })), [editable, sectionId]);
  const [editing, setEditing] = useState(null); // { slot } or { dayOfWeek, periodNo }

  if (editable && !sectionId) return <div className="card"><h2>Weekly timetable</h2><Empty>Select a section above to build its weekly timetable.</Empty></div>;

  const rows = slots.data || [];
  const maxPeriod = Math.max(editable ? 6 : 0, ...rows.map((s) => s.periodNo));
  const lastDay = Math.max(editable ? 6 : 5, ...rows.map((s) => s.dayOfWeek));
  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);
  const days = DAYS.slice(0, lastDay).map((d, i) => [i + 1, d]);
  const at = (day, p) => rows.filter((s) => s.dayOfWeek === day && s.periodNo === p);
  const todayDow = ((new Date().getDay() + 6) % 7) + 1;

  const classOptions = (classes.data || []).map((t) => ({ value: t.id, label: `${t.subjectCode} - ${t.subjectName} (${t.lecturerName || 'lecturer'})` }));
  const fields = [
    { name: 'teachingAssignmentId', label: 'Subject / lecturer', type: 'select', required: true, options: classOptions },
    { name: 'dayOfWeek', label: 'Day', type: 'select', required: true, half: true, options: DAYS.map((d, i) => ({ value: i + 1, label: d })) },
    { name: 'periodNo', label: 'Period', type: 'number', required: true, half: true, min: 1, max: 12 },
    { name: 'startTime', label: 'Start', type: 'time', required: true, half: true },
    { name: 'endTime', label: 'End', type: 'time', required: true, half: true },
    { name: 'room', label: 'Room (optional)', placeholder: 'e.g. LH-101' },
  ];
  const initial = editing?.slot
    ? { ...editing.slot, startTime: hhmm(editing.slot.startTime), endTime: hhmm(editing.slot.endTime), room: editing.slot.room || '' }
    : editing ? { dayOfWeek: editing.dayOfWeek, periodNo: editing.periodNo, ...guessTimes(rows, editing.periodNo) } : {};

  const save = async (v) => {
    const body = {
      teachingAssignmentId: Number(v.teachingAssignmentId), dayOfWeek: Number(v.dayOfWeek), periodNo: Number(v.periodNo),
      startTime: v.startTime, endTime: v.endTime, ...(v.room ? { room: v.room } : {}),
    };
    if (editing.slot) await put(`/timetables/slots/${editing.slot.id}`, body);
    else await post('/timetables/slots', body);
    toast.success('Timetable saved');
    setEditing(null);
    slots.reload();
  };
  const remove = async () => {
    if (!window.confirm('Remove this class from the timetable?')) return;
    try { await del(`/timetables/slots/${editing.slot.id}`); toast.success('Class removed'); setEditing(null); slots.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: '.6rem' }}>
        <h2 style={{ margin: 0 }}>Weekly timetable</h2>
        {editable && <span className="muted">Click a cell to add or change a class.</span>}
      </div>
      <Async f={slots}>
        {!rows.length && !editable && <Empty>The weekly timetable has not been set up yet.</Empty>}
        {(rows.length > 0 || editable) && (
          <div className="table-wrap">
            <table className="tt-grid">
              <thead><tr><th>Day</th>{periods.map((p) => <th key={p}>P{p}</th>)}</tr></thead>
              <tbody>
                {days.map(([dow, label]) => (
                  <tr key={dow} className={dow === todayDow ? 'tt-today' : ''}>
                    <th>{label}</th>
                    {periods.map((p) => {
                      const cell = at(dow, p);
                      return (
                        <td key={p} className={editable ? 'tt-edit' : ''}
                          onClick={editable ? () => setEditing(cell[0] ? { slot: cell[0] } : { dayOfWeek: dow, periodNo: p }) : undefined}>
                          {cell.map((s) => (
                            <div key={s.id} className="tt-slot">
                              <strong>{s.subjectCode}</strong>
                              <span>{hhmm(s.startTime)}–{hhmm(s.endTime)}</span>
                              <span className="muted">{editable || !s.lecturerName ? '' : s.lecturerName}{!showSection ? '' : ` · ${s.programCode} S${s.semesterNo} ${s.sectionName}`}{s.room ? ` · ${s.room}` : ''}</span>
                            </div>
                          ))}
                          {editable && !cell.length && <span className="muted">+</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
      {editable && (
        <FormModal open={!!editing} title={editing?.slot ? 'Edit class' : 'Add class'} fields={fields} initial={initial}
          submitLabel="Save" onSubmit={save} onClose={() => setEditing(null)}>
          {editing?.slot && <button type="button" className="btn btn-danger btn-sm" onClick={remove}>Remove from timetable</button>}
        </FormModal>
      )}
    </div>
  );
}

// Suggest the times other days use for the same period.
function guessTimes(rows, periodNo) {
  const same = rows.find((s) => s.periodNo === periodNo);
  return same ? { startTime: hhmm(same.startTime), endTime: hhmm(same.endTime) } : {};
}
