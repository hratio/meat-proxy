// Run against the local workbench to capture the actual exported GLBs in Three.js.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { enterRepository } from '../root.mjs';

enterRepository();
const { values } = parseArgs({ options: {
  url: { type: 'string', default: 'http://127.0.0.1:5173' },
  output: { type: 'string', default: 'dev/assets/source/armory' },
  angles: { type: 'boolean', default: false },
  gloves: { type: 'boolean', default: false },
  ids: { type: 'string' },
} });
const output = resolve(values.output);
await mkdir(output, { recursive: true });
const { weapons } = JSON.parse(await readFile('static/models/weapons/manifest.json', 'utf8'));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__arsenal_capture', route => route.fulfill({
    contentType: 'text/html', body: '<html><body style="margin:0;background:#101217"></body></html>',
  }));
  await page.goto(new URL('/__arsenal_capture', values.url).href);
  await page.evaluate(() => import('/dev/ui/arsenal-review.ts'));
  const save = async name => {
    const data = await page.locator('canvas').evaluate(canvas => canvas.toDataURL('image/png').split(',')[1]);
    await sharp(Buffer.from(data, 'base64')).webp({ lossless: true, exact: true, effort: 6 }).toFile(resolve(output, `${name}.webp`));
  };
  for (const { id } of weapons.filter(asset => !values.ids || values.ids.split(',').includes(asset.id))) {
    for (const view of values.angles ? ['hero', 'reverse', 'side', 'top', 'front'] : ['hero']) {
      await page.evaluate(({ id, view }) => window.arsenal.show(id, view), { id, view });
      await save(values.angles ? `${id}-${view}` : id);
    }
    console.log(`Captured ${id}`);
  }
  if (values.gloves) {
    for (const view of ['back', 'palm', 'side']) {
      await page.evaluate(view => window.arsenal.showGlove(view), view);
      await save(`glove-${view}`);
    }
    for (const id of ['rhein-9', 'daz-ratatat']) {
      await page.evaluate(id => window.arsenal.withGlove(id), id);
      await save(`held-${id}`);
    }
  }
  assert.deepEqual(errors, [], 'No browser errors while rendering the asset set');
} finally { await browser.close(); }
