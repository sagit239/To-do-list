import type { Locator, Page, TestInfo } from '@playwright/test';

export const isMobile = (testInfo: TestInfo) => testInfo.project.name.startsWith('mobile');

/** Real touch events on mobile (Chrome DevTools Protocol), mouse on desktop. */
export async function dragTo(page: Page, testInfo: TestInfo, from: Locator, to: Locator) {
  await from.scrollIntoViewIfNeeded();
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const end = { x: start.x, y: b.y + b.height / 2 + (b.y > a.y ? 6 : -6) };
  const steps = 12;
  const point = (i: number) => ({ x: start.x, y: start.y + ((end.y - start.y) * i) / steps });

  if (isMobile(testInfo)) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
    await touch('touchStart', start);
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', point(i));
      await page.waitForTimeout(16);
    }
    await touch('touchEnd');
    await cdp.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(point(i).x, point(i).y);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  }
}
