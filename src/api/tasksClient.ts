import type { ApiError, Task, TaskInput } from '../../shared/types';

export const NETWORK_ERROR_MESSAGE = 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ורעננו את הדף.';
export const SAVE_NETWORK_ERROR_MESSAGE = 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב.';
const GENERIC_ERROR_MESSAGE = 'לא ניתן לטעון את המשימות. רעננו את הדף כדי לנסות שוב.';
export const SAVE_ERROR_MESSAGE = 'השמירה נכשלה. נסו שוב.';

export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly field?: string;

  constructor(message: string, status: number | null, code: string, field?: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

async function readError(response: Response, fallbackMessage = GENERIC_ERROR_MESSAGE): Promise<ApiRequestError> {
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (body.error?.message) {
      return new ApiRequestError(body.error.message, response.status, body.error.code ?? 'ERROR', body.error.field);
    }
  } catch {
    // Non-JSON error body (e.g. platform error page).
  }
  return new ApiRequestError(fallbackMessage, response.status, 'ERROR');
}

export async function fetchTasks(signal?: AbortSignal): Promise<Task[]> {
  let response: Response;
  try {
    response = await fetch('/api/tasks', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiRequestError(NETWORK_ERROR_MESSAGE, null, 'NETWORK_ERROR');
  }
  if (!response.ok) throw await readError(response);

  const body: unknown = await response.json();
  if (!Array.isArray(body)) {
    throw new ApiRequestError(GENERIC_ERROR_MESSAGE, response.status, 'INVALID_RESPONSE');
  }
  return body as Task[];
}

export const DELETE_ERROR_MESSAGE = 'המחיקה נכשלה. נסו שוב.';

/** Sends a write request; resolves only on a 2xx response. */
async function sendWrite(url: string, method: string, failureMessage: string, body?: unknown): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers:
        body === undefined
          ? { Accept: 'application/json' }
          : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError(SAVE_NETWORK_ERROR_MESSAGE, null, 'NETWORK_ERROR');
  }
  if (!response.ok) throw await readError(response, failureMessage);
  return response;
}

async function readTask(response: Response): Promise<Task> {
  try {
    return (await response.json()) as Task;
  } catch {
    throw new ApiRequestError(SAVE_ERROR_MESSAGE, response.status, 'INVALID_RESPONSE');
  }
}

export async function createTask(input: TaskInput): Promise<Task> {
  return readTask(await sendWrite('/api/tasks', 'POST', SAVE_ERROR_MESSAGE, input));
}

export async function updateTask(id: string, input: TaskInput): Promise<Task> {
  return readTask(await sendWrite(`/api/tasks/${encodeURIComponent(id)}`, 'PATCH', SAVE_ERROR_MESSAGE, input));
}

export async function deleteTask(id: string): Promise<void> {
  await sendWrite(`/api/tasks/${encodeURIComponent(id)}`, 'DELETE', DELETE_ERROR_MESSAGE);
}

export const STATUS_ERROR_MESSAGE = 'שינוי הסטטוס נכשל. נסו שוב.';
export const ORDER_ERROR_MESSAGE = 'שמירת הסדר נכשלה. נסו שוב.';

export async function setTaskStatus(id: string, completed: boolean): Promise<Task> {
  return readTask(
    await sendWrite(`/api/tasks/${encodeURIComponent(id)}/status`, 'PATCH', STATUS_ERROR_MESSAGE, { completed }),
  );
}

export async function saveOrder(orderedIds: string[]): Promise<void> {
  await sendWrite('/api/tasks/order', 'PUT', ORDER_ERROR_MESSAGE, { orderedIds });
}
