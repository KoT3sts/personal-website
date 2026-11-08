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
