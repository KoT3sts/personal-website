#!/usr/bin/env python3
"""Build the sentiment evaluation lab data (web/lab/data/sentiment-eval.json).

A public, reproducible experiment: two small sentiment classifiers trained on the
UCI "Sentiment Labelled Sentences" dataset (Kotzias et al., KDD 2015, CC BY 4.0).
It is not the Companionship Chatbot's model or data.

    python3 scripts/eval/build_sentiment_eval.py            # download or reuse the cache
    python3 scripts/eval/build_sentiment_eval.py --zip PATH # use a local copy of the zip

Python 3 standard library only. Deterministic: the same seed gives byte-identical output.
The raw zip is cached outside the repository ($TMPDIR/sentiment-eval/) and never committed.
The script also rewrites the generated blocks of web/lab/sentiment-eval.html (the evidence
strip, the no-JS reference tables, the failure examples and the method numbers) between
<!-- generated:NAME --> and <!-- /generated:NAME --> markers.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import math
import os
import random
import re
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_JSON = ROOT / 'web' / 'lab' / 'data' / 'sentiment-eval.json'
PAGE = ROOT / 'web' / 'lab' / 'sentiment-eval.html'

URL = 'https://archive.ics.uci.edu/static/public/331/sentiment+labelled+sentences.zip'
ZIP_SHA256 = 'afc26626d710899948693e1a61405dce197f57ffa719fa1130d346b4cc095343'
SEED = 331  # the dataset's UCI id
SOURCES = (('amazon', 'Amazon', 'amazon_cells_labelled.txt'),
           ('yelp', 'Yelp', 'yelp_labelled.txt'),
           ('imdb', 'IMDb', 'imdb_labelled.txt'))
SPLIT = (('train', 0.7), ('validation', 0.1), ('test', 0.2))
NB_ALPHA = 1.0
LR_LAMBDAS = (1e-6, 3e-6, 1e-5, 3e-5, 1e-4, 3e-4, 1e-3)
LR_ITERATIONS = 1000
BIGRAM_MIN_COUNT = 2
BOOTSTRAP_RESAMPLES = 1000
THRESHOLD = 0.5

# Some IMDb lines carry Windows-1252 punctuation stored as C1 control characters.
C1 = {'\x85': '...', '\x91': "'", '\x92': "'", '\x93': '"', '\x94': '"', '\x96': '-', '\x97': '--'}
TOKEN = re.compile(r"[a-z0-9]+(?=n't)|n't|[a-z0-9]+(?:'[a-z]+)?|[.,;:!?]")
SCOPE_END = frozenset('.,;:!?')
DROP = frozenset('.,;:')  # sentence punctuation is not a feature; ! and ? are
NEGATIONS = frozenset("""not no never n't cannot nothing nobody none nor neither without hardly
dont doesnt didnt isnt wasnt arent werent cant couldnt wouldnt shouldnt wont havent hasnt hadnt aint""".split())


# ---------------------------------------------------------------- data

def load_zip(path: str | None) -> bytes:
    if path:
        data = Path(path).read_bytes()
    else:
        cache = Path(os.environ.get('TMPDIR') or tempfile.gettempdir()) / 'sentiment-eval' / 'sentiment.zip'
        if cache.exists():
            data = cache.read_bytes()
        else:
            print(f'Downloading {URL}', file=sys.stderr)
            with urllib.request.urlopen(URL, timeout=60) as response:
                data = response.read()
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    if digest != ZIP_SHA256:
        raise SystemExit(f'Unexpected zip SHA-256 {digest}; expected {ZIP_SHA256}. The upstream file changed.')
    return data


def clean(text: str) -> str:
    for bad, good in C1.items():
        text = text.replace(bad, good)
    return ' '.join(text.split())


def read_rows(data: bytes) -> list[dict]:
    rows = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for key, _, name in SOURCES:
            text = archive.read(f'sentiment labelled sentences/{name}').decode('utf-8')
            # Split on newlines only: str.splitlines() would also break on U+0085.
            for line in text.split('\n'):
                if not line.strip():
                    continue
                sentence, label = line.rsplit('\t', 1)
                rows.append({'text': clean(sentence), 'source': key, 'label': int(label)})
    return rows


def dedupe(rows: list[dict]) -> tuple[list[dict], int]:
    """Drop exact repeats (case and spacing ignored) so no sentence can sit in two splits."""
    seen, kept = set(), []
    for row in rows:
        key = row['text'].lower()
        if key not in seen:
            seen.add(key)
            kept.append(row)
    return kept, len(rows) - len(kept)


def split(rows: list[dict], seed: int) -> dict[str, list[dict]]:
    """Seeded split, stratified by source and label (70/10/20 within each of the six groups)."""
    rng = random.Random(seed)
    parts = {name: [] for name, _ in SPLIT}
    for key, _, _ in SOURCES:
        for label in (0, 1):
            group = [row for row in rows if row['source'] == key and row['label'] == label]
            rng.shuffle(group)
            n_test = round(len(group) * SPLIT[2][1])
            n_val = round(len(group) * SPLIT[1][1])
            parts['test'] += group[:n_test]
            parts['validation'] += group[n_test:n_test + n_val]
            parts['train'] += group[n_test + n_val:]
    return parts


# ---------------------------------------------------------------- features

def tokenize(text: str) -> list[str]:
    return TOKEN.findall(text.lower().replace('\u2019', "'").replace('`', "'"))


def words(tokens: list[str]) -> list[str]:
    return [token for token in tokens if token not in DROP]


def negation_scope(tokens: list[str]) -> list[str]:
    """Words after a negation, up to the next punctuation mark, prefixed with not_."""
    out, active = [], False
    for token in tokens:
        if token in SCOPE_END:
            active = False
        elif token in NEGATIONS:
            active = True
        elif active:
            out.append('not_' + token)
    return out


def features_b(tokens: list[str]) -> set[str]:
    ws = words(tokens)
    feats = set(ws)
    feats.update(f'{a} {b}' for a, b in zip(ws, ws[1:]))
    feats.update(negation_scope(tokens))
    return feats


# ---------------------------------------------------------------- model A: multinomial Naive Bayes

class NaiveBayes:
    def __init__(self, alpha: float):
        self.alpha = alpha

    def fit(self, docs: list[list[str]], labels: list[int]) -> 'NaiveBayes':
        counts = [{}, {}]
        for doc, label in zip(docs, labels):
            for word in doc:
                counts[label][word] = counts[label].get(word, 0) + 1
        self.vocab = sorted(set(counts[0]) | set(counts[1]))
        totals = [sum(c.values()) for c in counts]
        size = len(self.vocab)
        self.log_ratio = {}
        for word in self.vocab:
            p1 = (counts[1].get(word, 0) + self.alpha) / (totals[1] + self.alpha * size)
            p0 = (counts[0].get(word, 0) + self.alpha) / (totals[0] + self.alpha * size)
            self.log_ratio[word] = math.log(p1) - math.log(p0)
        n1 = sum(labels)
        self.prior = math.log(n1) - math.log(len(labels) - n1)
        return self

    def proba(self, doc: list[str]) -> float:
        z = self.prior + sum(self.log_ratio.get(word, 0.0) for word in doc)
        return sigmoid(z)


# ---------------------------------------------------------------- model B: L2 logistic regression

def sigmoid(z: float) -> float:
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    e = math.exp(z)
    return e / (1.0 + e)


class Logistic:
    """Binary features, each row scaled to unit L2 norm, trained by full-batch gradient
    descent with Nesterov momentum on mean log loss + (lambda / 2) * ||w||^2 (bias unpenalised).
    The step is 1 / L, with L = 1/4 + lambda an upper bound on the loss's curvature for
    unit-norm rows, so every run is stable and deterministic."""

    def __init__(self, lam: float, iterations: int):
        self.lam, self.iterations = lam, iterations

    def vectorize(self, feats: set[str]) -> list[tuple[int, float]]:
        ids = sorted(self.index[f] for f in feats if f in self.index)
        if not ids:
            return []
        value = 1.0 / math.sqrt(len(ids))
        return [(i, value) for i in ids]

    def fit(self, rows: list[set[str]], labels: list[int], vocab: list[str]) -> 'Logistic':
        self.index = {f: i for i, f in enumerate(vocab)}
        xs = [self.vectorize(r) for r in rows]
        n, dim, lam = len(xs), len(vocab), self.lam
        step = 1.0 / (0.25 + lam)
        w, b = [0.0] * dim, 0.0
        w_prev, b_prev = w[:], b
        for t in range(1, self.iterations + 1):
            momentum = (t - 1) / (t + 2)
            v = [wi + momentum * (wi - wp) for wi, wp in zip(w, w_prev)]
            vb = b + momentum * (b - b_prev)
            grad = [lam * vi for vi in v]
            gb = 0.0
            for x, y in zip(xs, labels):
                z = vb
                for i, value in x:
                    z += v[i] * value
                r = (sigmoid(z) - y) / n
                gb += r
                for i, value in x:
                    grad[i] += r * value
            w_prev, b_prev = w, b
            w = [vi - step * gi for vi, gi in zip(v, grad)]
            b = vb - step * gb
        self.w, self.b = w, b
        return self

    def proba(self, feats: set[str]) -> float:
        z = self.b
        for i, value in self.vectorize(feats):
            z += self.w[i] * value
        return sigmoid(z)


def log_loss(probs: list[float], labels: list[int]) -> float:
    eps = 1e-12
    return -sum(math.log(max(p, eps)) if y else math.log(max(1 - p, eps)) for p, y in zip(probs, labels)) / len(labels)


# ---------------------------------------------------------------- metrics (mirrored by web/lab/metrics.js)

def confusion(probs: list[float], labels: list[int], threshold: float) -> dict[str, int]:
    tp = fp = tn = fn = 0
    for p, y in zip(probs, labels):
        if p >= threshold:
            tp, fp = (tp + 1, fp) if y == 1 else (tp, fp + 1)
        else:
            fn, tn = (fn + 1, tn) if y == 1 else (fn, tn + 1)
    return {'tp': tp, 'fp': fp, 'tn': tn, 'fn': fn}


def scores(c: dict[str, int]) -> dict[str, float]:
    tp, fp, tn, fn = c['tp'], c['fp'], c['tn'], c['fn']
    total = tp + fp + tn + fn
    return {
        'accuracy': (tp + tn) / total if total else 0.0,
        'precision': tp / (tp + fp) if tp + fp else 0.0,
        'recall': tp / (tp + fn) if tp + fn else 0.0,
        'f1': 2 * tp / (2 * tp + fp + fn) if tp + fp + fn else 0.0,
    }


def f1_of(probs, labels, threshold=THRESHOLD):
    return scores(confusion(probs, labels, threshold))['f1']


def bootstrap(pa, pb, labels, seed):
    rng = random.Random(seed)
    n = len(labels)
    fa, fb, diff = [], [], []
    for _ in range(BOOTSTRAP_RESAMPLES):
        idx = [rng.randrange(n) for _ in range(n)]
        ys = [labels[i] for i in idx]
        a = f1_of([pa[i] for i in idx], ys)
        b = f1_of([pb[i] for i in idx], ys)
        fa.append(a); fb.append(b); diff.append(b - a)
    lo, hi = int(0.025 * BOOTSTRAP_RESAMPLES), int(0.975 * BOOTSTRAP_RESAMPLES) - 1
    interval = lambda xs: [round(sorted(xs)[lo], 4), round(sorted(xs)[hi], 4)]
    better = sum(1 for d in diff if d > 0) / BOOTSTRAP_RESAMPLES
    return {'A': interval(fa), 'B': interval(fb), 'B_minus_A': interval(diff), 'share_B_better': round(better, 4)}


# ---------------------------------------------------------------- failure examples

def pick_failures(test: list[dict]) -> list[dict]:
    """Rule-based: confident shared errors, then errors only one model makes, then negations."""
    def wrong(p, y):
        return (p >= THRESHOLD) != (y == 1)

    def margin(p):
        return abs(p - 0.5)

    chosen, used = [], set()

    def take(candidates, key, count, reason):
        for row in sorted(candidates, key=key)[:count]:
            used.add(row['id'])
            chosen.append({**row, 'reason': reason})

    def pool(pred):
        return [r for r in test if r['id'] not in used and pred(r)]

    take(pool(lambda r: wrong(r['pA'], r['label']) and wrong(r['pB'], r['label'])),
         lambda r: (-(margin(r['pA']) + margin(r['pB'])), r['id']), 2, 'Both models wrong, both confident')
    take(pool(lambda r: wrong(r['pA'], r['label']) and not wrong(r['pB'], r['label']) and r['negated']),
         lambda r: (-margin(r['pA']), r['id']), 2, 'Negation: A wrong, B right')
    take(pool(lambda r: wrong(r['pB'], r['label']) and r['negated']),
         lambda r: (-margin(r['pB']), r['id']), 2, 'Negation: B still wrong')
    take(pool(lambda r: wrong(r['pB'], r['label']) and not wrong(r['pA'], r['label'])),
         lambda r: (-margin(r['pB']), r['id']), 1, 'Only B wrong')
    take(pool(lambda r: wrong(r['pA'], r['label']) and not wrong(r['pB'], r['label'])),
         lambda r: (-margin(r['pA']), r['id']), 1, 'Only A wrong')
    return chosen


# ---------------------------------------------------------------- output

def pct(x: float) -> str:
    return f'{x * 100:.1f}%'


def write_json(data: dict) -> str:
    """Two-space JSON, one test sentence per line (small and diff-friendly)."""
    items = data.pop('test')
    body = json.dumps(data, indent=2, ensure_ascii=False)
    lines = ',\n'.join('    ' + json.dumps(item, ensure_ascii=False, separators=(', ', ': ')) for item in items)
    text = body[:-2] + ',\n  "test": [\n' + lines + '\n  ]\n}\n'
    data['test'] = items
    json.loads(text)  # round-trip check
    return text


def e(text) -> str:
    return html.escape(str(text), quote=True)


def signed(x: float) -> str:
    return f'{x:+.3f}'.replace('-', '\u2212')


def generated_blocks(data: dict) -> dict[str, str]:
    """HTML for the page's generated blocks. Lines carry relative indentation only;
    update_page() adds the marker's own indentation."""
    ref, boot, meta = data['reference'], data['bootstrap_f1'], data['dataset']
    a, b = ref['A'], ref['B']
    best = 'B' if b['f1'] >= a['f1'] else 'A'
    other = 'A' if best == 'B' else 'B'
    gap = abs(b['f1'] - a['f1'])
    n_test = meta['counts']['test']['total']
    lo, hi = boot['B_minus_A']

    if lo > 0 or hi < 0:
        verdict = 'and the bootstrap interval for the gap stays clear of zero.'
    else:
        verdict = (f'but the bootstrap interval for the gap ({signed(lo)} to {signed(hi)}) crosses zero: '
                   f'on {n_test} sentences that is not a reliable win.')
    strip = [
        f'<div><dt class="mono">Test sentences</dt><dd>{n_test:,}</dd></div>',
        f'<div><dt class="mono">Best F1</dt><dd>{ref[best]["f1"]:.3f} <span class="lab-unit">model {best}</span></dd></div>',
        f'<div><dt class="mono">F1 gap, B minus A</dt><dd>{signed(b["f1"] - a["f1"])}</dd></div>',
        f'<div class="lab-strip-take"><dt class="mono">Takeaway</dt><dd>Model {best} {"edges" if gap < 0.02 else "beats"} '
        f'model {other} by {gap * 100:.1f} F1 points at the default threshold, {verdict}</dd></div>',
    ]

    metric_rows = [f'      <tr><th scope="row">{label}</th><td>{a[key]:.3f}</td><td>{b[key]:.3f}</td></tr>'
                   for key, label in (('precision', 'Precision'), ('recall', 'Recall'), ('f1', 'F1'), ('accuracy', 'Accuracy'))]
    slice_rows = [f'      <tr><th scope="row">{e(s["name"])}</th><td>{ref["slices"]["A"][s["id"]]["accuracy"]:.3f}</td>'
                  f'<td>{ref["slices"]["B"][s["id"]]["accuracy"]:.3f}</td><td>{ref["slices"]["A"][s["id"]]["n"]}</td></tr>'
                  for s in meta['sources']]
    static = [
        '<p class="lab-note">Reference numbers at the default threshold of 0.50, computed by the Python script. '
        'With JavaScript on, this becomes an interactive scorecard.</p>',
        '<div class="lab-table-wrap">',
        '  <table class="lab-table">',
        '    <caption>Test-set metrics at threshold 0.50</caption>',
        '    <thead><tr><th scope="col">Metric</th><th scope="col">A · Naive Bayes</th><th scope="col">B · Logistic</th></tr></thead>',
        '    <tbody>', *metric_rows, '    </tbody>',
        '  </table>',
        '</div>',
        '<div class="lab-table-wrap">',
        '  <table class="lab-table">',
        '    <caption>Accuracy by source at threshold 0.50</caption>',
        '    <thead><tr><th scope="col">Source</th><th scope="col">A</th><th scope="col">B</th><th scope="col">Sentences</th></tr></thead>',
        '    <tbody>', *slice_rows, '    </tbody>',
        '  </table>',
        '</div>',
    ]

    failures = []
    for f in data['failures']:
        failures += [
            '<li class="lab-fail">',
            f'  <p class="lab-fail-reason mono">{e(f["reason"])} · {e(names_source(meta, f["source"]))}</p>',
            f'  <blockquote class="lab-fail-text"><p>{e(f["text"])}</p></blockquote>',
            '  <dl class="lab-fail-meta">',
            f'    <div><dt class="mono">Gold</dt><dd>{"positive" if f["label"] == 1 else "negative"}</dd></div>',
            f'    <div><dt class="mono">P(positive), A</dt><dd>{f["pA"]:.3f} {call(f["pA"], f["label"])}</dd></div>',
            f'    <div><dt class="mono">P(positive), B</dt><dd>{f["pB"]:.3f} {call(f["pB"], f["label"])}</dd></div>',
            '  </dl>',
            '</li>',
        ]

    counts = meta['counts']
    lam = data['models'][1]['hyperparameters']['lambda']
    method = [
        f'<li><strong>Data.</strong> {meta["raw_total"]:,} labelled sentences, 1,000 each from Amazon, Yelp and IMDb, '
        f'half positive. {meta["duplicates_removed"]} exact repeats (ignoring case and spacing) were dropped first, '
        f'leaving {meta["used_total"]:,}, so no sentence can appear in both training and test.</li>',
        f'<li><strong>Split.</strong> Seeded ({data["seed"]}) and stratified by source and label: '
        f'{counts["train"]["total"]:,} train, {counts["validation"]["total"]} validation, {counts["test"]["total"]} test.</li>',
        '<li><strong>Features.</strong> Lowercase regex tokens; contractions split so “don’t” keeps its “n’t”. '
        'Model A counts unigrams. Model B uses unigram and bigram presence plus a <code>not_</code> copy of each '
        'word between a negation and the next punctuation mark.</li>',
        f'<li><strong>Training.</strong> A: multinomial Naive Bayes, Laplace smoothing (alpha {NB_ALPHA:g}), not tuned. '
        f'B: L2 logistic regression, full-batch gradient descent with Nesterov momentum, {LR_ITERATIONS:,} steps; '
        f'the L2 strength ({sci(lam)}) was picked from {len(LR_LAMBDAS)} values by validation log loss. '
        'The test set played no part in fitting or tuning.</li>',
        f'<li><strong>Uncertainty.</strong> {BOOTSTRAP_RESAMPLES:,} bootstrap resamples of the test set; intervals are '
        f'the 2.5th to 97.5th percentiles. F1 for A: {boot["A"][0]:.3f} to {boot["A"][1]:.3f}; '
        f'B: {boot["B"][0]:.3f} to {boot["B"][1]:.3f}; B minus A: {signed(lo)} to {signed(hi)} '
        f'(B ahead in {boot["share_B_better"] * 100:.0f}% of resamples).</li>',
    ]
    return {name: '\n'.join(lines) for name, lines in
            (('strip', strip), ('static', static), ('failures', failures), ('method', method))}


