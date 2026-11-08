export function createGalleryState(count, initialIndex = 0) {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('A gallery needs at least one project.');
  let current = 0;
  function select(index) {
    if (!Number.isInteger(index)) throw new TypeError('Project index must be an integer.');
    current = ((index % count) + count) % count;
    return current;
  }
  select(initialIndex);
  return {
    get index() { return current; },
    select,
    step(delta) {
      if (!Number.isInteger(delta)) throw new TypeError('Gallery step must be an integer.');
      return select(current + delta);
    },
  };
}

const round = value => Math.round(value * 1000) / 1000 + 0;

// Signed shortest distance from the active card, so the arc wraps both ways.
export function wrapOffset(index, active, count) {
  let offset = (index - active + count) % count;
  if (offset > count / 2) offset -= count;
  return offset;
}

// Pose for a card at a (possibly fractional, while dragging) arc position.
// Whole positions keep the incumbent arc: neighbours washed back to .65,
// second neighbours faded out, anything further hidden behind the stage.
// Cards that can overlap a nearer card stay opaque (opacity 1 up to one card
// away) and recede through `shade`, a paper-coloured wash painted on top of
// the card, so nothing behind them bleeds through. Only cards travelling
// behind the neighbours (distance 1 to 2) fade with real opacity. The visible
// result on the paper background matches the old .65 opacity:
// (1 - shade) * opacity is the card's share of the final colour.
export const NEIGHBOUR_SHADE = 0.35;
export function cardPose(position, count) {
  const distance = Math.abs(position);
  const opacity = distance <= 1 ? 1 : distance <= 2 ? 2 - distance : 0;
  const shade = NEIGHBOUR_SHADE * Math.min(distance, 1);
  return { distance: round(distance), opacity: round(opacity), shade: round(shade), z: count - Math.round(distance), far: distance > 2 };
}

// Rubber-banded drag, measured in cards.
export function dragOffset(dx, shift, limit = 1.4) {
  if (!Number.isFinite(dx) || !(shift > 0)) return 0;
  const raw = dx / shift;
  const size = Math.abs(raw);
  const eased = size <= 1 ? size : Math.min(limit, 1 + (size - 1) * 0.35);
  return round(Math.sign(raw) * eased);
}

// Cards to advance when a drag is released. A projected landing point
// (distance plus momentum) picks the nearest card; a deliberate drag or a
// quick flick always moves at least one card in its direction.
export function releaseSteps({ dx, velocity = 0, shift, threshold = 45, flick = 0.45, momentum = 180, max = 2 }) {
  if (!Number.isFinite(dx) || !(shift > 0)) return 0;
  const speed = Number.isFinite(velocity) ? velocity : 0;
  const projected = dx + speed * momentum;
  let steps = -Math.round(projected / shift);
  if (steps === 0) {
    if (Math.abs(projected) > threshold) steps = projected < 0 ? 1 : -1;
    else if (Math.abs(speed) > flick && Math.sign(speed) === Math.sign(dx)) steps = speed < 0 ? 1 : -1;
  }
  return Math.max(-max, Math.min(max, steps)) + 0;
}
