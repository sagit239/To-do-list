import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { Task } from '../../shared/types';
import { localToday, validateTaskInput } from '../../shared/validation';
import type { TaskField } from '../../shared/validation';
import { ApiRequestError, SAVE_ERROR_MESSAGE, createTask } from '../api/tasksClient';

interface CreateTaskModalProps {
  onClose: () => void;
  onCreated: (task: Task) => void;
}

type Errors = Partial<Record<TaskField, string>>;

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)';

/** Mounted only while open, so every opening starts from the default values. */
export function CreateTaskModal({ onClose, onCreated }: CreateTaskModalProps) {
  const today = localToday();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(today);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    titleRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  function close() {
    if (!saving) onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    // Keep keyboard focus inside the dialog.
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const result = validateTaskInput({ title, description, dueDate }, { today });
    if (!result.ok) {
      const next: Errors = {};
      for (const error of result.errors) next[error.field] ??= error.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const task = await createTask(result.value);
      onCreated(task);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : SAVE_ERROR_MESSAGE;
      const field = err instanceof ApiRequestError ? err.field : undefined;
      const isField = field === 'title' || field === 'description' || field === 'dueDate';
      setErrors(isField ? { [field]: message } : { form: message });
      setSaving(false);
    }
  }

  function fieldProps(field: 'title' | 'description' | 'dueDate') {
    const message = errors[field];
    return {
      'aria-invalid': message ? true : undefined,
      'aria-describedby': message ? `create-${field}-error` : undefined,
    };
  }

  function fieldError(field: 'title' | 'description' | 'dueDate') {
    const message = errors[field];
    if (!message) return null;
    return (
      <p id={`create-${field}-error`} className="field__error">
        {message}
      </p>
    );
  }

  return (
    <div className="modal-overlay">
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        onKeyDown={handleKeyDown}
      >
        <div className="modal__header">
          <h2 id="create-task-title" className="modal__title">
            הוספת משימה
          </h2>
          <button type="button" className="modal__close" aria-label="סגור" onClick={close} disabled={saving}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <form className="modal__form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="create-title">
              כותרת
            </label>
            <input
              ref={titleRef}
              id="create-title"
              className="field__input"
              type="text"
              placeholder="הזן כותרת (לא חובה)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              {...fieldProps('title')}
            />
            {fieldError('title')}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="create-description">
              תיאור
            </label>
            <textarea
              id="create-description"
              className="field__input field__input--multiline"
              placeholder="הזן תיאור (לא חובה)"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              {...fieldProps('description')}
            />
            {fieldError('description')}
          </div>
          <div className="field">
            <label className="field__label" htmlFor="create-due-date">
              תאריך יעד
            </label>
            <input
              id="create-due-date"
              className="field__input field__input--date"
              type="date"
              min={today}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              {...fieldProps('dueDate')}
            />
            {fieldError('dueDate')}
          </div>
          {errors.form && (
            <p className="form-alert" role="alert">
              {errors.form}
            </p>
          )}
          <div className="modal__actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'שומר…' : 'הוסף משימה'}
            </button>
            <button type="button" className="btn btn--secondary" onClick={close} disabled={saving}>
              סגור
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
