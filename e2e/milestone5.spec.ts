/// <reference lib="dom" />
// The DOM types are for the page.evaluate callbacks, which run in the browser.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { loadEnv } from 'vite';
import type pg from 'pg';
import { createDevPool } from '../test-support/devSnapshot';
import { dragTo, isMobile } from './drag';

// Tasks created here use this prefix and are removed after each test (Dev only, ADR-11).
const PREFIX = 'E2E M5';
const NO_SELECTION = 'בחר משימה מהרשימה כדי לצפות בפרטיה';
const OFFLINE_MESSAGE =
  'אין חיבור לאינטרנט. הרשימה המוצגת עשויה שלא להיות עדכנית, ולא ניתן לשמור שינויים עד שהחיבור יחזור.';

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

async function addTask(title: string) {
  const result = await pool.query<{ id: string }>(
    `insert into public.tasks (title, position)
     select $1, coalesce(max(position) + 1, 0) from public.tasks
     returning id`,
    [title],
  );
  return result.rows[0].id;
}

async function stored(title: string) {
  const result = await pool.query<{ description: string | null; completed: boolean; position: number }>(
    'select description, completed, position from public.tasks where title = $1',
    [title],
  );
  return result.rows;
}

const row = (page: Page, title: string) => page.getByRole('listitem').filter({ hasText: title });

