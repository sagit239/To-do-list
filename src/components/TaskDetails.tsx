import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Task } from '../../shared/types';
import { localToday, validateTaskInput } from '../../shared/validation';
import type { TaskField } from '../../shared/validation';
import { ApiRequestError, SAVE_ERROR_MESSAGE, updateTask } from '../api/tasksClient';
import { DeleteTaskModal } from './DeleteTaskModal';
import { TrashIcon } from './icons';

interface TaskDetailsProps {
  task: Task | null;
  onSaved: (task: Task) => void;
  onDeleted: (id: string) => void;
}

type Errors = Partial<Record<TaskField, string>>;

interface Draft {
  title: string;
  description: string;
  dueDate: string;
}

function toDraft(task: Task): Draft {
  return { title: task.title ?? '', description: task.description ?? '', dueDate: task.dueDate ?? '' };
}

/**
 * Inline editing of the selected task. The draft lives only in this component's memory:
 * the parent remounts it per task (key), so switching task, leaving the page or refreshing discards it.
 */
export function TaskDetails({ task, onSaved, onDeleted }: TaskDetailsProps) {
  if (!task) {
    return <p className="panel__message panel__message--center">בחר משימה מהרשימה כדי לצפות בפרטיה</p>;
  }
  return <TaskEditor task={task} onSaved={onSaved} onDeleted={onDeleted} />;
}

function TaskEditor({ task, onSaved, onDeleted }: TaskDetailsProps & { task: Task }) {
  // Initialized once, so later status/position updates of the same task keep the draft (FR-05).
  const [draft, setDraft] = useState<Draft>(() => toDraft(task));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const today = localToday();

  function change(field: keyof Draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaved(false);
    const result = validateTaskInput(draft, { today, storedDueDate: task.dueDate });
    if (!result.ok) {
      const next: Errors = {};
      for (const error of result.errors) next[error.field] ??= error.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const updated = await updateTask(task.id, result.value);
      setDraft(toDraft(updated));
      setSaved(true);
      onSaved(updated);
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : SAVE_ERROR_MESSAGE;
      const field = err instanceof ApiRequestError ? err.field : undefined;
      const isField = field === 'title' || field === 'description' || field === 'dueDate';
      setErrors(isField ? { [field]: message } : { form: message });
    } finally {
      setSaving(false);
    }
  }

  function fieldProps(field: 'title' | 'description' | 'dueDate') {
    const message = errors[field];
    return {
      'aria-invalid': message ? true : undefined,
      'aria-describedby': message ? `details-${field}-error` : undefined,
    };
  }

  function fieldError(field: 'title' | 'description' | 'dueDate') {
    const message = errors[field];
    if (!message) return null;
    return (
      <p id={`details-${field}-error`} className="field__error">
        {message}
      </p>
    );
  }

  // A saved date that has already passed stays valid, so it must not be flagged by the picker.
  const dateMin = draft.dueDate !== '' && draft.dueDate === task.dueDate ? undefined : today;

  return (
    <>
      <form className="task-details" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="details-title">
            כותרת
          </label>
          <input
            id="details-title"
            className="field__input"
            type="text"
            placeholder="הזן כותרת (לא חובה)"
            value={draft.title}
            onChange={(e) => change('title', e.target.value)}
            {...fieldProps('title')}
          />
          {fieldError('title')}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="details-description">
            תיאור
          </label>
          <textarea
            id="details-description"
            className="field__input field__input--multiline"
            placeholder="הזן תיאור (לא חובה)"
            rows={5}
            value={draft.description}
            onChange={(e) => change('description', e.target.value)}
            {...fieldProps('description')}
          />
          {fieldError('description')}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="details-due-date">
            תאריך יעד
          </label>
          <input
            id="details-due-date"
            className="field__input field__input--date"
            type="date"
            min={dateMin}
            value={draft.dueDate}
            onChange={(e) => change('dueDate', e.target.value)}
            {...fieldProps('dueDate')}
          />
          {fieldError('dueDate')}
        </div>
        {errors.form && (
          <p className="form-alert" role="alert">
            {errors.form}
          </p>
        )}
        {saved && (
          <p className="form-success" role="status">
            השינויים נשמרו
          </p>
        )}
        <div className="task-details__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'שומר…' : 'שמור שינויים'}
          </button>
          <button type="button" className="btn btn--danger" onClick={() => setDeleteOpen(true)} disabled={saving}>
            <TrashIcon />
            מחק משימה
          </button>
        </div>
      </form>
      {isDeleteOpen && (
        <DeleteTaskModal taskId={task.id} onClose={() => setDeleteOpen(false)} onDeleted={onDeleted} />
      )}
    </>
  );
}
