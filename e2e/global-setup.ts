import { loadEnv } from 'vite';
import { createDevPool, restoreSnapshot, takeSnapshot } from '../test-support/devSnapshot';

export const E2E_TASKS = {
  first: 'E2E משימה ראשונה',
  completed: 'E2E משימה שהושלמה',
  descriptionOnly: 'E2E תיאור בלבד ללא כותרת',
};

/** Snapshots the Dev table, loads known tasks, and restores the snapshot after the run. */
export default async function globalSetup() {
  Object.assign(process.env, loadEnv('', process.cwd(), ''));
  const pool = createDevPool();
  const snapshot = await takeSnapshot(pool);

  await pool.query('delete from public.tasks');
  await pool.query(
    `insert into public.tasks (title, description, due_date, completed, position) values
       ($1, 'תיאור של המשימה הראשונה', '2030-01-15', false, 0),
       ($2, null, null, true, 1),
       (null, $3, null, false, 2)`,
    [E2E_TASKS.first, E2E_TASKS.completed, E2E_TASKS.descriptionOnly],
  );

  return async () => {
    await restoreSnapshot(pool, snapshot);
    await pool.end();
  };
}
