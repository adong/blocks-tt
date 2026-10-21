/* TT Blocks: one world being played: the island, the builder (with its undo), the brothers, the animals, the time
   of day, the stars found and the quests done, and the tools (build, FILL box, RULER; MIRROR is a switch on the
   builder). Saving turns it into plain data and back (snapshot / fromState).
   No Three.js and no page: js/game.js draws it and feeds it the keys and taps; the check plays it headless.
   Events for the page (sounds, toasts, the cheer) collect in session.events. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const { ID, AIR } = BT.blocks;
  const DAY = 420; // a whole day and night, in seconds
  const DAY_PART = 0.65; // the day is the first 65% of it
  const REACH = 7;

  function Session(opts) {
    opts = opts || {};
    this.id = opts.id || BT.save.newId();
    this.world = new BT.World(opts.seed);
    this.seed = this.world.seedText;
    this.name = opts.name || this.seed;
    this.made = opts.made || Date.now();
    this.builder = new BT.Builder(this.world);
    this.two = !!opts.two;
    this.active = opts.kid || 'tommy';
    this.diff = Object.assign({ teddy: 'easy', tommy: 'easy' }, opts.diff || {});
    this.players = {};
    const s = this.world.spawn;
    for (const id of ['tommy', 'teddy']) {
      if (!this.two && id !== this.active) continue;
      const p = new BT.Player(id);
      const side = this.two && id === 'teddy' ? 1.6 : 0;
      p.place(s.x + 0.5 + Math.cos(s.yaw) * side, s.y, s.z + 0.5 - Math.sin(s.yaw) * side, s.yaw);
      p.unstick(this.world);
      p.easy = this.diff[id] === 'easy';
      this.players[id] = p;
    }
    this.animals = BT.animals.spawnAll(this.world);
    this.r = BT.rng(this.world.seed ^ 0x5eed);
    this.tod = 0.12; // a sunny morning
    this.found = {};
    this.done = {};
    this.events = [];
    this.tool = 'build';
    this.fillA = null;
    this.ruler = { a: null, b: null };
    this.questDue = -1;
    this.lastEdit = null;
    this.saved = this.world.version;
    this.syncBodies();
  }
  Session.prototype.P = function () { return this.players[this.active]; };
  Session.prototype.other = function () { return this.players[this.active === 'teddy' ? 'tommy' : 'teddy'] || null; };
  Session.prototype.syncBodies = function () { this.builder.bodies = Object.values(this.players); };
  Session.prototype.setDiff = function (id, diff) {
    this.diff[id] = diff;
    if (this.players[id]) { this.players[id].easy = diff === 'easy'; if (diff === 'normal') this.players[id].fly = false; }
  };
  // 2 players: swap whose turn it is
  Session.prototype.turn = function () {
    if (!this.two) return false;
    this.active = this.active === 'teddy' ? 'tommy' : 'teddy';
    this.fillA = null;
    this.events.push({ type: 'turn', who: this.active });
    return true;
  };

  // ---------- the clock ----------
  Session.prototype.sun = function () {
    // the sun's angle over the horizon (0 rising, PI setting; the moon has the other half)
    const t = ((this.tod % 1) + 1) % 1;
    return t < DAY_PART ? (t / DAY_PART) * Math.PI : Math.PI + ((t - DAY_PART) / (1 - DAY_PART)) * Math.PI;
  };
  Session.prototype.daylight = function () { return BT.smooth(-0.12, 0.22, Math.sin(this.sun())); };
  Session.prototype.isNight = function () { return this.daylight() < 0.35; };

  // ---------- a frame ----------
  // inp: the active player's { fx, fz, up, down }
  Session.prototype.step = function (dt, inp) {
    if (BT.SAB.slow) { const t0 = BT.now(); while (BT.now() - t0 < 20); }
    const p = this.P();
    p.step(this.world, dt, inp);
    const o = this.other();
    if (o) o.step(this.world, dt, {});
    for (const a of this.animals) {
      a.step(this.world, dt, Object.values(this.players), this.r);
      if (a.say) this.events.push({ type: 'animal', kind: a.kind, say: a.say, uid: a.uid });
    }
    this.tod = (this.tod + dt / DAY) % 1;
    // the stars
    const got = BT.quests.starsNear(this.world.stars, this.found, p.pos.x, p.pos.y + p.h * 0.5, p.pos.z);
    for (const id of got) {
      this.found[id] = this.active;
      const n = Object.keys(this.found).length;
      this.events.push({ type: 'star', id, count: n, total: this.world.stars.length });
      if (n >= this.world.stars.length) this.complete('stars');
    }
    if (this.questDue >= 0) {
      this.questDue -= dt;
      if (this.questDue < 0) this.checkQuests();
    }
  };

  Session.prototype.complete = function (id) {
    if (this.done[id]) return false;
    this.done[id] = this.active;
    this.events.push({ type: 'quest', id, who: this.active, all: BT.quests.LIST.every((q) => this.done[q.id]) });
    return true;
  };
  Session.prototype.checkQuests = function (everywhere) {
    const e = everywhere ? null : this.lastEdit;
    if (!this.done.tower && BT.quests.towerDone(this.world, e ? e.x : null, e ? e.z : null)) this.complete('tower');
    if (!this.done.house) {
      const h = e ? BT.quests.houseCheck(this.world, e.x, e.y, e.z, 12) : BT.quests.houseCheck(this.world, null);
      if (h.ok) this.complete('house');
    }
  };
  Session.prototype.edited = function (changes) {
    if (!changes || !changes.length) return;
    const W = BT.W, D = BT.D;
    const [i] = changes[changes.length - 1];
    this.lastEdit = { x: i % W, y: Math.floor(i / (W * D)), z: Math.floor(i / W) % D };
    this.questDue = 0.25;
  };

  // ---------- the crosshair and the tools ----------
  Session.prototype.eye = function (p) { p = p || this.P(); return { x: p.pos.x, y: p.pos.y + p.eye, z: p.pos.z }; };
  Session.prototype.aim = function () {
    const p = this.P();
    const e = this.eye(p), d = BT.physics.lookDir(p.yaw, p.pitch);
    const reach = p.easy ? REACH + 1 : REACH;
    const hit = BT.physics.raycast(this.world, e.x, e.y, e.z, d.x, d.y, d.z, reach);
    // an animal in front of the block?
    let animal = null, ad = hit ? hit.dist : reach;
    for (const a of this.animals) { const t = a.rayHit(e, d, ad); if (t >= 0 && t < ad) { ad = t; animal = a; } }
    return { hit, animal, eye: e, dir: d };
  };
  Session.prototype.block = function () { const p = this.P(); return p.hotbar[p.sel]; };
  // kind: 'place' (right click, PLACE) or 'dig' (left click, BREAK). Returns what happened, for sounds and crumbs.
  Session.prototype.act = function (kind) {
    const aim = this.aim();
    if (aim.animal) { const say = aim.animal.pet(); this.events.push({ type: 'pet', kind: aim.animal.kind, say, uid: aim.animal.uid }); return { pet: aim.animal }; }
    const hit = aim.hit;
    if (!hit) return null;
    const cell = kind === 'place' ? hit.place : { x: hit.x, y: hit.y, z: hit.z };
    if (this.tool === 'fill') {
      if (!this.fillA) { this.fillA = Object.assign({ kind }, cell); this.events.push({ type: 'corner', n: 1 }); return { corner: 1 }; }
      const a = this.fillA;
      this.fillA = null;
      const ch = this.builder.fill(a, cell, a.kind === 'place' ? this.block() : AIR);
      this.edited(ch);
      this.events.push({ type: 'fill', n: ch.length, kind: a.kind });
      return { fill: ch };
    }
    if (this.tool === 'ruler') {
      if (!this.ruler.a || this.ruler.b) this.ruler = { a: { x: hit.x, y: hit.y, z: hit.z }, b: null };
      else this.ruler.b = { x: hit.x, y: hit.y, z: hit.z };
      this.events.push({ type: 'ruler' });
      return { ruler: this.ruler };
    }
    const old = this.world.get(hit.x, hit.y, hit.z);
    const ch = kind === 'place' ? this.builder.place(cell.x, cell.y, cell.z, this.block()) : this.builder.dig(cell.x, cell.y, cell.z);
    this.edited(ch);
    return { changes: ch, cell, old };
  };
  Session.prototype.undo = function () {
    const u = this.builder.undo();
    if (u) this.edited(u.changes);
    return u;
  };
  Session.prototype.setTool = function (t) {
    this.tool = this.tool === t ? 'build' : t;
    this.fillA = null;
    if (this.tool !== 'ruler') this.ruler = { a: null, b: null };
    return this.tool;
  };
  Session.prototype.toggleMirror = function () {
    const m = this.builder.mirror;
    if (m.on) { m.on = false; return m; }
    const p = this.P(), aim = this.aim();
    const c = aim.hit ? aim.hit : { x: Math.floor(p.pos.x), z: Math.floor(p.pos.z) };
    // the line runs the way you're looking, through the block you point at: what you build on the left appears on the right
    const f = BT.build.facingOf(p.yaw);
    m.axis = f === 0 || f === 2 ? 'x' : 'z';
    m.m2 = 2 * (m.axis === 'x' ? c.x : c.z);
    m.on = true;
    return m;
  };
  // a ready-made piece where you're looking (the brother's helper)
  Session.prototype.pieceSpot = function () {
    const p = this.P(), aim = this.aim();
    const f = BT.build.facingOf(p.yaw);
    let o;
    if (aim.hit && aim.hit.dist > 1.5) o = aim.hit.ny === 1 ? aim.hit.place : { x: aim.hit.place.x, y: aim.hit.place.y, z: aim.hit.place.z };
    else {
      // nothing in reach: a few blocks ahead, on the ground
      const [, F] = BT.build.AXES[f];
      const x = Math.floor(p.pos.x) + F[0] * 4, z = Math.floor(p.pos.z) + F[1] * 4;
      o = { x, y: Math.max(1, Math.min(BT.H - 8, p.flying() ? Math.floor(p.pos.y) : this.world.heightAt(x, z))), z };
    }
    return { origin: o, facing: f };
  };

  // ---------- saving ----------
  Session.prototype.snapshot = function () {
    const players = {};
    for (const [id, p] of Object.entries(this.players)) {
      players[id] = { pos: [+p.pos.x.toFixed(3), +p.pos.y.toFixed(3), +p.pos.z.toFixed(3)], yaw: +p.yaw.toFixed(4), pitch: +p.pitch.toFixed(4), fly: p.fly, hotbar: p.hotbar.slice(), sel: p.sel };
    }
    return { id: this.id, name: this.name, seed: this.seed, made: this.made, edits: this.world.encodeEdits(), players, active: this.active, two: this.two,
      diff: Object.assign({}, this.diff), tod: +this.tod.toFixed(5), found: Object.assign({}, this.found), done: Object.assign({}, this.done) };
  };
  Session.fromState = function (st) {
    const s = new Session({ id: st.id, seed: st.seed, name: st.name, made: st.made, two: st.two, kid: st.active, diff: st.diff });
    try { s.world.applyEdits(st.edits.data); } catch (e) { s.events.push({ type: 'badsave' }); }
    for (const [id, q] of Object.entries(st.players || {})) {
      const p = s.players[id];
      if (!p || !q) continue;
      p.place(q.pos[0], q.pos[1], q.pos[2], q.yaw);
      p.pitch = q.pitch || 0;
      p.fly = !!q.fly;
      if (Array.isArray(q.hotbar) && q.hotbar.length === 9) p.hotbar = q.hotbar.map((b) => (b > 0 && b < BT.blocks.N ? b : ID.grass));
      p.sel = Math.max(0, Math.min(8, q.sel | 0));
    }
    s.tod = typeof st.tod === 'number' ? st.tod : s.tod;
    s.found = Object.assign({}, st.found);
    s.done = Object.assign({}, st.done);
    s.saved = s.world.version;
    return s;
  };
  Session.prototype.save = function () {
    const ok = BT.save.save(this.snapshot());
    this.saved = this.world.version;
    return ok;
  };

  BT.Session = Session;
  BT.session = { DAY, DAY_PART, REACH };
})();
