import { describe, expect, it } from 'vitest';
import { taskLabel } from './taskLabel';

describe('taskLabel', () => {
  it('uses the title when present', () => {
    expect(taskLabel({ title: 'לקנות מצרכים', description: 'חלב' })).toBe('לקנות מצרכים');
  });

  it('falls back to the description when there is no title', () => {
    expect(taskLabel({ title: null, description: 'לבדוק ביטוח' })).toBe('לבדוק ביטוח');
  });

  it('treats a whitespace-only title as missing', () => {
    expect(taskLabel({ title: '   ', description: 'תיאור' })).toBe('תיאור');
  });

  it('collapses line breaks in the description into one line', () => {
    expect(taskLabel({ title: null, description: 'שורה ראשונה\nשורה  שנייה' })).toBe(
      'שורה ראשונה שורה שנייה',
    );
  });
});
