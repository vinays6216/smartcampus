import { get } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { Async, Empty, PageHeader, PercentBar } from '../../components/ui';
import { fmtDate } from '../../utils/format';

// Student: published internal marks per subject.
export default function MyMarks() {
  const f = useFetch(() => get('/marks/mine'), []);
  return (
    <>
      <PageHeader title="My Marks" subtitle="Internal marks your lecturers have published" />
      <Async f={f}>
        {!f.data?.length && <div className="card"><Empty>No marks have been published yet.</Empty></div>}
        {f.data?.map((s) => (
          <div className="card" key={s.teachingAssignmentId}>
            <div className="row" style={{ marginBottom: '.6rem' }}>
              <h2 style={{ margin: 0 }}>{s.subjectCode} · {s.subjectName}</h2>
              <span><strong>{s.total}</strong> / {s.maxTotal} {s.percentage !== null && <span className="muted">({s.percentage}%)</span>}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Assessment</th><th>Held on</th><th>Marks</th><th>Class average</th><th>Remarks</th></tr></thead>
                <tbody>
                  {s.assessments.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.title}</strong> <span className="muted">{a.kind}</span></td>
                      <td>{a.heldOn ? fmtDate(a.heldOn) : '-'}</td>
                      <td>{a.isAbsent ? <span className="text-red">Absent</span> : a.marks === null ? <span className="muted">not entered</span> : <><strong>{a.marks}</strong> / {a.maxMarks}</>}</td>
                      <td>{a.classAverage ?? '-'}</td>
                      <td>{a.remarks || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {s.percentage !== null && <div style={{ marginTop: '.6rem' }}><PercentBar value={s.percentage} min={40} /></div>}
          </div>
        ))}
      </Async>
    </>
  );
}
