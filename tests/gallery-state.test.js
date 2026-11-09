import test from 'node:test';
import assert from 'node:assert/strict';
import { createGalleryState } from '../web/gallery-state.js';

test('next and previous controls wrap across both ends of the gallery', () => {
  const gallery = createGalleryState(3);
  assert.equal(gallery.step(-1), 2);
  assert.equal(gallery.step(1), 0);
  assert.equal(gallery.step(4), 1);
  assert.equal(gallery.step(-5), 2);
});

test('direct project selection normalizes negative indexes and keeps independent state', () => {
  const first = createGalleryState(3, -1);
  const second = createGalleryState(3);
  assert.equal(first.index, 2);
  assert.equal(first.select(6), 0);
  assert.equal(first.select(-4), 2);
  assert.equal(second.index, 0);
});

test('a six-project gallery wraps in both directions', () => {
  const gallery = createGalleryState(6);
  assert.equal(gallery.step(-1), 5);
  assert.equal(gallery.step(1), 0);
  assert.equal(gallery.step(7), 1);
  assert.equal(gallery.select(-7), 5);
});

test('rejects invalid gallery size and invalid selection without losing state', () => {
  for (const count of [0, -1, 1.5, NaN]) {
    assert.throws(() => createGalleryState(count), RangeError);
  }
  const gallery = createGalleryState(3, 1);
  for (const value of [NaN, Infinity, 0.5, '1']) {
    assert.throws(() => gallery.select(value), TypeError);
    assert.equal(gallery.index, 1);
  }
});

test('ribbon positions wrap continuously so every card keeps one place on the ribbon', async () => {
  const { wrapOffset, wrapPosition } = await import('../web/gallery-state.js');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(index => wrapOffset(index, 0, 6)), [0, 1, 2, 3, -2, -1]);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(index => wrapPosition(index - 0.25, 6)), [-0.25, 0.75, 1.75, 2.75, -2.25, -1.25]);
  assert.equal(wrapPosition(7.5, 6), 1.5);
  assert.equal(wrapPosition(-7.5, 6), -1.5);
  assert.equal(wrapPosition(3, 6), -3, 'the opposite card sits at one end of the range');
  assert.equal(Object.is(wrapPosition(-6, 6), -0), false);
  assert.equal(wrapPosition(NaN, 6), 0);
});

test('ribbon geometry keeps the viewer inside the curve and scales by device tier', async () => {
  const { ribbonGeometry, ribbonProjection, VIEW_DEPTH, COVER_RATIO } = await import('../web/gallery-state.js');
  const desktop = ribbonGeometry(1440);
  const tablet = ribbonGeometry(768);
  const phone = ribbonGeometry(390);
  assert.deepEqual([desktop.tier, tablet.tier, phone.tier], ['desktop', 'tablet', 'phone']);
  assert.ok(phone.strips < tablet.strips && tablet.strips < desktop.strips, 'fewer strips on smaller screens');
  assert.ok(phone.radius < tablet.radius && tablet.radius < desktop.radius, 'smaller radius on phones');
  for (const geometry of [desktop, tablet, phone]) {
    assert.ok(Math.abs(geometry.height - geometry.width * COVER_RATIO) <= 1, 'covers keep their landscape ratio');
    assert.ok(geometry.perspective > geometry.radius && geometry.perspective < 2 * geometry.radius, 'viewer inside the cylinder: no strip hides another');
    assert.ok(Math.abs(geometry.perspective - geometry.radius * VIEW_DEPTH) < 0.01);
    assert.ok(geometry.reach > 1 && geometry.reach < 2, 'both neighbours show, the rest is offscreen');
    assert.ok(geometry.band > geometry.height, 'concave edges come forward, so the band is taller than a card');
  }
  // Continuous curvature: projected height grows smoothly toward the edges.
  const scales = [0, 0.1, 0.2, 0.3, 0.4, 0.5].map(theta => ribbonProjection(theta, desktop).scale);
  scales.slice(1).forEach((value, index) => assert.ok(value > scales[index]));
  assert.equal(ribbonGeometry(0).tier, 'desktop', 'unknown widths fall back to a desktop review size');
  // The other bend recedes instead.
  assert.ok(ribbonProjection(0.4, { ...desktop, bend: -1 }).scale < 1);
});

