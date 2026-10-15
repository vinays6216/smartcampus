import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { Async, Badge, Empty, PageHeader } from '../../components/ui';
import { fmtDateTime, timeLeft } from '../../utils/format';

const FILTERS = ['', 'Pending', 'Due soon', 'Overdue', 'Submitted'];

export default function StudentAssignments() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const f = useFetch(() => get('/assignments/student', status ? { displayStatus: status } : undefined), [status]);
  const alerts = useFetch(() => get('/assignments/student/alerts'), []);
  const urgent = [...(alerts.data?.dueSoon || []), ...(alerts.data?.overdue || [])];

  return (
    <>
      <PageHeader title="My Assignments" subtitle="Assignments posted by your lecturers, with deadlines" />

      {urgent.length > 0 && (
        <div className="alert alert-warn">
          <strong>Attention:</strong> you have {alerts.data.dueSoon.length} assignment(s) due within 24 hours and {alerts.data.overdue.length} overdue.
          {urgent.slice(0, 3).map((a) => (
            <div key={a.assignmentId}>- {a.title} ({a.subjectName}): {timeLeft(a.deadline)}</div>
          ))}
        </div>
      )}

      <div className="tabs">
        {FILTERS.map((s) => (
          <button key={s || 'all'} className={`tab ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>{s || 'All'}</button>
        ))}
      </div>

      <div className="card">
        <Async f={f}>
          {!f.data?.length && <Empty>No assignments here.</Empty>}
          {!!f.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Title</th><th>Subject</th><th>Deadline</th><th>Status</th><th>My submission</th><th>Marks</th></tr></thead>
                <tbody>
                  {f.data.map((a) => (
                    <tr key={a.assignmentId} className="clickable" onClick={() => navigate(`/assignments/${a.assignmentId}`)}>
                      <td><strong>{a.title}</strong></td>
                      <td>{a.subjectName}</td>
                      <td>{fmtDateTime(a.deadline)}{a.submissionStatus === 'not_submitted' && <div className="muted">{timeLeft(a.deadline)}</div>}</td>
                      <td><Badge value={a.displayStatus} /></td>
                      <td>{a.submissionStatus === 'submitted' ? `${a.submissionMode} - ${fmtDateTime(a.submittedAt)}` : <Badge value="not_submitted" />}</td>
                      <td>{a.marks ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </>
  );
}
