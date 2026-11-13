// Evaluation lab: the interactive scorecard. Reads the same-origin JSON written by
// scripts/eval/build_sentiment_eval.py, computes every number with metrics.js, and
// writes only through textContent. Without JavaScript (or if the fetch fails) the
// static reference tables generated into the page stay visible.
import { MODELS, evaluate, sweep } from './metrics.js';

const DATA_URL = './data/sentiment-eval.json';
const SVG_NS = 'http://www.w3.org/2000/svg';
const NAMES = { A: 'Model A, Naive Bayes', B: 'Model B, logistic regression' };
const fixed = (value, digits = 3) => value.toFixed(digits);

function svg(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

// Chart geometry (viewBox 640 x 272).
// Axis labels render at CHART_TEXT_PX whatever the chart's width (see fitChartText), which is
// up to about 28 viewBox units on a 300px-wide chart; the margins leave room for that.
const BOX = { left: 80, right: 596, top: 20, bottom: 214 };
const CHART_TEXT_PX = 12;
const x = t => BOX.left + ((t - 0.05) / 0.9) * (BOX.right - BOX.left);
const y = v => BOX.bottom - v * (BOX.bottom - BOX.top);

function drawChart(root, curves) {
  root.replaceChildren();
  const grid = svg('g', { class: 'lab-chart-grid' });
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    grid.append(svg('line', { x1: BOX.left, x2: BOX.right, y1: y(v), y2: y(v) }));
    const label = svg('text', { x: BOX.left - 10, y: y(v), 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    label.textContent = v.toFixed(2);
    grid.append(label);
  }
  for (const t of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    const label = svg('text', { x: x(t), y: BOX.bottom + 44, 'text-anchor': 'middle' });
    label.textContent = t.toFixed(2);
    grid.append(label);
  }
  root.append(grid);
  const lines = {};
  for (const model of MODELS) {
    const group = svg('g', { class: `lab-chart-model lab-chart-${model.toLowerCase()}`, 'data-model': model });
    for (const metric of ['precision', 'recall']) {
      const points = curves[model].map(point => `${x(point.threshold).toFixed(1)},${y(point[metric]).toFixed(1)}`).join(' ');
      group.append(svg('polyline', { points, class: `lab-line lab-line-${metric}` }));
    }
    root.append(group);
    lines[model] = group;
  }
  const marker = svg('line', { class: 'lab-chart-marker', y1: BOX.top, y2: BOX.bottom });
  root.append(marker);
  return { marker, lines };
}

// Keep the axis labels at a fixed on-screen size: viewBox units per CSS pixel change with width.
function fitChartText(root) {
  const fit = () => {
    const width = root.getBoundingClientRect().width;
    if (width > 0) root.style.setProperty('--chart-text', `${((CHART_TEXT_PX * 640) / width).toFixed(2)}px`);
  };
  fit();
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(root);
  else window.addEventListener('resize', fit);
}

function start(data) {
  const live = document.querySelector('[data-lab-live]');
  const fallback = document.querySelector('[data-lab-fallback]');
  const slider = document.getElementById('threshold');
  const output = document.getElementById('threshold-value');
  const announce = document.querySelector('[data-lab-announce]');
  const chartRoot = document.querySelector('[data-lab-chart-svg]');
  if (!live || !slider || !output || !announce || !chartRoot) return;

  const items = data.test;
  const sources = data.dataset.sources.map(source => source.id);
  const chart = drawChart(chartRoot, Object.fromEntries(MODELS.map(model => [model, sweep(items, model)])));
  const radios = [...live.querySelectorAll('input[name="lab-model"]')];
  const perModel = [...live.querySelectorAll('[data-model]')];
  let timer = 0;

  const selected = () => radios.find(radio => radio.checked)?.value || 'both';
  const threshold = () => Math.min(0.95, Math.max(0.05, Number(slider.value) || 0.5));

  function render({ speak }) {
    const t = threshold();
    const choice = selected();
    const shown = choice === 'both' ? MODELS : [choice];
    output.textContent = t.toFixed(2);
    slider.setAttribute('aria-valuetext', t.toFixed(2));
    // toggleAttribute, not .hidden: the chart's SVG groups have no hidden property.
    for (const node of perModel) node.toggleAttribute('hidden', !shown.includes(node.getAttribute('data-model')));
    live.dataset.view = choice;
    chart.marker.setAttribute('x1', x(t).toFixed(1));
    chart.marker.setAttribute('x2', x(t).toFixed(1));

    const results = {};
    for (const model of MODELS) {
      const result = evaluate(items, model, t, sources);
      results[model] = result;
      for (const metric of ['precision', 'recall', 'f1', 'accuracy']) {
        const cell = live.querySelector(`td[data-model="${model}"][data-metric="${metric}"]`);
        if (cell) cell.textContent = fixed(result[metric]);
      }
      for (const key of ['tp', 'fn', 'fp', 'tn']) {
        const cell = live.querySelector(`[data-cell="${model}-${key}"]`);
        if (cell) cell.textContent = String(result[key]);
      }
      for (const source of sources) {
        const cell = live.querySelector(`td[data-model="${model}"][data-slice="${source}"]`);
        if (cell) cell.textContent = fixed(result.slices[source].accuracy);
      }
    }
    for (const source of sources) {
      const cell = live.querySelector(`td[data-slice-n="${source}"]`);
      if (cell) cell.textContent = String(results.A.slices[source].n);
    }

    if (!speak) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const parts = shown.map(model => {
        const r = results[model];
        return `${NAMES[model]}: precision ${fixed(r.precision, 2)}, recall ${fixed(r.recall, 2)}, F1 ${fixed(r.f1, 2)}, accuracy ${fixed(r.accuracy, 2)}.`;
      });
      announce.textContent = `Threshold ${t.toFixed(2)}. ${parts.join(' ')}`;
    }, 450);
  }

  slider.addEventListener('input', () => render({ speak: true }));
  for (const radio of radios) radio.addEventListener('change', () => render({ speak: true }));
  render({ speak: false });
  // The strip's numbers link here: land on the slider, ready to drag or use the arrow keys
  // (after the jump, which would otherwise take focus back).
  for (const link of document.querySelectorAll('a[href="#scorecard"]')) {
    link.addEventListener('click', () => setTimeout(() => slider.focus({ preventScroll: true }), 0));
  }
  live.hidden = false;
  if (fallback) fallback.hidden = true;
  fitChartText(chartRoot);
}

function valid(data) {
  return data && Array.isArray(data.test) && data.test.length > 0 && Array.isArray(data.dataset?.sources)
    && data.test.every(item => typeof item.pA === 'number' && typeof item.pB === 'number' && (item.label === 0 || item.label === 1));
}

fetch(DATA_URL, { credentials: 'same-origin' })
  .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
  .then(data => { if (valid(data)) start(data); })
  .catch(() => { /* keep the static reference tables */ });
