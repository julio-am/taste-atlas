// Verify the packaged executable's read-only MCP entry point on each build OS.
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { nativeClient } from './native-client.mjs';
import { launcherText, extensionId } from '../desktop/browser-bridge.mjs';

const folders = (await fs.readdir('out', { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && entry.name === `TasteMate-${process.platform}-${process.arch}`);
if (folders.length !== 1) throw new Error(`Expected one packaged app for ${process.platform}/${process.arch}, found ${folders.length}.`);
const root = path.resolve('out', folders[0].name);
const executable = process.platform === 'darwin'
  ? path.join(root, 'TasteMate.app', 'Contents', 'MacOS', 'tastemate')
  : path.join(root, process.platform === 'win32' ? 'tastemate.exe' : 'tastemate');
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tastemate-package-'));
// The unpackaged Linux build lacks the root-owned SUID helper that the .deb installs.
const args = process.platform === 'win32'
  ? [path.join(root, 'resources', 'app.asar', 'mcp-server.mjs')]
  : process.platform === 'linux' ? ['--no-sandbox', '--mcp'] : ['--mcp'];
const env = { ...process.env, TASTEMATE_DIR: dataDir };
if (process.platform === 'win32') env.ELECTRON_RUN_AS_NODE = '1';
const child = spawn(executable, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
let errors = '';
child.stderr.on('data', chunk => { errors += chunk; });

try {
  const response = await new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stdout });
    const timer = setTimeout(() => reject(new Error(`Packaged MCP timed out. ${errors}`)), 20000);
    lines.on('line', line => {
      try {
        const message = JSON.parse(line);
        if (message.id === 1) { clearTimeout(timer); resolve(message); }
      } catch { /* Ignore non-protocol output. */ }
    });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Packaged MCP exited ${code}. ${errors}`)); });
    child.stdin.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_taste_types', arguments: {} } }) + '\n');
  });
  if (!response.result?.content?.[0]?.text?.includes('Desktop utility')) throw new Error(`Unexpected MCP response: ${JSON.stringify(response)}`);
  console.log(`Packaged MCP passed: ${executable}`);

  // Use the actual shell/cmd launcher and the host inside app.asar. This checks
  // stdio and ASAR module loading without requiring a global Node installation.
  const resources = process.platform === 'darwin' ? path.join(root, 'TasteMate.app', 'Contents', 'Resources') : path.join(root, 'resources');
  const appDir = path.join(resources, 'app.asar');
  const manifest = JSON.parse(await fs.readFile('extension/manifest.json', 'utf8'));
  const origin = `chrome-extension://${extensionId(manifest.key)}/`;
  const configPath = path.join(dataDir, 'native-config.json');
  await fs.writeFile(configPath, JSON.stringify({ version: 1, dataDir, allowedOrigins: [origin] }));
  const launcher = path.join(dataDir, process.platform === 'win32' ? 'native-host.cmd' : 'native-host');
  await fs.writeFile(launcher, launcherText({ executable, script: path.join(appDir, 'native-host.mjs'), configPath }), { mode: 0o700 });
  const host = process.platform === 'win32' ? nativeClient('cmd.exe', ['/d', '/s', '/c', `""${launcher}" ${origin}"`]) : nativeClient(launcher, [origin]);
  try {
    const hello = await host.request('hello');
    if (!hello.result?.types?.some(type => type.id === 'website')) throw new Error(`Packaged native hello failed: ${JSON.stringify(hello)}`);
    const capture = { id: randomUUID(), title: 'Packaged browser capture', mode: 'text', sourceText: 'A precise heading.', typeId: 'website', url: 'https://example.org/', capturedAt: new Date().toISOString(), annotations: [{ polarity: 'prefer', note: 'Specific, useful wording.' }] };
    const saved = await host.request('capture.save', capture);
    if (!saved.ok) throw new Error(`Packaged native save failed: ${JSON.stringify(saved)}`);
    if (!(await fs.readFile(path.join(dataDir, 'PROFILE.md'), 'utf8')).includes(capture.title)) throw new Error('Packaged capture missing from profile.');
    console.log(`Packaged browser host passed: ${executable}`);
  } finally { await host.close(); }
} finally {
  child.kill();
  await fs.rm(dataDir, { recursive: true, force: true });
}
