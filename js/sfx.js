/* TT Blocks: the game's own sounds, all synthesised through Kit.sound (so the one mute switch silences them, and
   they're silent no-ops until the first tap starts the sound). */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const S = () => Kit.sound;
  let last = {};
  // the same sound at most every `gap` seconds (holding a button down, a flock of chicks)
  const limit = (k, gap) => { const t = BT.now() / 1000; if (last[k] && t - last[k] < gap) return false; last[k] = t; return true; };
  BT.sfx = {
    place(id) {
      if (!limit('place', 0.05)) return;
      const glassy = id === BT.blocks.ID.glass;
      S().tone({ type: glassy ? 'sine' : 'triangle', f: glassy ? 1400 : 420, to: glassy ? 1800 : 300, dur: 0.09, vol: 0.18 });
      S().hiss({ filter: 'lowpass', f: 1800, to: 600, dur: 0.05, vol: 0.05 });
    },
    dig(id) {
      if (!limit('dig', 0.05)) return;
      const B = BT.blocks.ID;
      const soft = id === B.grass || id === B.dirt || id === B.sand || id === B.leaves || id === B.snow;
      S().hiss({ filter: 'bandpass', f: soft ? 900 : 2200, to: soft ? 500 : 1200, q: 1.2, dur: 0.14, vol: 0.22 });
      S().tone({ type: 'square', f: soft ? 160 : 240, to: 110, dur: 0.07, vol: 0.05, lp: 900 });
      if (id === B.glass) S().tone({ type: 'sine', f: 2200, to: 1600, dur: 0.18, vol: 0.06, at: 0.03 });
    },
    nope() { if (limit('nope', 0.3)) S().tone({ type: 'sine', f: 220, to: 180, dur: 0.12, vol: 0.06 }); },
    jump() { S().jump(); },
    fly(on) { S().tone({ type: 'sine', f: on ? 400 : 800, to: on ? 900 : 380, dur: 0.25, vol: 0.12 }); S().hiss({ f: 1200, to: on ? 3500 : 700, dur: 0.3, vol: 0.06 }); },
    pick() { S().click(); },
    star(n) {
      S().coin(n * 3);
      [1319, 1568, 2093].forEach((f, i) => S().tone({ type: 'triangle', f, at: 0.08 + i * 0.07, dur: 0.2, vol: 0.12 }));
    },
    quest() {
      S().powerup();
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => S().tone({ type: i < 4 ? 'square' : 'triangle', f, at: 0.15 + i * 0.12, dur: i === 5 ? 0.5 : 0.14, vol: 0.09, lp: 3000 }));
    },
    pop() { S().tone({ type: 'sine', f: 300, to: 900, dur: 0.16, vol: 0.14 }); S().hiss({ f: 2000, to: 5000, dur: 0.2, vol: 0.06 }); },
    clap() { S().hiss({ filter: 'bandpass', f: 1800, q: 0.8, dur: 0.08, vol: 0.3 }); S().hiss({ filter: 'bandpass', f: 2200, q: 0.8, dur: 0.08, vol: 0.25, at: 0.12 }); },
    treat() { S().coin(6); },
    build() { if (limit('build', 0.07)) S().tone({ type: 'triangle', f: 500 + Math.random() * 400, dur: 0.05, vol: 0.07 }); },
    undo() { S().tone({ type: 'triangle', f: 700, to: 320, dur: 0.15, vol: 0.12 }); },
    tool(on) { S().tone({ type: 'sine', f: on ? 660 : 440, to: on ? 990 : 330, dur: 0.1, vol: 0.1 }); },
    corner() { S().tone({ type: 'square', f: 880, dur: 0.06, vol: 0.06, lp: 2500 }); },
    animal(kind, say) {
      if (!limit('a:' + kind, kind === 'chick' ? 0.6 : 1.2)) return;
      if (say === 'baa') {
        S().tone({ type: 'sawtooth', f: 430, to: 380, dur: 0.45, vol: 0.06, lp: 1400 });
        S().tone({ type: 'sawtooth', f: 445, to: 390, dur: 0.4, vol: 0.04, lp: 1200, at: 0.04 });
      } else if (say === 'peep') {
        S().tone({ type: 'sine', f: 2300, to: 2900, dur: 0.07, vol: 0.06 });
        S().tone({ type: 'sine', f: 2400, to: 3000, dur: 0.07, vol: 0.05, at: 0.11 });
      } else if (say === 'meow') {
        S().tone({ type: 'triangle', f: 620, to: 900, dur: 0.18, vol: 0.09 });
        S().tone({ type: 'triangle', f: 900, to: 520, dur: 0.3, vol: 0.08, at: 0.17 });
      } else if (say === 'purr') {
        S().hiss({ filter: 'lowpass', f: 180, to: 140, q: 2, dur: 0.9, vol: 0.12 });
      }
    },
  };
})();
