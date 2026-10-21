/* TT Blocks: the friendly animals (our own): puffy sheep that graze and wander, chicks that hop after you, and sleepy
   cats that nap in the sun, wake up for a stretch when you come close, then curl up again. No monsters, nothing
   to fight. They walk on the blocks, hop up one-block steps, stay out of the water and away from the island's edge,
   and pop back up on top if someone builds over them. Tap or click one to pet it.
   The rules only (no Three.js): js/animalart.js draws them. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const { ID } = BT.blocks;
  const KIND = {
    sheep: { speed: 1.1, roam: 7, h: 1.0, say: 'baa' },
    chick: { speed: 1.9, roam: 4, h: 0.5, say: 'peep' },
    cat: { speed: 1.5, roam: 5, h: 0.6, say: 'meow' },
  };

  function Animal(kind, x, z, world, uid) {
    this.uid = uid;
    this.kind = kind;
    this.home = { x, z };
    this.pos = { x, y: world.heightAt(Math.floor(x), Math.floor(z)), z };
    this.vy = 0;
    this.yaw = 0;
    this.state = kind === 'cat' ? 'sleep' : 'idle';
    this.t = 1 + (uid % 5);
    this.target = null;
    this.hop = 0;
    this.petT = 0;
    this.say = null;
    this.awake = 0;
  }

  // where you'd stand in column (x, z), stepping at most one block up from y: null if there's no footing
  function footing(world, x, z, y) {
    const fx = Math.floor(x), fz = Math.floor(z);
    for (let yy = Math.floor(y + 1.01); yy >= Math.max(0, Math.floor(y) - 4); yy--) {
      if (world.solidAt(fx, yy - 1, fz) && !world.solidAt(fx, yy, fz)) return yy;
    }
    return null;
  }

  Animal.prototype.step = function (world, dt, players, r) {
    const a = this, K = KIND[a.kind];
    a.say = null;
    a.t -= dt;
    a.hop = Math.max(0, a.hop - dt * 3);
    a.petT = Math.max(0, a.petT - dt);
    // built over? pop up on top
    if (world.solidAt(Math.floor(a.pos.x), Math.floor(a.pos.y + 0.1), Math.floor(a.pos.z))) {
      let y = Math.floor(a.pos.y);
      while (y < BT.H && world.solidAt(Math.floor(a.pos.x), y, Math.floor(a.pos.z))) y++;
      a.pos.y = y;
      a.vy = 0;
      a.hop = 1;
    }
    // the nearest player
    let near = null, nd = 1e9;
    for (const p of players || []) {
      if (!p) continue;
      const d = Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) + Math.abs(p.pos.y - a.pos.y) * 0.5;
      if (d < nd) { nd = d; near = p; }
    }
    if (a.kind === 'cat') {
      if (a.state === 'sleep') {
        if (near && nd < 2.4 && a.t <= 0) { a.state = 'stretch'; a.t = 1.3; a.say = 'meow'; }
        else if (near && nd < 4 && r() < dt * 0.25) a.say = 'purr';
      } else if (a.state === 'stretch' && a.t <= 0) { a.state = 'idle'; a.t = 0.5; a.awake = 8 + r() * 5; }
      if (a.state !== 'sleep' && a.state !== 'stretch') {
        a.awake -= dt;
        if (a.awake <= 0 && a.state === 'idle') { a.state = 'sleep'; a.t = 4; }
      }
    }
    if (a.state === 'idle' && a.t <= 0) {
      // pick somewhere to go: chicks follow you about, everyone else wanders near home
      let tx, tz;
      if (a.kind === 'chick' && near && nd < 8 && nd > 2) { tx = near.pos.x + r.range(-1.2, 1.2); tz = near.pos.z + r.range(-1.2, 1.2); }
      else {
        const roam = K.roam;
        tx = (r() < 0.6 ? a.home.x : a.pos.x) + r.range(-roam, roam);
        tz = (r() < 0.6 ? a.home.z : a.pos.z) + r.range(-roam, roam);
      }
      a.target = { x: Math.min(BT.W - 3, Math.max(3, tx)), z: Math.min(BT.D - 3, Math.max(3, tz)) };
      a.state = 'walk';
      a.t = 6;
      if (r() < 0.25) a.say = K.say;
    } else if (a.state === 'walk') {
      const dx = a.target.x - a.pos.x, dz = a.target.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.25 || a.t <= 0) { a.state = 'idle'; a.t = a.kind === 'sheep' ? r.range(2.5, 6) : r.range(0.5, 2.5); }
      else {
        a.yaw = Math.atan2(-dx, -dz);
        const sp = K.speed * Math.min(1, d);
        const nx = a.pos.x + (dx / d) * sp * dt, nz = a.pos.z + (dz / d) * sp * dt;
        const f = footing(world, nx, nz, a.pos.y);
        const wet = f != null && world.get(Math.floor(nx), f, Math.floor(nz)) === ID.water || f != null && world.get(Math.floor(nx), f - 1, Math.floor(nz)) === ID.water;
        const headroom = f != null && !world.solidAt(Math.floor(nx), f + (K.h > 0.7 ? 1 : 0), Math.floor(nz));
        if (f == null || wet || !headroom || f > a.pos.y + 1.01) { a.state = 'idle'; a.t = r.range(0.3, 1.2); }
        else {
          if (f > a.pos.y + 0.01) { a.pos.y = f; a.hop = 1; }
          a.pos.x = nx; a.pos.z = nz;
          if (a.kind === 'chick' && a.hop <= 0) a.hop = 0.6;
        }
      }
    }
    // falling down a step
    const g = footing(world, a.pos.x, a.pos.z, a.pos.y);
    if (g != null && g < a.pos.y - 0.01) { a.vy -= 20 * dt; a.pos.y = Math.max(g, a.pos.y + a.vy * dt); }
    else a.vy = 0;
  };
  Animal.prototype.pet = function () {
    this.petT = 1.2;
    this.hop = 1;
    if (this.kind === 'cat' && this.state === 'sleep') { this.state = 'stretch'; this.t = 1.3; }
    this.say = KIND[this.kind].say;
    return this.say;
  };
  // is the ray (origin o, direction d) pointing at this animal? returns the distance or -1
  Animal.prototype.rayHit = function (o, d, max) {
    const K = KIND[this.kind];
    const c = { x: this.pos.x, y: this.pos.y + K.h * 0.5, z: this.pos.z };
    const rad = K.h * 0.65;
    const lx = c.x - o.x, ly = c.y - o.y, lz = c.z - o.z;
    const t = lx * d.x + ly * d.y + lz * d.z;
    if (t < 0 || t > max) return -1;
    const px = o.x + d.x * t - c.x, py = o.y + d.y * t - c.y, pz = o.z + d.z * t - c.z;
    return px * px + py * py + pz * pz <= rad * rad ? t : -1;
  };

  function spawnAll(world) {
    return world.animals.map((s, i) => new Animal(s.kind, s.x, s.z, world, i));
  }

  BT.Animal = Animal;
  BT.animals = { KIND, spawnAll, footing };
})();
