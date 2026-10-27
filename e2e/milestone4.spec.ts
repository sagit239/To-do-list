import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { loadEnv } from 'vite';
import type pg from 'pg';
import { createDevPool } from '../test-support/devSnapshot';
import { dragTo, isMobile } from './drag';

// Each test adds its own tasks with this prefix at the end of the list and removes them afterwards,
// so the seeded tasks used by earlier tests keep their status and relative order (Dev only, ADR-11).
const PREFIX = 'E2E M4';
const NO_SELECTION = 'בחר משימה מהרשימה כדי לצפות בפרטיה';

let pool: pg.Pool;

test.beforeAll(() => {
  Object.assign(process.env, loadEnv('', process.cwd(), ''));
  pool = createDevPool();
});

test.afterEach(async () => {
  await pool.query(`delete from public.tasks where title like $1`, [`${PREFIX}%`]);
});

test.afterAll(async () => {
  await pool.end();
});

async function addTasks(titles: string[], completed: boolean[] = []) {
  const ids: string[] = [];
  for (const [i, title] of titles.entries()) {
    const result = await pool.query<{ id: string }>(
      `insert into public.tasks (title, completed, position)
       select $1, $2, coalesce(max(position) + 1, 0) from public.tasks
       returning id`,
      [title, completed[i] ?? false],
    );
    ids.push(result.rows[0].id);
  }
  return ids;
}

async function storedList() {
  const result = await pool.query<{ id: string; title: string | null; completed: boolean; position: number }>(
    'select id, title, completed, position from public.tasks order by position, id',
  );
  return result.rows;
}

/** Titles of this test's tasks, in the order the page shows them. */
async function shownTitles(page: Page, prefix: string) {
  const texts = await page.locator('.task-row__text').allTextContents();
  return texts.filter((text) => text.startsWith(prefix));
}

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });
const handle = (page: Page, title: string) => page.getByRole('button', { name: `גרירה לשינוי מיקום: ${title}` });
const checkbox = (page: Page, title: string) => page.getByRole('checkbox', { name: `סימון המשימה כהושלמה: ${title}` });


function fail(method: string, status: number, code: string, message: string) {
  return (route: Route) =>
    route.request().method() === method
      ? route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { code, message } }) })
      : route.continue();
}

const waitForWrite = (page: Page, method: string, path: RegExp) =>
  page.waitForResponse((r) => r.request().method() === method && path.test(new URL(r.url()).pathname));

test('the checkbox saves completion at once, both ways, without moving or selecting the task', async ({ page }, testInfo) => {
  const prefix = `${PREFIX} סטטוס ${testInfo.project.name}`;
  const titles = [`${prefix} א`, `${prefix} ב`];
  const [, idB] = await addTasks(titles);
  await page.goto('/');

  const saved = waitForWrite(page, 'PATCH', /\/status$/);
  await checkbox(page, titles[1]).click();
  expect((await saved).status()).toBe(200);
  await expect(checkbox(page, titles[1])).toBeChecked();
  await expect(row(page, titles[1])).toHaveClass(/task-row--completed/);
  await expect(page.getByText(NO_SELECTION)).toBeVisible();
  expect(await shownTitles(page, prefix)).toEqual(titles);
  const before = (await storedList()).find((r) => r.id === idB)!;
  expect(before.completed).toBe(true);

  await page.reload();
  await expect(checkbox(page, titles[1])).toBeChecked();
  expect(await shownTitles(page, prefix)).toEqual(titles);

  const unsaved = waitForWrite(page, 'PATCH', /\/status$/);
  await checkbox(page, titles[1]).click();
  await unsaved;
  await expect(checkbox(page, titles[1])).not.toBeChecked();
  const after = (await storedList()).find((r) => r.id === idB)!;
  expect(after).toMatchObject({ completed: false, position: before.position });
});

