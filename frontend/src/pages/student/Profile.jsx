import { useState, useEffect } from 'react';
import { get, put } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Async, Badge, PageHeader } from '../../components/ui';
import { errMsg } from '../../utils/helpers';

export default function StudentProfile() {
  const { updateUser } = useAuth();
  const toast = useToast();
  const f = useFetch(() => get('/auth/student-profile'), []);

  const [formData, setFormData] = useState({
    phone: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    guardianName: '',
    guardianPhone: '',
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (f.data) {
      setFormData({
        phone: f.data.phone || '',
        dateOfBirth: f.data.dateOfBirth ? String(f.data.dateOfBirth).slice(0, 10) : '',
        gender: f.data.gender || '',
        address: f.data.address || '',
        guardianName: f.data.guardianName || '',
        guardianPhone: f.data.guardianPhone || '',
      });
    }
  }, [f.data]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleReset = () => {
    if (f.data) {
      setFormData({
        phone: f.data.phone || '',
        dateOfBirth: f.data.dateOfBirth ? String(f.data.dateOfBirth).slice(0, 10) : '',
        gender: f.data.gender || '',
        address: f.data.address || '',
        guardianName: f.data.guardianName || '',
        guardianPhone: f.data.guardianPhone || '',
      });
      toast.info('Form reset to saved details');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        phone: formData.phone.trim() || null,
        dateOfBirth: formData.dateOfBirth || null,
        gender: formData.gender || null,
        address: formData.address.trim() || null,
        guardianName: formData.guardianName.trim() || null,
        guardianPhone: formData.guardianPhone.trim() || null,
      };

      const res = await put('/auth/student-profile', payload);
      toast.success(res.message || 'Profile updated successfully');
      if (formData.phone) {
        updateUser({ phone: formData.phone });
      }
      f.reload();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const student = f.data || {};

  return (
    <>
      <PageHeader
        title="Student Profile"
        subtitle="View your university records and manage your personal & guardian details"
      />

      <Async f={f}>
        {f.data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Section 1: Academic & University Records (Admin Managed / Locked) */}
            <div className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                  borderBottom: '1px solid var(--gray-100, #eee)',
                  paddingBottom: '12px',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🏛️ Academic Information
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        backgroundColor: 'var(--gray-100, #f1f3f5)',
                        color: 'var(--gray-600, #666)',
                        border: '1px solid var(--gray-200, #ddd)',
                      }}
                    >
                      🔒 Read-Only (Admin Managed)
                    </span>
                  </h3>
                  <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                    These records are officially registered by college administration and cannot be edited directly.
                  </p>
                </div>
                <Badge value={student.status || 'active'} />
              </div>

              <div className="form-grid">
                <div className="field half">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={student.fullName || ''}
                    disabled
                    readOnly
                    style={{ backgroundColor: 'var(--gray-50, #f8f9fa)', cursor: 'not-allowed' }}
                  />
                </div>

                <div className="field half">
                  <label>University Seat Number (USN)</label>
                  <input
                    type="text"
                    value={student.usn || ''}
                    disabled
                    readOnly
                    style={{
                      backgroundColor: 'var(--gray-50, #f8f9fa)',
                      cursor: 'not-allowed',
                      fontWeight: 600,
                      letterSpacing: '0.5px',
                    }}
                  />
                </div>

                <div className="field half">
                  <label>Official Email</label>
                  <input
                    type="email"
                    value={student.email || ''}
                    disabled
                    readOnly
                    style={{ backgroundColor: 'var(--gray-50, #f8f9fa)', cursor: 'not-allowed' }}
                  />
                </div>

                <div className="field half">
                  <label>Program</label>
                  <input
                    type="text"
                    value={
                      student.programCode
                        ? `${student.programCode} - ${student.programName || ''}`
                        : '-'
                    }
                    disabled
                    readOnly
                    style={{ backgroundColor: 'var(--gray-50, #f8f9fa)', cursor: 'not-allowed' }}
                  />
                </div>

                <div className="field half">
                  <label>Current Semester & Section</label>
                  <input
                    type="text"
                    value={`Semester ${student.semesterNo || '-'} (Section ${student.sectionName || '-'})`}
                    disabled
                    readOnly
                    style={{ backgroundColor: 'var(--gray-50, #f8f9fa)', cursor: 'not-allowed' }}
                  />
                </div>

                <div className="field half">
                  <label>Specialization</label>
                  <input
                    type="text"
                    value={
                      student.specializationName
                        ? `${student.specializationName} (${student.specializationCode})`
                        : 'General / Core'
                    }
                    disabled
                    readOnly
                    style={{ backgroundColor: 'var(--gray-50, #f8f9fa)', cursor: 'not-allowed' }}
                  />
                </div>

                {student.admissionYear && (
                  <div className="field half">
                    <label>Admission Year</label>
                    <input
                      type="text"
                      value={student.admissionYear || ''}
                      disabled
                      readOnly
                      style={{ backgroundColor: 'var(--gray-50, #f8f9fa)', cursor: 'not-allowed' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Section 2: Personal & Guardian Information (Editable by Student) */}
            <div className="card">
              <div
                style={{
                  marginBottom: '16px',
                  borderBottom: '1px solid var(--gray-100, #eee)',
                  paddingBottom: '12px',
                }}
              >
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ✏️ Personal & Guardian Information
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--green-bg, #e6fffa)',
                      color: 'var(--green-dk, #234e52)',
                      border: '1px solid var(--green-dk, #38b2ac)',
                    }}
                  >
                    Editable by You
                  </span>
                </h3>
                <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                  Keep your contact, residential, and guardian details up to date for campus notifications and emergencies.
                </p>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <div className="field half">
                    <label htmlFor="phone">Personal Phone Number</label>
                    <input
                      id="phone"
                      type="tel"
                      name="phone"
                      placeholder="e.g. 9876543210"
                      value={formData.phone}
                      onChange={handleChange}
                      maxLength={20}
                    />
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      Primary mobile number for SMS/alerts.
                    </span>
                  </div>

                  <div className="field half">
                    <label htmlFor="dateOfBirth">Date of Birth</label>
                    <input
                      id="dateOfBirth"
                      type="date"
                      name="dateOfBirth"
                      value={formData.dateOfBirth}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="field half">
                    <label htmlFor="gender">Gender</label>
                    <select
                      id="gender"
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                    >
                      <option value="">-- Select Gender --</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div className="field half">
                    <label htmlFor="guardianName">Guardian / Parent Name</label>
                    <input
                      id="guardianName"
                      type="text"
                      name="guardianName"
                      placeholder="e.g. Robert Doe"
                      value={formData.guardianName}
                      onChange={handleChange}
                      maxLength={150}
                    />
                  </div>

                  <div className="field half">
                    <label htmlFor="guardianPhone">Guardian / Parent Phone</label>
                    <input
                      id="guardianPhone"
                      type="tel"
                      name="guardianPhone"
                      placeholder="e.g. 9876543211"
                      value={formData.guardianPhone}
                      onChange={handleChange}
                      maxLength={20}
                    />
                    <span className="muted" style={{ fontSize: '0.8rem' }}>
                      Emergency contact number.
                    </span>
                  </div>

                  <div className="field full">
                    <label htmlFor="address">Residential Address</label>
                    <textarea
                      id="address"
                      name="address"
                      rows={3}
                      placeholder="Enter your current residential address..."
                      value={formData.address}
                      onChange={handleChange}
                      maxLength={255}
                    />
                  </div>
                </div>

                <div
                  className="form-actions"
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '10px',
                    marginTop: '20px',
                    borderTop: '1px solid var(--gray-100, #eee)',
                    paddingTop: '16px',
                  }}
                >
                  <button
                    type="button"
                    className="btn"
                    onClick={handleReset}
                    disabled={saving}
                  >
                    Reset
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving Changes...' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Async>
    </>
  );
}
