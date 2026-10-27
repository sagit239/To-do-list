import { useEffect, useState } from 'react';
import type { Task } from '../../shared/types';
import { ApiRequestError, NETWORK_ERROR_MESSAGE, fetchTasks } from '../api/tasksClient';
import { TaskList } from '../components/TaskList';
import { TaskDetails } from '../components/TaskDetails';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tasks: Task[] };

export function HomePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">המשימות שלי</h1>
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
          <TaskDetails key={selectedTask?.id ?? 'none'} task={selectedTask} />
        </section>
      </div>
    </>
  );
}
