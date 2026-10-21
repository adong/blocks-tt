/* TT Blocks: small shared helpers. No Three.js and no page in here, so the world, the mesher, the quests and the
   saves all run headless in node (tools/check.js) as well as in the browser.
     BT.rng(seed)     a seeded random number generator (mulberry32): the same seed always gives the same numbers
     BT.hash(text)    a 32-bit hash, for seeds typed as words
     BT.noise(seed)   smooth 2D value noise in 0..1, and .fbm(x, y, octaves)
     BT.SAB           sabotage switches, set only by the check (js/check.js) to prove it can fail
     BT.now()         milliseconds, for the frame-time budget */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  BT.SAB = {};

  function hash(s) {
    let h = 2166136261 >>> 0;
    s = String(s);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function rng(seed) {
    let a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0;
    const r = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)); // lo..hi, both included
    r.range = (lo, hi) => lo + r() * (hi - lo);
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    return r;
  }

  // value noise on a 256-wide lattice, smoothed with a quintic curve
  function noise(seed) {
    const r = rng(seed);
    const P = new Uint8Array(512), V = new Float32Array(256);
    for (let i = 0; i < 256; i++) { P[i] = i; V[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
    for (let i = 0; i < 256; i++) P[i + 256] = P[i];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const at = (x, y) => V[P[P[x & 255] + (y & 255)]];
    function n2(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const u = fade(x - xi), v = fade(y - yi);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    n2.fbm = (x, y, oct = 3) => {
      let s = 0, amp = 1, tot = 0, f = 1;
      for (let o = 0; o < oct; o++) { s += n2(x * f + o * 17.3, y * f - o * 9.1) * amp; tot += amp; amp *= 0.5; f *= 2; }
      return s / tot;
    };
    return n2;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // fun random seeds: two words and a number
  const SEED_A = ['SUNNY', 'PUFFY', 'HAPPY', 'BOUNCY', 'SPARKLY', 'COZY', 'GIGGLY', 'FLUFFY', 'ZIPPY', 'JOLLY', 'SNUGGLY', 'TWINKLY'];
  const SEED_B = ['SHEEP', 'CHICK', 'KITTY', 'CAKE', 'STAR', 'CLOUD', 'BANANA', 'ROCKET', 'PANCAKE', 'PEBBLE', 'MUFFIN', 'BUBBLE'];
  function randomSeed(r) {
    r = r || Math.random;
    return `${SEED_A[Math.floor(r() * SEED_A.length)]} ${SEED_B[Math.floor(r() * SEED_B.length)]} ${1 + Math.floor(r() * 99)}`;
  }

  Object.assign(BT, { hash, rng, noise, clamp, smooth, now, randomSeed, SEED_A, SEED_B });
})();
