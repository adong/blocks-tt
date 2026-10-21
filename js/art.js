/* TT Blocks: our own block art, painted on canvases when the page starts (no image files): soft, bright, chunky
   toy blocks. Every tile has a soft bevel (a light top-left edge, a shaded bottom-right edge, rounded inner corners)
   so the blocks look like chunky toys you could pick up.
     BT.art.tiles        one 64 x 64 canvas per tile (BT.blocks.TILE)
     BT.art.layers()     all the tiles as one Uint8Array, bottom row first, for the WebGL2 texture array
     BT.art.icon(id)     a little 3D-looking block picture (a data URL) for the hotbar and the block picker */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const S = 64;
  const T = BT.blocks.TILE;
  const COUNT = 18;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return [c, c.getContext('2d')];
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  const dot = (g, x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt));
    r = f(r); gg = f(gg); b = f(b);
    return '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1);
  }
  // the soft toy-block edge, painted over a finished tile
  function bevel(g, strength) {
    const k = strength == null ? 1 : strength;
    let gr = g.createLinearGradient(0, 0, 0, 9);
    gr.addColorStop(0, `rgba(255,255,255,${0.34 * k})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, 9);
    gr = g.createLinearGradient(0, 0, 9, 0);
    gr.addColorStop(0, `rgba(255,255,255,${0.22 * k})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 9, S);
    gr = g.createLinearGradient(0, S, 0, S - 10);
    gr.addColorStop(0, `rgba(40,20,60,${0.3 * k})`); gr.addColorStop(1, 'rgba(40,20,60,0)');
    g.fillStyle = gr; g.fillRect(0, S - 10, S, 10);
    gr = g.createLinearGradient(S, 0, S - 10, 0);
    gr.addColorStop(0, `rgba(40,20,60,${0.22 * k})`); gr.addColorStop(1, 'rgba(40,20,60,0)');
    g.fillStyle = gr; g.fillRect(S - 10, 0, 10, S);
    g.strokeStyle = `rgba(255,255,255,${0.16 * k})`;
    g.lineWidth = 3;
    rr(g, 5, 5, S - 10, S - 10, 12);
    g.stroke();
    g.strokeStyle = `rgba(30,20,50,${0.2 * k})`;
    g.lineWidth = 2;
    g.strokeRect(1, 1, S - 2, S - 2);
  }
  function blobs(g, r, n, rmin, rmax, colors, alpha) {
    g.globalAlpha = alpha == null ? 1 : alpha;
    for (let i = 0; i < n; i++) dot(g, r() * S, r() * S, rmin + r() * (rmax - rmin), colors[i % colors.length]);
    g.globalAlpha = 1;
  }

  const PAINT = {
    [T.grassTop](g, r) {
      g.fillStyle = '#6fd45a'; g.fillRect(0, 0, S, S);
      blobs(g, r, 18, 3, 7, ['#86e06c', '#5cc24a', '#7ddc63'], 0.75);
      for (let i = 0; i < 2; i++) { const x = 10 + r() * 44, y = 10 + r() * 44; for (let k = 0; k < 5; k++) dot(g, x + Math.cos(k * 1.26) * 3, y + Math.sin(k * 1.26) * 3, 2.2, '#fffbe8'); dot(g, x, y, 2, '#ffd23f'); }
      bevel(g, 0.8);
    },
    [T.grassSide](g, r) {
      PAINT[T.dirt](g, r, true);
      g.fillStyle = '#58b947';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(S, 0); g.lineTo(S, 20);
      for (let x = S; x >= 0; x -= 16) g.arc(x - 8, 20, 8, 0, Math.PI, false);
      g.closePath(); g.fill();
      g.fillStyle = '#6fd45a';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(S, 0); g.lineTo(S, 16);
      for (let x = S; x >= 0; x -= 16) g.arc(x - 8, 16, 8, 0, Math.PI, false);
      g.closePath(); g.fill();
      blobs(g, r, 6, 2, 4, ['#86e06c'], 0.7);
      bevel(g);
    },
    [T.dirt](g, r, noBevel) {
      g.fillStyle = '#b5814f'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = i % 2 ? '#9c6b3e' : '#c99463';
        g.beginPath(); g.ellipse(r() * S, r() * S, 2.5 + r() * 3.5, 2 + r() * 2.5, r() * 3, 0, Math.PI * 2); g.fill();
      }
      if (noBevel !== true) bevel(g);
    },
    [T.stone](g, r) {
      g.fillStyle = '#979cad'; g.fillRect(0, 0, S, S);
      const rocks = [[3, 3, 30, 22], [35, 3, 26, 17], [3, 27, 20, 34], [25, 27, 36, 15], [37, 23, 24, 0], [25, 44, 18, 17], [45, 44, 16, 17]];
      for (const [x, y, w, h] of rocks) {
        if (!h) continue;
        g.fillStyle = r() < 0.5 ? '#aeb3c2' : '#a6abba';
        rr(g, x, y, w, h, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.22)'; rr(g, x + 3, y + 2, w - 8, 4, 2); g.fill();
      }
      bevel(g);
    },
    [T.sand](g, r) {
      g.fillStyle = '#f6dd9a'; g.fillRect(0, 0, S, S);
      blobs(g, r, 46, 1, 2.2, ['#e8c97c', '#fff0bf', '#edd08a'], 0.9);
      bevel(g, 0.8);
    },
    [T.woodSide](g, r) {
      g.fillStyle = '#a8723f'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 6; i++) {
        const x = 5 + i * 11 + r() * 3;
        g.strokeStyle = i % 2 ? '#8d5c30' : '#bd8550';
        g.lineWidth = i % 2 ? 4 : 3;
        g.beginPath(); g.moveTo(x, 0);
        g.bezierCurveTo(x + 3, 20, x - 3, 44, x + 1, S); g.stroke();
      }
      dot(g, 20 + r() * 20, 30 + r() * 10, 4, '#7a4e28');
      bevel(g);
    },
    [T.woodTop](g) {
      g.fillStyle = '#9a6535'; g.fillRect(0, 0, S, S);
      dot(g, 32, 32, 27, '#e7b877');
      g.strokeStyle = '#c99556'; g.lineWidth = 2.5;
      for (const rad of [8, 15, 21]) { g.beginPath(); g.arc(32, 32, rad, 0, Math.PI * 2); g.stroke(); }
      dot(g, 32, 32, 3, '#c99556');
      bevel(g);
    },
    [T.leaves](g, r) {
      g.fillStyle = '#44b553'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 13; i++) {
        const x = r() * S, y = r() * S, rad = 8 + r() * 6;
        dot(g, x, y, rad, i % 3 === 0 ? '#3aa449' : i % 3 === 1 ? '#57c964' : '#4cc05a');
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, rad - 3, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
      }
      bevel(g);
    },
    [T.planks](g, r) {
      g.fillStyle = '#e0a95e'; g.fillRect(0, 0, S, S);
      for (let b = 0; b < 3; b++) {
        const y = b * 21.33;
        g.fillStyle = b % 2 ? '#e7b36b' : '#dba257';
        rr(g, 1, y + 1.5, S - 2, 18.5, 5); g.fill();
        g.strokeStyle = 'rgba(160,100,40,0.35)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(8, y + 8 + r() * 4); g.bezierCurveTo(24, y + 6, 40, y + 14, 58, y + 9); g.stroke();
        const sx = 14 + ((b * 23) % 36);
        g.fillStyle = 'rgba(150,90,35,0.55)'; g.fillRect(sx, y + 2, 2.5, 18);
        dot(g, 5, y + 10.5, 1.8, '#a87035'); dot(g, S - 5, y + 10.5, 1.8, '#a87035');
      }
      g.fillStyle = 'rgba(140,85,30,0.6)'; g.fillRect(0, 20.5, S, 2.5); g.fillRect(0, 41.8, S, 2.5);
      bevel(g);
    },
    [T.glass](g) {
      g.clearRect(0, 0, S, S);
      g.fillStyle = 'rgba(205,240,255,0.18)'; g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(235,251,255,0.95)'; g.lineWidth = 7;
      rr(g, 3.5, 3.5, S - 7, S - 7, 9); g.stroke();
      g.strokeStyle = 'rgba(130,200,235,0.9)'; g.lineWidth = 2;
      rr(g, 7.5, 7.5, S - 15, S - 15, 6); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.moveTo(14, 40); g.lineTo(40, 14); g.lineTo(48, 14); g.lineTo(14, 48); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(26, 46); g.lineTo(46, 26); g.lineTo(49, 26); g.lineTo(29, 46); g.closePath(); g.fill();
    },
    [T.brick](g) {
      g.fillStyle = '#f2d6c4'; g.fillRect(0, 0, S, S);
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? -15 : 0;
        for (let k = -1; k < 3; k++) {
          const x = off + k * 32 + 2, y = row * 16 + 2;
          g.fillStyle = (row + k) % 3 === 0 ? '#e9765c' : '#e2674e';
          rr(g, x, y, 28, 12, 4); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.25)'; rr(g, x + 3, y + 2, 18, 3, 1.5); g.fill();
        }
      }
      bevel(g, 0.8);
    },
    [T.lamp](g) {
      g.fillStyle = '#b9852a'; g.fillRect(0, 0, S, S);
      const gr = g.createRadialGradient(32, 32, 3, 32, 32, 30);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#fff3b0'); gr.addColorStop(0.75, '#ffd23f'); gr.addColorStop(1, '#ffad2a');
      g.fillStyle = gr; rr(g, 8, 8, S - 16, S - 16, 10); g.fill();
      g.fillStyle = 'rgba(185,133,42,0.85)'; g.fillRect(30, 8, 4, S - 16); g.fillRect(8, 30, S - 16, 4);
      bevel(g, 0.7);
    },
    [T.water](g, r) {
      g.clearRect(0, 0, S, S);
      g.fillStyle = 'rgba(66,170,235,0.74)'; g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(170,228,255,0.85)'; g.lineWidth = 3; g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const y = 8 + i * 12 + r() * 4, x = r() * 30;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 7, y - 5, x + 14, y); g.quadraticCurveTo(x + 21, y + 5, x + 28, y); g.stroke();
      }
      blobs(g, r, 6, 1, 1.8, ['rgba(255,255,255,0.9)']);
    },
    [T.snow](g, r) {
      g.fillStyle = '#f4fbff'; g.fillRect(0, 0, S, S);
      blobs(g, r, 12, 4, 8, ['#e3f1fb', '#ffffff'], 0.8);
      for (let i = 0; i < 5; i++) { const x = r() * S, y = r() * S; g.fillStyle = '#b8e2ff'; g.fillRect(x - 0.8, y - 3, 1.6, 6); g.fillRect(x - 3, y - 0.8, 6, 1.6); }
      bevel(g, 0.7);
    },
  };
  // the four bright colour blocks: glossy toy blocks
  for (const [tile, col] of [[T.red, '#ff5a6e'], [T.yellow, '#ffd23f'], [T.blue, '#3fa2ff'], [T.pink, '#ff8fd0']]) {
    PAINT[tile] = (g) => {
      g.fillStyle = col; g.fillRect(0, 0, S, S);
      g.fillStyle = shade(col, 0.14); rr(g, 9, 9, S - 18, S - 18, 11); g.fill();
      g.fillStyle = shade(col, 0.07); rr(g, 14, 14, S - 28, S - 28, 8); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; rr(g, 13, 12, 16, 6, 3); g.fill();
      dot(g, 35, 15, 3, 'rgba(255,255,255,0.6)');
      bevel(g, 1.1);
    };
  }

  const tiles = [];
  function paint() {
    for (let t = 0; t < COUNT; t++) {
      const [c, g] = canvas(S);
      const r = BT.rng('tile' + t);
      g.clearRect(0, 0, S, S);
      if (PAINT[t]) PAINT[t](g, r);
      tiles[t] = c;
    }
  }

  function layers() {
    const data = new Uint8Array(S * S * 4 * COUNT);
    for (let t = 0; t < COUNT; t++) {
      const px = tiles[t].getContext('2d').getImageData(0, 0, S, S).data;
      // GL's first row is the bottom one
      for (let y = 0; y < S; y++) data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), (t * S + y) * S * 4);
    }
    return data;
  }
  // all tiles side by side in one canvas (8 x 4), for browsers without WebGL2
  function atlas() {
    const [c, g] = canvas(S * 8, S * 4);
    for (let t = 0; t < COUNT; t++) g.drawImage(tiles[t], (t % 8) * S, Math.floor(t / 8) * S);
    return c;
  }

  // a block's picture: top, left and right faces of a little cube
  const icons = {};
  function icon(id, size) {
    size = size || 96;
    const key = id + ':' + size;
    if (icons[key]) return icons[key];
    const b = BT.blocks.get(id);
    if (!b || !b.tiles) return '';
    const [c, g] = canvas(size);
    const u = size / 2, h = size * 0.25;
    const face = (tile, m, dark) => {
      g.save();
      g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      g.drawImage(tiles[tile], 0, 0, S, S, 0, 0, 1, 1);
      if (dark) { g.fillStyle = `rgba(20,10,40,${dark})`; g.fillRect(0, 0, 1, 1); }
      g.restore();
    };
    const top = size * 0.08;
    // top: (u, top) -> right (2u, top + h) -> bottom (u, top + 2h) -> left (0, top + h)
    face(b.tiles.top, [u * 0.96, h * 0.96, -u * 0.96, h * 0.96, u, top], 0);
    face(b.tiles.side, [u * 0.96, h * 0.96, 0, u * 0.9, size * 0.02, top + h], 0.18);
    face(b.tiles.side, [u * 0.96, -h * 0.96, 0, u * 0.9, u, top + 2 * h * 0.96], 0.32);
    icons[key] = c.toDataURL('image/png');
    return icons[key];
  }

  BT.art = { S, COUNT, tiles, paint, layers, atlas, icon, shade, rr, canvas };
})();
