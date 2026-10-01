import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createZip } from '../archive.mjs';
const manifest = JSON.parse(await fs.readFile('extension/manifest.json', 'utf8'));
const files = [];
async function collect(dir = '') {
  for (const item of await fs.readdir(path.join('extension', dir), { withFileTypes: true })) {
    const name = dir ? `${dir}/${item.name}` : item.name;
    if (item.isDirectory()) await collect(name);
    else files.push({ name, bytes: await fs.readFile(path.join('extension', name)) });
  }
}
await collect();
await fs.mkdir('out/extension', { recursive: true });
const target = `out/extension/tastemate-capture-${manifest.version}.zip`;
// manifest.json must be at the root for a browser-store upload.
await fs.writeFile(target, createZip(files, ''));
console.log(`Extension archive: ${target}`);
