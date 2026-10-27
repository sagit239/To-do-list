import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createDevPool, restoreSnapshot, takeSnapshot } from '../../test-support/devSnapshot.js';
import { getPool } from './db.js';
import {
  OrderConflictError,
  TaskLimitError,
  TaskNotFoundError,
  createTask,
  deleteTask,
  listTasks,
  reorderTasks,
  setTaskStatus,
  updateTaskDetails,
} from './tasksRepo.js';

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

const TODAY = '2026-10-27';

async function insertTask(values: { title?: string | null; description?: string | null; dueDate?: string | null; completed?: boolean; position: number }) {
  const result = await admin.query<{ id: string }>(
    `insert into public.tasks (title, description, due_date, completed, position)
     values ($1, $2, $3, $4, $5) returning id`,
    [values.title ?? null, values.description ?? null, values.dueDate ?? null, values.completed ?? false, values.position],
  );
  return result.rows[0].id;
}

async function storedRow(id: string) {
  const result = await admin.query(
    `select title, description, due_date::text as due_date, completed, position from public.tasks where id = $1`,
    [id],
  );
  return result.rows[0];
}

const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

describe('updateTaskDetails against the Dev database', () => {
  it('saves the three fields and never touches status or position', async () => {
    await insertTask({ title: 'ראשונה', position: 0 });
    const id = await insertTask({ title: 'ישנה', description: 'תיאור', dueDate: '2030-01-01', completed: true, position: 1 });

    const result = await updateTaskDetails(id, { title: ' חדשה ', description: '', dueDate: '2031-02-03' }, TODAY);

    expect(result).toEqual({
      ok: true,
      task: { id, title: 'חדשה', description: null, dueDate: '2031-02-03', completed: true, position: 1 },
    });
    expect(await storedRow(id)).toEqual({
      title: 'חדשה', description: null, due_date: '2031-02-03', completed: true, position: 1,
    });
  });

  it('allows saving a task whose stored due date has passed when the date is unchanged', async () => {
    const id = await insertTask({ title: 'באיחור', dueDate: '2020-05-05', position: 0 });
    const result = await updateTaskDetails(id, { title: 'עדיין באיחור', description: null, dueDate: '2020-05-05' }, TODAY);
    expect(result.ok).toBe(true);
    expect(await storedRow(id)).toMatchObject({ title: 'עדיין באיחור', due_date: '2020-05-05' });
  });

  it('rejects changing the due date to another past date, without saving anything', async () => {
    const id = await insertTask({ title: 'באיחור', dueDate: '2020-05-05', position: 0 });
    const result = await updateTaskDetails(id, { title: 'שונה', description: null, dueDate: '2020-05-06' }, TODAY);
    expect(result).toMatchObject({ ok: false, errors: [{ field: 'dueDate', code: 'DATE_IN_PAST' }] });
    expect(await storedRow(id)).toMatchObject({ title: 'באיחור', due_date: '2020-05-05' });
  });

  it('throws TaskNotFoundError for a task that does not exist', async () => {
    await expect(
      updateTaskDetails(MISSING_ID, { title: 'x', description: null, dueDate: null }, TODAY),
    ).rejects.toBeInstanceOf(TaskNotFoundError);
  });

  it('concurrent saves of the same task: the last one wins whole, status and position stay', async () => {
    await insertTask({ title: 'א', position: 0 });
    const id = await insertTask({ title: 'מקור', description: 'מקור', completed: true, position: 1 });
    const visitorB = createDevPool();
    try {
      const a = { title: 'מבקר א', description: 'תיאור א', dueDate: '2031-01-01' };
      const b = { title: 'מבקר ב', description: null, dueDate: null };
      const results = await Promise.all([
        updateTaskDetails(id, a, TODAY),
        updateTaskDetails(id, b, TODAY, visitorB),
      ]);
      expect(results.every((r) => r.ok)).toBe(true);
      const row = await storedRow(id);
      const fromA = { title: a.title, description: a.description, due_date: a.dueDate };
      const fromB = { title: b.title, description: b.description, due_date: b.dueDate };
      const { completed, position, ...details } = row;
      expect([fromA, fromB]).toContainEqual(details);
      expect({ completed, position }).toEqual({ completed: true, position: 1 });
    } finally {
      await visitorB.end();
    }
  });
});

