// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Task } from '../../shared/types.js';

class OrderConflictError extends Error {}

let reorderImpl: () => Promise<Task[]> = async () => reordered;
let reorderCalls: string[][] = [];
vi.mock('../_lib/tasksRepo.js', () => ({
  OrderConflictError,
  reorderTasks: (ids: string[]) => {
    reorderCalls.push(ids);
    return reorderImpl();
  },
}));

const { default: handler } = await import('./order.js');

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const reordered: Task[] = [
  { id: uuid(2), title: 'ב', description: null, dueDate: null, completed: false, position: 0 },
  { id: uuid(1), title: 'א', description: null, dueDate: null, completed: true, position: 1 },
];

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

async function call(
  method: string,
  body?: unknown,
  headers: Record<string, string> = { 'content-type': 'application/json' },
) {
  const res = mockResponse();
  const req = { method, query: {}, headers, body } as unknown as VercelRequest;
  await handler(req, res as unknown as VercelResponse);
  return res;
}

beforeEach(() => {
  reorderImpl = async () => reordered;
  reorderCalls = [];
});

describe('PUT /api/tasks/order', () => {
  it('rejects other methods with 405', async () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const res = await call(method, { orderedIds: [] });
      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe('PUT');
    }
    expect(reorderCalls).toHaveLength(0);
  });

  it('saves the order and returns the reordered list', async () => {
    const res = await call('PUT', { orderedIds: [uuid(2), uuid(1)] });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(reordered);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(reorderCalls).toEqual([[uuid(2), uuid(1)]]);
  });

  it('accepts an empty list (for an empty table)', async () => {
    reorderImpl = async () => [];
    expect((await call('PUT', { orderedIds: [] })).statusCode).toBe(200);
  });

  it('rejects a malformed order with 400', async () => {
    const bad = [
      {},
      { orderedIds: 'x' },
      { orderedIds: [uuid(1), 'abc'] },
      { orderedIds: [uuid(1), 7] },
      { orderedIds: [uuid(1), uuid(1)] },
      { orderedIds: Array.from({ length: 1001 }, (_, i) => uuid(i)) },
    ];
    for (const body of bad) {
      const res = await call('PUT', body);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ error: { code: 'INVALID_ORDER' } });
    }
    expect(reorderCalls).toHaveLength(0);
  });

  it('accepts 1,000 ids (about 39KB) but rejects a body over 64KB', async () => {
    const ids = Array.from({ length: 1000 }, (_, i) => uuid(i));
    expect((await call('PUT', { orderedIds: ids })).statusCode).toBe(200);
    const res = await call('PUT', { orderedIds: ids, padding: 'x'.repeat(70 * 1024) });
    expect(res.statusCode).toBe(413);
  });

  it('rejects a non-JSON body', async () => {
    expect((await call('PUT', 'x', { 'content-type': 'text/plain' })).statusCode).toBe(415);
  });

  it('returns 409 when the task set changed', async () => {
    reorderImpl = async () => {
      throw new OrderConflictError();
    };
    const res = await call('PUT', { orderedIds: [uuid(1)] });
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: { code: 'ORDER_CONFLICT' } });
  });

  it('returns 503 on a database failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    reorderImpl = async () => {
      throw new Error('boom');
    };
    expect((await call('PUT', { orderedIds: [uuid(1)] })).statusCode).toBe(503);
  });
});
