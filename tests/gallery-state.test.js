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

test('card poses keep the incumbent arc at rest and interpolate while dragging', async () => {
  const { cardPose, wrapOffset } = await import('../web/gallery-state.js');
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(index => wrapOffset(index, 0, 6)), [0, 1, 2, 3, -2, -1]);
  assert.deepEqual(cardPose(0, 6), { distance: 0, opacity: 1, z: 6, far: false });
  assert.deepEqual(cardPose(-1, 6), { distance: 1, opacity: 0.65, z: 5, far: false });
  assert.deepEqual(cardPose(2, 6), { distance: 2, opacity: 0, z: 4, far: false });
  assert.equal(cardPose(3, 6).far, true);
  const between = cardPose(0.5, 6);
  assert.ok(between.opacity < 1 && between.opacity > 0.65, 'a half-dragged card sits between active and neighbour');
  assert.equal(Object.is(cardPose(-0, 6).distance, -0), false);
});

test('drag offset follows the pointer one-to-one, then resists past one card', async () => {
  const { dragOffset } = await import('../web/gallery-state.js');
  assert.equal(dragOffset(-215, 430), -0.5);
  assert.equal(dragOffset(430, 430), 1);
  assert.ok(dragOffset(860, 430) < 1.4 && dragOffset(860, 430) > 1);
  assert.equal(dragOffset(5000, 430), 1.4);
  assert.equal(dragOffset(100, 0), 0);
  assert.equal(dragOffset(NaN, 430), 0);
});

test('released drags snap to the projected card, with a minimum of one for deliberate drags or flicks', async () => {
  const { releaseSteps } = await import('../web/gallery-state.js');
  // The DOM test's 90px swipe with no measurable velocity still advances one card.
  assert.equal(releaseSteps({ dx: -90, velocity: 0, shift: 430 }), 1);
  assert.equal(releaseSteps({ dx: 90, velocity: 0, shift: 430 }), -1);
  assert.equal(releaseSteps({ dx: -30, velocity: 0, shift: 430 }), 0, 'small drags settle back');
  assert.equal(releaseSteps({ dx: -30, velocity: -0.9, shift: 430 }), 1, 'a quick flick advances');
  assert.equal(releaseSteps({ dx: -500, velocity: -2, shift: 430 }), 2, 'momentum can carry two cards');
  assert.equal(releaseSteps({ dx: -3000, velocity: -9, shift: 430 }), 2, 'never more than two');
  assert.equal(releaseSteps({ dx: -200, velocity: 1, shift: 430 }), 0, 'reversing before release cancels');
  assert.equal(Object.is(releaseSteps({ dx: 10, velocity: 0, shift: 430 }), -0), false);
  assert.equal(releaseSteps({ dx: -90, shift: 0 }), 0);
});
