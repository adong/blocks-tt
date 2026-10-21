/* TT Blocks: keys, mouse and touch.
   Desktop: W A S D (or the arrows to walk and turn), the mouse to look (click once: the pointer locks, Esc lets go),
   left click breaks, right click places, the wheel or 1 - 9 picks a block, the middle button copies the block you
   point at. Without pointer lock (some browsers, an iframe) dragging looks instead.
   Touch: the stick on the left walks, dragging anywhere else looks, and the big PLACE / BREAK / JUMP (and DOWN when
   flying) buttons. Hold PLACE or BREAK to keep going.
   The game reads BT.input.read() each frame; one-off presses go to the handlers it sets (onKey, onAction). */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const I = (BT.input = {
    held: new Set(), look: { x: 0, y: 0 }, stick: { x: 0, y: 0, id: null, cx: 0, cy: 0 }, up: false, down: false,
    touch: false, locked: false, canLock: false, onKey: null, onAction: null, onJumpTap: null, onWheel: null, onPick: null, onLockLost: null, enabled: false,
  });
  let canvas, lookId = null, lookLast = null, drag = null;

  I.init = function (cv) {
    canvas = cv;
    I.canLock = 'requestPointerLock' in canvas && !matchMedia('(pointer: coarse)').matches;
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) I.held.add(e.code);
      if (I.onKey) I.onKey(e.code, e);
    });
    addEventListener('keyup', (e) => { I.held.delete(e.code); });
    addEventListener('blur', () => { I.held.clear(); I.up = I.down = false; resetStick(); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = I.locked;
      I.locked = document.pointerLockElement === canvas;
      if (was && !I.locked && I.onLockLost) I.onLockLost();
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (!I.enabled) return;
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        markTouch();
        if (lookId === null) { lookId = e.pointerId; lookLast = { x: e.clientX, y: e.clientY }; }
        return;
      }
      // the mouse
      if (I.canLock && !I.locked) { I.lock(); return; }
      if (I.locked) {
        if (e.button === 0) act('dig', 'down');
        else if (e.button === 2) act('place', 'down');
        else if (e.button === 1 && I.onPick) { e.preventDefault(); I.onPick(); }
        return;
      }
      // no pointer lock: drag to look, click to act
      drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button, t: BT.now() };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!I.enabled) return;
      if (e.pointerId === lookId && lookLast) {
        const s = 4.2 / Math.max(innerWidth, innerHeight);
        I.look.x += (e.clientX - lookLast.x) * s * 1.15;
        I.look.y += (e.clientY - lookLast.y) * s;
        lookLast = { x: e.clientX, y: e.clientY };
        return;
      }
      if (I.locked) { I.look.x += e.movementX * 0.0026; I.look.y += e.movementY * 0.0026; return; }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        I.look.x += dx * 0.005; I.look.y += dy * 0.005;
        drag.x = e.clientX; drag.y = e.clientY;
      }
    });
    const up = (e) => {
      if (e.pointerId === lookId) { lookId = null; lookLast = null; }
      if (I.locked && e.pointerType === 'mouse') { act(e.button === 2 ? 'place' : 'dig', 'up'); return; }
      if (drag && e.pointerType === 'mouse') {
        if (drag.moved < 6 && BT.now() - drag.t < 400) { const k = drag.button === 2 ? 'place' : 'dig'; act(k, 'down'); act(k, 'up'); }
        drag = null;
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { if (I.enabled && I.onWheel) { e.preventDefault(); I.onWheel(Math.sign(e.deltaY)); } }, { passive: false });

    // the stick
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      markTouch();
      I.stick.id = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      const r = stick.getBoundingClientRect();
      I.stick.cx = r.left + r.width / 2; I.stick.cy = r.top + r.height / 2;
      moveStick(e);
    });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === I.stick.id) moveStick(e); });
    const stickUp = (e) => { if (e.pointerId === I.stick.id) resetStick(); };
    stick.addEventListener('pointerup', stickUp);
    stick.addEventListener('pointercancel', stickUp);
    function moveStick(e) {
      const r = stick.getBoundingClientRect().width / 2;
      let dx = (e.clientX - I.stick.cx) / r, dy = (e.clientY - I.stick.cy) / r;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      I.stick.x = Math.abs(dx) < 0.12 ? 0 : dx;
      I.stick.y = Math.abs(dy) < 0.12 ? 0 : dy;
      knob.style.transform = `translate(${dx * r * 0.62}px, ${dy * r * 0.62}px)`;
    }
    function resetStick() { I.stick.id = null; I.stick.x = I.stick.y = 0; knob.style.transform = ''; }
    I.resetStick = resetStick;

    // the big buttons
    const hold = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); markTouch(); el.classList.add('down'); el.setPointerCapture(e.pointerId); onDown(); });
      const u = () => { if (el.classList.contains('down')) { el.classList.remove('down'); onUp(); } };
      el.addEventListener('pointerup', u);
      el.addEventListener('pointercancel', u);
      el.addEventListener('lostpointercapture', u);
    };
    hold('placeBtn', () => act('place', 'down'), () => act('place', 'up'));
    hold('breakBtn', () => act('dig', 'down'), () => act('dig', 'up'));
    hold('jumpBtn', () => { I.up = true; if (I.onJumpTap) I.onJumpTap(); }, () => { I.up = false; });
    hold('downBtn', () => { I.down = true; }, () => { I.down = false; });
  };

  function act(kind, phase) { if (I.enabled && I.onAction) I.onAction(kind, phase); }
  function markTouch() {
    if (!I.touch) { I.touch = true; document.body.classList.add('touch'); if (I.onTouch) I.onTouch(); }
  }
  I.markTouch = markTouch;
  I.lock = function () {
    if (!I.canLock) return;
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { I.canLock = false; });
    } catch (e) { I.canLock = false; }
  };
  I.unlock = function () { if (document.pointerLockElement) document.exitPointerLock(); };

  // this frame's movement: { fx, fz, up, down } and how far to turn
  I.read = function () {
    const h = I.held;
    let fx = 0, fz = 0;
    if (h.has('KeyA')) fx -= 1;
    if (h.has('KeyD')) fx += 1;
    if (h.has('KeyW') || h.has('ArrowUp')) fz += 1;
    if (h.has('KeyS') || h.has('ArrowDown')) fz -= 1;
    if (I.stick.id !== null) { fx += I.stick.x; fz -= I.stick.y; }
    const up = I.up || h.has('Space');
    const down = I.down || h.has('ShiftLeft') || h.has('ShiftRight') || h.has('KeyC');
    const turn = (h.has('ArrowRight') ? 1 : 0) - (h.has('ArrowLeft') ? 1 : 0);
    const look = { x: I.look.x, y: I.look.y };
    I.look.x = I.look.y = 0;
    return { fx: Math.max(-1, Math.min(1, fx)), fz: Math.max(-1, Math.min(1, fz)), up, down, turn, look };
  };
})();
