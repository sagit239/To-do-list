import type pg from 'pg';
import type { Task, TaskInput } from '../../shared/types.js';
import { TASK_LIMIT, validateTaskInput } from '../../shared/validation.js';
import type { FieldError } from '../../shared/validation.js';
import { getPool } from './db.js';

interface TaskRow {
  id: string;
  title: string | null;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  position: number;
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    completed: row.completed,
    position: row.position,
  };
}

export async function listTasks(db: pg.Pool | pg.PoolClient = getPool()): Promise<Task[]> {
  const result = await db.query<TaskRow>(
    `select id, title, description, due_date, completed, position
       from public.tasks
      order by position asc, id asc`,
  );
  return result.rows.map(toTask);
}

/** Shared transaction-level advisory lock for every change to the list structure (ARCHITECTURE 2.6). */
export const LIST_LOCK_KEY = 727001;

export class TaskLimitError extends Error {
  constructor() {
    super('Task limit reached');
    this.name = 'TaskLimitError';
  }
}

/** Appends a task at the end of the list, enforcing TASK_LIMIT under the shared lock. */
export async function createTask(input: TaskInput, pool: pg.Pool = getPool()): Promise<Task> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [LIST_LOCK_KEY]);
    const stats = await client.query<{ count: number; next: number }>(
      `select count(*)::int as count, coalesce(max(position) + 1, 0)::int as next from public.tasks`,
    );
    const { count, next } = stats.rows[0];
    if (count >= TASK_LIMIT) {
      throw new TaskLimitError();
    }
    const inserted = await client.query<TaskRow>(
      `insert into public.tasks (title, description, due_date, position)
       values ($1, $2, $3, $4)
       returning id, title, description, due_date, completed, position`,
      [input.title, input.description, input.dueDate, next],
    );
    await client.query('commit');
    return toTask(inserted.rows[0]);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export class TaskNotFoundError extends Error {
  constructor() {
    super('Task not found');
    this.name = 'TaskNotFoundError';
  }
}

export type UpdateResult = { ok: true; task: Task } | { ok: false; errors: FieldError[] };

/**
 * Updates only title, description and due date (ADR-8). The stored due date is read under a row lock,
 * so the "not in the past unless unchanged" rule compares against the value actually overwritten,
 * and concurrent saves of the same task are applied one after the other (last write wins).
 */
export async function updateTaskDetails(
  id: string,
  rawInput: { title?: unknown; description?: unknown; dueDate?: unknown },
  today: string,
  pool: pg.Pool = getPool(),
): Promise<UpdateResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const stored = await client.query<{ due_date: string | null }>(
      'select due_date from public.tasks where id = $1 for update',
      [id],
    );
    if (stored.rowCount === 0) throw new TaskNotFoundError();

    const result = validateTaskInput(rawInput, { today, storedDueDate: stored.rows[0].due_date });
    if (!result.ok) {
      await client.query('rollback');
      return result;
    }
    const { title, description, dueDate } = result.value;
    const updated = await client.query<TaskRow>(
      `update public.tasks set title = $2, description = $3, due_date = $4
        where id = $1
       returning id, title, description, due_date, completed, position`,
      [id, title, description, dueDate],
    );
    await client.query('commit');
    return { ok: true, task: toTask(updated.rows[0]) };
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Deletes a task and renumbers the remaining positions to 0..N-1, under the shared list lock. */
export async function deleteTask(id: string, pool: pg.Pool = getPool()): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [LIST_LOCK_KEY]);
    const deleted = await client.query('delete from public.tasks where id = $1', [id]);
    if (deleted.rowCount === 0) throw new TaskNotFoundError();
    await client.query(
      `update public.tasks t
          set position = r.new_position
         from (select id, (row_number() over (order by position, id) - 1)::int as new_position
                 from public.tasks) r
        where t.id = r.id and t.position <> r.new_position`,
    );
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
