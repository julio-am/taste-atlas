// npm runs this after Electron Forge makes the platform's installer.
// On macOS, use the system disk image tool instead of appdmg/image-size.
if (process.platform === 'darwin') {
  const { execFileSync } = await import('node:child_process');
  const { promises: fs } = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');

  const out = path.resolve('out');
  const folders = (await fs.readdir(out, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && entry.name === `TasteMate-darwin-${process.arch}`);
  if (folders.length !== 1) {
    throw new Error(`Expected one packaged Mac app for ${process.arch}, found ${folders.length}.`);
  }
  const app = path.join(out, folders[0].name, 'TasteMate.app');
  if (!(await fs.stat(app)).isDirectory()) throw new Error(`Missing packaged app: ${app}`);

  const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'));
  const destination = path.join(out, 'make', 'dmg', 'darwin', process.arch);
  await fs.mkdir(destination, { recursive: true });
  const dmg = path.join(destination, `TasteMate-${version}-${process.arch}.dmg`);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'tastemate-dmg-'));
  try {
    const contents = path.join(temporary, 'contents');
    await fs.mkdir(contents);
    // ditto preserves the app bundle's signatures and stapled ticket.
    execFileSync('ditto', [app, path.join(contents, 'TasteMate.app')], { stdio: 'inherit' });
    await fs.symlink('/Applications', path.join(contents, 'Applications'));
    execFileSync('hdiutil', [
      'create', '-volname', 'TasteMate', '-srcfolder', contents,
      '-format', 'UDZO', '-ov', dmg,
    ], { stdio: 'inherit' });
    console.log(`Created ${dmg}`);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
