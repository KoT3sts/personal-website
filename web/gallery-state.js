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
