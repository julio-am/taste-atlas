const SETUP_ORIGINS = new Set([
  'https://gettastemate.com',
  'https://www.gettastemate.com',
  'https://gettastemate.jcmcoding.chatgpt.site',
]);
const version = value => typeof value === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(value);

// Deliberately not a generic native-message proxy. Websites may check setup,
// but cannot capture, read drafts/types/files, open examples, or modify data.
export function setupStatusListener({ native, getVersion }) {
  let inFlight;
  return (message, sender, respond) => {
    let origin;
    try { origin = new URL(sender?.url).origin; } catch { return false; }
    if (sender.id || (sender.frameId != null && sender.frameId !== 0) || !SETUP_ORIGINS.has(origin) || (sender.origin && sender.origin !== origin)) return false;
    if (message?.type !== 'tastemate.setup.status' || message.protocolVersion !== 1 || Object.keys(message).some(key => !['type', 'protocolVersion'].includes(key))) return false;
    if (!inFlight) {
      const base = { type: 'tastemate.setup.status', protocolVersion: 1, extensionVersion: getVersion() };
      inFlight = Promise.resolve().then(() => native('hello')).then(result => {
        if (!version(result?.appVersion)) return { ...base, connected: false };
        return { ...base, connected: true, desktopVersion: result.appVersion };
      }, () => ({ ...base, connected: false })).finally(() => { inFlight = null; });
    }
    inFlight.then(respond);
    return true;
  };
}
