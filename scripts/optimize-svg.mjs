// Dependency-free SVG optimizer for the site's generated artwork.
//
//   node scripts/optimize-svg.mjs <file.svg> [--out <path>] [--precision <n>] [--simplify <units>] [--no-hoist]
//
// Rewrites the file in place unless --out is given. It is deliberately
// conservative and only understands the plain SVG markup this project
// authors (no <text> reflow, no scripts):
//   * drops comments, XML/DOCTYPE prologues, <metadata>, editor namespaces
//     (inkscape/sodipodi/sketch/serif) and unreferenced ids;
//   * collapses whitespace between tags (never inside <text>, <style>, etc.);
//   * rewrites path data compactly. Coordinates are rounded to --precision
//     decimals (default 1) against the *absolute* position, so relative
//     segments never accumulate rounding drift;
//   * optionally (--simplify, default off) drops polyline vertices that lie
//     within the given distance of the simplified line (Douglas-Peucker);
//   * formats other numeric attributes losslessly (0.50 -> .5);
//   * moves frequently repeated stroke/fill colours, stroke widths and
//     opacities into one-rule <style> classes when that saves bytes. Paint
//     order and element structure are untouched.
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const EDITOR_PREFIX = /^(inkscape|sodipodi|sketch|serif|xmlns:(inkscape|sodipodi|sketch|serif|dc|cc|rdf))(:|$)/;
const RAW_TEXT = new Set(['text', 'tspan', 'textPath', 'style', 'script', 'title', 'desc']);
const NUMERIC_ATTRS = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'width', 'height',
  'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'stop-opacity', 'offset', 'stroke-miterlimit']);
const HOIST_ATTRS = {
  stroke: /^#[0-9a-f]{3,8}$/i,
  fill: /^#[0-9a-f]{3,8}$/i,
  'stroke-width': /^(?:\d+\.?\d*|\.\d+)$/,
  opacity: /^(?:\d+\.?\d*|\.\d+)$/,
};
const HOIST_MIN_USES = 4;

/** Shortest decimal string for a finite number (drops leading/trailing zeros, "-0"). */
export function formatNumber(value, precision = null) {
  let n = precision === null ? value : Number(value.toFixed(precision));
  if (Object.is(n, -0) || Math.abs(n) < 1e-12) n = 0;
  let text = String(n);
  if (/e/i.test(text)) text = n.toFixed(precision ?? 6).replace(/\.?0+$/, '');
  return text.replace(/^(-?)0\./, '$1.');
}

function appendNumbers(prefix, parts) {
  let out = prefix;
  for (const part of parts) {
    if (out && /[\d.]$/.test(out) && !part.startsWith('-')) {
      // ".5" after a number that already has a dot needs no separator ("1.2.5" = 1.2, .5).
      const last = out.match(/[\d.]+$/)[0];
      if (!(part.startsWith('.') && last.includes('.'))) out += ' ';
    }
    out += part;
  }
  return out;
}

const ARG_COUNT = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** Compact path data. Throws on syntax it does not understand so callers keep the original. */
export function optimizePath(d, precision = 1) {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const stripped = d.replace(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[\s,]/g, '');
  if (stripped) throw new Error(`Unsupported path data near "${stripped.slice(0, 20)}"`);
  const round = (n) => Number(n.toFixed(precision));
  let i = 0;
  let cx = 0, cy = 0;        // exact current point
  let rx = 0, ry = 0;        // rounded current point as emitted
  let sx = 0, sy = 0, srx = 0, sry = 0; // subpath start (exact, rounded)
  let out = '';
  let lastCmd = '';
  let command = '';
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    else if (!command) throw new Error('Path data must start with a command');
    const lower = command.toLowerCase();
    const relative = command === lower;
    const count = ARG_COUNT[lower];
    if (count === undefined) throw new Error(`Unknown path command ${command}`);
    if (lower === 'z') {
      if (lastCmd.toLowerCase() !== 'z') out += command;
      lastCmd = command;
      cx = sx; cy = sy; rx = srx; ry = sry;
      continue;
    }
    const args = tokens.slice(i, i + count).map(Number);
    if (args.length < count || args.some(Number.isNaN)) throw new Error(`Bad arguments for ${command}`);
    i += count;
    const parts = [];
    const point = (x, y) => {
      const ax = relative ? cx + x : x;
      const ay = relative ? cy + y : y;
      const px = round(ax), py = round(ay);
      parts.push(formatNumber(relative ? px - rx : px, precision), formatNumber(relative ? py - ry : py, precision));
      return [ax, ay, px, py];
    };
    let end;
    if (lower === 'h') {
      const ax = relative ? cx + args[0] : args[0];
      const px = round(ax);
      parts.push(formatNumber(relative ? px - rx : px, precision));
      end = [ax, cy, px, ry];
    } else if (lower === 'v') {
      const ay = relative ? cy + args[0] : args[0];
      const py = round(ay);
      parts.push(formatNumber(relative ? py - ry : py, precision));
      end = [cx, ay, rx, py];
    } else if (lower === 'a') {
      parts.push(formatNumber(args[0], precision), formatNumber(args[1], precision), formatNumber(args[2]),
        String(args[3] ? 1 : 0), String(args[4] ? 1 : 0));
      end = point(args[5], args[6]);
    } else {
      for (let k = 0; k < count; k += 2) end = point(args[k], args[k + 1]);
    }
    // Repeated commands can drop the letter; pairs after M/m are implicit L/l.
    // A second moveto must keep its letter (bare pairs after M/m mean lineto).
    const implicit = lower !== 'm' && (command === lastCmd || (lastCmd === 'M' && command === 'L') || (lastCmd === 'm' && command === 'l'));
    out = appendNumbers(implicit ? out : out + command, parts);
    if (lower === 'm') { sx = end[0]; sy = end[1]; srx = end[2]; sry = end[3]; }
    [cx, cy, rx, ry] = end;
    lastCmd = command;
  }
  return out;
}