def call(p: float, label: int) -> str:
    word = 'right' if (p >= THRESHOLD) == (label == 1) else 'wrong'
    return f'<span class="lab-call lab-call-{word}">{word}</span>'


def sci(x: float) -> str:
    """3e-05 -> 3 × 10<sup>−5</sup> (HTML)."""
    mantissa, exponent = f'{x:.0e}'.split('e')
    return f'{mantissa} × 10<sup>\u2212{abs(int(exponent))}</sup>' if int(exponent) < 0 else f'{x:g}'


def names_source(meta, key):
    return next(s['name'] for s in meta['sources'] if s['id'] == key)


def update_page(blocks: dict[str, str]) -> bool:
    """Replace each <!-- generated:NAME --> ... <!-- /generated:NAME --> block in the page."""
    if not PAGE.exists():
        return False
    text = PAGE.read_text(encoding='utf-8')
    for name, block in blocks.items():
        pattern = re.compile(rf'^([ \t]*)<!-- generated:{name} -->$[\s\S]*?^[ \t]*<!-- /generated:{name} -->$', re.M)
        if not pattern.search(text):
            raise SystemExit(f'{PAGE.name}: missing generated:{name} markers')

        def fill(match, block=block, name=name):
            pad = match.group(1)
            body = '\n'.join(pad + line if line else line for line in block.split('\n'))
            return f'{pad}<!-- generated:{name} -->\n{body}\n{pad}<!-- /generated:{name} -->'
        text = pattern.sub(fill, text)
    PAGE.write_text(text, encoding='utf-8')
    return True


