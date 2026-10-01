import { PLATFORMS, validateReleases, checkConnection } from './install-core.js';

const $ = id => document.getElementById(id);
let releases = null;
let lastConnection = { state: 'not-checked' };
function setLink(node, url, text) {
  node.textContent = text;
  node.setAttribute('aria-disabled', String(!url));
  if (url) { node.href = url; node.removeAttribute('tabindex'); }
  else { node.removeAttribute('href'); node.tabIndex = -1; }
}
function badge(id, text, connected = false) { $(id).textContent = text; $(id).classList.toggle('connected', connected); }
function renderDownload() {
  const platform = $('platform').value;
  const info = PLATFORMS[platform];
  const entry = releases?.downloads[platform];
  $('install-instructions').hidden = !info;
  $('install-instructions').replaceChildren();
  $('checksum').hidden = !entry;
  $('platform-hint').hidden = Boolean(platform && !platform.startsWith('macos-'));
  if (info) {
    const ol = document.createElement('ol');
    for (const step of info.steps) { const li = document.createElement('li'); li.textContent = step; ol.append(li); }
    $('install-instructions').append(ol);
  }
  if (!info) {
    setLink($('download'), null, 'Select a computer');
    $('download-note').textContent = 'Choose the installer that matches your computer.';
  } else if (!entry) {
    setLink($('download'), null, `Download for ${info.label}`);
    $('download-note').textContent = releases ? `The public ${info.label} installer is not available yet. If TasteMate is already installed, continue below.` : 'Download availability could not be checked. Refresh the page to try again.';
  } else {
    setLink($('download'), entry.url, `Download for ${info.label}`);
    $('download-note').textContent = `Version ${entry.version} · ${(entry.sizeBytes / 1024 / 1024).toFixed(0)} MB${platform.startsWith('macos-') ? ' · Developer signed · Apple notarized' : platform.startsWith('windows-') ? ' · Signed installer' : ''}`;
    $('checksum').textContent = `SHA-256: ${entry.sha256}`;
  }
}
function renderAvailability() {
  const desktopReady = Object.keys(releases.downloads).length > 0;
  const extensionReady = Boolean(releases.extension.storeUrl);
  $('release-notice').textContent = desktopReady && extensionReady ? 'Install both pieces, then check their connection below.' : desktopReady ? 'The desktop app is available. The Chrome extension is awaiting its store release.' : extensionReady ? 'The Chrome extension is available. Public desktop installers are not available yet.' : 'TasteMate is in private testing. Public desktop downloads and the Chrome Web Store release are not available yet. Already testing TasteMate? Check your connection below.';
  $('release-notice').classList.toggle('ready', desktopReady && extensionReady);
  setLink($('add-extension'), releases.extension.storeUrl, 'Add to Chrome');
  $('extension-note').textContent = extensionReady ? 'Chrome opens its own confirmation. Install in the browser profile where you want to capture examples, then refresh this page.' : 'The Chrome Web Store listing is not published yet. This button will become available when it is ready.';
  renderDownload();
}

