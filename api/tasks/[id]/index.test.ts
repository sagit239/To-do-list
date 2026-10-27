// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Task } from '../../../shared/types.js';
import type { FieldError } from '../../../shared/validation.js';

class TaskNotFoundError extends Error {}

type UpdateResult = { ok: true; task: Task } | { ok: false; errors: FieldError[] };

let updateImpl: () => Promise<UpdateResult> = async () => ({ ok: true, task: updated });
let updateCalls: { id: string; input: unknown; today: string }[] = [];
let deleteImpl: () => Promise<void> = async () => {};
let deleteCalls: string[] = [];
vi.mock('../../_lib/tasksRepo.js', () => ({
  TaskNotFoundError,
  updateTaskDetails: (id: string, input: unknown, today: string) => {
    updateCalls.push({ id, input, today });
    return updateImpl();
  },
  deleteTask: (id: string) => {
    deleteCalls.push(id);
    return deleteImpl();
  },
}));

const { default: handler } = await import('./index.js');

const ID = '00000000-0000-4000-8000-000000000001';

const updated: Task = {
  id: ID,
  title: 'עודכנה',
  description: null,
  dueDate: '2030-01-01',
  completed: true,
  position: 4,
};

function mockResponse() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    ended: false,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    end() {
      res.ended = true;
      return res;
    },
  };
  return res;
}

async function call(
  method: string,
  init: { id?: unknown; body?: unknown; headers?: Record<string, string> } = {},
) {
  const res = mockResponse();
  const req = {
    method,
    query: { id: 'id' in init ? init.id : ID },
    headers: init.headers ?? {},
    body: init.body,
  } as unknown as VercelRequest;
  await handler(req, res as unknown as VercelResponse);
  return res;
}

const JSON_HEADERS = { 'content-type': 'application/json' };
const patch = (body: unknown, headers: Record<string, string> = JSON_HEADERS) => call('PATCH', { body, headers });
const validBody = { title: 'עודכנה', description: null, dueDate: '2030-01-01' };

beforeEach(() => {
  updateImpl = async () => ({ ok: true, task: updated });
  updateCalls = [];
  deleteImpl = async () => {};
  deleteCalls = [];
});

describe('/api/tasks/:id', () => {
  it('rejects other methods with 405', async () => {
    for (const method of ['GET', 'POST', 'PUT']) {
      const res = await call(method);
      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe('PATCH, DELETE');
    }
    expect(updateCalls).toHaveLength(0);
    expect(deleteCalls).toHaveLength(0);
  });

  it('rejects an id that is not a UUID with 400, before touching the database', async () => {
    for (const id of ['abc', '1', undefined, ['a', 'b'], `${ID}x`]) {
      expect((await call('PATCH', { id, body: validBody, headers: JSON_HEADERS })).statusCode).toBe(400);
      expect((await call('DELETE', { id })).statusCode).toBe(400);
    }
    expect(updateCalls).toHaveLength(0);
    expect(deleteCalls).toHaveLength(0);
  });
});

describe('PATCH /api/tasks/:id', () => {
  it('updates and returns the task, passing only the three detail fields', async () => {
    const res = await patch({ ...validBody, completed: false, position: 0, id: 'other' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(updated);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe(ID);
    expect(updateCalls[0].input).toEqual(validBody);
    expect(updateCalls[0].today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('requires title, description and dueDate in the body (null allowed)', async () => {
    for (const body of [{ title: 'x', description: null }, { title: 'x', dueDate: null }, { description: 'x', dueDate: null }]) {
      const res = await patch(body);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'MISSING_FIELDS' } });
    }
    expect(updateCalls).toHaveLength(0);
    expect((await patch({ title: null, description: 'x', dueDate: null })).statusCode).toBe(200);
  });

  it('returns 422 with the failing field from the shared validation', async () => {
    updateImpl = async () => ({
      ok: false,
      errors: [{ field: 'dueDate', code: 'DATE_IN_PAST', message: 'תאריך היעד לא יכול להיות בעבר' }],
    });
    const res = await patch({ ...validBody, dueDate: '2000-01-01' });
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      error: { code: 'DATE_IN_PAST', message: 'תאריך היעד לא יכול להיות בעבר', field: 'dueDate' },
    });
  });

  it('returns 422 without a field for the title-or-description rule', async () => {
    updateImpl = async () => ({
      ok: false,
      errors: [{ field: 'form', code: 'TITLE_OR_DESCRIPTION_REQUIRED', message: 'יש להזין כותרת או תיאור למשימה' }],
    });
    const res = await patch({ title: ' ', description: '', dueDate: null });
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      error: { code: 'TITLE_OR_DESCRIPTION_REQUIRED', message: 'יש להזין כותרת או תיאור למשימה' },
    });
  });

  it('returns 404 when the task no longer exists', async () => {
    updateImpl = async () => {
      throw new TaskNotFoundError();
    };
    const res = await patch(validBody);
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'TASK_NOT_FOUND' } });
  });

  it('rejects a non-JSON, malformed or too-large body', async () => {
    expect((await patch(validBody, { 'content-type': 'text/plain' })).statusCode).toBe(415);
    expect((await patch('{"title": ')).statusCode).toBe(400);
    expect((await patch([1])).statusCode).toBe(400);
    expect((await patch({ ...validBody, description: 'ב'.repeat(10_000) })).statusCode).toBe(413);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 503 on a database failure', async () => {
    updateImpl = async () => {
      throw Object.assign(new Error('connection terminated'), { code: 'ECONNRESET' });
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await patch(validBody);
    consoleError.mockRestore();
    expect(res.statusCode).toBe(503);
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('deletes and answers 204 with no body', async () => {
    const res = await call('DELETE');
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
    expect(res.body).toBeUndefined();
    expect(deleteCalls).toEqual([ID]);
  });

  it('returns 404 when the task does not exist (also on a second delete)', async () => {
    deleteImpl = async () => {
      throw new TaskNotFoundError();
    };
    const res = await call('DELETE');
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'TASK_NOT_FOUND' } });
  });

  it('returns 503 on a database failure', async () => {
    deleteImpl = async () => {
      throw new Error('timeout');
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call('DELETE');
    consoleError.mockRestore();
    expect(res.statusCode).toBe(503);
  });
});
