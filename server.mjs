import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { ensureStore, dataDir, listRecords, getRecord, saveRecord, addAnnotation, removeAnnotation, addAsset, removeAsset, removeRecord, readAsset, listBundleFiles, listTypes, addType, updateType, removeType, withWriteLock } from './store.mjs';
import { inspectUrl } from './inspect.mjs';
import { createZip } from './archive.mjs';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const imageMime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
function json(res, data, status = 200) { send(res, status, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(data))); }
function send(res, status, type, bytes, extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'", ...extra });
  res.end(bytes);
}
async function body(req) {
  let size = 0, chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 19 * 1024 * 1024) throw new Error('Request too large.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function checkLocal(req) {
  const host = req.headers.host || '';
  if (!/^((127\.0\.0\.1)|(localhost))(:(\d+))?$/.test(host)) return false;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}`) return false;
    if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
  }
  return true;
}
function openBrowser(url) {
  if (process.env.TASTEMATE_NO_BROWSER === '1' || process.env.TASTE_ATLAS_NO_BROWSER === '1') return;
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  execFile(command, [url], { windowsHide: true }, error => { if (error) console.log(`Open ${url} in your browser.`); });
}
export async function startServer({ port = Number(process.env.TASTEMATE_PORT || process.env.TASTE_ATLAS_PORT || 4786), launchBrowser = true, mcpSettings = null, browserBridge = null } = {}) {
await ensureStore();
const server = http.createServer(async (req, res) => {
  if (!checkLocal(req)) { json(res, { error: 'Local requests only.' }, 403); return; }
  try {
    const route = new URL(req.url, 'http://localhost').pathname;
    if (route === '/api/state' && req.method === 'GET') return json(res, { dataDir, records: await listRecords(), types: await listTypes(), mcpSettings });
    if (route === '/api/browser-bridge' && req.method === 'GET') return json(res, browserBridge ? await browserBridge.status() : { available: false });
    if (route === '/api/browser-bridge/connect' && req.method === 'POST') {
      if (!browserBridge) return json(res, { error: 'Open the desktop app to connect a browser.' }, 400);
      return json(res, await browserBridge.connect(await body(req)));
    }
    if (route === '/api/browser-bridge/open-folder' && req.method === 'POST') {
      if (!browserBridge) return json(res, { error: 'Open the desktop app to connect a browser.' }, 400);
      await browserBridge.openFolder(); return json(res, { ok: true });
    }
    if (route === '/api/profile' && req.method === 'GET') return send(res, 200, 'text/plain; charset=utf-8', await fs.readFile(path.join(dataDir, 'PROFILE.md')));
    if (route === '/api/open-folder' && req.method === 'POST') { openBrowser(dataDir); return json(res, { ok: true }); }
    if (route === '/api/inspect' && req.method === 'POST') return json(res, await inspectUrl((await body(req)).url));
    if (route === '/api/types' && req.method === 'POST') { const payload = await body(req); return json(res, { type: await withWriteLock(() => addType(payload)) }, 201); }
    const typeMatch = route.match(/^\/api\/types\/([a-z0-9-]+)$/);
    if (typeMatch && req.method === 'PUT') { const payload = await body(req); return json(res, { type: await withWriteLock(() => updateType(typeMatch[1], payload)) }); }
    if (typeMatch && req.method === 'DELETE') { await withWriteLock(() => removeType(typeMatch[1])); return json(res, { ok: true }); }
    if (route === '/api/examples' && req.method === 'POST') { const payload = await body(req); return json(res, { record: await withWriteLock(() => saveRecord(payload)) }, 201); }
    const match = route.match(/^\/api\/examples\/([a-f0-9-]{36})(?:\/(annotations|assets)(?:\/([a-f0-9-]{36}))?)?$/);
    if (match) {
      const [, id, section, childId] = match;
      if (req.method === 'GET' && !section) return json(res, { record: await getRecord(id) });
      if (req.method === 'PUT' && !section) { const payload = await body(req); return json(res, { record: await withWriteLock(() => saveRecord(payload, id)) }); }
      if (req.method === 'DELETE' && !section) { await withWriteLock(() => removeRecord(id)); return json(res, { ok: true }); }
      if (req.method === 'POST' && section === 'annotations' && !childId) { const payload = await body(req); return json(res, { record: await withWriteLock(() => addAnnotation(id, payload)) }, 201); }
      if (req.method === 'DELETE' && section === 'annotations' && childId) return json(res, { record: await withWriteLock(() => removeAnnotation(id, childId)) });
      if (req.method === 'POST' && section === 'assets' && !childId) { const payload = await body(req); return json(res, { record: await withWriteLock(() => addAsset(id, payload)) }, 201); }
      if (req.method === 'DELETE' && section === 'assets' && childId) return json(res, { record: await withWriteLock(() => removeAsset(id, childId)) });
    }
    if (route === '/api/export' && req.method === 'GET') return send(res, 200, 'application/zip', createZip(await listBundleFiles()), { 'Content-Disposition': 'attachment; filename="tastemate-profile.zip"' });
    const asset = route.match(/^\/assets\/([a-f0-9-]+\.(png|jpg|webp|gif))$/);
    if (asset && req.method === 'GET') {
      const bytes = await readAsset(asset[1]);
      return bytes ? send(res, 200, imageMime[asset[2]], bytes) : json(res, { error: 'Image not found.' }, 404);
    }
    if (req.method === 'GET' && ['/', '/index.html', '/app.js', '/style.css', '/favicon.svg'].includes(route)) {
      const name = route === '/' ? 'index.html' : route.slice(1);
      const bytes = await fs.readFile(path.join(publicDir, name));
      return send(res, 200, mime[path.extname(name)], bytes);
    }
    json(res, { error: 'Not found.' }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    console.error(error);
    json(res, { error: message }, /not found|Invalid|Use |Give |under |up to |too large|needs a note|image data|Private network|public http|redirect|already exists|Choose a valid|Move or delete|Keep at least/i.test(message) ? 400 : 500);
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, '127.0.0.1', resolve);
});
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`TasteMate is ready: ${url}`);
  console.log(`Your profile lives at: ${dataDir}`);
  if (launchBrowser) openBrowser(url);
  return { server, url, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startServer();
}
