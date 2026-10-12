import React, { useEffect, useRef, useState } from 'react';

// In-app replacements for window.prompt / window.confirm / window.alert on
// admin actions that move money or change bookings. Browser dialogs could not
// validate a refund reason, showed raw text, and confirmed on a stray Enter.
//
//   const answers = await askAdmin({ title, details, warning, fields, confirmLabel, tone });
//   if (!answers) return;               // cancelled
//   await tellAdmin('Refund completed.', { tone: 'success' });
//
// <AdminDialogHost /> (mounted once in AdminDashboardContent) renders them one
// at a time, in the order they were asked.

let queue = [];
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener(queue[0] || null);
}

function enqueue(dialog) {
  return new Promise(resolve => {
    queue = [...queue, { ...dialog, id: `${Date.now()}-${Math.random()}`, resolve }];
    emit();
  });
}

function settle(dialog, value) {
  queue = queue.filter(item => item !== dialog);
  dialog.resolve(value);
  emit();
}

// fields: [{ name, label, type: 'text' | 'textarea' | 'number', required,
//            minLength, defaultValue, placeholder, help, validate(value) -> error }]
// Resolves to { [name]: trimmed value } on confirm, or null on cancel.
export function askAdmin({ title, details = [], warning = '', fields = [], confirmLabel = 'Continue', cancelLabel = 'Cancel', tone = 'default' }) {
  return enqueue({ kind: 'ask', title, details: details.filter(Boolean), warning, fields, confirmLabel, cancelLabel, tone });
}

// Resolves once the admin dismisses the message.
export function tellAdmin(message, { title = '', tone = 'info' } = {}) {
  return enqueue({ kind: 'tell', title, message, tone, confirmLabel: 'OK' });
}

export function fieldError(field, rawValue) {
  const value = String(rawValue ?? '').trim();
  if (field.required && !value) return `${field.label} is required.`;
  if (field.minLength && value && value.length < field.minLength) return `${field.label} must be at least ${field.minLength} characters.`;
  if (field.validate) return field.validate(value) || '';
  return '';
}

const TONES = {
  default: { bar: 'bg-brand-blue', button: 'bg-brand-blue hover:bg-blue-800' },
  danger: { bar: 'bg-red-600', button: 'bg-red-600 hover:bg-red-700' },
  success: { bar: 'bg-green-600', button: 'bg-green-600 hover:bg-green-700' },
  info: { bar: 'bg-brand-blue', button: 'bg-brand-blue hover:bg-blue-800' },
  error: { bar: 'bg-red-600', button: 'bg-red-600 hover:bg-red-700' },
};

function DialogBody({ dialog }) {
  const [values, setValues] = useState(() => Object.fromEntries((dialog.fields || []).map(field => [field.name, field.defaultValue ?? ''])));
  const [touched, setTouched] = useState({});
  const firstFieldRef = useRef(null);
  const cancelRef = useRef(null);
  const tone = TONES[dialog.tone] || TONES.default;
  const fields = dialog.fields || [];
  const errors = Object.fromEntries(fields.map(field => [field.name, fieldError(field, values[field.name])]));
  const valid = fields.every(field => !errors[field.name]);
  const titleId = `admin-dialog-title-${dialog.id}`;

  useEffect(() => {
    // Focus the first input, or Cancel - never the confirm button, so a
    // stray Enter cannot approve a money action.
    (firstFieldRef.current || cancelRef.current)?.focus();
  }, []);

  const cancel = () => settle(dialog, dialog.kind === 'ask' ? null : undefined);
  const confirm = () => {
    if (dialog.kind === 'tell') return settle(dialog, undefined);
    setTouched(Object.fromEntries(fields.map(field => [field.name, true])));
    if (!valid) return;
    settle(dialog, Object.fromEntries(fields.map(field => [field.name, String(values[field.name] ?? '').trim()])));
  };

  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onKeyDown={onKeyDown}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className={`h-1.5 ${tone.bar}`} />
        <form
          className="p-5"
          onSubmit={event => {
            // Enter in a field never submits; only the button does.
            event.preventDefault();
          }}
        >
          {dialog.title && <h2 id={titleId} className="text-lg font-bold text-brand-blue">{dialog.title}</h2>}
          {dialog.kind === 'tell' && (
            <p id={dialog.title ? undefined : titleId} className="mt-2 whitespace-pre-line text-sm text-gray-700">{dialog.message}</p>
          )}
          {dialog.details?.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
              {dialog.details.map((line, index) => <li key={index}>{line}</li>)}
            </ul>
          )}
          {dialog.warning && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{dialog.warning}</p>
          )}
          {fields.map((field, index) => {
            const inputId = `admin-dialog-${dialog.id}-${field.name}`;
            const showError = touched[field.name] && errors[field.name];
            const common = {
              id: inputId,
              ref: index === 0 ? firstFieldRef : undefined,
              value: values[field.name],
              placeholder: field.placeholder,
              onChange: event => setValues(prev => ({ ...prev, [field.name]: event.target.value })),
              onBlur: () => setTouched(prev => ({ ...prev, [field.name]: true })),
              'aria-invalid': showError ? 'true' : undefined,
              className: `mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-800 ${showError ? 'border-red-400' : 'border-gray-300'}`,
            };
            return (
              <div key={field.name} className="mt-4">
                <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
                  {field.label}{field.required ? '' : ' (optional)'}
                </label>
                {field.type === 'textarea'
                  ? <textarea rows={3} {...common} />
                  : <input type="text" inputMode={field.type === 'number' ? 'decimal' : undefined} {...common} />}
                {field.help && !showError && <p className="mt-1 text-xs text-gray-500">{field.help}</p>}
                {showError && <p className="mt-1 text-xs text-red-600">{errors[field.name]}</p>}
              </div>
            );
          })}
          <div className="mt-5 flex justify-end gap-2">
            {dialog.kind === 'ask' && (
              <button ref={cancelRef} type="button" onClick={cancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                {dialog.cancelLabel}
              </button>
            )}
            <button
              ref={dialog.kind === 'tell' ? cancelRef : undefined}
              type="button"
              onClick={confirm}
              disabled={dialog.kind === 'ask' && !valid}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${tone.button}`}
            >
              {dialog.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AdminDialogHost() {
  const [current, setCurrent] = useState(() => queue[0] || null);
  useEffect(() => {
    listeners.add(setCurrent);
    return () => listeners.delete(setCurrent);
  }, []);
  if (!current) return null;
  return <DialogBody key={current.id} dialog={current} />;
}

// Test helper: drop anything left queued between tests.
export function resetAdminDialogsForTests() {
  queue = [];
  emit();
}
