// Evaluation lab (web/lab/): the published experiment data, the browser metrics
// against the Python reference, and the page's accessibility, security and honesty
// rules. Plain text checks plus the pure metrics module, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { confusion, evaluate, scores, sweep } from '../web/lab/metrics.js';

const web = new URL('../web/', import.meta.url);
const read = path => readFileSync(new URL(path, web), 'utf8');
const jsonPath = new URL('lab/data/sentiment-eval.json', web);
const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
const page = read('lab/sentiment-eval.html');
const SOURCES = ['amazon', 'yelp', 'imdb'];
const METRICS = ['accuracy', 'precision', 'recall', 'f1'];
// Inline tags vanish (a link inside a sentence keeps the sentence whole); block tags become spaces.
const plain = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<\/?(?:a|span|strong|em|code|sup|b|i)(?:\s[^>]*)?>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('the JSON has the dataset, models, seed, reference metrics and one row per test sentence', () => {
  assert.ok(statSync(jsonPath).size < 150 * 1024, 'stays under 150 KB');
  assert.equal(data.schema, 1);
  assert.equal(typeof data.seed, 'number');
  const { dataset } = data;
  assert.equal(dataset.name, 'Sentiment Labelled Sentences');
  assert.equal(dataset.licence, 'CC BY 4.0');
  assert.match(dataset.citation, /Kotzias/);
  assert.match(dataset.citation, /KDD 2015/);
  assert.match(dataset.url, /^https:\/\/archive\.ics\.uci\.edu\/dataset\/331\//);
  assert.match(dataset.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(dataset.sources.map(source => source.id), SOURCES);
  assert.equal(dataset.raw_total, 3000);
  assert.equal(dataset.used_total, dataset.raw_total - dataset.duplicates_removed);
  const { train, validation, test: held } = dataset.counts;
  assert.equal(train.total + validation.total + held.total, dataset.used_total);
  assert.ok(Math.abs(held.total / dataset.used_total - 0.2) < 0.01, 'test is about 20%');
  assert.ok(Math.abs(validation.total / dataset.used_total - 0.1) < 0.01, 'validation is about 10%');

  assert.deepEqual(data.models.map(model => model.id), ['A', 'B']);
  assert.equal(data.models[0].hyperparameters.alpha, 1);
  assert.ok(data.models[1].hyperparameters.lambda > 0);
  assert.ok(data.models[1].tuning.some(row => row.lambda === data.models[1].hyperparameters.lambda), 'lambda came from the validation grid');

  assert.equal(data.test.length, held.total);
  const ids = new Set();
  for (const item of data.test) {
    assert.deepEqual(Object.keys(item), ['id', 'text', 'source', 'label', 'pA', 'pB']);
    assert.ok(typeof item.text === 'string' && item.text.length > 0);
    assert.ok(SOURCES.includes(item.source));
    assert.ok(item.label === 0 || item.label === 1);
    for (const p of [item.pA, item.pB]) {
      assert.ok(p >= 0 && p <= 1, `${item.id} probability in [0, 1]`);
      assert.equal(Math.round(p * 10000) / 10000, p, `${item.id} rounded to 4 dp`);
    }
    ids.add(item.id);
  }
  assert.equal(ids.size, data.test.length, 'ids are unique');
  for (const source of SOURCES) assert.equal(data.test.filter(item => item.source === source).length, held[source]);
  assert.equal(data.test.filter(item => item.label === 1).length, held.positive);
  assert.equal(new Set(data.test.map(item => item.text.toLowerCase())).size, data.test.length, 'no repeated test sentence');
});

test('metrics.js reproduces the Python reference at threshold 0.5 exactly', () => {
  const { reference } = data;
  assert.equal(reference.threshold, 0.5);
  for (const model of ['A', 'B']) {
    const result = evaluate(data.test, model, 0.5, SOURCES);
    for (const key of ['tp', 'fp', 'tn', 'fn', ...METRICS]) assert.equal(result[key], reference[model][key], `${model} ${key}`);
    for (const source of SOURCES) {
      for (const key of ['n', 'tp', 'fp', 'tn', 'fn', ...METRICS]) {
        assert.equal(result.slices[source][key], reference.slices[model][source][key], `${model} ${source} ${key}`);
      }
    }
  }
});

test('metric edge cases and threshold sanity: recall never rises as the threshold rises', () => {
  assert.deepEqual(scores({ tp: 0, fp: 0, tn: 0, fn: 0 }), { accuracy: 0, precision: 0, recall: 0, f1: 0 });
  assert.deepEqual(confusion([{ label: 1, pA: 0.5 }, { label: 0, pA: 0.49 }], 'A', 0.5), { tp: 1, fp: 0, tn: 1, fn: 0 });
  for (const model of ['A', 'B']) {
    let previous = { recall: Infinity, predicted: Infinity };
    for (let k = 5; k <= 95; k += 1) {
      const c = confusion(data.test, model, k / 100);
      const { recall } = scores(c);
      assert.ok(recall <= previous.recall, `${model} recall at ${k / 100}`);
      assert.ok(c.tp + c.fp <= previous.predicted, `${model} positives at ${k / 100}`);
      assert.equal(c.tp + c.fp + c.tn + c.fn, data.test.length);
      previous = { recall, predicted: c.tp + c.fp };
    }
    const curve = sweep(data.test, model);
    assert.equal(curve.length, 91);
    assert.equal(curve[0].threshold, 0.05);
    assert.equal(curve.at(-1).threshold, 0.95);
    assert.equal(curve[45].threshold, 0.5);
    assert.equal(curve[45].f1, data.reference[model].f1);
  }
});

test('bootstrap intervals and failure examples are consistent with the predictions', () => {
  const boot = data.bootstrap_f1;
  for (const model of ['A', 'B']) {
    const [lo, hi] = boot[model];
    assert.ok(lo < data.reference[model].f1 && data.reference[model].f1 < hi, `${model} F1 inside its interval`);
  }
  assert.ok(boot.B_minus_A[0] <= boot.B_minus_A[1]);
  assert.ok(data.failures.length >= 6 && data.failures.length <= 8);
  const byId = new Map(data.test.map(item => [item.id, item]));
  for (const failure of data.failures) {
    const item = byId.get(failure.id);
    assert.ok(item, `failure ${failure.id} is a test sentence`);
    for (const key of ['text', 'source', 'label', 'pA', 'pB']) assert.equal(failure[key], item[key]);
    const wrong = p => (p >= 0.5) !== (item.label === 1);
    assert.ok(wrong(item.pA) || wrong(item.pB), `failure ${failure.id} is misclassified by at least one model`);
    assert.ok(failure.reason.length > 5);
  }
});

test('the page has the strict CSP, the referrer policy and loads only its own module', () => {
  const chatbot = read('projects/companion-chatbot.html');
  const csp = html => html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1];
  assert.equal(csp(page), csp(chatbot));
  assert.match(page, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
  assert.match(page, /<script type="module" src="\.\/lab\.js"><\/script>/);
  assert.equal([...page.matchAll(/<script(?![^>]*application\/ld\+json)(?![^>]*count\.js)[^>]*>/g)].length, 1, 'one script, the module (the page counter is checked in security.test.js)');
  assert.doesNotMatch(page, /\sstyle="/);
  const lab = read('lab/lab.js');
  assert.match(lab, /from '\.\/metrics\.js'/);
  assert.match(lab, /fetch\(DATA_URL/);
  assert.match(lab, /const DATA_URL = '\.\/data\/sentiment-eval\.json';/);
  for (const source of [lab, read('lab/metrics.js')]) assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
});

test('the scorecard is accessible: labelled slider and output, radio toggle, live summary, table semantics', () => {
  assert.match(page, /<label[^>]*for="threshold"[^>]*>Decision threshold<\/label>/);
  assert.match(page, /<input type="range" id="threshold" min="0\.05" max="0\.95" step="0\.01" value="0\.5"/);
  // aria-live="off": the slider already speaks its value, and the debounced summary below speaks the metrics.
  assert.match(page, /<output[^>]*id="threshold-value" for="threshold" aria-live="off">0\.50<\/output>/);
  assert.match(page, /<fieldset class="lab-toggle">\s*<legend[^>]*>Model<\/legend>/);
  for (const [id, value] of [['model-a', 'A'], ['model-b', 'B'], ['model-both', 'both']]) {
    assert.match(page, new RegExp(`<input type="radio" name="lab-model" id="${id}" value="${value}"[^>]*><label for="${id}">`));
  }
  assert.match(page, /aria-live="polite"[^>]*data-lab-announce/);
  assert.ok((page.match(/<caption>/g) || []).length >= 6, 'every table has a caption');
  assert.ok((page.match(/<th scope="(?:col|row)">/g) || []).length >= 20, 'header cells are scoped');
  const css = read('lab/lab.css');
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const size of body.matchAll(/font-size: ([\d.]+)px/g)) assert.ok(Number(size[1]) >= 11, `${selector.trim()} ${size[0]}`);
  }
  assert.match(css, /\.lab-toggle label \{[^}]*min-height: 44px/);
  assert.match(css, /input\[type="range"\] \{[^}]*height: 44px/);
  assert.match(css, /\.lab-table-wrap \{[^}]*overflow-x: auto/);
  assert.match(css, /\.lab-chart-grid text \{[^}]*font-size: var\(--chart-text, /, 'chart text is sized from the chart width');
  assert.match(read('lab/lab.js'), /const CHART_TEXT_PX = (1[1-9]|[2-9]\d);/, 'chart text renders at 11px or more');
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.doesNotMatch(css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, ''), /transition|animation/, 'motion only when allowed');
});

test('without JavaScript the page shows the 0.5 reference metrics, the failures and the method', () => {
  const fallback = page.match(/<div class="lab-fallback" data-lab-fallback>([\s\S]*?)<!-- \/generated:static -->/)[1];
  const cells = [...fallback.matchAll(/<tr><th scope="row">(Precision|Recall|F1|Accuracy)<\/th><td>([\d.]+)<\/td><td>([\d.]+)<\/td><\/tr>/g)];
  assert.equal(cells.length, 4);
  for (const [, label, a, b] of cells) {
    const key = label === 'F1' ? 'f1' : label.toLowerCase();
    assert.equal(a, data.reference.A[key].toFixed(3), `A ${key}`);
    assert.equal(b, data.reference.B[key].toFixed(3), `B ${key}`);
  }
  assert.match(page, /<div class="lab-live" data-lab-live hidden>/, 'the interactive part starts hidden');
  const text = plain(page);
  for (const failure of data.failures) assert.ok(text.includes(failure.text), `failure shown: ${failure.text}`);
  assert.ok(text.includes(`${data.dataset.counts.test.total} test`), 'method states the split');
  assert.ok(text.includes('python3 scripts/eval/build_sentiment_eval.py'), 'how to reproduce');
  const best = Math.max(data.reference.A.f1, data.reference.B.f1).toFixed(3);
  assert.match(page, new RegExp(`<dt class="mono">Best F1</dt><dd><a class="lab-strip-link" href="#scorecard">${best.replace('.', '\\.')}<`), 'strip shows the best F1');
});

test('the measured part comes first: strip, then the scorecard, with links and a cue to start', () => {
  const body = page.slice(page.indexOf('<div class="cs-body">'));
  const strip = page.indexOf('<section class="lab-strip-band"');
  const scorecard = page.indexOf('<section class="cs-grid cs-section lab-scorecard" id="scorecard" aria-labelledby="score-title">');
  assert.ok(strip > 0 && scorecard > strip, 'the scorecard follows the strip');
  assert.ok(body.indexOf('id="scorecard"') < body.indexOf('aria-labelledby="fail-title"'), 'the scorecard is the first section, before the prose');
  assert.equal([...page.slice(strip, scorecard).matchAll(/<section /g)].length, 1, 'nothing between the strip and the scorecard');
  // Each strip number links down to the scorecard, with a spoken hint (generated by the script).
  const links = [...page.matchAll(/<a class="lab-strip-link" href="#scorecard">([^<]+)<span class="visually-hidden">, see the scorecard<\/span><\/a>/g)].map(match => match[1]);
  assert.deepEqual(links, [String(data.dataset.counts.test.total), Math.max(data.reference.A.f1, data.reference.B.f1).toFixed(3), `+${(data.reference.B.f1 - data.reference.A.f1).toFixed(3)}`]);
  assert.match(readFileSync(new URL('../scripts/eval/build_sentiment_eval.py', import.meta.url), 'utf8'), /href="#scorecard">\{value\}<span class="visually-hidden">, see the scorecard<\/span><\/a>/);
  // The cue sits with the slider, inside the part that needs JavaScript.
  const live = page.match(/<div class="lab-live" data-lab-live hidden>[\s\S]*?<p class="visually-hidden" aria-live="polite"/)[0];
  assert.match(live, /<div class="lab-threshold">\s*<p class="lab-cue mono"><span class="icon icon-arrow-s" aria-hidden="true"><\/span> Start here: drag the threshold<\/p>/);
  assert.ok(live.indexOf('class="lab-threshold"') < live.indexOf('class="lab-toggle"'), 'the slider comes before the model toggle');
  assert.match(read('lab/lab.js'), /document\.querySelectorAll\('a\[href="#scorecard"\]'\)[\s\S]*?slider\.focus\(\{ preventScroll: true \}\)/, 'following a strip link lands on the slider');
  const css = read('lab/lab.css');
  assert.match(css, /\.lab-scorecard \{ scroll-margin-top: /);
  assert.match(css, /\.lab-eval \.cs-intro \{/, 'the shorter intro is scoped to this page');
  assert.doesNotMatch(css, /^\.cs-intro|^\.lab-title/m, 'the other lab pages keep their intro');
});

test('the page is honest about what it is: public data, cited, and no claim of the chatbot result', () => {
  const text = plain(page);
  assert.match(text, /public reproduction/i);
  assert.match(text, /not the Companionship Chatbot’s model, data or reported result/);
  assert.match(text, /CC BY 4\.0/);
  assert.match(text, /The failure examples are verbatim test sentences from the public dataset/);
  assert.match(text, /Kotzias/);
  assert.match(page, /href="https:\/\/archive\.ics\.uci\.edu\/dataset\/331\/sentiment\+labelled\+sentences"/);
  for (const sentence of text.split(/(?<=[.!?])\s+/)) assert.doesNotMatch(sentence, /95\s*%|95 percent/i, `no 95% claim: ${sentence}`);
  assert.doesNotMatch(readFileSync(jsonPath, 'utf8'), /95\s*%/);
  for (const key of ['description', 'og:description', 'twitter:description']) {
    const value = page.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))[1];
    assert.doesNotMatch(value, /95\s*%/);
    assert.match(value, /not the Companionship Chatbot model/);
  }
});

test('the page links home and to the case study, and the case study, homepage and sitemap link to it', () => {
  assert.match(page, /<a class="cs-wordmark" href="\.\.\/">/);
  assert.match(page, /href="\.\.\/projects\/companion-chatbot\.html"/);
  assert.match(page, /<a class="cs-back" href="\.\.\/#lab"><span class="cs-arrow icon icon-arrow-w" aria-hidden="true"><\/span> Back to the Lab<\/a>/, 'the header pill goes back to the Lab, wherever the visitor came from');
  assert.doesNotMatch(page, /href="\.\.\/#work"/, 'a lab page goes back to the Lab, not to the projects');
  assert.match(page, /<link rel="canonical" href="https:\/\/[^"]+\/lab\/sentiment-eval\.html">/);
  for (const ref of [...page.matchAll(/\s(?:href|src)="([^"]+)"/g)].map(match => match[1]).filter(ref => !/^(?:https?:|mailto:|#)/.test(ref))) {
    const target = new URL(ref.split('#')[0], new URL('lab/sentiment-eval.html', web));
    const file = target.pathname.endsWith('/') ? new URL('index.html', target) : target;
    assert.ok(statSync(file), `${ref} exists`);
  }
  assert.equal((read('projects/companion-chatbot.html').match(/href="\.\.\/lab\/sentiment-eval\.html"/g) || []).length, 1);
  const story = read('index.html').match(/<section id="project-chatbot"[\s\S]*?<\/section>/)[0];
  assert.equal((story.match(/href="\.\/lab\/sentiment-eval\.html"/g) || []).length, 1);
  assert.match(read('sitemap.xml'), /<loc>https:\/\/[^<]+\/lab\/sentiment-eval\.html<\/loc>/);
});

test('dev server serves the lab page, scripts and JSON with the right types', async () => {
  const port = 45000 + Math.floor(Math.random() * 2000);
  const server = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url))], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('exit', code => reject(new Error(`server exited ${code}`)));
    });
    const types = {
      '/lab/sentiment-eval.html': /^text\/html/, '/lab/lab.js': /^text\/javascript/, '/lab/metrics.js': /^text\/javascript/,
      '/lab/lab.css': /^text\/css/, '/lab/data/sentiment-eval.json': /^application\/json/,
    };
    for (const [path, type] of Object.entries(types)) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), type, path);
      await response.arrayBuffer();
    }
  } finally {
    server.kill();
  }
});

