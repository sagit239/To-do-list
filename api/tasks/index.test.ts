// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Task } from '../../shared/types.js';

let listTasksImpl: () => Promise<Task[]> = async () => [];
let listTasksCalls = 0;
vi.mock('../_lib/tasksRepo.js', () => ({
  listTasks: () => {
    listTasksCalls += 1;
    return listTasksImpl();
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

async function call(method: string) {
  const res = mockResponse();
  await handler({ method } as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const sample: Task[] = [
  { id: 'a', title: 'ראשונה', description: null, dueDate: '2026-11-01', completed: false, position: 0 },
  { id: 'b', title: null, description: 'שנייה', dueDate: null, completed: true, position: 1 },
];

describe('GET /api/tasks', () => {
  beforeEach(() => {
    listTasksImpl = async () => [];
    listTasksCalls = 0;
  });

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
    expect(res.headers.allow).toBe('GET');
    expect(listTasksCalls).toBe(0);
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
