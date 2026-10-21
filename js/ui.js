/* TT Blocks: the page around the 3D world: the screens (title, my worlds, the block picker, the quests, what the
   brother builds, pause, all done), the HUD (who's playing, the quest stickers, the hotbar, the tools), toasts,
   confetti and the sticker that pops up when a quest is done. Every word here is English; js/zh.js has the 中文 and
   Kit.lang swaps it on the page by itself. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const $ = (id) => document.getElementById(id);
  const U = (BT.ui = {});
  const SCREENS = ['title', 'worlds', 'picker', 'quests', 'buddyMenu', 'pause', 'win'];
  let faces = {};
  U.screen = null;

  U.init = function () {
    // the logo, a letter at a time (so each can be its own colour)
    $('logoBig').innerHTML = [...BT.TITLE].map((ch) => (ch === ' ' ? '<span class="sp"> </span>' : `<span>${ch}</span>`)).join('');
    faces = Kit.portraits([Kit.roster.get('teddy'), Kit.roster.get('tommy')], { size: 160 });
    $('faceTeddy').src = faces.teddy;
    $('faceTommy').src = faces.tommy;
    U.layout();
    addEventListener('resize', U.layout);
  };
  U.faces = () => faces;

  U.layout = function () {
    const w = innerWidth, h = innerHeight;
    document.body.classList.toggle('short', h < 520);
    document.body.classList.toggle('narrow', w < 640);
  };

  U.show = function (name) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
    U.screen = name;
  };
  U.hud = function (on, touch) {
    $('hud').classList.toggle('hidden', !on);
    $('crosshair').classList.toggle('hidden', !on);
    $('touch').classList.toggle('hidden', !on || !touch);
  };

  // ---------- toasts, confetti, the sticker ----------
  U.toast = function (text, kind, ms) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('out'), ms || 1600);
    setTimeout(() => el.remove(), (ms || 1600) + 400);
    U.lastToast = text;
    return el;
  };
  U.confetti = function (n) {
    const box = $('confetti');
    const cols = ['#ff5a6e', '#ffd23f', '#6fd45a', '#3fa2ff', '#ff8fd0', '#ffffff'];
    for (let i = 0; i < (n || 90); i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = cols[i % cols.length];
      c.style.setProperty('--dx', (Math.random() * 30 - 15) + 'vw');
      c.style.setProperty('--r', (Math.random() * 1440 - 720) + 'deg');
      c.style.animationDuration = 1.8 + Math.random() * 1.6 + 's';
      c.style.animationDelay = Math.random() * 0.5 + 's';
      box.appendChild(c);
      setTimeout(() => c.remove(), 4200);
    }
  };
  U.sticker = function (q, who) {
    const el = $('sticker');
    el.innerHTML = `<span class="emo">${q.sticker}</span><b>NEW STICKER!</b><small>${q.name}</small>`;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(U._st);
    U._st = setTimeout(() => el.classList.add('hidden'), 2800);
  };

  // ---------- the HUD ----------
  U.me = function (sess) {
    const id = sess.active, p = sess.P();
    const entry = Kit.roster.get(id);
    $('meChip').className = 'chip ' + id;
    $('meFace').src = faces[id];
    $('meName').textContent = entry.name.toUpperCase();
    $('meMode').textContent = p.easy ? '🐣 FLYING' : p.fly ? '🔥 FLYING' : '🔥 WALKING';
    const bro = sess.two ? (id === 'teddy' ? 'tommy' : 'teddy') : Kit.roster.buddyFor(id);
    $('callBtn').className = 'call ' + bro;
    $('callFace').src = faces[bro];
    $('callBtn').title = sess.two ? 'High five (T)' : `Call ${Kit.roster.get(bro).name} (T)`;
    $('callMenuBtn').classList.toggle('hidden', sess.two);
    $('turnBtn').classList.toggle('hidden', !sess.two);
  };
  U.quests = function (sess) {
    const n = Object.keys(sess.found).length;
    const q = (id, emo, txt) => `<span class="q ${sess.done[id] ? 'done' : 'off'}"><span class="emo">${sess.done[id] ? BT.quests.LIST.find((x) => x.id === id).sticker : emo}</span>${txt || ''}</span>`;
    $('quest').innerHTML = q('stars', '⭐', `${n}/${sess.world.stars.length}`) + q('house', '🏠') + q('tower', '🗼');
  };
  U.hotbar = function (sess) {
    const p = sess.P();
    const bar = $('hotbar');
    let html = '';
    for (let i = 0; i < 9; i++) html += `<button class="slot${i === p.sel ? ' sel' : ''}" data-i="${i}" aria-label="${BT.blocks.get(p.hotbar[i]).name}"><img alt="" src="${BT.art.icon(p.hotbar[i])}"><kbd>${i + 1}</kbd></button>`;
    html += '<button class="slot bag" id="bagBtn" title="All the blocks (E)" aria-label="All the blocks">🎒</button>';
    bar.innerHTML = html;
    U.selName(sess);
  };
  U.selName = function (sess) {
    const el = $('selName');
    el.textContent = BT.blocks.get(sess.block()).name;
    el.style.opacity = 1;
    clearTimeout(U._sn);
    U._sn = setTimeout(() => { el.style.opacity = 0; }, 1400);
  };
  U.tools = function (sess) {
    $('fillBtn').classList.toggle('on', sess.tool === 'fill');
    $('rulerBtn').classList.toggle('on', sess.tool === 'ruler');
    $('mirrorBtn').classList.toggle('on', sess.builder.mirror.on);
    const h = $('toolHint');
    let t = '';
    if (sess.tool === 'fill') t = sess.fillA ? '📦 FILL: now the other corner!' : '📦 FILL: PLACE on one corner, then the other (BREAK empties a box)';
    else if (sess.tool === 'ruler') t = BT.render.rulerText && sess.ruler.a ? `📏 ${BT.render.rulerText} BLOCKS` : '📏 RULER: point at a block and tap PLACE or BREAK, then another';
    else if (sess.builder.mirror.on) t = '🦋 MIRROR: what you build on one side appears on the other';
    h.textContent = t;
    h.classList.toggle('hidden', !t);
  };
  U.day = function (sess) { $('dayBtn').textContent = sess.isNight() ? '☀️' : '🌙'; $('dayBtn').appendChild(Object.assign(document.createElement('kbd'), { textContent: 'N' })); };
  U.fly = function (sess) { $('downBtn').classList.toggle('off', !sess.P().flying()); };

  // ---------- the block picker ----------
  U.picker = function (sess) {
    const p = sess.P();
    $('picks').innerHTML = BT.blocks.PICKER.map((id) => `<button class="pick${p.hotbar[p.sel] === id ? ' on' : ''}" data-id="${id}"><img alt="" src="${BT.art.icon(id)}">${BT.blocks.get(id).name}</button>`).join('');
    let s = '';
    for (let i = 0; i < 9; i++) s += `<button class="slot${i === p.sel ? ' sel' : ''}" data-i="${i}"><img alt="" src="${BT.art.icon(p.hotbar[i])}"><kbd>${i + 1}</kbd></button>`;
    $('pickerSlots').innerHTML = s;
  };

  // ---------- the quests ----------
  U.questPanel = function (sess) {
    const n = Object.keys(sess.found).length;
    const tower = BT.quests.tallestTower(sess.world, null, null).height;
    const rows = BT.quests.LIST.map((q) => {
      const done = sess.done[q.id];
      let prog = '';
      if (q.id === 'stars') prog = `⭐ ${n} / ${sess.world.stars.length}`;
      if (q.id === 'tower') prog = `🗼 ${Math.min(tower, 10)} / 10`;
      return `<div class="qrow ${done ? '' : 'off'}"><span class="emo">${done ? q.sticker : q.emoji}</span><div><b>${q.name}</b><small>${q.hint}</small></div><span class="done">${done ? '✔ DONE' : prog}</span></div>`;
    }).join('');
    $('questPanel').innerHTML = `<h2>TOMMY'S QUESTS</h2>${rows}`;
  };

  // ---------- my worlds ----------
  U.worlds = function (who, two) {
    $('worldsWho').textContent = two ? 'TEDDY & TOMMY · 2 PLAYERS' : `${who.toUpperCase()}'S TURN TO BUILD`;
    const list = BT.save.list();
    const seed = BT.randomSeed();
    let html = `<div class="wcard card newcard"><span class="nm">➕ NEW WORLD</span><span class="meta">Type any words for a new island, or roll the dice.</span>
      <div class="seedrow"><input id="seedIn" maxlength="32" value="${seed}" aria-label="Seed" placeholder="SEED"><button class="dice" id="diceBtn" title="A random seed" aria-label="A random seed">🎲</button></div>
      <div class="acts"><button class="btn green small" id="makeBtn">🏝️ MAKE IT!</button></div></div>`;
    for (const w of list) {
      const st = BT.quests.LIST.map((q) => `<span class="${w.done && w.done.includes(q.id) ? '' : 'off'}">${q.sticker}</span>`).join('');
      html += `<div class="wcard card" data-id="${w.id}"><span class="nm" data-no-lang>${esc(w.name)}</span><span class="st">${st}</span>
        <span class="meta">⭐ ${w.stars || 0} / 5 · 🧱 ${w.placed || 0}</span>
        <div class="acts"><button class="btn small" data-play="${w.id}">▶ PLAY</button><button class="btn small del" data-del="${w.id}" aria-label="Delete">🗑️</button></div></div>`;
    }
    $('wlist').innerHTML = html;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  U.buddyMenu = function (bro) {
    $('buddyTitle').textContent = `WHAT SHALL ${bro.toUpperCase()} BUILD?`;
    const items = [['house', '🏠', 'A HOUSE'], ['tower', '🗼', 'A TOWER'], ['bridge', '🌉', 'A BRIDGE'], ['tree', '🌳', 'A TREE'], ['', '🎲', 'SURPRISE ME']];
    $('buddyPicks').innerHTML = items.map(([k, e, t], i) => `<button class="btn ${k ? 'ghost' : ''}" data-kind="${k}"><span class="emo">${e}</span>${t}<kbd>${i + 1}</kbd></button>`).join('');
  };

  U.score = function () {
    const n = BT.save.stickers();
    $('titleScore').textContent = `🏅 STICKERS: ${n}`;
    return n;
  };
  U.win = function (sess) {
    $('winStickers').textContent = BT.quests.LIST.map((q) => q.sticker).join(' ');
    $('winScore').textContent = `🏅 STICKERS: ${BT.save.stickers()}`;
  };
})();
