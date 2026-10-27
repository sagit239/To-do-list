// Task input rules shared by the browser and the server (ADR-5, ADR-6). Must stay free of secrets and DB access.
import type { TaskInput } from './types.js';

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 2000;
export const TASK_LIMIT = 1000;
export const PRODUCT_TIME_ZONE = 'Asia/Jerusalem';

export const MESSAGES = {
  titleOrDescription: 'יש להזין כותרת או תיאור למשימה',
  titleTooLong: `הכותרת ארוכה מדי (עד ${TITLE_MAX} תווים)`,
  descriptionTooLong: 'התיאור ארוך מדי (עד 2,000 תווים)',
  invalidText: 'ערך הטקסט אינו תקין',
  invalidDate: 'תאריך היעד אינו תקין',
  pastDate: 'תאריך היעד לא יכול להיות בעבר',
} as const;

export type TaskField = 'title' | 'description' | 'dueDate' | 'form';

export interface FieldError {
  field: TaskField;
  code: string;
  message: string;
}

export type ValidationResult = { ok: true; value: TaskInput } | { ok: false; errors: FieldError[] };

/** Length in characters (code points), matching PostgreSQL varchar, not UTF-16 units. */
export function charLength(value: string): number {
  return [...value].length;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Today's date on this device, as YYYY-MM-DD (never via toISOString, which is UTC). */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Today's date in the product time zone, as YYYY-MM-DD. Used by the server. */
export function todayInZone(timeZone: string = PRODUCT_TIME_ZONE, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** A real calendar date in YYYY-MM-DD form. */
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Trims strings and turns empty ones into null; `undefined` marks a non-text value. */
function normalizeText(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export interface ValidateOptions {
  /** YYYY-MM-DD. The device date in the browser, the product time zone date on the server. */
  today: string;
  /** When editing: the saved due date. The "not in the past" rule applies only if the date changed. */
  storedDueDate?: string | null;
}

export function validateTaskInput(
  input: { title?: unknown; description?: unknown; dueDate?: unknown },
  { today, storedDueDate }: ValidateOptions,
): ValidationResult {
  const errors: FieldError[] = [];

  const title = normalizeText(input.title);
  const description = normalizeText(input.description);
  if (title === undefined) errors.push({ field: 'title', code: 'INVALID_TEXT', message: MESSAGES.invalidText });
  if (description === undefined) {
    errors.push({ field: 'description', code: 'INVALID_TEXT', message: MESSAGES.invalidText });
  }

  if (title === null && description === null) {
    errors.push({ field: 'form', code: 'TITLE_OR_DESCRIPTION_REQUIRED', message: MESSAGES.titleOrDescription });
  }
  if (typeof title === 'string' && charLength(title) > TITLE_MAX) {
    errors.push({ field: 'title', code: 'TITLE_TOO_LONG', message: MESSAGES.titleTooLong });
  }
  if (typeof description === 'string' && charLength(description) > DESCRIPTION_MAX) {
    errors.push({ field: 'description', code: 'DESCRIPTION_TOO_LONG', message: MESSAGES.descriptionTooLong });
  }

  let dueDate: string | null = null;
  if (input.dueDate !== null && input.dueDate !== undefined && input.dueDate !== '') {
    if (typeof input.dueDate !== 'string' || !isValidDateString(input.dueDate)) {
      errors.push({ field: 'dueDate', code: 'INVALID_DATE', message: MESSAGES.invalidDate });
    } else {
      dueDate = input.dueDate;
      const unchanged = storedDueDate !== undefined && dueDate === storedDueDate;
      if (!unchanged && dueDate < today) {
        errors.push({ field: 'dueDate', code: 'DATE_IN_PAST', message: MESSAGES.pastDate });
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { title: title ?? null, description: description ?? null, dueDate } };
}
