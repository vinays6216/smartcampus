import { useState } from 'react';
import { get, patch } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import FileButton from '../../components/FileButton';
import { Async, Badge, Empty, PageHeader } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../utils/format';
import { clean } from '../../utils/helpers';

// Lecturer: issues of his own classes. Admin: all issues.
export default function AttendanceIssues() {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [action, setAction] = useState(null); // { issue, decision }
  const f = useFetch(() => get('/attendance/issues', status ? { status } : undefined), [status]);

  const resolve = async (v) => {
    await patch(`/attendance/issues/${action.issue.id}/resolve`, clean({ decision: action.decision, remarks: v.remarks }));
    toast.success(action.decision === 'approve' ? 'Approved - student marked present' : 'Issue rejected');
    setAction(null);
    f.reload();
  };

  return (
    <>
      <PageHeader title="Attendance Issues" subtitle="Students who say they were marked absent by mistake" />
      <div className="tabs">
        {['open', 'approved', 'rejected', 'withdrawn', ''].map((s) => (
          <button key={s || 'all'} className={`tab ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>{s || 'All'}</button>
        ))}
      </div>

      <div className="card">
        <Async f={f}>
          {!f.data?.length && <Empty>No issues here.</Empty>}
          {f.data?.map((i) => (
            <div key={i.id} className="list-item">
              <div className="row">
                <div>
                  <strong>{i.studentName}</strong> <span className="muted">({i.usn})</span>
                  <div className="muted">{i.subjectCode} - {i.subjectName} | Section {i.sectionName} | class on {fmtDate(i.sessionDate)} (period {i.periodNo})</div>
                </div>
                <div className="btn-group">
                  <Badge value={i.status} />
                  <FileButton fileId={i.proofFileId} name="proof" extension="pdf" />
                  {i.status === 'open' && (
                    <>
                      <button className="btn btn-sm btn-success" onClick={() => setAction({ issue: i, decision: 'approve' })}>Approve</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setAction({ issue: i, decision: 'reject' })}>Reject</button>
                    </>
                  )}
                </div>
              </div>
              <div>Reason: {i.reason}</div>
              <div className="muted">Raised {fmtDateTime(i.raisedAt)}{i.resolvedAt && ` - resolved ${fmtDateTime(i.resolvedAt)}`}{i.resolutionRemarks && ` - ${i.resolutionRemarks}`}</div>
            </div>
          ))}
        </Async>
      </div>

      <FormModal
        open={!!action}
        title={action?.decision === 'approve' ? 'Approve issue (student becomes present)' : 'Reject issue'}
        submitLabel={action?.decision === 'approve' ? 'Approve' : 'Reject'}
        onClose={() => setAction(null)}
        onSubmit={resolve}
        fields={[{ name: 'remarks', label: 'Remarks (optional)', type: 'textarea' }]}
      />
    </>
  );
}