test('the first screen shows a chart: F1 with its bootstrap interval for each model and for the gap, from the JSON', () => {
  const fig = page.match(/<figure class="lab-first lab-ci" aria-labelledby="ci-cap">([\s\S]*?)<\/figure>/)?.[1];
  assert.ok(fig, 'a first-screen chart in the intro');
  assert.ok(page.indexOf('class="lab-first lab-ci"') < page.indexOf('<section class="lab-strip-band"'), 'before the strip');
  const sign = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(3)}`;
  const boot = data.bootstrap_f1;
  const f1 = { A: data.reference.A.f1, B: data.reference.B.f1 };
  const rows = [...fig.matchAll(/<tr[^>]*><th scope="row">([^<]+)<\/th><td class="lab-ci-num"><span class="lab-ci-value">([^<]+)<\/span> <span class="lab-ci-range">([^<]+)<\/span><\/td><td class="lab-ci-plot">([\s\S]*?)<\/td><\/tr>/g)];
  assert.deepEqual(rows.map(row => [row[1], row[2], row[3]]), [
    ['A · Naive Bayes', f1.A.toFixed(3), `${boot.A[0].toFixed(3)} to ${boot.A[1].toFixed(3)}`],
    ['B · Logistic', f1.B.toFixed(3), `${boot.B[0].toFixed(3)} to ${boot.B[1].toFixed(3)}`],
    ['B minus A', sign(f1.B - f1.A), `${sign(boot.B_minus_A[0])} to ${sign(boot.B_minus_A[1])}`],
  ]);
  // Marks sit where the numbers say: F1 on 0.74–0.86, the gap on −0.06–+0.06.
  const at = (v, lo, hi) => ((v - lo) / (hi - lo)) * 100;
  const close = (a, b, label) => assert.ok(Math.abs(a - b) < 0.02, `${label}: ${a} vs ${b}`);
  const marks = svg => ({ x1: Number(svg.match(/class="lab-ci-band" x1="([\d.]+)%"/)[1]), x2: Number(svg.match(/class="lab-ci-band" x1="[\d.]+%" x2="([\d.]+)%"/)[1]), cx: Number(svg.match(/cx="([\d.]+)%"/)[1]) });
  for (const [i, [lo, hi, point, a, b]] of [[...boot.A, f1.A, 0.74, 0.86], [...boot.B, f1.B, 0.74, 0.86], [...boot.B_minus_A, f1.B - f1.A, -0.06, 0.06]].entries()) {
    const m = marks(rows[i][4]);
    close(m.x1, at(lo, a, b), `row ${i} low`); close(m.x2, at(hi, a, b), `row ${i} high`); close(m.cx, at(point, a, b), `row ${i} point`);
  }
  assert.match(rows[2][4], /class="lab-ci-zero" x1="50%"/, 'the gap row marks zero');
  assert.ok(boot.B_minus_A[0] < 0 && boot.B_minus_A[1] > 0, 'the caption is true: the gap interval crosses zero');
  assert.match(fig, /the interval for the gap crosses zero/);
});

test('limits say that validation reads higher than test, with the numbers from the JSON', () => {
  const b = data.models.find(model => model.id === 'B');
  const picked = b.tuning.find(row => Math.abs(row.lambda - b.hyperparameters.lambda) < 1e-12);
  assert.ok(picked.val_f1 > data.reference.B.f1);
  assert.ok(page.includes(`model B scored F1 ${picked.val_f1.toFixed(3)} on the ${data.dataset.counts.validation.total} validation sentences and ${data.reference.B.f1.toFixed(3)} on the test set`));
});
