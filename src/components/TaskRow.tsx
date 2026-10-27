import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../../shared/types';
import { taskLabel } from '../lib/taskLabel';
import { DragHandleIcon } from './icons';

interface TaskRowProps {
  task: Task;
  selected: boolean;
  statusPending: boolean;
  dragDisabled: boolean;
  onSelect: () => void;
  onToggle: (completed: boolean) => void;
}

/** One row: select button, completion checkbox and drag handle are separate controls (ADR-9). */
export function TaskRow({ task, selected, statusPending, dragDisabled, onSelect, onToggle }: TaskRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: dragDisabled });
  const label = taskLabel(task);

  const classes = ['task-row'];
  if (selected) classes.push('task-row--selected');
  if (task.completed) classes.push('task-row--completed');
  if (isDragging) classes.push('task-row--dragging');

  return (
    <li
      ref={setNodeRef}
      className={classes.join(' ')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button type="button" className="task-row__select" aria-pressed={selected} onClick={onSelect}>
        <span className="task-row__text">{label}</span>
        {task.completed && <span className="visually-hidden"> (הושלמה)</span>}
      </button>
      <input
        type="checkbox"
        className="task-row__check"
        checked={task.completed}
        disabled={statusPending}
        aria-label={`סימון המשימה כהושלמה: ${label}`}
        onChange={(event) => onToggle(event.target.checked)}
      />
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="task-row__handle"
        {...attributes}
        {...listeners}
        aria-label={`גרירה לשינוי מיקום: ${label}`}
        aria-roledescription="ידית גרירה"
        disabled={dragDisabled}
      >
        <DragHandleIcon />
      </button>
    </li>
  );
}
