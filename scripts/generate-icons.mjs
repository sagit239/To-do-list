// Renders the SVG app icons in public/icons to the PNG sizes the manifest needs (ADR-10).
// Uses the project's Playwright Chromium, so no extra dependency is required. Run: npm run icons
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '0';

const iconsDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const outputs = [
  { source: 'icon.svg', file: 'icon-192.png', size: 192 },
  { source: 'icon.svg', file: 'icon-512.png', size: 512 },
  { source: 'icon-maskable.svg', file: 'icon-maskable-512.png', size: 512 },
];

const browser = await chromium.launch();
try {
  for (const { source, file, size } of outputs) {
    const svg = await readFile(iconsDir + source, 'utf8');
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
        `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block">` +
        `</body></html>`,
    );
    await page.screenshot({ path: iconsDir + file, omitBackground: true });
    await page.close();
    console.log(`public/icons/${file} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
