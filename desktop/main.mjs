// The installed executable also serves read-only MCP over stdio when launched with --mcp.
import { fileURLToPath } from 'node:url';
import { appendFileSync } from 'node:fs';

function trace(stage) {
  if (process.env.TASTE_ATLAS_DIAGNOSTICS) {
    try { appendFileSync(process.env.TASTE_ATLAS_DIAGNOSTICS, `${new Date().toISOString()} ${stage}\n`); }
    catch { /* Diagnostics must never block startup. */ }
  }
}
trace('main entered');

if (process.argv.includes('--mcp')) {
  await import('../mcp-server.mjs');
  process.exit(0);
} else {
  const { app, BrowserWindow, shell } = await import('electron');
  trace('electron imported');
  const { default: squirrelStartup } = await import('electron-squirrel-startup');
  trace('squirrel helper imported');

  if (squirrelStartup || !app.requestSingleInstanceLock()) {
    trace('launch declined');
    app.quit();
  } else {
    trace('single instance acquired');
    let window = null;
    let localServer = null;
    let localOrigin = null;
    let startupError = null;

    function statusPage(title, description) {
      const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
      const html = `<!doctype html><meta charset="utf-8"><title>Taste Atlas — ${escape(title)}</title>
        <style>body{font:16px system-ui,-apple-system,sans-serif;background:#f8fafc;color:#18243a;margin:0;
          min-height:100vh;display:grid;place-items:center}main{max-width:560px;padding:48px}h1{font-size:27px}
          p{line-height:1.6}small{color:#58677b}</style>
        <main><h1>${escape(title)}</h1><p>${escape(description)}</p><small>Profile folder: ${escape(process.env.TASTE_ATLAS_DIR || 'Documents/Taste Atlas')}</small></main>`;
      return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    }

    function showStartupError(error) {
      startupError = error instanceof Error ? error.message : String(error);
      console.error('Taste Atlas startup failed:', error);
      if (window && !window.isDestroyed()) {
        void window.loadURL(statusPage('Taste Atlas could not open', startupError)).catch(console.error);
      }
    }

    function createWindow() {
      const current = new BrowserWindow({
        title: 'Taste Atlas', width: 1280, height: 820, minWidth: 760, minHeight: 560,
        backgroundColor: '#f8fafc', autoHideMenuBar: process.platform !== 'darwin',
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
      });
      window = current;
      current.webContents.setWindowOpenHandler(({ url }) => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') void shell.openExternal(parsed.toString());
        } catch { /* Do not open invalid links. */ }
        return { action: 'deny' };
      });
      current.webContents.on('will-navigate', (event, url) => {
        try { if (!localOrigin || new URL(url).origin !== localOrigin) event.preventDefault(); }
        catch { event.preventDefault(); }
      });
      current.webContents.on('did-fail-load', (_event, code, reason, url, isMainFrame) => {
        if (isMainFrame && localOrigin && url.startsWith(localOrigin)) {
          showStartupError(new Error(`The local page failed to load (${code}: ${reason}).`));
        }
      });
      current.on('closed', () => { if (window === current) window = null; });
      const target = localServer?.url || (startupError
        ? statusPage('Taste Atlas could not open', startupError)
        : statusPage('Opening Taste Atlas', 'Preparing your local profile…'));
      return current.loadURL(target).catch(showStartupError);
    }

    app.on('second-instance', () => {
      if (!window) void createWindow();
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    });
    app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
    app.on('before-quit', () => { void localServer?.close().catch(error => console.error(error)); });

    app.on('ready', () => trace('ready event'));
    trace('waiting for ready');
    await app.whenReady();
    trace('app ready');
    await createWindow();
    trace('status window loaded');
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });

    try {
      const { startServer } = await import('../server.mjs');
      const mcpSettings = process.platform === 'win32'
        ? { command: process.execPath, args: [fileURLToPath(new URL('../mcp-server.mjs', import.meta.url))], env: { ELECTRON_RUN_AS_NODE: '1' } }
        : { command: process.execPath, args: ['--mcp'] };
      localServer = await startServer({ port: 0, launchBrowser: false, mcpSettings });
      trace('local server started');
      localOrigin = new URL(localServer.url).origin;
      if (window && !window.isDestroyed()) await window.loadURL(localServer.url);
      trace('library window loaded');
      console.log('Taste Atlas window loaded.');
    } catch (error) {
      showStartupError(error);
    }
  }
}
