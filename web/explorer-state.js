// Pure geometry and input rules for the project explorer (SPECIFICATION V07).
// No DOM access: web/explorer.js reads layout, calls these, and writes
// transforms. Angles are degrees, lengths CSS px, positions in projects.

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const RAD = Math.PI / 180;

export const COVER_RATIO = 620 / 900;
export const EXPLORER_TIERS = { phone: 700, desktop: 1100 };
// The ring: its diameter aims at 80% of the window height, each cover is this
// share of the radius wide, and it keeps this many px clear of the deck edges.
export const RING = { view: 0.4, cover: 0.8, pad: 8 };
// Distance from the ring's centre to a cover's outer corner, per unit radius
// (covers lie along the circle, so this bounds the ring at any spin).
const RING_SWEEP = Math.hypot(1 + (RING.cover * COVER_RATIO) / 2, RING.cover / 2);

export function explorerTier(width) {
  return width >= EXPLORER_TIERS.desktop ? 'desktop' : width >= EXPLORER_TIERS.phone ? 'tablet' : 'phone';
}

export function clampIndex(index, count) {
  if (!(count > 0)) return 0;
  const value = Math.round(Number.isFinite(index) ? index : 0);
  return clamp(value, 0, count - 1);
}

// Layout numbers for a deck of `width` x `height`. The tier follows the
// viewport width (the stylesheet's breakpoints), not the deck. Phones never
// show the ring: they get a flat vertical deck. `stackX` shifts the stack
// right of centre on desktop so the large title has the left side to itself.
// The ring is as large as the window height allows (diameter ~80% of
// `viewportHeight`), within the deck's height and, on desktop, within the room
// left of the index column (`reserve` px wide on the right); `ringX` centres it
// in that room.
export function explorerGeometry(width, height, { count = 6, viewport, viewportHeight, reserve = 0 } = {}) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const tier = explorerTier(Number.isFinite(viewport) ? viewport : w);
  const cardW = Math.round(tier === 'desktop' ? clamp(w * 0.34, 320, 560)
    : tier === 'tablet' ? clamp(w * 0.5, 280, 460)
      : clamp(w * 0.86, 220, 420));
  const cardH = Math.round(cardW * COVER_RATIO);
  const ring = tier !== 'phone';
  const side = tier === 'desktop' ? clamp(Number(reserve) || 0, 0, w / 2) : 0;
  const view = Number(viewportHeight) > 0 ? Number(viewportHeight) : h;
  const ringRadius = ring ? Math.round(Math.max(0, Math.min(
    view * RING.view,
    (h - 2 * RING.pad) / (2 + RING.cover * COVER_RATIO),
    (w - side - 2 * RING.pad) / (2 * RING_SWEEP),
  ))) : 0;
  const ringScale = ringRadius > 0 ? (ringRadius * RING.cover) / cardW : 0.5;
  return {
    tier,
    count,
    ring,
    width: w,
    height: h,
    cardW,
    cardH,
    stackX: tier === 'desktop' ? Math.round(w * 0.06) : 0,
    ringRadius,
    ringScale,
    ringX: side ? -Math.round(side / 2) : 0,
    // Vertical drum: each step turns the next cover this far round the axis.
    drumRadius: Math.round(cardH * 1.12),
    step: 34,
    // Drag distance (px) for one project.
    pitch: Math.round(tier === 'phone' ? cardW * 0.42 : cardH * 0.62),
    perspective: Math.round(Math.max(900, cardW * 3.6)),
  };
}

// Wrap an angle into (-90, 90]: a landscape cover looks the same turned 180°,
// so the ring never spins a cover more than a quarter turn into the stack.
export function halfTurn(angle) {
  let value = ((angle % 180) + 180) % 180;
  if (value > 90) value -= 180;
  return value;
}

// Ring: covers spaced evenly round the central label, the first at the top,
// each laid along the circle (tangent). `spin` turns the whole ring.
export function ringPose(index, geometry, spin = 0) {
  const count = geometry.count || 1;
  const angle = -90 + (360 * index) / count + spin;
  return {
    x: Math.cos(angle * RAD) * geometry.ringRadius + (geometry.ringX || 0),
    y: Math.sin(angle * RAD) * geometry.ringRadius,
    z: 0,
    turn: halfTurn(angle + 90),
    tilt: 0,
    scale: geometry.ringScale,
    opacity: 1,
    shade: 0,
  };
}

// Stack: `offset` is the cover's distance from the active project (negative
// above). Desktop and tablet turn the covers on a horizontal drum, so neighbours
// tip away and recede; phones use a flat deck that peeks above and below.
export function stackPose(offset, geometry) {
  const distance = Math.abs(offset);
  // Covers stay opaque so the nearer one hides the farther one; a dark shade
  // pushes neighbours back. Past about two steps they fade out.
  const opacity = clamp((2.75 - distance) / 0.75, 0, 1);
  const shade = Math.min(0.74, 0.5 * distance);
  if (!geometry.ring) {
    const lean = clamp(offset, -2.5, 2.5);
    return {
      x: 0,
      y: lean * geometry.cardH * 0.5 - Math.sign(lean) * Math.max(0, Math.abs(lean) - 1) * geometry.cardH * 0.18,
      z: 0,
      turn: 0,
      tilt: 0,
      scale: 1 - 0.13 * Math.min(distance, 2),
      opacity,
      shade,
    };
  }
  const theta = clamp(offset, -3, 3) * geometry.step;
  return {
    x: geometry.stackX,
    y: Math.sin(theta * RAD) * geometry.drumRadius,
    z: (Math.cos(theta * RAD) - 1) * geometry.drumRadius,
    turn: 0,
    tilt: -theta,
    scale: 1,
    opacity,
    shade,
  };
}

