// Writing signals for the VoiceLab demo (web/projects/voicelab.html). Pure functions,
// no DOM and no network: the page computes everything in the visitor's browser, and
// tests/side-demos.test.js checks the numbers on known inputs.

// A sentence ends at . ! ? (plus closing quotes or brackets) followed by space, or at a blank line.
const SENTENCE_END = /(?<=[.!?…]["'”’)\]]*)\s+|\n\s*\n/;
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

// Common words left out of "most repeated": repeating them says little about a text.
export const STOPWORDS = new Set(('a an and are as at be been but by can did do does for from had has have he her his i if in into '
  + 'is it its me my no not of on or our she so than that the their them then there these they this to too up us was we were '
  + 'what when which who will with would you your').split(' '));

export const words = text => String(text).match(WORD) ?? [];

export function splitSentences(text) {
  return String(text).split(SENTENCE_END).map(part => part.trim()).filter(part => words(part).length > 0);
}

// Syllables are estimated with a common English heuristic: drop a silent final e/es/ed,
// then count groups of vowels. Words of three letters or fewer count as one.
export function syllables(word) {
  const w = String(word).toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|(?<=[^td])ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (trimmed.match(/[aeiouy]{1,2}/g) ?? []).length);
}

// Flesch reading ease (Flesch, 1948):
// 206.835 − 1.015 × (words ÷ sentences) − 84.6 × (syllables ÷ words).
export function flesch(wordCount, sentenceCount, syllableCount) {
  if (!wordCount || !sentenceCount) return null;
  return 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount);
}

// The usual reading of a Flesch score.
export function fleschBand(score) {
  if (score === null) return '';
  if (score >= 90) return 'very easy';
  if (score >= 80) return 'easy';
  if (score >= 70) return 'fairly easy';
  if (score >= 60) return 'plain English';
  if (score >= 50) return 'fairly difficult';
  if (score >= 30) return 'difficult';
  return 'very difficult';
}

export const LONG_WORD = 7; // letters

export function analyze(text) {
  const sentences = splitSentences(text).map(sentence => ({ text: sentence, words: words(sentence).length }));
  const all = words(text);
  const lower = all.map(word => word.toLowerCase().replace(/’/g, "'"));
  const wordCount = all.length;
  const sentenceCount = sentences.length;
  const syllableCount = all.reduce((sum, word) => sum + syllables(word), 0);
  const counts = new Map();
  for (const word of lower) if (!STOPWORDS.has(word) && /\p{L}/u.test(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
  const repeated = [...counts].filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));
  const score = flesch(wordCount, sentenceCount, syllableCount);
  return {
    sentences,
    wordCount,
    sentenceCount,
    syllableCount,
    distinct: new Set(lower).size,
    avgSentence: sentenceCount ? wordCount / sentenceCount : 0,
    variety: wordCount ? new Set(lower).size / wordCount : 0,
    longShare: wordCount ? all.filter(word => word.replace(/[^\p{L}]/gu, '').length >= LONG_WORD).length / wordCount : 0,
    flesch: score,
    band: fleschBand(score),
    repeated,
  };
}

// The strings the page shows, so the static fallback and the live view agree.
export function format(result) {
  return {
    avg: result.sentenceCount ? result.avgSentence.toFixed(1) : '0',
    variety: result.variety.toFixed(2),
    distinct: `${result.distinct} of ${result.wordCount} words are distinct`,
    long: `${Math.round(result.longShare * 100)}%`,
    flesch: result.flesch === null ? '–' : String(Math.round(result.flesch)),
    band: result.band,
    lengths: result.sentences.map(sentence => sentence.words).join(' · '),
  };
}
