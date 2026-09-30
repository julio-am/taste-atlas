// Real-browser acceptance check. Run with xvfb-run on Linux.
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
import { extensionId, launcherText, HOST_NAME } from '../desktop/browser-bridge.mjs';

const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'tastemate-browser-'));
const profile = path.join(folder, 'browser');
const dataDir = path.join(folder, 'library');
const manifest = JSON.parse(await fs.readFile('extension/manifest.json'));
const id = extensionId(manifest.key);
const configPath = path.join(folder, 'config.json');
const launcher = path.join(folder, 'host');
const hostManifest = path.join(profile, 'NativeMessagingHosts', `${HOST_NAME}.json`);
await fs.writeFile(configPath, JSON.stringify({ version: 1, dataDir, allowedOrigins: [`chrome-extension://${id}/`] }));
await fs.writeFile(launcher, launcherText({ executable: process.execPath, script: path.resolve('native-host.mjs'), configPath }), { mode: 0o700 });
await fs.mkdir(path.join(profile, 'NativeMessagingHosts'), { recursive: true });
await fs.writeFile(hostManifest, JSON.stringify({ name: HOST_NAME, description: 'TasteMate acceptance test', path: launcher, type: 'stdio', allowed_origins: [`chrome-extension://${id}/`] }));
const fixture = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>A useful reference</title><style>body{font:24px system-ui;background:#faf5ed;margin:60px;color:#25364b}h1{font-size:48px}p{max-width:600px}aside{width:260px;height:100px;background:#2b6551;color:white;padding:20px}</style><h1>Clarity starts with a useful title.</h1><p id="passage">Specific labels make the next step obvious.</p><aside>One clear action</aside>'); });
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
let context;
const artifacts = path.resolve('out/browser-check');
await fs.mkdir(artifacts, { recursive: true });
async function until(check, label, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 150)); }
  throw new Error(`Timed out: ${label}`);
}
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    ...(process.env.TASTEMATE_CHROME ? { executablePath: process.env.TASTEMATE_CHROME } : { channel: 'chromium' }),
    args: [`--disable-extensions-except=${path.resolve('extension')}`, `--load-extension=${path.resolve('extension')}`, '--no-sandbox', '--enable-unsafe-extension-debugging', '--disable-features=CDPScreenshotNewSurface'],
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1100, height: 760 },
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  assert.equal(new URL(worker.url()).hostname, id);
  const page = context.pages()[0];
  await page.goto(`http://127.0.0.1:${fixture.address().port}`);
  await page.locator('#passage').evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); });
  // CDP invokes the real browser action, including activeTab permission. No
  // screenshot APIs, native messages, or storage are mocked in this test.
  const browserCdp = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await browserCdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const targetInfo = targetInfos.find(target => target.url === page.url());
  assert.ok(targetInfo, `No browser tab target for fixture: ${JSON.stringify(targetInfos)}`);
  await browserCdp.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
  const read = () => worker.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('tastemate-capture', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('drafts')) { db.close(); resolve(null); return; }
      const tx = db.transaction('drafts', 'readonly');
      const get = tx.objectStore('drafts').get('current');
      get.onsuccess = () => { const d = get.result; resolve(d ? { ...d, image: Boolean(d.image) } : null); };
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => db.close();
    };
  }));
  await until(async () => Boolean((await read())?.image), 'toolbar screenshot capture');
  let draft = await read();
  assert.equal(draft.sourceText, 'Specific labels make the next step obvious.');
  assert.equal(draft.mode, 'viewport');
  let panel = await context.newPage();
  panel.on('pageerror', error => console.error('Extension page error:', error.message));
  await panel.goto(`chrome-extension://${id}/panel.html?editor`);
  await until(async () => (await panel.locator('#type option').count()) >= 7 && await panel.locator('#connection').isHidden(), 'native connection and types');
  await panel.locator('#title').fill('Useful title and quiet action');
  await panel.locator('#positive').fill('The headline states the point directly.');
  await panel.locator('#negative').fill('Avoid adding decorative gradients.');
  await panel.locator('#type').selectOption('blog');
  await panel.locator('#mode').selectOption('region');
  await panel.locator('#crop-tools summary').click();
  for (const [field, value] of [['width', '40'], ['height', '30'], ['x', '10'], ['y', '10']]) {
    await panel.locator(`#crop-${field}`).fill(value);
    await panel.locator(`#crop-${field}`).press('Tab');
  }
  await until(async () => { const d = await read(); return d.positive.includes('headline') && d.region?.x === .1 && d.region?.y === .1 && d.region?.width === .4 && d.region?.height === .3; }, 'draft autosave');
  // Reopening after a popup/editor closes must restore all annotations and crop.
  await panel.close();
  panel = await context.newPage();
  await panel.goto(`chrome-extension://${id}/panel.html?editor`);
  await panel.locator('#positive').waitFor();
  assert.equal(await panel.locator('#positive').inputValue(), 'The headline states the point directly.');
  assert.equal(await panel.locator('#mode').inputValue(), 'region');
  await until(async () => (await panel.locator('#type').inputValue()) === 'blog', 'restored type');
  await panel.screenshot({ path: path.join(artifacts, 'annotation-editor.png'), fullPage: true });
  // Break the actual native registration, verify draft retention, then repair.
  await fs.rename(hostManifest, `${hostManifest}.disabled`);
  await panel.locator('#save').click();
  await until(async () => (await panel.locator('#error').innerText()).includes('not connected'), 'missing-helper recovery');
  assert.equal((await read()).negative, 'Avoid adding decorative gradients.');
  await fs.rename(`${hostManifest}.disabled`, hostManifest);
  await panel.locator('#save').click();
  await panel.locator('#success').waitFor({ state: 'visible' });
  const saved = await read();
  assert.ok(saved.saved?.id);
  assert.equal(saved.image, false);
  const record = JSON.parse(await fs.readFile(path.join(dataDir, 'examples', `${saved.id}.json`)));
  assert.equal(record.typeId, 'blog');
  assert.equal(record.annotations.length, 2);
  assert.equal(record.capture.mode, 'region');
  assert.deepEqual(record.capture.region, { x: .1, y: .1, width: .4, height: .3 });
  const screenshot = await fs.readFile(path.join(dataDir, record.assets[0].path));
  assert.equal(screenshot.subarray(1, 4).toString(), 'PNG');
  assert.ok(screenshot.readUInt32BE(16) > 50 && screenshot.readUInt32BE(20) > 50);
  assert.match(await fs.readFile(path.join(dataDir, 'examples', `${saved.id}.md`), 'utf8'), /Blog only/);
  await panel.screenshot({ path: path.join(artifacts, 'saved.png'), fullPage: true });
  // A second real toolbar capture can save only the selected passage.
  await panel.locator('#another').click();
  await page.bringToFront();
  await browserCdp.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
  await until(async () => Boolean((await read())?.image), 'second toolbar capture');
  await panel.bringToFront();
  await panel.reload();
  await panel.locator('#mode').selectOption('text');
  await panel.locator('#positive').fill('The labels are specific.');
  await panel.locator('#save').click();
  await panel.locator('#success').waitFor({ state: 'visible' });
  const textReceipt = await read();
  const textRecord = JSON.parse(await fs.readFile(path.join(dataDir, 'examples', `${textReceipt.id}.json`)));
  assert.equal(textRecord.capture.mode, 'text');
  assert.equal(textRecord.sourceText, 'Specific labels make the next step obvious.');
  assert.equal(textRecord.assets.length, 0);
  console.log('Browser acceptance passed: real toolbar capture, selection, cropping, annotations, draft recovery, native save, and local export.');
} catch (error) {
  if (context) {
    for (const [i, page] of context.pages().entries()) {
      console.error(`Browser page ${i}: ${page.url()}`);
      console.error(await page.locator('body').innerText().catch(() => 'Could not read page'));
      await page.screenshot({ path: path.join(artifacts, `failure-${i}.png`), fullPage: true }).catch(cause => console.error('Screenshot failed:', cause.message));
    }
  }
  throw error;
} finally {
  await context?.close();
  await new Promise(resolve => fixture.close(resolve));
  await fs.rm(folder, { recursive: true, force: true });
}