async function openHome(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('listitem').first()).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/m5-${name}-${test.info().project.name}.png`, fullPage: true });

test('full user flow: view, create, edit, complete, drag, delete, navigate and refresh', async ({ page }, testInfo) => {
  const created = `${PREFIX} זרימה מלאה`;
  const other = `${PREFIX} משימה שנייה`;
  await addTask(other);
  await openHome(page);
  await expect(page.getByText(NO_SELECTION)).toBeVisible();

  // Create
  await page.getByRole('button', { name: 'הוסף משימה' }).click();
  const dialog = page.getByRole('dialog', { name: 'הוספת משימה' });
  await dialog.getByLabel('כותרת').fill(created);
  await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('כותרת', { exact: true })).toHaveValue(created);

  // Edit
  await page.getByLabel('תיאור', { exact: true }).fill('תיאור מעודכן');
  await page.getByRole('button', { name: 'שמור שינויים' }).click();
  await expect(page.getByText('השינויים נשמרו')).toBeVisible();
  await expect.poll(async () => (await stored(created))[0]?.description).toBe('תיאור מעודכן');

  // Complete
  await page.getByRole('checkbox', { name: `סימון המשימה כהושלמה: ${created}` }).click();
  await expect.poll(async () => (await stored(created))[0]?.completed).toBe(true);
  await expect(row(page, created)).toHaveClass(/task-row--completed/);

  // Drag the new (last) task above the other one
  await dragTo(
    page,
    testInfo,
    page.getByRole('button', { name: `גרירה לשינוי מיקום: ${created}` }),
    row(page, other),
  );
  await expect
    .poll(async () => (await stored(created))[0].position < (await stored(other))[0].position)
    .toBe(true);

  // Navigate away and back, then refresh: everything comes from the server
  await page.getByRole('link', { name: 'אודות' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'אודות' })).toBeVisible();
  await page.getByRole('link', { name: 'דף הבית' }).click();
  await page.reload();
  await expect(row(page, other)).toBeVisible();
  const texts = (await page.locator('.task-row__text').allTextContents()).filter((t) => t.startsWith(PREFIX));
  expect(texts).toEqual([created, other]);
  await expect(row(page, created)).toHaveClass(/task-row--completed/);

  // Delete
  await row(page, created).locator('.task-row__select').click();
  await page.getByRole('button', { name: 'מחק משימה' }).click();
  await page.getByRole('dialog', { name: 'מחיקת משימה' }).getByRole('button', { name: 'אישור' }).click();
  await expect(row(page, created)).toHaveCount(0);
  await expect(page.getByText(NO_SELECTION)).toBeVisible();
  expect(await stored(created)).toHaveLength(0);
});

test('PWA: manifest, icons and theme color are served; no service worker is registered', async ({ page, request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('manifest+json');
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: 'רשימת משימות משותפת',
    short_name: 'משימות',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'he',
    dir: 'rtl',
  });
  const sizes = (manifest.icons as { sizes: string }[]).map((icon) => icon.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));

  for (const icon of manifest.icons as { src: string; sizes: string }[]) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.status()).toBe(200);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
    // PNG width and height are stored at bytes 16-23 of the header.
    const png = await iconResponse.body();
    const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    expect(`${width}x${height}`).toBe(icon.sizes);
  }

  await openHome(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2F80ED');
  const registrations = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length));
  expect(registrations).toBe(0);
});

test('offline: a notice on both pages, changes fail and roll back, nothing is cached', async ({ page, context }) => {
  const title = `${PREFIX} ללא רשת`;
  await addTask(title);
  await openHome(page);
  await expect(page.getByText(OFFLINE_MESSAGE)).toHaveCount(0);

  await context.setOffline(true);
  await expect(page.getByText(OFFLINE_MESSAGE)).toBeVisible();

  const checkbox = page.getByRole('checkbox', { name: `סימון המשימה כהושלמה: ${title}` });
  await checkbox.click();
  await expect(page.locator('.list-alert')).toContainText('אין חיבור לשרת');
  await expect(checkbox).not.toBeChecked();

  await page.getByRole('button', { name: 'הוסף משימה' }).click();
  const dialog = page.getByRole('dialog', { name: 'הוספת משימה' });
  await dialog.getByLabel('כותרת').fill(`${PREFIX} לא נשמרה`);
  await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(dialog.getByRole('alert')).toContainText('אין חיבור לשרת');
  await expect(dialog.getByLabel('כותרת')).toHaveValue(`${PREFIX} לא נשמרה`);
  await dialog.getByRole('button', { name: 'סגור' }).first().click();

  await page.getByRole('link', { name: 'אודות' }).click();
  await expect(page.getByText(OFFLINE_MESSAGE)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(OFFLINE_MESSAGE)).toHaveCount(0);
  await page.getByRole('link', { name: 'דף הבית' }).click();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: `סימון המשימה כהושלמה: ${title}` })).not.toBeChecked();
  await expect(row(page, `${PREFIX} לא נשמרה`)).toHaveCount(0);
  expect(await stored(title)).toMatchObject([{ completed: false }]);

  const local = await page.evaluate(async () => ({
    storage: localStorage.length + sessionStorage.length,
    caches: (await caches.keys()).length,
  }));
  expect(local).toEqual({ storage: 0, caches: 0 });
});

test('Hebrew RTL layout without horizontal scroll on every screen, with touch-sized controls', async ({ page }, testInfo) => {
  const long = `${PREFIX} ${'כותרתארוכהמאודללארווחים'.repeat(4)}`.slice(0, 100);
  await addTask(long);
  await openHome(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expectNoHorizontalScroll(page);
  await shot(page, 'home');

  await page.getByRole('button', { name: long, exact: true }).click();
  await expect(page.getByLabel('כותרת', { exact: true })).toHaveValue(long);
  await expectNoHorizontalScroll(page);
  await shot(page, 'selected');

  if (isMobile(testInfo)) {
    // Every control a finger needs is at least 44px tall and wide.
    const controls = [
      page.getByRole('link', { name: 'דף הבית' }),
      page.getByRole('button', { name: 'הוסף משימה' }),
      page.getByRole('checkbox', { name: `סימון המשימה כהושלמה: ${long}` }),
      page.getByRole('button', { name: `גרירה לשינוי מיקום: ${long}` }),
      page.getByRole('button', { name: 'שמור שינויים' }),
      page.getByRole('button', { name: 'מחק משימה' }),
    ];
    for (const control of controls) {
      // The checkbox's touch area includes its margin.
      const size = await control.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          width: r.width + parseFloat(s.marginLeft) + parseFloat(s.marginRight),
          height: r.height + parseFloat(s.marginTop) + parseFloat(s.marginBottom),
        };
      });
      expect(size.width).toBeGreaterThanOrEqual(44);
      expect(size.height).toBeGreaterThanOrEqual(44);
    }
  }

  await page.getByRole('button', { name: 'מחק משימה' }).click();
  await expect(page.getByRole('dialog', { name: 'מחיקת משימה' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'delete');
  await page.getByRole('button', { name: 'ביטול' }).click();

  await page.getByRole('button', { name: 'הוסף משימה' }).click();
  const dialog = page.getByRole('dialog', { name: 'הוספת משימה' });
  await dialog.getByRole('button', { name: 'הוסף משימה' }).click();
  await expect(dialog.getByText('יש להזין כותרת או תיאור למשימה')).toBeVisible();
  const box = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await expectNoHorizontalScroll(page);
  await shot(page, 'create');
  await dialog.getByRole('button', { name: 'סגור' }).first().click();

  await page.getByRole('link', { name: 'אודות' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'אודות' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'about');
});

test('the due date is shown as a date only, in the field', async ({ page }) => {
  const title = `${PREFIX} תאריך`;
  await addTask(title);
  await pool.query(`update public.tasks set due_date = '2030-03-07' where title = $1`, [title]);
  await openHome(page);
  await page.getByRole('button', { name: title, exact: true }).click();
  const date = page.getByLabel('תאריך יעד', { exact: true });
  await expect(date).toHaveAttribute('type', 'date');
  await expect(date).toHaveValue('2030-03-07');
  await date.screenshot({ path: `test-results/m5-date-${test.info().project.name}.png` });
});
