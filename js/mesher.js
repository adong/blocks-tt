/* TT Blocks: turning a 16 x 16 x 16 chunk of blocks into one mesh, with only the faces you can see.
   For each of the 6 directions and each of the 16 slices, every block face that's showing (BT.blocks.faceVisible)
   goes in a 16 x 16 mask, keyed by its tile, its pass (solid or see-through) and its corner shading. Then greedy
   meshing grows each face into the biggest rectangle of matching faces it can, so a flat meadow is a few big quads
   instead of hundreds of little ones (the shader repeats the tile once per block, so it looks the same).
   Corner shading: each corner of a face gets soft shadow from the blocks around it (ambient occlusion) and the
   average sunlight and lamplight of the cells in front of it. A face whose 4 corners differ can't be stretched
   without smudging that, so it's drawn on its own.
   No Three.js: it returns plain arrays, and the check (js/check.js) counts its faces headless. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const Bk = BT.blocks;
  const { OPAQUE, PASS, TILES, faceVisible, AIR } = Bk;
  const S = 16;
  // directions: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
  const NRM = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const UAX = [2, 2, 0, 0, 0, 0], VAX = [1, 1, 2, 2, 1, 1]; // the face's own two axes
  const SHADE = [0.84, 0.84, 1.0, 0.58, 0.92, 0.74];
  const AOF = [0.5, 0.68, 0.84, 1.0];
  // U x V points along -x for x faces, -y for y faces, +z for z faces: flip the winding to face outward
  const CROSS = [-1, -1, -1, -1, 1, 1];

  function meshChunk(world, cx, cy, cz, opts) {
    opts = opts || {};
    const W = BT.W, H = BT.H, D = BT.D, SEA = BT.SEA, MAXL = BT.MAXL;
    const blocks = world.blocks, sky = world.sky, lamp = world.lamp;
    const ox = cx * S, oy = cy * S, oz = cz * S;
    const getB = (x, y, z) => {
      if (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D) return blocks[x + W * (z + D * y)];
      if (y < 0) return Bk.ID.stone;
      return y < SEA ? Bk.ID.stone : AIR;
    };
    const skyAt = (x, y, z) => {
      if (y >= H) return MAXL;
      if (x >= 0 && y >= 0 && z >= 0 && x < W && z < D) return sky[x + W * (z + D * y)];
      return y >= SEA ? MAXL : 0;
    };
    const lampAt = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D ? lamp[x + W * (z + D * y)] : 0);
    const out = [newPass(), newPass()];
    const debug = opts.debug ? [] : null;
    const mask = new Int32Array(S * S);
    const c = [0, 0, 0];
    const corner = new Int32Array(4);
    let dropped = false, doubled = false;

    for (let d = 0; d < 6; d++) {
      const a = d >> 1, u = UAX[d], v = VAX[d], n = NRM[d];
      const sgn = d & 1 ? -1 : 1;
      for (let k = 0; k < S; k++) {
        mask.fill(0);
        for (let j = 0; j < S; j++)
          for (let i = 0; i < S; i++) {
            c[a] = k; c[u] = i; c[v] = j;
            const x = ox + c[0], y = oy + c[1], z = oz + c[2];
            if (y >= H) continue;
            const b = getB(x, y, z);
            if (b === AIR) continue;
            const fx = x + n[0], fy = y + n[1], fz = z + n[2];
            const nb = getB(fx, fy, fz);
            if (!faceVisible(b, nb)) {
              // sabotage: draw one face that should be hidden
              if (BT.SAB.meshDouble && !doubled && OPAQUE[b] && OPAQUE[nb] && nb !== AIR) {
                doubled = true;
                emit(d, k, i, j, 1, 1, TILES[b * 6 + d], PASS[b], [-1, -1, -1, -1]);
              }
              continue;
            }
            if (BT.SAB.meshDrop && !dropped) { dropped = true; continue; }
            // the corners: (0,0) (1,0) (1,1) (0,1) in the face's u, v
            for (let q = 0; q < 4; q++) {
              const du = q === 1 || q === 2 ? 1 : -1, dv = q >= 2 ? 1 : -1;
              const p1 = [fx, fy, fz], p2 = [fx, fy, fz], p3 = [fx, fy, fz];
              p1[u] += du; p2[v] += dv; p3[u] += du; p3[v] += dv;
              const s1 = OPAQUE[getB(p1[0], p1[1], p1[2])], s2 = OPAQUE[getB(p2[0], p2[1], p2[2])];
              const s3 = s1 && s2 ? 1 : OPAQUE[getB(p3[0], p3[1], p3[2])];
              const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
              let ls = skyAt(fx, fy, fz), ll = lampAt(fx, fy, fz), cnt = 1;
              if (!s1) { ls += skyAt(p1[0], p1[1], p1[2]); ll += lampAt(p1[0], p1[1], p1[2]); cnt++; }
              if (!s2) { ls += skyAt(p2[0], p2[1], p2[2]); ll += lampAt(p2[0], p2[1], p2[2]); cnt++; }
              if (!s3) { ls += skyAt(p3[0], p3[1], p3[2]); ll += lampAt(p3[0], p3[1], p3[2]); cnt++; }
              const qs = Math.round((ls / cnt) * 1.5), ql = Math.round((ll / cnt) * 1.5);
              corner[q] = ao | (qs << 2) | (ql << 6);
            }
            const tile = TILES[b * 6 + d], pass = PASS[b];
            if (corner[0] === corner[1] && corner[0] === corner[2] && corner[0] === corner[3]) {
              mask[i + j * S] = 1 + (tile | (pass << 5) | (corner[0] << 6));
            } else {
              emit(d, k, i, j, 1, 1, tile, pass, [corner[0], corner[1], corner[2], corner[3]]);
            }
          }
        // greedy: grow each face right, then up, over faces with the same key
        for (let j = 0; j < S; j++)
          for (let i = 0; i < S; ) {
            const key = mask[i + j * S];
            if (!key) { i++; continue; }
            let w = 1;
            while (i + w < S && mask[i + w + j * S] === key) w++;
            let h = 1;
            grow: while (j + h < S) {
              for (let q = 0; q < w; q++) if (mask[i + q + (j + h) * S] !== key) break grow;
              h++;
            }
            for (let jj = 0; jj < h; jj++) for (let ii = 0; ii < w; ii++) mask[i + ii + (j + jj) * S] = 0;
            const kk = key - 1, cv = kk >> 6;
            emit(d, k, i, j, w, h, kk & 31, (kk >> 5) & 1, [cv, cv, cv, cv]);
            i += w;
          }
      }
    }

    function emit(d, k, i, j, w, h, tile, pass, cv) {
      const P = out[pass];
      const a = d >> 1, u = UAX[d], v = VAX[d];
      const plane = (d & 1 ? k : k + 1);
      const base = P.pos.length / 3;
      const us = [i, i + w, i + w, i], vs = [j, j, j + h, j + h];
      const aos = [];
      for (let q = 0; q < 4; q++) {
        const p = [0, 0, 0];
        p[a] = plane; p[u] = us[q]; p[v] = vs[q];
        P.pos.push(ox + p[0], oy + p[1], oz + p[2]);
        P.uv.push(us[q], vs[q]);
        const val = cv[q];
        const ao = val < 0 ? 3 : val & 3, qs = val < 0 ? 15 : (val >> 2) & 15, ql = val < 0 ? 0 : (val >> 6) & 15;
        aos.push(ao);
        P.info.push(tile, SHADE[d] * AOF[ao], qs / 15, ql / 15);
      }
      // split along the diagonal with less shadow difference, so corner shading doesn't streak
      const flip = aos[0] + aos[2] < aos[1] + aos[3];
      const outward = CROSS[d] === (d & 1 ? -1 : 1);
      let tri = flip ? [0, 1, 3, 1, 2, 3] : [0, 1, 2, 0, 2, 3];
      if (!outward) tri = flip ? [0, 3, 1, 1, 3, 2] : [0, 2, 1, 0, 3, 2];
      for (const t of tri) P.index.push(base + t);
      P.quads++;
      P.faces += w * h;
      if (debug) debug.push({ d, k, i, j, w, h, pass });
    }

    return { cx, cy, cz, passes: out, quads: debug };
  }
  function newPass() { return { pos: [], uv: [], info: [], index: [], quads: 0, faces: 0 }; }

  // the faces a chunk should show, counted the slow way (one block at a time), for the check
  function expectedFaces(world, cx, cy, cz) {
    const set = new Map();
    const ox = cx * S, oy = cy * S, oz = cz * S;
    for (let d = 0; d < 6; d++) {
      const a = d >> 1, u = UAX[d], v = VAX[d], n = NRM[d];
      for (let k = 0; k < S; k++)
        for (let j = 0; j < S; j++)
          for (let i = 0; i < S; i++) {
            const c = [0, 0, 0];
            c[a] = k; c[u] = i; c[v] = j;
            const x = ox + c[0], y = oy + c[1], z = oz + c[2];
            if (y >= BT.H) continue;
            const b = world.get(x, y, z);
            if (faceVisible(b, world.get(x + n[0], y + n[1], z + n[2]))) set.set(`${d},${k},${i},${j}`, PASS[b]);
          }
    }
    return set;
  }

  BT.mesher = { meshChunk, expectedFaces, S, NRM, UAX, VAX };
})();