// Blend ring (mix 0) into stack (mix 1).
export function blendPose(ring, stack, mix) {
  const m = clamp(Number.isFinite(mix) ? mix : 0, 0, 1);
  return {
    x: lerp(ring.x, stack.x, m),
    y: lerp(ring.y, stack.y, m),
    z: lerp(ring.z, stack.z, m),
    turn: ring.turn * (1 - m) + stack.turn * m,
    tilt: ring.tilt * (1 - m) + stack.tilt * m,
    scale: lerp(ring.scale, stack.scale, m),
    opacity: lerp(ring.opacity, stack.opacity, m),
    shade: lerp(ring.shade || 0, stack.shade || 0, m),
  };
}

export function poseTransform(pose) {
  const n = value => (Math.abs(value) < 0.005 ? 0 : Number(value.toFixed(2)));
  return `translate3d(${n(pose.x)}px, ${n(pose.y)}px, ${n(pose.z)}px) rotateZ(${n(pose.turn)}deg) rotateX(${n(pose.tilt)}deg) scale(${Number(pose.scale.toFixed(4))})`;
}

// Front-to-back paint order: the active cover on top, then its neighbours.
export function stackOrder(offset, count) {
  return Math.max(1, count + 1 - Math.round(Math.abs(offset) * 2));
}

export function easeOutExpo(progress) {
  if (!(progress > 0)) return 0;
  if (progress >= 1) return 1;
  return (1 - Math.pow(2, -10 * progress)) / (1 - Math.pow(2, -10));
}

// Ring-to-stack cascade: the cover nearest the active one leaves first, the
// farthest one `spread` of the transition later. `progress` is linear time.
export function cascadeMix(progress, rank, count, spread = 0.24) {
  const p = clamp(Number.isFinite(progress) ? progress : 1, 0, 1);
  const share = count > 1 ? clamp(rank / (count - 1), 0, 1) : 0;
  const delay = spread * share;
  return easeOutExpo(clamp((p - delay) / (1 - spread), 0, 1));
}

// Settle time (ms) for moving the stack `distance` projects.
export function travelDuration(distance) {
  const size = Math.abs(Number.isFinite(distance) ? distance : 0);
  return Math.round(clamp(560 + 140 * Math.min(size, 3), 560, 1000));
}

// Wheel deltas in px whatever the device reports (lines, pages).
export function wheelPixels({ deltaY = 0, deltaMode = 0 } = {}, pageHeight = 800) {
  const value = Number.isFinite(deltaY) ? deltaY : 0;
  if (deltaMode === 1) return value * 16;
  if (deltaMode === 2) return value * pageHeight;
  return value;
}

// Whether the explorer can use one more wheel step in `direction` (+1 down,
// -1 up). Down from the ring opens the stack; up from the first project closes
// it again. Past the last project, or up from the ring, the page scrolls.
// Phones have no ring, so up from their first project releases at once.
export function wheelWants({ mode, index, count, direction, ring = true }) {
  if (!direction) return false;
  if (mode === 'ring') return ring && direction > 0;
  if (direction > 0) return index < count - 1;
  return index > 0 || ring;
}

// What one accumulated wheel step does.
export function wheelAction({ mode, index, count, direction, ring = true }) {
  if (!wheelWants({ mode, index, count, direction, ring })) return 'release';
  if (mode === 'ring') return 'open';
  if (direction < 0 && index <= 0) return 'close';
  return direction > 0 ? 'next' : 'previous';
}

// The page owns a wheel gesture unless it began with the explorer fully in
// view under the pointer and the explorer could use it. Once the explorer has
// used everything it can (first/last project), the rest of the gesture is the
// page's again, so scrolling never stops at either end.
export function wheelOwner({ previous = 'page', fresh, inView, wants }) {
  if (fresh) return inView && wants ? 'explorer' : 'page';
  if (previous === 'explorer') return wants ? 'explorer' : 'page';
  return 'page';
}

// Visible share of the stage (0..1); the wheel is only taken near 1.
export function visibleShare(top, bottom, viewportHeight) {
  const height = bottom - top;
  if (!(height > 0) || !(viewportHeight > 0)) return 0;
  return clamp((Math.min(bottom, viewportHeight) - Math.max(top, 0)) / height, 0, 1);
}

// Project to settle on after a drag: nearest to where a short throw would
// land, at least one step for a deliberate drag, kept within the list.
export function dragTarget({ origin, position, velocity = 0, pitch, count, threshold = 40, momentum = 160, max = 2 }) {
  const start = clampIndex(origin, count);
  if (!Number.isFinite(position) || !(pitch > 0)) return start;
  const projected = position + (Number.isFinite(velocity) ? velocity : 0) * momentum;
  const nearest = Math.round(position);
  let goal = clamp(Math.round(projected), nearest - max, nearest + max);
  if (goal === start && Math.abs((projected - start) * pitch) > threshold) goal = start + Math.sign(projected - start);
  return clampIndex(goal, count);
}

// Keys that move the selection; the result is the new index (or null).
export function keyTarget(key, index, count) {
  switch (key) {
    case 'ArrowDown': case 'ArrowRight': return clampIndex(index + 1, count);
    case 'ArrowUp': case 'ArrowLeft': return clampIndex(index - 1, count);
    case 'Home': return 0;
    case 'End': return clampIndex(count - 1, count);
    default: return null;
  }
}

export function counterLabel(index, count) {
  const pad = value => String(value).padStart(2, '0');
  return `${pad(index + 1)} / ${pad(count)}`;
}
