import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, patch } from '../api/client';
import useFetch from '../hooks/useFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Async, Empty, PageHeader } from '../components/ui';
import { fmtDateTime } from '../utils/format';
import { errMsg } from '../utils/helpers';

export default function Notifications() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const limit = 20;
  const f = useFetch(() => get('/notifications', { page, limit, unread: unreadOnly ? 'true' : undefined }), [page, unreadOnly]);

  // where a notification leads, based on its entityType (set by the backend)
  const target = (n) => {
    const staff = user.role !== 'student';
    switch (n.entityType) {
      case 'assignment': return staff ? `/manage-assignments` : `/assignments${n.entityId ? `/${n.entityId}` : ''}`;
      case 'attendance_issue': return staff ? '/attendance-issues' : '/attendance';
      case 'announcement': return '/announcements';
      case 'calendar_event': return '/calendar';
      case 'timetable': return '/timetable';
      case 'material': return '/materials';
      default: return null;
    }
  };

  const open = async (n) => {
    try {
      if (!n.isRead) await patch(`/notifications/${n.id}/read`);
    } catch (e) { toast.error(errMsg(e)); }
    const to = target(n);
    if (to) navigate(to); else f.reload();
  };

  const readAll = async () => {
    try { await patch('/notifications/read-all'); f.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <>
      <PageHeader title="Notifications">
        <label className="check"><input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} /> Unread only</label>
        <button className="btn" onClick={readAll}>Mark all as read</button>
      </PageHeader>
      <div className="card">
        <Async f={f}>
          {!f.data?.length && <Empty>No notifications.</Empty>}
          {f.data?.map((n) => (
            <div key={n.id} className={`list-item ${n.isRead ? '' : 'unread'}`} style={{ cursor: 'pointer' }} onClick={() => open(n)}>
              <div className="row"><strong>{n.title}</strong><span className="muted">{fmtDateTime(n.createdAt)}</span></div>
              {n.message && <div className="muted">{n.message}</div>}
            </div>
          ))}
          {/* the notifications endpoint returns no total, so paging is Prev / Next */}
          <div className="pagination">
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span>Page {page}</span>
            <button className="btn btn-sm" disabled={(f.data?.length || 0) < limit} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </Async>
      </div>
    </>
  );
}
