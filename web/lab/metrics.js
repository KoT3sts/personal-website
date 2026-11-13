// Pure metric helpers for the evaluation lab. No DOM, so node tests can check
// them against the reference numbers the Python script writes into the JSON.
// Predict positive when P(positive) >= threshold (the same rule as the script).

export const MODELS = ['A', 'B'];
const field = model => `p${model}`;

export function confusion(items, model, threshold) {
  const key = field(model);
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const item of items) {
    const positive = item[key] >= threshold;
    if (item.label === 1) {
      if (positive) tp += 1; else fn += 1;
    } else if (positive) fp += 1; else tn += 1;
  }
  return { tp, fp, tn, fn };
}

export function scores({ tp, fp, tn, fn }) {
  const total = tp + fp + tn + fn;
  return {
    accuracy: total ? (tp + tn) / total : 0,
    precision: tp + fp ? tp / (tp + fp) : 0,
    recall: tp + fn ? tp / (tp + fn) : 0,
    f1: tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 0,
  };
}

// Confusion counts, the four scores, and accuracy for each source slice.
export function evaluate(items, model, threshold, sources = [...new Set(items.map(item => item.source))]) {
  const counts = confusion(items, model, threshold);
  const slices = {};
  for (const source of sources) {
    const subset = items.filter(item => item.source === source);
    const sliceCounts = confusion(subset, model, threshold);
    slices[source] = { n: subset.length, ...sliceCounts, ...scores(sliceCounts) };
  }
  return { ...counts, ...scores(counts), slices };
}

// Precision, recall and F1 at evenly spaced thresholds, for the trade-off chart.
export function sweep(items, model, from = 0.05, to = 0.95, steps = 90) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const threshold = Math.round((from + ((to - from) * i) / steps) * 10000) / 10000;
    points.push({ threshold, ...scores(confusion(items, model, threshold)) });
  }
  return points;
}