test('drag and drop from the handle saves the exact order, completed tasks included', async ({ page }, testInfo) => {
  const prefix = `${PREFIX} גרירה ${testInfo.project.name}`;
  const titles = [`${prefix} 1`, `${prefix} 2`, `${prefix} 3`];
  await addTasks(titles, [false, true, false]);
  await page.goto('/');
  await expect(row(page, titles[2])).toBeVisible();

  // Drag the completed task to the end.
  let saved = waitForWrite(page, 'PUT', /\/api\/tasks\/order$/);
  await dragTo(page, testInfo, handle(page, titles[1]), row(page, titles[2]));
  expect((await saved).status()).toBe(200);
  const expected = [titles[0], titles[2], titles[1]];
  expect(await shownTitles(page, prefix)).toEqual(expected);

  // Then the first one to the end, so a move upwards in the list is covered as well.
  saved = waitForWrite(page, 'PUT', /\/api\/tasks\/order$/);
  await dragTo(page, testInfo, handle(page, titles[1]), row(page, titles[0]));
  expect((await saved).status()).toBe(200);
  const final = [titles[1], titles[0], titles[2]];
  expect(await shownTitles(page, prefix)).toEqual(final);

  const stored = await storedList();
  expect(stored.map((r) => r.position)).toEqual(stored.map((_, i) => i));
  expect(stored.filter((r) => r.title?.startsWith(prefix)).map((r) => r.title)).toEqual(final);

  await page.reload();
  await expect(row(page, titles[0])).toBeVisible();
  expect(await shownTitles(page, prefix)).toEqual(final);
  // Dragging neither selected a task nor changed a status.
  await expect(page.getByText(NO_SELECTION)).toBeVisible();
  await expect(checkbox(page, titles[1])).toBeChecked();
  await expect(checkbox(page, titles[0])).not.toBeChecked();
});

