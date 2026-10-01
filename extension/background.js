import { readDraft, writeDraft } from './drafts.js';
import { native } from './native.js';
import { setupStatusListener } from './setup-status.js';

chrome.runtime.onMessageExternal.addListener(setupStatusListener({ native, getVersion: () => chrome.runtime.getManifest().version }));

// All draft mutations run here so a popup and an expanded editor cannot race.
let queue = Promise.resolve();
const serialize = task => { const result = queue.then(task, task); queue = result.catch(() => {}); return result; };
const plain = draft => draft ? { ...draft, image: undefined, submission: Boolean(draft.submission), hasImage: Boolean(draft.image) } : null;
function selectionOnPage() {
  const field = document.activeElement;
  if ((field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) && field.type !== 'password' && Number.isInteger(field.selectionStart)) {
    return field.value.slice(field.selectionStart, field.selectionEnd);
  }
  return window.getSelection()?.toString() || '';
}
async function capture(mode, tab, selectedText) {
  const existing = await readDraft();
  if (existing) return plain(existing);
  if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('Open a website to capture it. Browser settings, the new-tab page, and local files cannot be captured.');
  let sourceText = selectedText || '';
  if (!selectedText) {
    try { sourceText = (await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: selectionOnPage }))[0]?.result || ''; }
    catch { /* Some pages block scripts; visible screenshot capture may still work. */ }
  }
  if (mode === 'text' && !sourceText.trim()) throw new Error('Select text on the page first, then use “Save selection to TasteMate” from its right-click menu.');
  if (sourceText.length > 20000) throw new Error('Select a shorter passage (up to 20,000 characters).');
  let image;
  if (mode !== 'text') {
    const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (active?.id !== tab.id) throw new Error('The active tab changed. Return to the page and capture again.');
    const url = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 94 });
    const [after] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    const current = await chrome.tabs.get(tab.id);
    if (after?.id !== tab.id || current.url !== tab.url) throw new Error('The page changed during capture. Please capture again.');
    // Decode without a network fetch; screenshots stay in IndexedDB.
    const bytes = Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0));
    image = new Blob([bytes], { type: 'image/jpeg' });
  }
  const settings = await chrome.storage.local.get(['lastTypeId']);
  const draft = { id: crypto.randomUUID(), mode, title: (tab.title || new URL(tab.url).hostname).slice(0, 180), url: tab.url, capturedAt: new Date().toISOString(), sourceText, typeId: settings.lastTypeId || 'website', positive: '', negative: '', region: null, image };
  await writeDraft(draft);
  return plain(draft);
}
async function imagePayload(draft) {
  if (draft.mode === 'text') return undefined;
  let blob = draft.image;
  if (!blob) throw new Error('The screenshot is missing. Discard this draft and capture again.');
  if (draft.mode === 'region') {
    const r = draft.region;
    if (!r || ![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x + r.width > 1.000001 || r.y + r.height > 1.000001) throw new Error('Select an area of the screenshot first.');
    const bitmap = await createImageBitmap(blob);
    try {
      const x = Math.floor(r.x * bitmap.width), y = Math.floor(r.y * bitmap.height);
      const width = Math.max(1, Math.min(bitmap.width - x, Math.round(r.width * bitmap.width)));
      const height = Math.max(1, Math.min(bitmap.height - y, Math.round(r.height * bitmap.height)));
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d').drawImage(bitmap, x, y, width, height, 0, 0, width, height);
      blob = await canvas.convertToBlob({ type: 'image/png' });
    } finally { bitmap.close(); }
  }
  if (blob.size > 12 * 1024 * 1024) throw new Error('This image exceeds 12 MB. Choose a smaller area or capture a smaller browser window.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { filename: `${draft.mode === 'region' ? 'selected-area' : 'page'}.${blob.type === 'image/png' ? 'png' : 'jpg'}`, mimeType: blob.type, base64: btoa(binary) };
}
async function save(id) {
  const draft = await readDraft();
  if (!draft || draft.id !== id) throw new Error('This draft has changed. Reopen the extension.');
  if (draft.saved) return draft.saved;
  if (!draft.submission) {
    if (!draft.title.trim()) throw new Error('Give this example a title.');
    const annotations = [['prefer', draft.positive], ['avoid', draft.negative]].filter(([, note]) => note?.trim()).map(([polarity, note]) => ({ polarity, note: note.trim(), strength: 'contextual', scope: 'type' }));
    if (!annotations.length) throw new Error('Add at least one note about what works or what to avoid.');
    const hello = await native('hello');
    if (!hello.types.some(t => t.id === draft.typeId)) throw new Error('This type was removed in TasteMate. Reconnect and choose another type.');
    draft.submission = { id: draft.id, title: draft.title, url: draft.url, capturedAt: draft.capturedAt, mode: draft.mode, region: draft.mode === 'region' ? draft.region : null, sourceText: draft.sourceText, typeId: draft.typeId, annotations, image: await imagePayload(draft) };
    // Persist the exact request before sending. Retrying after a lost reply is safe.
    await writeDraft(draft);
  }
  try {
    const result = await native('capture.save', draft.submission);
    await chrome.storage.local.set({ lastTypeId: draft.typeId });
    // Keep a small receipt until the next capture, even if the popup closed mid-save.
    await writeDraft({ id: draft.id, saved: result });
    return result;
  } catch (error) {
    if (error.definitelyNotSaved) { delete draft.submission; await writeDraft(draft); }
    throw error;
  }
}
async function handle(message) {
  switch (message.method) {
    case 'draft.get': return plain(await readDraft());
    case 'draft.update': {
      const draft = await readDraft();
      if (!draft || draft.id !== message.id) throw new Error('This draft changed in another window. Reopen the extension.');
      if (draft.submission || draft.saved) return plain(draft);
      const patch = message.patch || {};
      for (const key of ['title', 'typeId', 'positive', 'negative']) if (typeof patch[key] === 'string') draft[key] = patch[key].slice(0, key === 'title' ? 180 : 2000);
      if (['viewport', 'region', 'text'].includes(patch.mode)) draft.mode = patch.mode;
      if ('region' in patch) draft.region = patch.region;
      await writeDraft(draft);
      return plain(draft);
    }
    case 'draft.discard': { const draft = await readDraft(); if (!draft || draft.id === message.id) await writeDraft(null); return null; }
    case 'capture.start': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return capture(message.mode || 'viewport', tab);
    }
    case 'capture.save': return save(message.id);
    default: throw new Error('Unknown capture action.');
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  serialize(() => handle(message)).then(result => respond({ ok: true, result }), error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: 'tastemate-selection', title: 'Save selection to TasteMate', contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] }));
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'tastemate-selection') return;
  void serialize(async () => {
    const draft = await readDraft();
    if (draft?.saved) await writeDraft(null);
    let error = '';
    try { await capture('text', tab, info.selectionText); }
    catch (cause) { error = cause.message; }
    await chrome.tabs.create({ url: chrome.runtime.getURL(`panel.html?editor${error ? `&error=${encodeURIComponent(error)}` : ''}`) });
  });
});
