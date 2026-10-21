/* TT Blocks: the world. A small island, 96 x 96 blocks and 48 high, made from a seed (the same seed always makes the
   same island): hills, a beach all round, a mountain with a snowy top, trees, a pond and a little cave in the
   mountainside. Five golden stars are hidden on it, and the friendly animals' homes are picked here too.
   No Three.js in here: the check runs it headless in node.
     blocks   one byte per block (BT.blocks ids), x + W * (z + D * y)
     base     the island as it was made: a save only keeps the blocks that differ from it
     sky      sunlight, 0..10, spreading from the open sky (darker in the cave and under trees)
     lamp     lamplight, 0..10, spreading from the lamps
   Every change goes through setMany(), which relights just the area around it and marks the chunks (16 x 16 x 16
   pieces of the world, each drawn as one mesh) that need drawing again: the changed block's chunk and its neighbours
   when the block is on a chunk's edge, plus every chunk whose light changed. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const B = BT.blocks;
  const ID = B.ID, AIR = B.AIR, OPAQUE = B.OPAQUE, GLOW = B.GLOW, SOLID = B.SOLID;
  const W = 96, H = 48, D = 96, SEA = 12, CS = 16, CX = W / CS, CY = H / CS, CZ = D / CS, MAXL = 10;
  const N = W * H * D;
  const SNOWLINE = 31;
  const idx = (x, y, z) => x + W * (z + D * y);

  function World(seedText) {
    this.seedText = String(seedText == null ? 'SUNNY SHEEP 1' : seedText).trim().toUpperCase() || 'SUNNY SHEEP 1';
    this.seed = BT.hash('blocks-tt|' + this.seedText);
    this.blocks = new Uint8Array(N);
    this.sky = new Uint8Array(N);
    this.lamp = new Uint8Array(N);
    this.dirty = new Set();
    this.version = 0; // goes up with every change, for "did anything change since I saved?"
    this.gen();
    this.base = this.blocks.slice();
    this.relight(0, 0, W - 1, D - 1, true);
    this.markAll();
  }

  World.prototype.inside = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;
  // outside the world: stone below (so you never see under it), sea all round (the ocean is drawn beyond the edge)
  World.prototype.get = function (x, y, z) {
    if (x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D) return this.blocks[x + W * (z + D * y)];
    if (y < 0) return ID.stone;
    return y < SEA ? ID.stone : AIR;
  };
  World.prototype.solidAt = function (x, y, z) {
    if (x < 0 || z < 0 || x >= W || z >= D) return false;
    if (y < 0) return true;
    if (y >= H) return false;
    return SOLID[this.blocks[x + W * (z + D * y)]] === 1;
  };
  // a block a player (or the brother) put there: different from the island as it was made
  World.prototype.placed = function (i) { const b = this.blocks[i]; return b !== AIR && b !== ID.water && b !== this.base[i]; };
  World.prototype.placedAt = function (x, y, z) { return this.inside(x, y, z) && this.placed(idx(x, y, z)); };

  // ---------- chunks ----------
  const chunkId = (cx, cy, cz) => cx + CX * (cz + CZ * cy);
  World.prototype.markAll = function () { for (let i = 0; i < CX * CY * CZ; i++) this.dirty.add(i); };
  World.prototype.markBox = function (x0, y0, z0, x1, y1, z1) {
    const a = (v, m) => Math.max(0, Math.min(m - 1, Math.floor(v / CS)));
    for (let cy = a(y0, CY); cy <= a(y1, CY); cy++)
      for (let cz = a(z0, CZ); cz <= a(z1, CZ); cz++)
        for (let cx = a(x0, CX); cx <= a(x1, CX); cx++) this.dirty.add(chunkId(cx, cy, cz));
  };

  // ---------- changing blocks ----------
  // list: [[x, y, z, id], ...]. Returns the changes made: [[index, old, new], ...] (for undo).
  World.prototype.setMany = function (list) {
    const changes = [];
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const [x, y, z, id] of list) {
      if (!this.inside(x, y, z)) continue;
      const i = idx(x, y, z);
      const old = this.blocks[i];
      if (old === id) continue;
      this.blocks[i] = id;
      changes.push([i, old, id]);
      if (BT.SAB.editNoNeighbor) this.markBox(x, y, z, x, y, z);
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z;
      if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z;
    }
    if (!changes.length) return changes;
    this.version++;
    // a face, its corner shading and its light all look one block further: the neighbours draw again too
    if (!BT.SAB.editNoNeighbor) this.markBox(x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1);
    this.relight(x0 - MAXL - 1, z0 - MAXL - 1, x1 + MAXL + 1, z1 + MAXL + 1);
    return changes;
  };
  World.prototype.set = function (x, y, z, id) { return this.setMany([[x, y, z, id]]); };
  // put changes back (undo): changes are [[index, old, new]]
  World.prototype.revert = function (changes) {
    const list = [];
    for (let k = changes.length - 1; k >= 0; k--) {
      const [i, old] = changes[k];
      list.push([i % W, Math.floor(i / (W * D)), Math.floor(i / W) % D, old]);
    }
    return this.setMany(list);
  };

  // ---------- light ----------
  // Recompute the light inside the columns x0..x1, z0..z1 (all heights). Light only travels MAXL blocks, so a change
  // can only reach that far: the cells just outside the area keep their light and shine in as sources.
  World.prototype.relight = function (x0, z0, x1, z1, quiet) {
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(W - 1, x1); z1 = Math.min(D - 1, z1);
    const rw = x1 - x0 + 1, rd = z1 - z0 + 1;
    const blocks = this.blocks, sky = this.sky, lamp = this.lamp;
    const oldSky = quiet ? null : new Uint8Array(rw * rd * H), oldLamp = quiet ? null : new Uint8Array(rw * rd * H);
    const qs = [], ql = [];
    let k = 0;
    for (let y = 0; y < H; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++, k++) {
          const i = x + W * (z + D * y);
          if (!quiet) { oldSky[k] = sky[i]; oldLamp[k] = lamp[i]; }
          sky[i] = 0;
          const g = GLOW[blocks[i]];
          lamp[i] = g;
          if (g) ql.push(i);
        }
    // sunlight falls straight down from the open sky (a little dimmer through water)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        let l = MAXL;
        for (let y = H - 1; y >= 0; y--) {
          const i = x + W * (z + D * y);
          const b = blocks[i];
          if (OPAQUE[b]) break;
          if (b === ID.water && l > 0) l--;
          sky[i] = l;
          if (l > 1) qs.push(i);
        }
      }
    // the ring just outside shines in
    const ring = (x, z) => {
      if (x < 0 || z < 0 || x >= W || z >= D) return;
      for (let y = 0; y < H; y++) {
        const i = x + W * (z + D * y);
        if (sky[i] > 1) qs.push(i);
        if (lamp[i] > 1) ql.push(i);
      }
    };
    for (let x = x0 - 1; x <= x1 + 1; x++) { ring(x, z0 - 1); ring(x, z1 + 1); }
    for (let z = z0; z <= z1; z++) { ring(x0 - 1, z); ring(x1 + 1, z); }
    const spread = (arr, q) => {
      for (let h = 0; h < q.length; h++) {
        const i = q[h];
        const l = arr[i];
        if (l <= 1) continue;
        const x = i % W, z = Math.floor(i / W) % D, y = Math.floor(i / (W * D));
        for (let n = 0; n < 6; n++) {
          let j, nx = x, ny = y, nz = z;
          if (n === 0) nx++; else if (n === 1) nx--; else if (n === 2) ny++; else if (n === 3) ny--; else if (n === 4) nz++; else nz--;
          if (nx < x0 || nx > x1 || nz < z0 || nz > z1 || ny < 0 || ny >= H) continue;
          j = nx + W * (nz + D * ny);
          const b = blocks[j];
          if (OPAQUE[b]) continue;
          const nl = l - (b === ID.water ? 2 : 1);
          if (nl > arr[j]) { arr[j] = nl; q.push(j); }
        }
      }
    };
    spread(sky, qs);
    spread(lamp, ql);
    if (quiet || BT.SAB.editNoNeighbor) return;
    // mark the chunks whose light changed (one block wider: faces read the light of the cell in front of them)
    let cx0 = 1e9, cy0 = 1e9, cz0 = 1e9, cx1 = -1, cy1 = -1, cz1 = -1;
    k = 0;
    for (let y = 0; y < H; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++, k++) {
          const i = x + W * (z + D * y);
          if (sky[i] !== oldSky[k] || lamp[i] !== oldLamp[k]) {
            if (x < cx0) cx0 = x; if (y < cy0) cy0 = y; if (z < cz0) cz0 = z;
            if (x > cx1) cx1 = x; if (y > cy1) cy1 = y; if (z > cz1) cz1 = z;
          }
        }
    if (cx1 >= 0) this.markBox(cx0 - 1, cy0 - 1, cz0 - 1, cx1 + 1, cy1 + 1, cz1 + 1);
  };
  World.prototype.lightAt = function (x, y, z) {
    if (!this.inside(x, y, z)) return y >= H ? [MAXL, 0] : [0, 0];
    const i = idx(x, y, z);
    return [this.sky[i], this.lamp[i]];
  };
  // can you see the sky from here, straight up?
  World.prototype.openSky = function (x, y, z) {
    if (x < 0 || z < 0 || x >= W || z >= D) return true;
    for (let yy = Math.max(0, y + 1); yy < H; yy++) if (SOLID[this.blocks[idx(x, yy, z)]]) return false;
    return true;
  };
  World.prototype.heightAt = function (x, z) {
    // the top of the highest solid block in a column (0 if none)
    if (x < 0 || z < 0 || x >= W || z >= D) return 0;
    for (let y = H - 1; y >= 0; y--) if (SOLID[this.blocks[idx(x, y, z)]]) return y + 1;
    return 0;
  };

  // ---------- making the island ----------
  World.prototype.gen = function () {
    const rnd = BT.SAB.genRandom ? Math.random : BT.rng(this.seed);
    const r = BT.rng(Math.floor(rnd() * 4294967296));
    const n1 = BT.noise(r.int(0, 1e9)), n2 = BT.noise(r.int(0, 1e9)), n3 = BT.noise(r.int(0, 1e9));
    const blocks = this.blocks;
    blocks.fill(AIR);
    const { smooth, clamp } = BT;
    const ang = r() * Math.PI * 2, md = r.range(7, 14);
    const mx = 47.5 + Math.cos(ang) * md, mz = 47.5 + Math.sin(ang) * md;
    const hgt = new Int16Array(W * D), land = new Float32Array(W * D);
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        const dx = (x - 47.5) / 41, dz = (z - 47.5) / 41;
        const d = Math.sqrt(dx * dx + dz * dz) + (n1.fbm(x / 20, z / 20, 3) - 0.5) * 0.42;
        const t = 1 - d;
        let h = 4 + 9.5 * smooth(-0.22, 0.1, t);
        h += smooth(0.06, 0.5, t) * Math.pow(n2.fbm(x / 24, z / 24, 3), 1.3) * 16;
        const m2 = (x - mx) * (x - mx) + (z - mz) * (z - mz);
        h += Math.exp(-m2 / (2 * 9.5 * 9.5)) * 19 * smooth(0.0, 0.35, t);
        hgt[x + W * z] = clamp(Math.round(h), 2, H - 6);
        land[x + W * z] = t;
      }
    const H2 = (x, z) => hgt[clamp(x, 0, W - 1) + W * clamp(z, 0, D - 1)];

    // the pond: a flat-ish spot inland, away from the mountain
    let pond = null;
    for (let tries = 0; tries < 400 && !pond; tries++) {
      const x = r.int(16, W - 17), z = r.int(16, D - 17);
      const t = land[x + W * z], h = hgt[x + W * z];
      if (t < 0.3 || t > 0.7 || h < SEA + 3 || h > SEA + 9) continue;
      if (Math.hypot(x - mx, z - mz) < 17) continue;
      let lo = 99, hi = 0;
      for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) { const v = H2(x + dx, z + dz); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (hi - lo > 4) continue;
      pond = { x, z, rx: r.int(3, 4), rz: r.int(3, 5) };
    }
    if (!pond) pond = { x: Math.round(95 - mx), z: Math.round(95 - mz), rx: 3, rz: 3 };
    {
      let lvl = 99;
      for (let dz = -pond.rz - 2; dz <= pond.rz + 2; dz++)
        for (let dx = -pond.rx - 2; dx <= pond.rx + 2; dx++) {
          const e = (dx / pond.rx) ** 2 + (dz / pond.rz) ** 2;
          if (e < 1.7) lvl = Math.min(lvl, H2(pond.x + dx, pond.z + dz));
        }
      pond.level = lvl; // the water's top is at this height
      pond.deep = 0;
      for (let dz = -pond.rz - 2; dz <= pond.rz + 2; dz++)
        for (let dx = -pond.rx - 2; dx <= pond.rx + 2; dx++) {
          const x = pond.x + dx, z = pond.z + dz;
          if (x < 0 || z < 0 || x >= W || z >= D) continue;
          const e = (dx / pond.rx) ** 2 + (dz / pond.rz) ** 2;
          if (e < 1) {
            const depth = 1 + Math.round(2 * (1 - e));
            hgt[x + W * z] = lvl - depth;
            pond.deep = Math.max(pond.deep, depth);
          } else if (e < 1.7 && hgt[x + W * z] > lvl + 1) hgt[x + W * z] = lvl + 1;
        }
    }

    // the columns: grass on dirt on stone, sand on the beach and the sea floor, snow on the mountain top,
    // bare stone where the mountain is steep
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        const h = hgt[x + W * z];
        const steep = Math.max(Math.abs(H2(x + 1, z) - h), Math.abs(H2(x - 1, z) - h), Math.abs(H2(x, z + 1) - h), Math.abs(H2(x, z - 1) - h));
        const ep = (x - pond.x) ** 2 / pond.rx ** 2 + (z - pond.z) ** 2 / pond.rz ** 2;
        const beach = h <= SEA + 1 || (h <= SEA + 2 && n3(x / 6, z / 6) > 0.35);
        const inPond = ep < 1;
        const shore = ep < 1.35;
        for (let y = 0; y < h; y++) {
          let b = ID.stone;
          if (y === h - 1) {
            if (inPond || beach) b = ID.sand;
            else if (h >= SNOWLINE) b = ID.snow;
            else if (steep >= 3 && h > 22) b = ID.stone;
            else if (shore) b = ID.sand;
            else b = ID.grass;
          } else if (y >= h - 4) {
            if (beach || inPond) b = ID.sand;
            else if (h >= SNOWLINE || (steep >= 3 && h > 22)) b = ID.stone;
            else b = ID.dirt;
          }
          blocks[idx(x, y, z)] = b;
        }
        for (let y = h; y < SEA; y++) blocks[idx(x, y, z)] = ID.water;
        if (inPond) for (let y = h; y < pond.level; y++) blocks[idx(x, y, z)] = ID.water;
      }

    // the cave: a tunnel into the mountainside with a little room (and a lamp) at the end
    let cave = null;
    for (let tries = 0; tries < 300 && !cave; tries++) {
      const a = r() * Math.PI * 2, dist = r.range(13, 17);
      const x = Math.round(mx + Math.cos(a) * dist), z = Math.round(mz + Math.sin(a) * dist);
      if (x < 6 || z < 6 || x >= W - 6 || z >= D - 6) continue;
      const h = hgt[x + W * z];
      if (h < SEA + 5 || h > 27 || land[x + W * z] < 0.15) continue;
      if (Math.hypot(x - pond.x, z - pond.z) < pond.rx + pond.rz + 6) continue;
      // the ground must rise toward the mountain, so the tunnel goes in under it
      const ix = Math.round(x + (mx - x) * 0.45), iz = Math.round(z + (mz - z) * 0.45);
      if (hgt[ix + W * iz] < h + 6) continue;
      cave = { x, z, h, dir: Math.atan2(mz - z, mx - x) };
    }
    if (cave) {
      const carve = (cx, cy, cz, rad, floor) => {
        for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++)
          for (let z = Math.floor(cz - rad); z <= Math.ceil(cz + rad); z++)
            for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
              if (!this.inside(x, y, z) || y < Math.max(2, floor)) continue;
              const d2 = (x + 0.5 - cx) ** 2 + ((y + 0.5 - cy) * 1.15) ** 2 + (z + 0.5 - cz) ** 2;
              if (d2 <= rad * rad) blocks[idx(x, y, z)] = AIR;
            }
      };
      let px = cave.x + 0.5 - Math.cos(cave.dir) * 1.5, pz = cave.z + 0.5 - Math.sin(cave.dir) * 1.5;
      let floor = cave.h, dir = cave.dir;
      const steps = 13;
      for (let s = 0; s < steps; s++) {
        carve(px, floor + 1.4, pz, 1.75, floor);
        px += Math.cos(dir); pz += Math.sin(dir);
        dir += (n3(s * 0.7, 3.3) - 0.5) * 0.5;
        if (s % 4 === 3) floor--;
      }
      carve(px, floor + 1.6, pz, 2.9, floor);
      cave.end = { x: Math.floor(px), y: floor, z: Math.floor(pz) };
      // a lamp in the room's wall, so the star glows in a cosy light
      const lx = Math.floor(px + Math.cos(dir) * 3), lz = Math.floor(pz + Math.sin(dir) * 3);
      for (let y = floor + 1; y <= floor + 3; y++) if (this.inside(lx, y, lz) && blocks[idx(lx, y, lz)] !== AIR) { blocks[idx(lx, y, lz)] = ID.lamp; break; }
      // the cave's floor is sand-and-stone, never water
      for (let y = 0; y < H; y++) for (let z = cave.end.z - 4; z <= cave.end.z + 4; z++) for (let x = cave.end.x - 4; x <= cave.end.x + 4; x++)
        if (this.inside(x, y, z) && blocks[idx(x, y, z)] === ID.water && y > SEA) blocks[idx(x, y, z)] = AIR;
    }

    // where you start: on the grass, on the far side from the mountain, looking at it
    const sx = 47.5 + (47.5 - mx) * 1.6, sz = 47.5 + (47.5 - mz) * 1.6;
    let spawn = null, best = 1e9;
    for (let z = 4; z < D - 4; z++)
      for (let x = 4; x < W - 4; x++) {
        const h = this.heightAt(x, z);
        if (blocks[idx(x, h - 1, z)] !== ID.grass || h > SEA + 8) continue;
        // not down in a hole: the ground round about is no higher than here
        let hole = 0;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) hole = Math.max(hole, H2(x + dx, z + dz) - h);
        const d = (x - sx) ** 2 + (z - sz) ** 2 + (pond ? Math.max(0, 100 - ((x - pond.x) ** 2 + (z - pond.z) ** 2)) : 0) + hole * 400;
        if (d < best) { best = d; spawn = { x, z, y: h }; }
      }
    if (!spawn) spawn = { x: 48, z: 48, y: this.heightAt(48, 48) };
    spawn.yaw = Math.atan2(-(mx - spawn.x), -(mz - spawn.z)); // the camera looks down -z at yaw 0

    // trees, not on the beach, the pond, the cave's door or where you start
    const trees = [];
    for (let tries = 0; tries < 260 && trees.length < 24; tries++) {
      const x = r.int(4, W - 5), z = r.int(4, D - 5);
      const h = this.heightAt(x, z);
      if (blocks[idx(x, h - 1, z)] !== ID.grass || h < SEA + 2 || h > 29) continue;
      if (Math.hypot(x - pond.x, z - pond.z) < Math.max(pond.rx, pond.rz) + 3) continue;
      if (cave && Math.hypot(x - cave.x, z - cave.z) < 5) continue;
      if (Math.hypot(x - spawn.x, z - spawn.z) < 4) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 5)) continue;
      const th = r.int(4, 6);
      for (let y = h; y < h + th; y++) blocks[idx(x, y, z)] = ID.wood;
      const top = h + th - 1;
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            const d2 = dx * dx + (dy * 1.25) ** 2 + dz * dz;
            if (d2 > 5.3 + r() * 0.9) continue;
            const X = x + dx, Y = top + dy + 1, Z = z + dz;
            if (this.inside(X, Y, Z) && blocks[idx(X, Y, Z)] === AIR) blocks[idx(X, Y, Z)] = ID.leaves;
          }
      trees.push({ x, z, y: h, top: this.heightAt(x, z) });
    }

    // a few boulders on the beach; one hides a star
    const sandSpots = [];
    for (let z = 3; z < D - 3; z += 2)
      for (let x = 3; x < W - 3; x += 2) {
        const h = this.heightAt(x, z);
        if (h >= SEA + 1 && h <= SEA + 2 && blocks[idx(x, h - 1, z)] === ID.sand) sandSpots.push({ x, z, y: h });
      }
    let beachStar = null;
    if (sandSpots.length) {
      // the spot on the beach farthest from where you start
      let far = -1;
      for (const s of sandSpots) { const d = Math.hypot(s.x - spawn.x, s.z - spawn.z); if (d > far) { far = d; beachStar = s; } }
      const boulder = (x, z) => {
        const h = this.heightAt(x, z);
        if (!this.inside(x, h, z) || blocks[idx(x, h, z)] !== AIR) return;
        blocks[idx(x, h, z)] = ID.stone;
        if (r.chance(0.5) && this.inside(x, h + 1, z)) blocks[idx(x, h + 1, z)] = ID.stone;
      };
      // the pile sits between the star and the island's middle, so you have to walk round it
      const ox = Math.sign(47.5 - beachStar.x), oz = Math.sign(47.5 - beachStar.z);
      boulder(beachStar.x + ox, beachStar.z); boulder(beachStar.x + ox, beachStar.z + oz); boulder(beachStar.x, beachStar.z + oz);
      for (let k = 0; k < 5; k++) { const s = r.pick(sandSpots); boulder(s.x, s.z); if (r.chance(0.6)) boulder(s.x + 1, s.z); }
    }

    // the five golden stars
    const stars = [];
    const star = (id, x, y, z) => stars.push({ id, x: x + 0.5, y: y + 0.55, z: z + 0.5 });
    if (cave && cave.end) star('cave', cave.end.x, cave.end.y, cave.end.z);
    let tall = trees[0];
    for (const t of trees) if (t.top > tall.top) tall = t;
    if (tall) star('tree', tall.x, tall.top, tall.z);
    let peak = { x: 48, z: 48, y: 0 };
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { const h = this.heightAt(x, z); if (h > peak.y && !trees.some((t) => t.x === x && t.z === z)) peak = { x, z, y: h }; }
    star('peak', peak.x, peak.y, peak.z);
    if (beachStar) star('beach', beachStar.x, this.heightAt(beachStar.x, beachStar.z), beachStar.z);
    star('pond', pond.x, pond.level - pond.deep, pond.z);
    // (if the island had no cave room or no trees, put the missing stars in the hills)
    for (let k = 0; stars.length < 5 && k < 50; k++) {
      const x = r.int(10, W - 11), z = r.int(10, D - 11), h = this.heightAt(x, z);
      if (h > SEA + 2 && blocks[idx(x, h, z)] === AIR) star('hill' + k, x, h, z);
    }

    // the animals' homes: sheep in the meadows, chicks and the sleepy cat near where you start
    const animals = [];
    const grassNear = (cx, cz, rad, tries) => {
      for (let k = 0; k < tries; k++) {
        const x = Math.round(cx + r.range(-rad, rad)), z = Math.round(cz + r.range(-rad, rad));
        if (x < 2 || z < 2 || x >= W - 2 || z >= D - 2) continue;
        const h = this.heightAt(x, z);
        if (blocks[idx(x, h - 1, z)] === ID.grass && this.openSky(x, h, z)) return { x: x + 0.5, z: z + 0.5 };
      }
      return null;
    };
    for (let k = 0; k < 5; k++) { const p = grassNear(47.5, 47.5, 34, 80); if (p) animals.push({ kind: 'sheep', x: p.x, z: p.z }); }
    for (let k = 0; k < 6; k++) { const p = grassNear(spawn.x, spawn.z, 8, 60); if (p) animals.push({ kind: 'chick', x: p.x, z: p.z }); }
    { const p = grassNear(spawn.x, spawn.z, 4, 60) || grassNear(spawn.x, spawn.z, 10, 80); if (p) animals.push({ kind: 'cat', x: p.x, z: p.z }); }
    { const p = grassNear(pond.x, pond.z, pond.rx + 4, 80); if (p) animals.push({ kind: 'cat', x: p.x, z: p.z }); }

    this.info = { mountain: { x: mx, z: mz }, pond, cave, spawn, trees: trees.length, peak: peak.y };
    this.stars = stars;
    this.animals = animals;
    this.spawn = spawn;
  };

  // ---------- saving: only the blocks that differ from the island as it was made ----------
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      s += B64[a >> 2] + B64[((a & 3) << 4) | ((b || 0) >> 4)] + (b === undefined ? '=' : B64[((b & 15) << 2) | ((c || 0) >> 6)]) + (c === undefined ? '=' : B64[c & 63]);
    }
    return s;
  }
  function unb64(s) {
    const out = [];
    const v = (ch) => B64.indexOf(ch);
    for (let i = 0; i + 3 < s.length; i += 4) {
      const a = v(s[i]), b = v(s[i + 1]), c = s[i + 2] === '=' ? -1 : v(s[i + 2]), d = s[i + 3] === '=' ? -1 : v(s[i + 3]);
      if (a < 0 || b < 0) throw new Error('bad save');
      out.push((a << 2) | (b >> 4));
      if (c >= 0) out.push(((b & 15) << 4) | (c >> 2));
      if (d >= 0) out.push(((c & 3) << 6) | d);
    }
    return out;
  }
  // each changed block: the gap since the last one (a varint), then its id
  World.prototype.encodeEdits = function () {
    const bytes = [];
    let last = -1, count = 0;
    const list = [];
    for (let i = 0; i < N; i++) if (this.blocks[i] !== this.base[i]) list.push(i);
    if (BT.SAB.saveDrop && list.length) list.pop();
    for (const i of list) {
      let gap = i - last - 1;
      while (gap >= 128) { bytes.push((gap & 127) | 128); gap = Math.floor(gap / 128); }
      bytes.push(gap);
      bytes.push(this.blocks[i]);
      last = i;
      count++;
    }
    return { count, data: b64(bytes) };
  };
  World.prototype.applyEdits = function (data) {
    const bytes = unb64(data || '');
    let i = -1, k = 0;
    while (k < bytes.length) {
      let gap = 0, mul = 1, byte;
      do { byte = bytes[k++]; gap += (byte & 127) * mul; mul *= 128; } while (byte & 128 && k < bytes.length);
      i += gap + 1;
      const id = bytes[k++];
      if (i < 0 || i >= N || id === undefined || id >= B.N) throw new Error('bad save');
      this.blocks[i] = id;
    }
    this.relight(0, 0, W - 1, D - 1, true);
    this.markAll();
    this.version++;
  };
  World.prototype.placedCount = function () {
    let n = 0;
    for (let i = 0; i < N; i++) if (this.placed(i)) n++;
    return n;
  };
  World.prototype.fingerprint = function () {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < N; i++) { h ^= this.blocks[i]; h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  };

  BT.World = World;
  Object.assign(BT, { W, H, D, SEA, CS, CX, CY, CZ, MAXL, NCELLS: N, idx, chunkId });
})();