# ---------------------------------------------------------------- main

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--zip', help='path to a local copy of the UCI zip')
    parser.add_argument('--seed', type=int, default=SEED)
    args = parser.parse_args()

    raw = read_rows(load_zip(args.zip))
    rows, removed = dedupe(raw)
    for i, row in enumerate(rows):
        row['tokens'] = tokenize(row['text'])
        row['words'] = words(row['tokens'])
        row['feats'] = features_b(row['tokens'])
    parts = split(rows, args.seed)
    train, val, test = parts['train'], parts['validation'], parts['test']
    y_train, y_val, y_test = ([r['label'] for r in p] for p in (train, val, test))

    # Model A
    nb = NaiveBayes(NB_ALPHA).fit([r['words'] for r in train], y_train)

    # Model B: vocabulary from training data only; bigrams need two training sightings.
    counts: dict[str, int] = {}
    for r in train:
        for f in r['feats']:
            counts[f] = counts.get(f, 0) + 1
    vocab = sorted(f for f, c in counts.items() if ' ' not in f or c >= BIGRAM_MIN_COUNT)
    tuning = []
    for lam in LR_LAMBDAS:
        model = Logistic(lam, LR_ITERATIONS).fit([r['feats'] for r in train], y_train, vocab)
        pv = [model.proba(r['feats']) for r in val]
        tuning.append({'lambda': lam, 'val_log_loss': round(log_loss(pv, y_val), 4),
                       'val_f1': round(f1_of(pv, y_val), 4), 'model': model})
        print(f'  lambda {lam:<7g} val log loss {tuning[-1]["val_log_loss"]:.4f}  val F1 {tuning[-1]["val_f1"]:.4f}', file=sys.stderr)
    best = min(tuning, key=lambda t: (t['val_log_loss'], t['lambda']))
    lr = best['model']

    pa = [round(nb.proba(r['words']), 4) for r in test]
    pb = [round(lr.proba(r['feats']), 4) for r in test]
    ordered = sorted(range(len(test)), key=lambda i: (test[i]['source'], test[i]['label'], test[i]['text']))
    items = [{'id': k, 'text': test[i]['text'], 'source': test[i]['source'], 'label': test[i]['label'],
              'pA': pa[i], 'pB': pb[i]} for k, i in enumerate(ordered)]

    labels = [it['label'] for it in items]
    probs = {'A': [it['pA'] for it in items], 'B': [it['pB'] for it in items]}
    reference = {'threshold': THRESHOLD}
    for m in ('A', 'B'):
        c = confusion(probs[m], labels, THRESHOLD)
        reference[m] = {**c, **scores(c)}
    reference['slices'] = {}
    for m in ('A', 'B'):
        reference['slices'][m] = {}
        for key, _, _ in SOURCES:
            idx = [i for i, it in enumerate(items) if it['source'] == key]
            c = confusion([probs[m][i] for i in idx], [labels[i] for i in idx], THRESHOLD)
            reference['slices'][m][key] = {'n': len(idx), **c, **scores(c)}

    negated = {it['id']: any(t in NEGATIONS for t in tokenize(it['text'])) for it in items}
    failures = pick_failures([{**it, 'negated': negated[it['id']]} for it in items])
    failures = [{k: f[k] for k in ('id', 'text', 'source', 'label', 'pA', 'pB', 'reason')} for f in failures]

    def count(part):
        out = {'total': len(part)}
        for key, _, _ in SOURCES:
            out[key] = sum(1 for r in part if r['source'] == key)
        out['positive'] = sum(r['label'] for r in part)
        return out

    data = {
        'schema': 1,
        'title': 'Sentiment evaluation lab: a public reproduction',
        'note': 'Public data and two small baselines. Not the Companionship Chatbot model or data.',
        'generated_by': 'scripts/eval/build_sentiment_eval.py',
        'seed': args.seed,
        'dataset': {
            'name': 'Sentiment Labelled Sentences',
            'citation': 'Kotzias, D., Denil, M., de Freitas, N., and Smyth, P. (2015). From Group to Individual Labels '
                        'Using Deep Features. KDD 2015. Dataset: UCI Machine Learning Repository, '
                        'https://doi.org/10.24432/C57604',
            'licence': 'CC BY 4.0',
            'licence_url': 'https://creativecommons.org/licenses/by/4.0/',
            'url': 'https://archive.ics.uci.edu/dataset/331/sentiment+labelled+sentences',
            'download': URL,
            'sha256': ZIP_SHA256,
            'sources': [{'id': key, 'name': name} for key, name, _ in SOURCES],
            'raw_total': len(raw),
            'duplicates_removed': removed,
            'used_total': len(rows),
            'counts': {'train': count(train), 'validation': count(val), 'test': count(test)},
            'changes': 'Exact repeats removed; Windows-1252 punctuation stored as control characters mapped back; '
                       'whitespace collapsed. Only test sentences are published here.',
        },
        'models': [
            {'id': 'A', 'short': 'Naive Bayes', 'name': 'Multinomial Naive Bayes',
             'features': 'unigram counts', 'hyperparameters': {'alpha': NB_ALPHA}, 'vocabulary': len(nb.vocab)},
            {'id': 'B', 'short': 'Logistic', 'name': 'L2 logistic regression',
             'features': 'unigram and bigram presence (bigrams seen at least twice in training) plus not_ negation scope, rows scaled to unit length',
             'hyperparameters': {'lambda': best['lambda'], 'iterations': LR_ITERATIONS, 'optimizer': 'full-batch gradient descent, Nesterov momentum, step 1/(0.25 + lambda)'},
             'vocabulary': len(vocab),
             'tuning': [{k: t[k] for k in ('lambda', 'val_log_loss', 'val_f1')} for t in tuning]},
        ],
        'reference': reference,
        'bootstrap_f1': bootstrap(probs['A'], probs['B'], labels, args.seed),
        'failures': failures,
        'test': items,
    }

    text = write_json(data)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(text, encoding='utf-8')
    page = update_page(generated_blocks(data))

    boot = data['bootstrap_f1']
    print(f'Data: {len(raw)} sentences, {removed} duplicates removed, '
          f'train {len(train)} / validation {len(val)} / test {len(test)} (seed {args.seed})')
    print(f'Model B lambda {best["lambda"]:g} (validation log loss {best["val_log_loss"]:.4f}); vocab A {len(nb.vocab)}, B {len(vocab)}')
    for m in ('A', 'B'):
        r = reference[m]
        print(f'Model {m}: accuracy {r["accuracy"]:.4f}  precision {r["precision"]:.4f}  recall {r["recall"]:.4f}  '
              f'F1 {r["f1"]:.4f}  bootstrap F1 [{boot[m][0]:.4f}, {boot[m][1]:.4f}]  '
              + '  '.join(f'{k} {reference["slices"][m][k]["accuracy"]:.3f}' for k, _, _ in SOURCES))
    print(f'F1 B - A: {reference["B"]["f1"] - reference["A"]["f1"]:+.4f}  bootstrap [{boot["B_minus_A"][0]:+.4f}, '
          f'{boot["B_minus_A"][1]:+.4f}], B better in {boot["share_B_better"]:.1%} of resamples')
    print(f'Failures: {len(failures)}; wrote {OUT_JSON.relative_to(ROOT)} ({len(text.encode()):,} bytes, '
          f'sha256 {hashlib.sha256(text.encode()).hexdigest()[:16]})' + ('; updated the page' if page else ''))


if __name__ == '__main__':
    main()
