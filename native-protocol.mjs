import { endianness } from 'node:os';
const little = endianness() === 'LE';
export const MAX_NATIVE_BYTES = 18 * 1024 * 1024;

export function encodeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message));
  if (payload.length > 1024 * 1024) throw new Error('Native response is too large.');
  const header = Buffer.alloc(4);
  little ? header.writeUInt32LE(payload.length) : header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}

export async function* readMessages(stream) {
  let buffer = Buffer.alloc(0);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const length = little ? buffer.readUInt32LE(0) : buffer.readUInt32BE(0);
      if (!length || length > MAX_NATIVE_BYTES) throw new Error('Invalid native message size.');
      if (buffer.length < length + 4) break;
      const payload = buffer.subarray(4, length + 4);
      buffer = buffer.subarray(length + 4);
      yield JSON.parse(payload.toString('utf8'));
    }
  }
  if (buffer.length) throw new Error('Incomplete native message.');
}
