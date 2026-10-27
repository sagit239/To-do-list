import { expect, test } from '@playwright/test';
import { E2E_TASKS } from './global-setup';

const NO_SELECTION = 'בחר משימה מהרשימה כדי לצפות בפרטיה';

test('home page loads the shared list from the server', async ({ page }) => {
  const apiResponse = page.waitForResponse('**/api/tasks');
  await page.goto('/');
  const response = await apiResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'המשימות שלי' })).toBeVisible();

  const rows = page.getByRole('listitem');
  await expect(rows).toHaveText([E2E_TASKS.first, `${E2E_TASKS.completed} (הושלמה)`, E2E_TASKS.descriptionOnly]);
  await expect(rows.nth(1)).toHaveClass(/task-row--completed/);
  await expect(page.getByText(NO_SELECTION)).toBeVisible();
});

test('selecting a task shows its details', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: E2E_TASKS.first, exact: true }).click();
  await expect(page.getByLabel('כותרת', { exact: true })).toHaveValue(E2E_TASKS.first);
  await expect(page.getByLabel('תיאור', { exact: true })).toHaveValue('תיאור של המשימה הראשונה');
  await expect(page.getByLabel('תאריך יעד', { exact: true })).toHaveValue('2030-01-15');
  await expect(page.getByText(NO_SELECTION)).toHaveCount(0);
});

test('navigation between home and about, including refresh on /about', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'אודות' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { level: 1, name: 'אודות' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'אודות' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'אודות' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'דף הבית' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'המשימות שלי' })).toBeVisible();
});

test('a load failure is shown as an error, not as an empty list', async ({ page }) => {
  await page.route('**/api/tasks', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'השירות אינו זמין כרגע.' } }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText('השירות אינו זמין כרגע.');
  await expect(page.getByText('אין משימות ברשימה')).toHaveCount(0);
});

test('layout: list beside details on desktop, list above details on mobile', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.getByRole('listitem').first()).toBeVisible();
  const list = await page.getByRole('region', { name: 'רשימת משימות' }).boundingBox();
  const details = await page.getByRole('region', { name: 'פרטי משימה' }).boundingBox();
  expect(list && details).toBeTruthy();
  if (isMobile) {
    expect(details!.y).toBeGreaterThanOrEqual(list!.y + list!.height);
  } else {
    // RTL: the list is on the right, details on the left.
    expect(list!.x).toBeGreaterThan(details!.x);
    expect(Math.abs(list!.y - details!.y)).toBeLessThan(2);
  }
});

test('tasks are not stored in browser storage', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('listitem').first()).toBeVisible();
  const stored = await page.evaluate(() => localStorage.length + sessionStorage.length);
  expect(stored).toBe(0);
});
