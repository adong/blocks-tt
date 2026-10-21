/* TT Blocks: everyone you can see in the world.
   - Teddy and Tommy (Kit.people, at their roster buddyScale, so Teddy stands 1.7 blocks tall and Tommy 1.44): the
     other brother when you play 2 players, yourself in the 🎥 view from behind, both when a quest is done (the
     winner does his signature move: Teddy's boxing or 🏀 jump shot, Tommy's Y with ✌️).
   - The brother's visit (the companion): he pops in, does his move, tosses a treat and builds his piece.
   - The animals, made of soft boxes like everything else: puffy sheep, chicks, sleepy cats (with 💤).
   The rules for all of them live elsewhere (js/player.js, js/animals.js, js/buddy.js): this only draws. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const T = THREE;
  const A = (BT.actors = {});
  let scene;
  const people = {};
  const animals = new Map();
  const mats = {};
  const box = new T.BoxGeometry(1, 1, 1);
  const mat = (c) => mats[c] || (mats[c] = new T.MeshLambertMaterial({ color: c }));
  function cube(parent, w, h, d, c, x, y, z) {
    const m = new T.Mesh(box, mat(c));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  const emojiSprite = (e, s) => { const sp = new T.Sprite(new T.SpriteMaterial({ map: Kit.gfx.emojiTexture(e), transparent: true, depthWrite: false })); sp.scale.setScalar(s); return sp; };

  A.init = function (sc) { scene = sc; };

  // ---------- the brothers ----------
  // key: 'teddy' / 'tommy' (players) or 'buddy:teddy' / 'buddy:tommy' (a visit)
  A.person = function (key) {
    if (people[key]) return people[key];
    const id = key.replace('buddy:', '');
    const entry = Kit.roster.get(id);
    const p = Kit.people.build(entry.look);
    const g = new T.Group();
    g.add(p.root);
    g.scale.setScalar(entry.buddyScale || 0.8);
    g.visible = false;
    const tag = Kit.gfx.nameTag(entry.name, entry.tag || '#2a7bd6');
    tag.position.set(0, 2.45, 0);
    tag.visible = false;
    g.add(tag);
    scene.add(g);
    const o = { key, id, entry, p, g, tag, phase: 0, mode: 'idle', ball: null };
    people[key] = o;
    return o;
  };
  // put a person somewhere and pose them. mode: idle, walk, jet, peace, boxing, jumpshot, wave, give, jump
  A.posePerson = function (o, x, y, z, yaw, mode, dt, speed) {
    o.g.visible = true;
    o.g.position.set(x, y, z);
    o.g.rotation.y = yaw;
    o.phase += dt * (speed || 6);
    const m = mode === 'idle' ? 'stand' : mode;
    Kit.people.pose(o.p, o.phase, m, 1 - Math.exp(-14 * dt));
    // the jump shot: a hop and a 🏀
    if (mode === 'jumpshot') {
      if (!o.ball) { o.ball = emojiSprite('🏀', 0.5); o.g.add(o.ball); }
      const k = (o.phase % (Math.PI * 2)) / (Math.PI * 2);
      o.p.root.position.y = Math.sin(k * Math.PI) * 0.5;
      o.ball.visible = true;
      o.ball.position.set(0, 2.5 + k * 2.2, -k * 1.5);
    } else {
      o.p.root.position.y = 0;
      if (o.ball) o.ball.visible = false;
    }
  };
  A.hidePerson = (key) => { if (people[key]) people[key].g.visible = false; };
  A.hideAll = () => { for (const k in people) people[k].g.visible = false; };

  // ---------- animals ----------
  function sheep() {
    const g = new T.Group(), body = new T.Group();
    g.add(body);
    const legs = [];
    for (const [x, z] of [[-0.22, -0.3], [0.22, -0.3], [-0.22, 0.3], [0.22, 0.3]]) {
      const l = new T.Group(); l.position.set(x, 0.36, z); body.add(l);
      cube(l, 0.15, 0.36, 0.15, '#4a4060', 0, -0.18, 0);
      legs.push(l);
    }
    cube(body, 0.72, 0.52, 0.95, '#fffdf5', 0, 0.62, 0);
    const puffs = [[-0.34, 0.68, -0.2, 0.38], [0.34, 0.7, -0.15, 0.36], [-0.34, 0.66, 0.25, 0.36], [0.34, 0.64, 0.28, 0.4], [0, 0.92, -0.15, 0.42], [0.05, 0.9, 0.22, 0.4], [0, 0.66, 0.5, 0.34]];
    for (const [x, y, z, s] of puffs) cube(body, s, s * 0.9, s, s > 0.38 ? '#ffffff' : '#f4f1ea', x, y, z);
    const head = new T.Group(); head.position.set(0, 0.78, -0.52); body.add(head);
    cube(head, 0.34, 0.34, 0.3, '#4a4060', 0, 0, -0.06);
    cube(head, 0.4, 0.16, 0.3, '#ffffff', 0, 0.18, -0.02);
    cube(head, 0.16, 0.07, 0.1, '#4a4060', -0.24, 0.05, 0); cube(head, 0.16, 0.07, 0.1, '#4a4060', 0.24, 0.05, 0);
    cube(head, 0.08, 0.08, 0.02, '#ffffff', -0.08, 0.03, -0.215); cube(head, 0.08, 0.08, 0.02, '#ffffff', 0.08, 0.03, -0.215);
    cube(head, 0.04, 0.05, 0.02, '#14121f', -0.08, 0.02, -0.225); cube(head, 0.04, 0.05, 0.02, '#14121f', 0.08, 0.02, -0.225);
    cube(head, 0.08, 0.03, 0.02, '#ff8fb8', 0, -0.09, -0.215);
    return { g, body, head, legs };
  }
  function chick() {
    const g = new T.Group(), body = new T.Group();
    g.add(body);
    const legs = [];
    for (const x of [-0.07, 0.07]) { const l = new T.Group(); l.position.set(x, 0.1, 0); body.add(l); cube(l, 0.04, 0.1, 0.04, '#ff9f1c', 0, -0.05, 0); cube(l, 0.08, 0.02, 0.1, '#ff9f1c', 0, -0.1, -0.02); legs.push(l); }
    cube(body, 0.3, 0.24, 0.34, '#ffe14a', 0, 0.22, 0.02);
    const head = new T.Group(); head.position.set(0, 0.42, -0.08); body.add(head);
    cube(head, 0.24, 0.22, 0.22, '#ffe14a', 0, 0, 0);
    cube(head, 0.09, 0.06, 0.1, '#ff9f1c', 0, -0.02, -0.15);
    cube(head, 0.04, 0.05, 0.02, '#14121f', -0.07, 0.04, -0.115); cube(head, 0.04, 0.05, 0.02, '#14121f', 0.07, 0.04, -0.115);
    cube(head, 0.05, 0.07, 0.08, '#ffd21f', 0, 0.14, 0.02);
    const wings = [cube(body, 0.05, 0.14, 0.2, '#ffd21f', -0.17, 0.24, 0.04), cube(body, 0.05, 0.14, 0.2, '#ffd21f', 0.17, 0.24, 0.04)];
    return { g, body, head, legs, wings };
  }
  function cat(color) {
    const g = new T.Group(), body = new T.Group();
    g.add(body);
    const dark = color === '#ffa94d' ? '#e07b25' : '#6b6b7a';
    const legs = [];
    for (const [x, z] of [[-0.1, -0.2], [0.1, -0.2], [-0.1, 0.2], [0.1, 0.2]]) { const l = new T.Group(); l.position.set(x, 0.16, z); body.add(l); cube(l, 0.09, 0.16, 0.09, color, 0, -0.08, 0); legs.push(l); }
    const torso = cube(body, 0.3, 0.24, 0.56, color, 0, 0.28, 0);
    for (const z of [-0.12, 0.02, 0.16]) cube(body, 0.31, 0.05, 0.06, dark, 0, 0.39, z);
    const head = new T.Group(); head.position.set(0, 0.4, -0.32); body.add(head);
    cube(head, 0.3, 0.25, 0.24, color, 0, 0, 0);
    for (const s of [-1, 1]) { const e = cube(head, 0.09, 0.09, 0.05, color, s * 0.1, 0.15, 0.02); e.rotation.z = Math.PI / 4; cube(head, 0.04, 0.04, 0.02, '#ff9fc0', s * 0.1, 0.15, -0.006); }
    const eyesOpen = [cube(head, 0.05, 0.06, 0.02, '#2a2a3a', -0.07, 0.02, -0.125), cube(head, 0.05, 0.06, 0.02, '#2a2a3a', 0.07, 0.02, -0.125)];
    const eyesShut = [cube(head, 0.07, 0.015, 0.02, '#2a2a3a', -0.07, 0.01, -0.125), cube(head, 0.07, 0.015, 0.02, '#2a2a3a', 0.07, 0.01, -0.125)];
    cube(head, 0.05, 0.035, 0.02, '#ff8fb8', 0, -0.05, -0.125);
    const tail = new T.Group(); tail.position.set(0, 0.32, 0.27); body.add(tail);
    cube(tail, 0.06, 0.06, 0.38, color, 0, 0, 0.17);
    cube(tail, 0.065, 0.065, 0.08, dark, 0, 0, 0.32);
    const zz = emojiSprite('💤', 0.45);
    zz.position.set(0.15, 0.85, -0.25);
    g.add(zz);
    return { g, body, head, legs, tail, eyesOpen, eyesShut, zz, torso };
  }

  function makeAnimal(a) {
    const m = a.kind === 'sheep' ? sheep() : a.kind === 'chick' ? chick() : cat(a.uid % 2 ? '#a9a9bb' : '#ffa94d');
    const heart = emojiSprite('💖', 0.5);
    heart.visible = false;
    m.g.add(heart);
    m.heart = heart;
    m.phase = Math.random() * 6;
    scene.add(m.g);
    return m;
  }
  A.updateAnimals = function (list, dt, t) {
    for (const a of list) {
      let m = animals.get(a.uid);
      if (!m) { m = makeAnimal(a); animals.set(a.uid, m); }
      m.g.position.set(a.pos.x, a.pos.y, a.pos.z);
      let dy = 0;
      const walking = a.state === 'walk';
      m.phase += dt * (walking ? 9 : 2);
      const sw = walking ? Math.sin(m.phase) * 0.55 : 0;
      m.legs.forEach((l, i) => { l.rotation.x = i % 2 ? sw : -sw; });
      // turn smoothly toward where it's going
      let d = a.yaw - m.g.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      m.g.rotation.y += d * Math.min(1, dt * 8);
      if (a.kind === 'sheep') {
        const graze = a.state === 'idle' ? 0.65 : 0;
        m.head.rotation.x += (graze + Math.sin(t * 3 + a.uid) * 0.05 * (graze ? 1 : 0) - m.head.rotation.x) * Math.min(1, dt * 4);
        dy = walking ? Math.abs(Math.sin(m.phase)) * 0.04 : 0;
      } else if (a.kind === 'chick') {
        dy = Math.sin(a.hop * Math.PI) * 0.16;
        m.wings[0].rotation.z = -a.hop * 0.9; m.wings[1].rotation.z = a.hop * 0.9;
        m.head.rotation.x = a.state === 'idle' ? Math.max(0, Math.sin(t * 4 + a.uid)) * 0.5 : 0;
      } else {
        const asleep = a.state === 'sleep';
        m.zz.visible = asleep;
        m.zz.position.y = 0.75 + Math.sin(t * 1.5 + a.uid) * 0.08;
        m.eyesOpen.forEach((e) => { e.visible = !asleep; });
        m.eyesShut.forEach((e) => { e.visible = asleep; });
        // asleep: curled up low, head down on the paws, tail wrapped round, gently breathing
        const low = asleep ? -0.13 : 0;
        m.body.position.y += (low - m.body.position.y) * Math.min(1, dt * 5);
        m.legs.forEach((l) => { l.visible = !asleep; });
        m.head.rotation.x = asleep ? 0.35 : a.state === 'stretch' ? -0.35 : 0;
        m.body.rotation.x = a.state === 'stretch' ? 0.25 * Math.sin(Math.min(1, (1.3 - a.t) / 1.3) * Math.PI) : 0;
        m.tail.rotation.y = asleep ? 1.3 : Math.sin(t * 2 + a.uid) * 0.35;
        m.tail.rotation.x = asleep ? 0 : -0.6;
        m.torso.scale.y = 0.24 * (asleep ? 1 + Math.sin(t * 2.2) * 0.06 : 1);
      }
      if (a.kind !== 'cat' && a.hop > 0 && a.kind === 'sheep') dy += Math.sin(a.hop * Math.PI) * 0.25;
      m.body.position.y = a.kind === 'cat' ? m.body.position.y : dy;
      m.heart.visible = a.petT > 0;
      if (m.heart.visible) { m.heart.position.set(0, (a.kind === 'sheep' ? 1.3 : 0.8) + (1.2 - a.petT) * 0.6, 0); m.heart.material.opacity = Math.min(1, a.petT * 2); }
    }
  };
  A.clearAnimals = function () {
    for (const [, m] of animals) scene.remove(m.g);
    animals.clear();
  };

  // ---------- a treat, tossed to you ----------
  const treats = [];
  A.toss = function (emoji, from, to) {
    const s = emojiSprite(emoji, 0.7);
    scene.add(s);
    treats.push({ s, from: from.clone(), to: to.clone(), t: 0 });
  };
  A.updateTreats = function (dt, camPos) {
    for (let i = treats.length - 1; i >= 0; i--) {
      const q = treats[i];
      q.t += dt / 0.7;
      q.to.lerp(camPos, 0.2);
      const k = Math.min(1, q.t);
      q.s.position.copy(q.from).lerp(q.to, k);
      q.s.position.y += Math.sin(k * Math.PI) * 1.2;
      q.s.scale.setScalar(0.7 * (1 - k * 0.5));
      if (q.t >= 1) { scene.remove(q.s); treats.splice(i, 1); }
    }
  };
})();
