// Test harness for the real native host process (including packaged launchers).
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { encodeMessage, readMessages } from '../native-protocol.mjs';
export function nativeClient(command, args, env = {}) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const pending = new Map();
  let stderr = '', ended = false;
  child.stderr.on('data', data => { stderr += data; });
  child.stdin.on('error', () => {});
  function fail(error) { ended = true; for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); } pending.clear(); }
  child.on('error', fail);
  child.on('exit', code => fail(new Error(`Native host exited ${code}: ${stderr}`)));
  void (async () => {
    try {
      for await (const response of readMessages(child.stdout)) {
        const request = pending.get(response.id);
        if (request) { pending.delete(response.id); clearTimeout(request.timer); request.resolve(response); }
      }
    } catch (error) { fail(error); }
  })();
  return {
    child,
    request(method, params) {
      if (ended) return Promise.reject(new Error(`Native host already exited: ${stderr}`));
      return new Promise((resolve, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Native host timed out: ${stderr}`)); }, 20000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(encodeMessage({ protocolVersion: 1, id, method, params }));
      });
    },
    async close() { if (ended) return; const done = new Promise(resolve => child.once('exit', resolve)); child.stdin.end(); await done; },
  };
}
