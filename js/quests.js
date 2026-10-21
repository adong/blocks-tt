/* TT Blocks: Tommy's gentle quests, each checked by the game (and by js/check.js, which builds right and wrong ones).
     stars   find the 5 golden stars hidden on the island: walk (or fly) right up to one
     house   build a house with a door: a room closed in by walls and a roof, with a doorway 1 wide and 2 high,
             made mostly of blocks you put there (so the cave can't count)
     tower   make a tower 10 blocks high: 10 blocks you put there, one on top of the other
   Finishing one gives a cheer and a sticker. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const { SOLID, ID } = BT.blocks;
  const LIST = [
    { id: 'stars', emoji: '⭐', sticker: '🌟', name: 'FIND 5 GOLDEN STARS', zh: '找到 5 颗金星星', hint: 'They\'re hidden all over the island: in the cave, up high, by the water…' },
    { id: 'house', emoji: '🏠', sticker: '🏡', name: 'BUILD A HOUSE WITH A DOOR', zh: '盖一座有门的房子', hint: 'Walls all round, a roof on top, and a doorway 2 blocks high.' },
    { id: 'tower', emoji: '🗼', sticker: '🏰', name: 'MAKE A TOWER 10 BLOCKS HIGH', zh: '搭一座 10 格高的塔', hint: 'Put 10 blocks one on top of the other.' },
  ];
  const STAR_REACH = 1.35;
  const TOWER = 10;

  // a star is found when your middle comes within reach of it
  function starsNear(stars, found, px, py, pz) {
    const reach = BT.SAB.starsFar ? 40 : STAR_REACH;
    const out = [];
    for (const s of stars) {
      if (found[s.id]) continue;
      const d = Math.hypot(s.x - px, s.y - py, s.z - pz);
      if (d <= reach) out.push(s.id);
    }
    return out;
  }

  // the tallest stack of placed blocks in the columns near (x, z) (the whole island when x is null)
  function tallestTower(world, x, z, r) {
    const W = BT.W, H = BT.H, D = BT.D;
    let best = 0, at = null;
    const x0 = x == null ? 0 : Math.max(0, x - r), x1 = x == null ? W - 1 : Math.min(W - 1, x + r);
    const z0 = z == null ? 0 : Math.max(0, z - r), z1 = z == null ? D - 1 : Math.min(D - 1, z + r);
    for (let zz = z0; zz <= z1; zz++)
      for (let xx = x0; xx <= x1; xx++) {
        let run = 0;
        for (let y = 0; y < H; y++) {
          if (world.placedAt(xx, y, zz)) { run++; if (run > best) { best = run; at = { x: xx, y: y - run + 1, z: zz }; } }
          else run = 0;
        }
      }
    return { height: best, at };
  }
  function towerDone(world, x, z) {
    const t = tallestTower(world, x, z, x == null ? 0 : 6);
    return t.height >= (BT.SAB.tower9 ? TOWER - 1 : TOWER);
  }

  // ---------- the house ----------
  // A doorway: two air cells, one on top of the other, with something solid under and over them and wall on both
  // sides; open in front and behind. One side must be a closed room (walls, roof, floor all round, no other holes),
  // the other side the outdoors.
  const LIMIT = 700;
  function flood(world, sx, sy, sz, blocked, limit) {
    // fill the air from a cell; stops at solid blocks and the blocked cells. Returns { closed, cells, open }
    const W = BT.W, D = BT.D, H = BT.H;
    const seen = new Set();
    const key = (x, y, z) => x + W * (z + D * y);
    const q = [[sx, sy, sz]];
    seen.add(key(sx, sy, sz));
    let open = false;
    for (let h = 0; h < q.length; h++) {
      const [x, y, z] = q[h];
      if (world.openSky(x, y, z)) open = true; // a cell that sees the sky is outdoors
      if (q.length > limit || open) return { closed: false, cells: q.length, open: true, seen };
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (ny < 0 || ny >= H || nx < 0 || nz < 0 || nx >= W || nz >= D) return { closed: false, cells: q.length, open: true, seen };
        const k = key(nx, ny, nz);
        if (seen.has(k) || blocked.has(k)) continue;
        if (world.solidAt(nx, ny, nz)) continue;
        seen.add(k);
        q.push([nx, ny, nz]);
      }
    }
    return { closed: true, cells: q.length, open, seen };
  }

  function doorAt(world, x, y, z) {
    // is (x, y..y+1, z) a doorway? returns the inside and outside cells along the open axis, or null
    const S = (a, b, c) => world.solidAt(a, b, c);
    const A = (a, b, c) => world.inside(a, b, c) && !S(a, b, c);
    if (!A(x, y, z) || !A(x, y + 1, z) || !S(x, y - 1, z) || !S(x, y + 2, z)) return null;
    const out = [];
    // wall along x (the door faces z), or wall along z (the door faces x)
    if (S(x - 1, y, z) && S(x + 1, y, z) && S(x - 1, y + 1, z) && S(x + 1, y + 1, z) && A(x, y, z - 1) && A(x, y, z + 1)) out.push([[x, y, z - 1], [x, y, z + 1]]);
    if (S(x, y, z - 1) && S(x, y, z + 1) && S(x, y + 1, z - 1) && S(x, y + 1, z + 1) && A(x - 1, y, z) && A(x + 1, y, z)) out.push([[x - 1, y, z], [x + 1, y, z]]);
    return out.length ? out : null;
  }

  function houseCheck(world, cx, cy, cz, r) {
    // look for a house with a door near (cx, cy, cz) (the whole island when cx is null). Returns { ok, door, room }
    const W = BT.W, D = BT.D, H = BT.H;
    r = r || 12;
    const x0 = cx == null ? 1 : Math.max(1, cx - r), x1 = cx == null ? W - 2 : Math.min(W - 2, cx + r);
    const z0 = cz == null ? 1 : Math.max(1, cz - r), z1 = cz == null ? D - 2 : Math.min(D - 2, cz + r);
    const y0 = cy == null ? 1 : Math.max(1, cy - r), y1 = cy == null ? H - 3 : Math.min(H - 3, cy + r);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          // only doorways framed by blocks someone put there
          if (!world.placedAt(x, y + 2, z) && !world.placedAt(x, y - 1, z)) continue;
          const doors = doorAt(world, x, y, z);
          if (!doors) continue;
          for (const [p, q] of doors) {
            for (const [inside, outside] of [[p, q], [q, p]]) {
              const r1 = roomBehind(world, x, y, z, inside, outside);
              if (r1) return { ok: true, door: { x, y, z }, room: r1 };
            }
          }
        }
    if (BT.SAB.houseNoDoor) {
      // sabotage: any closed room of placed blocks counts, door or not
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        if (world.solidAt(x, y, z) || !world.placedAt(x, y - 1, z)) continue;
        const room = flood(world, x, y, z, new Set(), LIMIT);
        if (room.closed && room.cells >= 4) return { ok: true, door: null, room };
      }
    }
    return { ok: false };
  }

  function roomBehind(world, x, y, z, inside, outside) {
    const W = BT.W, D = BT.D;
    const blocked = new Set([x + W * (z + D * y), x + W * (z + D * (y + 1))]);
    const room = flood(world, inside[0], inside[1], inside[2], blocked, LIMIT);
    const closed = BT.SAB.houseRoofless ? room.cells >= 4 : room.closed;
    if (!closed || room.cells < 4) return null;
    const outdoors = flood(world, outside[0], outside[1], outside[2], blocked, LIMIT);
    if (outdoors.closed) return null; // the door leads into another closed room, not outdoors
    // the room's walls, floor and roof: mostly placed blocks (so a natural hollow in the hill doesn't count)
    let walls = 0, placed = 0;
    const seenWall = new Set();
    for (const k of room.seen) {
      const cx = k % W, cz = Math.floor(k / W) % D, cy = Math.floor(k / (W * D));
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz;
        const nk = nx + W * (nz + D * ny);
        if (seenWall.has(nk) || !world.solidAt(nx, ny, nz)) continue;
        seenWall.add(nk);
        walls++;
        if (world.placedAt(nx, ny, nz)) placed++;
      }
    }
    if (placed < walls * 0.5) return null;
    return { cells: room.cells, walls, placed };
  }

  BT.quests = { LIST, STAR_REACH, TOWER, starsNear, tallestTower, towerDone, houseCheck, doorAt, flood };
})();
