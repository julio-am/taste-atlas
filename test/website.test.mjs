import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateReleases, checkConnection } from '../website/dist/install-core.js';
const id = 'kmnpmjiiogbhnngjlonmpkppciniifdm';
const config = () => ({ schemaVersion: 1, downloads: {}, extension: { id: null, storeUrl: null, checkIds: [id] } });
const installer = () => ({ url: 'https://github.com/julio-am/taste-atlas/releases/download/v0.4.1/TasteMate-arm64.dmg', version: '0.4.1', sha256: 'a'.repeat(64), sizeBytes: 123, signed: true, notarized: true });
const options = { ids: [id], isChrome: true, timeoutMs: 10 };
const reply = { type: 'tastemate.setup.status', protocolVersion: 1, extensionVersion: '0.4.1', connected: true, desktopVersion: '0.4.0' };

test('empty release configuration has no invented URLs and checked-in configuration validates', async () => {
  const empty = validateReleases(config());
  assert.deepEqual(empty.downloads, {});
  assert.equal(empty.extension.storeUrl, null);
  validateReleases(JSON.parse(await readFile(new URL('../website/dist/releases.json', import.meta.url))));
});

test('installer gating rejects unsigned binaries, foreign URLs and mismatched extension IDs', () => {
  const input = config(); input.downloads['macos-arm64'] = installer();
  assert.equal(validateReleases(input).downloads['macos-arm64'].version, '0.4.1');
  for (const patch of [{ signed: false }, { notarized: false }, { sha256: '' }, { sizeBytes: 0 }, { url: 'https://attacker.test/app.dmg' }, { url: 'https://github.com/julio-am/taste-atlas/actions/artifacts/app.dmg' }]) {
    const bad = config(); bad.downloads['macos-arm64'] = { ...installer(), ...patch };
    assert.throws(() => validateReleases(bad));
  }
  input.extension = { id, storeUrl: 'https://chromewebstore.google.com/detail/tastemate-capture/' + 'a'.repeat(32), checkIds: [] };
  assert.throws(() => validateReleases(input));
});

test('connection check requires a valid native reply and handles failures', async () => {
  assert.deepEqual(await checkConnection({ ...options, runtime: undefined }), { state: 'extension-missing' });
  assert.deepEqual(await checkConnection({ ...options, isChrome: false }), { state: 'unsupported-browser' });
  assert.deepEqual(await checkConnection({ ...options, runtime: { sendMessage() {} } }), { state: 'timeout' });
  const runtime = value => ({ sendMessage(_id, request, cb) { assert.deepEqual(request, { type: reply.type, protocolVersion: 1 }); cb(value); } });
  assert.equal((await checkConnection({ ...options, runtime: runtime(reply) })).state, 'connected');
  assert.equal((await checkConnection({ ...options, runtime: runtime({ ...reply, connected: false }) })).state, 'desktop-disconnected');
  assert.equal((await checkConnection({ ...options, runtime: runtime({ connected: true }) })).state, 'update-needed');
  assert.equal((await checkConnection({ ...options, runtime: runtime({ ...reply, desktopVersion: undefined }) })).state, 'update-needed');
});
