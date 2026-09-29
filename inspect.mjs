import dns from 'node:dns/promises';
import net from 'node:net';

function publicHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (net.isIP(host)) return false;
  return true;
}
function publicAddress(address) {
  if (net.isIP(address) === 6) return !(/^(::|fc|fd|fe8|fe9|fea|feb)/i.test(address) || address === '::1' || address.startsWith('::ffff:'));
  const [a, b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0 || a === 198 && [18, 19].includes(b));
}
function decode(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#(\d+)|#x([a-f0-9]+));/gi, (all, decimal, hex) => {
    if (decimal || hex) {
      const n = parseInt(decimal || hex, hex ? 16 : 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }
    return ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[all.toLowerCase()] || all;
  });
}
function metadata(html) {
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim()).slice(0, 180);
  let description = '';
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    if (!/(?:name|property)\s*=\s*["'](?:description|og:description)["']/i.test(tag)) continue;
    description = decode(tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] || '').trim();
    if (description) break;
  }
  const body = html.replace(/<\/?(?:script|style|svg|nav|footer|header|noscript|template)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|svg|nav|footer|header|noscript|template)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return { title, description: description.slice(0, 1000), sourceText: decode(body).trim().slice(0, 6000) };
}
export async function inspectUrl(input) {
  let url = new URL(input);
  for (let redirect = 0; redirect < 4; redirect++) {
    if (!['http:', 'https:'].includes(url.protocol) || !publicHost(url.hostname) || url.username || url.password) throw new Error('Use a public http or https URL.');
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(x => !publicAddress(x.address))) throw new Error('Private network addresses are not allowed.');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'TasteMate/0.3 (personal reference capture)', Accept: 'text/html' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('The website redirected without a destination.');
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error(`Website returned HTTP ${response.status}. You can still save its URL and attach a screenshot.`);
    if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('The URL did not return an HTML page.');
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      while (size < 1024 * 1024) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const html = Buffer.concat(chunks).subarray(0, 1024 * 1024).toString('utf8');
    return { ...metadata(html), url: url.toString(), capturedAt: new Date().toISOString().slice(0, 10) };
  }
  throw new Error('Too many redirects.');
}
