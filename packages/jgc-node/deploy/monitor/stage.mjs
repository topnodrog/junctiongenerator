import { mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = resolve(root, process.argv[2] ?? '.tmp/monitor-build');
if (!target.startsWith(resolve(root, '.tmp') + sep) || existsSync(target)) throw new Error('Use a new staging directory inside package .tmp');
const paths = ['package.json', 'package-lock.json', ...['package.json', 'package-lock.json', 'server.mjs', 'review.mjs', 'Dockerfile', 'cloudbuild.yaml'].map(p => `deploy/monitor/${p}`)];
function walk(dir) {
  for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not permitted');
    if (entry.isDirectory() && entry.name !== 'tests') walk(path);
    else if (entry.isFile() && /\.(js|json)$/.test(entry.name)) paths.push(path);
  }
}
walk('dist');
const manifest = [];
for (const path of paths.sort()) {
  const to = resolve(target, path);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(resolve(root, path), to);
  manifest.push({ path, sha256: createHash('sha256').update(readFileSync(to)).digest('hex') });
}
writeFileSync(resolve(target, 'BUILD-MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Staged ${manifest.length} allowlisted build files in ${relative(root, target)}`);
