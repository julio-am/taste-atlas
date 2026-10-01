import test from 'node:test';
import assert from 'node:assert/strict';
import { setupStatusListener } from '../extension/setup-status.js';

const message = { type: 'tastemate.setup.status', protocolVersion: 1 };
const sender = { url: 'https://gettastemate.com/', origin: 'https://gettastemate.com', frameId: 0 };
function ask(listener, request = message, source = sender) {
  return new Promise(resolve => { if (!listener(request, source, resolve)) resolve(null); });
}

test('setup check reports versions without exposing library metadata', async () => {
  const calls = [];
  const listener = setupStatusListener({ native: async method => { calls.push(method); return { appVersion: '0.4.0', dataDir: '/private/library', types: [{ id: 'private-type' }], secret: 'private' }; }, getVersion: () => '0.4.1' });
  assert.deepEqual(await ask(listener), { type: message.type, protocolVersion: 1, extensionVersion: '0.4.1', connected: true, desktopVersion: '0.4.0' });
  assert.deepEqual(calls, ['hello']);
});

test('setup check rejects other origins, embedded frames, extensions, and arbitrary commands', async () => {
  let calls = 0;
  const listener = setupStatusListener({ native: async () => { calls++; return { appVersion: '0.4.1' }; }, getVersion: () => '0.4.1' });
  for (const source of [
    { ...sender, url: 'https://gettastemate.com.attacker.test/' },
    { ...sender, url: 'http://gettastemate.com/' },
    { ...sender, origin: 'https://attacker.test' },
    { ...sender, frameId: 1 },
    { ...sender, id: 'a'.repeat(32) },
    { url: 'invalid' },
  ]) assert.equal(await ask(listener, message, source), null);
  for (const request of [null, { ...message, method: 'capture.save' }, { ...message, protocolVersion: 2 }, { type: 'draft.get' }]) assert.equal(await ask(listener, request), null);
  assert.equal(calls, 0);
});

test('setup failure hides native paths and coalesces simultaneous checks', async () => {
  let calls = 0;
  const listener = setupStatusListener({ native: async () => { calls++; throw new Error('Private path /Users/example/library'); }, getVersion: () => '0.4.1' });
  const replies = await Promise.all([ask(listener), ask(listener)]);
  assert.equal(calls, 1);
  assert.deepEqual(replies[0], { type: message.type, protocolVersion: 1, extensionVersion: '0.4.1', connected: false });
  assert.deepEqual(replies[1], replies[0]);
});
