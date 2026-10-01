export const HOST_NAME = 'com.julioam.tastemate';
export async function native(method, params) {
  const id = crypto.randomUUID();
  let response;
  try { response = await chrome.runtime.sendNativeMessage(HOST_NAME, { protocolVersion: 1, id, method, params }); }
  catch (cause) {
    const error = new Error('TasteMate is not connected. Open the desktop app → Browser extension → Connect, then retry. Your draft is kept in this browser.');
    error.detail = cause.message;
    throw error;
  }
  if (response?.id !== id || typeof response.ok !== 'boolean') throw new Error('Unexpected response. Update TasteMate and reconnect the extension.');
  if (!response.ok) {
    const error = new Error(response.error?.message || 'TasteMate could not save this capture.');
    error.definitelyNotSaved = response.error?.mayHaveSaved === false;
    throw error;
  }
  return response.result;
}
