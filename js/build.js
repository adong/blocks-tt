/* TT Blocks: building. Every change to the world goes through here, so each one can be undone:
     place / dig         one block (and its mirror twin when MIRROR is on)
     fill                a box between two corners, filled with a block (or emptied)
     piece               a ready-made house, tower, bridge or tree, built where you're looking (the brother's helper)
     undo                puts the last change back, however big it was
   No Three.js: the check runs it headless. Rules: nothing goes where a player stands, and the bottom layer of the
   island can't be dug (so nobody falls out of the world). */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const { ID, AIR, SOLID } = BT.blocks;
  const MAX_FILL = 20, MAX_FILL_CELLS = 6000, UNDO_MAX = 60;

  function overlapsBody(bodies, x, y, z) {
    for (const p of bodies || []) {
      if (!p) continue;
      const hw = p.w / 2;
      if (x + 1 > p.pos.x - hw && x < p.pos.x + hw && z + 1 > p.pos.z - hw && z < p.pos.z + hw && y + 1 > p.pos.y && y < p.pos.y + p.h) return true;
    }
    return false;
  }
  const replaceable = (b) => b === AIR || b === ID.water;

  // the mirror: a line through the middle of block m, along x or z. Twice the line's coordinate keeps it whole.
  function mirrorOf(mirror, x, y, z) {
    if (!mirror || !mirror.on) return null;
    if (mirror.axis === 'x') { const mx = mirror.m2 - x; return mx === x ? null : [mx, y, z]; }
    const mz = mirror.m2 - z;
    return mz === z ? null : [x, y, mz];
  }

  function Builder(world) {
    this.world = world;
    this.undoStack = [];
    this.mirror = { on: false, axis: 'x', m2: 0 };
    this.bodies = [];
    this.count = { placed: 0, dug: 0 };
  }
  Builder.prototype.commit = function (list, kind) {
    const ch = this.world.setMany(list);
    if (ch.length && !BT.SAB.undoOff) {
      this.undoStack.push({ kind, changes: ch });
      if (this.undoStack.length > UNDO_MAX) this.undoStack.shift();
    }
    return ch;
  };
  Builder.prototype.canPlace = function (x, y, z) {
    const w = this.world;
    return w.inside(x, y, z) && replaceable(w.get(x, y, z)) && !overlapsBody(this.bodies, x, y, z);
  };
  Builder.prototype.canDig = function (x, y, z) {
    const w = this.world;
    return w.inside(x, y, z) && y > 0 && !replaceable(w.get(x, y, z));
  };
  Builder.prototype.place = function (x, y, z, id) {
    const list = [];
    if (this.canPlace(x, y, z)) list.push([x, y, z, id]);
    const m = mirrorOf(this.mirror, x, y, z);
    if (list.length && m && this.canPlace(m[0], m[1], m[2])) list.push([m[0], m[1], m[2], id]);
    const ch = this.commit(list, 'place');
    if (ch.length) this.count.placed += ch.length;
    return ch;
  };
  Builder.prototype.dig = function (x, y, z) {
    const list = [];
    if (this.canDig(x, y, z)) list.push([x, y, z, AIR]);
    const m = mirrorOf(this.mirror, x, y, z);
    if (list.length && m && this.canDig(m[0], m[1], m[2])) list.push([m[0], m[1], m[2], AIR]);
    const ch = this.commit(list, 'dig');
    if (ch.length) this.count.dug += ch.length;
    return ch;
  };
  // the box between two corners (each side at most MAX_FILL blocks, counted from the first corner)
  Builder.prototype.fillBox = function (a, b) {
    const lim = (p, q) => (q >= p ? Math.min(q, p + MAX_FILL - 1) : Math.max(q, p - MAX_FILL + 1));
    const bx = lim(a.x, b.x), by = lim(a.y, b.y), bz = lim(a.z, b.z);
    return { x0: Math.min(a.x, bx), y0: Math.min(a.y, by), z0: Math.min(a.z, bz), x1: Math.max(a.x, bx), y1: Math.max(a.y, by), z1: Math.max(a.z, bz) };
  };
  Builder.prototype.fill = function (a, b, id) {
    const box = this.fillBox(a, b);
    const list = [];
    for (let y = box.y0; y <= box.y1; y++)
      for (let z = box.z0; z <= box.z1; z++)
        for (let x = box.x0; x <= box.x1; x++) {
          if (list.length >= MAX_FILL_CELLS) break;
          if (!this.world.inside(x, y, z)) continue;
          if (id === AIR) { if (this.canDig(x, y, z)) list.push([x, y, z, AIR]); }
          else if (!overlapsBody(this.bodies, x, y, z)) list.push([x, y, z, id]);
          const m = mirrorOf(this.mirror, x, y, z);
          if (m && this.world.inside(m[0], m[1], m[2])) {
            if (id === AIR) { if (this.canDig(m[0], m[1], m[2])) list.push([m[0], m[1], m[2], AIR]); }
            else if (!overlapsBody(this.bodies, m[0], m[1], m[2])) list.push([m[0], m[1], m[2], id]);
          }
        }
    return this.commit(list, 'fill');
  };
  Builder.prototype.undo = function () {
    const last = this.undoStack.pop();
    if (!last) return null;
    this.world.revert(last.changes);
    return last;
  };
  // put a ready-made piece's blocks into the world (or just list them, for building it a few at a time)
  Builder.prototype.pieceList = function (kind, origin, facing) {
    const parts = PIECES[kind](BT.rng(BT.hash(kind + origin.x + ',' + origin.y + ',' + origin.z)));
    const [R, F] = AXES[facing & 3];
    const out = [];
    for (const [lx, ly, lz, id] of parts) {
      const x = origin.x + lx * R[0] + lz * F[0], z = origin.z + lx * R[1] + lz * F[1], y = origin.y + ly;
      if (!this.world.inside(x, y, z) || y < 1) continue;
      if (id !== AIR && overlapsBody(this.bodies, x, y, z)) continue;
      out.push([x, y, z, id]);
    }
    // bottom first, so it grows up out of the ground
    out.sort((a, b) => a[1] - b[1]);
    return out;
  };
  Builder.prototype.piece = function (kind, origin, facing) { return this.commit(this.pieceList(kind, origin, facing), 'piece'); };

  // facing: 0 looking toward -z, 1 toward -x, 2 toward +z, 3 toward +x. [right, forward] as [x, z]
  const AXES = [[[1, 0], [0, -1]], [[0, -1], [-1, 0]], [[-1, 0], [0, 1]], [[0, 1], [1, 0]]];
  function facingOf(yaw) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (Math.abs(fx) > Math.abs(fz)) return fx < 0 ? 1 : 3;
    return fz < 0 ? 0 : 2;
  }

  // ---------- the ready-made pieces, in their own coordinates: x to the right, y up, z away from you ----------
  const PIECES = {
    house() {
      const out = [];
      for (let z = 0; z <= 5; z++)
        for (let x = -3; x <= 3; x++) {
          out.push([x, -1, z, ID.planks]); // the floor
          for (let y = 0; y <= 3; y++) {
            const wall = x === -3 || x === 3 || z === 0 || z === 5;
            if (!wall) { out.push([x, y, z, AIR]); continue; }
            const corner = (x === -3 || x === 3) && (z === 0 || z === 5);
            const door = z === 0 && x === 0 && y <= 1;
            const window = !corner && y >= 1 && y <= 2 && ((x === -3 || x === 3) && (z === 2 || z === 3) || (z === 5 && (x === -1 || x === 1)) || (z === 0 && (x === -2 || x === 2)));
            out.push([x, y, z, door ? AIR : corner ? ID.wood : window ? ID.glass : ID.planks]);
          }
        }
      // the roof: red, with a little peak
      for (let z = -1; z <= 6; z++) for (let x = -4; x <= 4; x++) out.push([x, 4, z, ID.red]);
      for (let z = 0; z <= 5; z++) for (let x = -2; x <= 2; x++) out.push([x, 5, z, ID.red]);
      for (let z = 1; z <= 4; z++) for (let x = -1; x <= 1; x++) out.push([x, 6, z, ID.red]);
      out.push([2, 3, 4, ID.lamp]); // a lamp inside, for the night
      out.push([0, 0, -1, AIR], [0, 1, -1, AIR], [0, -1, -1, ID.yellow]); // the doorstep and a yellow mat
      return out;
    },
    tower() {
      const out = [];
      for (let y = 0; y <= 11; y++)
        for (let z = 0; z <= 2; z++)
          for (let x = -1; x <= 1; x++) out.push([x, y, z, y % 4 === 3 ? ID.stone : ID.brick]);
      for (const [x, z] of [[-1, 0], [1, 0], [-1, 2], [1, 2]]) out.push([x, 12, z, ID.brick]);
      out.push([0, 12, 1, ID.lamp]);
      return out;
    },
    bridge() {
      const out = [];
      for (let z = 0; z <= 11; z++)
        for (let x = -1; x <= 1; x++) {
          out.push([x, -1, z, ID.planks]);
          const post = (x === -1 || x === 1) && z % 3 === 0;
          for (let y = 0; y <= 2; y++) out.push([x, y, z, post && y === 0 ? ID.wood : AIR]);
        }
      out.push([-1, 1, 0, ID.lamp], [1, 1, 0, ID.lamp], [-1, 1, 9, ID.lamp], [1, 1, 9, ID.lamp]);
      return out;
    },
    tree(r) {
      const out = [];
      for (let y = 0; y <= 4; y++) out.push([0, y, 2, ID.wood]);
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -2; dz <= 2; dz++)
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dz === 0 && dy <= 0) continue;
            if (dx * dx + (dy * 1.25) ** 2 + dz * dz > 5.6) continue;
            out.push([dx, 5 + dy, 2 + dz, r.chance(0.1) ? ID.red : ID.leaves]); // with a few red apples
          }
      return out;
    },
  };
  const PIECE_KINDS = ['house', 'tower', 'bridge', 'tree'];

  // the ruler: how many blocks from one block to another, along each side and straight
  function measure(a, b) {
    const dx = Math.abs(b.x - a.x) + 1, dy = Math.abs(b.y - a.y) + 1, dz = Math.abs(b.z - a.z) + 1;
    return { dx, dy, dz, straight: Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 10) / 10 };
  }

  BT.Builder = Builder;
  BT.build = { overlapsBody, mirrorOf, facingOf, PIECES, PIECE_KINDS, AXES, measure, MAX_FILL, UNDO_MAX };
})();
