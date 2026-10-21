/* TT Blocks: the companion. Call the other brother any time, as often as you like (T, or his face top left; the ▾ next
   to it, or B, picks what he builds). Kit.roster.buddyFor: Tommy when Teddy plays, Teddy when Tommy plays.
   A visit: he pops in beside where you're looking, at his roster buddyScale, in a puff of stars -> does his signature
   move (Teddy's boxing or 🏀 jump shot, Tommy's Y with ✌️) -> tosses you a treat (🍦 💧 🧃 🍪 🍉 🍌) -> builds a
   ready-made piece where you're looking, block by block (a little house, a tower, a bridge or a tree, picked at
   random or from the menu): "TOMMY SAYS: I BUILT YOU A HOUSE!" -> waves and pops away. One UNDO takes the piece away.
   When both brothers play, he's already there: T is a high five instead. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const TREATS = [['🍦', 'ICE CREAM'], ['💧', 'WATER'], ['🧃', 'JUICE'], ['🍪', 'COOKIE'], ['🍉', 'WATERMELON'], ['🍌', 'BANANA']];
  const PIECE_WORD = { house: 'A HOUSE', tower: 'A TOWER', bridge: 'A BRIDGE', tree: 'A TREE' };
  const V = { pop: 0.35, treatAt: 0.9, buildAt: 1.5, perStep: 0.045, stay: 2.2, bye: 0.6 };
  const b = { phase: 'off', t: 0, who: null, kind: null, list: null, done: [], k: 0, acc: 0, pos: null, yaw: 0, treat: null, calls: 0, treats: 0, built: 0, five: 0, lastSay: null, lastTreat: null, piece: null };

  function call(sess, kind) {
    b.calls++;
    if (sess.two) return highFive(sess);
    if (b.phase !== 'off') finish(sess); // already here: finish the last piece first, then do it again
    const meId = sess.active;
    b.who = Kit.roster.buddyFor(meId);
    b.kind = kind && BT.build.PIECES[kind] ? kind : BT.build.PIECE_KINDS[Math.floor(Math.random() * BT.build.PIECE_KINDS.length)];
    const spot = sess.pieceSpot();
    b.piece = spot;
    b.list = sess.builder.pieceList(b.kind, spot.origin, spot.facing);
    b.done = [];
    b.k = 0;
    b.acc = 0;
    // he stands beside the spot, a step toward you, looking at you
    const p = sess.P();
    const [R, F] = BT.build.AXES[spot.facing];
    let x = spot.origin.x + 0.5 + R[0] * -3 + F[0] * -1, z = spot.origin.z + 0.5 + R[1] * -3 + F[1] * -1;
    if (Math.hypot(x - p.pos.x, z - p.pos.z) < 1.2) { x += R[0] * 1.5; z += R[1] * 1.5; }
    let y = sess.world.heightAt(Math.floor(x), Math.floor(z));
    if (y > p.pos.y + 4 || y < p.pos.y - 6) { x = p.pos.x + R[0] * 1.6 + F[0] * 1.6; z = p.pos.z + R[1] * 1.6 + F[1] * 1.6; y = p.pos.y; }
    b.pos = { x, y, z };
    b.yaw = Math.atan2(p.pos.x - x, p.pos.z - z) + Math.PI;
    b.phase = 'pop';
    b.t = 0;
    b.treat = TREATS[(b.calls * 7 + Math.floor(Math.random() * 6)) % TREATS.length];
    BT.sfx.pop();
    return { who: b.who, kind: b.kind };
  }

  function highFive(sess) {
    const me = sess.P(), o = sess.other();
    if (!o) return null;
    // he pops over beside you
    const [R] = BT.build.AXES[BT.build.facingOf(me.yaw)];
    o.place(me.pos.x + R[0] * 1.3, me.pos.y, me.pos.z + R[1] * 1.3, me.yaw);
    o.unstick(sess.world);
    b.five = 1.6;
    b.phase = 'five';
    b.who = o.id;
    BT.sfx.clap();
    BT.ui.toast('HIGH FIVE! 🙌', 'super', 1600);
    BT.ui.confetti(60);
    return { five: true };
  }

  // the rest of the piece goes up at once (a new call, leaving the world)
  function finish(sess) {
    if (b.list && b.k < b.list.length) {
      const ch = sess.world.setMany(b.list.slice(b.k));
      b.done.push(...ch);
      b.k = b.list.length;
    }
    if (b.done.length) {
      sess.builder.undoStack.push({ kind: 'piece', changes: b.done });
      if (sess.builder.undoStack.length > BT.build.UNDO_MAX) sess.builder.undoStack.shift();
      sess.edited(b.done);
      b.built++;
    }
    b.done = [];
    b.list = null;
    b.phase = 'off';
    BT.actors.hidePerson('buddy:' + b.who);
  }

  function update(sess, dt) {
    if (b.phase === 'off') return;
    b.t += dt;
    if (b.phase === 'five') {
      b.five -= dt;
      if (b.five <= 0) b.phase = 'off';
      return;
    }
    const entry = Kit.roster.get(b.who);
    const who = entry.name.toUpperCase();
    if (b.phase === 'pop' && b.t >= V.pop) b.phase = 'move';
    if (b.phase === 'move' && b.t >= V.treatAt && !b.lastTreatAt) {
      b.lastTreatAt = b.t;
      const [emoji, name] = b.treat;
      b.treats++;
      b.lastTreat = emoji;
      const c = BT.render.camera.position;
      BT.actors.toss(emoji, new THREE.Vector3(b.pos.x, b.pos.y + 1.6, b.pos.z), c.clone());
      BT.sfx.treat();
      BT.ui.toast(`${emoji} ${name} FROM ${who}!`, 'treat', 1800);
    }
    if (b.phase === 'move' && b.t >= V.buildAt) b.phase = 'build';
    if (b.phase === 'build') {
      b.acc += dt;
      let n = 0;
      while (b.acc >= V.perStep && b.k < b.list.length) {
        b.acc -= V.perStep;
        // a few blocks at a time, bottom first
        const step = b.list.slice(b.k, b.k + 6);
        b.k += step.length;
        const ch = sess.world.setMany(step);
        b.done.push(...ch);
        n += ch.length;
      }
      if (n) BT.sfx.build();
      if (b.k >= b.list.length) {
        const kind = b.kind;
        finish(sess);
        b.phase = 'bye';
        b.t = 0;
        b.lastSay = `${who} SAYS: I BUILT YOU ${PIECE_WORD[kind]}!`;
        BT.ui.toast(b.lastSay, 'good', 2600);
      }
    }
    if (b.phase === 'bye' && b.t >= V.stay + V.bye) { b.phase = 'off'; BT.actors.hidePerson('buddy:' + b.who); BT.sfx.pop(); }
  }

  // draw him: the pop (scale up from nothing), the move, building (a wave), the goodbye (shrink away)
  function draw(sess, dt) {
    if (b.phase === 'off' || b.phase === 'five' || !b.who) return;
    const o = BT.actors.person('buddy:' + b.who);
    const entry = o.entry;
    const sig = Kit.roster.signature(entry, 'hello');
    const mode = b.phase === 'pop' || b.phase === 'move' ? sig : b.phase === 'build' ? 'give' : Kit.roster.signature(entry, 'goodbye');
    BT.actors.posePerson(o, b.pos.x, b.pos.y, b.pos.z, b.yaw, mode === 'boxing' ? 'boxing' : mode, dt, mode === 'boxing' ? 9 : 6);
    let s = entry.buddyScale || 0.8;
    if (b.phase === 'pop') s *= Math.min(1, b.t / V.pop) * (1 + 0.25 * Math.sin(Math.min(1, b.t / V.pop) * Math.PI));
    if (b.phase === 'bye' && b.t > V.stay) s *= Math.max(0.01, 1 - (b.t - V.stay) / V.bye);
    o.g.scale.setScalar(s);
  }

  const info = () => ({ phase: b.phase, who: b.who, kind: b.kind, calls: b.calls, treats: b.treats, built: b.built, lastTreat: b.lastTreat, lastSay: b.lastSay, left: b.list ? b.list.length - b.k : 0 });
  function reset(sess) { if (sess && b.phase !== 'off') finish(sess); b.phase = 'off'; b.lastTreatAt = 0; }
  // keep the treat clock per visit
  const _call = call;
  BT.buddy = { call: (sess, kind) => { b.lastTreatAt = 0; return _call(sess, kind); }, update, draw, info, finish, reset, TREATS, PIECE_WORD };
})();
