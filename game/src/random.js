// Deterministic random numbers. The city, traffic, pedestrians and staged shots draw from
// independent streams, so adding one pedestrian cannot move a building on the next seed.

export function createRandom(seed) {
  let state = (Number(seed) | 0) || 0x51f15e;

  // mulberry32: a compact, repeatable 32-bit generator with a full 2^32 period.
  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }

  next.range = (low, high) => low + next() * (high - low);
  next.int = (low, high) => Math.floor(low + next() * (high - low + 1));
  next.pick = (items) => items[Math.floor(next() * items.length)];
  next.chance = (probability) => next() < probability;
  next.stream = (salt) => createRandom((state ^ Math.imul(salt + 1, 0x9e3779b1)) | 0);
  return next;
}

export function hashSeed(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

// Shortest signed turn from one angle to another, in radians.
export function angleDelta(from, to) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
