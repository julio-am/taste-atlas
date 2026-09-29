const state = { records: [], types: [], selectedId: null, filter: 'all', query: '', dataDir: '', mcpExecutable: '', editingId: null, typeEditingId: null, anchor: null };
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const fmtDate = value => { try { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
let toastTimer;
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4200); }
async function request(route, options = {}) {
  const response = await fetch(route, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
const mutation = (route, method, data) => request(route, { method, headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
function current() { return state.records.find(record => record.id === state.selectedId); }
function typeFor(id) { return state.types.find(type => type.id === id); }
function typeLabel(id) { return typeFor(id)?.label || 'Unrecognized type'; }
const iconFor = id => ({ all: '▦', website: '⌘', blog: '¶', app: '▣', 'desktop-utility': '▤', writing: '≡', design: '◇', other: '·' })[id] || '◇';
async function refresh(preferId) {
  const data = await request('/api/state');
  state.records = data.records;
  state.types = data.types;
  state.dataDir = data.dataDir;
  state.mcpExecutable = data.mcpExecutable || '';
  if (state.filter !== 'all' && !typeFor(state.filter)) state.filter = 'all';
  const visible = visibleRecords();
  state.selectedId = visible.some(r => r.id === (preferId || state.selectedId)) ? (preferId || state.selectedId) : visible[0]?.id || null;
  render();
}
function visibleRecords() {
  const query = state.query.toLowerCase();
  return state.records.filter(record => (state.filter === 'all' || record.typeId === state.filter) &&
    (!query || [record.title, record.url, record.context, record.tags.join(' '), ...record.annotations.map(a => `${a.note} ${a.guidance}`)].join(' ').toLowerCase().includes(query)));
}
function renderFilters() {
  const filters = [{ id: 'all', label: 'All references' }, ...state.types];
  $('#filters').innerHTML = `<p class="rail-heading">COLLECTION</p>${filters.map(type => `<button class="filter ${state.filter === type.id ? 'active' : ''}" data-filter="${escapeHtml(type.id)}" type="button"><span class="filter-icon">${iconFor(type.id)}</span><span class="filter-label">${escapeHtml(type.label)}</span><span class="filter-count">${type.id === 'all' ? state.records.length : state.records.filter(r => r.typeId === type.id).length}</span></button>`).join('')}`;
}
function renderCards() {
  const records = visibleRecords();
  const heading = state.filter === 'all' ? 'All references' : typeLabel(state.filter);
  $('#collection-title').textContent = heading;
  $('#current-filter').textContent = heading;
  $('#collection-count').textContent = `${records.length} ${records.length === 1 ? 'example' : 'examples'}`;
  if (!records.length) {
    $('#cards').innerHTML = `<div class="cards-empty"><span class="empty-symbol">✳</span><strong>${state.records.length ? 'No matching examples' : 'Your references start here'}</strong><p>${state.records.length ? 'Try another search or type.' : 'Save a page, screenshot, or writing sample, then mark what to emulate and avoid.'}</p>${state.records.length ? '' : '<button class="button button-primary" data-action="new" type="button">Add your first example</button>'}</div>`;
    return;
  }
  $('#cards').innerHTML = records.map(record => {
    const thumb = record.assets[0] ? `<img src="/${escapeHtml(record.assets[0].path)}" alt="" loading="lazy">` : `<div class="card-placeholder ${['writing', 'design'].includes(record.typeId) ? record.typeId : ''}">${record.typeId === 'writing' ? 'Aa' : iconFor(record.typeId)}</div>`;
    const pos = record.annotations.filter(a => a.polarity === 'prefer').length;
    const neg = record.annotations.length - pos;
    return `<button class="ref-card ${record.id === state.selectedId ? 'selected' : ''}" type="button" data-entry="${record.id}"><div class="ref-thumb">${thumb}</div><div class="ref-body"><div class="card-meta">${escapeHtml(typeLabel(record.typeId))} <span>·</span> ${fmtDate(record.createdAt)}</div><strong>${escapeHtml(record.title)}</strong><p>${escapeHtml(record.context || record.url || record.sourceText.slice(0, 115) || 'No context added')}</p><div class="card-footer"><span class="mini-positive">+ ${pos}</span><span class="mini-negative">− ${neg}</span>${record.tags[0] ? `<span class="card-tag">${escapeHtml(record.tags[0])}</span>` : ''}</div></div></button>`;
  }).join('');
}
function renderDetail() {
  const r = current();
  if (!r) {
    $('#detail').innerHTML = `<div class="detail-empty"><div class="detail-empty-art"><span>+</span><span>−</span></div><p class="eyebrow">A CLEARER POINT OF VIEW</p><h2>Collect the details that matter.</h2><p>Add a reference, then mark the exact qualities an agent should use or avoid. Your profile updates as you go.</p><button class="button button-primary" data-action="new" type="button">Add an example</button></div>`;
    return;
  }
  const annotations = r.annotations.map((a, i) => `<article class="annotation ${a.polarity}"><div class="annotation-bar"><span class="annotation-kind">${a.polarity === 'prefer' ? '+ Prefer' : '− Avoid'}</span><span class="strength">${a.strength === 'strong' ? 'Strong preference' : 'Contextual'}</span><button class="subtle-icon" type="button" data-action="delete-annotation" data-id="${a.id}" aria-label="Delete annotation ${i + 1}">×</button></div><p class="annotation-note">${escapeHtml(a.note)}</p>${a.quote ? `<blockquote class="annotation-quote">“${escapeHtml(a.quote)}”</blockquote>` : ''}${a.guidance ? `<div class="agent-guidance"><span>Agent guidance</span>${escapeHtml(a.guidance)}</div>` : ''}<p class="applies">Scope: ${a.scope === 'all' ? 'All types' : `${escapeHtml(typeLabel(r.typeId))} only`}</p>${a.appliesTo ? `<p class="applies">Applies to: ${escapeHtml(a.appliesTo)}</p>` : ''}${a.anchor ? `<p class="applies">Pinned to image ${r.assets.findIndex(asset => asset.id === a.anchor.assetId) + 1} at ${Math.round(a.anchor.x * 100)}%, ${Math.round(a.anchor.y * 100)}%</p>` : ''}</article>`).join('');
  const assets = r.assets.map((asset, index) => {
    const pins = r.annotations.filter(a => a.anchor?.assetId === asset.id).map((a, i) => `<span class="pin ${a.polarity}" style="left:${a.anchor.x * 100}%;top:${a.anchor.y * 100}%" title="${escapeHtml(a.note)}">${r.annotations.indexOf(a) + 1}</span>`).join('');
    return `<figure class="image-frame"><div class="annotatable" data-asset="${asset.id}" tabindex="0" role="button" aria-label="Add an annotation to image ${index + 1}"><img src="/${escapeHtml(asset.path)}" alt="${escapeHtml(asset.filename)}">${pins}</div><figcaption><span>${escapeHtml(asset.filename)} <small>· click image to pin a note</small></span><button type="button" class="text-button" data-action="delete-asset" data-id="${asset.id}">Remove</button></figcaption></figure>`;
  }).join('');
  const source = safeUrl(r.url);
  $('#detail').innerHTML = `<div class="detail-scroll"><div class="detail-toolbar"><span class="eyebrow">REFERENCE / ${escapeHtml(typeLabel(r.typeId)).toUpperCase()}</span><div class="tool-actions"><button type="button" class="icon-button" data-action="edit" title="Edit example" aria-label="Edit example">✎</button><button type="button" class="icon-button danger" data-action="delete-example" title="Delete example" aria-label="Delete example">⌫</button></div></div><div class="detail-title"><h2>${escapeHtml(r.title)}</h2><p>${escapeHtml(r.context || 'No context added yet.')}</p><div class="detail-meta">${source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(new URL(source).hostname)} ↗</a>` : '<span>Local reference</span>'}<span>Captured ${fmtDate(r.createdAt)}</span></div></div>${typeFor(r.typeId)?.description ? `<div class="type-context"><strong>For ${escapeHtml(typeLabel(r.typeId))}</strong><p>${escapeHtml(typeFor(r.typeId).description)}</p></div>` : ''}${r.tags.length ? `<div class="tag-row">${r.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}<div class="detail-section"><div class="section-heading"><div><p class="eyebrow">SOURCE MATERIAL</p><h3>Images & text</h3></div><button class="button button-secondary" data-action="upload" type="button">+ Add image</button></div>${assets || '<div class="source-empty">No image yet. Add a screenshot to preserve the visual reference.</div>'}${r.sourceText ? `<details class="source-text"><summary>Saved text <span>(${r.sourceText.length.toLocaleString()} characters)</span></summary><pre>${escapeHtml(r.sourceText)}</pre></details>` : ''}</div><div class="detail-section notes-section"><div class="section-heading"><div><p class="eyebrow">YOUR POINT OF VIEW</p><h3>Annotations <span>${r.annotations.length}</span></h3></div><button class="button button-secondary" type="button" data-action="add-annotation">+ Add note</button></div>${annotations || '<div class="source-empty">Call out one specific detail you want an agent to emulate or avoid.</div>'}</div><div class="detail-end">Saved to your local, agent-readable profile</div></div>`;
}
function render() {
  renderFilters(); renderCards(); renderDetail();
  $('#storage-path').textContent = state.dataDir;
  $('#access-path').textContent = state.dataDir;
  $('#native-access').hidden = !state.mcpExecutable;
  $('#native-mcp-command').textContent = state.mcpExecutable ? `"${state.mcpExecutable}" --mcp` : '';
}
function showDialog(id) { document.getElementById(id).showModal(); }
function closeDialog(id) { document.getElementById(id).close(); }
function openExample(record = null) {
  state.editingId = record?.id || null;
  const form = $('#example-form'); form.reset();
  form.elements.typeId.innerHTML = state.types.map(type => `<option value="${escapeHtml(type.id)}">${escapeHtml(type.label)}</option>`).join('');
  form.elements.typeId.value = record?.typeId || (typeFor(state.filter) ? state.filter : typeFor('website') ? 'website' : state.types[0]?.id);
  updateTypeHint();
  $('#example-dialog-title').textContent = record ? 'Edit example' : 'Add an example';
  $('#save-example').textContent = record ? 'Save changes' : 'Save example';
  form.querySelector('.quick-notes').hidden = Boolean(record);
  $('#inspect-status').textContent = 'Page text is captured when you save. Attach a screenshot to preserve the visual design.';
  if (record) {
    for (const key of ['title', 'url', 'context', 'sourceText']) form.elements[key].value = record[key] || '';
    form.elements.tags.value = record.tags.join(', ');
  }
  showDialog('example-dialog'); form.elements.title.focus();
}
function updateTypeHint() {
  $('#example-type-description').textContent = typeFor($('#example-form').elements.typeId.value)?.description || 'Annotations for this example apply to this type unless you choose All types.';
}
function renderTypes() {
  $('#type-list').innerHTML = state.types.map(type => {
    const count = state.records.filter(r => r.typeId === type.id).length;
    return `<div class="type-row"><div><strong>${escapeHtml(type.label)}</strong><small>${count} ${count === 1 ? 'example' : 'examples'}</small>${type.description ? `<p>${escapeHtml(type.description)}</p>` : ''}</div><div class="type-actions"><button class="text-button" type="button" data-type-action="edit" data-id="${escapeHtml(type.id)}">Edit</button><button class="text-button" type="button" data-type-action="delete" data-id="${escapeHtml(type.id)}" ${count || state.types.length === 1 ? 'disabled title="Move its examples first"' : ''}>Delete</button></div></div>`;
  }).join('');
}
function resetTypeForm() {
  state.typeEditingId = null;
  $('#type-form').reset();
  $('#type-form-title').textContent = 'Add a type';
  $('#save-type').textContent = 'Add type';
  $('#cancel-type-edit').hidden = true;
}
function openTypes() { resetTypeForm(); renderTypes(); showDialog('types-dialog'); }
function openAnnotation(anchor = null) {
  state.anchor = anchor; const form = $('#annotation-form'); form.reset();
  const asset = current()?.assets.find(a => a.id === anchor?.assetId);
  $('#anchor-label').hidden = !asset;
  $('#anchor-label').textContent = asset ? `Pinned to ${asset.filename} at ${Math.round(anchor.x * 100)}% × ${Math.round(anchor.y * 100)}%` : '';
  showDialog('annotation-dialog');
  form.elements.note.focus();
}
async function uploadFiles(files) {
  const id = state.selectedId;
  for (const file of Array.from(files || [])) {
    if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} is over 12 MB.`);
    const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not read image.')); reader.readAsDataURL(file); });
    await mutation(`/api/examples/${id}/assets`, 'POST', { filename: file.name, mimeType: file.type, base64 });
  }
  await refresh(id);
  toast(`${files.length} ${files.length === 1 ? 'image' : 'images'} saved.`);
}
const picker = document.createElement('input'); picker.type = 'file'; picker.multiple = true; picker.accept = 'image/png,image/jpeg,image/webp,image/gif'; picker.hidden = true; document.body.append(picker);
picker.addEventListener('change', async () => { try { await uploadFiles(picker.files); } catch (error) { toast(error.message); } picker.value = ''; });

$('#filters').addEventListener('click', event => {
  const button = event.target.closest('[data-filter]'); if (!button) return;
  state.filter = button.dataset.filter;
  if (!visibleRecords().some(record => record.id === state.selectedId)) state.selectedId = visibleRecords()[0]?.id || null;
  render();
});
$('#cards').addEventListener('click', event => {
  const button = event.target.closest('[data-entry]');
  if (button) { state.selectedId = button.dataset.entry; render(); }
});
$('#search').addEventListener('input', event => { state.query = event.target.value; if (!visibleRecords().some(r => r.id === state.selectedId)) state.selectedId = visibleRecords()[0]?.id || null; renderCards(); renderDetail(); });
$('#new-button').addEventListener('click', () => openExample());
$('#manage-types').addEventListener('click', openTypes);
$('#example-form').elements.typeId.addEventListener('change', updateTypeHint);
$('#cancel-type-edit').addEventListener('click', resetTypeForm);
$('#type-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-type-action]'); if (!button) return;
  const type = typeFor(button.dataset.id); if (!type) return;
  if (button.dataset.typeAction === 'edit') {
    state.typeEditingId = type.id;
    const form = $('#type-form'); form.elements.label.value = type.label; form.elements.description.value = type.description;
    $('#type-form-title').textContent = `Edit ${type.label}`;
    $('#save-type').textContent = 'Save type';
    $('#cancel-type-edit').hidden = false;
    form.elements.label.focus();
  } else if (button.dataset.typeAction === 'delete' && confirm(`Delete the empty type “${type.label}”?`)) {
    try { await mutation(`/api/types/${type.id}`, 'DELETE'); await refresh(); renderTypes(); toast('Type deleted.'); }
    catch (error) { toast(error.message); }
  }
});
$('#type-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = { label: form.elements.label.value, description: form.elements.description.value };
  const button = $('#save-type'); button.disabled = true;
  try {
    const editing = Boolean(state.typeEditingId);
    const result = editing ? await mutation(`/api/types/${state.typeEditingId}`, 'PUT', payload) : await mutation('/api/types', 'POST', payload);
    await refresh(); renderTypes(); resetTypeForm();
    toast(editing ? 'Type updated.' : `${result.type.label} added.`);
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});
$('#export-button').addEventListener('click', () => { window.location.href = '/api/export'; toast('Downloading your complete profile.'); });
$('#open-folder').addEventListener('click', async () => { try { await mutation('/api/open-folder', 'POST'); } catch (error) { toast(error.message); } });
$('#agent-access').addEventListener('click', () => showDialog('access-dialog'));
$('#copy-path').addEventListener('click', async () => { try { await navigator.clipboard.writeText(state.dataDir); toast('Folder path copied.'); } catch { toast('Select and copy the path above.'); } });
$('#copy-mcp-command').addEventListener('click', async () => { try { await navigator.clipboard.writeText(`"${state.mcpExecutable}" --mcp`); toast('MCP command copied.'); } catch { toast('Select and copy the command above.'); } });
document.body.addEventListener('click', event => {
  const close = event.target.closest('[data-close]'); if (close) closeDialog(close.dataset.close);
  const newButton = event.target.closest('[data-action="new"]'); if (newButton) openExample();
});
$('#inspect-button').addEventListener('click', async () => {
  const form = $('#example-form'), url = form.elements.url.value.trim();
  if (!url) { toast('Add a URL first.'); return; }
  $('#inspect-status').textContent = 'Capturing title and readable page text…';
  $('#inspect-button').disabled = true;
  try {
    const data = await mutation('/api/inspect', 'POST', { url });
    if (!form.elements.title.value.trim()) form.elements.title.value = data.title || new URL(data.url).hostname;
    if (!form.elements.context.value.trim()) form.elements.context.value = data.description;
    if (!form.elements.sourceText.value.trim()) form.elements.sourceText.value = data.sourceText;
    form.elements.url.value = data.url;
    $('#inspect-status').textContent = `Captured page text on ${data.capturedAt}. Add a screenshot for the visual design.`;
  } catch (error) { $('#inspect-status').textContent = `${error.message} You can still save the URL and an uploaded image.`; }
  finally { $('#inspect-button').disabled = false; }
});
$('#example-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget;
  const payload = { title: form.elements.title.value, typeId: form.elements.typeId.value, tags: form.elements.tags.value.split(',').map(x => x.trim()).filter(Boolean), url: form.elements.url.value, context: form.elements.context.value, sourceText: form.elements.sourceText.value, capturedAt: state.editingId ? current()?.capturedAt : form.elements.sourceText.value ? new Date().toISOString().slice(0, 10) : '', annotations: [] };
  if (!state.editingId) {
    if (form.elements.positive.value.trim()) payload.annotations.push({ polarity: 'prefer', note: form.elements.positive.value, strength: 'contextual' });
    if (form.elements.negative.value.trim()) payload.annotations.push({ polarity: 'avoid', note: form.elements.negative.value, strength: 'contextual' });
  }
  if (!payload.url && !payload.sourceText && !state.editingId && !$('#new-images').files.length) { toast('Add a URL, writing sample, or image.'); return; }
  if ($('#new-images').files.length) payload.allowEmpty = true;
  const button = $('#save-example'); button.disabled = true;
  try {
    let captureFailed = false;
    if (payload.url && !payload.sourceText.trim() && !state.editingId) {
      try {
        const captured = await mutation('/api/inspect', 'POST', { url: payload.url });
        payload.url = captured.url;
        payload.sourceText = captured.sourceText;
        payload.context ||= captured.description;
        payload.title ||= captured.title;
        payload.capturedAt = captured.capturedAt;
      } catch { captureFailed = true; }
    }
    const files = Array.from($('#new-images').files);
    const result = state.editingId ? await mutation(`/api/examples/${state.editingId}`, 'PUT', payload) : await mutation('/api/examples', 'POST', payload);
    state.selectedId = result.record.id;
    if (state.filter !== 'all' && state.filter !== result.record.typeId) state.filter = 'all';
    closeDialog('example-dialog');
    await refresh(result.record.id);
    if (files.length) await uploadFiles(files);
    toast(captureFailed ? 'URL saved. Page text could not be captured; attach a screenshot if the visual matters.' : state.editingId ? 'Example updated.' : 'Example saved to your profile.');
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});
$('#annotation-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget;
  const payload = { polarity: form.elements.polarity.value, note: form.elements.note.value, quote: form.elements.quote.value, guidance: form.elements.guidance.value, appliesTo: form.elements.appliesTo.value, strength: form.elements.strength.value, scope: form.elements.scope.value, anchor: state.anchor };
  try { await mutation(`/api/examples/${state.selectedId}/annotations`, 'POST', payload); closeDialog('annotation-dialog'); await refresh(state.selectedId); toast('Annotation saved.'); }
  catch (error) { toast(error.message); }
});
$('#detail').addEventListener('click', async event => {
  const image = event.target.closest('[data-asset]');
  if (image) {
    const rect = image.getBoundingClientRect();
    openAnnotation({ assetId: image.dataset.asset, x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
    return;
  }
  const action = event.target.closest('[data-action]'); if (!action) return;
  const r = current();
  try {
    switch (action.dataset.action) {
      case 'edit': openExample(r); break;
      case 'add-annotation': openAnnotation(); break;
      case 'upload': picker.click(); break;
      case 'delete-example':
        if (confirm(`Delete “${r.title}” and its saved images?`)) { await mutation(`/api/examples/${r.id}`, 'DELETE'); state.selectedId = null; await refresh(); toast('Example deleted.'); }
        break;
      case 'delete-annotation':
        if (confirm('Delete this annotation?')) { await mutation(`/api/examples/${r.id}/annotations/${action.dataset.id}`, 'DELETE'); await refresh(r.id); toast('Annotation deleted.'); }
        break;
      case 'delete-asset':
        if (confirm('Remove this image and notes pinned to it?')) { await mutation(`/api/examples/${r.id}/assets/${action.dataset.id}`, 'DELETE'); await refresh(r.id); toast('Image removed.'); }
        break;
    }
  } catch (error) { toast(error.message); }
});
$('#detail').addEventListener('keydown', event => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-asset]')) {
    event.preventDefault(); openAnnotation({ assetId: event.target.dataset.asset, x: 0.5, y: 0.5 });
  }
});
document.addEventListener('paste', async event => {
  if (!current() || event.target.closest('input,textarea,[contenteditable]') || document.querySelector('dialog[open]')) return;
  const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'));
  if (files.length) { event.preventDefault(); try { await uploadFiles(files); } catch (error) { toast(error.message); } }
});
refresh().catch(error => { $('#cards').innerHTML = `<div class="cards-empty"><strong>Could not load your profile</strong><p>${escapeHtml(error.message)}</p></div>`; toast(error.message); });
