import { useEffect, useState } from 'react';
import Modal from './Modal';
import { errMsg } from '../utils/helpers';

// fields: [{ name, label, type, required, options, default, show, multiple, accept, placeholder, min, max, step, half, hint }]
//   type: text | email | password | number | date | time | datetime-local | textarea | select | checkbox | file
//   options: [{ value, label }]  or  (values) => [{ value, label }]
//   show: (values) => boolean   (field is displayed only when true)
// onSubmit(values) may throw; the error message is shown inside the form.
export default function FormModal({ open, title, fields, initial = {}, submitLabel = 'Save', onSubmit, onClose, wide, children }) {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const base = {};
    fields.forEach((f) => {
      base[f.name] = initial[f.name] ?? f.default ?? (f.type === 'checkbox' ? false : '');
    });
    setValues(base);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(values);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const renderInput = (f) => {
    const value = values[f.name] ?? '';
    if (f.type === 'textarea') {
      return <textarea rows={3} value={value} required={f.required} placeholder={f.placeholder} onChange={(e) => set(f.name, e.target.value)} />;
    }
    if (f.type === 'select') {
      const options = typeof f.options === 'function' ? f.options(values) : f.options || [];
      return (
        <select value={value} required={f.required} onChange={(e) => set(f.name, e.target.value)}>
          <option value="">{f.placeholder || 'Select...'}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (f.type === 'checkbox') {
      return (
        <label className="check">
          <input type="checkbox" checked={!!values[f.name]} onChange={(e) => set(f.name, e.target.checked)} /> {f.checkLabel || f.label}
        </label>
      );
    }
    if (f.type === 'file') {
      return (
        <input
          type="file" accept={f.accept} multiple={f.multiple} required={f.required}
          onChange={(e) => set(f.name, f.multiple ? Array.from(e.target.files) : e.target.files[0] || '')}
        />
      );
    }
    return (
      <input
        type={f.type || 'text'} value={value} required={f.required} placeholder={f.placeholder}
        min={f.min} max={f.max} step={f.step} onChange={(e) => set(f.name, e.target.value)}
      />
    );
  };

  return (
    <Modal open={open} title={title} onClose={onClose} wide={wide}>
      <form onSubmit={submit} className="form-grid">
        {fields.filter((f) => !f.show || f.show(values)).map((f) => (
          <div key={f.name} className={`field ${f.half ? 'half' : ''}`}>
            {f.type !== 'checkbox' && <label>{f.label}{f.required && <span className="req"> *</span>}</label>}
            {renderInput(f)}
            {f.hint && <small className="muted">{f.hint}</small>}
          </div>
        ))}
        {children}
        {error && <div className="alert alert-error full">{error}</div>}
        <div className="form-actions full">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Please wait...' : submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}
