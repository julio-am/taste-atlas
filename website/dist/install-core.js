export const PLATFORMS = {
  'macos-arm64': { label: 'Mac (Apple silicon)', extension: '.dmg', steps: ['Open the downloaded DMG.', 'Drag TasteMate into Applications, then open it from Applications.', 'In TasteMate, open Browser extension, select Chrome, and choose Connect.'] },
  'macos-x64': { label: 'Mac (Intel)', extension: '.dmg', steps: ['Open the downloaded DMG.', 'Drag TasteMate into Applications, then open it from Applications.', 'In TasteMate, open Browser extension, select Chrome, and choose Connect.'] },
  'windows-x64': { label: 'Windows', extension: '.exe', steps: ['Open the downloaded installer and follow its instructions.', 'Open TasteMate from the Start menu.', 'In TasteMate, open Browser extension, select Chrome, and choose Connect.'] },
  'linux-x64': { label: 'Linux (.deb)', extension: '.deb', steps: ['Open the downloaded .deb file with your system’s package installer.', 'Launch TasteMate from your applications menu.', 'In TasteMate, open Browser extension, select Chrome, and choose Connect.'] },
};
export const validId = value => typeof value === 'string' && /^[a-p]{32}$/.test(value);
const validVersion = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value);

// Fail closed: an unsigned, malformed, or non-release download never gets a button.
export function validateReleases(input) {
  if (input?.schemaVersion !== 1 || !input.downloads || typeof input.downloads !== 'object' || Array.isArray(input.downloads)) throw new Error('Invalid release configuration');
  const downloads = {};
  for (const [platform, entry] of Object.entries(input.downloads)) {
    if (!PLATFORMS[platform] || !entry || !validVersion(entry.version) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes <= 0) throw new Error('Invalid installer details');
    const url = new URL(entry.url);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.search || url.hash || !/^\/julio-am\/taste-atlas\/releases\/download\/[^/]+\/[^/]+$/.test(url.pathname) || !url.pathname.endsWith(PLATFORMS[platform].extension)) throw new Error('Untrusted installer location');
    if (platform.startsWith('macos-') && (entry.signed !== true || entry.notarized !== true)) throw new Error('Mac installers must be signed and notarized');
    if (platform.startsWith('windows-') && entry.signed !== true) throw new Error('Windows installers must be signed');
    downloads[platform] = { ...entry, url: url.href };
  }
  const extension = input.extension;
  if (!extension || !Array.isArray(extension.checkIds) || extension.checkIds.length > 3 || !extension.checkIds.every(validId)) throw new Error('Invalid extension details');
  if (extension.storeUrl !== null || extension.id !== null) {
    if (!validId(extension.id) || typeof extension.storeUrl !== 'string') throw new Error('Both the store URL and extension ID are required');
    const url = new URL(extension.storeUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'chromewebstore.google.com' || url.username || url.password || url.port || url.search || url.hash || !new RegExp('^/detail/[^/]+/' + extension.id + '$').test(url.pathname)) throw new Error('Invalid Chrome Web Store URL');
  }
  return { schemaVersion: 1, downloads, extension: { ...extension, checkIds: [...new Set([extension.id, ...extension.checkIds].filter(Boolean))] } };
}

export async function checkConnection({ runtime, ids, isChrome, timeoutMs = 8000 }) {
  if (!isChrome) return { state: 'unsupported-browser' };
  if (!ids.length) return { state: 'not-configured' };
  if (typeof runtime?.sendMessage !== 'function') return { state: 'extension-missing' };
  const replies = await Promise.all(ids.map(id => new Promise(resolve => {
    let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
    const timer = setTimeout(() => finish({ state: 'timeout' }), timeoutMs);
    try {
      runtime.sendMessage(id, { type: 'tastemate.setup.status', protocolVersion: 1 }, response => {
        if (runtime.lastError) return finish({ state: 'extension-missing' });
        if (response?.type !== 'tastemate.setup.status' || response.protocolVersion !== 1 || !validVersion(response.extensionVersion)) return finish({ state: 'update-needed' });
        if (response.connected === true && validVersion(response.desktopVersion)) return finish({ state: 'connected', extensionVersion: response.extensionVersion, desktopVersion: response.desktopVersion });
        if (response.connected === false) return finish({ state: 'desktop-disconnected', extensionVersion: response.extensionVersion });
        finish({ state: 'update-needed' });
      });
    } catch { finish({ state: 'extension-missing' }); }
  })));
  return ['connected', 'desktop-disconnected', 'update-needed', 'timeout', 'extension-missing'].map(state => replies.find(reply => reply.state === state)).find(Boolean);
}
