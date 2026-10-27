import { useEffect, useState } from 'react';
import type { Task } from '../../shared/types';
import { TASK_LIMIT } from '../../shared/validation';
import { ApiRequestError, NETWORK_ERROR_MESSAGE, fetchTasks } from '../api/tasksClient';
import { TaskList } from '../components/TaskList';
import { TaskDetails } from '../components/TaskDetails';
import { CreateTaskModal } from '../components/CreateTaskModal';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tasks: Task[] };

export function HomePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchTasks(controller.signal)
      .then((tasks) => setState({ status: 'ready', tasks }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof ApiRequestError ? err.message : NETWORK_ERROR_MESSAGE;
        setState({ status: 'error', message });
      });
    return () => controller.abort();
  }, []);

  const tasks = state.status === 'ready' ? state.tasks : [];
  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;
  const listFull = tasks.length >= TASK_LIMIT;

  function handleCreated(task: Task) {
    // The server appends new tasks at the end of the list.
    setState((current) =>
      current.status === 'ready' ? { status: 'ready', tasks: [...current.tasks, task] } : current,
    );
    setSelectedId(task.id);
    setCreateOpen(false);
  }

  function handleSaved(saved: Task) {
    // Only the detail fields come from the save; status and position stay as they are here (ADR-9).
    setState((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            tasks: current.tasks.map((task) =>
              task.id === saved.id
                ? { ...task, title: saved.title, description: saved.description, dueDate: saved.dueDate }
                : task,
            ),
          }
        : current,
    );
  }

  function handleDeleted(id: string) {
    // The server renumbers positions to 0..N-1 after a delete; mirror that locally.
    setState((current) =>
      current.status === 'ready'
        ? {
            status: 'ready',
            tasks: current.tasks.filter((task) => task.id !== id).map((task, index) => ({ ...task, position: index })),
          }
        : current,
    );
    setSelectedId(null);
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">המשימות שלי</h1>
        <div className="page-header__actions">
          {listFull && (
            <p id="list-full-notice" className="page-header__notice">
              הרשימה מלאה (1,000 משימות)
            </p>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={state.status !== 'ready' || listFull}
            aria-describedby={listFull ? 'list-full-notice' : undefined}
            onClick={() => setCreateOpen(true)}
          >
            הוסף משימה
          </button>
        </div>
      </div>
      <div className="workspace">
        <section className="panel" aria-labelledby="task-list-title">
          <h2 id="task-list-title" className="panel__title">
            רשימת משימות
          </h2>
          {state.status === 'loading' && (
            <p className="panel__message" role="status">
              טוען משימות…
            </p>
          )}
          {state.status === 'error' && (
            <p className="panel__message panel__message--error" role="alert">
              {state.message}
            </p>
          )}
          {state.status === 'ready' && (
            <TaskList tasks={state.tasks} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </section>
        <section className="panel" aria-labelledby="task-details-title">
          <h2 id="task-details-title" className="panel__title">
            פרטי משימה
          </h2>
          <TaskDetails
            key={selectedTask?.id ?? 'none'}
            task={selectedTask}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        </section>
      </div>
      {isCreateOpen && <CreateTaskModal onClose={() => setCreateOpen(false)} onCreated={handleCreated} />}
    </>
  );
}
