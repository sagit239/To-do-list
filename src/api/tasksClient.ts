import type { ApiError, Task } from '../../shared/types';

export const NETWORK_ERROR_MESSAGE = 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ורעננו את הדף.';
const GENERIC_ERROR_MESSAGE = 'לא ניתן לטעון את המשימות. רעננו את הדף כדי לנסות שוב.';

export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string;

  constructor(message: string, status: number | null, code: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

async function readError(response: Response): Promise<ApiRequestError> {
  try {
    const body = (await response.json()) as Partial<ApiError>;
    if (body.error?.message) {
      return new ApiRequestError(body.error.message, response.status, body.error.code ?? 'ERROR');
    }
  } catch {
    // Non-JSON error body (e.g. platform error page).
  }
  return new ApiRequestError(GENERIC_ERROR_MESSAGE, response.status, 'ERROR');
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
