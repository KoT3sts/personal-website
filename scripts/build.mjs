import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cssSignature, minifyCss } from './minify-css.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
if (path.dirname(output) !== path.resolve(root)) throw new Error('Invalid build destination.');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'web'), output, { recursive: true });

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  }));
  return nested.flat();
}

const all = await files(output);
const sizeBefore = (await Promise.all(all.map((file) => stat(file)))).reduce((sum, info) => sum + info.size, 0);

// CSS only: JS stays unminified (no parser available) and HTML is shipped as authored.
let cssBefore = 0;
let cssAfter = 0;
for (const file of all.filter((name) => name.endsWith('.css')).sort()) {
  const source = await readFile(file, 'utf8');
  let result = minifyCss(source);
  if (cssSignature(result) !== cssSignature(source)) {
    console.warn(`  ! ${path.relative(output, file)}: minified output failed the token check; kept original`);
    result = source;
  }
  await writeFile(file, result);
  const before = Buffer.byteLength(source);
  const after = Buffer.byteLength(result);
  cssBefore += before;
  cssAfter += after;
  console.log(`  ${path.relative(output, file).padEnd(18)} ${String(before).padStart(7)} -> ${String(after).padStart(7)} B`);
}

const sizeAfter = (await Promise.all(all.map((file) => stat(file)))).reduce((sum, info) => sum + info.size, 0);
const gzipTotal = (await Promise.all(all.map((file) => readFile(file)))).reduce((sum, body) => sum + gzipSync(body, { level: 9 }).length, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(`  CSS ${kb(cssBefore)} -> ${kb(cssAfter)} (-${kb(cssBefore - cssAfter)})`);
console.log(`  dist/ ${all.length} files ${kb(sizeBefore)} -> ${kb(sizeAfter)} (gzip -9 total ${kb(gzipTotal)})`);
console.log('Built static portfolio in dist/');
