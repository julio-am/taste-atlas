// Import only already-published assets. Does not create releases or publish a site.
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateReleases } from '../website/dist/install-core.js';

const [flag, tag, ...extra] = process.argv.slice(2);
if (flag !== '--release' || !tag || extra.length) throw new Error('Usage: node scripts/configure-website.mjs --release <published-tag>');
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000), headers: { Accept: 'application/json', 'User-Agent': 'TasteMate-release-importer' } });
  if (!response.ok) throw new Error(`Could not fetch ${url}: HTTP ${response.status}`);
  return response;
}
const release = await (await get(`https://api.github.com/repos/julio-am/taste-atlas/releases/tags/${encodeURIComponent(tag)}`)).json();
if (release.draft || !release.published_at || release.tag_name !== tag) throw new Error('Choose an already-published release');
const asset = release.assets.find(item => item.name === 'tastemate-release.json');
if (!asset || asset.size > 1024 * 1024) throw new Error('Attach a tastemate-release.json manifest (under 1 MB) to the release first');
const candidate = validateReleases(await (await get(asset.browser_download_url)).json());
if (!Object.keys(candidate.downloads).length) throw new Error('The release manifest has no installers');
for (const entry of Object.values(candidate.downloads)) {
  const binary = release.assets.find(item => item.browser_download_url === entry.url);
  if (!binary || binary.size !== entry.sizeBytes) throw new Error('Installer URL/size does not match the published release');
  if (`v${entry.version}` !== tag && entry.version !== tag) throw new Error('Installer version does not match the release tag');
  const hash = createHash('sha256'); let bytes = 0;
  const response = await get(entry.url);
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > entry.sizeBytes) throw new Error('Installer is larger than its manifest'); hash.update(chunk); }
  if (bytes !== entry.sizeBytes || hash.digest('hex') !== entry.sha256) throw new Error('Installer integrity check failed');
}
const file = new URL('../website/dist/releases.json', import.meta.url);
const current = JSON.parse(await fs.readFile(file, 'utf8'));
const next = { ...current, downloads: candidate.downloads };
validateReleases(next);
await fs.writeFile(new URL('../website/dist/releases.json.tmp', import.meta.url), JSON.stringify(next, null, 2) + '\n');
await fs.rename(new URL('../website/dist/releases.json.tmp', import.meta.url), file);
console.log(`Verified and configured ${Object.keys(candidate.downloads).length} installer(s). Republish the website to make them available.`);
