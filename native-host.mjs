// The browser launches this through TasteMate's bundled Electron/Node runtime.
// stdout is reserved for Chrome's length-prefixed native messaging protocol.
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { encodeMessage, readMessages } from './native-protocol.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== '--config' || !args[1]) throw new Error('Missing native host configuration.');
  const config = JSON.parse(await readFile(args[1], 'utf8'));
  const origin = args[2];
  if (config.version !== 1 || !/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin || '') || !config.allowedOrigins?.includes(origin)) {
    throw new Error('This extension is not connected to TasteMate.');
  }
  if (typeof config.dataDir !== 'string' || !config.dataDir) throw new Error('Missing profile folder.');
  process.env.TASTEMATE_DIR = config.dataDir;
  const store = await import('./store.mjs');
  await store.ensureStore();
  for await (const message of readMessages(process.stdin)) {
    const id = typeof message?.id === 'string' ? message.id.slice(0, 80) : null;
    let response;
    try {
      if (message?.protocolVersion !== 1) throw new Error('Update the TasteMate extension and desktop app to compatible versions.');
      let result;
      if (message.method === 'hello') {
        result = { protocolVersion: 1, appVersion: '0.4.0', dataDir: store.dataDir, types: await store.listTypes() };
      } else if (message.method === 'capture.save') {
        const record = await store.withWriteLock(() => store.saveCapture(message.params));
        result = { id: record.id, title: record.title };
      } else if (message.method === 'example.open') {
        const exampleId = message.params?.id;
        if (!/^[a-f0-9-]{36}$/.test(exampleId || '') || !await store.getRecord(exampleId)) throw new Error('Example not found.');
        if (!config.appCommand) throw new Error('Open TasteMate to view your example.');
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        const child = spawn(config.appCommand, [...(config.appArgs || []), `--open-example=${exampleId}`], { env, detached: true, stdio: 'ignore' });
        await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
        child.unref();
        result = { opened: true };
      } else throw new Error('Unknown native method.');
      response = { id, ok: true, result };
    } catch (error) {
      // A derived-file error can occur after the JSON commit. Preserve the exact
      // request on the browser side in that case so a retry repairs the export.
      let mayHaveSaved = false;
      if (message?.method === 'capture.save') {
        try { mayHaveSaved = Boolean(await store.getRecord(message.params?.id)); }
        catch { mayHaveSaved = true; }
      }
      response = { id, ok: false, error: { message: error.message || 'Could not save the capture.', mayHaveSaved } };
    }
    process.stdout.write(encodeMessage(response));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
