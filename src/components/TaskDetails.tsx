import type { Task } from '../../shared/types';

interface TaskDetailsProps {
  task: Task | null;
}

/** Read-only in Milestone 1; editing, saving and deleting arrive in Milestone 3. */
export function TaskDetails({ task }: TaskDetailsProps) {
  if (!task) {
    return <p className="panel__message panel__message--center">בחר משימה מהרשימה כדי לצפות בפרטיה</p>;
  }

  return (
    <div className="task-details">
      <div className="field">
        <label className="field__label" htmlFor="details-title">
          כותרת
        </label>
        <input id="details-title" className="field__input" type="text" value={task.title ?? ''} readOnly />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="details-description">
          תיאור
        </label>
        <textarea
          id="details-description"
          className="field__input field__input--multiline"
          value={task.description ?? ''}
          rows={5}
          readOnly
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="details-due-date">
          תאריך יעד
        </label>
        <input
          id="details-due-date"
          className="field__input field__input--date"
          type="date"
          value={task.dueDate ?? ''}
          readOnly
        />
      </div>
    </div>
  );
}
