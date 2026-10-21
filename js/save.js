/* TT Blocks: saved worlds, in localStorage, always inside try/catch: with storage blocked (a private window) the game
   still plays, it just forgets when the page closes (a copy is kept in memory).
     blocksTT.v1.worlds      the list: [{ id, name, seed, made, saved, stars, done, placed }]
     blocksTT.v1.w.<id>      one world: its seed, the blocks that differ from the island the seed makes (see
                             World.encodeEdits), both brothers' spots and hotbars, the time of day, the stars found,
                             the quests done
     blocksTT.v1.last        the world to carry on with */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const KEY = 'blocksTT.v1.';
  const memory = {};
  let store = null;
  try { store = window.localStorage || null; } catch (e) { store = null; }

  function get(k) {
    let v = null;
    try { v = store ? store.getItem(k) : null; } catch (e) { v = null; }
    return v == null && k in memory ? memory[k] : v;
  }
  function put(k, v) {
    memory[k] = v;
    try { if (store) { store.setItem(k, v); return true; } } catch (e) { /* storage blocked or full */ }
    return false;
  }
  function del(k) {
    delete memory[k];
    try { if (store) store.removeItem(k); } catch (e) { /* storage blocked */ }
  }

  function list() {
    try {
      const l = JSON.parse(get(KEY + 'worlds') || '[]');
      return Array.isArray(l) ? l.filter((w) => w && w.id).sort((a, b) => (b.saved || 0) - (a.saved || 0)) : [];
    } catch (e) {
      return [];
    }
  }
  function newId() { return 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  // state: { id, name, seed, made, edits: { data, count }, players, active, two, tod, found, done }
  function save(state) {
    const now = Date.now();
    const raw = JSON.stringify(Object.assign({ v: 1 }, state, { saved: now }));
    const ok = put(KEY + 'w.' + state.id, raw);
    const l = list().filter((w) => w.id !== state.id);
    l.unshift({ id: state.id, name: state.name, seed: state.seed, made: state.made || now, saved: now,
      stars: Object.keys(state.found || {}).length, done: Object.keys(state.done || {}).filter((k) => state.done[k]), placed: state.edits ? state.edits.count : 0 });
    put(KEY + 'worlds', JSON.stringify(l.slice(0, 30)));
    put(KEY + 'last', state.id);
    return ok;
  }
  function load(id) {
    try {
      const s = JSON.parse(get(KEY + 'w.' + id) || 'null');
      if (!s || !s.seed || !s.edits) return null;
      return s;
    } catch (e) {
      return null;
    }
  }
  function remove(id) {
    del(KEY + 'w.' + id);
    put(KEY + 'worlds', JSON.stringify(list().filter((w) => w.id !== id)));
    if (get(KEY + 'last') === id) del(KEY + 'last');
  }
  const last = () => get(KEY + 'last');
  // every sticker earned in every world: the running score on the title screen
  function stickers() { return list().reduce((n, w) => n + (w.done ? w.done.length : 0), 0); }

  BT.save = { KEY, list, save, load, remove, last, newId, stickers, _memory: memory, _setStore: (s) => { store = s; } };
})();
