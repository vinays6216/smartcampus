import { useState } from 'react';
import { openFile } from '../api/files';
import { useToast } from '../context/ToastContext';
import { errMsg } from '../utils/helpers';

const PREVIEWABLE = ['pdf', 'png', 'jpg', 'jpeg'];

// View (pdf / images) and Download buttons for one row of the `files` table
export default function FileButton({ fileId, name, extension }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!fileId) return null;

  const act = async (inline) => {
    setBusy(true);
    try { await openFile(fileId, { inline, name }); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  return (
    <span className="btn-group">
      {PREVIEWABLE.includes(String(extension || '').toLowerCase()) && (
        <button className="btn btn-sm" disabled={busy} onClick={() => act(true)}>View</button>
      )}
      <button className="btn btn-sm" disabled={busy} onClick={() => act(false)}>Download</button>
    </span>
  );
}
