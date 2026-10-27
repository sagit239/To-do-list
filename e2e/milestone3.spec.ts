import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type pg from 'pg';
import { createDevPool } from '../test-support/devSnapshot';
import { E2E_TASKS } from './global-setup';

// Each test adds its own tasks with this prefix at the end of the list and removes them afterwards,
// so the seeded tasks used by the Milestone 1–2 tests stay untouched (Dev only, ADR-11).
const PREFIX = 'E2E M3';
const NO_SELECTION = 'בחר משימה מהרשימה כדי לצפות בפרטיה';

let pool: pg.Pool;

test.beforeAll(() => {
  Object.assign(process.env, loadEnv('', process.cwd(), ''));
  pool = createDevPool();
});

test.afterEach(async () => {
  await pool.query(`delete from public.tasks where title like $1 or description like $1`, [`${PREFIX}%`]);
});

test.afterAll(async () => {
  await pool.end();
});

async function addTask(title: string, values: { description?: string | null; dueDate?: string | null } = {}) {
  const result = await pool.query<{ id: string }>(
    `insert into public.tasks (title, description, due_date, position)
     select $1, $2, $3, coalesce(max(position) + 1, 0) from public.tasks
     returning id`,
    [title, values.description ?? null, values.dueDate ?? null],
  );
  return result.rows[0].id;
}

async function stored(id: string) {
  const result = await pool.query(
    `select title, description, due_date::text as due_date, completed, position from public.tasks where id = $1`,
    [id],
  );
  return result.rows[0];
}

async function openTask(page: Page, title: string) {
  await page.goto('/');
  await page.getByRole('button', { name: title, exact: true }).click();
  const details = page.getByRole('region', { name: 'פרטי משימה' });
  await expect(details.getByLabel('כותרת')).toHaveValue(title);
  return details;
}

function serviceUnavailable(method: string) {
  return (route: import('@playwright/test').Route) =>
    route.request().method() === method
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'השירות אינו זמין כרגע.' } }),
        })
      : route.continue();
}

