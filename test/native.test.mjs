import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { encodeMessage, readMessages, MAX_NATIVE_BYTES } from '../native-protocol.mjs';
import { extensionId, launcherText, manifestLocation, HOST_NAME } from '../desktop/browser-bridge.mjs';
import { nativeClient } from '../scripts/native-client.mjs';
const exec = promisify(execFile);
const manifest = JSON.parse(await fs.readFile(new URL('../extension/manifest.json', import.meta.url)));
const origin = `chrome-extension://${extensionId(manifest.key)}/`;
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAaX2RUAAAAAASUVORK5CYII=';
const payload = (overrides = {}) => ({ id: randomUUID(), mode: 'viewport', title: 'Clear page hierarchy', url: 'https://example.org/design', typeId: 'website', capturedAt: '2026-09-29T12:00:00.000Z', sourceText: 'Selected heading', annotations: [{ polarity: 'prefer', note: 'Short descriptive title' }, { polarity: 'avoid', note: 'Decorative gradients' }], image: { filename: 'page.png', mimeType: 'image/png', base64: png }, ...overrides });

test('native frames tolerate fragmentation and reject incomplete or oversized requests', async () => {
  const frame = Buffer.concat([encodeMessage({ id: 1 }), encodeMessage({ id: 2 })]);
  const result = [];
  for await (const item of readMessages(Readable.from([...frame].map(b => Buffer.from([b]))))) result.push(item);
  assert.deepEqual(result, [{ id: 1 }, { id: 2 }]);
  await assert.rejects(async () => { for await (const _ of readMessages(Readable.from([frame.subarray(0, 6)]))) {} }, /Incomplete/);
  const header = Buffer.alloc(4);
  os.endianness() === 'LE' ? header.writeUInt32LE(MAX_NATIVE_BYTES + 1) : header.writeUInt32BE(MAX_NATIVE_BYTES + 1);
  await assert.rejects(async () => { for await (const _ of readMessages(Readable.from([header]))) {} }, /Invalid native message size/);
});

