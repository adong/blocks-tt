/* TT Blocks: drawing the world with Three.js.
   - Chunks: each 16 x 16 x 16 chunk is two meshes (solid blocks, then see-through glass and water), rebuilt from
     js/mesher.js when its blocks or light change, nearest first, a few milliseconds' worth per frame.
   - One small shader draws every block: the tile from a WebGL2 texture array (each block face repeats its tile, so
     the greedy mesher's big quads look like single blocks, with proper mipmaps), the face's corner shading, sunlight
     times the time of day, warm lamplight, and fog. Without WebGL2 it falls back to one atlas texture.
   - The sky: its colour through the day, the sun and the moon crossing it, twinkly stars at night, puffy clouds,
     and the sea all round the island.
   - The helpers you see while building: the outline of the block you point at, the 🐣 EASY ghost block where a new
     one would go, the FILL box, the MIRROR line, the ruler, crumbs when a block breaks, the block in your hand.
   - The golden stars.
   People and animals are in js/actors.js. */
(function () {
  'use strict';
  const BT = (window.BT = window.BT || {});
  const T = THREE;
  const R = (BT.render = {});
  let renderer, scene, camera, hud, hudCam, tileTex, mats = [], world = null;
  const chunkMeshes = new Map();
  const tileMaps = [];
  let sky, sunSprite, moonSprite, starField, clouds, hemi, dirLight, ocean;
  let frame, ghost, ghostMats = {}, fillBox, fillEdges, mirrorPlane, ruler, crumbs, hand, handMats = {};
  const starMeshes = new Map();
  const tmpV = new T.Vector3(), tmpC = new T.Color(), tmpM = new T.Matrix4(), tmpQ = new T.Quaternion();
  R.stats = { chunks: 0, built: 0, tris: 0, drawMs: 0 };

  const VERT = `
    attribute vec4 info;
    varying vec2 vUv;
    varying vec4 vInfo;
    varying float vDist;
    varying vec3 vPos;
    void main() {
      vUv = uv; vInfo = info; vPos = position;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDist = length(mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG = `
    #ifdef ARRAY
    precision highp sampler2DArray;
    uniform sampler2DArray uTiles;
    #else
    uniform sampler2D uAtlas;
    #endif
    uniform vec3 uSun;
    uniform vec3 uFog;
    uniform float uFogNear;
    uniform float uFogFar;
    uniform float uTime;
    uniform float uNight;
    varying vec2 vUv;
    varying vec4 vInfo;
    varying float vDist;
    varying vec3 vPos;
    void main() {
      float t = floor(vInfo.x + 0.5);
      vec2 uv = vUv;
      if (t == 12.0) uv += vec2(sin(uTime * 0.7 + vPos.z * 0.6 + vPos.x * 0.3) * 0.05, uTime * 0.035);
      #ifdef ARRAY
      vec4 tex = texture(uTiles, vec3(uv, t));
      #else
      vec2 f = clamp(fract(uv), 0.01, 0.99);
      vec4 tex = texture2D(uAtlas, vec2((mod(t, 8.0) + f.x) / 8.0, 1.0 - (floor(t / 8.0) + 1.0 - f.y) / 4.0));
      #endif
      vec3 light = uSun * pow(vInfo.z, 1.5) + vec3(1.0, 0.8, 0.52) * pow(vInfo.w, 1.3) * 1.1 + vec3(0.09, 0.1, 0.16);
      vec3 c = tex.rgb * vInfo.y * light;
      if (t == 11.0) c = tex.rgb * (1.02 + 0.35 * uNight);
      c = mix(c, uFog, smoothstep(uFogNear, uFogFar, vDist));
      gl_FragColor = vec4(c, tex.a);
    }`;
  const uniforms = {
    uTiles: { value: null }, uAtlas: { value: null }, uSun: { value: new T.Vector3(1, 1, 1) }, uFog: { value: new T.Vector3(0.6, 0.8, 1) },
    uFogNear: { value: 50 }, uFogFar: { value: 110 }, uTime: { value: 0 }, uNight: { value: 0 },
  };

  R.init = function (canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.autoClear = false;
    R.renderer = renderer;
    scene = new T.Scene();
    R.scene = scene;
    camera = new T.PerspectiveCamera(70, 1, 0.05, 420);
    camera.rotation.order = 'YXZ';
    R.camera = camera;
    scene.background = new T.Color('#8fd8ff');
    scene.fog = new T.Fog('#8fd8ff', 50, 110);
    hemi = new T.HemisphereLight('#ffffff', '#7d6a50', 0.8);
    dirLight = new T.DirectionalLight('#fff3dc', 0.7);
    dirLight.position.set(30, 60, 20);
    scene.add(hemi, dirLight);

    BT.art.paint();
    const gl2 = renderer.capabilities.isWebGL2;
    if (gl2) {
      tileTex = new T.DataArrayTexture(BT.art.layers(), BT.art.S, BT.art.S, BT.art.COUNT);
      tileTex.format = T.RGBAFormat;
      tileTex.type = T.UnsignedByteType;
      tileTex.wrapS = tileTex.wrapT = T.RepeatWrapping;
      tileTex.magFilter = T.LinearFilter;
      tileTex.minFilter = T.LinearMipmapLinearFilter;
      tileTex.generateMipmaps = true;
      tileTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      tileTex.needsUpdate = true;
      uniforms.uTiles.value = tileTex;
    } else {
      tileTex = new T.CanvasTexture(BT.art.atlas());
      tileTex.magFilter = T.LinearFilter;
      tileTex.minFilter = T.LinearFilter;
      tileTex.generateMipmaps = false;
      uniforms.uAtlas.value = tileTex;
    }
    const defines = gl2 ? { ARRAY: 1 } : {};
    mats[0] = new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, defines });
    mats[1] = new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, defines: Object.assign({ TRANS: 1 }, defines), transparent: true, depthWrite: false, side: T.DoubleSide });
    R.gl2 = gl2;
    makeSky();
    makeHelpers();
    makeHand();
  };

  R.resize = function (w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 80 : 70;
    camera.updateProjectionMatrix();
    hudCam.aspect = w / h;
    hudCam.updateProjectionMatrix();
  };
  R.setPixelRatio = (r) => { renderer.setPixelRatio(r); };

  // ---------- tiles as Three.js textures (for the ghost block, the hand, the crumbs) ----------
  function tileMap(t) {
    if (!tileMaps[t]) {
      const tex = new T.CanvasTexture(BT.art.tiles[t]);
      tex.encoding = T.sRGBEncoding;
      tex.anisotropy = 4;
      tileMaps[t] = tex;
    }
    return tileMaps[t];
  }
  function faceMats(id, Mat, opts) {
    const b = BT.blocks.get(id);
    const t = b.tiles;
    return [t.side, t.side, t.top, t.bottom, t.side, t.side].map((tile) => new Mat(Object.assign({ map: tileMap(tile) }, opts || {})));
  }

  // ---------- the world's chunks ----------
  R.setWorld = function (w) {
    for (const [, c] of chunkMeshes) for (const m of c) { if (m) { scene.remove(m); m.geometry.dispose(); } }
    chunkMeshes.clear();
    for (const [, m] of starMeshes) scene.remove(m);
    starMeshes.clear();
    world = w;
    R.world = w;
    for (const s of w.stars) {
      const m = makeStar();
      m.position.set(s.x, s.y, s.z);
      m.userData.star = s;
      scene.add(m);
      starMeshes.set(s.id, m);
    }
    w.markAll();
  };
  function buildChunk(id) {
    const cx = id % BT.CX, cz = Math.floor(id / BT.CX) % BT.CZ, cy = Math.floor(id / (BT.CX * BT.CZ));
    const m = BT.mesher.meshChunk(world, cx, cy, cz);
    let slot = chunkMeshes.get(id);
    if (!slot) { slot = [null, null]; chunkMeshes.set(id, slot); }
    for (let p = 0; p < 2; p++) {
      const P = m.passes[p];
      const old = slot[p];
      if (!P.quads) {
        if (old) { scene.remove(old); old.geometry.dispose(); slot[p] = null; }
        continue;
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(P.pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(P.uv, 2));
      g.setAttribute('info', new T.Float32BufferAttribute(P.info, 4));
      g.setIndex(P.index);
      g.computeBoundingSphere();
      if (old) { old.geometry.dispose(); old.geometry = g; }
      else {
        const mesh = new T.Mesh(g, mats[p]);
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = p;
        scene.add(mesh);
        slot[p] = mesh;
      }
    }
    R.stats.built++;
  }
  // rebuild dirty chunks, nearest first, for up to budget ms (always at least the ones right next to you)
  R.flush = function (budget, all) {
    if (!world || !world.dirty.size) return 0;
    const ids = [...world.dirty];
    const cp = camera.position;
    const dist = (id) => {
      const cx = id % BT.CX, cz = Math.floor(id / BT.CX) % BT.CZ, cy = Math.floor(id / (BT.CX * BT.CZ));
      return (cx * 16 + 8 - cp.x) ** 2 + (cy * 16 + 8 - cp.y) ** 2 + (cz * 16 + 8 - cp.z) ** 2;
    };
    ids.sort((a, b) => dist(a) - dist(b));
    const t0 = BT.now();
    let n = 0;
    for (const id of ids) {
      if (!all && n >= 2 && BT.now() - t0 > budget) break;
      world.dirty.delete(id);
      buildChunk(id);
      n++;
    }
    return n;
  };
  R.triangles = function () {
    let n = 0, meshes = 0;
    for (const [, slot] of chunkMeshes) for (const m of slot) if (m) { n += m.geometry.index.count / 3; meshes++; }
    return { tris: n, meshes };
  };

  // ---------- the sky ----------
  function spriteTex(draw, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    return t;
  }
  function makeSky() {
    const sunTex = spriteTex((g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.28, 'rgba(255,244,170,1)'); gr.addColorStop(0.36, 'rgba(255,220,110,0.55)'); gr.addColorStop(1, 'rgba(255,200,90,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }, 128);
    sunSprite = new T.Sprite(new T.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true }));
    sunSprite.scale.setScalar(90);
    const moonTex = spriteTex((g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(220,230,255,0.5)'); gr.addColorStop(1, 'rgba(200,215,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      g.fillStyle = '#f3f5ff'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(170,180,215,0.6)';
      for (const [x, y, r] of [[0.45, 0.44, 0.04], [0.56, 0.55, 0.05], [0.47, 0.6, 0.025], [0.58, 0.42, 0.02]]) { g.beginPath(); g.arc(x * s, y * s, r * s, 0, Math.PI * 2); g.fill(); }
    }, 128);
    moonSprite = new T.Sprite(new T.SpriteMaterial({ map: moonTex, fog: false, depthWrite: false, transparent: true }));
    moonSprite.scale.setScalar(70);
    scene.add(sunSprite, moonSprite);
    // twinkly stars
    const r = BT.rng('night sky');
    const pts = [];
    for (let i = 0; i < 700; i++) {
      const a = r() * Math.PI * 2, z = r() * 0.95 + 0.05;
      const q = Math.sqrt(1 - z * z);
      pts.push(Math.cos(a) * q * 300, z * 300, Math.sin(a) * q * 300);
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    starField = new T.Points(sg, new T.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(starField);
    // puffy clouds made of soft boxes
    clouds = new T.Group();
    const cm = new T.MeshLambertMaterial({ color: '#ffffff', fog: false, emissive: '#c8d8f0', emissiveIntensity: 0.25 });
    const box = new T.BoxGeometry(1, 1, 1);
    for (let k = 0; k < 9; k++) {
      const c = new T.Group();
      const n = 3 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        const m = new T.Mesh(box, cm);
        m.scale.set(6 + r() * 8, 2 + r() * 2, 5 + r() * 6);
        m.position.set((i - n / 2) * 5 + r() * 2, r() * 1.5, r() * 4 - 2);
        c.add(m);
      }
      c.position.set(r() * 220 - 60, 62 + r() * 10, r() * 220 - 60);
      c.userData.speed = 0.6 + r() * 0.8;
      clouds.add(c);
    }
    scene.add(clouds);
    // the sea, all round the island (the island's own water is drawn by its chunks). It's drawn with the blocks'
    // own shader, water over a sandy floor deep down, so it matches the island's sea right up to the edge.
    ocean = new T.Group();
    const W = BT.W, D = BT.D, FAR = 600;
    const rects = [[-FAR, -FAR, 2 * FAR + W, FAR], [-FAR, D, 2 * FAR + W, FAR], [-FAR, 0, FAR, D], [W, 0, FAR, D]];
    const sheet = (y, tile, sky, mat, order) => {
      const pos = [], uv = [], info = [], index = [];
      for (const [x, z, w, d] of rects) {
        const b = pos.length / 3;
        for (const [px, pz] of [[x, z], [x + w, z], [x + w, z + d], [x, z + d]]) { pos.push(px, y, pz); uv.push(px, pz); info.push(tile, 1, sky, 0); }
        index.push(b, b + 2, b + 1, b, b + 3, b + 2);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setAttribute('info', new T.Float32BufferAttribute(info, 4));
      g.setIndex(index);
      const m = new T.Mesh(g, mat);
      m.renderOrder = order;
      m.frustumCulled = false;
      ocean.add(m);
    };
    sheet(4, BT.blocks.TILE.sand, 0.2, mats[0], 0); // as deep and dim as the island's sea floor at its edge
    sheet(BT.SEA, BT.blocks.TILE.water, 1, mats[1], 1);
    scene.add(ocean);
  }

  const SKY_DAY = [0.56, 0.85, 1.0], SKY_NIGHT = [0.13, 0.16, 0.36], SKY_DUSK = [1.0, 0.62, 0.48];
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  R.updateSky = function (sess, dt, underwater) {
    const a = sess.sun(), d = sess.daylight();
    const tw = BT.smooth(0.35, 0.0, Math.abs(Math.sin(a))); // near the horizon: sunrise and sunset
    let col = mix3(SKY_NIGHT, SKY_DAY, d);
    col = mix3(col, SKY_DUSK, tw * 0.55);
    let fog = col, near = 48, far = 118;
    if (underwater) { fog = [0.16, 0.45, 0.72].map((v) => v * (0.35 + 0.65 * d)); near = 0.5; far = 22; }
    scene.background.setRGB(col[0], col[1], col[2]).convertSRGBToLinear();
    scene.fog.color.setRGB(fog[0], fog[1], fog[2]).convertSRGBToLinear();
    scene.fog.near = near; scene.fog.far = far;
    uniforms.uFog.value.set(fog[0], fog[1], fog[2]);
    uniforms.uFogNear.value = near; uniforms.uFogFar.value = far;
    let sun = mix3([0.36, 0.42, 0.66], [1.0, 0.98, 0.94], d); // moonlight is bright enough to build by
    sun = mix3(sun, [1.0, 0.74, 0.55], tw * 0.45);
    uniforms.uSun.value.set(sun[0], sun[1], sun[2]);
    uniforms.uNight.value = 1 - d;
    uniforms.uTime.value += dt;
    hemi.intensity = 0.45 + 0.4 * d;
    dirLight.intensity = 0.15 + 0.6 * d;
    hemi.color.setRGB(sun[0], sun[1], sun[2]).convertSRGBToLinear();
    const sd = tmpV.set(Math.cos(a), Math.sin(a), 0.32).normalize();
    dirLight.position.copy(sd).multiplyScalar(d > 0.2 ? 60 : -60);
    const cp = camera.position;
    sunSprite.position.copy(cp).addScaledVector(sd, 300);
    moonSprite.position.copy(cp).addScaledVector(sd, -300);
    sunSprite.visible = Math.sin(a) > -0.15;
    moonSprite.visible = Math.sin(a) < 0.15;
    starField.position.copy(cp);
    starField.material.opacity = Math.pow(1 - d, 2) * 0.95;
    starField.rotation.y += dt * 0.004;
    for (const c of clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 190) c.position.x = -100;
    }
    R.lightNow = { d, tw, sun };
  };

  // ---------- the golden stars ----------
  let starGeo = null, starMat = null, sparkleMat = null;
  function makeStar() {
    if (!starGeo) {
      const sh = new T.Shape();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.16 : 0.36, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
        if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      sh.closePath();
      starGeo = new T.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2 });
      starGeo.center();
      starMat = new T.MeshStandardMaterial({ color: '#ffc61a', emissive: '#ffb300', emissiveIntensity: 0.55, metalness: 0.3, roughness: 0.35 });
      sparkleMat = new T.SpriteMaterial({ map: Kit.gfx.glowTexture(), color: '#ffe680', transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    }
    const g = new T.Group();
    const m = new T.Mesh(starGeo, starMat);
    g.add(m);
    const s = new T.Sprite(sparkleMat);
    s.scale.setScalar(1.6);
    g.add(s);
    g.userData.spin = m;
    return g;
  }
  R.updateStars = function (sess, t) {
    for (const [id, g] of starMeshes) {
      const s = g.userData.star;
      const found = sess.found[id];
      if (found && !g.userData.gone) { g.userData.gone = 0.001; }
      if (g.userData.gone) {
        g.userData.gone += 1 / 60;
        const k = g.userData.gone;
        g.scale.setScalar(Math.max(0, 1 + k * 3 - k * k * 14));
        g.position.y = s.y + k * 2;
        if (k > 0.5) g.visible = false;
        continue;
      }
      g.visible = true;
      g.userData.spin.rotation.y = t * 2 + s.x;
      g.position.y = s.y + Math.sin(t * 2.2 + s.z) * 0.12;
    }
  };
  R.starMesh = (id) => starMeshes.get(id);

  // ---------- building helpers ----------
  function makeHelpers() {
    // the outline of the block you point at: a chunky frame of 12 thin bars
    frame = new T.Group();
    const fm = new T.MeshBasicMaterial({ color: '#14121f', transparent: true, opacity: 0.75, depthWrite: false });
    const bar = new T.BoxGeometry(1, 1, 1);
    const th = 0.035, L = 1.03;
    for (const ax of [0, 1, 2]) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      const m = new T.Mesh(bar, fm);
      const sc = [th, th, th]; sc[ax] = L;
      m.scale.set(sc[0], sc[1], sc[2]);
      const p = [0, 0, 0]; const o = [0, 1, 2].filter((k) => k !== ax);
      p[o[0]] = s1 * L / 2; p[o[1]] = s2 * L / 2;
      m.position.set(p[0], p[1], p[2]);
      frame.add(m);
    }
    frame.visible = false;
    frame.userData.mat = fm;
    scene.add(frame);
    // the EASY ghost: a see-through copy of the block you'd place
    ghost = new T.Mesh(new T.BoxGeometry(1, 1, 1), []);
    ghost.visible = false;
    ghost.renderOrder = 3;
    scene.add(ghost);
    // the FILL box
    fillBox = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.22, depthWrite: false }));
    fillEdges = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1)), new T.LineBasicMaterial({ color: '#14121f' }));
    fillBox.add(fillEdges);
    fillBox.visible = false;
    fillBox.renderOrder = 4;
    scene.add(fillBox);
    // the MIRROR line: a stripy see-through wall
    const stripes = spriteTex((g, s) => {
      g.clearRect(0, 0, s, s);
      for (let i = -s; i < s * 2; i += 16) { g.fillStyle = 'rgba(255,90,200,0.55)'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 8, 0); g.lineTo(i + 8 - s, s); g.lineTo(i - s, s); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(s / 2 - 2, 0, 4, s);
    }, 64);
    stripes.wrapS = stripes.wrapT = T.RepeatWrapping;
    stripes.repeat.set(12, 10);
    mirrorPlane = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: stripes, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false, fog: false }));
    mirrorPlane.visible = false;
    mirrorPlane.renderOrder = 5;
    scene.add(mirrorPlane);
    // the ruler: two markers, a bar between them and a label
    ruler = new T.Group();
    const rm = new T.MeshBasicMaterial({ color: '#ffd23f', depthTest: false, transparent: true });
    const ra = new T.Mesh(new T.BoxGeometry(0.3, 0.3, 0.3), rm), rb = new T.Mesh(new T.BoxGeometry(0.3, 0.3, 0.3), rm);
    const rbar = new T.Mesh(new T.BoxGeometry(0.08, 0.08, 1), new T.MeshBasicMaterial({ color: '#ff5a6e', depthTest: false, transparent: true }));
    const lc = document.createElement('canvas'); lc.width = 512; lc.height = 128;
    const lt = new T.CanvasTexture(lc); lt.encoding = T.sRGBEncoding;
    const label = new T.Sprite(new T.SpriteMaterial({ map: lt, depthTest: false, transparent: true, fog: false }));
    label.scale.set(3.2, 0.8, 1);
    [ra, rb, rbar, label].forEach((m) => { m.renderOrder = 10; ruler.add(m); });
    ruler.userData = { ra, rb, rbar, label, lc, lt, text: '' };
    ruler.visible = false;
    scene.add(ruler);
    // crumbs
    crumbs = new T.InstancedMesh(new T.BoxGeometry(0.13, 0.13, 0.13), new T.MeshLambertMaterial({ color: '#ffffff' }), 200);
    crumbs.instanceMatrix.setUsage(T.DynamicDrawUsage);
    crumbs.count = 0;
    crumbs.frustumCulled = false;
    crumbs.userData.list = [];
    scene.add(crumbs);
  }
  R.crumbs = function (x, y, z, color, n, puff) {
    const L = crumbs.userData.list;
    for (let i = 0; i < n; i++) {
      if (L.length >= 200) L.shift();
      L.push({ x: x + 0.2 + Math.random() * 0.6, y: y + 0.2 + Math.random() * 0.6, z: z + 0.2 + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 4, vy: 1.5 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.6 + Math.random() * 0.5, c: new T.Color(color), s: puff ? 1.4 : 1 });
    }
  };
  function updateCrumbs(dt) {
    const L = crumbs.userData.list;
    let n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L.splice(i, 1); continue; }
      p.vy -= 14 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (world && world.solidAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) { p.vy = Math.abs(p.vy) * 0.3; p.vx *= 0.5; p.vz *= 0.5; p.y = Math.floor(p.y) + 1.02; }
    }
    for (const p of L) {
      const s = Math.min(1, p.life * 3) * p.s;
      tmpM.compose(tmpV.set(p.x, p.y, p.z), tmpQ.identity(), new T.Vector3(s, s, s));
      crumbs.setMatrixAt(n, tmpM);
      crumbs.setColorAt(n, p.c);
      n++;
    }
    crumbs.count = n;
    crumbs.instanceMatrix.needsUpdate = true;
    if (crumbs.instanceColor) crumbs.instanceColor.needsUpdate = true;
  }

  // view: { aim, easy, block, tool, fillA, ruler, mirror, hideAim }
  R.updateHelpers = function (sess, view, t) {
    const aim = view.aim, hit = aim && aim.hit;
    frame.visible = !!hit && !view.hideAim;
    if (frame.visible) {
      frame.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      frame.userData.mat.color.set(view.tool === 'fill' ? '#7a4b00' : view.tool === 'ruler' ? '#a0105a' : '#14121f');
    }
    // the ghost (EASY): where your block would go
    const showGhost = view.easy && hit && view.tool === 'build' && !view.hideAim && sess.builder.canPlace(hit.place.x, hit.place.y, hit.place.z);
    ghost.visible = !!showGhost;
    if (showGhost) {
      if (!ghostMats[view.block]) ghostMats[view.block] = faceMats(view.block, T.MeshBasicMaterial, { transparent: true, opacity: 0.5, depthWrite: false });
      ghost.material = ghostMats[view.block];
      const o = 0.38 + 0.16 * Math.sin(t * 6);
      for (const m of ghost.material) m.opacity = o;
      ghost.position.set(hit.place.x + 0.5, hit.place.y + 0.5, hit.place.z + 0.5);
      ghost.scale.setScalar(0.96 + 0.03 * Math.sin(t * 6));
    }
    // FILL: the box from the first corner to where you point
    const fa = sess.fillA;
    fillBox.visible = !!(fa && hit);
    if (fillBox.visible) {
      const b = fa.kind === 'place' ? hit.place : hit;
      const box = sess.builder.fillBox(fa, b);
      fillBox.position.set((box.x0 + box.x1 + 1) / 2, (box.y0 + box.y1 + 1) / 2, (box.z0 + box.z1 + 1) / 2);
      fillBox.scale.set(box.x1 - box.x0 + 1.04, box.y1 - box.y0 + 1.04, box.z1 - box.z0 + 1.04);
      fillBox.material.color.set(fa.kind === 'place' ? '#ffd23f' : '#ff5a6e');
    }
    // MIRROR
    const mir = sess.builder.mirror;
    mirrorPlane.visible = mir.on;
    if (mir.on) {
      const p = sess.P().pos;
      const at = mir.m2 / 2 + 0.5;
      mirrorPlane.scale.set(40, 30, 1);
      if (mir.axis === 'x') { mirrorPlane.rotation.set(0, Math.PI / 2, 0); mirrorPlane.position.set(at, Math.max(15, p.y), p.z); }
      else { mirrorPlane.rotation.set(0, 0, 0); mirrorPlane.position.set(p.x, Math.max(15, p.y), at); }
    }
    // the ruler
    const ru = sess.ruler;
    ruler.visible = sess.tool === 'ruler' && !!ru.a;
    if (ruler.visible) {
      const U = ruler.userData;
      const b = ru.b || (hit ? { x: hit.x, y: hit.y, z: hit.z } : ru.a);
      U.ra.position.set(ru.a.x + 0.5, ru.a.y + 0.5, ru.a.z + 0.5);
      U.rb.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
      const len = U.ra.position.distanceTo(U.rb.position);
      U.rbar.position.copy(U.ra.position).lerp(U.rb.position, 0.5);
      U.rbar.scale.set(1, 1, Math.max(0.01, len));
      if (len > 0.01) U.rbar.lookAt(U.rb.position);
      U.label.position.copy(U.rbar.position).add(tmpV.set(0, 0.9, 0));
      const m = BT.build.measure(ru.a, b);
      const text = `${m.dx} × ${m.dy} × ${m.dz}`;
      if (text + Kit.lang.get() !== U.text) {
        U.text = text + Kit.lang.get();
        const g = U.lc.getContext('2d');
        g.clearRect(0, 0, 512, 128);
        g.fillStyle = 'rgba(20,18,31,0.85)'; BT.art.rr(g, 8, 8, 496, 112, 40); g.fill();
        g.fillStyle = '#ffd23f'; g.font = '700 54px "Bungee", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('📏 ' + text, 256, 52);
        g.fillStyle = '#ffffff'; g.font = '800 26px "Rubik", sans-serif';
        g.fillText(Kit.lang.t('BLOCKS: ACROSS × UP × DEEP'), 256, 96);
        U.lt.needsUpdate = true;
      }
      R.rulerText = text;
    }
    updateCrumbs(1 / 60);
  };

  // ---------- the block in your hand ----------
  function makeHand() {
    hud = new T.Scene();
    hudCam = new T.PerspectiveCamera(50, 1, 0.01, 10);
    hud.add(new T.AmbientLight('#ffffff', 0.75));
    const dl = new T.DirectionalLight('#ffffff', 0.6);
    dl.position.set(-1, 2, 1.5);
    hud.add(dl);
    hand = new T.Mesh(new T.BoxGeometry(0.34, 0.34, 0.34), []);
    hand.userData = { swing: 0, block: -1 };
    hud.add(hand);
  }
  R.swing = () => { hand.userData.swing = 1; };
  R.updateHand = function (block, show, dt, t, walk) {
    hand.visible = show && block > 0;
    if (!hand.visible) return;
    if (hand.userData.block !== block) {
      if (!handMats[block]) handMats[block] = faceMats(block, T.MeshLambertMaterial);
      hand.material = handMats[block];
      hand.userData.block = block;
    }
    const s = (hand.userData.swing = Math.max(0, hand.userData.swing - dt * 5));
    const bob = Math.sin(walk * 1.6) * 0.02;
    const w = Math.max(0.7, hudCam.aspect);
    hand.position.set(0.42 * Math.min(1.4, w) - s * 0.1, -0.36 + bob + Math.abs(Math.cos(walk * 0.8)) * 0.015 - s * 0.05, -0.9 + s * 0.15);
    hand.rotation.set(0.35 - s * 0.9, -0.6 + Math.sin(t * 1.3) * 0.02, 0.1);
  };

  R.render = function (third) {
    const t0 = BT.now();
    renderer.clear();
    renderer.render(scene, camera);
    if (hand.visible && !third) { renderer.clearDepth(); renderer.render(hud, hudCam); }
    R.stats.drawMs = BT.now() - t0;
  };
})();
