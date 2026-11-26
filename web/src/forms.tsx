// Small schema-driven form used for create/edit dialogs across modules.

import { useState, type ReactNode } from 'react';
import { ApiError } from './api';
import { Modal } from './ui';

export type FieldType =
  | 'text' | 'email' | 'password' | 'number' | 'money' | 'date' | 'datetime'
  | 'textarea' | 'select' | 'checkbox';

export type Field = {
  name: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  span?: 1 | 2 | 3;
  placeholder?: string;
  hint?: string;
  step?: string;
};

export type Values = Record<string, any>;

export function FormModal({
  title, fields, initial = {}, submitLabel = 'Save', onSubmit, onClose, wide, footnote, children,
}: {
  title: string;
  fields: Field[];
  initial?: Values;
  submitLabel?: string;
  onSubmit: (values: Values) => Promise<unknown>;
  onClose: () => void;
  wide?: boolean;
  footnote?: string;
  children?: ReactNode;
}) {
  const [values, setValues] = useState<Values>(() => {
    const start: Values = {};
    for (const field of fields) {
      const value = initial[field.name];
      start[field.name] = field.type === 'checkbox' ? Boolean(value) : value ?? '';
    }
    return start;
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (name: string, value: any) => setValues((prev) => ({ ...prev, [name]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fields ?? {});
      } else {
        setError(err instanceof Error ? err.message : 'Could not save.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide={wide}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" form="entity-form" className="btn accent" disabled={busy}>
            {busy ? 'Saving…' : submitLabel}
          </button>
        </>
      )}
    >
      <form id="entity-form" onSubmit={submit}>
        {error ? <div className="flash err">{error}</div> : null}
        <div className={`form-grid ${fields.some((f) => f.span === 2) ? '' : 'one'}`}>
          {fields.map((field) => {
            const id = `f-${field.name}`;
            const span = field.span === 3 ? ' span-3' : field.span === 2 ? ' span-2' : '';
            const common = {
              id,
              name: field.name,
              required: field.required,
              'aria-invalid': Boolean(fieldErrors[field.name]) || undefined,
            };
            return (
              <div className={`field${span}`} key={field.name}>
                {field.type !== 'checkbox' ? (
                  <label className="lbl" htmlFor={id}>
                    {field.label} {field.required ? <span className="req">*</span> : null}
                  </label>
                ) : null}
                {field.type === 'textarea' ? (
                  <textarea
                    {...common}
                    className="input"
                    rows={4}
                    placeholder={field.placeholder}
                    value={values[field.name] ?? ''}
                    onChange={(e) => set(field.name, e.target.value)}
                  />
                ) : field.type === 'select' ? (
                  <select
                    {...common}
                    className="input"
                    value={values[field.name] ?? ''}
                    onChange={(e) => set(field.name, e.target.value)}
                  >
                    <option value="">—</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : field.type === 'checkbox' ? (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={Boolean(values[field.name])}
                      onChange={(e) => set(field.name, e.target.checked)}
                    />
                    {field.label}
                  </label>
                ) : (
                  <input
                    {...common}
                    className="input"
                    type={
                      field.type === 'money' ? 'number'
                        : field.type === 'datetime' ? 'datetime-local'
                          : field.type ?? 'text'
                    }
                    step={field.type === 'money' ? '0.01' : field.step}
                    placeholder={field.placeholder}
                    value={values[field.name] ?? ''}
                    onChange={(e) => set(field.name, e.target.value)}
                  />
                )}
                {fieldErrors[field.name] ? <div className="hint" style={{ color: 'var(--danger)' }}>{fieldErrors[field.name]}</div> : null}
                {field.hint ? <div className="hint">{field.hint}</div> : null}
              </div>
            );
          })}
        </div>
        {footnote ? <div className="hint mt-2">{footnote}</div> : null}
        {children}
      </form>
    </Modal>
  );
}
