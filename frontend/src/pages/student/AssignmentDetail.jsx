import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { get, post } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FileButton from '../../components/FileButton';
import { Async, Badge, PageHeader } from '../../components/ui';
import { fmtDateTime, fmtSize, timeLeft } from '../../utils/format';
import { errMsg } from '../../utils/helpers';

export default function AssignmentDetail() {
  const { id } = useParams();
  const toast = useToast();
  const f = useFetch(() => get(`/assignments/student/${id}`), [id]);
  const [url, setUrl] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const a = f.data;

  // runs one action, then reloads the assignment
  const run = async (fn, okMessage) => {
    setBusy(true);
    try { await fn(); toast.success(okMessage); setUrl(''); setFile(null); f.reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const base = `/assignments/student/${id}`;
  const submitManual = () => run(() => post(`${base}/submit-manual`), 'Marked as submitted');
  const submitUrl = (e) => { e.preventDefault(); run(() => post(`${base}/submit-url`, { url }), 'Link submitted'); };
  const submitFile = (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('file', file);
    run(() => api.post(`${base}/submit-file`, fd), 'PDF submitted');
  };
  const unsubmit = () => run(() => post(`${base}/unsubmit`), 'Marked as not submitted');

  const graded = a && a.marks !== null && a.marks !== undefined;
  const canChange = a && a.assignmentStatus === 'published' && !graded && (!a.pastDue || a.allowLate);
  const submitted = a?.submissionStatus === 'submitted';

  return (
    <>
      <Link to="/assignments">&larr; Back to assignments</Link>
      <Async f={f}>
        {a && (
          <>
            <PageHeader title={a.title} subtitle={`${a.subjectCode} - ${a.subjectName} | ${a.lecturerName}`}>
              <Badge value={submitted ? 'Submitted' : a.pastDue ? 'Overdue' : 'Pending'} />
            </PageHeader>

            <div className="card">
              <div className="row">
                <div><strong>Deadline:</strong> {fmtDateTime(a.deadline)}</div>
                <div className={!submitted && a.pastDue ? 'text-red' : 'muted'}>{timeLeft(a.deadline)}</div>
                {a.maxMarks != null && <div><strong>Max marks:</strong> {a.maxMarks}</div>}
              </div>
              {a.description && <p style={{ whiteSpace: 'pre-wrap' }}>{a.description}</p>}
              {a.attachments?.length > 0 && (
                <>
                  <h2>Attachments</h2>
                  {a.attachments.map((x) => (
                    <div key={x.fileId} className="list-item row">
                      <span>{x.originalName} <span className="muted">({fmtSize(x.sizeBytes)})</span></span>
                      <FileButton fileId={x.fileId} name={x.originalName} extension={x.extension} />
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="card">
              <h2>My submission</h2>
              {submitted ? (
                <>
                  <div className="alert alert-info">
                    Submitted <strong>{a.submissionMode}</strong> on {fmtDateTime(a.submittedAt)} {a.isLate ? <Badge value="late" /> : null}
                  </div>
                  {a.submissionUrl && <p>Link: <a href={a.submissionUrl} target="_blank" rel="noreferrer">{a.submissionUrl}</a></p>}
                  {a.myFiles?.map((x) => (
                    <div key={x.fileId} className="list-item row"><span>{x.originalName}</span><FileButton fileId={x.fileId} name={x.originalName} extension="pdf" /></div>
                  ))}
                  {graded && <div className="alert alert-info"><strong>Marks: {a.marks}</strong>{a.feedback && ` - ${a.feedback}`}</div>}
                  {canChange && !a.pastDue && <button className="btn" disabled={busy} onClick={unsubmit}>Mark as not submitted</button>}
                </>
              ) : (
                <div className="alert alert-warn">Not submitted yet.</div>
              )}

              {!graded && a.assignmentStatus !== 'published' && <div className="alert alert-error">This assignment is closed.</div>}
              {!graded && a.assignmentStatus === 'published' && a.pastDue && !a.allowLate && (
                <div className="alert alert-error">The deadline has passed and late submissions are not allowed.</div>
              )}

              {canChange && (
                <div className="grid-2" style={{ marginTop: '1rem' }}>
                  {!!a.allowManual && (
                    <div className="card">
                      <h3>Submitted in person</h3>
                      <p className="muted">Press this after you have handed the assignment to your lecturer.</p>
                      <button className="btn btn-success" disabled={busy} onClick={submitManual}>I have submitted manually</button>
                    </div>
                  )}
                  {!!a.allowOnline && (
                    <>
                      <form className="card" onSubmit={submitUrl}>
                        <h3>Submit a link</h3>
                        <p className="muted">GitHub, Google Drive, etc.</p>
                        <div className="field"><input type="text" required placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} /></div>
                        <button className="btn btn-primary" style={{ marginTop: '.6rem' }} disabled={busy}>Submit link</button>
                      </form>
                      <form className="card" onSubmit={submitFile}>
                        <h3>Upload PDF</h3>
                        <p className="muted">PDF only, max 15 MB.</p>
                        <div className="field"><input type="file" accept=".pdf" required onChange={(e) => setFile(e.target.files[0])} /></div>
                        <button className="btn btn-primary" style={{ marginTop: '.6rem' }} disabled={busy || !file}>Upload PDF</button>
                      </form>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </Async>
    </>
  );
}
