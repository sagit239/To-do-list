import type { VercelRequest, VercelResponse } from '@vercel/node';
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

export const DEFAULT_BODY_LIMIT = 16 * 1024;

export type BodyResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; code: string; message: string };

/** Accepts only a JSON object body within the size limit. */
export function readJsonBody(req: VercelRequest, maxBytes = DEFAULT_BODY_LIMIT): BodyResult {
  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return { ok: false, status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'יש לשלוח את הבקשה בפורמט JSON.' };
  }
  const tooLarge = { ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'הבקשה גדולה מדי.' } as const;
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return tooLarge;

  let body: unknown;
  try {
    // Vercel parses the body lazily and throws on malformed JSON.
    body = req.body;
  } catch {
    body = undefined;
  }
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = undefined;
    }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, code: 'INVALID_BODY', message: 'הבקשה אינה תקינה.' };
  }
  if (Buffer.byteLength(JSON.stringify(body)) > maxBytes) return tooLarge;
  return { ok: true, body: body as Record<string, unknown> };
}

export function sendNoContent(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(204).end();
}

// PostgreSQL check_violation / string_data_right_truncation: a backstop behind the shared validation.
export const DB_INPUT_ERRORS = new Set(['23514', '22001']);

export function isDbInputError(err: unknown): boolean {
  return DB_INPUT_ERRORS.has((err as { code?: string } | null)?.code ?? '');
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// 1,000 UUIDs take about 39KB of JSON (ADR-9).
export const ORDER_BODY_LIMIT = 64 * 1024;
