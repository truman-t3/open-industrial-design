// SPDX-License-Identifier: MPL-2.0
const fs = require('node:fs');
const path = require('node:path');

function assetPath(root, address, method = 'GET') {
  const url = new URL(address);
  if (method !== 'GET' || url.protocol !== 'oid:' || url.host !== 'workspace')
    throw new Error('Unsupported request');
  const name = decodeURIComponent(url.pathname);
  if (name.includes('\\') || name.includes('\0')) throw new Error('Invalid path');
  const base = fs.realpathSync(root);
  const file = fs.realpathSync(path.resolve(base, '.' + (name === '/' ? '/index.html' : name)));
  if (!file.startsWith(base + path.sep) || !fs.statSync(file).isFile())
    throw new Error('Asset outside application');
  return file;
}

function prepareDataDirectory(directory) {
  if (!path.isAbsolute(directory) || path.parse(directory).root === path.resolve(directory))
    throw new Error('Choose a dedicated absolute data directory, not a disk root');
  let current = path.resolve(directory);
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error('Linked data directories are not supported');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  fs.mkdirSync(directory, { recursive: true });
  const marker = path.join(directory, '.oid-desktop-data');
  if (fs.existsSync(marker)) {
    if (
      fs.lstatSync(marker).isSymbolicLink() ||
      fs.readFileSync(marker, 'utf8') !== 'Open Industrial Design desktop data v1\n'
    )
      throw new Error('Unrecognized desktop data directory');
  } else {
    if (fs.readdirSync(directory).length) throw new Error('Choose an empty data directory');
    fs.writeFileSync(marker, 'Open Industrial Design desktop data v1\n', { flag: 'wx' });
  }
  // Never silently fall back to AppData when the selected folder is not writable.
  const probe = path.join(directory, `.write-check-${process.pid}`);
  fs.writeFileSync(probe, '', { flag: 'wx' });
  fs.unlinkSync(probe);
  for (const name of ['profile', 'cache', 'logs', 'crashes']) {
    const target = path.join(directory, name);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
      throw new Error('Linked data subdirectories are not supported');
    fs.mkdirSync(target, { recursive: true });
  }
  return directory;
}

module.exports = { assetPath, prepareDataDirectory };
