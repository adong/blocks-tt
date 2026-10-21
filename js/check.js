/* TT Blocks: the headless check. BT.check() plays the rules without drawing anything and returns
   { ok, groups: [{ name, ok, fails }], fails }. It runs in node (tools/check.js) and in the page (game.check()).
     world     the same seed always makes the same island; a different seed makes a different one; every island has
               its hills, beach, trees, pond, cave, snow, 5 stars and a good place to start
     mesh      a test chunk's face count matches the count worked out by hand and the slow one-face-at-a-time count,
               face for face (no missing faces, no hidden ones, none twice); the same for every chunk of 3 islands
     edits     placing and breaking a block on a chunk's edge redraws the chunk next door too (faces and light)
     save      save and load gives back the very same world, players, time, stars and quests; blocked storage and a
               broken save don't crash
     quests    each quest passes a right build and turns down wrong ones
     tools     undo, FILL, MIRROR, the ruler and the brother's ready-made pieces
     body      walking, jumping, steps, walls, flying, EASY flying
     animals   they wander for a long time and stay on the island, out of the blocks and out of the water
     frame     a big build stays within the frame-time budget: meshing, relighting, a frame of play
   check({ sabotage: name }) switches on one deliberate bug (BT.SAB), to prove the check can fail. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const SABOTAGE = {
    genRandom: 'the island ignores the seed',
    meshDrop: 'the mesher forgets one face',
    meshDouble: 'the mesher draws a hidden face',
    editNoNeighbor: 'an edit only redraws its own chunk',
    saveDrop: 'saving loses the last change',
    tower9: 'a tower of 9 counts',
    houseNoDoor: 'a house with no door counts',
    houseRoofless: 'a house with no roof counts',
    starsFar: 'stars are found from far away',
    undoOff: 'undo does nothing',
    slow: 'every frame wastes 20 ms',
  };
  const BUDGET = { frameAvg: 6, editWorst: 30, chunkWorst: 12, fullMesh: 700, triangles: 400000 };

  function check(opts) {
    opts = opts || {};
    const { ID, AIR } = BT.blocks;
    const W = BT.W, H = BT.H, D = BT.D, SEA = BT.SEA;
    const groups = [];
    let G = null;
    const group = (name, fn) => {
      if (opts.only && !opts.only.some((o) => name.startsWith(o))) return;
      G = { name, ok: true, fails: [], notes: [] };
      groups.push(G);
      try { fn(); } catch (e) { G.fails.push('crashed: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); }
      G.ok = !G.fails.length;
    };
    const expect = (cond, msg) => { if (!cond) G.fails.push(msg); return !!cond; };
    const note = (msg) => G.notes.push(msg);
    const sab = opts.sabotage || null;
    for (const k in BT.SAB) delete BT.SAB[k];
    if (sab) {
      if (!SABOTAGE[sab]) return { ok: false, groups: [], fails: ['no such sabotage: ' + sab], sabotage: sab };
      BT.SAB[sab] = true;
    }
    const seeds = opts.seeds || ['SUNNY SHEEP 1', 'COZY CAKE 7', 'ZIPPY ROCKET 42'];
    const worlds = {};
    const fresh = (seed) => new BT.World(seed);
    const cached = (seed) => worlds[seed] || (worlds[seed] = fresh(seed));
    const meshFaces = (w, cx, cy, cz) => {
      const m = BT.mesher.meshChunk(w, cx, cy, cz, { debug: true });
      const got = new Map();
      let dup = 0;
      for (const q of m.quads) for (let jj = 0; jj < q.h; jj++) for (let ii = 0; ii < q.w; ii++) {
        const k = `${q.d},${q.k},${q.i + ii},${q.j + jj}`;
        if (got.has(k)) dup++;
        got.set(k, q.pass);
      }
      return { got, dup, quads: m.quads.length, m };
    };
    const compare = (w, cx, cy, cz, label) => {
      const exp = BT.mesher.expectedFaces(w, cx, cy, cz);
      const { got, dup, quads } = meshFaces(w, cx, cy, cz);
      let miss = 0, extra = 0, wrongPass = 0;
      for (const [k, pass] of exp) { if (!got.has(k)) miss++; else if (got.get(k) !== pass) wrongPass++; }
      for (const k of got.keys()) if (!exp.has(k)) extra++;
      expect(!miss && !extra && !dup && !wrongPass, `${label}: chunk ${cx},${cy},${cz}: ${miss} missing, ${extra} hidden faces drawn, ${dup} drawn twice, ${wrongPass} in the wrong pass`);
      return { faces: exp.size, quads, got };
    };

    // ---------- the island ----------
    group('world: same seed, same island', () => {
      for (const seed of seeds) {
        const a = cached(seed), b = fresh(seed);
        expect(a.fingerprint() === b.fingerprint(), `${seed}: two islands from the same seed differ`);
        expect(JSON.stringify(a.stars) === JSON.stringify(b.stars), `${seed}: the stars moved`);
        expect(JSON.stringify(a.animals) === JSON.stringify(b.animals), `${seed}: the animals moved`);
        expect(JSON.stringify(a.spawn) === JSON.stringify(b.spawn), `${seed}: the start moved`);
      }
      expect(cached(seeds[0]).fingerprint() !== cached(seeds[1]).fingerprint(), 'two different seeds made the same island');
      expect(new BT.World(' sunny sheep 1 ').fingerprint() === cached('SUNNY SHEEP 1').fingerprint(), 'a seed typed in small letters or with spaces made another island');
    });
    group('world: hills, beach, trees, pond, cave, snow, stars', () => {
      for (const seed of seeds) {
        const w = cached(seed);
        let edgeLand = 0, sand = 0, snow = 0, pondWater = 0, wood = 0, cave = 0, peak = 0;
        for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
          const h = w.heightAt(x, z);
          peak = Math.max(peak, h);
          if ((x === 0 || z === 0 || x === W - 1 || z === D - 1) && h > SEA) edgeLand++;
          const top = w.get(x, h - 1, z);
          if (top === ID.sand && h >= SEA && h <= SEA + 2) sand++;
          if (top === ID.snow) snow++;
        }
        for (let i = 0; i < BT.NCELLS; i++) {
          const b = w.blocks[i], y = Math.floor(i / (W * D));
          if (b === ID.water && y >= SEA) pondWater++;
          if (b === ID.wood) wood++;
          if (b === AIR && y > SEA && w.sky[i] <= 3) cave++;
        }
        expect(!edgeLand, `${seed}: ${edgeLand} land columns at the world's edge (it should be an island)`);
        expect(peak >= 30 && peak <= H - 2, `${seed}: the highest hill is ${peak} (want 30..${H - 2})`);
        expect(sand >= 150, `${seed}: only ${sand} beach columns`);
        expect(snow >= 3, `${seed}: only ${snow} snowy columns`);
        expect(w.info.trees >= 10 && wood >= 40, `${seed}: only ${w.info.trees} trees`);
        expect(pondWater >= 15, `${seed}: the pond has ${pondWater} water blocks`);
        expect(w.info.cave && cave >= 25, `${seed}: the cave has ${cave} dark air blocks`);
        expect(w.stars.length === 5 && new Set(w.stars.map((s) => s.id)).size === 5, `${seed}: ${w.stars.length} stars`);
        for (const s of w.stars) expect(!w.solidAt(Math.floor(s.x), Math.floor(s.y), Math.floor(s.z)), `${seed}: star ${s.id} is inside a block`);
        const sp = w.spawn;
        expect(w.solidAt(sp.x, sp.y - 1, sp.z) && !w.solidAt(sp.x, sp.y, sp.z) && !w.solidAt(sp.x, sp.y + 1, sp.z), `${seed}: the start isn't on open ground`);
        const kinds = w.animals.map((a) => a.kind);
        expect(kinds.includes('sheep') && kinds.includes('chick') && kinds.includes('cat'), `${seed}: animals ${kinds.join(',')}`);
      }
    });

    // ---------- the mesh ----------
    group('mesh: a test chunk has exactly the faces it should', () => {
      const w = fresh('MESH TEST');
      const set = (x, y, z, id) => { w.blocks[BT.idx(x, y, z)] = id; };
      for (let y = 32; y < 48; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 32; x++) set(x, y, z, AIR);
      // A: a 4x4x4 cube = 96 faces. B: stone with glass beside it: 6 + 5. C: two stones side by side: 10.
      // D: a 3x3 pool of water on a planks slab: planks 30 + water 21. E: a stone at the chunk's edge touching one
      // in the next chunk: 5 in this chunk.
      for (let y = 33; y <= 36; y++) for (let z = 1; z <= 4; z++) for (let x = 1; x <= 4; x++) set(x, y, z, ID.stone);
      set(8, 33, 8, ID.stone); set(9, 33, 8, ID.glass);
      set(12, 33, 12, ID.stone); set(13, 33, 12, ID.stone);
      for (let z = 10; z <= 12; z++) for (let x = 1; x <= 3; x++) { set(x, 40, z, ID.planks); set(x, 41, z, ID.water); }
      set(15, 44, 5, ID.stone); set(16, 44, 5, ID.stone);
      w.relight(0, 0, W - 1, D - 1, true);
      const HAND = 96 + 11 + 10 + 51 + 5;
      const r = compare(w, 0, 2, 0, 'test chunk');
      expect(r.faces === HAND, `test chunk: ${r.faces} faces counted one by one, ${HAND} worked out by hand`);
      let drawn = 0;
      for (const k of r.got.keys()) if (k) drawn++;
      expect(drawn === HAND, `test chunk: the mesh has ${drawn} faces, ${HAND} worked out by hand`);
      expect(r.quads < r.faces, `test chunk: greedy meshing didn't merge anything (${r.quads} quads for ${r.faces} faces)`);
      note(`test chunk: ${HAND} faces in ${r.quads} quads`);
      const top = meshFaces(w, 0, 2, 0);
      // the cube's top (16 faces, all in full sun) must be one quad
      const cubeTop = top.m.quads.filter((q) => q.d === 2 && q.k === 4 && q.i >= 1 && q.i <= 4);
      expect(cubeTop.length === 1 && cubeTop[0].w * cubeTop[0].h === 16, `the cube's sunny top is ${cubeTop.length} quads, not 1`);
    });
    group('mesh: every chunk of every island', () => {
      let faces = 0, quads = 0;
      for (const seed of seeds) {
        const w = cached(seed);
        for (let cy = 0; cy < BT.CY; cy++) for (let cz = 0; cz < BT.CZ; cz++) for (let cx = 0; cx < BT.CX; cx++) {
          const r = compare(w, cx, cy, cz, seed);
          faces += r.faces; quads += r.quads;
        }
      }
      note(`${faces} faces in ${quads} quads (${Math.round((100 * quads) / faces)}%)`);
    });

    // ---------- edits on a chunk's edge ----------
    group('edits: placing and breaking redraws the neighbour chunks', () => {
      const w = fresh('EDGE TEST');
      // a spot in the air above the sea, at x = 15 | 16 (chunks 0 and 1), y = 40, z = 40
      const cid = (x, y, z) => BT.chunkId(Math.floor(x / 16), Math.floor(y / 16), Math.floor(z / 16));
      const facesOf = (x, y, z) => BT.mesher.meshChunk(w, Math.floor(x / 16), Math.floor(y / 16), Math.floor(z / 16)).passes[0].faces;
      const cases = [[[15, 40, 40], [16, 40, 40]], [[40, 31, 40], [40, 32, 40]], [[40, 40, 47], [40, 40, 48]]];
      for (const [a, b] of cases) {
        w.setMany([[a[0], a[1], a[2], ID.stone]]);
        w.dirty.clear();
        const before = facesOf(...a);
        w.setMany([[b[0], b[1], b[2], ID.stone]]);
        expect(w.dirty.has(cid(...a)) && w.dirty.has(cid(...b)), `placing at ${b} didn't redraw the chunk next door (${a})`);
        expect(facesOf(...a) === before - 1, `placing at ${b}: the neighbour's face count went ${before} -> ${facesOf(...a)}, not -1`);
        compare(w, Math.floor(a[0] / 16), Math.floor(a[1] / 16), Math.floor(a[2] / 16), 'after placing');
        w.dirty.clear();
        w.setMany([[b[0], b[1], b[2], AIR]]);
        expect(w.dirty.has(cid(...a)), `breaking at ${b} didn't redraw the chunk next door`);
        expect(facesOf(...a) === before, `breaking at ${b}: the neighbour's face count didn't come back`);
        w.setMany([[a[0], a[1], a[2], AIR]]);
      }
      // a lamp's light reaching into the next chunk redraws it too
      w.dirty.clear();
      const y = w.heightAt(20, 40);
      w.setMany([[19, y, 40, ID.lamp]]);
      expect(w.dirty.has(cid(13, y, 40)), 'a lamp near the edge didn\'t redraw the chunk its light reaches');
      expect(w.lamp[BT.idx(16, y, 40)] > 0, 'the lamp\'s light didn\'t spread');
      // and the light after an edit matches a full relight
      const sky = w.sky.slice(), lamp = w.lamp.slice();
      w.relight(0, 0, W - 1, D - 1, true);
      let diff = 0;
      for (let i = 0; i < BT.NCELLS; i++) if (sky[i] !== w.sky[i] || lamp[i] !== w.lamp[i]) diff++;
      expect(!diff, `${diff} blocks' light differs from a full relight after the edits`);
    });

    // ---------- saving ----------
    group('save: save and load gives back the same world', () => {
      const s = new BT.Session({ seed: 'SAVE TEST 3', kid: 'teddy', two: true });
      const r = BT.rng(99);
      const sp = s.world.spawn;
      for (let k = 0; k < 300; k++) {
        const x = r.int(5, W - 6), z = r.int(5, D - 6), h = s.world.heightAt(x, z);
        if (r() < 0.7) s.builder.place(x, h, z, r.int(1, BT.blocks.N - 1)); else s.builder.dig(x, h - 1, z);
      }
      s.builder.fill({ x: sp.x + 3, y: sp.y + 6, z: sp.z + 3 }, { x: sp.x + 9, y: sp.y + 9, z: sp.z + 8 }, ID.brick);
      s.builder.piece('house', { x: sp.x - 10, y: sp.y, z: sp.z }, 2);
      s.found = { cave: 'teddy', pond: 'tommy' };
      s.done = { tower: 'teddy' };
      s.tod = 0.731;
      s.P().place(sp.x + 0.25, sp.y + 3, sp.z + 0.75, 1.234);
      s.P().pitch = -0.4; s.P().sel = 4; s.P().hotbar[4] = ID.snow;
      s.turn();
      const fp = s.world.fingerprint();
      const okSave = s.save();
      note(`${s.world.encodeEdits().count} changed blocks, ${JSON.stringify(s.snapshot()).length} bytes`);
      const st = BT.save.load(s.id);
      expect(st, 'the saved world isn\'t in the list');
      if (!st) return;
      const t = BT.Session.fromState(st);
      expect(t.world.fingerprint() === fp, 'the loaded world\'s blocks differ');
      let diff = 0;
      for (let i = 0; i < BT.NCELLS; i++) if (t.world.blocks[i] !== s.world.blocks[i]) diff++;
      expect(!diff, `${diff} blocks differ after loading`);
      expect(JSON.stringify(t.snapshot().players) === JSON.stringify(s.snapshot().players), 'the players differ after loading');
      expect(t.active === s.active && t.two && JSON.stringify(t.found) === JSON.stringify(s.found) && JSON.stringify(t.done) === JSON.stringify(s.done) && Math.abs(t.tod - s.tod) < 1e-4, 'turn, stars, quests or the time differ after loading');
      expect(BT.save.list().some((w) => w.id === s.id && w.stars === 2), 'the world list doesn\'t show it with 2 stars');
      // light after loading matches
      let ld = 0;
      for (let i = 0; i < BT.NCELLS; i++) if (t.world.sky[i] !== s.world.sky[i] || t.world.lamp[i] !== s.world.lamp[i]) ld++;
      expect(!ld, `${ld} blocks' light differs after loading`);
      // storage blocked: still saves (in memory) and loads, no crash
      const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
      BT.save._setStore(blocked);
      try {
        const u = new BT.Session({ seed: 'BLOCKED 1' });
        u.builder.place(u.world.spawn.x + 2, u.world.spawn.y, u.world.spawn.z, ID.red);
        const ok = u.save();
        expect(ok === false, 'saving with storage blocked said it worked');
        const back = BT.save.load(u.id);
        expect(back && BT.Session.fromState(back).world.fingerprint() === u.world.fingerprint(), 'with storage blocked the world wasn\'t kept in memory');
        // a broken save: loads the island fresh instead of crashing
        const bad = Object.assign({}, back, { edits: { data: '!!!!', count: 3 } });
        const v = BT.Session.fromState(bad);
        expect(v.events.some((e) => e.type === 'badsave'), 'a broken save didn\'t say so');
      } finally {
        let ls = null;
        try { ls = window.localStorage || null; } catch (e) { ls = null; }
        BT.save._setStore(ls);
      }
      BT.save.remove(s.id);
      expect(!BT.save.load(s.id), 'a deleted world still loads');
    });

    // ---------- quests ----------
    group('quests: stars', () => {
      const s = new BT.Session({ seed: 'STAR TEST 5' });
      const p = s.P();
      p.place(s.world.spawn.x + 0.5, s.world.spawn.y, s.world.spawn.z + 0.5);
      s.step(1 / 30, {});
      expect(!Object.keys(s.found).length, 'a star was found from the start');
      const st = s.world.stars[0];
      p.place(st.x + 3, st.y, st.z);
      p.easy = true;
      s.step(1 / 30, {});
      expect(!s.found[st.id], 'a star 3 blocks away was found');
      for (const star of s.world.stars) { p.place(star.x, star.y - p.h * 0.5, star.z); s.step(1 / 60, {}); }
      expect(Object.keys(s.found).length === 5, `standing on each star found ${Object.keys(s.found).length} of 5`);
      expect(s.done.stars && s.events.some((e) => e.type === 'quest' && e.id === 'stars'), 'finding all 5 didn\'t finish the quest');
    });
    group('quests: tower 10 high', () => {
      const w = fresh('TOWER TEST');
      const sp = w.spawn;
      const tower = (x, z, n, gap) => { const y = w.heightAt(x, z); for (let k = 0; k < n; k++) if (k !== gap) w.setMany([[x, y + k, z, ID.brick]]); return y; };
      expect(!BT.quests.towerDone(w, null, null), 'a fresh island already has a tower');
      tower(sp.x + 3, sp.z, 9);
      expect(!BT.quests.towerDone(w, sp.x + 3, sp.z), 'a tower of 9 counted');
      tower(sp.x - 3, sp.z, 11, 5);
      expect(!BT.quests.towerDone(w, sp.x - 3, sp.z), 'a tower with a gap counted');
      const y = w.heightAt(sp.x + 3, sp.z);
      w.setMany([[sp.x + 3, y, sp.z, ID.planks]]);
      expect(BT.quests.towerDone(w, sp.x + 3, sp.z), 'a tower of 10 didn\'t count');
      // natural stone 10 high (a cliff) doesn't count: only blocks someone put there
      const w2 = fresh('TOWER TEST');
      const x = sp.x + 5, z = sp.z + 5, y2 = w2.heightAt(x, z);
      for (let k = 0; k < 12; k++) w2.blocks[BT.idx(x, y2 + k, z)] = ID.stone;
      w2.base = w2.blocks.slice();
      expect(!BT.quests.towerDone(w2, x, z), 'the island\'s own stone counted as a tower');
    });
    group('quests: house with a door', () => {
      const base = fresh('HOUSE TEST');
      const sp = base.spawn;
      // a flat spot: a plank floor in the air, so the ground's bumps don't matter
      const make = (opts) => {
        const w = fresh('HOUSE TEST');
        const ox = sp.x + 6, oz = sp.z - 3, oy = Math.max(w.heightAt(ox, oz), w.heightAt(ox + 6, oz + 6)) + 2;
        const L = [];
        for (let z = 0; z <= 5; z++) for (let x = 0; x <= 5; x++) {
          L.push([ox + x, oy - 1, oz + z, ID.planks]);
          for (let y = 0; y <= 2; y++) {
            const wall = x === 0 || x === 5 || z === 0 || z === 5;
            let id = wall ? ID.brick : AIR;
            if (opts.door && x === 2 && z === 0 && y <= (opts.door === 'short' ? 0 : 1)) id = AIR;
            if (opts.hole && x === 5 && z === 3 && y === 1) id = AIR;
            L.push([ox + x, oy + y, oz + z, id]);
          }
          if (opts.roof !== false) L.push([ox + x, oy + 3, oz + z, ID.red]);
        }
        w.setMany(L);
        return { w, at: [ox + 2, oy, oz] };
      };
      const ok = (o) => { const { w, at } = make(o); return BT.quests.houseCheck(w, at[0], at[1], at[2], 12).ok; };
      expect(ok({ door: true }), 'a house with walls, a roof and a door didn\'t count');
      expect(!ok({ door: false }), 'a closed box with no door counted');
      expect(!ok({ door: true, roof: false }), 'a house with no roof counted');
      expect(!ok({ door: 'short' }), 'a house with a door 1 block high counted');
      expect(!ok({ door: true, hole: true }), 'a house with a hole in the wall counted');
      expect(!BT.quests.houseCheck(base, null).ok, 'the fresh island (and its cave) counted as a house');
      // the brother's house counts, and the session notices it
      const s = new BT.Session({ seed: 'HOUSE TEST' });
      const spot = { x: sp.x + 2, y: s.world.heightAt(sp.x + 2, sp.z - 6), z: sp.z - 6 };
      s.edited(s.builder.piece('house', spot, 0));
      for (let k = 0; k < 20; k++) s.step(1 / 30, {});
      expect(s.done.house, 'building the ready-made house didn\'t finish the house quest');
    });

    // ---------- tools ----------
    group('tools: undo, fill, mirror, ruler, pieces', () => {
      const s = new BT.Session({ seed: 'TOOL TEST' });
      const w = s.world, b = s.builder, sp = w.spawn;
      const fp0 = w.fingerprint();
      const y = w.heightAt(sp.x + 3, sp.z);
      b.place(sp.x + 3, y, sp.z, ID.red);
      expect(w.get(sp.x + 3, y, sp.z) === ID.red, 'placing a block didn\'t');
      b.undo();
      expect(w.fingerprint() === fp0, 'undo after placing didn\'t put the island back');
      const c0 = b.fill({ x: sp.x + 2, y: y + 2, z: sp.z + 2 }, { x: sp.x + 5, y: y + 4, z: sp.z + 6 }, ID.yellow);
      expect(c0.length === 4 * 3 * 5, `a 4 x 3 x 5 fill changed ${c0.length} blocks, not 60`);
      b.fill({ x: sp.x + 2, y: y + 3, z: sp.z + 2 }, { x: sp.x + 5, y: y + 3, z: sp.z + 6 }, AIR);
      expect(w.get(sp.x + 3, y + 3, sp.z + 3) === AIR && w.get(sp.x + 3, y + 4, sp.z + 3) === ID.yellow, 'emptying with FILL didn\'t');
      b.undo(); b.undo();
      expect(w.fingerprint() === fp0, 'two undos after two fills didn\'t put the island back');
      const big = b.fill({ x: 1, y: 30, z: 1 }, { x: 90, y: 45, z: 90 }, ID.stone);
      expect(big.length <= 20 * 16 * 20, `a fill bigger than 20 a side changed ${big.length} blocks`);
      b.undo();
      // mirror: a line through x = sp.x; a block 3 to the left appears 3 to the right
      b.mirror = { on: true, axis: 'x', m2: 2 * sp.x };
      const yy = y + 6;
      b.place(sp.x - 3, yy, sp.z, ID.blue);
      expect(w.get(sp.x + 3, yy, sp.z) === ID.blue, 'MIRROR didn\'t place the twin block');
      b.dig(sp.x + 3, yy, sp.z);
      expect(w.get(sp.x - 3, yy, sp.z) === AIR, 'MIRROR didn\'t break the twin block');
      b.mirror.on = false;
      b.undo(); b.undo();
      expect(w.fingerprint() === fp0, 'undo after mirrored building didn\'t put the island back');
      const m = BT.build.measure({ x: 1, y: 5, z: 1 }, { x: 3, y: 5, z: 10 });
      expect(m.dx === 3 && m.dy === 1 && m.dz === 10, `the ruler said ${m.dx} x ${m.dy} x ${m.dz}, not 3 x 1 x 10`);
      // bodies: nothing goes where a player stands; the bottom layer can't be dug
      const p = s.P();
      expect(!b.canPlace(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z)), 'a block could go where the player stands');
      expect(!b.canDig(10, 0, 10), 'the bottom layer could be dug');
      // each ready-made piece builds, and undo takes it away again
      for (const k of BT.build.PIECE_KINDS) {
        const o = { x: sp.x + 8, y: w.heightAt(sp.x + 8, sp.z + 8), z: sp.z + 8 };
        const ch = b.piece(k, o, 2);
        expect(ch.length >= 20, `the ${k} piece put only ${ch.length} blocks`);
        if (k === 'tower') expect(BT.quests.towerDone(w, o.x, o.z), 'the ready-made tower doesn\'t finish the tower quest');
        if (k === 'house') expect(BT.quests.houseCheck(w, o.x, o.y, o.z, 12).ok, 'the ready-made house doesn\'t finish the house quest');
        b.undo();
        expect(w.fingerprint() === fp0, `undo after the ${k} piece didn\'t put the island back`);
      }
      // every facing: the house's door faces you
      for (let f = 0; f < 4; f++) {
        const o = { x: sp.x, y: w.heightAt(sp.x, sp.z) + 4, z: sp.z };
        b.piece('house', o, f);
        expect(BT.quests.houseCheck(w, o.x, o.y, o.z, 12).ok, `the house facing ${f} isn't a house`);
        b.undo();
      }
    });

    // ---------- bodies ----------
    group('body: walking, steps, walls, flying', () => {
      const w = fresh('BODY TEST');
      const sp = w.spawn;
      const p = new BT.Player('teddy');
      p.easy = false;
      const run = (sec, inp) => { for (let k = 0; k < sec * 60; k++) p.step(w, 1 / 60, inp); };
      // a flat test yard in the sky: a stone floor at y = 40
      const L = [];
      for (let z = 30; z < 46; z++) for (let x = 30; x < 46; x++) L.push([x, 40, z, ID.stone]);
      for (let z = 30; z <= 34; z++) for (let x = 30; x < 46; x++) L.push([x, 41, z, ID.stone]); // a one-block step up to a ledge
      for (let x = 30; x < 46; x++) { L.push([x, 41, 40, ID.brick], [x, 42, 40, ID.brick]); } // a wall 2 high
      w.setMany(L);
      p.place(38.5, 45, 38.5, 0);
      run(1.5, {});
      expect(p.onGround && Math.abs(p.pos.y - 41) < 0.01, `falling: landed at ${p.pos.y.toFixed(2)}, not on the floor at 41`);
      p.place(38.5, 41, 36.5, 0); // walk toward -z: the step at z = 34
      run(1.2, { fz: 1 });
      expect(p.pos.y > 41.9 && p.pos.z < 35, `walking into a 1-block step didn't climb it (y ${p.pos.y.toFixed(2)}, z ${p.pos.z.toFixed(2)})`);
      p.place(36.5, 41, 37.5, Math.PI); // facing +z: the wall at z = 40
      run(2, { fz: 1 });
      expect(p.pos.z < 40 - 0.29 && p.pos.y < 41.5, `walking into a 2-high wall went through or over it (z ${p.pos.z.toFixed(2)}, y ${p.pos.y.toFixed(2)})`);
      p.place(36.5, 41, 37.5, 0);
      run(0.2, { up: true });
      expect(p.pos.y > 41.5, 'jumping didn\'t leave the ground');
      run(1, {});
      expect(p.onGround, 'came down from a jump and didn\'t land');
      p.fly = true;
      run(1, { up: true });
      expect(p.pos.y > 46, `flying up 1 s rose to ${p.pos.y.toFixed(2)}`);
      run(0.5, {});
      expect(p.pos.y > 46, 'flying: stopped holding up and fell');
      p.fly = false; p.easy = true;
      const y0 = p.pos.y;
      run(1, {});
      expect(Math.abs(p.pos.y - y0) < 0.2, 'EASY: fell while flying is always on');
      // the island's edge
      p.place(1, 30, 1, 0);
      run(1, { fz: 1, fx: -1 });
      expect(p.pos.x >= 0.3 && p.pos.z >= 0.3, 'walked off the edge of the world');
      // built over: pops out on top
      const q = new BT.Player('tommy');
      q.place(sp.x + 0.5, sp.y, sp.z + 0.5);
      w.setMany([[sp.x, sp.y, sp.z, ID.stone], [sp.x, sp.y + 1, sp.z, ID.stone]]);
      q.step(w, 1 / 60, {});
      expect(!BT.physics.hits(w, q, q.pos.x, q.pos.y, q.pos.z), 'built over: stuck inside the blocks');
      // the crosshair: pointing straight down at the floor from above
      const hit = BT.physics.raycast(w, 33.5, 43.5, 37.5, 0, -1, 0, 7);
      expect(hit && hit.y === 40 && hit.place.y === 41, 'the crosshair ray missed the floor');
    });

    // ---------- animals ----------
    group('animals: wander, stay on the island, out of blocks and water', () => {
      const s = new BT.Session({ seed: 'ANIMAL TEST' });
      const w = s.world;
      const p = s.P();
      p.easy = false;
      const cat = s.animals.find((a) => a.kind === 'cat');
      let woke = false;
      for (let k = 0; k < 3000; k++) {
        if (k === 1500 && cat) p.place(cat.pos.x + 1.2, cat.pos.y, cat.pos.z);
        s.step(1 / 30, {});
        if (cat && cat.state !== 'sleep') woke = true;
      }
      for (const a of s.animals) {
        const fx = Math.floor(a.pos.x), fz = Math.floor(a.pos.z), fy = Math.floor(a.pos.y + 0.05);
        expect(a.pos.x > 1 && a.pos.z > 1 && a.pos.x < W - 1 && a.pos.z < D - 1, `${a.kind} ${a.uid} wandered off the island`);
        expect(!w.solidAt(fx, fy, fz), `${a.kind} ${a.uid} is inside a block`);
        expect(w.get(fx, fy, fz) !== ID.water, `${a.kind} ${a.uid} is in the water`);
        expect(w.solidAt(fx, fy - 1, fz), `${a.kind} ${a.uid} is floating`);
        expect(Math.hypot(a.pos.x - a.home.x, a.pos.z - a.home.z) > 0.3 || a.kind === 'cat', `${a.kind} ${a.uid} never moved`);
      }
      expect(!cat || woke, 'the sleepy cat never woke up when Tommy came close');
      // build right on top of a sheep: it pops up
      const sh = s.animals.find((a) => a.kind === 'sheep');
      if (sh) {
        const fx = Math.floor(sh.pos.x), fz = Math.floor(sh.pos.z), fy = Math.floor(sh.pos.y);
        w.setMany([[fx, fy, fz, ID.stone]]);
        s.step(1 / 30, {});
        expect(sh.pos.y >= fy + 1, 'a sheep built over stayed inside the block');
      }
    });

    // ---------- the frame-time budget ----------
    group('frame: a big build stays within budget', () => {
      const s = new BT.Session({ seed: 'BIG BUILD 9' });
      const w = s.world, b = s.builder, r = BT.rng(7);
      const t0 = BT.now();
      // a big build: a chunky town of towers, houses, bridges and trees, and some colourful patchwork walls
      for (let k = 0; k < 40; k++) {
        const x = r.int(6, W - 12), z = r.int(6, D - 12);
        b.piece(r.pick(BT.build.PIECE_KINDS), { x, y: w.heightAt(x, z), z }, r.int(0, 3));
      }
      for (let k = 0; k < 24; k++) {
        const x = r.int(4, W - 24), z = r.int(4, D - 24), y = w.heightAt(x, z) + 2;
        const L = [];
        for (let dy = 0; dy < 12; dy++) for (let dx = 0; dx < 18; dx++) if ((dx + dy) % 2 || r() < 0.3) L.push([x + dx, y + dy, z + (dy % 3), 13 + ((dx + dy) % 4)]);
        w.setMany(L);
      }
      const built = BT.now() - t0;
      let full = BT.now(), worstChunk = 0, tris = 0, meshes = 0;
      for (let cy = 0; cy < BT.CY; cy++) for (let cz = 0; cz < BT.CZ; cz++) for (let cx = 0; cx < BT.CX; cx++) {
        const c0 = BT.now();
        const m = BT.mesher.meshChunk(w, cx, cy, cz);
        worstChunk = Math.max(worstChunk, BT.now() - c0);
        for (const P of m.passes) { tris += P.index.length / 3; if (P.quads) meshes++; }
      }
      full = BT.now() - full;
      w.dirty.clear();
      // frames of play: walking about, an edit every 4th frame, then redrawing the dirty chunks (what the game does)
      const p = s.P();
      p.place(w.spawn.x + 0.5, w.spawn.y, w.spawn.z + 0.5);
      let frames = 0, total = 0, worstEdit = 0;
      for (let k = 0; k < 120; k++) {
        const f0 = BT.now();
        p.yaw += 0.05;
        p.pitch = -0.5;
        s.step(1 / 60, { fz: 1 });
        if (k % 4 === 0) {
          const e0 = BT.now();
          const res = s.act(k % 8 ? 'place' : 'dig');
          for (const id of w.dirty) { const cx = id % BT.CX, cz = Math.floor(id / BT.CX) % BT.CZ, cy = Math.floor(id / (BT.CX * BT.CZ)); BT.mesher.meshChunk(w, cx, cy, cz); }
          w.dirty.clear();
          if (res && res.changes && res.changes.length) worstEdit = Math.max(worstEdit, BT.now() - e0);
        }
        total += BT.now() - f0;
        frames++;
      }
      const avg = total / frames;
      note(`big build: ${w.placedCount()} placed blocks (${Math.round(built)} ms), full mesh ${Math.round(full)} ms, worst chunk ${worstChunk.toFixed(1)} ms, ${Math.round(tris)} triangles in ${meshes} meshes; frame ${avg.toFixed(2)} ms avg, worst edit ${worstEdit.toFixed(1)} ms`);
      expect(w.placedCount() > 6000, `the big build is only ${w.placedCount()} blocks`);
      expect(avg <= BUDGET.frameAvg, `a frame of play takes ${avg.toFixed(2)} ms on average (budget ${BUDGET.frameAvg})`);
      expect(worstEdit <= BUDGET.editWorst, `the worst edit (relight + redraw) took ${worstEdit.toFixed(1)} ms (budget ${BUDGET.editWorst})`);
      expect(worstChunk <= BUDGET.chunkWorst, `the slowest chunk took ${worstChunk.toFixed(1)} ms to mesh (budget ${BUDGET.chunkWorst})`);
      expect(full <= BUDGET.fullMesh, `meshing the whole island took ${Math.round(full)} ms (budget ${BUDGET.fullMesh})`);
      expect(tris <= BUDGET.triangles, `${Math.round(tris)} triangles (budget ${BUDGET.triangles})`);
      if (opts.render) {
        const rt = opts.render(s);
        if (rt) {
          note(`drawing: ${rt.avg.toFixed(2)} ms a frame on average over ${rt.frames} frames`);
          expect(rt.avg <= rt.budget, `drawing the big build takes ${rt.avg.toFixed(2)} ms a frame (budget ${rt.budget})`);
        }
      }
    });

    for (const k in BT.SAB) delete BT.SAB[k];
    const fails = [];
    for (const g of groups) for (const f of g.fails) fails.push(`${g.name}: ${f}`);
    return { ok: !fails.length, groups, fails, sabotage: sab };
  }

  BT.check = check;
  BT.check.SABOTAGE = SABOTAGE;
  BT.check.BUDGET = BUDGET;
})();
