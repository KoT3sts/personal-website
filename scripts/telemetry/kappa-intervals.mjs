// Bootstrap 95% intervals for the kappas quoted in "What my labels showed" on the agent
// observability page. Reads the published export and Cesar's labels, uses the page's own
// scoring and kappa code (web/lab/obs-eval.js), and resamples traces with replacement
// under a fixed seed, so every run prints the same numbers.
//
//   node scripts/telemetry/kappa-intervals.mjs          print the intervals
//   node scripts/telemetry/kappa-intervals.mjs --write  also write web/lab/data/agent-traces-kappa.json
//
// tests/agent-observability.test.js recomputes them and checks the JSON file and the page.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as E from '../../web/lab/obs-eval.js';

export const SEED = 20261112;
export const RESAMPLES = 5000;
export const SIZE_LINE = 40;

// mulberry32: a small, well-known 32-bit PRNG; enough for resampling indexes.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Nearest-rank percentile on sorted values, the method the page uses elsewhere.
const rank = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];

// Percentile bootstrap of Cohen's kappa over [human good, check pass] pairs. Resamples
// where kappa is undefined (one side constant) are skipped and counted.
export function bootstrap(pairs, { seed = SEED, resamples = RESAMPLES } = {}) {
  const next = rng(seed);
  const values = [];
  let undefinedKappa = 0;
  for (let i = 0; i < resamples; i++) {
    const sample = Array.from({ length: pairs.length }, () => pairs[Math.floor(next() * pairs.length)]);
    const k = E.kappa(E.confusion(sample));
    if (k === null) undefinedKappa += 1;
    else values.push(k);
  }
  values.sort((a, b) => a - b);
  return { lo: rank(values, 2.5), hi: rank(values, 97.5), undefinedKappa };
}

// The three comparisons the page quotes, as [good, pass] pairs, one per trace.
export function comparisons(data, labels) {
  const scoring = E.rescore(data.evaluators, data.evaluations, E.gateDefaults(data.evaluators));
  const good = id => labels[id] === 'good';
  const labelled = data.traces.filter(t => t.id in labels);
  const required = id => [...(scoring.labels.get(id) || [])].filter(([c]) => scoring.required.has(c));
  const large = labelled.filter(t => t.toolCalls >= SIZE_LINE);
  return [
    { id: 'all', name: 'All required checks pass', pairs: labelled.filter(t => required(t.id).length).map(t => [good(t.id), !required(t.id).some(([, l]) => l === 'fail')]) },
    { id: 'size', name: `Under ${SIZE_LINE} tool calls`, pairs: labelled.map(t => [good(t.id), t.toolCalls < SIZE_LINE]) },
    { id: 'recovery_long', name: `Recovered after error, runs of ${SIZE_LINE}+ calls`, pairs: large.filter(t => scoring.labels.get(t.id)?.has('recovered_after_error')).map(t => [good(t.id), scoring.labels.get(t.id).get('recovered_after_error') === 'pass']) },
  ];
}

const round = v => Math.round(v * 100) / 100;
export function intervals(data, labels, options = {}) {
  return {
    method: 'Percentile bootstrap: traces resampled with replacement, kappa recomputed each time, 2.5th and 97.5th percentiles (nearest rank).',
    seed: options.seed ?? SEED,
    resamples: options.resamples ?? RESAMPLES,
    dataset: data.meta.dataset,
    rows: comparisons(data, labels).map(({ id, name, pairs }) => {
      const { lo, hi, undefinedKappa } = bootstrap(pairs, options);
      return { id, name, n: pairs.length, kappa: round(E.kappa(E.confusion(pairs))), lo: round(lo), hi: round(hi), undefinedKappa };
    }),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const at = path => new URL(`../../web/lab/data/${path}`, import.meta.url);
  const data = JSON.parse(readFileSync(at('agent-traces.json'), 'utf8'));
  const labels = JSON.parse(readFileSync(at('human-labels.json'), 'utf8')).labels;
  const out = intervals(data, labels);
  for (const r of out.rows) console.log(`${r.name.padEnd(46)} n=${String(r.n).padStart(2)}  kappa ${r.kappa.toFixed(2)}  [${r.lo.toFixed(2)}, ${r.hi.toFixed(2)}]`);
  if (process.argv.includes('--write')) {
    writeFileSync(at('agent-traces-kappa.json'), `${JSON.stringify(out, null, 2)}\n`);
    console.log('wrote web/lab/data/agent-traces-kappa.json');
  }
}
