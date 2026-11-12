// Build step (scripts/build.mjs): minify every stylesheet in the output folder, then
// give each HTML page one stylesheet. The page's same-origin <link rel="stylesheet">
// files are joined in document order (the order the cascade and @layer declarations
// already follow), url()s are rewritten for the bundle's folder, and the links are
// replaced by one link to a content-hashed file at the output root (home.<hash>.css
// for index.html, otherwise named after the page's last stylesheet). Pages that list
// the same stylesheets share a bundle. Source files in web/ are never touched.
import { createHash } from 'node:crypto';
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { cssSignature, minifyCss } from './minify-css.mjs';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  }));
  return nested.flat();
}

const toPosix = (p) => p.split(path.sep).join('/');
const LINK = /<link\b[^>]*>/gi;
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1];
const isRemote = (href) => /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href);
// url() targets that need no rewriting: data/remote URLs, fragments and root-absolute paths.
const KEEP_URL = /^(?:[a-z][a-z\d+.-]*:|\/|#)/i;
const URL_TOKEN = /(^|[^\w-])url\(([ \t\n\r\f]*)(?:"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|([^"'()\s]+))([ \t\n\r\f]*)\)/gi;

/** Rewrites relative url()s in `css` (from `fromDir`) so they resolve from `toDir`. */
export function rebaseUrls(css, fromDir, toDir) {
  return css.replace(URL_TOKEN, (match, lead, pre, dq, sq, bare, post) => {
    const value = dq ?? sq ?? bare;
    if (KEEP_URL.test(value) || value === '') return match;
    const [, file, suffix] = value.match(/^([^?#]*)(.*)$/);
    let next = toPosix(path.relative(toDir, path.resolve(fromDir, file)));
    if (!next.startsWith('.')) next = `./${next}`;
    next += suffix;
    const quote = dq !== undefined ? '"' : sq !== undefined ? "'" : '';
    return `${lead}url(${pre}${quote}${next}${quote}${post})`;
  });
}

/** Every relative url() target in `css`, as written. */
export function relativeUrls(css) {
  return [...css.matchAll(URL_TOKEN)].map((m) => m[3] ?? m[4] ?? m[5]).filter((value) => value && !KEEP_URL.test(value));
}

const CHARSET = /^@charset "[^"]*";/i;

/** Joins already-minified stylesheets (in order) into one, rebased to `bundleDir`. */
export function joinStylesheets(sheets, bundleDir) {
  let charset = '';
  const parts = sheets.map(({ file, css }) => {
    if (/@import\b/i.test(css)) throw new Error(`${file}: @import cannot be bundled in order; inline it first.`);
    const head = css.match(CHARSET)?.[0];
    if (head) charset ||= head;
    if (/@charset\b/i.test(css.replace(CHARSET, ''))) throw new Error(`${file}: @charset must be the first rule.`);
    return rebaseUrls(css.replace(CHARSET, ''), path.dirname(file), bundleDir);
  });
  // A stylesheet ends at a complete rule, so plain concatenation keeps every rule intact.
  return charset + parts.join('');
}

/**
 * Minifies every .css file under `output` (keeping the original when the token check
 * fails) and bundles each page's stylesheets. Returns a summary for the build log.
 */
export async function bundleCss(output, { log = () => {} } = {}) {
  const all = await walk(output);
  const minified = new Map();
  let cssBefore = 0;
  let cssAfter = 0;
  for (const file of all.filter((name) => name.endsWith('.css')).sort()) {
    const source = await readFile(file, 'utf8');
    let result = minifyCss(source);
    if (cssSignature(result) !== cssSignature(source)) {
      log(`  ! ${toPosix(path.relative(output, file))}: minified output failed the token check; kept original`);
      result = source;
    }
    await writeFile(file, result);
    minified.set(file, result);
    cssBefore += Buffer.byteLength(source);
    cssAfter += Buffer.byteLength(result);
    log(`  ${toPosix(path.relative(output, file)).padEnd(26)} ${String(Buffer.byteLength(source)).padStart(7)} -> ${String(Buffer.byteLength(result)).padStart(7)} B`);
  }

  const bundles = new Map(); // key (joined sheet paths) -> { name, file, bytes, sheets }
  const usedNames = new Map();
  const bundled = new Set();
  const pages = [];
  for (const page of all.filter((name) => name.endsWith('.html')).sort()) {
    const html = await readFile(page, 'utf8');
    const links = [...html.matchAll(LINK)].filter(([tag]) => /\srel="stylesheet"/i.test(tag));
    const local = links.filter(([tag]) => !isRemote(attr(tag, 'href') ?? ''));
    if (!local.length) continue;
    for (const [tag] of local) {
      const extra = [...tag.matchAll(/\s([\w-]+)=/g)].map((m) => m[1].toLowerCase()).filter((name) => name !== 'rel' && name !== 'href');
      if (extra.length) throw new Error(`${toPosix(path.relative(output, page))}: cannot bundle ${tag} (${extra.join(', ')})`);
    }
    const hrefs = local.map(([tag]) => attr(tag, 'href'));
    const rootAbsolute = hrefs[0].startsWith('/');
    const files = hrefs.map((href) => (href.startsWith('/') ? path.join(output, href) : path.resolve(path.dirname(page), href)).replace(/[?#].*$/, ''));
    for (const file of files) if (!minified.has(file)) throw new Error(`${toPosix(path.relative(output, page))}: missing stylesheet ${toPosix(path.relative(output, file))}`);
    const key = files.map((file) => toPosix(path.relative(output, file))).join('|');
    let bundle = bundles.get(key);
    if (!bundle) {
      const css = joinStylesheets(files.map((file) => ({ file, css: minified.get(file) })), output);
      const hash = createHash('sha256').update(css).digest('hex').slice(0, 10);
      let name = path.basename(page) === 'index.html' && path.dirname(page) === output ? 'home' : path.basename(files.at(-1), '.css');
      if (usedNames.has(name)) name = `${name}-${usedNames.size + 1}`;
      usedNames.set(name, key);
      const file = path.join(output, `${name}.${hash}.css`);
      await writeFile(file, css);
      const raw = files.reduce((sum, sheet) => sum + Buffer.byteLength(minified.get(sheet)), 0);
      bundle = { name: path.basename(file), file, bytes: Buffer.byteLength(css), raw, sheets: files.length };
      bundles.set(key, bundle);
    }
    files.forEach((file) => bundled.add(file));
    const href = rootAbsolute ? `/${bundle.name}` : (() => { const rel = toPosix(path.relative(path.dirname(page), bundle.file)); return rel.startsWith('.') ? rel : `./${rel}`; })();
    // The first link becomes the bundle (keeping its place in <head>); the rest go, with their line.
    let first = true;
    const next = html.replace(LINK, (tag) => {
      if (!local.some(([own]) => own === tag) || !/\srel="stylesheet"/i.test(tag)) return tag;
      if (first) { first = false; return `<link rel="stylesheet" href="${href}">`; }
      return '\u0000';
    }).replace(/\n[ \t]*\u0000(?=\n)/g, '').replace(/\u0000/g, '');
    await writeFile(page, next);
    pages.push({ page: toPosix(path.relative(output, page)), before: files.length, bundle: bundle.name });
  }

  // The bundled originals are no longer linked from any page.
  for (const file of bundled) await rm(file);
  return { cssBefore, cssAfter, bundles: [...bundles.values()], pages };
}