test('pressing the handle or scrolling the list does not toggle, select or reorder', async ({ page }, testInfo) => {
  const prefix = `${PREFIX} נגיעה ${testInfo.project.name}`;
  const titles = [`${prefix} א`, `${prefix} ב`];
  await addTasks(titles);
  let writes = 0;
  page.on('request', (r) => {
    if (r.method() !== 'GET') writes += 1;
  });
  await page.goto('/');

  const target = handle(page, titles[0]);
  if (isMobile(testInfo)) {
    await target.tap();
    // A vertical swipe on the row text scrolls the page instead of starting a drag.
    const box = (await row(page, titles[1]).locator('.task-row__select').boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const y0 = box.y + box.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 40, y: y0 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 40, y: y0 - i * 15 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await target.click();
  }
  await page.waitForTimeout(500);

  expect(writes).toBe(0);
  await expect(page.getByText(NO_SELECTION)).toBeVisible();
  await expect(checkbox(page, titles[0])).not.toBeChecked();
  expect(await shownTitles(page, prefix)).toEqual(titles);
});

test('checking and dragging the selected task keep its unsaved draft', async ({ page }, testInfo) => {
  const prefix = `${PREFIX} טיוטה ${testInfo.project.name}`;
  const titles = [`${prefix} א`, `${prefix} ב`];
  const [idA] = await addTasks(titles);
  await page.goto('/');
  await page.getByRole('button', { name: titles[0], exact: true }).click();
  const details = page.getByRole('region', { name: 'פרטי משימה' });
  await details.getByLabel('כותרת').fill(`${titles[0]} טיוטה`);

  const status = waitForWrite(page, 'PATCH', /\/status$/);
  await checkbox(page, titles[0]).click();
  await status;
  const order = waitForWrite(page, 'PUT', /\/api\/tasks\/order$/);
  await dragTo(page, testInfo, handle(page, titles[0]), row(page, titles[1]));
  await order;

  expect(await shownTitles(page, prefix)).toEqual([titles[1], titles[0]]);
  await expect(details.getByLabel('כותרת')).toHaveValue(`${titles[0]} טיוטה`);
  const stored = (await storedList()).find((r) => r.id === idA)!;
  expect(stored).toMatchObject({ title: titles[0], completed: true });
});

test('a server error rolls the checkbox and the order back with a message', async ({ page }, testInfo) => {
  const prefix = `${PREFIX} כשל ${testInfo.project.name}`;
  const titles = [`${prefix} א`, `${prefix} ב`];
  await addTasks(titles);
  await page.goto('/');
  const list = page.getByRole('region', { name: 'רשימת משימות' });

  await page.route('**/api/tasks/*/status', fail('PATCH', 503, 'SERVICE_UNAVAILABLE', 'השירות אינו זמין כרגע.'));
  await checkbox(page, titles[0]).click();
  await expect(list.getByRole('alert')).toContainText('השירות אינו זמין כרגע.');
  await expect(checkbox(page, titles[0])).not.toBeChecked();

  await page.route('**/api/tasks/order', fail('PUT', 503, 'SERVICE_UNAVAILABLE', 'השירות אינו זמין כרגע.'));
  await dragTo(page, testInfo, handle(page, titles[0]), row(page, titles[1]));
  await expect(list.getByRole('alert')).toContainText('השירות אינו זמין כרגע.');
  expect(await shownTitles(page, prefix)).toEqual(titles);

  await page.reload();
  await expect(checkbox(page, titles[0])).not.toBeChecked();
  expect(await shownTitles(page, prefix)).toEqual(titles);
});

test('a reorder after another visitor deleted a task gets 409, keeps every task and offers a refresh', async ({ page, request }, testInfo) => {
  const prefix = `${PREFIX} התנגשות ${testInfo.project.name}`;
  const titles = [`${prefix} א`, `${prefix} ב`, `${prefix} ג`];
  const ids = await addTasks(titles);
  await page.goto('/');
  await expect(row(page, titles[2])).toBeVisible();
  expect((await request.delete(`/api/tasks/${ids[1]}`)).status()).toBe(204);

  const saved = waitForWrite(page, 'PUT', /\/api\/tasks\/order$/);
  await dragTo(page, testInfo, handle(page, titles[0]), row(page, titles[2]));
  expect((await saved).status()).toBe(409);
  const list = page.getByRole('region', { name: 'רשימת משימות' });
  await expect(list.getByRole('alert')).toContainText('רשימת המשימות השתנתה בינתיים');
  expect(await shownTitles(page, prefix)).toEqual(titles);

  await list.getByRole('button', { name: 'רענן את הרשימה' }).click();
  await expect(list.getByRole('alert')).toBeHidden();
  expect(await shownTitles(page, prefix)).toEqual([titles[0], titles[2]]);
  const stored = await storedList();
  expect(stored.map((r) => r.position)).toEqual(stored.map((_, i) => i));
});

test('another visitor sees changes only after a refresh; nothing updates in the background', async ({ page, browser }, testInfo) => {
  const prefix = `${PREFIX} מבקר ${testInfo.project.name}`;
  const titles = [`${prefix} א`, `${prefix} ב`];
  await addTasks(titles);
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await otherPage.goto('/');
    await expect(row(otherPage, titles[1])).toBeVisible();
    let backgroundGets = 0;
    otherPage.on('request', (r) => {
      if (r.url().endsWith('/api/tasks') && r.method() === 'GET') backgroundGets += 1;
    });

    await page.goto('/');
    const status = waitForWrite(page, 'PATCH', /\/status$/);
    await checkbox(page, titles[0]).click();
    await status;
    const order = waitForWrite(page, 'PUT', /\/api\/tasks\/order$/);
    await dragTo(page, testInfo, handle(page, titles[0]), row(page, titles[1]));
    await order;

    await otherPage.waitForTimeout(3000);
    expect(backgroundGets).toBe(0);
    await expect(checkbox(otherPage, titles[0])).not.toBeChecked();
    expect(await shownTitles(otherPage, prefix)).toEqual(titles);

    await otherPage.reload();
    await expect(checkbox(otherPage, titles[0])).toBeChecked();
    expect(await shownTitles(otherPage, prefix)).toEqual([titles[1], titles[0]]);
  } finally {
    await other.close();
  }
});
