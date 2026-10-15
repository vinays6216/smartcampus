import { useState } from 'react';
import { del, get, post } from '../api/client';
import useFetch from '../hooks/useFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import FormModal from '../components/FormModal';
import { Async, Badge, Empty, PageHeader } from '../components/ui';
import { fmtDate, fmtTime } from '../utils/format';
import { clean, errMsg, label, sectionLabel } from '../utils/helpers';

const EVENT_TYPES = ['extra_class', 'special_class', 'exam', 'holiday', 'event', 'other'].map((v) => ({ value: v, label: label(v) }));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

export default function CalendarPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isStaff = user.role !== 'student';
  const isAdmin = user.role === 'admin';
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [creating, setCreating] = useState(false);

  const last = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const from = `${cursor.y}-${pad(cursor.m + 1)}-01`;
  const to = `${cursor.y}-${pad(cursor.m + 1)}-${pad(last)}`;
  const f = useFetch(() => get('/calendar', { from, to }), [from, to]);

  const classes = useFetch(() => (isStaff ? get(isAdmin ? '/academic/sections' : '/teaching') : Promise.resolve({ data: [] })), []);
  const sectionOptions = isAdmin
    ? (classes.data || []).map((s) => ({ value: s.id, label: sectionLabel(s) }))
    : [...new Map((classes.data || []).map((t) => [t.sectionId, { value: t.sectionId, label: `${t.programCode} Sem ${t.semesterNo} Sec ${t.sectionName}` }])).values()];

  const events = f.data || [];
  const byDay = (day) => events.filter((e) => e.eventDate === `${from.slice(0, 8)}${pad(day)}`);
  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
  const todayStr = new Date().toLocaleDateString('en-CA');

  const move = (delta) => setCursor(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  const fields = [
    { name: 'title', label: 'Title', required: true },
    { name: 'eventType', label: 'Type', type: 'select', required: true, half: true, default: 'extra_class', options: EVENT_TYPES },
    { name: 'eventDate', label: 'Date', type: 'date', required: true, half: true },
    { name: 'startTime', label: 'Start time', type: 'time', half: true },
    { name: 'endTime', label: 'End time', type: 'time', half: true },
    { name: 'location', label: 'Location', half: true },
    { name: 'sectionId', label: isAdmin ? 'Section (leave empty for whole campus)' : 'Section', type: 'select', options: sectionOptions, required: !isAdmin, half: true },
    { name: 'description', label: 'Details', type: 'textarea' },
  ];

  const create = async (v) => {
    await post('/calendar', clean(v));
    toast.success('Event added');
    setCreating(false);
    f.reload();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    try { await del(`/calendar/${id}`); toast.success('Deleted'); f.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <>
      <PageHeader title="Calendar" subtitle="Extra classes, special classes, exams and holidays">
        {isStaff && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Add event</button>}
      </PageHeader>

      <div className="card">
        <div className="row" style={{ alignItems: 'center', marginBottom: '.8rem' }}>
          <button className="btn btn-sm" onClick={() => move(-1)}>Prev</button>
          <h2 style={{ margin: 0 }}>{new Date(cursor.y, cursor.m, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
          <button className="btn btn-sm" onClick={() => move(1)}>Next</button>
        </div>
        <div className="cal">
          {DAYS.map((d) => <div key={d} className="cal-head">{d}</div>)}
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} className="cal-cell blank" />)}
          {Array.from({ length: last }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${from.slice(0, 8)}${pad(day)}`;
            return (
              <div key={day} className={`cal-cell ${dateStr === todayStr ? 'today' : ''}`}>
                <strong>{day}</strong>
                {byDay(day).map((e) => (
                  <div key={e.id} className={`cal-ev ${e.eventType}`} title={`${e.title} ${fmtTime(e.startTime)}`}>
                    {e.startTime && `${fmtTime(e.startTime)} `}{e.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>Events this month</h2>
        <Async f={f}>
          {!events.length && <Empty>No events this month.</Empty>}
          {events.map((e) => (
            <div key={e.id} className="list-item row">
              <div>
                <strong>{e.title}</strong> <Badge value={e.eventType} tone="blue" />
                <div className="muted">
                  {fmtDate(e.eventDate)}{e.startTime && ` - ${fmtTime(e.startTime)}${e.endTime ? ` to ${fmtTime(e.endTime)}` : ''}`}
                  {e.location && ` - ${e.location}`}{e.sectionName ? ` - Section ${e.sectionName}` : ' - Whole campus'}
                  {e.subjectName && ` - ${e.subjectName}`}
                </div>
                {e.description && <div>{e.description}</div>}
              </div>
              {isStaff && <button className="btn btn-sm btn-danger" onClick={() => remove(e.id)}>Delete</button>}
            </div>
          ))}
        </Async>
      </div>

      <FormModal open={creating} title="Add calendar event" fields={fields} wide submitLabel="Add" onSubmit={create} onClose={() => setCreating(false)} />
    </>
  );
}
