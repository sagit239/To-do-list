import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type pg from 'pg';
import { createDevPool } from '../test-support/devSnapshot';

// Every task created here starts with this prefix and is removed after each test,
// so the seeded list stays as Milestone 1 tests expect it (Dev only, ADR-11).
const PREFIX = 'E2E M2';

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

async function openModal(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('listitem').first()).toBeVisible();
  await page.getByRole('button', { name: 'הוסף משימה' }).click();
  const dialog = page.getByRole('dialog', { name: 'הוספת משימה' });
  await expect(dialog).toBeVisible();
  return dialog;
}

const browserToday = (page: Page) =>
  page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

test('create with a title only: closes, appends, selects, and survives refresh and a second window', async ({
  page,
  browser,
}, testInfo) => {
  const title = `${PREFIX} כותרת ${testInfo.project.name}`;
  const dialog = await openModal(page);
  await dialog.getByLabel('כותרת').fill(title);
  const posted = page.waitForResponse((r) => r.url().endsWith('/api/tasks') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
  expect((await posted).status()).toBe(201);

  await expect(dialog).toHaveCount(0);
  const rows = page.getByRole('listitem');
  await expect(rows).toHaveCount(4);
  await expect(rows.last()).toHaveText(title);
  await expect(rows.last()).toHaveClass(/task-row--selected/);
  const details = page.getByRole('region', { name: 'פרטי משימה' });
  await expect(details.getByLabel('כותרת')).toHaveValue(title);
  await expect(details.getByLabel('תאריך יעד')).toHaveValue(await browserToday(page));

  await page.reload();
  await expect(page.getByRole('listitem').last()).toHaveText(title);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto('/');
  await expect(otherPage.getByRole('listitem').last()).toHaveText(title);
  await other.close();

  const stored = await pool.query(`select completed from public.tasks where title = $1`, [title]);
  expect(stored.rows).toEqual([{ completed: false }]);
});

test('create with a description only and no due date, and with both fields', async ({ page }, testInfo) => {
  const description = `${PREFIX} תיאור ${testInfo.project.name}`;
  let dialog = await openModal(page);
  await dialog.getByLabel('תיאור').fill(description);
  await dialog.getByLabel('תאריך יעד').fill('');
  await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('listitem').last()).toHaveText(description);
  const details = page.getByRole('region', { name: 'פרטי משימה' });
  await expect(details.getByLabel('תאריך יעד')).toHaveValue('');

  await page.getByRole('button', { name: 'הוסף משימה' }).click();
  dialog = page.getByRole('dialog', { name: 'הוספת משימה' });
  await dialog.getByLabel('כותרת').fill(`${PREFIX} שניהם`);
  await dialog.getByLabel('תיאור').fill('עם תיאור');
  await dialog.getByLabel('תאריך יעד').fill('2031-03-04');
  await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(details.getByLabel('תאריך יעד')).toHaveValue('2031-03-04');
  await expect(page.getByRole('listitem')).toHaveCount(5);
});

test('the due date starts today, can be cleared and has no time part', async ({ page }) => {
  const dialog = await openModal(page);
  const date = dialog.getByLabel('תאריך יעד');
  await expect(date).toHaveAttribute('type', 'date');
  await expect(date).toHaveValue(await browserToday(page));
  await date.fill('');
  await expect(date).toHaveValue('');
});

test('validation errors stay inside the form and send no request', async ({ page }) => {
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/tasks')) posts += 1;
  });
  const dialog = await openModal(page);
  const submit = dialog.getByRole('button', { name: 'הוסף משימה' });

  await dialog.getByLabel('כותרת').fill('   ');
  await submit.click();
  await expect(dialog.getByRole('alert')).toHaveText('יש להזין כותרת או תיאור למשימה');

  await dialog.getByLabel('כותרת').fill('א'.repeat(101));
  await submit.click();
  await expect(dialog.getByText('הכותרת ארוכה מדי (עד 100 תווים)')).toBeVisible();

  await dialog.getByLabel('כותרת').fill(`${PREFIX} תאריך עבר`);
  await dialog.getByLabel('תאריך יעד').fill('2020-01-01');
  await submit.click();
  await expect(dialog.getByText('תאריך היעד לא יכול להיות בעבר')).toBeVisible();
  await expect(dialog.getByLabel('כותרת')).toHaveValue(`${PREFIX} תאריך עבר`);

  expect(posts).toBe(0);
});

test('closing without saving (X, close button, Escape) resets the form and creates nothing', async ({ page }) => {
  const dialog = await openModal(page);
  const addButton = page.getByRole('button', { name: 'הוסף משימה' }).first();

  await dialog.getByLabel('כותרת').fill(`${PREFIX} טיוטה`);
  await dialog.locator('.modal__close').click();
  await expect(dialog).toHaveCount(0);

  await addButton.click();
  await expect(dialog.getByLabel('כותרת')).toHaveValue('');
  await dialog.getByLabel('תיאור').fill('טיוטה');
  await dialog.getByRole('button', { name: 'סגור' }).last().click();
  await expect(dialog).toHaveCount(0);

  await addButton.click();
  await expect(dialog.getByLabel('תיאור')).toHaveValue('');
  await dialog.getByLabel('כותרת').fill(`${PREFIX} טיוטה`);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await expect(page.getByRole('listitem')).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('a server error keeps the modal and values, and retrying succeeds', async ({ page }, testInfo) => {
  const title = `${PREFIX} ניסיון חוזר ${testInfo.project.name}`;
  const dialog = await openModal(page);
  await page.route('**/api/tasks', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'השירות אינו זמין כרגע.' } }),
        })
      : route.continue(),
  );
  await dialog.getByLabel('כותרת').fill(title);
  await dialog.getByLabel('תיאור').fill('נשמר בטופס');
  await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('השירות אינו זמין כרגע.');
  await expect(dialog.getByLabel('כותרת')).toHaveValue(title);
  await expect(dialog.getByLabel('תיאור')).toHaveValue('נשמר בטופס');

  await page.unroute('**/api/tasks');
  await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('listitem').last()).toHaveText(title);
});

test('with 1,000 tasks the add button is disabled and a notice is shown', async ({ page }) => {
  const full = Array.from({ length: 1000 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    title: `משימה ${i}`,
    description: null,
    dueDate: null,
    completed: false,
    position: i,
  }));
  await page.route('**/api/tasks', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(full) }),
  );
  await page.goto('/');
  await expect(page.getByText('הרשימה מלאה (1,000 משימות)')).toBeVisible();
  await expect(page.getByRole('button', { name: 'הוסף משימה' })).toBeDisabled();
});

test('the API rejects invalid input directly with 422', async ({ request }) => {
  const response = await request.post('/api/tasks', { data: { title: '  ', description: '', dueDate: null } });
  expect(response.status()).toBe(422);
  expect(await response.json()).toMatchObject({ error: { message: 'יש להזין כותרת או תיאור למשימה' } });
});

test('the modal fits the viewport on desktop and mobile', async ({ page }) => {
  const dialog = await openModal(page);
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  await page.screenshot({ path: `test-results/m2-modal-${test.info().project.name}.png` });
});
