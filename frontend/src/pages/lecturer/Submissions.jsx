import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, patch } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import FileButton from '../../components/FileButton';
import { Async, Badge, Empty, PageHeader, StatCard } from '../../components/ui';
import { fmtDateTime } from '../../utils/format';
import { clean } from '../../utils/helpers';

export default function Submissions() {
  const { id } = useParams();
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [grading, setGrading] = useState(null);

  const info = useFetch(() => get(`/assignments/manage/${id}`), [id]);
  const f = useFetch(() => get(`/assignments/manage/${id}/submissions`, filter ? { status: filter } : undefined), [id, filter]);
  const summary = f.body?.summary;
  const a = info.data;

  const grade = async (v) => {
    await patch(`/assignments/manage/submissions/${grading.id}/grade`, clean({ marks: v.marks, feedback: v.feedback }));
    toast.success('Marks saved');
    setGrading(null);
    f.reload();
  };

  return (
    <>
      <Link to="/manage-assignments">&larr; Back to assignments</Link>
      <PageHeader title={a ? a.title : 'Submissions'} subtitle={a ? `Deadline ${fmtDateTime(a.deadline)}${a.maxMarks != null ? ` - max marks ${a.maxMarks}` : ''}` : ''} />

      {summary && (
        <div className="grid">
          <StatCard label="Students" value={summary.total} />
          <StatCard label="Submitted" value={summary.submitted} tone="green" />
          <StatCard label="Not submitted" value={summary.notSubmitted} tone="red" />
        </div>
      )}

      <div className="tabs">
        {[['', 'All'], ['submitted', 'Submitted'], ['not_submitted', 'Not submitted']].map(([v, text]) => (
          <button key={v || 'all'} className={`tab ${filter === v ? 'active' : ''}`} onClick={() => setFilter(v)}>{text}</button>
        ))}
      </div>

      <div className="card">
        <Async f={f}>
          {!f.data?.length && <Empty>No students.</Empty>}
          {!!f.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>USN</th><th>Name</th><th>Status</th><th>How</th><th>Submitted at</th><th>Marks</th><th /></tr></thead>
                <tbody>
                  {f.data.map((s) => (
                    <tr key={s.id}>
                      <td>{s.usn}</td><td>{s.fullName}</td>
                      <td><Badge value={s.status} />{!!s.isLate && <> <Badge value="late" /></>}</td>
                      <td>
                        {s.submissionMode === 'manual' && 'In person'}
                        {s.submissionUrl && <a href={s.submissionUrl} target="_blank" rel="noreferrer">Open link</a>}
                        {s.files?.map((x) => <div key={x.fileId}><FileButton fileId={x.fileId} name={x.originalName} extension="pdf" /></div>)}
                      </td>
                      <td>{s.submittedAt ? fmtDateTime(s.submittedAt) : '-'}</td>
                      <td>{s.marks ?? '-'}{s.feedback && <div className="muted">{s.feedback}</div>}</td>
                      <td>{s.status === 'submitted' && <button className="btn btn-sm btn-primary" onClick={() => setGrading(s)}>{s.marks != null ? 'Re-grade' : 'Grade'}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>

      <FormModal
        open={!!grading}
        title={grading ? `Grade ${grading.fullName}` : ''}
        initial={grading ? { marks: grading.marks ?? '', feedback: grading.feedback || '' } : {}}
        onClose={() => setGrading(null)}
        onSubmit={grade}
        fields={[
          { name: 'marks', label: a?.maxMarks != null ? `Marks (out of ${a.maxMarks})` : 'Marks', type: 'number', required: true, min: 0, max: a?.maxMarks ?? undefined, step: '0.5' },
          { name: 'feedback', label: 'Feedback (optional)', type: 'textarea' },
        ]}
      />
    </>
  );
}
