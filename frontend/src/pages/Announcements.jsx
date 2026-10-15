import { useState } from 'react';
import { del, get, post } from '../api/client';
import useFetch from '../hooks/useFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import FormModal from '../components/FormModal';
import { Async, Badge, Empty, PageHeader } from '../components/ui';
import { fmtDate, fmtDateTime, fmtTime } from '../utils/format';
import { clean, errMsg, label, sectionLabel } from '../utils/helpers';

const EVENT_TYPES = ['extra_class', 'special_class', 'exam', 'holiday', 'event', 'other'].map((v) => ({ value: v, label: label(v) }));

export default function Announcements() {
  const { user } = useAuth();
  const toast = useToast();
  const isStaff = user.role !== 'student';
  const isAdmin = user.role === 'admin';
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const limit = 15;

  const f = useFetch(() => get('/announcements', { page, limit }), [page]);

  // lecturer: sections he teaches (from /teaching). admin: every section + departments.
  const classes = useFetch(() => (isStaff ? get(isAdmin ? '/academic/sections' : '/teaching') : Promise.resolve({ data: [] })), []);
  const departments = useFetch(() => (isAdmin ? get('/academic/departments') : Promise.resolve({ data: [] })), []);

  const sectionOptions = isAdmin
    ? (classes.data || []).map((s) => ({ value: s.id, label: sectionLabel(s) }))
    : [...new Map((classes.data || []).map((t) => [t.sectionId, { value: t.sectionId, label: `${t.programCode} Sem ${t.semesterNo} Sec ${t.sectionName}` }])).values()];
  const subjectOptions = [...new Map((isAdmin ? [] : classes.data || []).map((t) => [t.subjectId, { value: t.subjectId, label: `${t.subjectCode} - ${t.subjectName}` }])).values()];

  const fields = [
    { name: 'title', label: 'Title', required: true },
    { name: 'body', label: 'Message', type: 'textarea', required: true },
    {
      name: 'audienceType', label: 'Send to', type: 'select', required: true, half: true, default: isAdmin ? 'all' : 'section',
      options: isAdmin
        ? [{ value: 'all', label: 'Everyone' }, { value: 'students', label: 'All students' }, { value: 'lecturers', label: 'All lecturers' },
           { value: 'department', label: 'A department' }, { value: 'section', label: 'A section' }]
        : [{ value: 'section', label: 'A section I teach' }],
    },
    { name: 'priority', label: 'Priority', type: 'select', half: true, default: 'normal',
      options: ['normal', 'important', 'urgent'].map((v) => ({ value: v, label: label(v) })) },
    { name: 'sectionId', label: 'Section', type: 'select', options: sectionOptions, required: true, show: (v) => v.audienceType === 'section' },
    { name: 'departmentId', label: 'Department', type: 'select', required: true, show: (v) => v.audienceType === 'department',
      options: (departments.data || []).map((d) => ({ value: d.id, label: d.name })) },
    { name: 'expiresAt', label: 'Hide after (optional)', type: 'datetime-local' },
    { name: 'addEvent', type: 'checkbox', label: 'Add to calendar', checkLabel: 'Also add this to the calendar (extra class, exam, ...)' },
    { name: 'eventType', label: 'Event type', type: 'select', half: true, default: 'extra_class', options: EVENT_TYPES, show: (v) => v.addEvent },
    { name: 'eventDate', label: 'Date', type: 'date', half: true, required: true, show: (v) => v.addEvent },
    { name: 'startTime', label: 'Start time', type: 'time', half: true, show: (v) => v.addEvent },
    { name: 'endTime', label: 'End time', type: 'time', half: true, show: (v) => v.addEvent },
    { name: 'location', label: 'Location', half: true, show: (v) => v.addEvent },
    { name: 'subjectId', label: 'Subject (optional)', type: 'select', half: true, options: subjectOptions, show: (v) => v.addEvent && !isAdmin },
  ];

  const create = async (v) => {
    const payload = clean({
      title: v.title, body: v.body, audienceType: v.audienceType, priority: v.priority, expiresAt: v.expiresAt,
      sectionId: v.audienceType === 'section' ? v.sectionId : '',
      departmentId: v.audienceType === 'department' ? v.departmentId : '',
    });
    if (v.addEvent) {
      payload.event = clean({
        eventType: v.eventType, eventDate: v.eventDate, startTime: v.startTime, endTime: v.endTime,
        location: v.location, subjectId: v.subjectId,
      });
    }
    await post('/announcements', payload);
    toast.success('Announcement published');
    setCreating(false);
    f.reload();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try { await del(`/announcements/${id}`); toast.success('Deleted'); f.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <>
      <PageHeader title="Announcements" subtitle="Messages from lecturers and the admin office">
        {isStaff && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New announcement</button>}
      </PageHeader>

      <Async f={f}>
        {!f.data?.length && <div className="card"><Empty>No announcements yet.</Empty></div>}
        {f.data?.map((a) => (
          <div key={a.id} className="card">
            <div className="row">
              <div>
                <h2 style={{ marginBottom: '.2rem' }}>{a.title}</h2>
                <span className="muted">{a.authorName} ({a.authorRole}) - {fmtDateTime(a.publishAt)} - for {a.audienceType}</span>
              </div>
              <div className="btn-group">
                <Badge value={a.priority} />
                {!a.isPublished && <Badge value="draft" />}
                {(isAdmin || a.authorUserId === user.id) && <button className="btn btn-sm btn-danger" onClick={() => remove(a.id)}>Delete</button>}
              </div>
            </div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{a.body}</p>
            {a.eventId && (
              <div className="alert alert-info" style={{ marginBottom: 0 }}>
                <strong>{String(a.eventType).replace(/_/g, ' ')}</strong> on {fmtDate(a.eventDate)}
                {a.startTime && ` at ${fmtTime(a.startTime)}${a.endTime ? ` - ${fmtTime(a.endTime)}` : ''}`}
                {a.location && ` - ${a.location}`}
              </div>
            )}
          </div>
        ))}
        <div className="pagination">
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
          <span>Page {page}</span>
          <button className="btn btn-sm" disabled={(f.data?.length || 0) < limit} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </Async>

      <FormModal open={creating} title="New announcement" fields={fields} wide submitLabel="Publish" onSubmit={create} onClose={() => setCreating(false)} />
    </>
  );
}
