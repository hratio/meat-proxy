// Build Pages under /meat-proxy, then run: node src/lib/tutorial/verify.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve('build-pages'), base = process.env.MEAT_PROXY_BASE || '/meat-proxy';
const reducedMotion = process.env.TUTORIAL_MOTION !== '1';
const artifacts = resolve('tmp/tutorial-return');
await mkdir(artifacts, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!path.startsWith(`${base}/`)) throw new Error('Outside site');
    if (path === `${base}/__setup`) { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Test setup</title>'); return; }
    let file = resolve(root, `.${path.slice(base.length)}`);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Outside build');
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}${base}/`;
const errors = [];
let browser, page;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${url}__setup`);
  await page.evaluate(async ({ base, reducedMotion }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(`meat-proxy:repository:v2:${base}/`, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(JSON.stringify({ display: { showSplashScreen: false, introductionDemo: false, reducedMotion, showCompletedFiles: false, showResolved: false, fileView: 'all', diffStyle: 'unified' }, gameplay: { sound: false, autoScroll: false, autoAdvance: false } }), '/settings/config.json');
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { base, reducedMotion });
  await page.addInitScript(() => {
    const Original = window.SharedWorker;
    window.SharedWorker = class extends Original {
      constructor(url, options) {
        super(url, options);
        if (options?.name !== 'meat-proxy-review') return;
        const port = this.port, post = port.postMessage.bind(port); let serial = 0;
        port.postMessage = message => {
          if (message.url?.endsWith('/demo-agent') && window.failNextAgent) {
            window.failNextAgent = false;
            message = { ...message, body: JSON.stringify({ ...JSON.parse(message.body), dispatchId: 'invalid' }) };
          }
          if (message.url?.endsWith('/catalog-action') && window.failNextCode) {
            window.failNextCode = false;
            const body = JSON.parse(message.body); body.fields.title = '';
            message = { ...message, body: JSON.stringify(body) };
          }
          post(message);
        };
        window.reviewRequest = (endpoint, body) => new Promise((resolve, reject) => {
          const id = --serial;
          const receive = event => {
            if (event.data.id !== id) return;
            port.removeEventListener('message', receive);
            if (event.data.type === 'error') reject(new Error(event.data.message));
            else { const data = JSON.parse(event.data.body); if (event.data.status >= 400) reject(new Error(data.error)); else resolve(data); }
          };
          port.addEventListener('message', receive); port.start();
          port.postMessage({ id, type: 'request', url: new URL(`/api/${endpoint}`, location.origin).href, method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
        });
      }
    };
  });
  const api = (endpoint, body) => page.evaluate(([endpoint, body]) => window.reviewRequest(endpoint, body), [endpoint, body]);
  const step = name => page.locator(`.tutorial-layer[data-tutorial-step="${name}"][data-ready="true"]`).waitFor();
  const guide = page.getByRole('region', { name: 'First steps', exact: true });
  const outcome = () => page.evaluate(() => localStorage.getItem('meat-proxy:first-steps:v1'));
  const ready = () => page.locator('.game-hud[data-startup="ready"]').waitFor({ timeout: 60000 });
  await page.goto(url, { waitUntil: 'domcontentloaded' }); await ready(); await step('briefing');
  await guide.getByRole('button', { name: 'Let’s do this', exact: true }).click(); await step('loadout');
  await guide.getByRole('button', { name: 'Ready to mark', exact: true }).click(); await step('mark');
  const row = page.locator('.review-file [data-line-type="change-addition"][data-line]').first();
  await row.waitFor(); const box = await row.boundingBox(); assert(box);
  const aim = { x: box.x + box.width * .7, y: box.y + box.height / 2 };
  await page.mouse.move(aim.x, aim.y);
  await page.locator('.weapon-overlay[data-main-ready="true"][data-main-holster="0"]').waitFor();
  await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up(); await step('inspect');
  const finding = (await api('snapshot')).review.findings.find(finding => finding.code);
  const file = page.locator(`.review-file[data-file-path="${finding.path}"]`);
  await guide.getByRole('button', { name: 'Got it', exact: true }).click(); await step('nuke');
  await guide.getByRole('button', { name: 'Keep it surgical', exact: true }).click(); await step('review');
  await page.mouse.move(aim.x, aim.y); await page.keyboard.press('Space'); await step('dispatch');
  assert(await file.isVisible(), 'keep the tutorial file available with completed files hidden');
  await page.getByRole('button', { name: 'Dispatch 1 finding', exact: true }).click(); await step('agent');
  const outbox = page.getByRole('dialog', { name: 'Put your agent to work', exact: true });
  assert(await outbox.getByRole('region', { name: 'First steps', exact: true }).isVisible());
  assert.equal(await outcome(), null, 'dispatch is no longer the end of the tutorial');
  await outbox.getByRole('button', { name: 'Keep reviewing', exact: true }).click();
  await guide.getByRole('button', { name: 'Open agent outbox', exact: true }).click();
  await page.evaluate(() => window.failNextAgent = true);
  await outbox.getByRole('button', { name: 'Run simulated agent', exact: true }).click();
  await outbox.getByRole('button', { name: 'Retry agent', exact: true }).waitFor();
  assert.equal((await api('snapshot')).review.findings.find(item => item.id === finding.id).status, 'open');
  assert.equal(await outcome(), null);
  await outbox.getByRole('button', { name: 'Retry agent', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-tutorial="agent-review"]')?.disabled === false);
  await guide.getByText('Your agent checked in.', { exact: true }).waitFor();
  assert.match(await outbox.textContent(), /1 file changed · 1 finding resolved/);
  await page.screenshot({ path: `${artifacts}/agent-terminal.png` });
  await outbox.getByRole('button', { name: 'Review changes', exact: true }).click(); await step('feedback');
  const marker = page.locator(`.range-badge[data-finding-id="${finding.id}"]`).first();
  await marker.waitFor(); assert.match(await marker.getAttribute('class'), /resolved/);
  const saved = (await api('bootstrap')).config;
  assert.equal(saved.display.showCompletedFiles, false); assert.equal(saved.display.showResolved, false);
  await page.screenshot({ path: `${artifacts}/resolved-finding.png` });
  await marker.click();
  const details = page.getByRole('dialog', { name: `${finding.code} finding details`, exact: true });
  await details.waitFor(); assert.match(await details.textContent(), /I did the fix/);
  await details.getByRole('button', { name: 'Reopen', exact: true }).waitFor();
  await details.getByRole('button', { name: 'Close finding', exact: true }).click();
  await guide.getByRole('button', { name: 'Track the changes', exact: true }).click(); await step('history');
  await file.getByRole('button', { name: /^History:/ }).click(); await step('rounds');
  await page.screenshot({ path: `${artifacts}/history.png` });
  const rounds = file.locator('.file-revision-controls');
  await rounds.getByRole('button', { name: / · Completed$/ }).first().click();
  await file.getByRole('button', { name: /File comparison:.*Read-only/ }).waitFor();
  await rounds.getByRole('button', { name: /^View .*Live$/ }).click();
  await guide.getByRole('button', { name: 'Make a V-code', exact: true }).click(); await step('armory');
  await page.getByRole('button', { name: 'Open rules', exact: true }).click(); await step('new-code');
  const armory = page.getByRole('dialog', { name: 'Command', exact: true });
  assert(await armory.getByRole('region', { name: 'First steps', exact: true }).isVisible());
  await armory.getByRole('button', { name: 'Types', exact: true }).click();
  await armory.getByRole('button', { name: 'New V-code in Types', exact: true }).and(armory.locator('[data-tutorial-highlight]')).waitFor();
  await armory.getByRole('button', { name: 'New V-code in Types', exact: true }).click(); await step('create-code');
  await armory.getByRole('button', { name: 'Back to group', exact: true }).click(); await step('new-code');
  await armory.getByRole('button', { name: /^New V-code in / }).first().click(); await step('create-code');
  const form = armory.getByRole('form', { name: 'Create V-code', exact: true });
  await form.getByLabel('Title', { exact: true }).fill('Handle empty results');
  await form.getByLabel('Description', { exact: true }).fill('Handle an empty result before reading its fields.');
  assert.equal(await form.getByLabel('Description', { exact: true }).evaluate(node => node === document.activeElement), true);
  await form.getByRole('textbox', { name: 'Bad example', exact: true }).fill('const name = rows[0].name;');
  await form.getByRole('textbox', { name: 'Good example', exact: true }).fill('if (rows.length === 0) return null;\nconst name = rows[0].name;');
  await form.locator('[data-catalog-scroll]').evaluate(node => node.scrollTop = 0);
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.screenshot({ path: `${artifacts}/create-vcode.png` });
  await page.evaluate(() => window.failNextCode = true);
  await form.getByRole('button', { name: 'Create', exact: true }).click();
  await form.getByRole('alert').waitFor(); await step('create-code'); assert.equal(await outcome(), null);
  await form.getByRole('button', { name: 'Create', exact: true }).click(); await step('done');
  const code = (await api('bootstrap')).catalog.groups.flatMap(group => group.codes).find(code => code.title === 'Handle empty results');
  assert(code); assert.match(await guide.textContent(), new RegExp(`${code.id} is ready`));
  assert.equal(await outcome(), 'completed');
  await guide.getByRole('button', { name: 'Let’s review', exact: true }).click();
  await armory.waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
  assert.equal(await guide.count(), 0);
  const persisted = (await api('bootstrap')).config;
  assert.equal(persisted.display.showCompletedFiles, false); assert.equal(persisted.display.showResolved, false);
  assert.deepEqual(errors, []);
  console.log(`PASS static tutorial (${reducedMotion ? 'reduced' : 'full'} motion): real dispatch and agent retry, terminal, resolved result with hidden-file preferences, history and read-only rounds, guided Rules form, rejected save/retry, and completion persistence`);
} catch (error) {
  await page?.screenshot({ path: `${artifacts}/failure.png` });
  await writeFile(`${artifacts}/failure.json`, JSON.stringify({ errors, state: await page?.evaluate(() => ({ step: document.querySelector('[data-tutorial-step]')?.getAttribute('data-tutorial-step'), text: document.querySelector('.tutorial-card')?.textContent, dialogs: [...document.querySelectorAll('[role="dialog"]')].map(node => ({ text: node.textContent, rect: node.getBoundingClientRect().toJSON() })) })) }, null, 2));
  throw error;
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
