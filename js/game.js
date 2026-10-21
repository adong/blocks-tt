/* TT Blocks: the game. Starts the page, runs the frame loop, turns keys and taps into building, handles the
   screens, and saves.
     title -> pick Tommy, Teddy or 2 players (and 🐣 EASY or 🔥 NORMAL) -> my worlds (carry on, or a NEW WORLD from
     a seed) -> play. P / Esc pauses (and saves); a finished quest gives a cheer, a sticker and your signature move;
     all three -> confetti and PLAY AGAIN.
   window.game is for tests: start(), step(seconds) (ticks and draws synchronously, so it works in a hidden tab),
   check() (the headless rules check, plus drawing the big build), state(), and a few helpers. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const $ = (id) => document.getElementById(id);
  const T = THREE;
  const G = {
    mode: 'title', sess: null, titleSess: null, who: 'tommy', two: false, diff: 'easy', view: 'first', t: 0, last: 0,
    actHeld: null, actRepeat: 0, lastJump: -1, saveT: 0, cheer: null, todTarget: null, beaconT: 0, uiT: 0, winAfter: false,
    frameMs: [], pr: Math.min(2, window.devicePixelRatio || 1), easyFlyTold: false, rafOn: false,
  };
  BT.G = G;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const tmp = new T.Vector3();

  function boot() {
    Kit.sound.setup({});
    const canvas = $('game');
    BT.render.init(canvas);
    BT.render.setPixelRatio(G.pr);
    BT.actors.init(BT.render.scene);
    BT.ui.init();
    BT.input.init(canvas);
    if (coarse) BT.input.markTouch();
    BT.input.onKey = onKey;
    BT.input.onAction = onAction;
    BT.input.onJumpTap = jumpTap;
    BT.input.onWheel = (d) => { if (playing()) pickSlot((G.sess.P().sel + d + 9) % 9); };
    BT.input.onPick = copyBlock;
    BT.input.onLockLost = () => { if (playing() && !G.unlocking) pause(); G.unlocking = false; };
    BT.input.onTouch = () => { if (G.mode === 'play') BT.ui.hud(true, true); };
    wire();
    resize();
    addEventListener('resize', resize);
    const wake = () => { Kit.sound.init(); Kit.sound.music(G.mode === 'play' ? 'play' : 'title'); };
    addEventListener('pointerdown', wake, { once: true });
    addEventListener('keydown', wake, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { saveNow(); Kit.sound.suspend(); } else Kit.sound.resume();
    });
    addEventListener('pagehide', saveNow);
    Kit.sound.onMute((m) => { $('muteBtn').textContent = m ? '🔇' : '🔊'; });
    $('muteBtn').textContent = Kit.sound.isMuted() ? '🔇' : '🔊';
    title();
    G.last = performance.now();
    G.rafOn = true;
    requestAnimationFrame(loop);
  }

  function resize() {
    BT.render.resize(innerWidth, innerHeight);
    BT.ui.layout();
  }
  const playing = () => G.mode === 'play' && !BT.ui.screen && !G.cheer;

  // ---------- the screens ----------
  function title() {
    if (G.sess) saveNow();
    G.mode = 'title';
    G.sess = null;
    BT.buddy.reset();
    if (!G.titleSess) G.titleSess = new BT.Session({ seed: 'SUNNY SHEEP 1' });
    useWorld(G.titleSess);
    BT.ui.hud(false);
    BT.ui.show('title');
    BT.ui.score();
    $('lookHint').classList.add('hidden');
    $('water').classList.add('hidden');
    setDiffSeg('diffSeg', G.diff);
    BT.input.enabled = false;
    BT.input.unlock();
    Kit.sound.music('title');
  }
  function useWorld(sess) {
    BT.actors.clearAnimals();
    BT.actors.hideAll();
    BT.render.setWorld(sess.world);
  }
  function worlds() {
    G.mode = 'menu';
    BT.ui.show('worlds');
    BT.ui.worlds(Kit.roster.get(G.who).name, G.two);
  }
  function setDiffSeg(id, d) { for (const b of $(id).children) b.classList.toggle('on', b.dataset.d === d); }

  function startSession(sess) {
    BT.buddy.reset();
    G.sess = sess;
    G.mode = 'play';
    G.cheer = null;
    G.winAfter = false;
    G.actHeld = null;
    G.view = 'first';
    G.todTarget = null;
    useWorld(sess);
    BT.render.flush(0, true);
    BT.ui.show(null);
    BT.ui.hud(true, BT.input.touch);
    refreshHud();
    BT.input.enabled = true;
    BT.input.lock();
    Kit.sound.music('play');
    for (const e of sess.events) if (e.type === 'badsave') BT.ui.toast('That save was broken, so here\'s the island as new', 'info', 3000);
    sess.events.length = 0;
    const p = sess.P();
    BT.ui.toast(Object.keys(sess.found).length || sess.world.version ? `WELCOME BACK, ${p.id.toUpperCase()}!` : 'BUILD ANYTHING YOU LIKE!', 'good', 2200);
    saveNow();
  }
  function newWorld(seed) {
    const s = new BT.Session({ seed: seed || BT.randomSeed(), kid: G.who, two: G.two, diff: { tommy: G.diff, teddy: G.diff } });
    startSession(s);
  }
  function loadWorld(id) {
    const st = BT.save.load(id);
    if (!st) { BT.ui.toast('That world can\'t be found', 'info'); return; }
    const diff = Object.assign({}, st.diff, { [G.who]: G.diff });
    if (G.two) diff.tommy = diff.tommy || G.diff;
    startSession(BT.Session.fromState(Object.assign({}, st, { active: G.who, two: G.two, diff })));
  }
  function pause() {
    if (G.mode !== 'play' || BT.ui.screen) return;
    G.actHeld = null;
    BT.ui.show('pause');
    $('pauseWorld').textContent = `🏝️ ${G.sess.name}`;
    setDiffSeg('pauseDiff', G.sess.diff[G.sess.active]);
    G.unlocking = true;
    BT.input.unlock();
    Kit.sound.music('pause');
    saveNow();
  }
  function resume() {
    BT.ui.show(null);
    G.unlocking = false;
    BT.input.lock();
    Kit.sound.music('play');
  }
  function overlay(name) {
    // a panel over the game (picker, quests, the brother's menu): the game waits
    G.actHeld = null;
    G.unlocking = true;
    BT.input.unlock();
    BT.ui.show(name);
  }
  function closeOverlay() { BT.ui.show(null); G.unlocking = false; BT.input.lock(); }

  function saveNow() {
    if (!G.sess) return;
    G.sess.save();
    G.saveT = 0;
  }

  // ---------- building ----------
  function onAction(kind, phase) {
    if (phase === 'up') { if (G.actHeld === kind) G.actHeld = null; return; }
    if (!playing()) return;
    G.actHeld = kind;
    G.actRepeat = 0.32;
    doAct(kind);
  }
  function doAct(kind) {
    const sess = G.sess;
    const res = sess.act(kind);
    BT.render.swing();
    if (!res) { BT.sfx.nope(); return; }
    if (res.pet) { BT.sfx.animal(res.pet.kind, res.pet.say); G.actHeld = null; return; }
    if (res.corner) { BT.sfx.corner(); BT.ui.tools(sess); G.actHeld = null; return; }
    if (res.ruler) { BT.sfx.corner(); G.actHeld = null; return; }
    if (res.fill) {
      const n = res.fill.length;
      if (n) BT.sfx.place(sess.block()); else BT.sfx.nope();
      BT.ui.toast(n ? (sess.events.some((e) => e.type === 'fill' && e.kind === 'dig') ? `📦 EMPTIED ${n} BLOCKS!` : `📦 FILLED ${n} BLOCKS!`) : '📦 NOTHING TO FILL THERE', 'good', 1400);
      G.actHeld = null;
      BT.render.flush(12);
      BT.ui.tools(sess);
      return;
    }
    if (!res.changes.length) { BT.sfx.nope(); return; }
    for (const [i, old, now] of res.changes) {
      const x = i % BT.W, y = Math.floor(i / (BT.W * BT.D)), z = Math.floor(i / BT.W) % BT.D;
      if (kind === 'dig') BT.render.crumbs(x, y, z, BT.blocks.get(old).color, 12);
      else BT.render.crumbs(x, y, z, '#ffffff', 4, true);
    }
    if (kind === 'dig') BT.sfx.dig(res.old); else BT.sfx.place(sess.block());
    BT.render.flush(10);
  }
  function copyBlock() {
    const aim = G.sess && G.sess.aim();
    if (!aim || !aim.hit) return;
    const p = G.sess.P();
    const id = aim.hit.block;
    const at = p.hotbar.indexOf(id);
    if (at >= 0) p.sel = at; else p.hotbar[p.sel] = id;
    BT.sfx.pick();
    BT.ui.hotbar(G.sess);
  }
  function pickSlot(i) {
    const p = G.sess.P();
    p.sel = i;
    BT.ui.hotbar(G.sess);
    if (BT.ui.screen === 'picker') BT.ui.picker(G.sess);
  }
  function jumpTap() {
    if (!playing()) return;
    const now = G.t;
    const p = G.sess.P();
    if (now - G.lastJump < 0.32) {
      G.lastJump = -1;
      if (p.easy) {
        if (!G.easyFlyTold) BT.ui.toast('🐣 EASY: you can always fly!', 'info', 1800);
        G.easyFlyTold = true;
        return;
      }
      p.fly = !p.fly;
      BT.sfx.fly(p.fly);
      BT.ui.toast(p.fly ? '✈️ FLYING!' : '🚶 WALKING', 'info', 1200);
      refreshHud();
      return;
    }
    G.lastJump = now;
    if (!p.flying() && p.onGround) BT.sfx.jump();
  }
  function setTool(t) {
    const on = G.sess.setTool(t) === t;
    BT.sfx.tool(on);
    BT.ui.tools(G.sess);
  }
  function toggleMirror() {
    const m = G.sess.toggleMirror();
    BT.sfx.tool(m.on);
    BT.ui.toast(m.on ? '🦋 MIRROR ON' : '🦋 MIRROR OFF', 'info', 1200);
    BT.ui.tools(G.sess);
  }
  function undo() {
    const u = G.sess.undo();
    if (u) { BT.sfx.undo(); BT.ui.toast('↩️ UNDO', 'info', 900); BT.render.flush(12); } else { BT.sfx.nope(); BT.ui.toast('NOTHING TO UNDO', 'info', 1000); }
  }
  function toggleDay() {
    const night = G.sess.isNight();
    G.todTarget = night ? 0.1 : 0.76;
    BT.ui.toast(night ? '☀️ GOOD MORNING!' : '🌙 GOOD NIGHT!', 'info', 1400);
  }
  function callBuddy(kind) {
    if (!G.sess) return;
    const r = BT.buddy.call(G.sess, kind);
    if (r && r.five) return;
    if (BT.ui.screen === 'buddyMenu') closeOverlay();
  }
  function starHint() {
    const sess = G.sess, p = sess.P();
    let best = null, bd = 1e9;
    for (const s of sess.world.stars) { if (sess.found[s.id]) continue; const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z); if (d < bd) { bd = d; best = s; } }
    if (!best) { BT.ui.toast('YOU FOUND ALL THE STARS!', 'good'); return; }
    G.beacon = best;
    G.beaconT = 12;
    BT.ui.toast('⭐ LOOK FOR THE GOLDEN LIGHT!', 'treat', 2200);
  }
  function turn() {
    if (!G.sess.two) return;
    BT.buddy.reset(G.sess);
    G.sess.turn();
  }

  // ---------- keys ----------
  function onKey(code, e) {
    if (Kit.help && Kit.help.isOpen && Kit.help.isOpen()) return;
    if (code === 'KeyM') { Kit.sound.toggleMute(); return; }
    const scr = BT.ui.screen;
    if (scr === 'title') {
      if (code === 'Digit1') pick('tommy', false);
      else if (code === 'Digit2') pick('teddy', false);
      else if (code === 'Digit3') pick('tommy', true);
      else if (code === 'KeyE') { G.diff = G.diff === 'easy' ? 'normal' : 'easy'; setDiffSeg('diffSeg', G.diff); }
      return;
    }
    if (scr === 'worlds') {
      if (code === 'Escape') title();
      else if (code === 'Enter' && document.activeElement && document.activeElement.id !== 'seedIn') newWorld($('seedIn') ? $('seedIn').value : '');
      return;
    }
    if (scr === 'picker') {
      if (/^Digit[1-9]$/.test(code)) pickSlot(+code.slice(5) - 1);
      else if (code === 'KeyE' || code === 'Escape' || code === 'Enter') closeOverlay();
      return;
    }
    if (scr === 'quests') { if (code === 'KeyQ' || code === 'Escape' || code === 'Enter') closeOverlay(); else if (code === 'KeyH') { starHint(); closeOverlay(); } return; }
    if (scr === 'buddyMenu') {
      if (/^Digit[1-5]$/.test(code)) callBuddy(['house', 'tower', 'bridge', 'tree', ''][+code.slice(5) - 1]);
      else if (code === 'Escape' || code === 'KeyB') closeOverlay();
      return;
    }
    if (scr === 'pause') { if (code === 'KeyP' || code === 'Escape') resume(); return; }
    if (scr === 'win') { if (code === 'Enter') { BT.ui.show(null); worlds(); } return; }
    if (G.mode !== 'play' || G.cheer) return;
    if (code === 'KeyP' || code === 'Escape') { pause(); return; }
    if (/^Digit[1-9]$/.test(code)) { pickSlot(+code.slice(5) - 1); return; }
    if (e && e.repeat) return;
    switch (code) {
      case 'Space': jumpTap(); break;
      case 'KeyE': overlay('picker'); BT.ui.picker(G.sess); break;
      case 'KeyZ': undo(); break;
      case 'KeyF': setTool('fill'); break;
      case 'KeyR': setTool('ruler'); break;
      case 'KeyG': toggleMirror(); break;
      case 'KeyV': G.view = G.view === 'first' ? 'third' : 'first'; document.body.classList.toggle('third', G.view === 'third'); break;
      case 'KeyN': toggleDay(); break;
      case 'KeyT': if (e && e.shiftKey && !G.sess.two) openBuddyMenu(); else callBuddy(); break;
      case 'KeyB': if (!G.sess.two) openBuddyMenu(); break;
      case 'KeyQ': overlay('quests'); BT.ui.questPanel(G.sess); break;
      case 'KeyH': starHint(); break;
      case 'Tab': turn(); break;
      case 'KeyX': copyBlock(); break;
    }
  }
  function openBuddyMenu() { overlay('buddyMenu'); BT.ui.buddyMenu(Kit.roster.get(Kit.roster.buddyFor(G.sess.active)).name); }
  function pick(who, two) {
    G.who = who;
    G.two = two;
    BT.sfx.pick();
    worlds();
  }

  // ---------- buttons ----------
  function wire() {
    const on = (id, fn) => $(id).addEventListener('click', (e) => { BT.sfx.pick(); fn(e); });
    on('pickTommy', () => pick('tommy', false));
    on('pickTeddy', () => pick('teddy', false));
    on('pickTwo', () => pick('tommy', true));
    $('diffSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { G.diff = b.dataset.d; setDiffSeg('diffSeg', G.diff); BT.sfx.pick(); } });
    $('pauseDiff').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !G.sess) return;
      G.sess.setDiff(G.sess.active, b.dataset.d);
      setDiffSeg('pauseDiff', b.dataset.d);
      BT.sfx.pick();
      refreshHud();
    });
    on('worldsBack', title);
    $('wlist').addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.id === 'diceBtn') { $('seedIn').value = BT.randomSeed(); BT.sfx.pick(); return; }
      if (t.id === 'makeBtn') { newWorld($('seedIn').value); return; }
      if (t.dataset.play) { loadWorld(t.dataset.play); return; }
      if (t.dataset.del) {
        if (!t.classList.contains('sure')) { t.classList.add('sure'); t.textContent = 'SURE?'; return; }
        BT.save.remove(t.dataset.del);
        BT.ui.worlds(Kit.roster.get(G.who).name, G.two);
      }
    });
    $('wlist').addEventListener('keydown', (e) => { if (e.target.id === 'seedIn' && e.key === 'Enter') newWorld(e.target.value); });
    on('pauseBtn', pause);
    on('resumeBtn', resume);
    on('saveBtn', () => { const ok = G.sess.save(); BT.ui.toast(ok ? '💾 SAVED!' : '💾 SAVED FOR NOW (this browser can\'t keep it)', 'good', 1600); });
    on('toWorlds', () => { saveNow(); G.sess = null; BT.buddy.reset(); BT.ui.hud(false); worlds(); });
    on('toTitle', title);
    on('muteBtn', () => Kit.sound.toggleMute());
    on('viewBtn', () => onKey('KeyV'));
    on('dayBtn', toggleDay);
    on('turnBtn', turn);
    on('toolsBtn', () => $('tools').classList.toggle('open'));
    on('undoBtn', undo);
    on('fillBtn', () => setTool('fill'));
    on('rulerBtn', () => setTool('ruler'));
    on('mirrorBtn', toggleMirror);
    on('callBtn', () => callBuddy());
    on('callMenuBtn', openBuddyMenu);
    on('quest', () => { overlay('quests'); BT.ui.questPanel(G.sess); });
    on('questsDone', closeOverlay);
    on('hintBtn', () => { closeOverlay(); starHint(); });
    on('pickerDone', closeOverlay);
    on('buddyBack', closeOverlay);
    $('buddyPicks').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) callBuddy(b.dataset.kind || null); });
    $('hotbar').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'bagBtn') { overlay('picker'); BT.ui.picker(G.sess); return; }
      pickSlot(+b.dataset.i);
      BT.sfx.pick();
    });
    $('picks').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const p = G.sess.P();
      p.hotbar[p.sel] = +b.dataset.id;
      BT.sfx.pick();
      BT.ui.picker(G.sess);
      BT.ui.hotbar(G.sess);
    });
    $('pickerSlots').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { pickSlot(+b.dataset.i); BT.sfx.pick(); } });
    on('againBtn', () => { saveNow(); G.sess = null; BT.ui.hud(false); worlds(); });
    on('keepBtn', closeOverlay);
  }

  function refreshHud() {
    const s = G.sess;
    if (!s) return;
    BT.ui.me(s);
    BT.ui.quests(s);
    BT.ui.hotbar(s);
    BT.ui.tools(s);
    BT.ui.day(s);
    BT.ui.fly(s);
  }

  // ---------- events from the rules ----------
  function events() {
    const s = G.sess;
    const p = s.P();
    for (const e of s.events) {
      if (e.type === 'star') {
        BT.sfx.star(e.count);
        BT.ui.toast(e.count >= e.total ? '⭐ ALL 5 GOLDEN STARS!' : `⭐ GOLDEN STAR! ${e.count} / ${e.total}`, 'super', 2000);
        BT.ui.confetti(30);
        BT.ui.quests(s);
        if (G.beacon && G.beacon.id === e.id) G.beaconT = 0;
      } else if (e.type === 'quest') {
        const q = BT.quests.LIST.find((x) => x.id === e.id);
        BT.sfx.quest();
        BT.ui.confetti(140);
        BT.ui.sticker(q, e.who);
        BT.ui.toast(`🎉 ${Kit.roster.get(e.who).name.toUpperCase()} DID IT!`, 'super', 2600);
        G.cheer = { t: 0, who: e.who, dur: 3 };
        G.actHeld = null;
        if (e.all) G.winAfter = true;
        BT.ui.quests(s);
        saveNow();
      } else if (e.type === 'animal') {
        const a = s.animals[e.uid];
        if (a && Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) < 12) BT.sfx.animal(e.kind, e.say);
      } else if (e.type === 'turn') {
        BT.ui.toast(`${e.who.toUpperCase()}'S TURN!`, 'super', 1600);
        refreshHud();
        BT.sfx.pop();
      } else if (e.type === 'fill' || e.type === 'corner') BT.ui.tools(s);
    }
    s.events.length = 0;
  }

  // ---------- a frame ----------
  function frame(dt) {
    G.t += dt;
    const sess = G.sess || G.titleSess;
    const R = BT.render, cam = R.camera;
    if (G.mode === 'play' && G.sess) {
      const s = G.sess, p = s.P();
      let inp = { fx: 0, fz: 0, up: false, down: false };
      if (playing()) {
        const r = BT.input.read();
        p.yaw -= r.look.x + r.turn * 2.4 * dt;
        p.pitch = Math.max(-1.53, Math.min(1.53, p.pitch - r.look.y));
        inp = r;
        if (G.actHeld) {
          G.actRepeat -= dt;
          if (G.actRepeat <= 0) { G.actRepeat = 0.24; doAct(G.actHeld); }
        }
      } else BT.input.read();
      if (!BT.ui.screen) {
        const wasFly = p.flying();
        s.step(dt, G.cheer ? {} : inp);
        if (wasFly !== p.flying()) refreshHud();
        if (G.todTarget != null) {
          let d = G.todTarget - s.tod;
          if (d < 0) d += 1;
          const stepT = Math.min(d, dt * 0.45);
          s.tod = (s.tod + stepT) % 1;
          if (d < 0.004) G.todTarget = null;
        }
        BT.buddy.update(s, dt);
        events();
        G.saveT += dt;
        if (G.saveT > 15) saveNow();
        if (G.cheer) {
          G.cheer.t += dt;
          if (G.cheer.t > G.cheer.dur) {
            G.cheer = null;
            if (G.winAfter) { G.winAfter = false; BT.ui.win(s); overlay('win'); }
          }
        }
      }
      placeCamera(s, dt);
      R.updateSky(s, dt, s.world.get(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z)) === BT.blocks.ID.water);
      $('water').classList.toggle('hidden', !(R.lightNow && s.world.get(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z)) === BT.blocks.ID.water));
      drawPeople(s, dt);
      BT.buddy.draw(s, dt);
      const aim = G.cheer ? null : s.aim();
      R.updateHelpers(s, { aim, easy: p.easy, block: s.block(), tool: s.tool, hideAim: !!G.cheer || G.view === 'cheer' }, G.t);
      R.updateHand(s.block(), G.view === 'first' && !G.cheer, dt, G.t, p.walked);
      $('crosshair').classList.toggle('hidden', !!G.cheer || !!BT.ui.screen);
      G.uiT += dt;
      if (G.uiT > 0.5) {
        G.uiT = 0;
        BT.ui.day(s);
        if (s.tool === 'ruler') BT.ui.tools(s);
        const showLook = !BT.input.touch && BT.input.canLock && !BT.input.locked && !BT.ui.screen;
        $('lookHint').classList.toggle('hidden', !showLook);
      }
      beacon(dt);
    } else {
      // the title: fly slowly round the island
      sess.step(dt, {});
      sess.events.length = 0;
      const a = G.t * 0.06;
      cam.position.set(48 + Math.cos(a) * 66, 44, 48 + Math.sin(a) * 66);
      cam.lookAt(48, 16, 48);
      R.updateSky(sess, dt, false);
      R.updateHelpers(sess, { aim: null, hideAim: true, tool: 'build' }, G.t);
      R.updateHand(0, false, dt, G.t, 0);
      BT.actors.hideAll();
    }
    BT.actors.updateAnimals(sess.animals, dt, G.t);
    BT.actors.updateTreats(dt, cam.position);
    R.updateStars(sess, G.t);
    R.flush(G.mode === 'play' ? 5 : 3);
    R.render(G.view !== 'first' || !!G.cheer);
  }

  function placeCamera(s, dt) {
    const cam = BT.render.camera, p = s.P();
    const eye = s.eye(p);
    if (G.cheer) {
      // the winner's moment: the camera swings round in front of him
      const k = Math.min(1, G.cheer.t / 0.6);
      const fy = p.yaw;
      const fx = -Math.sin(fy), fz = -Math.cos(fy);
      // as far as 3.4 blocks in front, but never inside a block
      let dist = 0.6;
      for (let k = 0.6; k <= 3.4; k += 0.15) {
        if (s.world.solidAt(Math.floor(p.pos.x + fx * k), Math.floor(p.pos.y + 1.3), Math.floor(p.pos.z + fz * k))) break;
        dist = k;
      }
      tmp.set(p.pos.x + fx * dist, p.pos.y + 1.3, p.pos.z + fz * dist);
      cam.position.lerp(tmp, k);
      cam.lookAt(p.pos.x, p.pos.y + p.h * 0.6, p.pos.z);
      return;
    }
    cam.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    if (G.view === 'third') {
      const d = BT.physics.lookDir(p.yaw, p.pitch);
      let back = 0;
      for (let k = 0.3; k <= 4.2; k += 0.15) {
        const x = eye.x - d.x * k, y = eye.y - d.y * k + 0.35, z = eye.z - d.z * k;
        if (s.world.solidAt(Math.floor(x), Math.floor(y), Math.floor(z))) break;
        back = k;
      }
      cam.position.set(eye.x - d.x * back, eye.y - d.y * back + 0.35 * Math.min(1, back), eye.z - d.z * back);
    } else cam.position.set(eye.x, eye.y, eye.z);
  }

  function drawPeople(s, dt) {
    const me = s.P(), other = s.other();
    const showMe = G.view === 'third' || !!G.cheer;
    for (const [id, p] of Object.entries(s.players)) {
      const self = p === me;
      if (self && !showMe) { BT.actors.hidePerson(id); continue; }
      const o = BT.actors.person(id);
      const speed = Math.hypot(p.vel.x, p.vel.z);
      let mode = speed > 0.5 ? (p.flying() && !p.onGround ? 'jet' : 'walk') : 'idle';
      if (self && G.cheer) {
        const sig = o.entry.signature || ['wave'];
        mode = sig.length > 1 ? (G.cheer.t < G.cheer.dur / 2 ? sig[0] : sig[sig.length - 1]) : sig[0];
      }
      if (!self && BT.buddy.info().phase === 'five') mode = 'wave';
      if (self && BT.buddy.info().phase === 'five') mode = 'wave';
      BT.actors.posePerson(o, p.pos.x, p.pos.y, p.pos.z, p.yaw, mode, dt, mode === 'walk' ? speed * 2.2 : mode === 'boxing' ? 9 : 6);
      o.tag.visible = !self && s.two;
      if (!self && other) o.g.visible = true;
    }
    for (const id of ['teddy', 'tommy']) if (!s.players[id]) BT.actors.hidePerson(id);
  }

  let beaconMesh = null;
  function beacon(dt) {
    if (!beaconMesh) {
      beaconMesh = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 70, 12, 1, true), new T.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide }));
      BT.render.scene.add(beaconMesh);
    }
    G.beaconT = Math.max(0, G.beaconT - dt);
    beaconMesh.visible = G.beaconT > 0 && !!G.beacon && !(G.sess && G.sess.found[G.beacon.id]);
    if (beaconMesh.visible) {
      beaconMesh.position.set(G.beacon.x, G.beacon.y + 34, G.beacon.z);
      beaconMesh.material.opacity = 0.25 + 0.2 * Math.sin(G.t * 5);
    }
  }

  function loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - G.last) / 1000));
    G.last = now;
    const t0 = performance.now();
    frame(dt);
    adapt(performance.now() - t0, dt);
    requestAnimationFrame(loop);
  }
  // an iPad that can't keep up draws fewer pixels
  function adapt(ms, dt) {
    if (G.mode !== 'play') return;
    G.frameMs.push(dt * 1000);
    if (G.frameMs.length < 120) return;
    const avg = G.frameMs.reduce((a, b) => a + b, 0) / G.frameMs.length;
    G.frameMs.length = 0;
    if (avg > 24 && G.pr > 1) { G.pr = Math.max(1, G.pr - 0.25); BT.render.setPixelRatio(G.pr); resize(); }
  }

  // ---------- for tests ----------
  window.game = {
    start(opts) {
      opts = opts || {};
      G.who = opts.kid || 'tommy';
      G.two = !!opts.two;
      G.diff = opts.diff || 'easy';
      if (opts.id) loadWorld(opts.id); else newWorld(opts.seed || 'SUNNY SHEEP 1');
      return this.state();
    },
    step(sec, dt) {
      dt = dt || 1 / 60;
      const n = Math.max(1, Math.round((sec || dt) / dt));
      for (let i = 0; i < n; i++) frame(dt);
      return this.state();
    },
    state() {
      const s = G.sess;
      const p = s && s.P();
      return {
        mode: G.mode, screen: BT.ui.screen, view: G.view, two: G.two, diff: G.diff,
        active: s && s.active, seed: s && s.seed, pos: p && [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)], yaw: p && +p.yaw.toFixed(3), pitch: p && +p.pitch.toFixed(3),
        fly: p && p.flying(), easy: p && p.easy, onGround: p && p.onGround, tool: s && s.tool, block: s && BT.blocks.get(s.block()).key, sel: p && p.sel,
        found: s && Object.keys(s.found), done: s && Object.keys(s.done), tod: s && +s.tod.toFixed(3), night: s && s.isNight(), cheer: !!G.cheer,
        buddy: BT.buddy.info(), toast: BT.ui.lastToast, placed: s && s.world.placedCount(), version: s && s.world.version, undo: s && s.builder.undoStack.length,
        mirror: s && s.builder.mirror.on, dirty: (s || G.titleSess).world.dirty.size, gl2: BT.render.gl2, pr: G.pr, drawMs: +BT.render.stats.drawMs.toFixed(2),
        tris: BT.render.triangles().tris, muted: Kit.sound.isMuted(), locked: BT.input.locked,
      };
    },
    look(yaw, pitch) { const p = G.sess.P(); if (yaw != null) p.yaw = yaw; if (pitch != null) p.pitch = pitch; return this.state(); },
    put(x, y, z) { const p = G.sess.P(); p.place(x, y, z); return this.state(); },
    act(kind) { doAct(kind || 'place'); return this.state(); },
    key(code, opts) { onKey(code, Object.assign({ repeat: false, shiftKey: false }, opts || {})); return this.state(); },
    call(kind) { callBuddy(kind); return this.state(); },
    jumpTap,
    title,
    worlds,
    pause,
    resume,
    save: saveNow,
    // the rules check, plus drawing the big build for the frame-time budget
    check(opts) {
      opts = Object.assign({}, opts);
      opts.render = (s) => {
        const prev = G.sess || G.titleSess;
        const R = BT.render;
        R.setWorld(s.world);
        R.flush(0, true);
        const p = s.P();
        const cam = R.camera;
        let total = 0;
        const frames = 30;
        for (let k = 0; k < frames; k++) {
          cam.position.set(48 + Math.cos(k * 0.2) * 40, 40, 48 + Math.sin(k * 0.2) * 40);
          cam.lookAt(48, 16, 48);
          R.updateSky(s, 1 / 60, false);
          const t0 = performance.now();
          R.render(true);
          R.renderer.getContext().finish();
          total += performance.now() - t0;
        }
        R.setWorld(prev.world);
        R.flush(0, true);
        BT.actors.clearAnimals();
        return { avg: total / frames, frames, budget: opts.renderBudget || 33, p };
      };
      return BT.check(opts);
    },
    sabotage: () => Object.keys(BT.check.SABOTAGE),
    // visit every screen in a language and list the English still showing (Kit.lang.untranslated)
    async tour(lang) {
      Kit.lang.set(lang || 'zh');
      const left = new Set();
      const tick = () => new Promise((r) => setTimeout(r, 60));
      const look = async () => { await tick(); for (const s of Kit.lang.untranslated()) left.add(s); };
      title(); await look();
      pick('tommy', false); await look();
      $('wlist').querySelector('.del') && $('wlist').querySelector('.del').click(); await look();
      this.start({ kid: 'tommy', seed: 'TOUR 1' }); await look();
      for (const k of ['KeyF', 'KeyR', 'KeyG']) { this.key(k); await look(); this.key(k); }
      this.key('KeyZ'); await look();
      this.key('KeyN'); await look();
      jumpTap(); jumpTap(); await look();
      this.call('house'); this.step(0.95); await look(); this.step(4); await look();
      this.key('KeyE'); await look(); this.key('Escape');
      this.key('KeyQ'); await look(); this.key('Escape');
      this.key('KeyB'); await look(); this.key('Escape');
      this.key('KeyH'); await look();
      G.sess.setTool('ruler'); G.sess.ruler = { a: { x: 10, y: 20, z: 10 }, b: { x: 12, y: 20, z: 15 } }; BT.render.rulerText = '3 × 1 × 6'; BT.ui.tools(G.sess); await look(); G.sess.setTool('ruler');
      G.sess.complete('tower'); this.step(0.2); await look();
      this.step(3.2); pause(); await look(); resume();
      BT.ui.win(G.sess); overlay('win'); await look(); closeOverlay();
      BT.ui.toast('🍪 COOKIE FROM TEDDY!'); BT.ui.toast('⭐ GOLDEN STAR! 2 / 5'); BT.ui.toast('📦 FILLED 60 BLOCKS!'); BT.ui.toast('WELCOME BACK, TOMMY!'); await look();
      Kit.help.open(); await look(); Kit.help.close();
      this.start({ kid: 'teddy', two: true, seed: 'TOUR 2' }); await look();
      this.key('Tab'); this.step(0.1); await look();
      this.call(); this.step(0.2); await look();
      title(); await look();
      return [...left];
    },
    // the HUD's buttons mustn't cover each other, the kit's left-edge buttons or the touch controls
    layout() {
      const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && el.closest('.hidden') === null; };
      const sel = '#tl > *, #quest, #tr > *, #tools > *, #hotbar, #stick, #acts > *, #toolHint, #kit-help-btn, #kit-lang-btn, #kit-sound-btn';
      const els = [...document.querySelectorAll(sel)].filter(vis);
      const kit = els.filter((e) => e.id.startsWith('kit-'));
      const all = els;
      const bad = [];
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i].getBoundingClientRect(), b = all[j].getBoundingClientRect();
        if (all[i].contains(all[j]) || all[j].contains(all[i])) continue;
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(`${all[i].id || all[i].className} × ${all[j].id || all[j].className}`);
      }
      const off = all.filter((e) => { const r = e.getBoundingClientRect(); return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; }).map((e) => e.id || e.className);
      return { w: innerWidth, h: innerHeight, n: all.length, kit: kit.length, bad, off };
    },
    G,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
