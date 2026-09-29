// The installed executable also serves read-only MCP over stdio when launched with --mcp.
// This keeps desktop AI integration independent of the GUI and of a separate Node installation.
if (process.argv.includes('--mcp')) {
  await import('../mcp-server.mjs');
  process.exit(0);
} else {
  const { app, BrowserWindow, shell } = await import('electron');
  const { default: squirrelStartup } = await import('electron-squirrel-startup');

  if (squirrelStartup || !app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    let window;
    let localServer;

    app.on('second-instance', () => {
      if (window) {
        if (window.isMinimized()) window.restore();
        window.focus();
      }
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
    app.on('before-quit', () => { void localServer?.close().catch(error => console.error(error)); });

    await app.whenReady();
    const { startServer } = await import('../server.mjs');
    localServer = await startServer({ port: 0, launchBrowser: false, mcpExecutable: process.execPath });
    const localOrigin = new URL(localServer.url).origin;

    function createWindow() {
      window = new BrowserWindow({
        title: 'Taste Atlas', width: 1280, height: 820, minWidth: 760, minHeight: 560,
        backgroundColor: '#f8fafc', autoHideMenuBar: process.platform !== 'darwin',
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') void shell.openExternal(parsed.toString());
        } catch { /* Do not open invalid links. */ }
        return { action: 'deny' };
      });
      window.webContents.on('will-navigate', (event, url) => {
        try { if (new URL(url).origin !== localOrigin) event.preventDefault(); }
        catch { event.preventDefault(); }
      });
      void window.loadURL(localServer.url);
      window.on('closed', () => { window = null; });
    }

    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }
}