// Douglas-Peucker on an array of [x, y]; keeps endpoints, drops vertices within tolerance.
function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const dx = bx - ax, dy = by - ay;
    const length = Math.hypot(dx, dy);
    let worst = -1, index = -1;
    for (let k = first + 1; k < last; k++) {
      const [px, py] = points[k];
      const distance = length ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / length : Math.hypot(px - ax, py - ay);
      if (distance > worst) { worst = distance; index = k; }
    }
    if (worst > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, k) => keep[k]);
}

/**
 * Simplify an open polyline path ("M x y" followed only by l/L segments) so no
 * dropped vertex lies more than `tolerance` user units from the new outline.
 * Any other path shape is returned unchanged.
 */
export function simplifyPolyline(d, tolerance) {
  if (!(tolerance > 0) || !/^\s*M[^a-zA-Z]*(?:[lL][^a-zA-Z]*)+$/.test(d)) return d;
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  const points = [];
  let command = '';
  let x = 0, y = 0;
  for (let i = 0; i < tokens.length;) {
    if (/[a-zA-Z]/.test(tokens[i])) { command = tokens[i++]; continue; }
    const a = Number(tokens[i++]), b = Number(tokens[i++]);
    if (Number.isNaN(b)) return d;
    if (command === 'M' || command === 'L') { x = a; y = b; } else { x += a; y += b; }
    points.push([x, y]);
    if (command === 'M') command = 'L';
  }
  const kept = douglasPeucker(points, tolerance);
  if (kept.length === points.length) return d;
  let out = `M${kept[0][0]} ${kept[0][1]}`;
  for (let k = 1; k < kept.length; k++) out += `l${kept[k][0] - kept[k - 1][0]} ${kept[k][1] - kept[k - 1][1]}`;
  return out;
}

function parseAttributes(source) {
  const attrs = [];
  const re = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(source))) attrs.push([m[1], m[3] ?? m[4]]);
  return attrs;
}

function tokenize(svg) {
  const nodes = [];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>[]*(\[[\s\S]*?\])?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>|[^<]+/g;
  let m;
  while ((m = re.exec(svg))) {
    const raw = m[0];
    if (raw.startsWith('<!--') || raw.startsWith('<?') || raw.startsWith('<!DOCTYPE')) continue;
    if (raw.startsWith('<![CDATA[')) nodes.push({ type: 'text', raw });
    else if (raw.startsWith('</')) nodes.push({ type: 'close', name: raw.slice(2, -1).trim() });
    else if (raw.startsWith('<')) {
      const selfClosing = raw.endsWith('/>');
      const inner = raw.slice(1, selfClosing ? -2 : -1);
      const name = inner.match(/^[^\s/>]+/)[0];
      nodes.push({ type: 'open', name, attrs: parseAttributes(inner.slice(name.length)), selfClosing });
    } else nodes.push({ type: 'text', raw });
  }
  return nodes;
}

