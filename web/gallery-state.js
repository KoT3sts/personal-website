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
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Signed shortest distance from the active card, so the ribbon wraps both ways.
export function wrapOffset(index, active, count) {
  let offset = (index - active + count) % count;
  if (offset > count / 2) offset -= count;
  return offset;
}

// Continuous version for a fractional ribbon position: the result lies in
// [-count / 2, count / 2), so every card has exactly one place on the ribbon.
export function wrapPosition(value, count) {
  if (!Number.isFinite(value) || !(count > 0)) return 0;
  const half = count / 2;
  return ((((value + half) % count) + count) % count) - half + 0;
}

// ---- Curved ribbon geometry (SPECIFICATION V06) ---------------------------
// The covers sit edge to edge on a cylinder section. Each card is cut into
// vertical strips; every strip is placed on the cylinder with its own
// perspective, so curvature is continuous across a card instead of three flat
// tilted panels. `bend` 1 is a concave "curved display" (edges come toward the
// viewer), -1 a convex drum (edges fall away).
export const COVER_RATIO = 620 / 900;
// Viewer distance as a multiple of the radius. Between 1 and 2 the viewer sits
// inside the cylinder behind its axis: neighbours swell toward the screen
// edges and no strip can hide another, so DOM order is a safe paint order.
export const VIEW_DEPTH = 1.6;
export const RIBBON_TIERS = {
  phone: { share: 0.72, angle: 66, strips: 10, gap: 10, max: 520 },
  tablet: { share: 0.6, angle: 56, strips: 14, gap: 14, max: 720 },
  desktop: { share: 0.5, angle: 46, strips: 20, gap: 18, max: 900 },
};

export function ribbonTier(width) {
  return width < 600 ? 'phone' : width < 1100 ? 'tablet' : 'desktop';
}

// Projection of a point on the ribbon `theta` radians from the centre line.
export function ribbonProjection(theta, { radius, perspective, bend = 1 }) {
  const depth = bend * radius * (1 - Math.cos(theta));
  const scale = perspective / (perspective - depth);
  return { x: radius * Math.sin(theta) * scale, scale };
}

export function ribbonGeometry(width, { bend = 1, ratio = COVER_RATIO, count = 6 } = {}) {
  const viewport = width > 0 ? width : 1280;
  const tier = ribbonTier(viewport);
  const preset = RIBBON_TIERS[tier];
  const cardWidth = Math.round(Math.min(viewport * preset.share, preset.max));
  const cardHeight = Math.round(cardWidth * ratio);
  const pitch = cardWidth + preset.gap;
  const radians = (preset.angle * Math.PI) / 180;
  const radius = pitch / radians;
  const perspective = radius * VIEW_DEPTH;
  const shape = { radius, perspective, bend };
  // Angle where the surface meets the stage edge (bisection; x grows with
  // theta over this range). Cards whose near edge lies beyond it are offscreen.
  const half = viewport / 2;
  const limit = Math.min(Math.PI / 2, ((count / 2 - 0.5) * pitch) / radius);
  let edge = limit;
  if (ribbonProjection(limit, shape).x > half) {
    let low = 0;
    let high = limit;
    for (let i = 0; i < 40; i += 1) {
      const mid = (low + high) / 2;
      if (ribbonProjection(mid, shape).x < half) low = mid; else high = mid;
    }
    edge = high;
  }
  const edgeScale = ribbonProjection(edge, shape).scale;
  return {
    tier,
    bend,
    strips: preset.strips,
    width: cardWidth,
    height: cardHeight,
    gap: preset.gap,
    pitch,
    angle: preset.angle,
    radius: round(radius),
    perspective: round(perspective),
    // Card offsets (in cards) still partly on screen.
    reach: round(edge / radians + cardWidth / 2 / pitch),
    // Tallest projected height on screen, so the band never clips the ribbon.
    band: Math.ceil(cardHeight * Math.max(1, edgeScale)),
    edgeScale: round(edgeScale),
  };
}

// Strip centres across one card, in card units (one unit = card + gap).
export function stripOffsets(strips, cardWidth, pitch) {
  if (!Number.isInteger(strips) || strips < 1 || !(cardWidth > 0) || !(pitch > 0)) return [];
  const share = cardWidth / pitch;
  return Array.from({ length: strips }, (_, index) => round(((index + 0.5) / strips - 0.5) * share));
}

// Horizontal centre of a card at `offset`, in px from the stage centre.
export function cardCentre(offset, geometry) {
  const theta = offset * (geometry.angle * Math.PI / 180);
  return ribbonProjection(theta, geometry).x;
}

// Per-card presentation at a (possibly fractional) ribbon offset. Neighbours
// sit back through opacity on the paper (cards never overlap, so nothing shows
// through); the caption belongs to whichever card is nearest the centre.
export const NEIGHBOUR_LEVEL = 0.6;
export function ribbonPose(offset, reach = 1.5) {
  const distance = Math.abs(offset);
  return {
    distance: round(distance),
    opacity: round(1 - (1 - NEIGHBOUR_LEVEL) * Math.min(distance, 1)),
    caption: round(clamp(1 - distance * 2.5, 0, 1)),
    far: distance > reach,
  };
}

// ---- Motion ---------------------------------------------------------------
// Exponential ease-out, normalised to land exactly on 1.
export function easeOutExpo(progress) {
  if (!(progress > 0)) return 0;
  if (progress >= 1) return 1;
  return (1 - Math.pow(2, -10 * progress)) / (1 - Math.pow(2, -10));
}
const EXPO_START_SLOPE = (10 * Math.LN2) / (1 - Math.pow(2, -10));

// Settle time in ms for `distance` cards. A release carries its speed (cards
// per ms) into the settle: the curve starts at that speed when it can, inside
// the 600–1000 ms range.
export function settleDuration({ distance = 0, velocity = 0 } = {}) {
  const size = Math.abs(Number.isFinite(distance) ? distance : 0);
  const speed = Math.abs(Number.isFinite(velocity) ? velocity : 0);
  const paced = 640 + 150 * Math.min(size, 2.4);
  const matched = speed > 0 && size > 0 ? (EXPO_START_SLOPE * size) / speed : Infinity;
  return Math.round(clamp(Math.min(paced, matched), 600, 1000));
}

// Card to settle on when a drag is released. `position` is the ribbon position
// (in cards) at release, `origin` the card it started from, `velocity` its
// speed in cards per ms. The projected landing point picks the nearest card; a
// deliberate drag (`threshold` px) or a quick flick (`flick` px/ms) always moves
// at least one card in its direction, and momentum adds at most `max` cards.
export function releaseTarget({ origin, position, velocity = 0, pitch, threshold = 45, flick = 0.45, momentum = 180, max = 2 }) {
  const start = Number.isInteger(origin) ? origin : 0;
  if (!Number.isFinite(position) || !(pitch > 0)) return start;
  const speed = Number.isFinite(velocity) ? velocity : 0;
  const projected = position + speed * momentum;
  const nearest = Math.round(position);
  let goal = clamp(Math.round(projected), nearest - max, nearest + max);
  if (goal === start) {
    const lead = (projected - start) * pitch;
    if (Math.abs(lead) > threshold) goal = start + Math.sign(lead);
    else if (Math.abs(speed * pitch) > flick && Math.sign(speed) === Math.sign(position - start)) goal = start + Math.sign(speed);
  }
  return goal + 0;
}
