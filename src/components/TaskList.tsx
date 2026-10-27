import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent, UniqueIdentifier } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Task } from '../../shared/types';
import { taskLabel } from '../lib/taskLabel';
import { TaskRow } from './TaskRow';

interface TaskListProps {
  tasks: Task[];
  selectedId: string | null;
  pendingStatusIds: ReadonlySet<string>;
  dragDisabled: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function TaskList({
  tasks,
  selectedId,
  pendingStatusIds,
  dragDisabled,
  onSelect,
  onToggle,
  onReorder,
}: TaskListProps) {
  const sensors = useSensors(
    // A small distance lets a tap on the handle do nothing instead of starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (tasks.length === 0) {
    return <p className="panel__message">אין משימות ברשימה</p>;
  }

  const ids = tasks.map((task) => task.id);
  const nameOf = (id: UniqueIdentifier) => {
    const task = tasks.find((t) => t.id === id);
    return task ? `"${taskLabel(task)}"` : 'המשימה';
  };
  const placeOf = (id: UniqueIdentifier | undefined) => ids.indexOf(String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `הרמת את ${nameOf(active.id)}, במקום ${placeOf(active.id)} מתוך ${ids.length}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} מעל מקום ${placeOf(over.id)} מתוך ${ids.length}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `${nameOf(active.id)} הועברה למקום ${placeOf(over.id)} מתוך ${ids.length}.` : 'הגרירה בוטלה.',
    onDragCancel: ({ active }) => `הגרירה בוטלה. ${nameOf(active.id)} חזרה למקומה.`,
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'כדי להזיז משימה, לחצו על רווח או Enter, הזיזו בעזרת החצים למעלה ולמטה, ולחצו שוב על רווח או Enter כדי להניח. Escape מבטל.',
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="task-list">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selected={task.id === selectedId}
              statusPending={pendingStatusIds.has(task.id)}
              dragDisabled={dragDisabled}
              onSelect={() => onSelect(task.id)}
              onToggle={(completed) => onToggle(task.id, completed)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
