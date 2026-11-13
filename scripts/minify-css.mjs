// Conservative, dependency-free CSS minifier used by scripts/build.mjs.
//
// It only removes comments and whitespace that cannot change meaning:
//   * strings, url(...) bodies and backslash escapes are copied verbatim;
//   * comments become whitespace (so "a/**/b" never fuses into "ab");
//   * whitespace runs collapse to one space, and that space is dropped only
//     next to { } ; , > or after "(" / before ")" / after ":".
// Spaces around + and - (calc(), selectors) are always kept, as is the
// space before "(" ("and (min-width)" must not become the function "and(")
// and before ":" (descendant pseudo selectors such as "a :hover").
// Declarations ending a block lose their final ";" except after an empty
// custom property value.

const DROP_AROUND = new Set(['{', '}', ';', ',', '>']);
// CSS whitespace only: U+00A0 and other Unicode spaces are ordinary code points in CSS.
const SPACE = /[ \t\n\r\f]/;

export function minifyCss(source) {
  let out = '';
  let pendingSpace = false;
  let i = 0;
  const n = source.length;

  const flushSpace = (next) => {
    if (!pendingSpace) return;
    pendingSpace = false;
    const prev = out[out.length - 1];
    if (prev === undefined) return;
    // Keep "--x: ;" / "--x: }": older engines reject a custom property with no value tokens.
    if (prev === ':' && (next === ';' || next === '}' || next === '!')) { out += ' '; return; }
    if (DROP_AROUND.has(prev) || DROP_AROUND.has(next)) return;
    if (prev === '(' || next === ')') return;
    if (prev === ':') return; // "a: b" -> "a:b"; the space before ":" is never touched.
    out += ' ';
  };

  while (i < n) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      if (source[i + 2] === '!') { flushSpace('/'); out += source.slice(i, stop); } // keep /*! licence */ comments
      // A comment is not whitespace: `.a/**/.b` is one compound selector. Drop it,
      // but keep an empty comment where removing it would join two tokens.
      else if (!pendingSpace && /[\w-]$/.test(out) && /[\w-]/.test(source[stop] ?? '')) out += '/**/';
      i = stop;
      continue;
    }
    if (SPACE.test(ch)) { pendingSpace = true; i++; continue; }
    if (ch === '"' || ch === "'") {
      flushSpace(ch);
      let j = i + 1;
      while (j < n && source[j] !== ch) { if (source[j] === '\n') break; if (source[j] === '\\') j++; j++; }
      out += source.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === '\\') {
      flushSpace(ch);
      // Hex escapes may consume one following whitespace character, which is significant.
      const hex = source.slice(i + 1).match(/^[0-9a-fA-F]{1,6}(\r\n|[ \t\n\r\f])?/);
      const take = hex ? 1 + hex[0].length : 2;
      out += source.slice(i, i + take);
      i += take;
      continue;
    }
    if ((ch === 'u' || ch === 'U') && /^url\(/i.test(source.slice(i, i + 4)) && (pendingSpace || !/[\w-]$/.test(out))) {
      flushSpace(ch);
      // Unquoted url() bodies are copied untouched; quoted ones fall through to the string branch.
      const rest = source.slice(i + 4);
      const lead = rest.match(/^[ \t\n\r\f]*/)[0];
      if (rest[lead.length] === '"' || rest[lead.length] === "'") { out += 'url('; i += 4 + lead.length; continue; }
      const close = source.indexOf(')', i + 4);
      const stop = close === -1 ? n : close + 1;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    flushSpace(ch);
    if (ch === '}' && out.endsWith(';') && !out.endsWith(':;') && !out.endsWith('\\;')) out = out.slice(0, -1);
    out += ch;
    i++;
  }
  return out;
}

/** Characters outside strings/comments, ignoring all whitespace — used to sanity-check output. */
export function cssSignature(source) {
  let sig = '';
  for (let i = 0; i < source.length;) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); i = end === -1 ? source.length : end + 2; continue; }
    if (ch === '"' || ch === "'") { let j = i + 1; while (j < source.length && source[j] !== ch) { if (source[j] === '\\') j++; j++; } sig += source.slice(i, j + 1); i = j + 1; continue; }
    if (!SPACE.test(ch)) sig += ch;
    i++;
  }
  return sig.replace(/;}/g, '}');
}
