import type { Task } from '../../shared/types';
import { taskLabel } from '../lib/taskLabel';

interface TaskRowProps {
  task: Task;
  selected: boolean;
  onSelect: () => void;
}

export function TaskRow({ task, selected, onSelect }: TaskRowProps) {
  const classes = ['task-row'];
  if (selected) classes.push('task-row--selected');
  if (task.completed) classes.push('task-row--completed');

  return (
    <li className={classes.join(' ')}>
      <button type="button" className="task-row__select" aria-pressed={selected} onClick={onSelect}>
        {/* Status indicator only; the working checkbox arrives in Milestone 4. */}
        <span className="task-row__check" aria-hidden="true" />
        <span className="task-row__text">{taskLabel(task)}</span>
        {task.completed && <span className="visually-hidden"> (הושלמה)</span>}
      </button>
    </li>
  );
}
