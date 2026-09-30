import { readDraft } from './drafts.js';
import { native } from './native.js';
const $ = selector => document.querySelector(selector);
const editor = new URLSearchParams(location.search).has('editor');
document.body.classList.toggle('editor', editor);
$('#expand').hidden = editor;
$('#extension-id').textContent = chrome.runtime.id;
let draft, types = [], previewUrl, saving = false, revision = 0;
async function call(method, extra = {}) {
  const response = await chrome.runtime.sendMessage({ method, ...extra });
  if (!response?.ok) throw new Error(response?.error || 'The extension restarted. Reopen it to resume your draft.');
  return response.result;
}
function error(message = '') { $('#error').hidden = !message; $('#error').textContent = message; }
function status(message) { $('#status').textContent = message; }
function renderTypes() {
  const chosen = draft?.typeId || $('#type').value;
  $('#type').replaceChildren(...types.map(type => new Option(type.label, type.id)));
  if (!types.some(t => t.id === chosen)) $('#type').add(new Option(types.length ? 'Choose a type…' : 'Connect to load your types', ''));
  $('#type').value = types.some(t => t.id === chosen) ? chosen : '';
  $('#type-hint').textContent = types.find(t => t.id === $('#type').value)?.description || 'Notes apply to this type of work.';
}
async function connect() {
  $('#retry').disabled = true;
  try {
    const result = await native('hello');
    types = result.types;
    await chrome.storage.local.set({ types });
    $('#connection').hidden = true;
    renderTypes();
  } catch (cause) {
    types = (await chrome.storage.local.get('types')).types || [];
    renderTypes();
    $('#connection').hidden = false;
    $('#connection-detail').textContent = cause.detail || cause.message;
  } finally { $('#retry').disabled = false; }
}
function regionUI() {
  const r = draft?.region;
  const active = draft?.mode === 'region';
  $('#crop-tools').hidden = !active;
  $('#image-stage').classList.toggle('selecting', active && !draft?.submission);
  $('#crop-box').hidden = !active || !r;
  if (r) {
    Object.assign($('#crop-box').style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` });
  }
  const values = r || { x: 0, y: 0, width: 1, height: 1 };
  for (const key of ['x', 'y', 'width', 'height']) {
    const field = $(`#crop-${key}`);
    if (document.activeElement !== field) field.value = +(values[key] * 100).toFixed(1);
  }
}
function modesUI() {
  $('#visual').hidden = draft.mode === 'text';
  $('#selection').hidden = draft.mode !== 'text';
  $('#selection').textContent = draft.sourceText || '';
  regionUI();
}
async function render() {
  $('#empty').hidden = Boolean(draft);
  $('#capture-form').hidden = !draft || Boolean(draft.saved);
  $('#success').hidden = !draft?.saved;
  if (!draft) { status('Ready to capture'); return; }
  if (draft.saved) { $('#saved-title').textContent = draft.saved.title; status('Saved on this computer'); return; }
  $('#title').value = draft.title;
  $('#positive').value = draft.positive;
  $('#negative').value = draft.negative;
  $('#mode').value = draft.mode;
  $('#mode option[value="text"]').disabled = !draft.sourceText?.trim();
  $('#mode option[value="viewport"]').disabled = !draft.hasImage;
  $('#mode option[value="region"]').disabled = !draft.hasImage;
  $('#source').textContent = new URL(draft.url).hostname;
  $('#source').href = draft.url;
  $('#source').title = draft.url;
  $('#captured').textContent = new Date(draft.capturedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  $('#fields').disabled = Boolean(draft.submission);
  $('#retry-note').hidden = !draft.submission;
  $('#save').textContent = draft.submission ? 'Retry save' : 'Save to TasteMate';
  renderTypes();
  const stored = await readDraft();
  if (stored?.id === draft.id && stored.image) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(stored.image);
    $('#preview').src = previewUrl;
  }
  modesUI();
  status('Draft kept in this browser');
}
async function persist(patch) {
  if (!draft || draft.saved || saving) return;
  const currentRevision = ++revision;
  Object.assign(draft, patch);
  const result = await call('draft.update', { id: draft.id, patch });
  if (currentRevision === revision) draft = result;
}
for (const [id, key] of [['title', 'title'], ['positive', 'positive'], ['negative', 'negative'], ['type', 'typeId']]) {
  $( '#' + id).addEventListener(id === 'type' ? 'change' : 'input', () => {
    void persist({ [key]: $('#' + id).value }).catch(cause => error(`Draft could not be stored: ${cause.message}`));
    if (id === 'type') $('#type-hint').textContent = types.find(t => t.id === $('#type').value)?.description || 'Notes apply to this type of work.';
  });
}
$('#mode').addEventListener('change', async () => {
  try { await persist({ mode: $('#mode').value }); modesUI(); }
  catch (cause) { error(cause.message); }
});
let start;
const point = event => {
  const rect = $('#image-stage').getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
};
$('#image-stage').addEventListener('pointerdown', event => {
  if (draft?.mode !== 'region' || draft.submission || saving || event.button !== 0) return;
  start = point(event);
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
});
$('#image-stage').addEventListener('pointermove', event => {
  if (!start) return;
  const end = point(event);
  draft.region = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
  regionUI();
});
async function finishCrop() {
  if (!start) return;
  start = null;
  if (!draft.region || draft.region.width < .005 || draft.region.height < .005) draft.region = null;
  regionUI();
  try { await persist({ region: draft.region }); } catch (cause) { error(cause.message); }
}
$('#image-stage').addEventListener('pointerup', finishCrop);
$('#image-stage').addEventListener('pointercancel', finishCrop);
$('#reset-crop').addEventListener('click', async () => { try { await persist({ region: null }); regionUI(); } catch (cause) { error(cause.message); } });
for (const key of ['x', 'y', 'width', 'height']) $(`#crop-${key}`).addEventListener('change', async () => {
  const r = Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, Number($(`#crop-${k}`).value) / 100]));
  if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x + r.width > 1.000001 || r.y + r.height > 1.000001) { error('The selected area must fit inside the image (0–100%).'); return; }
  try { error(); await persist({ region: r }); regionUI(); } catch (cause) { error(cause.message); }
});
$('#capture-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (saving) return;
  error();
  try {
    // Flush final field values before beginning the immutable save request.
    await persist({ title: $('#title').value, typeId: $('#type').value, positive: $('#positive').value, negative: $('#negative').value });
    saving = true;
    $('#fields').disabled = true; $('#save').disabled = true; $('#discard').disabled = true;
    status('Saving to your local library…');
    await call('capture.save', { id: draft.id });
    draft = await call('draft.get');
    await render();
  } catch (cause) {
    draft = await call('draft.get').catch(() => draft);
    await render();
    error(cause.message);
  } finally { saving = false; $('#save').disabled = false; $('#discard').disabled = false; }
});
$('#discard').addEventListener('click', async () => {
  if (!confirm(draft.submission ? 'A save may already have completed. Discard this draft? Check TasteMate before capturing it again.' : 'Discard this capture and its notes?')) return;
  try { await call('draft.discard', { id: draft.id }); draft = null; error(); await render(); }
  catch (cause) { error(cause.message); }
});
$('#another').addEventListener('click', async () => {
  await call('draft.discard', { id: draft.id });
  if (!editor) window.close();
  else { draft = null; await render(); status('Return to a website and click TasteMate to capture another reference.'); }
});
$('#view').addEventListener('click', async () => { try { error(); await native('example.open', { id: draft.saved.id }); } catch (cause) { error(cause.message); } });
$('#expand').addEventListener('click', async () => { await chrome.tabs.create({ url: chrome.runtime.getURL('panel.html?editor') }); window.close(); });
$('#retry').addEventListener('click', () => void connect());
$('#capture-now').addEventListener('click', async () => {
  try { error(); draft = await call('capture.start'); await render(); }
  catch (cause) { error(cause.message); }
});
async function initialize() {
  const savedTypes = await chrome.storage.local.get('types');
  types = savedTypes.types || [];
  draft = await call('draft.get');
  const resumed = Boolean(draft && !draft.saved);
  if (!draft && !editor) {
    try { draft = await call('capture.start'); }
    catch (cause) { error(cause.message); }
  }
  await render();
  if (resumed) status('Resuming your unfinished capture');
  const initialError = new URLSearchParams(location.search).get('error');
  if (initialError) error(initialError);
  await connect();
}
initialize().catch(cause => { error(cause.message); status('Could not open the capture'); });
