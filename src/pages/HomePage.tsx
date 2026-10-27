import { useEffect, useState } from 'react';
import type { Task } from '../../shared/types';
import { TASK_LIMIT } from '../../shared/validation';
import {
  ApiRequestError,
  NETWORK_ERROR_MESSAGE,
  ORDER_ERROR_MESSAGE,
  STATUS_ERROR_MESSAGE,
  fetchTasks,
  saveOrder,
  setTaskStatus,
} from '../api/tasksClient';
import { TaskList } from '../components/TaskList';
import { TaskDetails } from '../components/TaskDetails';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { CloseIcon, PlusIcon } from '../components/icons';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; tasks: Task[] };

interface ListAlert {
  message: string;
  /** The server rejected the order because the task set changed (409): offer a refresh. */
  conflict: boolean;
}

/** Puts tasks in the given id order with positions 0..N-1; tasks missing from `ids` stay at the end. */
function applyOrder(tasks: Task[], ids: string[]): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ordered = ids.flatMap((id) => byId.get(id) ?? []);
  const rest = tasks.filter((task) => !ids.includes(task.id));
  return [...ordered, ...rest].map((task, index) => ({ ...task, position: index }));
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiRequestError ? err.message : fallback;
}

export function HomePage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [pendingStatusIds, setPendingStatusIds] = useState<ReadonlySet<string>>(new Set());
  const [orderSaving, setOrderSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listAlert, setListAlert] = useState<ListAlert | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchTasks(controller.signal)
      .then((tasks) => setState({ status: 'ready', tasks }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: errorMessage(err, NETWORK_ERROR_MESSAGE) });
      });
    return () => controller.abort();
  }, []);

  const tasks = state.status === 'ready' ? state.tasks : [];
  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;
  const listFull = tasks.length >= TASK_LIMIT;

  function updateTasks(update: (tasks: Task[]) => Task[]) {
    setState((current) => (current.status === 'ready' ? { status: 'ready', tasks: update(current.tasks) } : current));
  }

  function handleCreated(task: Task) {
    // The server appends new tasks at the end of the list.
    updateTasks((list) => [...list, task]);
    setSelectedId(task.id);
    setCreateOpen(false);
  }

  function handleSaved(saved: Task) {
    // Only the detail fields come from the save; status and position stay as they are here (ADR-9).
    updateTasks((list) =>
      list.map((task) =>
        task.id === saved.id
          ? { ...task, title: saved.title, description: saved.description, dueDate: saved.dueDate }
          : task,
      ),
    );
  }

  function handleDeleted(id: string) {
    // The server renumbers positions to 0..N-1 after a delete; mirror that locally.
    updateTasks((list) => list.filter((task) => task.id !== id).map((task, index) => ({ ...task, position: index })));
    setSelectedId(null);
  }

  function setCompleted(id: string, completed: boolean) {
    updateTasks((list) => list.map((task) => (task.id === id ? { ...task, completed } : task)));
  }

  async function handleToggle(id: string, completed: boolean) {
    // Optimistic; on failure only this task's status is rolled back (ADR-9).
    setListAlert(null);
    setCompleted(id, completed);
    setPendingStatusIds((current) => new Set(current).add(id));
    try {
      await setTaskStatus(id, completed);
    } catch (err) {
      setCompleted(id, !completed);
      setListAlert({ message: errorMessage(err, STATUS_ERROR_MESSAGE), conflict: false });
    } finally {
      setPendingStatusIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleReorder(orderedIds: string[]) {
    if (orderSaving) return;
    // Optimistic; on failure only the previous order is restored (ADR-9).
    const previousIds = tasks.map((task) => task.id);
    setListAlert(null);
    updateTasks((list) => applyOrder(list, orderedIds));
    setOrderSaving(true);
    try {
      await saveOrder(orderedIds);
    } catch (err) {
      updateTasks((list) => applyOrder(list, previousIds));
      const conflict = err instanceof ApiRequestError && err.code === 'ORDER_CONFLICT';
      setListAlert({ message: errorMessage(err, ORDER_ERROR_MESSAGE), conflict });
    } finally {
      setOrderSaving(false);
    }
  }

  async function handleRefresh() {
    // Replaces the list in place, so a selected task that still exists keeps its details draft.
    setRefreshing(true);
    try {
      const fresh = await fetchTasks();
      setState({ status: 'ready', tasks: fresh });
      setSelectedId((current) => (fresh.some((task) => task.id === current) ? current : null));
      setListAlert(null);
    } catch (err) {
      setListAlert({ message: errorMessage(err, NETWORK_ERROR_MESSAGE), conflict: true });
    } finally {
      setRefreshing(false);
    }
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
            <PlusIcon />
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
          {listAlert && (
            <div className="list-alert" role="alert">
              <p className="list-alert__message">{listAlert.message}</p>
              <div className="list-alert__actions">
                {listAlert.conflict && (
                  <button type="button" className="btn btn--secondary" disabled={refreshing} onClick={handleRefresh}>
                    {refreshing ? 'מרענן…' : 'רענן את הרשימה'}
                  </button>
                )}
                <button
                  type="button"
                  className="list-alert__close"
                  aria-label="סגירת ההודעה"
                  onClick={() => setListAlert(null)}
                >
                  <CloseIcon size={20} />
                </button>
              </div>
            </div>
          )}
          {state.status === 'ready' && (
            <TaskList
              tasks={state.tasks}
              selectedId={selectedId}
              pendingStatusIds={pendingStatusIds}
              dragDisabled={orderSaving || refreshing}
              onSelect={setSelectedId}
              onToggle={handleToggle}
              onReorder={handleReorder}
            />
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