const escapeAttr = (value) => value.replace(/&(?![a-zA-Z#][\w#]*;)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function optimizeSvg(svg, { precision = 1, hoist = true, simplify = 0 } = {}) {
  let nodes = tokenize(svg);

  // Drop editor-only elements (metadata and namedview subtrees).
  const kept = [];
  let skipDepth = 0;
  for (const node of nodes) {
    const dropName = (n) => n === 'metadata' || EDITOR_PREFIX.test(n);
    if (skipDepth) {
      if (node.type === 'open' && !node.selfClosing) skipDepth++;
      if (node.type === 'close') skipDepth--;
      continue;
    }
    if (node.type === 'open' && dropName(node.name)) { if (!node.selfClosing) skipDepth = 1; continue; }
    kept.push(node);
  }
  nodes = kept;

  // Whitespace-only text is insignificant outside text-bearing elements.
  const stack = [];
  nodes = nodes.filter((node) => {
    if (node.type === 'open' && !node.selfClosing) stack.push(node.name);
    if (node.type === 'close') stack.pop();
    if (node.type !== 'text') return true;
    if (stack.some((name) => RAW_TEXT.has(name))) return true;
    return node.raw.trim() !== '';
  });

  const allText = svg;
  const referenced = new Set([...allText.matchAll(/url\(\s*['"]?#([^)'"\s]+)/g), ...allText.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]));
  const usesStyle = nodes.some((n) => n.type === 'open' && n.name === 'style');

  for (const node of nodes) {
    if (node.type !== 'open') continue;
    node.attrs = node.attrs.filter(([name]) => !EDITOR_PREFIX.test(name));
    node.attrs = node.attrs.filter(([name, value]) => !(name === 'id' && !referenced.has(value) && !usesStyle && node.name !== 'svg'));
    node.attrs = node.attrs.map(([name, value]) => {
      if (name === 'd' && node.name === 'path') {
        try { return [name, optimizePath(simplifyPolyline(value, simplify), precision)]; } catch { return [name, value.trim().replace(/\s+/g, ' ')]; }
      }
      if (name === 'transform' || name === 'points' || name === 'viewBox') {
        return [name, value.trim().replace(/\s+/g, ' ').replace(/-?(?:\d+\.?\d*|\.\d+)/g, (n) => formatNumber(Number(n)))];
      }
      if (NUMERIC_ATTRS.has(name) && /^\s*-?(?:\d+\.?\d*|\.\d+)\s*$/.test(value)) {
        const geometric = !/opacity|offset|miterlimit/.test(name) && node.name !== 'svg';
        return [name, formatNumber(Number(value), geometric ? Math.max(precision, 1) : null)];
      }
      return [name, value];
    });
  }

  // Hoist repeated presentation attributes to one-rule classes when that
  // saves bytes. Only plain values are moved (colours, numbers); elements
  // keep their order, so paint order and compositing are unchanged.
  let styleText = '';
  if (hoist && !usesStyle && !nodes.some((n) => n.type === 'open' && n.attrs.some(([k]) => k === 'class' || k === 'style'))) {
    const counts = new Map();
    for (const node of nodes) {
      if (node.type !== 'open' || node.name === 'svg') continue;
      for (const [name, value] of node.attrs) {
        if (HOIST_ATTRS[name]?.test(value)) counts.set(`${name}:${value}`, (counts.get(`${name}:${value}`) || 0) + 1);
      }
    }
    const classes = new Map();
    const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const className = (index) => index < letters.length ? letters[index] : letters[Math.floor(index / letters.length) - 1] + letters[index % letters.length];
    const rule = (key, cls) => {
      const [prop, value] = key.split(/:(.*)/s);
      return `.${cls}{${prop}:${prop === 'stroke-width' ? `${value}px` : value}}`;
    };
    for (const [key, uses] of [...counts].sort((a, b) => b[1] - a[1])) {
      if (uses < HOIST_MIN_USES || classes.size >= letters.length * (letters.length + 1)) continue;
      const cls = className(classes.size);
      const [prop, value] = key.split(/:(.*)/s);
      const saved = uses * (` ${prop}="${value}"`.length - (cls.length + 1)) - rule(key, cls).length;
      if (saved > 0) classes.set(key, cls);
    }
    if (classes.size) {
      for (const node of nodes) {
        if (node.type !== 'open' || node.name === 'svg') continue;
        const tokens = [];
        node.attrs = node.attrs.filter(([name, value]) => {
          const cls = classes.get(`${name}:${value}`);
          if (cls) tokens.push(cls);
          return !cls;
        });
        if (tokens.length) node.attrs.push(['class', tokens.join(' ')]);
      }
      styleText = [...classes].map(([key, cls]) => rule(key, cls)).join('');
    }
  }

  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') out += node.raw;
    else if (node.type === 'close') out += `</${node.name}>`;
    else {
      out += `<${node.name}${node.attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('')}${node.selfClosing ? '/>' : '>'}`;
      if (node.name === 'svg' && styleText) { out += `<style>${styleText}</style>`; styleText = ''; }
    }
  }
  return `${out}\n`;
}

async function main(argv) {
  const args = [...argv];
  const file = args.find((a, idx) => !a.startsWith('--') && !['--out', '--precision', '--simplify'].includes(args[idx - 1]));
  if (!file) {
    console.error('Usage: node scripts/optimize-svg.mjs <file.svg> [--out <path>] [--precision <n>] [--simplify <units>] [--no-hoist]');
    process.exit(2);
  }
  const option = (flag) => { const idx = args.indexOf(flag); return idx >= 0 ? args[idx + 1] : undefined; };
  const precision = Number(option('--precision') ?? 1);
  if (!Number.isInteger(precision) || precision < 0 || precision > 6) throw new Error('--precision must be 0-6');
  const simplify = Number(option('--simplify') ?? 0);
  if (!(simplify >= 0 && simplify <= 2)) throw new Error('--simplify must be 0-2 user units');
  const out = option('--out') ?? file;
  const source = await readFile(file, 'utf8');
  const result = optimizeSvg(source, { precision, simplify, hoist: !args.includes('--no-hoist') });
  await writeFile(out, result);
  const size = (s) => `${Buffer.byteLength(s)} B (gzip ${gzipSync(s, { level: 9 }).length} B)`;
  console.log(`${file}: ${size(source)} -> ${out}: ${size(result)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main(process.argv.slice(2));
}
