import pg from 'pg';

// Saves and restores the Dev `tasks` table around integration/E2E runs (ADR-7). Never point this at Production.

interface StoredTask {
  id: string;
  title: string | null;
  description: string | null;
  due_date: string | null;
  completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export function createDevPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL (Dev project) is required for integration tests');
  }
  return new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 2 });
}

export async function takeSnapshot(pool: pg.Pool): Promise<StoredTask[]> {
  const result = await pool.query<StoredTask>(
    `select id, title, description, due_date::text as due_date, completed, position,
            created_at::text as created_at, updated_at::text as updated_at
       from public.tasks`,
  );
  return result.rows;
}

export async function restoreSnapshot(pool: pg.Pool, rows: StoredTask[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('delete from public.tasks');
    for (const row of rows) {
      await client.query(
        `insert into public.tasks (id, title, description, due_date, completed, position, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.id, row.title, row.description, row.due_date, row.completed, row.position, row.created_at, row.updated_at],
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}
