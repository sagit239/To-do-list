// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Task, TaskInput } from '../../shared/types.js';

class TaskLimitError extends Error {}

let listTasksImpl: () => Promise<Task[]> = async () => [];
let listTasksCalls = 0;
let createTaskImpl: (input: TaskInput) => Promise<Task> = async () => created;
let createTaskCalls: TaskInput[] = [];
vi.mock('../_lib/tasksRepo.js', () => ({
  TaskLimitError,
  listTasks: () => {
    listTasksCalls += 1;
    return listTasksImpl();
  },
  createTask: (input: TaskInput) => {
    createTaskCalls.push(input);
    return createTaskImpl(input);
  },
}));

const { default: handler } = await import('./index.js');

function mockResponse() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
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
  };
  return res;
}

async function call(method: string, init: { body?: unknown; headers?: Record<string, string> } = {}) {
  const res = mockResponse();
  const req = { method, headers: init.headers ?? {}, body: init.body } as VercelRequest;
  await handler(req, res as unknown as VercelResponse);
  return res;
}

const JSON_HEADERS = { 'content-type': 'application/json' };
const post = (body: unknown, headers: Record<string, string> = JSON_HEADERS) => call('POST', { body, headers });

const sample: Task[] = [
  { id: 'a', title: 'ראשונה', description: null, dueDate: '2026-11-01', completed: false, position: 0 },
  { id: 'b', title: null, description: 'שנייה', dueDate: null, completed: true, position: 1 },
];

const created: Task = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'חדשה',
  description: null,
  dueDate: null,
  completed: false,
  position: 2,
};

beforeEach(() => {
  listTasksImpl = async () => [];
  listTasksCalls = 0;
  createTaskImpl = async () => created;
  createTaskCalls = [];
});

describe('GET /api/tasks', () => {
  it('returns the tasks in repository order without caching', async () => {
    listTasksImpl = async () => sample;
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(sample);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns [] for an empty list', async () => {
    const res = await call('GET');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('rejects other methods with 405', async () => {
    const res = await call('DELETE');
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('GET, POST');
    expect(listTasksCalls).toBe(0);
    expect(createTaskCalls).toHaveLength(0);
  });

  it('returns 503 without leaking database details', async () => {
    listTasksImpl = async () => {
      throw new Error('password authentication failed for user "app_backend"');
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await call('GET');
    consoleError.mockRestore();
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toMatch(/password|app_backend|postgres/i);
    expect(res.body).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
  });
});

describe('POST /api/tasks', () => {
  it('creates a task and passes only the normalized editable fields', async () => {
    const res = await post({ title: '  חדשה ', description: '', dueDate: null, completed: true, position: 0, id: 'x' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(created);
    expect(createTaskCalls).toEqual([{ title: 'חדשה', description: null, dueDate: null }]);
  });

  it('accepts a JSON string body', async () => {
    const res = await post(JSON.stringify({ title: null, description: 'תיאור', dueDate: null }));
    expect(res.statusCode).toBe(201);
    expect(createTaskCalls).toEqual([{ title: null, description: 'תיאור', dueDate: null }]);
  });

  it('rejects empty input with 422 and the PRD message, without touching the database', async () => {
    const res = await post({ title: '  ', description: '', dueDate: null });
    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({
      error: { code: 'TITLE_OR_DESCRIPTION_REQUIRED', message: 'יש להזין כותרת או תיאור למשימה' },
    });
    expect(createTaskCalls).toHaveLength(0);
  });

  it('reports the failing field for length and date errors', async () => {
    expect((await post({ title: 'א'.repeat(101) })).body).toMatchObject({ error: { field: 'title' } });
    expect((await post({ title: 'x', description: 'ב'.repeat(2001) })).body).toMatchObject({
      error: { field: 'description' },
    });
    const past = await post({ title: 'x', dueDate: '2000-01-01' });
    expect(past.statusCode).toBe(422);
    expect(past.body).toMatchObject({ error: { code: 'DATE_IN_PAST', field: 'dueDate' } });
    expect(createTaskCalls).toHaveLength(0);
  });

  it('returns 409 TASK_LIMIT_REACHED when the list is full', async () => {
    createTaskImpl = async () => {
      throw new TaskLimitError();
    };
    const res = await post({ title: 'x' });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'TASK_LIMIT_REACHED' } });
  });

  it('rejects a non-JSON content type with 415', async () => {
    const res = await post({ title: 'x' }, { 'content-type': 'text/plain' });
    expect(res.statusCode).toBe(415);
    expect(createTaskCalls).toHaveLength(0);
  });

  it('rejects a large body with 413', async () => {
    const declared = await post({ title: 'x' }, { ...JSON_HEADERS, 'content-length': String(17 * 1024) });
    expect(declared.statusCode).toBe(413);
    const actual = await post({ title: 'x', description: 'ב'.repeat(10_000) });
    expect(actual.statusCode).toBe(413);
    expect(createTaskCalls).toHaveLength(0);
  });

  it('rejects malformed JSON or a non-object body with 400', async () => {
    expect((await post('{"title": ')).statusCode).toBe(400);
    expect((await post([1, 2])).statusCode).toBe(400);
    expect((await post(undefined)).statusCode).toBe(400);
    expect(createTaskCalls).toHaveLength(0);
  });

  it('returns 503 on a database failure', async () => {
    createTaskImpl = async () => {
      throw Object.assign(new Error('connection terminated'), { code: 'ECONNRESET' });
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post({ title: 'x' });
    consoleError.mockRestore();
    expect(res.statusCode).toBe(503);
  });
});
