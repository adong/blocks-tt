/* TT Blocks: the 16 blocks. Each has its tiles in the art atlas (js/art.js paints them: our own soft, bright,
   chunky blocks), its colour (for the crumbs when it breaks, and the little map) and how it behaves:
     solid    you bump into it (water and air aren't)
     opaque   it hides the faces next to it and stops light (glass and water let light through)
     pass     0 = drawn with the solid blocks, 1 = see-through (glass, water), drawn after them
     glow     how much light it gives (the lamp) */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});

  // tile numbers in the 8 x 4 atlas
  const TILE = {
    grassTop: 0, grassSide: 1, dirt: 2, stone: 3, sand: 4, woodSide: 5, woodTop: 6, leaves: 7,
    planks: 8, glass: 9, brick: 10, lamp: 11, water: 12, snow: 13, red: 14, yellow: 15,
    blue: 16, pink: 17,
  };

  const AIR = 0;
  // [key, name, 中文, tiles {top, side, bottom}, colour, extra]
  const DEFS = [
    ['air', 'AIR', '空气', null, '#000000', { solid: false, opaque: false }],
    ['grass', 'GRASS', '草地', { top: TILE.grassTop, side: TILE.grassSide, bottom: TILE.dirt }, '#6fd45a'],
    ['dirt', 'DIRT', '泥土', TILE.dirt, '#b5814f'],
    ['stone', 'STONE', '石头', TILE.stone, '#a4a9b8'],
    ['sand', 'SAND', '沙子', TILE.sand, '#f6dd9a'],
    ['wood', 'WOOD', '木头', { top: TILE.woodTop, side: TILE.woodSide, bottom: TILE.woodTop }, '#a8723f'],
    ['leaves', 'LEAVES', '树叶', TILE.leaves, '#4cc05a'],
    ['planks', 'PLANKS', '木板', TILE.planks, '#e0a95e'],
    ['glass', 'GLASS', '玻璃', TILE.glass, '#bfefff', { opaque: false, pass: 1 }],
    ['brick', 'BRICK', '砖块', TILE.brick, '#e2674e'],
    ['lamp', 'LAMP', '灯', TILE.lamp, '#ffe27a', { glow: 10 }],
    ['water', 'WATER', '水', TILE.water, '#4ab8f0', { solid: false, opaque: false, pass: 1 }],
    ['snow', 'SNOW', '雪', TILE.snow, '#f4fbff'],
    ['red', 'RED', '红色', TILE.red, '#ff5a6e'],
    ['yellow', 'YELLOW', '黄色', TILE.yellow, '#ffd23f'],
    ['blue', 'BLUE', '蓝色', TILE.blue, '#3fa2ff'],
    ['pink', 'PINK', '粉色', TILE.pink, '#ff8fd0'],
  ];

  const list = DEFS.map(([key, name, zh, tiles, color, extra], id) => {
    const t = tiles == null ? null : typeof tiles === 'number' ? { top: tiles, side: tiles, bottom: tiles } : tiles;
    return Object.assign({ id, key, name, zh, tiles: t, color, solid: true, opaque: true, pass: 0, glow: 0 }, extra || {});
  });
  const ID = {};
  for (const b of list) ID[b.key] = b.id;

  // lookup tables, so the mesher and the light don't touch objects in their inner loops
  const N = list.length;
  const SOLID = new Uint8Array(256), OPAQUE = new Uint8Array(256), PASS = new Uint8Array(256), GLOW = new Uint8Array(256);
  const TILES = new Uint8Array(256 * 6); // [id * 6 + face]: faces 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
  for (const b of list) {
    SOLID[b.id] = b.solid ? 1 : 0;
    OPAQUE[b.id] = b.opaque ? 1 : 0;
    PASS[b.id] = b.pass;
    GLOW[b.id] = b.glow;
    if (b.tiles) {
      const t = b.tiles;
      [t.side, t.side, t.top, t.bottom, t.side, t.side].forEach((v, f) => { TILES[b.id * 6 + f] = v; });
    }
  }

  // Is the face of block a, looking at its neighbour n, drawn? Opaque blocks show against anything see-through,
  // glass shows against air and water (not other glass), water only against air.
  function faceVisible(a, n) {
    if (a === AIR) return false;
    if (OPAQUE[a]) return !OPAQUE[n];
    if (a === ID.glass) return n !== ID.glass && !OPAQUE[n];
    if (a === ID.water) return n === AIR;
    return !OPAQUE[n] && n !== a;
  }

  // the hotbar a new player starts with, and the order of the block picker
  const START_BAR = ['grass', 'planks', 'brick', 'glass', 'lamp', 'red', 'yellow', 'blue', 'pink'].map((k) => ID[k]);
  const PICKER = list.filter((b) => b.id !== AIR).map((b) => b.id);

  BT.blocks = { list, ID, AIR, TILE, N, SOLID, OPAQUE, PASS, GLOW, TILES, faceVisible, START_BAR, PICKER, get: (id) => list[id] };
})();
