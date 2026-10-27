import type pg from 'pg';
import type { Task, TaskInput } from '../../shared/types.js';
import { TASK_LIMIT } from '../../shared/validation.js';
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
