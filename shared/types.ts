// Shared between the browser and the server. Must stay free of secrets and DB access.

export interface Task {
  id: string;
  title: string | null;
  description: string | null;
  /** YYYY-MM-DD, date only. */
  dueDate: string | null;
  completed: boolean;
  position: number;
}

/** Editable task fields, as sent to POST /api/tasks. */
export interface TaskInput {
  title: string | null;
  description: string | null;
  /** YYYY-MM-DD or null. */
  dueDate: string | null;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    field?: string;
  };
}