test('browser captures persist atomically, survive retries, coordinate writers, and reach MCP', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'tastemate-native-'));
  const dataDir = path.join(folder, 'profile');
  const config = path.join(folder, 'config.json');
  await fs.writeFile(config, JSON.stringify({ version: 1, allowedOrigins: [origin], dataDir }));
  const unauthorized = nativeClient(process.execPath, ['native-host.mjs', '--config', config, 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/']);
  await assert.rejects(unauthorized.request('hello'), /not connected/);
  await assert.rejects(fs.access(dataDir), /ENOENT/);
  const one = nativeClient(process.execPath, ['native-host.mjs', '--config', config, origin]);
  const two = nativeClient(process.execPath, ['native-host.mjs', '--config', config, origin]);
  try {
    const hello = await one.request('hello');
    assert.ok(hello.result.types.some(t => t.id === 'desktop-utility'));
    const bad = payload({ image: { filename: 'fake.png', mimeType: 'image/png', base64: 'bm90IGFuIGltYWdl' } });
    const rejected = await one.request('capture.save', bad);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.mayHaveSaved, false);
    assert.deepEqual(await fs.readdir(path.join(dataDir, 'assets')), []);
    assert.deepEqual(await fs.readdir(path.join(dataDir, 'examples')), []);
    const capture = payload();
    const [first, repeated] = await Promise.all([one.request('capture.save', capture), two.request('capture.save', capture)]);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(repeated.result.id, first.result.id);
    assert.equal((await fs.readdir(path.join(dataDir, 'assets'))).length, 1);
    const altered = await two.request('capture.save', { ...capture, title: 'Different title' });
    assert.equal(altered.ok, false);
    assert.equal(altered.error.mayHaveSaved, true);
    const record = JSON.parse(await fs.readFile(path.join(dataDir, 'examples', `${capture.id}.json`)));
    assert.equal(record.assets.length, 1);
    assert.equal(record.annotations.length, 2);
    assert.ok(record.annotations.every(a => a.scope === 'type'));
    assert.equal(record.capture.source, 'browser-extension');
    assert.equal((await fs.readFile(path.join(dataDir, record.assets[0].path))).toString('base64'), png);
    const markdown = await fs.readFile(path.join(dataDir, 'examples', `${capture.id}.md`), 'utf8');
    assert.match(markdown, /PREFER/); assert.match(markdown, /AVOID/); assert.match(markdown, /Website only/);
    // A lost reply after committing JSON can leave derived files incomplete.
    await fs.rm(path.join(dataDir, 'PROFILE.md'));
    assert.equal((await one.request('capture.save', capture)).ok, true);
    assert.match(await fs.readFile(path.join(dataDir, 'PROFILE.md'), 'utf8'), /Clear page hierarchy/);
    // A desktop-style mutation competes with a separate native process.
    const script = "const s=await import('./store.mjs');await s.ensureStore();await s.withWriteLock(()=>s.addAnnotation(process.argv[1],{polarity:'prefer',note:'Desktop edit survives'}));await s.withWriteLock(()=>s.addType({label:'Developer documentation',description:'Useful examples'}));";
    const second = payload({ mode: 'text', title: 'Precise writing', sourceText: 'An exact passage.', image: undefined });
    const results = await Promise.all([exec(process.execPath, ['--input-type=module', '-e', script, capture.id], { env: { ...process.env, TASTEMATE_DIR: dataDir } }), two.request('capture.save', second)]);
    assert.equal(results[1].ok, true);
    assert.equal(JSON.parse(await fs.readFile(path.join(dataDir, 'examples', `${capture.id}.json`))).annotations.length, 3);
    assert.ok((await one.request('hello')).result.types.some(t => t.label === 'Developer documentation'));
    const index = JSON.parse(await fs.readFile(path.join(dataDir, 'manifest.json')));
    assert.equal(index.examples.length, 2);
    const mcpScript = "import{spawn}from'node:child_process';const p=spawn(process.execPath,['mcp-server.mjs'],{stdio:['pipe','inherit','inherit']});p.stdin.end(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_taste_example',arguments:{id:process.argv[1],includeImages:true}}})+'\\n');";
    const mcp = await exec(process.execPath, ['--input-type=module', '-e', mcpScript, capture.id], { env: { ...process.env, TASTEMATE_DIR: dataDir } });
    const response = JSON.parse(mcp.stdout.trim());
    assert.ok(response.result.content.some(c => c.type === 'image' && c.data === png));
    assert.match(response.result.content[0].text, /Desktop edit survives/);
  } finally { await one.close(); await two.close(); await fs.rm(folder, { recursive: true, force: true }); }
});

test('native launcher handles spaces and apostrophes; manifests use per-user locations', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "TasteMate user's app "));
  try {
    const configPath = path.join(dir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify({ version: 1, allowedOrigins: [origin], dataDir: path.join(dir, 'profile') }));
    const launcher = path.join(dir, process.platform === 'win32' ? 'host.cmd' : 'host');
    await fs.writeFile(launcher, launcherText({ executable: process.execPath, script: path.resolve('native-host.mjs'), configPath }), { mode: 0o700 });
    const client = process.platform === 'win32' ? nativeClient('cmd.exe', ['/d', '/s', '/c', `""${launcher}" ${origin}"`]) : nativeClient(launcher, [origin]);
    try { assert.equal((await client.request('hello')).ok, true); } finally { await client.close(); }
    const mac = manifestLocation('chrome', { platform: 'darwin', homeDir: dir });
    assert.ok(mac.path.endsWith(`Library${path.sep}Application Support${path.sep}Google${path.sep}Chrome${path.sep}NativeMessagingHosts${path.sep}${HOST_NAME}.json`));
    assert.equal(manifestLocation('edge', { platform: 'win32', bridgeDir: dir }).registry, `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${HOST_NAME}`);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
