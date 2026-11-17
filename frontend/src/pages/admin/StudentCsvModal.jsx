import { useState, useRef } from 'react';
import Modal from '../../components/Modal';
import api from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { errMsg, sectionLabel } from '../../utils/helpers';

export default function StudentCsvModal({ open, onClose, onImportSuccess, programs = [], sections = [] }) {
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [defaultProgramId, setDefaultProgramId] = useState('');
  const [defaultSectionId, setDefaultSectionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const filteredSections = sections.filter(
    (s) => !defaultProgramId || String(s.programId) === String(defaultProgramId)
  );

  const handleProgramChange = (e) => {
    setDefaultProgramId(e.target.value);
    setDefaultSectionId('');
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      if (dropped.name.endsWith('.csv') || dropped.type === 'text/csv') {
        setFile(dropped);
      } else {
        toast.error('Please upload a .csv file');
      }
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/admin/students/csv-template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'students_template.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Failed to download template: ' + errMsg(e));
    }
  };

  const downloadCredentials = () => {
    if (!result?.created?.length) return;
    const headers = ['Full Name', 'USN', 'Email', 'Temporary Password'];
    const lines = result.created.map((c) =>
      `"${(c.fullName || '').replace(/"/g, '""')}","${c.usn}","${c.email}","${c.temporaryPassword}"`
    );
    const csvContent = [headers.join(','), ...lines].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_credentials.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a CSV file');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (defaultProgramId) formData.append('programId', defaultProgramId);
    if (defaultSectionId) formData.append('sectionId', defaultSectionId);

    setLoading(true);
    try {
      const res = await api.post('/admin/students/bulk-csv', formData);
      setResult(res.data.data);
      if (res.data.data.createdCount > 0) {
        toast.success(`Successfully imported ${res.data.data.createdCount} student(s)`);
        onImportSuccess?.();
      } else {
        toast.error('No students could be imported. Please review the errors below.');
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setFile(null);
    setDefaultProgramId('');
    setDefaultSectionId('');
    setResult(null);
    onClose();
  };

  return (
    <Modal open={open} wide title="Add Students via CSV" onClose={resetModal}>
      {!result ? (
        <form onSubmit={handleUpload}>
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--accent-50, #f0f7ff)',
              borderRadius: '8px',
              border: '1px solid var(--accent-100, #cce4ff)',
              marginBottom: '16px',
              fontSize: '0.9rem',
              lineHeight: 1.5,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Bulk Student Import Instructions</strong>
                <p style={{ margin: '4px 0 0 0', color: 'var(--gray-600, #555)' }}>
                  Upload a CSV file with student data. Required columns: <code>Full Name</code>, <code>USN</code>, and <code>Email</code>.
                  Optional: <code>Phone</code>, <code>Program</code>, <code>Section</code>, <code>Admission Year</code>, <code>Date of Birth</code>, <code>Gender</code>, <code>Address</code>, <code>Guardian Name</code>, <code>Guardian Phone</code>.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={downloadTemplate}
                style={{ whiteSpace: 'nowrap', marginLeft: '12px' }}
              >
                📥 Download Template
              </button>
            </div>
          </div>

          <div className="form-grid" style={{ marginBottom: '16px' }}>
            <div className="field half">
              <label>Default Program (Optional)</label>
              <select value={defaultProgramId} onChange={handleProgramChange}>
                <option value="">-- Apply from CSV or select default --</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Used if a row does not specify a Program.
              </span>
            </div>

            <div className="field half">
              <label>Default Section (Optional)</label>
              <select
                value={defaultSectionId}
                onChange={(e) => setDefaultSectionId(e.target.value)}
                disabled={!defaultProgramId}
              >
                <option value="">-- Apply from CSV or select default --</option>
                {filteredSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </select>
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Used if a row does not specify a Section.
              </span>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--gray-300, #ccc)',
              borderRadius: '8px',
              padding: '28px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: file ? 'var(--green-bg, #f0fff4)' : 'var(--gray-50, #fafafa)',
              marginBottom: '20px',
              transition: 'background-color 0.2s, border-color 0.2s',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            {file ? (
              <div>
                <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--green-dk, #22543d)' }}>
                  ✓ {file.name}
                </div>
                <div className="muted" style={{ marginTop: '4px' }}>
                  {(file.size / 1024).toFixed(1)} KB — Click or drag to choose another file
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>📄</div>
                <strong>Click to choose a CSV file</strong> or drag and drop it here
                <div className="muted" style={{ marginTop: '4px', fontSize: '0.85rem' }}>
                  Only .csv files up to 5MB are accepted
                </div>
              </div>
            )}
          </div>

          <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn" onClick={resetModal} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!file || loading}>
              {loading ? 'Importing Students...' : 'Upload & Import'}
            </button>
          </div>
        </form>
      ) : (
        <div>
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '16px',
              backgroundColor: result.createdCount > 0 ? 'var(--green-bg, #e6fffa)' : 'var(--red-bg, #fff5f5)',
              border: `1px solid ${result.createdCount > 0 ? 'var(--green-dk, #38b2ac)' : 'var(--red-dark, #e53e3e)'}`,
            }}
          >
            <h4 style={{ margin: '0 0 6px 0' }}>
              Import Summary: {result.createdCount} created, {result.failedCount} failed
            </h4>
            <div style={{ fontSize: '0.9rem' }}>
              Processed {result.totalRows} student row(s) from the CSV.
            </div>
          </div>

          {result.errors?.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h5 style={{ margin: '0 0 8px 0', color: 'var(--red-dark, #c53030)' }}>
                Rows with Errors ({result.errors.length}):
              </h5>
              <div
                style={{
                  maxHeight: '140px',
                  overflowY: 'auto',
                  border: '1px solid var(--gray-200, #e2e8f0)',
                  borderRadius: '6px',
                  padding: '8px',
                  fontSize: '0.85rem',
                  backgroundColor: '#fff',
                }}
              >
                {result.errors.map((err, i) => (
                  <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--gray-100, #f7fafc)' }}>
                    <strong>Line {err.row}:</strong> {err.usn ? `[USN: ${err.usn}] ` : ''}
                    <span style={{ color: 'var(--red-dark, #c53030)' }}>{err.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.created?.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h5 style={{ margin: 0 }}>
                  Created Students & Generated Passwords ({result.created.length}):
                </h5>
                <button type="button" className="btn btn-sm btn-success" onClick={downloadCredentials}>
                  💾 Download Credentials CSV
                </button>
              </div>

              <div
                className="table-wrap"
                style={{
                  maxHeight: '220px',
                  overflowY: 'auto',
                  border: '1px solid var(--gray-200, #e2e8f0)',
                  borderRadius: '6px',
                }}
              >
                <table>
                  <thead>
                    <tr>
                      <th>USN</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Temporary Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.created.map((c, idx) => (
                      <tr key={idx}>
                        <td><strong>{c.usn}</strong></td>
                        <td>{c.fullName}</td>
                        <td>{c.email}</td>
                        <td>
                          <code>{c.temporaryPassword}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ fontSize: '0.8rem', marginTop: '6px' }}>
                Note: Passwords are shown only once. Be sure to download the credentials CSV to share with students.
              </div>
            </div>
          )}

          <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={resetModal}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
