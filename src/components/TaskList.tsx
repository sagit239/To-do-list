import type { Task } from '../../shared/types';
import { TaskRow } from './TaskRow';

interface TaskListProps {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TaskList({ tasks, selectedId, onSelect }: TaskListProps) {
  if (tasks.length === 0) {
    return <p className="panel__message">אין משימות ברשימה</p>;
  }
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          selected={task.id === selectedId}
          onSelect={() => onSelect(task.id)}
        />
      ))}
    </ul>
  );
}
