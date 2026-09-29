// Verify the packaged executable's read-only MCP entry point on each build OS.
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

const folders = (await fs.readdir('out', { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && entry.name.endsWith(`-${process.platform}-${process.arch}`));
if (folders.length !== 1) throw new Error(`Expected one packaged app for ${process.platform}/${process.arch}, found ${folders.length}.`);
const root = path.resolve('out', folders[0].name);
const executable = process.platform === 'darwin'
  ? path.join(root, 'Taste Atlas.app', 'Contents', 'MacOS', 'taste-atlas')
  : path.join(root, process.platform === 'win32' ? 'taste-atlas.exe' : 'taste-atlas');
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taste-atlas-package-'));
const args = process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox', '--mcp'] : ['--mcp'];
const child = spawn(executable, args, { env: { ...process.env, TASTE_ATLAS_DIR: dataDir }, stdio: ['pipe', 'pipe', 'pipe'] });
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
} finally {
  child.kill();
  await fs.rm(dataDir, { recursive: true, force: true });
}
