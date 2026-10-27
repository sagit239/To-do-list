// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MESSAGES,
  charLength,
  isValidDateString,
  localToday,
  todayInZone,
  validateTaskInput,
} from './validation';

const today = '2026-10-27';
const validate = (input: Record<string, unknown>) => validateTaskInput(input, { today });

describe('validateTaskInput', () => {
  it('accepts a title only, a description only, or both', () => {
    expect(validate({ title: 'כותרת', description: null, dueDate: null })).toEqual({
      ok: true,
      value: { title: 'כותרת', description: null, dueDate: null },
    });
    expect(validate({ title: '', description: 'תיאור', dueDate: today })).toEqual({
      ok: true,
      value: { title: null, description: 'תיאור', dueDate: today },
    });
    expect(validate({ title: 'א', description: 'ב', dueDate: '2027-01-01' }).ok).toBe(true);
  });

  it('trims text and turns blank values into null', () => {
    expect(validate({ title: '  כותרת  ', description: '   ', dueDate: '' })).toEqual({
      ok: true,
      value: { title: 'כותרת', description: null, dueDate: null },
    });
  });

  it('rejects empty or whitespace-only title and description with the PRD message', () => {
    for (const input of [
      { title: '', description: '' },
      { title: '   ', description: '\n\t ' },
      { title: null, description: null },
      {},
    ]) {
      const result = validate(input);
      expect(result).toEqual({
        ok: false,
        errors: [{ field: 'form', code: 'TITLE_OR_DESCRIPTION_REQUIRED', message: MESSAGES.titleOrDescription }],
      });
    }
  });

  it('enforces 100 / 2000 characters after trimming', () => {
    expect(validate({ title: 'א'.repeat(100) }).ok).toBe(true);
    expect(validate({ title: ` ${'א'.repeat(100)} ` }).ok).toBe(true);
    expect(validate({ title: 'א'.repeat(101) })).toMatchObject({ ok: false, errors: [{ field: 'title' }] });
    expect(validate({ description: 'ב'.repeat(2000) }).ok).toBe(true);
    expect(validate({ description: 'ב'.repeat(2001) })).toMatchObject({
      ok: false,
      errors: [{ field: 'description', code: 'DESCRIPTION_TOO_LONG' }],
    });
  });

  it('counts characters as code points, like PostgreSQL varchar', () => {
    expect(charLength('😀')).toBe(1);
    expect(validate({ title: '😀'.repeat(100) }).ok).toBe(true);
    expect(validate({ title: '😀'.repeat(101) }).ok).toBe(false);
  });

  it('accepts today, a future date or no date; rejects the past', () => {
    expect(validate({ title: 'x', dueDate: today }).ok).toBe(true);
    expect(validate({ title: 'x', dueDate: '2026-10-28' }).ok).toBe(true);
    expect(validate({ title: 'x', dueDate: null }).ok).toBe(true);
    expect(validate({ title: 'x', dueDate: '2026-10-26' })).toEqual({
      ok: false,
      errors: [{ field: 'dueDate', code: 'DATE_IN_PAST', message: MESSAGES.pastDate }],
    });
  });

  it('rejects malformed or impossible dates and non-string values', () => {
    for (const dueDate of ['2026-02-30', '27/10/2026', '2026-10-27T10:00:00Z', 20261027]) {
      expect(validate({ title: 'x', dueDate })).toMatchObject({ ok: false, errors: [{ code: 'INVALID_DATE' }] });
    }
    expect(validate({ title: 42, description: 'x' })).toMatchObject({ ok: false, errors: [{ field: 'title' }] });
  });

  it('skips the past-date rule when the stored date is unchanged (editing)', () => {
    const past = '2026-01-01';
    expect(validateTaskInput({ title: 'x', dueDate: past }, { today, storedDueDate: past }).ok).toBe(true);
    expect(validateTaskInput({ title: 'x', dueDate: '2026-01-02' }, { today, storedDueDate: past }).ok).toBe(false);
  });
});

describe('dates', () => {
  it('isValidDateString checks real calendar dates', () => {
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2027-02-29')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
  });

  it('todayInZone uses the Israel date, not UTC', () => {
    const lateUtc = new Date('2026-10-27T22:30:00Z');
    expect(todayInZone('Asia/Jerusalem', lateUtc)).toBe('2026-10-28');
    expect(todayInZone('UTC', lateUtc)).toBe('2026-10-27');
  });

  it('localToday uses the device calendar date', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localToday(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });
});