test('editing and saving the details persists in the database and after refresh', async ({ page }, testInfo) => {
  const title = `${PREFIX} עריכה ${testInfo.project.name}`;
  const id = await addTask(title, { description: 'תיאור ישן', dueDate: '2030-01-15' });
  const details = await openTask(page, title);

  const newTitle = `${title} עודכנה`;
  await details.getByLabel('כותרת').fill(newTitle);
  await details.getByLabel('תיאור').fill(`${PREFIX} תיאור חדש`);
  await details.getByLabel('תאריך יעד').fill('2031-06-20');
  const patched = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${id}`) && r.request().method() === 'PATCH');
  await details.getByRole('button', { name: 'שמור שינויים' }).click();
  expect((await patched).status()).toBe(200);
  await expect(details.getByRole('status')).toHaveText('השינויים נשמרו');
  await expect(page.getByRole('listitem').last()).toHaveText(newTitle);

  expect(await stored(id)).toMatchObject({
    title: newTitle,
    description: `${PREFIX} תיאור חדש`,
    due_date: '2031-06-20',
    completed: false,
  });

  await page.reload();
  await page.getByRole('button', { name: newTitle, exact: true }).click();
  await expect(details.getByLabel('תיאור')).toHaveValue(`${PREFIX} תיאור חדש`);
  await expect(details.getByLabel('תאריך יעד')).toHaveValue('2031-06-20');
});

test('a task whose due date has passed can be saved unchanged; a different past date is blocked', async ({ page }) => {
  const title = `${PREFIX} באיחור`;
  const id = await addTask(title, { dueDate: '2020-03-03' });
  const details = await openTask(page, title);
  await expect(details.getByLabel('תאריך יעד')).toHaveValue('2020-03-03');

  await details.getByLabel('תיאור').fill(`${PREFIX} נוסף תיאור`);
  await details.getByRole('button', { name: 'שמור שינויים' }).click();
  await expect(details.getByRole('status')).toHaveText('השינויים נשמרו');
  expect(await stored(id)).toMatchObject({ description: `${PREFIX} נוסף תיאור`, due_date: '2020-03-03' });

  let patches = 0;
  page.on('request', (r) => {
    if (r.method() === 'PATCH') patches += 1;
  });
  await details.getByLabel('תאריך יעד').fill('2020-03-04');
  await details.getByRole('button', { name: 'שמור שינויים' }).click();
  await expect(details.getByText('תאריך היעד לא יכול להיות בעבר')).toBeVisible();
  expect(patches).toBe(0);
  expect((await stored(id)).due_date).toBe('2020-03-03');
});

test('the server also rejects changing to a past date directly', async ({ request }) => {
  const id = await addTask(`${PREFIX} API`, { dueDate: '2020-03-03' });
  const unchanged = await request.patch(`/api/tasks/${id}`, {
    data: { title: `${PREFIX} API`, description: null, dueDate: '2020-03-03' },
  });
  expect(unchanged.status()).toBe(200);
  const changed = await request.patch(`/api/tasks/${id}`, {
    data: { title: `${PREFIX} API`, description: null, dueDate: '2020-03-04' },
  });
  expect(changed.status()).toBe(422);
  expect(await changed.json()).toMatchObject({ error: { code: 'DATE_IN_PAST', field: 'dueDate' } });
});

test('validation errors stay in the form, keep the text and send nothing', async ({ page }) => {
  const title = `${PREFIX} ולידציה`;
  await addTask(title);
  const details = await openTask(page, title);
  let patches = 0;
  page.on('request', (r) => {
    if (r.method() === 'PATCH') patches += 1;
  });
  await details.getByLabel('כותרת').fill('   ');
  await details.getByRole('button', { name: 'שמור שינויים' }).click();
  await expect(details.getByRole('alert')).toHaveText('יש להזין כותרת או תיאור למשימה');
  await expect(details.getByLabel('כותרת')).toHaveValue('   ');

  await details.getByLabel('כותרת').fill('א'.repeat(101));
  await details.getByRole('button', { name: 'שמור שינויים' }).click();
  await expect(details.getByText('הכותרת ארוכה מדי (עד 100 תווים)')).toBeVisible();
  expect(patches).toBe(0);
});

test('unsaved changes are discarded on switching task, leaving to About, and refresh', async ({ page }) => {
  const title = `${PREFIX} טיוטה`;
  await addTask(title, { description: 'מקורי' });
  const details = await openTask(page, title);

  await details.getByLabel('תיאור').fill('שינוי שלא נשמר');
  await page.getByRole('button', { name: E2E_TASKS.first, exact: true }).click();
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(details.getByLabel('תיאור')).toHaveValue('מקורי');

  await details.getByLabel('תיאור').fill('שינוי שלא נשמר');
  await page.getByRole('link', { name: 'אודות' }).click();
  await page.getByRole('link', { name: 'דף הבית' }).click();
  await expect(page.getByText(NO_SELECTION)).toBeVisible();
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(details.getByLabel('תיאור')).toHaveValue('מקורי');

  await details.getByLabel('תיאור').fill('שינוי שלא נשמר');
  await page.reload();
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(details.getByLabel('תיאור')).toHaveValue('מקורי');
});

test('a server error on save keeps the values and retrying succeeds', async ({ page }) => {
  const title = `${PREFIX} כשל שמירה`;
  const id = await addTask(title);
  const details = await openTask(page, title);
  await page.route('**/api/tasks/*', serviceUnavailable('PATCH'));

  await details.getByLabel('תיאור').fill(`${PREFIX} נשמר בטופס`);
  await details.getByRole('button', { name: 'שמור שינויים' }).click();
  await expect(details.getByRole('alert')).toHaveText('השירות אינו זמין כרגע.');
  await expect(details.getByLabel('תיאור')).toHaveValue(`${PREFIX} נשמר בטופס`);
  expect((await stored(id)).description).toBeNull();

  await page.unroute('**/api/tasks/*');
  await details.getByRole('button', { name: 'שמור שינויים' }).click();
  await expect(details.getByRole('status')).toHaveText('השינויים נשמרו');
  expect((await stored(id)).description).toBe(`${PREFIX} נשמר בטופס`);
});

test('saving a task deleted meanwhile by another visitor shows a not-found message', async ({ page, request }) => {
  const title = `${PREFIX} נמחקה בינתיים`;
  const id = await addTask(title);
  const details = await openTask(page, title);
  expect((await request.delete(`/api/tasks/${id}`)).status()).toBe(204);

  await details.getByLabel('תיאור').fill('עריכה');
  await details.getByRole('button', { name: 'שמור שינויים' }).click();
  await expect(details.getByRole('alert')).toContainText('המשימה לא נמצאה');
  await expect(details.getByLabel('תיאור')).toHaveValue('עריכה');
});

test('delete: cancel keeps the task, confirm removes it after the server succeeds', async ({ page }) => {
  const title = `${PREFIX} מחיקה`;
  const id = await addTask(title);
  const details = await openTask(page, title);
  const rows = page.getByRole('listitem');
  await expect(rows).toHaveCount(4);

  await details.getByRole('button', { name: 'מחק משימה' }).click();
  let dialog = page.getByRole('dialog', { name: 'מחיקת משימה' });
  await expect(dialog).toContainText('האם אתה בטוח שברצונך למחוק את המשימה הזו?');
  await dialog.getByRole('button', { name: 'ביטול' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(4);
  expect(await stored(id)).toBeTruthy();

  await details.getByRole('button', { name: 'מחק משימה' }).click();
  dialog = page.getByRole('dialog', { name: 'מחיקת משימה' });
  const deleted = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${id}`) && r.request().method() === 'DELETE');
  await dialog.getByRole('button', { name: 'אישור' }).click();
  expect((await deleted).status()).toBe(204);
  await expect(dialog).toHaveCount(0);
  await expect(rows).toHaveCount(3);
  await expect(page.getByText(NO_SELECTION)).toBeVisible();

  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(3);
  expect(await stored(id)).toBeUndefined();
});