test('strips tile a card symmetrically and cards are placed around the stage centre', async () => {
  const { stripOffsets, cardCentre, ribbonGeometry } = await import('../web/gallery-state.js');
  const geometry = ribbonGeometry(1440);
  const offsets = stripOffsets(geometry.strips, geometry.width, geometry.pitch);
  assert.equal(offsets.length, geometry.strips);
  assert.ok(Math.abs(offsets[0] + offsets[offsets.length - 1]) < 0.002, 'symmetric about the card centre');
  assert.ok(offsets.every((value, index) => index === 0 || value > offsets[index - 1]));
  assert.ok(offsets[offsets.length - 1] < 0.5, 'strips stay inside their card; the gap stays empty');
  assert.deepEqual(stripOffsets(0, 100, 110), []);
  assert.equal(cardCentre(0, geometry), 0);
  assert.ok(Math.abs(cardCentre(1, geometry) + cardCentre(-1, geometry)) < 1e-9);
  assert.ok(cardCentre(1, geometry) > geometry.pitch, 'neighbours are pushed out by the curve');
});

test('neighbours sit back on the paper, captions belong to the nearest card, and offscreen cards hide', async () => {
  const { ribbonPose, NEIGHBOUR_LEVEL } = await import('../web/gallery-state.js');
  assert.deepEqual(ribbonPose(0, 1.3), { distance: 0, opacity: 1, caption: 1, far: false });
  assert.deepEqual(ribbonPose(-1, 1.3), { distance: 1, opacity: NEIGHBOUR_LEVEL, caption: 0, far: false });
  assert.equal(ribbonPose(2, 1.3).far, true);
  assert.equal(ribbonPose(1.29, 1.3).far, false);
  const half = ribbonPose(0.2, 1.3);
  assert.ok(half.opacity < 1 && half.opacity > NEIGHBOUR_LEVEL);
  assert.ok(half.caption > 0 && half.caption < 1);
  assert.equal(ribbonPose(0.5, 1.3).caption, 0, 'mid-drag neither caption competes');
});

test('settles ease out exponentially within 600–1000 ms and carry the release speed', async () => {
  const { easeOutExpo, settleDuration } = await import('../web/gallery-state.js');
  assert.equal(easeOutExpo(0), 0);
  assert.equal(easeOutExpo(1), 1);
  assert.equal(easeOutExpo(-1), 0);
  assert.equal(easeOutExpo(2), 1);
  assert.ok(easeOutExpo(0.2) > 0.75, 'most of the travel happens early');
  for (const distance of [0, 0.05, 1, 2, 5, -3]) {
    const duration = settleDuration({ distance });
    assert.ok(duration >= 600 && duration <= 1000, `${distance} cards in ${duration} ms`);
  }
  assert.ok(settleDuration({ distance: 2 }) > settleDuration({ distance: 1 }), 'longer trips take longer');
  assert.ok(settleDuration({ distance: 1, velocity: 0.01 }) < settleDuration({ distance: 1 }), 'a fast release settles sooner');
  assert.equal(settleDuration({ distance: NaN, velocity: NaN }), 640);
});

test('released drags land on the projected card, with a minimum of one for deliberate drags or flicks', async () => {
  const { releaseTarget } = await import('../web/gallery-state.js');
  const pitch = 430;
  const at = dx => -dx / pitch; // dragging left moves the ribbon toward later cards
  // The DOM test's 90px swipe with no measurable velocity still advances one card.
  assert.equal(releaseTarget({ origin: 0, position: at(-90), pitch }), 1);
  assert.equal(releaseTarget({ origin: 0, position: at(90), pitch }), -1);
  assert.equal(releaseTarget({ origin: 0, position: at(-30), pitch }), 0, 'small drags settle back');
  assert.equal(releaseTarget({ origin: 0, position: at(-30), velocity: 0.9 / pitch, pitch }), 1, 'a quick flick advances');
  assert.equal(releaseTarget({ origin: 0, position: at(-500), velocity: 2 / pitch, pitch }), 2, 'momentum can carry further');
  assert.equal(releaseTarget({ origin: 0, position: at(-3000), velocity: 9 / pitch, pitch }), 9, 'never more than two past the release point');
  assert.equal(releaseTarget({ origin: 0, position: at(-200), velocity: -1 / pitch, pitch }), 0, 'reversing before release cancels');
  assert.equal(releaseTarget({ origin: 4, position: 4.3, pitch }), 5, 'works from any card');
  assert.equal(Object.is(releaseTarget({ origin: 0, position: at(10), pitch }), -0), false);
  assert.equal(releaseTarget({ origin: 2, position: 2.4, pitch: 0 }), 2);
});
