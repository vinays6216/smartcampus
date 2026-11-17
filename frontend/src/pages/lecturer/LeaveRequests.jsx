import { useState } from 'react';
import { get, patch } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FileButton from '../../components/FileButton';
import FormModal from '../../components/FormModal';
import { Async, Badge, Empty, PageHeader, Tabs } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../utils/format';

const STATUSES = [['open', 'Waiting'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['', 'All']];

// Lecturer (students of their sections) / admin (everyone): decide leave requests.
export default function LeaveRequests() {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const list = useFetch(() => get('/leave', status ? { status } : undefined), [status]);
  const [deciding, setDeciding] = useState(null); // { leave, decision }

  const decide = async (v) => {
    const body = await patch(`/leave/${deciding.leave.id}/decide`, { decision: deciding.decision, ...(v.remarks ? { remarks: v.remarks } : {}) });
    toast.success(body.message || 'Saved');
    setDeciding(null);
    list.reload();
  };

  return (
    <>
      <PageHeader title="Leave Requests" subtitle="Approving a leave turns the student's absent marks on those days into excused (logged in the Corrections Log)." />
      <Tabs items={STATUSES.map(([key, label]) => ({ key, label }))} active={status} onChange={setStatus} />

      <div className="card">
        <Async f={list}>
          {!list.data?.length && <Empty>No leave requests here.</Empty>}
          {!!list.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Student</th><th>Dates</th><th>Type</th><th>Reason</th><th>Status</th><th>Asked</th><th /></tr></thead>
                <tbody>
                  {list.data.map((l) => (
                    <tr key={l.id}>
                      <td><strong>{l.studentName}</strong><div className="muted">{l.usn} · {l.programCode} S{l.semesterNo} {l.sectionName}</div></td>
                      <td>{fmtDate(l.fromDate)}{l.toDate !== l.fromDate && <> – {fmtDate(l.toDate)}</>}<div className="muted">{l.days} day(s)</div></td>
                      <td>{l.leaveType}</td>
                      <td style={{ maxWidth: 280 }}>{l.reason}{l.proofFileId && <div><FileButton fileId={l.proofFileId} name="proof" /></div>}</td>
                      <td>
                        <Badge value={l.status} />
                        {l.decidedByName && <div className="muted">{l.decidedByName}{l.status === 'approved' ? ` · ${l.excusedCount} excused` : ''}</div>}
                      </td>
                      <td>{fmtDateTime(l.createdAt)}</td>
                      <td>
                        {l.status === 'open' && (
                          <div className="btn-group">
                            <button className="btn btn-sm btn-primary" onClick={() => setDeciding({ leave: l, decision: 'approve' })}>Approve</button>
                            <button className="btn btn-sm" onClick={() => setDeciding({ leave: l, decision: 'reject' })}>Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>

      <FormModal open={!!deciding}
        title={deciding ? `${deciding.decision === 'approve' ? 'Approve' : 'Reject'} leave — ${deciding.leave.studentName}` : ''}
        fields={[{ name: 'remarks', label: deciding?.decision === 'reject' ? 'Reason for rejecting (shown to the student)' : 'Remarks (optional)', type: 'textarea', required: deciding?.decision === 'reject' }]}
        submitLabel={deciding?.decision === 'approve' ? 'Approve' : 'Reject'} onSubmit={decide} onClose={() => setDeciding(null)} />
    </>
  );
}
