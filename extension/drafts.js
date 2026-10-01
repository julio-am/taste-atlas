const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('tastemate-capture', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('drafts');
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function transaction(mode, action) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('drafts', mode);
    const request = action(tx.objectStore('drafts'));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Could not store your draft.'));
  });
}
export const readDraft = () => transaction('readonly', store => store.get('current'));
export const writeDraft = draft => transaction('readwrite', store => draft ? store.put(draft, 'current') : store.delete('current'));