async function positions(): Promise<{ title: string; position: number }[]> {
  const result = await admin.query<{ title: string; position: number }>(
    'select title, position from public.tasks order by position, id',
  );
  return result.rows;
}

describe('deleteTask against the Dev database', () => {
  it('deletes a task from the middle and renumbers positions to 0..N-1', async () => {
    await insertTask({ title: 'א', position: 0 });
    const middle = await insertTask({ title: 'ב', position: 1 });
    await insertTask({ title: 'ג', position: 2 });
    await insertTask({ title: 'ד', position: 7 });

    await deleteTask(middle);

    expect(await positions()).toEqual([
      { title: 'א', position: 0 },
      { title: 'ג', position: 1 },
      { title: 'ד', position: 2 },
    ]);
  });

  it('a second delete of the same task throws TaskNotFoundError and changes nothing', async () => {
    const id = await insertTask({ title: 'א', position: 0 });
    await insertTask({ title: 'ב', position: 1 });
    await deleteTask(id);
    await expect(deleteTask(id)).rejects.toBeInstanceOf(TaskNotFoundError);
    expect(await countTasks()).toBe(1);
  });

  it('concurrent deletes and creates keep positions unique and consecutive', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) ids.push(await insertTask({ title: `ישנה ${i}`, position: i }));
    const visitorB = createDevPool();
    try {
      await Promise.all([
        deleteTask(ids[1]),
        createTask({ title: 'חדשה 1', description: null, dueDate: null }, visitorB),
        deleteTask(ids[4], visitorB),
        createTask({ title: 'חדשה 2', description: null, dueDate: null }),
        deleteTask(ids[0]),
      ]);
      const rows = await positions();
      expect(rows).toHaveLength(5);
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
      expect(rows.map((r) => r.title)).toEqual(expect.arrayContaining(['ישנה 2', 'ישנה 3', 'ישנה 5', 'חדשה 1', 'חדשה 2']));
    } finally {
      await visitorB.end();
    }
  });
});

async function positionsAndIds() {
  const result = await admin.query<{ id: string; position: number }>(
    'select id, position from public.tasks order by position, id',
  );
  return result.rows;
}

async function insertMany(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push(await insertTask({ title: `משימה ${i}`, completed: i % 2 === 1, position: i }));
  return ids;
}

function expectConsecutive(rows: { position: number }[]) {
  expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i));
}

describe('setTaskStatus against the Dev database', () => {
  it('checks and unchecks, without touching position or details', async () => {
    await insertTask({ title: 'ראשונה', position: 0 });
    const id = await insertTask({ title: 'שנייה', description: 'תיאור', dueDate: '2020-01-01', position: 1 });

    expect(await setTaskStatus(id, true)).toMatchObject({ id, completed: true, position: 1, title: 'שנייה' });
    expect(await storedRow(id)).toEqual({
      title: 'שנייה', description: 'תיאור', due_date: '2020-01-01', completed: true, position: 1,
    });
    await setTaskStatus(id, false);
    expect((await storedRow(id)).completed).toBe(false);
    // Explicit value, not a toggle: saving the same value twice keeps it.
    await setTaskStatus(id, false);
    expect((await storedRow(id)).completed).toBe(false);
  });

  it('throws TaskNotFoundError for a missing task', async () => {
    await expect(setTaskStatus(MISSING_ID, true)).rejects.toBeInstanceOf(TaskNotFoundError);
  });
});

