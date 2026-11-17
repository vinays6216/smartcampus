import { useState } from 'react';
import api, { get, patch } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import FileButton from '../../components/FileButton';
import { Async, Badge, Empty, PageHeader } from '../../components/ui';
import { fmtDate, today } from '../../utils/format';
import { errMsg, toFormData } from '../../utils/helpers';

const TYPES = [['medical', 'Medical'], ['personal', 'Personal'], ['event', 'College event / competition'], ['other', 'Other']];

// Student: ask for leave; when approved, absent marks in those days become "excused".
export default function Leave() {
  const toast = useToast();
  const list = useFetch(() => get('/leave/mine'), []);
  const [open, setOpen] = useState(false);

  const fields = [
    { name: 'fromDate', label: 'From', type: 'date', required: true, half: true, default: today() },
    { name: 'toDate', label: 'To', type: 'date', required: true, half: true, default: today() },
    { name: 'leaveType', label: 'Type', type: 'select', required: true, default: 'personal', options: TYPES.map(([value, label]) => ({ value, label })) },
    { name: 'reason', label: 'Reason', type: 'textarea', required: true, placeholder: 'At least 5 characters' },
    { name: 'proof', label: 'Proof (optional: PDF, PNG, JPG — max 5 MB)', type: 'file', accept: '.pdf,.png,.jpg,.jpeg' },
  ];

  const submit = async (v) => {
    await api.post('/leave', toFormData(v));
    toast.success('Leave request sent to your lecturers');
    setOpen(false);
    list.reload();
  };
  const withdraw = async (id) => {
    if (!window.confirm('Withdraw this leave request?')) return;
    try { await patch(`/leave/${id}/withdraw`); toast.success('Withdrawn'); list.reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const typeLabel = (t) => TYPES.find(([k]) => k === t)?.[1] || t;

  return (
    <>
      <PageHeader title="Leave" subtitle="Ask for leave. When it is approved, your absent marks on those days become excused and do not lower your %.">
        <button className="btn btn-primary" onClick={() => setOpen(true)}>+ Request leave</button>
      </PageHeader>

      <div className="card">
        <Async f={list}>
          {!list.data?.length && <Empty>You have not asked for leave yet.</Empty>}
          {!!list.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Dates</th><th>Days</th><th>Type</th><th>Reason</th><th>Status</th><th>Decision</th><th /></tr></thead>
                <tbody>
                  {list.data.map((l) => (
                    <tr key={l.id}>
                      <td>{fmtDate(l.fromDate)}{l.toDate !== l.fromDate && <> – {fmtDate(l.toDate)}</>}</td>
                      <td>{l.days}</td>
                      <td>{typeLabel(l.leaveType)}</td>
                      <td>{l.reason}{l.proofFileId && <div><FileButton fileId={l.proofFileId} name="proof" /></div>}</td>
                      <td><Badge value={l.status} /></td>
                      <td>
                        {l.decidedByName ? <>{l.decidedByName}<div className="muted">{l.remarks || ''}{l.status === 'approved' && l.excusedCount > 0 ? ` ${l.excusedCount} absent mark(s) excused` : ''}</div></> : <span className="muted">Waiting</span>}
                      </td>
                      <td>{l.status === 'open' && <button className="btn btn-sm" onClick={() => withdraw(l.id)}>Withdraw</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>

      <FormModal open={open} title="Request leave" fields={fields} submitLabel="Send request" onSubmit={submit} onClose={() => setOpen(false)} />
    </>
  );
}
