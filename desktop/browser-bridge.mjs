import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const HOST_NAME = 'com.julioam.tastemate';

export function extensionId(key) {
  return createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
}
const quoteSh = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const quoteBat = value => {
  if (/[\r\n"!]/.test(value)) throw new Error('The install path contains characters unsupported by the browser launcher.');
  return `"${value.replaceAll('%', '%%')}"`;
};
export function launcherText({ executable, script, configPath, platform = process.platform }) {
  if (platform === 'win32') return `@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n${quoteBat(executable)} ${quoteBat(script)} --config ${quoteBat(configPath)} %*\r\n`;
  return `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec ${quoteSh(executable)} ${quoteSh(script)} --config ${quoteSh(configPath)} "$@"\n`;
}
export function manifestLocation(browser, { platform = process.platform, homeDir = os.homedir(), configDir = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config'), bridgeDir } = {}) {
  if (!['chrome', 'edge', 'chromium'].includes(browser)) throw new Error('Choose Chrome or Edge.');
  if (platform === 'win32') {
    const key = browser === 'edge' ? 'Microsoft\\Edge' : browser === 'chromium' ? 'Chromium' : 'Google\\Chrome';
    return { path: path.join(bridgeDir, `${browser}.json`), registry: `HKCU\\Software\\${key}\\NativeMessagingHosts\\${HOST_NAME}` };
  }
  const base = platform === 'darwin' ? path.join(homeDir, 'Library', 'Application Support') : configDir;
  const dir = platform === 'darwin'
    ? { chrome: 'Google/Chrome', edge: 'Microsoft Edge', chromium: 'Chromium' }[browser]
    : { chrome: 'google-chrome', edge: 'microsoft-edge', chromium: 'chromium' }[browser];
  return { path: path.join(base, dir, 'NativeMessagingHosts', `${HOST_NAME}.json`) };
}
async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await fs.rename(temp, file);
}

export function createBrowserBridge({ appDir, userDataDir, executable, dataDir, appArgs = [], openPath, resolveManifest }) {
  const bridgeDir = path.join(userDataDir, 'browser-bridge');
  const configPath = path.join(bridgeDir, 'config.json');
  const extensionDir = path.join(userDataDir, 'browser-extension');
  const launcher = path.join(bridgeDir, process.platform === 'win32' ? 'tastemate-host.cmd' : 'tastemate-host');
  let queue = Promise.resolve();
  const serialized = task => { const result = queue.then(task, task); queue = result.catch(() => {}); return result; };
  const readConfig = () => fs.readFile(configPath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  async function status() {
    const [manifest, config] = await Promise.all([fs.readFile(path.join(appDir, 'extension', 'manifest.json'), 'utf8').then(JSON.parse), readConfig()]);
    return { available: true, extensionId: extensionId(manifest.key), extensionDir, browsers: config?.browsers || [], version: manifest.version };
  }
  async function install(browsers, ids) {
    await fs.mkdir(bridgeDir, { recursive: true });
    const config = { version: 1, browsers, allowedOrigins: ids.map(id => `chrome-extension://${id}/`), dataDir, appCommand: executable, appArgs };
    await writeJson(configPath, config);
    await fs.writeFile(launcher, launcherText({ executable, script: path.join(appDir, 'native-host.mjs'), configPath }), { mode: 0o700 });
    await fs.chmod(launcher, 0o700);
    for (const browser of browsers) {
      const destination = resolveManifest ? resolveManifest(browser) : manifestLocation(browser, { bridgeDir });
      await writeJson(destination.path, { name: HOST_NAME, description: 'Save browser captures to your local TasteMate profile', path: launcher, type: 'stdio', allowed_origins: config.allowedOrigins });
      if (destination.registry) await exec('reg.exe', ['add', destination.registry, '/ve', '/t', 'REG_SZ', '/d', destination.path, '/f'], { windowsHide: true });
    }
    // Copy out of app.asar so Load unpacked can read the extension.
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.cp(path.join(appDir, 'extension'), extensionDir, { recursive: true });
    return status();
  }
  return {
    status,
    connect: ({ browser, id }) => serialized(async () => {
      if (!['chrome', 'edge'].includes(browser)) throw new Error('Choose Chrome or Edge.');
      const current = await status();
      const chosen = id || current.extensionId;
      if (!/^[a-p]{32}$/.test(chosen)) throw new Error('Invalid extension ID.');
      const old = await readConfig();
      const ids = [...new Set([current.extensionId, chosen, ...(old?.allowedOrigins || []).map(origin => origin.split('/')[2])])];
      return install([...new Set([...current.browsers, browser])], ids);
    }),
    refresh: () => serialized(async () => {
      const old = await readConfig();
      if (old?.browsers?.length) return install(old.browsers, old.allowedOrigins.map(origin => origin.split('/')[2]));
    }),
    openFolder: async () => { await fs.access(path.join(extensionDir, 'manifest.json')); const error = await openPath(extensionDir); if (error) throw new Error(error); },
  };
}