const messages = {
  'unsupported-browser': ['Open this page in desktop Chrome.', 'The automatic check uses Chrome’s extension connection. You can still read the installation instructions here.'],
  'not-configured': ['The website connection check is not available yet.', 'You can check an existing setup by opening TasteMate Capture in Chrome.'],
  'extension-missing': ['TasteMate Capture did not respond.', 'Install or enable the extension in this Chrome profile, then refresh this page. If you are using an older development copy, update it or check the connection inside the extension.'],
  'desktop-disconnected': ['The extension is installed. The desktop app is not connected.', 'Open TasteMate → Browser extension → Chrome → Connect, then check again. Your existing examples and drafts are unchanged.'],
  'update-needed': ['This version could not complete the website check.', 'Update TasteMate and TasteMate Capture, then try again. You can also check the connection inside the extension.'],
  'timeout': ['The connection check timed out.', 'Open TasteMate, confirm the browser connection, and check again.'],
  'connected': ['TasteMate is connected.', 'Open a website, click TasteMate Capture, choose a category, and save an example with a positive or negative note.'],
};
async function runCheck() {
  const button = $('check-connection');
  button.disabled = true; button.textContent = 'Checking…';
  badge('connection-badge', 'Checking');
  $('connection-result').className = 'connection-result';
  $('connection-result').textContent = 'Checking TasteMate Capture and the desktop connection…';
  try {
    const ua = navigator.userAgent;
    const result = await checkConnection({ runtime: globalThis.chrome?.runtime, ids: releases?.extension.checkIds || [], isChrome: /(?:Chrome|Chromium)\//.test(ua) && !/(?:Edg|OPR|SamsungBrowser)\//.test(ua) && !/Android|iPhone|iPad/.test(ua) });
    const [title, description] = messages[result.state];
    const p = document.createElement('p'), strong = document.createElement('strong'), detail = document.createElement('p');
    strong.textContent = title; p.append(strong); detail.textContent = description;
    $('connection-result').replaceChildren(p, detail);
    const connected = result.state === 'connected';
    $('connection-result').className = `connection-result ${connected ? 'success' : 'warning'}`;
    badge('connection-badge', connected ? 'Connected' : 'Needs attention', connected);
    badge('desktop-status', connected ? `v${result.desktopVersion} connected` : result.state === 'desktop-disconnected' ? 'Not connected' : 'Not checked', connected);
    const found = Boolean(result.extensionVersion);
    badge('extension-status', found ? `v${result.extensionVersion} detected` : 'Not detected', found);
    lastConnection = result;
    return result;
  } finally { button.disabled = false; button.textContent = 'Check again'; }
}

$('platform').addEventListener('change', renderDownload);
$('check-connection').addEventListener('click', runCheck);
// A download click never counts as a successful installation.
$('download').addEventListener('click', event => { if ($('download').getAttribute('aria-disabled') === 'true') event.preventDefault(); });
$('add-extension').addEventListener('click', event => { if ($('add-extension').getAttribute('aria-disabled') === 'true') event.preventDefault(); });
const ua = navigator.userAgent;
if (/Windows/.test(ua)) $('platform').value = 'windows-x64';
// macOS user agents often say Intel even on Apple silicon. Ask rather than guess.
if (navigator.userAgentData?.getHighEntropyValues && !/Android/.test(ua)) {
  navigator.userAgentData.getHighEntropyValues(['architecture', 'platform']).then(({ architecture, platform }) => {
    if (platform === 'macOS' && !$('platform').value && ['arm', 'x86'].includes(architecture)) {
      $('platform').value = architecture === 'arm' ? 'macos-arm64' : 'macos-x64'; renderDownload();
    }
  }).catch(() => {});
}
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10000);
try {
  const response = await fetch('/releases.json', { cache: 'no-store', signal: controller.signal });
  if (!response.ok) throw new Error('Release details unavailable');
  releases = validateReleases(await response.json()); renderAvailability();
} catch {
  $('release-notice').textContent = 'Download availability could not be checked. Refresh this page to try again, or use the release notes link below.';
  setLink($('add-extension'), null, 'Add to Chrome');
  $('extension-note').textContent = 'The store link could not be checked. Refresh the page to try again.';
  renderDownload();
} finally { clearTimeout(timer); }

// Optional page tools use the same controls and state as the human flow.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const tools = [
    { name: 'get_installation_status', title: 'Read TasteMate setup status', description: 'Read installer and extension availability and the last connection check. Does not start a download or probe the computer.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute(input) { if (input == null || typeof input !== 'object' || Object.keys(input).length) throw new Error('No arguments expected'); return { selectedPlatform: $('platform').value || null, downloads: releases?.downloads || {}, chromeWebStoreUrl: releases?.extension.storeUrl || null, connection: lastConnection }; } },
    { name: 'select_installer', title: 'Choose TasteMate installer', description: 'Select a computer type in the installation form. Does not download or install software.', inputSchema: { type: 'object', properties: { platform: { type: 'string', enum: Object.keys(PLATFORMS) } }, required: ['platform'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { if (!input || !Object.hasOwn(PLATFORMS, input.platform) || Object.keys(input).length !== 1) throw new Error('Choose a supported platform'); $('platform').value = input.platform; renderDownload(); return { platform: input.platform, available: Boolean(releases?.downloads[input.platform]), url: releases?.downloads[input.platform]?.url || null }; } },
  ];
  for (const tool of tools) {
    try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Installation works without experimental browser tools. */ }
  }
}