describe('reorderTasks against the Dev database', () => {
  it('saves the exact order with consecutive positions, completed tasks included', async () => {
    const [a, b, c, d] = await insertMany(4);
    const tasks = await reorderTasks([d, b, a, c]);
    expect(tasks.map((t) => t.id)).toEqual([d, b, a, c]);
    const rows = await positionsAndIds();
    expect(rows.map((r) => r.id)).toEqual([d, b, a, c]);
    expectConsecutive(rows);
    expect((await storedRow(b)).completed).toBe(true);
  });

  it('normalizes gaps in stored positions', async () => {
    const a = await insertTask({ title: 'א', position: 3 });
    const b = await insertTask({ title: 'ב', position: 9 });
    await reorderTasks([b, a]);
    expect(await positionsAndIds()).toEqual([
      { id: b, position: 0 },
      { id: a, position: 1 },
    ]);
  });

  it('rejects a missing, extra or deleted id with OrderConflictError and changes nothing', async () => {
    const [a, b, c] = await insertMany(3);
    const before = await positionsAndIds();
    for (const ids of [[c, b], [c, b, a, MISSING_ID], [c, b, MISSING_ID], [a, a, b]]) {
      await expect(reorderTasks(ids)).rejects.toBeInstanceOf(OrderConflictError);
    }
    expect(await positionsAndIds()).toEqual(before);
  });

  it('two concurrent reorders: the final order is exactly one of them', async () => {
    const ids = await insertMany(6);
    const orderA = [...ids].reverse();
    const orderB = [ids[2], ids[0], ids[4], ids[1], ids[5], ids[3]];
    const visitorB = createDevPool();
    try {
      for (let round = 0; round < 3; round++) {
        await Promise.all([reorderTasks(orderA), reorderTasks(orderB, visitorB)]);
        const rows = await positionsAndIds();
        expect([orderA, orderB]).toContainEqual(rows.map((r) => r.id));
        expectConsecutive(rows);
      }
    } finally {
      await visitorB.end();
    }
  });

  it('create during a reorder: no lost or duplicated task, consecutive positions', async () => {
    const ids = await insertMany(5);
    const visitorB = createDevPool();
    try {
      const [reorder, created] = await Promise.allSettled([
        reorderTasks([...ids].reverse()),
        createTask({ title: 'חדשה', description: null, dueDate: null }, visitorB),
      ]);
      expect(created.status).toBe('fulfilled');
      if (reorder.status === 'rejected') expect(reorder.reason).toBeInstanceOf(OrderConflictError);
      const rows = await positionsAndIds();
      expect(rows).toHaveLength(6);
      expect(new Set(rows.map((r) => r.id)).size).toBe(6);
      expectConsecutive(rows);
    } finally {
      await visitorB.end();
    }
  });

  it('delete during a reorder: no lost or duplicated task, consecutive positions', async () => {
    const ids = await insertMany(5);
    const visitorB = createDevPool();
    try {
      const [reorder, deleted] = await Promise.allSettled([
        reorderTasks([...ids].reverse()),
        deleteTask(ids[2], visitorB),
      ]);
      expect(deleted.status).toBe('fulfilled');
      if (reorder.status === 'rejected') expect(reorder.reason).toBeInstanceOf(OrderConflictError);
      const rows = await positionsAndIds();
      expect(rows.map((r) => r.id).sort()).toEqual(ids.filter((id) => id !== ids[2]).sort());
      expectConsecutive(rows);
    } finally {
      await visitorB.end();
    }
  });

  it('status and detail saves during a reorder do not overwrite each other', async () => {
    const ids = await insertMany(4);
    const visitorB = createDevPool();
    try {
      await Promise.all([
        reorderTasks([...ids].reverse()),
        setTaskStatus(ids[0], true, visitorB),
        updateTaskDetails(ids[1], { title: 'עודכנה', description: null, dueDate: null }, TODAY, visitorB),
      ]);
      expect((await positionsAndIds()).map((r) => r.id)).toEqual([...ids].reverse());
      expect(await storedRow(ids[0])).toMatchObject({ completed: true, position: 3 });
      expect(await storedRow(ids[1])).toMatchObject({ title: 'עודכנה', completed: true, position: 2 });
    } finally {
      await visitorB.end();
    }
  });
});
