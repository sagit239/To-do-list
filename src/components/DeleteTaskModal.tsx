import { useRef, useState } from 'react';
import { ApiRequestError, DELETE_ERROR_MESSAGE, deleteTask } from '../api/tasksClient';
import { Modal } from './Modal';

interface DeleteTaskModalProps {
  taskId: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

/** Asks for confirmation; the task is reported as deleted only after the server succeeds. */
export function DeleteTaskModal({ taskId, onClose, onDeleted }: DeleteTaskModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  function close() {
    if (!deleting) onClose();
  }

  async function confirm() {
    if (deleting) return;
    setError(null);
    setDeleting(true);
    try {
      await deleteTask(taskId);
      onDeleted(taskId);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : DELETE_ERROR_MESSAGE);
      setDeleting(false);
    }
  }

  return (
    <Modal titleId="delete-task-title" onClose={close} initialFocusRef={cancelRef} className="modal--small">
      <h2 id="delete-task-title" className="modal__title">
        מחיקת משימה
      </h2>
      <p className="modal__text">האם אתה בטוח שברצונך למחוק את המשימה הזו?</p>
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
      <div className="modal__actions">
        <button type="button" className="btn btn--danger-solid" onClick={confirm} disabled={deleting}>
          {deleting ? 'מוחק…' : 'אישור'}
        </button>
        <button ref={cancelRef} type="button" className="btn btn--secondary" onClick={close} disabled={deleting}>
          ביטול
        </button>
      </div>
    </Modal>
  );
}
