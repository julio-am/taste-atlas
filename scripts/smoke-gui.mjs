// Launch the actual packaged Mac app and wait for the renderer to initialize.
import { spawn, execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (process.platform !== 'darwin') throw new Error('The GUI smoke check needs a macOS runner.');
const root = path.resolve('out', `Taste Atlas-darwin-${process.arch}`);
const app = path.join(root, 'Taste Atlas.app');
const executable = path.join(app, 'Contents', 'MacOS', 'taste-atlas');
const info = path.join(app, 'Contents', 'Info.plist');
const minimum = execFileSync('plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', '-o', '-', info], { encoding: 'utf8' }).trim();
if (minimum !== '13.0.0') throw new Error(`Unexpected macOS minimum: ${minimum}`);
const architectures = execFileSync('lipo', ['-archs', executable], { encoding: 'utf8' }).trim().split(/\s+/);
if (!architectures.includes(process.arch)) throw new Error(`No ${process.arch} slice in packaged app: ${architectures}`);
console.log(`Mac bundle: minimum macOS ${minimum}, architectures ${architectures.join(', ')}`);

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'taste-atlas-gui-'));
const traceFile = path.join(dataDir, 'startup.log');
const port = 18000 + Math.floor(Math.random() * 20000);
const child = spawn(executable, [`--remote-debugging-port=${port}`], {
  env: { ...process.env, TASTE_ATLAS_DIR: dataDir, TASTE_ATLAS_DIAGNOSTICS: traceFile }, stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
let exited = false;
child.stdout.on('data', chunk => { output = (output + chunk).slice(-12000); });
child.stderr.on('data', chunk => { output = (output + chunk).slice(-12000); });
child.on('exit', code => { exited = true; output += `\nApp exited with code ${code}.`; });
child.on('error', error => { exited = true; output += `\nApp could not launch: ${error.message}`; });

async function inspectPage(socketUrl) {
  return await new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const timer = setTimeout(() => { socket.close(); reject(new Error('DevTools response timed out')); }, 2500);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: `({ title: document.title, collection: document.querySelector('#collection-title')?.textContent?.trim(), filters: document.querySelector('#filters')?.children.length })`,
      returnByValue: true,
    } })));
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      resolve(message.result?.result?.value);
    });
    socket.addEventListener('error', error => { clearTimeout(timer); reject(error); });
  });
}

try {
  const deadline = Date.now() + 45000;
  let last = '';
  while (Date.now() < deadline) {
    if (exited) throw new Error(output);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) });
      const pages = await response.json();
      const page = pages.find(target => target.type === 'page' && target.url?.startsWith('http://127.0.0.1:'));
      if (page) {
        const state = await inspectPage(page.webSocketDebuggerUrl);
        last = JSON.stringify(state);
        if (state?.title === 'Taste Atlas' && state?.collection === 'All references' && state?.filters > 0) {
          const api = await fetch(new URL('/api/state', page.url));
          if (!api.ok) throw new Error(`Local API returned ${api.status}`);
          console.log(`Packaged Mac GUI passed: ${last}`);
          break;
        }
      }
    } catch (error) { last = error.message; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (Date.now() >= deadline) {
    const trace = await fs.readFile(traceFile, 'utf8').catch(() => '(no startup trace)');
    throw new Error(`Mac GUI did not initialize. Last observation: ${last}\nStartup trace:\n${trace}\n${output}`);
  }
} finally {
  child.kill();
  await fs.rm(dataDir, { recursive: true, force: true });
}
