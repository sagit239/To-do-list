import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createDevPool, restoreSnapshot, takeSnapshot } from '../../test-support/devSnapshot.js';
import { getPool } from './db.js';
import { TaskLimitError, createTask, listTasks } from './tasksRepo.js';

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

async function fillTasks(count: number) {
  await admin.query(
    `insert into public.tasks (title, position) select 'מילוי ' || i, i - 1 from generate_series(1, $1::int) as i`,
    [count],
  );
}

async function countTasks(): Promise<number> {
  const result = await admin.query<{ count: number }>('select count(*)::int as count from public.tasks');
  return result.rows[0].count;
}

describe('createTask against the Dev database', () => {
  it('creates exactly one open task at position 0 in an empty list, then appends', async () => {
    const first = await createTask({ title: 'ראשונה', description: null, dueDate: '2030-05-01' });
    expect(first).toMatchObject({ title: 'ראשונה', description: null, dueDate: '2030-05-01', completed: false, position: 0 });
    expect(await countTasks()).toBe(1);

    const second = await createTask({ title: null, description: 'שנייה', dueDate: null });
    expect(second).toMatchObject({ title: null, description: 'שנייה', completed: false, position: 1 });
    expect((await listTasks()).map((t) => t.id)).toEqual([first.id, second.id]);
  });

  it('appends after the highest existing position', async () => {
    await admin.query(`insert into public.tasks (title, position) values ('א', 0), ('ב', 5)`);
    const task = await createTask({ title: 'ג', description: null, dueDate: null });
    expect(task.position).toBe(6);
  });

  it('refuses to create when the list already has 1,000 tasks', async () => {
    await fillTasks(1000);
    await expect(createTask({ title: 'עודפת', description: null, dueDate: null })).rejects.toBeInstanceOf(
      TaskLimitError,
    );
    expect(await countTasks()).toBe(1000);
  });

  it('two concurrent creates at 999 tasks: exactly one succeeds', async () => {
    await fillTasks(999);
    const visitorB = createDevPool();
    try {
      const results = await Promise.allSettled([
        createTask({ title: 'מבקר א', description: null, dueDate: null }),
        createTask({ title: 'מבקר ב', description: null, dueDate: null }, visitorB),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(TaskLimitError);
      expect(await countTasks()).toBe(1000);
    } finally {
      await visitorB.end();
    }
  });

  it('concurrent creates get unique, consecutive positions', async () => {
    const visitorB = createDevPool();
    try {
      await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          createTask({ title: `מקבילה ${i}`, description: null, dueDate: null }, i % 2 ? visitorB : getPool()),
        ),
      );
      const positions = (await listTasks()).map((t) => t.position);
      expect(positions).toEqual([0, 1, 2, 3, 4, 5]);
    } finally {
      await visitorB.end();
    }
  });
});
