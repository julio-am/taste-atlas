import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

function launch(command, args, env) { return spawn(command, args, { cwd: path.resolve('.'), env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] }); }
function waitForLine(child, predicate, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    const timer = setTimeout(() => { lines.close(); reject(new Error('Process output timed out')); }, timeout);
    lines.on('line', line => { if (predicate(line)) { clearTimeout(timer); lines.close(); resolve(line); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Process exited: ${code}`)); });
  });
}
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex').toString('base64');

test('local workflow saves annotations, images, Markdown and a complete ZIP', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'taste-atlas-test-'));
  const legacyId = randomUUID();
  await mkdir(path.join(folder, 'examples'));
  await writeFile(path.join(folder, 'examples', `${legacyId}.json`), JSON.stringify({ id: legacyId, title: 'Old app reference', category: 'app', url: 'https://example.org/', tags: [], context: '', sourceText: '', capturedAt: '', assets: [], annotations: [{ id: randomUUID(), polarity: 'avoid', note: 'A legacy note', strength: 'strong', appliesTo: '', guidance: '', quote: '', anchor: null }], createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }));
  const env = { TASTE_ATLAS_DIR: folder, TASTE_ATLAS_PORT: '0', TASTE_ATLAS_NO_BROWSER: '1' };
  const server = launch(process.execPath, ['server.mjs'], env);
  try {
    const ready = await waitForLine(server, line => line.startsWith('Taste Atlas is ready:'));
    const origin = new URL(ready.slice(ready.indexOf('http'))).origin;
    const call = async (route, method, payload) => {
      const response = await fetch(origin + route, { method, headers: payload ? { 'Content-Type': 'application/json' } : {}, body: payload ? JSON.stringify(payload) : undefined });
      return { status: response.status, data: await response.json() };
    };
    let result = await call('/api/state', 'GET');
    assert.ok(result.data.types.some(t => t.id === 'desktop-utility'));
    assert.ok(result.data.types.some(t => t.id === 'blog'));
    assert.equal(result.data.records.find(r => r.id === legacyId).typeId, 'app');
    assert.equal(result.data.records.find(r => r.id === legacyId).annotations[0].scope, 'type');
    assert.match(await readFile(path.join(folder, 'examples', `${legacyId}.md`), 'utf8'), /Scope:\*\* Application only/);
    result = await call('/api/types', 'POST', { label: 'Documentation portal', description: 'Prefer navigable examples over long introductory prose.' });
    assert.equal(result.status, 201);
    const customTypeId = result.data.type.id;
    result = await call(`/api/types/${customTypeId}`, 'PUT', { label: 'Developer docs', description: 'Prefer navigable examples over long introductory prose.' });
    assert.equal(result.data.type.id, customTypeId);
    result = await call('/api/types', 'POST', { label: 'Developer docs' });
    assert.equal(result.status, 400);
    result = await call('/api/examples', 'POST', { title: 'Quiet portfolio', typeId: customTypeId, url: 'https://example.com/', context: 'Reference for docs', tags: ['type'], annotations: [{ polarity: 'prefer', note: 'Restrained hierarchy', guidance: 'Keep headings precise', appliesTo: 'Documentation', strength: 'strong' }] });
    assert.equal(result.status, 201);
    const id = result.data.record.id;
    result = await call(`/api/types/${customTypeId}`, 'DELETE');
    assert.equal(result.status, 400);
    result = await call(`/api/examples/${id}/assets`, 'POST', { filename: 'page.png', mimeType: 'image/png', base64: png });
    assert.equal(result.status, 201);
    const assetId = result.data.record.assets[0].id;
    result = await call(`/api/examples/${id}/annotations`, 'POST', { polarity: 'avoid', note: 'Overly animated hero', scope: 'all', anchor: { assetId, x: .25, y: .5 } });
    assert.equal(result.data.record.annotations.length, 2);
    const markdown = await readFile(path.join(folder, 'examples', `${id}.md`), 'utf8');
    assert.match(markdown, /PREFER.*strong preference/);
    assert.match(markdown, /AVOID/);
    assert.match(markdown, /Scope:\*\* Developer docs only/);
    assert.match(markdown, /Scope:\*\* All types/);
    assert.match(markdown, /25% from left, 50% from top/);
    const index = await readFile(path.join(folder, 'PROFILE.md'), 'utf8');
    assert.match(index, /Quiet portfolio/);
    assert.match(index, /### Developer docs/);
    assert.match(index, /Prefer navigable examples/);
    assert.match(index, /Explicitly cross-type preferences/);
    const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.examples.find(r => r.id === id).typeId, customTypeId);
    const archive = await fetch(origin + '/api/export');
    assert.equal(archive.status, 200);
    const bytes = Buffer.from(await archive.arrayBuffer());
    assert.equal(bytes.readUInt32LE(0), 0x04034b50);
    assert.ok(bytes.includes(Buffer.from(`examples/${id}.md`)));
    assert.ok(bytes.includes(Buffer.from('assets/')));
    assert.ok(bytes.includes(Buffer.from('types.json')));
    const blocked = await call('/api/inspect', 'POST', { url: 'http://127.0.0.1:1/' });
    assert.equal(blocked.status, 400);
    assert.match(blocked.data.error, /public http/);
    const mcp = launch(process.execPath, ['mcp-server.mjs'], env);
    try {
      const resultPromise = waitForLine(mcp, line => line.includes('"id":1'));
      mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_taste_examples', arguments: { query: 'hierarchy', typeId: customTypeId } } }) + '\n');
      const response = JSON.parse(await resultPromise);
      assert.match(response.result.content[0].text, /Quiet portfolio/);
      assert.match(response.result.content[0].text, /Developer docs/);
    } finally { mcp.kill(); }
    await call(`/api/examples/${id}`, 'DELETE');
    assert.doesNotMatch(await readFile(path.join(folder, 'PROFILE.md'), 'utf8'), /Quiet portfolio/);
    result = await call(`/api/types/${customTypeId}`, 'DELETE');
    assert.equal(result.status, 200);
  } finally { server.kill(); await rm(folder, { recursive: true, force: true }); }
});
