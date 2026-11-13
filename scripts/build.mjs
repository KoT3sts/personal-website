import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bundleCss } from './bundle-css.mjs';

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

// CSS only: JS stays unminified (no parser available) and HTML is shipped as authored,
// except that each page's stylesheet links become one link to its bundle (bundle-css.mjs).
const css = await bundleCss(output, { log: (line) => console.log(line) });
const cssBefore = css.cssBefore;
const cssAfter = css.cssAfter;
for (const bundle of css.bundles) {
  const gzip = gzipSync(await readFile(bundle.file), { level: 9 }).length;
  const pages = css.pages.filter((page) => page.bundle === bundle.name).map((page) => page.page);
  console.log(`  bundle ${bundle.name.padEnd(30)} ${bundle.sheets} files -> 1, ${String(bundle.bytes).padStart(7)} B (gzip ${gzip} B): ${pages.join(', ')}`);
}

const built = await files(output);
const sizeAfter = (await Promise.all(built.map((file) => stat(file)))).reduce((sum, info) => sum + info.size, 0);
const gzipTotal = (await Promise.all(built.map((file) => readFile(file)))).reduce((sum, body) => sum + gzipSync(body, { level: 9 }).length, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(`  CSS ${kb(cssBefore)} -> ${kb(cssAfter)} (-${kb(cssBefore - cssAfter)})`);
console.log(`  dist/ ${all.length} -> ${built.length} files ${kb(sizeBefore)} -> ${kb(sizeAfter)} (gzip -9 total ${kb(gzipTotal)})`);
console.log('Built static portfolio in dist/');
