import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createDevPool, restoreSnapshot, takeSnapshot } from '../../test-support/devSnapshot.js';
import { getPool } from './db.js';
import { listTasks } from './tasksRepo.js';

let admin: pg.Pool;
let snapshot: Awaited<ReturnType<typeof takeSnapshot>>;

beforeAll(async () => {
  admin = createDevPool();
  snapshot = await takeSnapshot(admin);
});

afterAll(async () => {
  await restoreSnapshot(admin, snapshot);
  await admin.end();
  await getPool().end();
});

beforeEach(async () => {
  await admin.query('delete from public.tasks');
});

describe('listTasks against the Dev database', () => {
  it('returns [] when the table is empty', async () => {
    expect(await listTasks()).toEqual([]);
  });

  it('orders by position, then id, and returns dates as YYYY-MM-DD', async () => {
    await admin.query(
      `insert into public.tasks (id, title, description, due_date, completed, position) values
         ('00000000-0000-4000-8000-000000000003', 'שלישית', null, null, false, 2),
         ('00000000-0000-4000-8000-000000000002', null, 'שנייה', '2026-12-31', true, 1),
         ('00000000-0000-4000-8000-00000000000b', 'אותו מיקום ב', null, null, false, 0),
         ('00000000-0000-4000-8000-00000000000a', 'אותו מיקום א', null, '2026-11-01', false, 0)`,
    );

    const tasks = await listTasks();

    expect(tasks.map((t) => t.id)).toEqual([
      '00000000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-00000000000b',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
    expect(tasks[0]).toEqual({
      id: '00000000-0000-4000-8000-00000000000a',
      title: 'אותו מיקום א',
      description: null,
      dueDate: '2026-11-01',
      completed: false,
      position: 0,
    });
    expect(tasks[2]).toMatchObject({ title: null, description: 'שנייה', dueDate: '2026-12-31', completed: true });
  });

  it('rejects a task with neither title nor description (DB constraint)', async () => {
    await expect(
      admin.query(`insert into public.tasks (title, description, position) values ('   ', null, 0)`),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects a negative position (DB constraint)', async () => {
    await expect(
      admin.query(`insert into public.tasks (title, position) values ('x', -1)`),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
