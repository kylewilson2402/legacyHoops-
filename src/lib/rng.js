// Seeded PRNG (mulberry32) + helpers. Deterministic per seed so a career's
// generation and simulation are fully reproducible.
//
// Usage:
//   const rng = makeRng(seed);
//   rng.next()                 -> float [0,1)
//   rng.randInt(1, 6)          -> int inclusive
//   rng.pick(['a','b','c'])    -> element
//   rng.weighted([['a',3],['b',1]]) -> weighted element
//   rng.gaussianClamp(70,10,40,99)  -> clamped normal int

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed) {
  const next = mulberry32(seed);

  // Integer in [min, max] inclusive.
  function randInt(min, max) {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function pick(arr) {
    return arr[Math.floor(next() * arr.length)];
  }

  // weighted([[value, weight], ...]) — weights need not sum to 1.
  function weighted(pairs) {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let r = next() * total;
    for (const [value, w] of pairs) {
      if ((r -= w) < 0) return value;
    }
    return pairs[pairs.length - 1][0];
  }

  // Normally distributed int (Box–Muller), clamped to [min,max].
  function gaussianClamp(mean, sd, min, max) {
    let u = 0, v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const val = Math.round(mean + z * sd);
    return Math.max(min, Math.min(max, val));
  }

  // Shuffle a copy of arr (Fisher–Yates) — useful for schedule generation.
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function chance(p) { return next() < p; }

  return { next, randInt, pick, weighted, gaussianClamp, shuffle, chance };
}

module.exports = { makeRng, mulberry32 };
