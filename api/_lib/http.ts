import type { VercelResponse } from '@vercel/node';
import type { ApiError } from '../../shared/types.js';

export function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

export function sendError(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  field?: string,
): void {
  const body: ApiError = { error: field ? { code, message, field } : { code, message } };
  sendJson(res, status, body);
}

export function methodNotAllowed(res: VercelResponse, allowed: string[]): void {
  res.setHeader('Allow', allowed.join(', '));
  sendError(res, 405, 'METHOD_NOT_ALLOWED', 'הפעולה אינה נתמכת בכתובת זו.');
}

/** Logs only the error type, never task content or connection details. */
export function sendServerError(res: VercelResponse, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  console.error('Database request failed', code ?? (err instanceof Error ? err.name : 'unknown'));
  sendError(res, 503, 'SERVICE_UNAVAILABLE', 'השירות אינו זמין כרגע. נסו שוב בעוד רגע.');
}
