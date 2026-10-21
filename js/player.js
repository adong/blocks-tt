/* TT Blocks: a player's body: walking, jumping, flying and swimming, bumping into blocks one axis at a time.
   It hops up a one-block step by itself (no need to jump for every little ledge), floats in water, and can't walk off
   the island's edge. In 🐣 EASY you always fly. And the crosshair's ray: which block you're pointing at, and where a
   new block would go. No Three.js: the check runs it headless. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const { SOLID, ID, AIR } = BT.blocks;
  const G = 26, JUMP = 8.2, WALK = 4.6, FLY = 8.5, FLY_UP = 7, SWIM = 2.8;

  function Player(id) {
    this.id = id;
    this.pos = { x: 48, y: 30, z: 48 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;
    this.pitch = 0;
    this.fly = false;
    this.easy = true;
    this.onGround = false;
    this.inWater = false;
    this.w = 0.6;
    this.h = id === 'tommy' ? 1.45 : 1.7; // Tommy is shorter, so he sees the world from lower down
    this.eye = this.h - 0.14;
    this.stepped = 0;
    this.hotbar = BT.blocks.START_BAR.slice();
    this.sel = 0;
    this.walked = 0;
  }

  Player.prototype.place = function (x, y, z, yaw) { this.pos.x = x; this.pos.y = y; this.pos.z = z; this.vel.x = this.vel.y = this.vel.z = 0; if (yaw != null) this.yaw = yaw; };
  Player.prototype.flying = function () { return this.easy || this.fly; };

  function hits(world, p, x, y, z) {
    const hw = p.w / 2, e = 1e-4;
    const x0 = Math.floor(x - hw + e), x1 = Math.floor(x + hw - e);
    const y0 = Math.floor(y + e), y1 = Math.floor(y + p.h - e);
    const z0 = Math.floor(z - hw + e), z1 = Math.floor(z + hw - e);
    for (let yy = y0; yy <= y1; yy++)
      for (let zz = z0; zz <= z1; zz++)
        for (let xx = x0; xx <= x1; xx++) if (world.solidAt(xx, yy, zz)) return true;
    return false;
  }

  // move along one axis; returns true if a block stopped us
  function moveAxis(world, p, axis, d) {
    if (!d) return false;
    const steps = Math.ceil(Math.abs(d) / 0.3);
    const sd = d / steps;
    for (let s = 0; s < steps; s++) {
      const nx = p.pos.x + (axis === 0 ? sd : 0), ny = p.pos.y + (axis === 1 ? sd : 0), nz = p.pos.z + (axis === 2 ? sd : 0);
      if (!hits(world, p, nx, ny, nz)) { p.pos.x = nx; p.pos.y = ny; p.pos.z = nz; continue; }
      // snap to the block's face (unless that would put us in another block: then just stay put)
      const hw = p.w / 2, was = [p.pos.x, p.pos.y, p.pos.z];
      if (axis === 0) p.pos.x = sd > 0 ? Math.floor(nx + hw) - hw - 1e-3 : Math.floor(nx - hw) + 1 + hw + 1e-3;
      else if (axis === 1) p.pos.y = sd > 0 ? Math.floor(ny + p.h) - p.h - 1e-3 : Math.floor(ny) + 1;
      else p.pos.z = sd > 0 ? Math.floor(nz + hw) - hw - 1e-3 : Math.floor(nz - hw) + 1 + hw + 1e-3;
      if (hits(world, p, p.pos.x, p.pos.y, p.pos.z)) [p.pos.x, p.pos.y, p.pos.z] = was;
      return true;
    }
    return false;
  }

  // inp: { fx, fz } move (-1..1, right and forward), up (jump / fly up held), down (fly down held)
  Player.prototype.step = function (world, dt, inp) {
    const p = this;
    inp = inp || {};
    const fly = p.flying();
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    // forward is -z at yaw 0, right is +x
    let mx = (inp.fx || 0) * cy + (inp.fz || 0) * -sy;
    let mz = (inp.fx || 0) * -sy + (inp.fz || 0) * -cy;
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const feet = world.get(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.3), Math.floor(p.pos.z));
    p.inWater = feet === ID.water || world.get(Math.floor(p.pos.x), Math.floor(p.pos.y + 1), Math.floor(p.pos.z)) === ID.water;
    const speed = fly ? FLY : p.inWater ? WALK * 0.7 : WALK;
    const k = 1 - Math.exp(-(p.onGround || fly ? 14 : 4) * dt);
    p.vel.x += (mx * speed - p.vel.x) * k;
    p.vel.z += (mz * speed - p.vel.z) * k;
    if (fly) {
      const vy = (inp.up ? FLY_UP : 0) - (inp.down ? FLY_UP : 0);
      p.vel.y += (vy - p.vel.y) * (1 - Math.exp(-12 * dt));
    } else if (p.inWater) {
      p.vel.y -= G * 0.3 * dt;
      if (inp.up) p.vel.y = Math.max(p.vel.y, SWIM);
      p.vel.y = Math.max(p.vel.y, -3);
    } else {
      p.vel.y -= G * dt;
      if (inp.up && p.onGround) { p.vel.y = JUMP; p.onGround = false; }
      p.vel.y = Math.max(p.vel.y, -30);
    }
    const x0 = p.pos.x, z0 = p.pos.z;
    const bx = moveAxis(world, p, 0, p.vel.x * dt);
    const bz = moveAxis(world, p, 2, p.vel.z * dt);
    // a one-block step in the way: hop up it (walking) or float up over it (flying)
    if ((bx || bz) && (p.onGround || fly || p.inWater) && len > 0.1) {
      const tx = p.pos.x + mx * 0.35, tz = p.pos.z + mz * 0.35;
      if (!hits(world, p, tx, p.pos.y + 1.05, tz) && !hits(world, p, p.pos.x, p.pos.y + 1.05, p.pos.z)) {
        if (fly || p.inWater) p.vel.y = Math.max(p.vel.y, 5);
        else { p.vel.y = JUMP * 0.92; p.onGround = false; }
        p.stepped++;
      }
    }
    if (bx) p.vel.x = 0;
    if (bz) p.vel.z = 0;
    const falling = p.vel.y <= 0;
    const by = moveAxis(world, p, 1, p.vel.y * dt);
    p.onGround = by && falling;
    if (by) p.vel.y = 0;
    // the island's edge is a soft wall; far below or above, come back
    const W = BT.W, D = BT.D;
    p.pos.x = Math.min(W - 0.35, Math.max(0.35, p.pos.x));
    p.pos.z = Math.min(D - 0.35, Math.max(0.35, p.pos.z));
    if (p.pos.y > BT.H + 12) { p.pos.y = BT.H + 12; p.vel.y = Math.min(0, p.vel.y); }
    p.walked += Math.hypot(p.pos.x - x0, p.pos.z - z0);
    if (p.pos.y < -6 || hits(world, p, p.pos.x, p.pos.y, p.pos.z)) p.unstick(world);
  };

  // stuck inside blocks (someone built on top of us) or fallen out: pop up to the first free spot above
  Player.prototype.unstick = function (world) {
    const x = this.pos.x, z = this.pos.z;
    let y = Math.max(0, Math.floor(this.pos.y));
    for (; y < BT.H + 4; y++) if (!hits(world, this, x, y, z)) break;
    this.pos.y = y;
    this.vel.y = 0;
  };

  // the crosshair: step through the blocks along a ray (Amanatides & Woo). Air and water are passed through.
  function raycast(world, ox, oy, oz, dx, dy, dz, maxD) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / dx), tdy = Math.abs(1 / dy), tdz = Math.abs(1 / dz);
    let tx = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ox : ox - x) * tdx;
    let ty = dy === 0 ? Infinity : (dy > 0 ? y + 1 - oy : oy - y) * tdy;
    let tz = dz === 0 ? Infinity : (dz > 0 ? z + 1 - oz : oz - z) * tdz;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let n = 0; n < 200 && t <= maxD; n++) {
      const b = world.inside(x, y, z) ? world.blocks[BT.idx(x, y, z)] : AIR;
      if (b !== AIR && b !== ID.water) return { x, y, z, nx, ny, nz, dist: t, block: b, place: { x: x + nx, y: y + ny, z: z + nz } };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
  // the direction the camera looks
  function lookDir(yaw, pitch) {
    const cp = Math.cos(pitch);
    return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
  }

  BT.Player = Player;
  BT.physics = { hits, raycast, lookDir, G, JUMP, WALK, FLY };
})();