test('a failed delete keeps the task and shows an error', async ({ page }) => {
  const title = `${PREFIX} כשל מחיקה`;
  const id = await addTask(title);
  const details = await openTask(page, title);
  await page.route('**/api/tasks/*', serviceUnavailable('DELETE'));

  await details.getByRole('button', { name: 'מחק משימה' }).click();
  const dialog = page.getByRole('dialog', { name: 'מחיקת משימה' });
  await dialog.getByRole('button', { name: 'אישור' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('השירות אינו זמין כרגע.');
  await dialog.getByRole('button', { name: 'ביטול' }).click();

  await expect(page.getByRole('listitem')).toHaveCount(4);
  await expect(details.getByLabel('כותרת')).toHaveValue(title);
  expect(await stored(id)).toBeTruthy();
});

test('details fields, buttons and the delete dialog fit the viewport', async ({ page }) => {
  const title = `${PREFIX} פריסה`;
  await addTask(title, { description: 'תיאור', dueDate: '2030-01-15' });
  const details = await openTask(page, title);
  const viewport = page.viewportSize()!;
  for (const locator of [
    details.getByLabel('תיאור'),
    details.getByRole('button', { name: 'שמור שינויים' }),
    details.getByRole('button', { name: 'מחק משימה' }),
  ]) {
    const box = (await locator.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  }
  await page.screenshot({ path: `test-results/m3-details-${test.info().project.name}.png`, fullPage: true });

  await details.getByRole('button', { name: 'מחק משימה' }).click();
  const box = (await page.getByRole('dialog', { name: 'מחיקת משימה' }).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({ path: `test-results/m3-delete-${test.info().project.name}.png` });
});
