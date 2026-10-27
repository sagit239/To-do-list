// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Task } from '../../../shared/types.js';

class TaskNotFoundError extends Error {}

let statusImpl: () => Promise<Task> = async () => saved;
let statusCalls: { id: string; completed: boolean }[] = [];
vi.mock('../../_lib/tasksRepo.js', () => ({
  TaskNotFoundError,
  setTaskStatus: (id: string, completed: boolean) => {
    statusCalls.push({ id, completed });
    return statusImpl();
  },
}));

const { default: handler } = await import('./status.js');

const ID = '00000000-0000-4000-8000-000000000001';
const saved: Task = { id: ID, title: 'משימה', description: null, dueDate: null, completed: true, position: 2 };

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

const JSON_HEADERS = { 'content-type': 'application/json' };

async function call(method: string, init: { id?: unknown; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = mockResponse();
  const req = {
    method,
    query: { id: 'id' in init ? init.id : ID },
    headers: init.headers ?? JSON_HEADERS,
    body: init.body,
  } as unknown as VercelRequest;
  await handler(req, res as unknown as VercelResponse);
  return res;
}

beforeEach(() => {
  statusImpl = async () => saved;
  statusCalls = [];
});

describe('PATCH /api/tasks/:id/status', () => {
  it('rejects other methods with 405', async () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const res = await call(method, { body: { completed: true } });
      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe('PATCH');
    }
    expect(statusCalls).toHaveLength(0);
  });

  it('rejects an id that is not a UUID with 400', async () => {
    for (const id of ['abc', undefined, ['a'], `${ID}x`]) {
      expect((await call('PATCH', { id, body: { completed: true } })).statusCode).toBe(400);
    }
    expect(statusCalls).toHaveLength(0);
  });

  it('rejects a body that is not JSON', async () => {
    expect((await call('PATCH', { body: 'x', headers: { 'content-type': 'text/plain' } })).statusCode).toBe(415);
    expect((await call('PATCH', { body: '{bad' })).statusCode).toBe(400);
    expect(statusCalls).toHaveLength(0);
  });

  it('requires an explicit boolean completed value', async () => {
    for (const body of [{}, { completed: 'true' }, { completed: 1 }, { completed: null }]) {
      const res = await call('PATCH', { body });
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'INVALID_STATUS' } });
    }
    expect(statusCalls).toHaveLength(0);
  });

  it('saves true and false and returns the task', async () => {
    for (const completed of [true, false]) {
      const res = await call('PATCH', { body: { completed, title: 'ignored', position: 0 } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(saved);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(statusCalls).toEqual([
      { id: ID, completed: true },
      { id: ID, completed: false },
    ]);
  });

  it('returns 404 for a task that does not exist', async () => {
    statusImpl = async () => {
      throw new TaskNotFoundError();
    };
    const res = await call('PATCH', { body: { completed: true } });
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'TASK_NOT_FOUND' } });
  });

  it('returns 503 on a database failure without leaking details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    statusImpl = async () => {
      throw Object.assign(new Error('connection refused at db.example'), { code: 'ECONNREFUSED' });
    };
    const res = await call('PATCH', { body: { completed: true } });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('db.example');
  });
});
