// Fire: the boy's matchbox (F strikes a match), and the fires that belong in a village.
//  - the chai stall's chulha: light it and you can make the chai (see main.js)
//  - diyas: a row on the temple's plinth and along the top step of the ghat, and a little clay lamp by every
//    house door that the families light at dusk (the boy can light any that are still dark)
//  - the winter alaav: a ring of stones and a stack of logs near the square in winter; light it and a few
//    villagers come over and sit round it, hands out to the warmth
//  - things that burn for real: heaps of dry leaves, the haystacks, and the stubble on the harvested field by
//    the road. Each material burns its own way — dry leaves flare up and are gone, hay burns hot and long,
//    stubble runs across the field in a line pushed by the wind — and fire spreads from one to the next: a
//    burning haystack can set the one beside it going, or the stubble it stands near. Rain damps it all.
//    Burnt ground is black for a while and then grows back; haystacks are built again.
// Houses, people and animals never burn: only the things listed here are fuel.
import * as THREE from 'three';
import { Puffs } from './particles.js';
import { Person } from './people.js';
import { layout, groundHeight, isFree, laneDist, roadX, fieldType, trackDist, riverDist, RIVER_HALF, STUBBLE, SQUARE, colliders } from './world.js';

const lw = (o, lx, lz) => { const c = Math.cos(o.rot ?? 0), s = Math.sin(o.rot ?? 0); return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c }; };
const REGROW = 720; // seconds till burnt ground greens again and a haystack is built back

export function buildFire(scene, village, hooks = {}) {
  // ---- flames, smoke, sparks, and the glow they throw ----
  const flame = new Puffs({ max: 900, color: '#ff3a08', dark: '#fff4b8', opacity: 0.9, additive: true, buoyancy: 1.6, drag: 2.4 });
  const smoke = new Puffs({ max: 420, color: '#77726a', dark: '#2c2a27', opacity: 0.38, buoyancy: 0.5, drag: 0.8 });
  const sparks = new Puffs({ max: 220, color: '#ff5a10', dark: '#ffe08a', opacity: 1, additive: true, buoyancy: 0.4, drag: 0.5 });
  // (brighter than white: in daylight the flames must still read as fire, and the bloom gives them a glow)
  flame.material.uniforms.uDark.value.set('#ffd060').multiplyScalar(1.7); flame.material.uniforms.uColor.value.set('#ff3a06').multiplyScalar(1.5);
  sparks.material.uniforms.uDark.value.multiplyScalar(3); sparks.material.uniforms.uColor.value.multiplyScalar(2);
  // (and the white steam when water hits a fire)
  const steamP = new Puffs({ max: 360, color: '#eef3f5', dark: '#ffffff', opacity: 0.45, buoyancy: 1.3, drag: 1.1 });
  scene.add(flame.mesh, smoke.mesh, sparks.mesh, steamP.mesh);
  const glows = [0, 1].map(() => { const l = new THREE.PointLight('#ff8a3a', 0, 24, 1.4); l.castShadow = false; scene.add(l); return l; });
  let emitAcc = 0;
  // a fire's look: flames licking up over a patch r wide and h tall, smoke rising off it, a spark now and then
  function burnFx(x, y, z, r, h, power, dt, wind, shell = false) {
    const n = power * dt * 46;
    let k = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    while (k-- > 0) {
      // a heap (shell): flames all over its outside, following its dome; flat fuel: anywhere across it
      const a = Math.random() * 6.28, up = shell ? Math.random() : Math.random() * 0.5;
      // (the haystack's own profile: full to two-fifths of the way up, then narrowing to the top)
      const d = shell ? r * (up < 0.4 ? 1.02 : 1.02 - 0.95 * ((up - 0.4) / 0.6) ** 1.6) : Math.sqrt(Math.random()) * r;
      const s = (0.4 + Math.random() * 0.45) * Math.min(2.2, 0.55 + power * 0.45 + (shell ? 0.4 : h * 0.25));
      flame.emit(x + Math.cos(a) * d, y + up * h, z + Math.sin(a) * d, wind.x * 0.4 + (Math.random() - 0.5) * 0.3, 1.0 + Math.random() * 1.1 * Math.min(1.5, h), wind.z * 0.4 + (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.5, s, s * 0.3, 1, 0);
    }
    if (Math.random() < power * dt * 7) { const a = Math.random() * 6.28; smoke.emit(x + Math.cos(a) * r * 0.5, y + h, z + Math.sin(a) * r * 0.5, wind.x * 0.9, 0.7 + Math.random() * 0.5, wind.z * 0.9, 4 + Math.random() * 3, 0.6 * Math.min(2, power), 2.6 * Math.min(2, power), 0.5, 0.25); }
    if (Math.random() < power * dt * 3) sparks.emit(x + (Math.random() - 0.5) * r, y + h * 0.6, z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 1.2 + wind.x, 2 + Math.random() * 2.5, (Math.random() - 0.5) * 1.2 + wind.z, 1.2 + Math.random(), 0.06, 0.02, 1, 0);
  }

  // ---- black, burnt ground (one draw for every patch) ----
  const DECALS = 320;
  const decalMat = new THREE.MeshStandardMaterial({ color: '#15100c', roughness: 1, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const decals = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), decalMat, DECALS);
  decals.receiveShadow = true; decals.frustumCulled = false;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  for (let i = 0; i < DECALS; i++) decals.setMatrixAt(i, _m.makeScale(0, 0, 0));
  scene.add(decals);
  let decalN = 0;
  const newDecal = () => (decalN < DECALS ? decalN++ : -1);
  const setDecal = (i, x, z, r) => { if (i < 0) return; _p.set(x, groundHeight(x, z) + 0.03, z); _s.set(r, 1, r); decals.setMatrixAt(i, _m.compose(_p, _q.identity(), _s)); decals.instanceMatrix.needsUpdate = true; };

  // ---- the fuel: everything that can burn ----
  const fuels = [];
  // haystacks (their own meshes char and slump as they burn)
  for (const hs of layout.haystacks) {
    if (!hs.obj) continue;
    fuels.push({ kind: 'haystack', name: 'the haystack', x: hs.x, z: hs.z, y: groundHeight(hs.x, hs.z), r: 1.85 * hs.s, h: 3.3 * hs.s, s: hs.s, obj: hs.obj, burnTime: 65, power: 2.6 * hs.s, catchAt: 7, reach: 7, state: 0, heat: 0, decal: -1 });
  }
  // heaps of dry leaves swept up round the main village: on open ground, well clear of the houses
  const leafMat = new THREE.MeshStandardMaterial({ color: '#8a5a26', roughness: 1, flatShading: true });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: '#b07a34', roughness: 1, side: THREE.DoubleSide });
  {
    let made = 0;
    for (let i = 0; i < 400 && made < 8; i++) {
      const a = i * 2.39996, d = 16 + (i % 37);
      const x = SQUARE.x + Math.cos(a) * d, z = SQUARE.z + Math.sin(a) * d;
      if (!isFree(x, z, 4) || laneDist(x, z) < 3 || Math.abs(x - roadX(z)) < 7 || fieldType(x, z) || trackDist(x, z) < 10 || riverDist(x, z) < RIVER_HALF + 6) continue;
      if (fuels.some((f) => f.kind === 'leaves' && Math.hypot(f.x - x, f.z - z) < 14)) continue;
      const g = new THREE.Group(), y = groundHeight(x, z);
      g.position.set(x, y, z);
      const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1).scale(1, 0.34, 1.15), leafMat);
      mound.position.y = 0.1; mound.castShadow = true; mound.receiveShadow = true; g.add(mound);
      for (let k = 0; k < 14; k++) { const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.08), k % 2 ? leafMat : leafMat2); const b = k * 1.7, q = 0.5 + (k % 5) * 0.18; lf.position.set(Math.cos(b) * q, 0.02 + (k % 3) * 0.04, Math.sin(b) * q * 1.1); lf.rotation.set(-Math.PI / 2 + (k % 4) * 0.2, 0, b); g.add(lf); }
      scene.add(g);
      fuels.push({ kind: 'leaves', name: 'the heap of dry leaves', x, z, y, r: 0.8, h: 0.5, obj: g, burnTime: 30, power: 0.75, catchAt: 1.5, reach: 3, state: 0, heat: 0, decal: -1 });
      made++;
    }
  }
  // the winter alaav, near the square: a ring of stones round a stack of logs
  let alaav = null;
  {
    for (let i = 0; i < 300 && !alaav; i++) {
      const a = 0.8 + i * 2.39996, d = 11 + (i % 19);
      const x = SQUARE.x + Math.cos(a) * d, z = SQUARE.z + Math.sin(a) * d;
      if (!isFree(x, z, 4.5) || laneDist(x, z) < 3.5 || Math.abs(x - roadX(z)) < 8 || fieldType(x, z)) continue;
      const g = new THREE.Group(), y = groundHeight(x, z);
      g.position.set(x, y, z);
      const stone = new THREE.MeshStandardMaterial({ color: '#7a746a', roughness: 0.95, flatShading: true });
      for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17 + (k % 3) * 0.03), stone); const b = (k / 9) * 6.28; s.position.set(Math.cos(b) * 0.85, 0.08, Math.sin(b) * 0.85); s.rotation.set(k, k * 2, 0); g.add(s); }
      const wood = new THREE.MeshStandardMaterial({ color: '#5a3c22', roughness: 0.9 });
      const logs = new THREE.Group();
      for (let k = 0; k < 7; k++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 7), wood); const b = (k / 7) * 6.28; lg.position.set(Math.cos(b) * 0.22, 0.42, Math.sin(b) * 0.22); lg.rotation.set(Math.sin(b) * 0.45, 0, -Math.cos(b) * 0.45); lg.castShadow = true; logs.add(lg); }
      g.add(logs);
      scene.add(g);
      alaav = { kind: 'alaav', name: 'the alaav', x, z, y, r: 0.55, h: 1.0, obj: g, logs, burnTime: 240, power: 1.15, catchAt: 999, reach: 0, state: 0, heat: 0, decal: -1, sitters: null };
      // the fire pit stays all year (only the logs are winter's), and nobody walks through it
      colliders.push({ kind: 'c', x, z, r: 1.05 });
      fuels.push(alaav);
    }
  }
  // ---- the stubble field: a grid of 2 m cells, each with a few tufts of cut straw ----
  const CELL = 2, NX = Math.round((STUBBLE.x1 - STUBBLE.x0) / CELL), NZ = Math.round((STUBBLE.z1 - STUBBLE.z0) / CELL);
  const cells = [];
  const TUFTS = 5;
  const tuftGeo = (() => {
    const parts = [];
    for (let k = 0; k < 6; k++) { const c = new THREE.ConeGeometry(0.012, 0.2 + (k % 3) * 0.05, 3, 1, true); const b = k * 1.05; c.translate(Math.cos(b) * 0.05, 0.11, Math.sin(b) * 0.05); c.rotateZ((Math.random() - 0.5) * 0.4); parts.push(c); }
    const g = new THREE.BufferGeometry();
    let n = 0; for (const p of parts) n += p.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0; const idx = [];
    for (const p of parts) { const pi = p.index ? p.index.array : null; pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); if (pi) for (const v of pi) idx.push(v + o); o += p.attributes.position.count; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(idx);
    return g;
  })();
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ color: '#c8a868', roughness: 0.9, side: THREE.DoubleSide }), NX * NZ * TUFTS);
  tufts.receiveShadow = true;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = STUBBLE.x0 + (i + 0.5) * CELL, z = STUBBLE.z0 + (j + 0.5) * CELL;
    const c = { i, j, x, z, y: groundHeight(x, z), state: 0, t: 0, heat: 0, decal: -1, tufts: [] };
    for (let k = 0; k < TUFTS; k++) {
      const id = (j * NX + i) * TUFTS + k, tx = x + ((k * 0.37 + i * 0.13) % 1 - 0.5) * CELL * 0.9, tz = z + ((k * 0.61 + j * 0.29) % 1 - 0.5) * CELL * 0.9;
      const s = 0.8 + ((k * 7 + i * 3 + j) % 5) * 0.1;
      c.tufts.push({ id, x: tx, z: tz, s });
      tufts.setMatrixAt(id, _m.compose(_p.set(tx, groundHeight(tx, tz), tz), _q.setFromAxisAngle(_s.set(0, 1, 0), k * 1.3 + i), _s.set(s, s, s)));
    }
    cells.push(c);
  }
  scene.add(tufts);
  const cellAt = (i, j) => (i >= 0 && j >= 0 && i < NX && j < NZ ? cells[j * NX + i] : null);
  const setTufts = (c, k) => { for (const t of c.tufts) tufts.setMatrixAt(t.id, _m.compose(_p.set(t.x, groundHeight(t.x, t.z) - (1 - k) * 0.25, t.z), _q.identity(), _s.set(t.s, t.s * Math.max(0.02, k), t.s))); tufts.instanceMatrix.needsUpdate = true; };

  // ---- lamps: diyas at the temple and the ghat, and one by every house door ----
  const lamps = [];
  const T = layout.temple;
  if (T) for (let k = 0; k < 5; k++) { const p = lw(T, -1.6 + k * 0.8, 2.25); lamps.push({ x: p.x, z: p.z, y: groundHeight(T.x, T.z) + 0.75, where: 'temple', lit: 0, t: 0 }); }
  const GH = layout.ghat;
  if (GH?.steps?.length) { const st = GH.steps[0]; for (let k = 0; k < 7; k++) { const p = lw(GH, st.lx, -3 + k); lamps.push({ x: p.x, z: p.z, y: st.top, where: 'ghat', lit: 0, t: 0 }); } }
  for (const h of layout.houses) {
    const c = colliders.find((o) => o.x === h.x && o.z === h.z);
    if (!c) continue;
    const front = c.kind === 'b' ? c.hd + 0.25 : (c.r ?? 2) + 0.25, side = c.kind === 'b' ? c.hw * 0.62 : 0.7;
    const p = lw(h, side, front);
    lamps.push({ x: p.x, z: p.z, y: groundHeight(p.x, p.z), where: 'house', lit: 0, t: 0, delay: Math.random() * 80 });
  }
  const cupGeo = new THREE.CylinderGeometry(0.075, 0.045, 0.04, 10);
  const cups = new THREE.InstancedMesh(cupGeo, new THREE.MeshStandardMaterial({ color: '#a6512e', roughness: 0.85 }), lamps.length);
  lamps.forEach((L, i) => cups.setMatrixAt(i, _m.makeTranslation(L.x, L.y + 0.02, L.z)));
  scene.add(cups);
  // the little flames: one draw for every lamp, each a flickering teardrop of light (unlit ones have no size)
  const fpos = new Float32Array(lamps.length * 3), fon = new Float32Array(lamps.length), fseed = new Float32Array(lamps.length);
  lamps.forEach((L, i) => { fpos[i * 3] = L.x; fpos[i * 3 + 1] = L.y + 0.1; fpos[i * 3 + 2] = L.z; fseed[i] = Math.random() * 100; });
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const onAttr = new THREE.BufferAttribute(fon, 1).setUsage(THREE.DynamicDrawUsage);
  fgeo.setAttribute('aOn', onAttr); fgeo.setAttribute('aSeed', new THREE.BufferAttribute(fseed, 1));
  const fmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: window.innerHeight * 0.5 } },
    vertexShader: `attribute float aOn; attribute float aSeed; uniform float uTime; uniform float uScale; varying float vF;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vF = 0.85 + 0.15 * sin(uTime * 13.0 + aSeed) * sin(uTime * 7.3 + aSeed * 2.0);
        gl_PointSize = aOn * max(2.0, min(70.0, 0.24 * uScale / -mv.z * vF)); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vF;
      void main() { vec2 p = gl_PointCoord - 0.5; p.y = -p.y;
        float core = smoothstep(0.22, 0.0, length(vec2(p.x * 2.6, (p.y + 0.12) * 1.3)));
        float halo = smoothstep(0.5, 0.0, length(p)) * 0.35;
        vec3 c = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.92, 0.6), core);
        gl_FragColor = vec4(c * (core + halo) * vF, 1.0); }`,
  });
  const fpoints = new THREE.Points(fgeo, fmat);
  fpoints.frustumCulled = false;
  scene.add(fpoints);

  // ---- the chulha at the chai stall ----
  const tea = village?.tea;
  const chulha = tea ? { x: tea.chulha.x, z: tea.chulha.z, y: tea.chulha.y } : null;

  // ---- villagers who come and sit round the alaav ----
  function gatherRound() {
    if (!alaav || alaav.sitters) return;
    const looks = [{ dress: 'dhoti', top: '#e9dcc3', bottom: '#f0ebe0', headwear: 'turban', turban: '#e07a1e', mustache: true, skin: '#6e4530', sleeves: 'long' },
      { dress: 'saree', top: '#8a2a4a', bottom: '#c4324a', veil: true, skin: '#80523a', k: 0.92 },
      { dress: 'pants', top: '#5a6a7a', bottom: '#3a3a42', headwear: 'cap', turban: '#d8d0c0', mustache: true, skin: '#7a4c33', sleeves: 'long' },
      { dress: 'shorts', top: '#c8402a', bottom: '#2a3a5a', skin: '#7a4c33', k: 0.7 }];
    alaav.sitters = looks.map((look, i) => {
      const p = new Person(look); p.noHit = true; scene.add(p.root);
      const a = (i / looks.length) * 6.28 + 0.4, from = 22 + i * 3;
      const seat = { x: alaav.x + Math.cos(a) * 1.75, z: alaav.z + Math.sin(a) * 1.75 };
      const home = { x: alaav.x + Math.cos(a + 0.7) * from, z: alaav.z + Math.sin(a + 0.7) * from };
      return { p, seat, home, x: home.x, z: home.z, face: 0, mode: 'come', wait: i * 4 + Math.random() * 3 };
    });
  }
  function updateSitters(dt) {
    if (!alaav?.sitters) return;
    const lit = alaav.state === 1;
    let any = false;
    for (const q of alaav.sitters) {
      if (q.wait > 0) { q.wait -= dt; q.p.root.visible = false; any = true; continue; }
      if (!lit && q.mode !== 'gone') q.mode = 'go';
      const tgt = q.mode === 'come' || q.mode === 'sit' ? q.seat : q.home;
      const dx = tgt.x - q.x, dz = tgt.z - q.z, d = Math.hypot(dx, dz);
      let sp = 0;
      if (q.mode === 'gone') { q.p.root.visible = false; continue; }
      any = true;
      if (d > 0.15 && q.mode !== 'sit') { sp = 1.1; const s = Math.min(d, sp * dt); q.x += (dx / d) * s; q.z += (dz / d) * s; q.face = Math.atan2(dx, dz); }
      else if (q.mode === 'come') q.mode = 'sit';
      else if (q.mode === 'go') q.mode = 'gone';
      if (q.mode === 'sit') q.face = Math.atan2(alaav.x - q.x, alaav.z - q.z);
      q.p.root.visible = true;
      q.p.root.position.set(q.x, groundHeight(q.x, q.z), q.z);
      q.p.root.rotation.y += Math.atan2(Math.sin(q.face - q.p.root.rotation.y), Math.cos(q.face - q.p.root.rotation.y)) * Math.min(1, dt * 5);
      q.p.update(dt, sp, q.mode === 'sit' ? 'sit' : sp ? 'walk' : 'idle');
    }
    if (!any) { for (const q of alaav.sitters) scene.remove(q.p.root); alaav.sitters = null; }
  }

  // ---- lighting things ----
  const wet = (ctx) => ctx.rain > 0.3;
  function ignite(f) {
    if (f.state !== 0 || f.wetT > 0) return false;
    f.state = 1; f.t = 0; f.heat = 0;
    if (f.kind === 'haystack') {
      f.mats = [];
      f.obj.traverse((o) => { if (o.isMesh) { f.mats.push([o, o.material]); o.material = o.material.clone(); } });
    }
    if (f.kind === 'alaav') gatherRound();
    return true;
  }
  function igniteCell(c) { if (c.state !== 0 || c.wetT > 0) return false; c.state = 1; c.t = 0; c.heat = 0; return true; }
  // what's within reach of the boy's match, nearest first
  function target(px, pz, ctx) {
    let best = null, bd = 1e9;
    const consider = (d, o) => { if (d < bd) { bd = d; best = o; } };
    if (chulha && !tea.lit) consider(Math.hypot(chulha.x - px, chulha.z - pz) - 0.6, { kind: 'chulha', ask: 'light the chulha', name: 'the chulha' });
    for (const L of lamps) { if (L.lit) continue; const d = Math.abs(L.x - px) + Math.abs(L.z - pz); if (d < 3) consider(Math.hypot(L.x - px, L.z - pz) - 0.3, { kind: 'lamp', L, ask: L.where === 'house' ? 'light the lamp by the door' : 'light the diya', name: 'the diya' }); }
    for (const f of fuels) {
      if (f.state !== 0) continue;
      if (f.kind === 'alaav' && !(ctx.season === 'winter' || f.state)) continue;
      consider(Math.hypot(f.x - px, f.z - pz) - f.r, { kind: 'fuel', f, ask: `set fire to ${f.name}`, name: f.name });
    }
    const ci = Math.floor((px - STUBBLE.x0) / CELL), cj = Math.floor((pz - STUBBLE.z0) / CELL);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const c = cellAt(ci + di, cj + dj); if (c && c.state === 0) consider(Math.hypot(c.x - px, c.z - pz) - 1.0, { kind: 'cell', c, ask: 'burn off the stubble', name: 'the stubble' }); }
    return bd < 1.6 ? best : null;
  }
  let matchT = 0;
  const wind = { x: 0, z: 0, a: Math.random() * 6.28 };
  let lastCtx = { rain: 0, season: 'spring', night: false };

  return {
    lamps, fuels, cells,
    get alaav() { return alaav; },
    get matchT() { return matchT; },
    // the prompt for F, if there's something to light here
    prompt(px, pz) { const t = target(px, pz, lastCtx); return t ? t.ask : null; },
    // F: strike a match; whatever is in reach catches (if it isn't soaked)
    strike(px, pz) {
      matchT = 2.6;
      hooks.onStrike?.();
      const t = target(px, pz, lastCtx);
      if (!t) return { lit: false, text: 'You strike a match — the little flame flickers and goes out' };
      if (wet(lastCtx) && (t.kind === 'fuel' || t.kind === 'cell') && t.f?.kind !== 'alaav') return { lit: false, text: `${t.name[0].toUpperCase() + t.name.slice(1)} is too wet to catch in this rain` };
      if ((t.f?.wetT > 0) || (t.c?.wetT > 0)) return { lit: false, text: `${t.name[0].toUpperCase() + t.name.slice(1)} is soaked — it won't catch till it dries` };
      if (t.kind === 'chulha') { tea.lit = true; return { lit: true, text: 'The chulha catches — now you can make the chai (E) ☕' }; }
      if (t.kind === 'lamp') { t.L.lit = 1; t.L.t = 0; t.L.byBoy = true; return { lit: true, text: t.L.where === 'house' ? 'The lamp by the door is lit 🪔' : 'The diya is lit 🪔' }; }
      if (t.kind === 'cell') { igniteCell(t.c); return { lit: true, text: 'The stubble catches — it runs off across the field with the wind 🔥' }; }
      if (t.kind === 'fuel') {
        ignite(t.f);
        return { lit: true, text: t.f.kind === 'alaav' ? 'The alaav crackles into life — folk will come to sit round it 🔥' : t.f.kind === 'haystack' ? 'The haystack goes up with a roar! 🔥' : 'The leaves catch and flare up 🔥' };
      }
      return { lit: false, text: '' };
    },
    update(dt, ctx) {
      lastCtx = ctx;
      const { player, t, rain = 0, night = false, dusk = false } = ctx;
      matchT = Math.max(0, matchT - dt);
      // the wind: a slow drift of direction, its strength from the trees' wind
      wind.a += (Math.sin(t * 0.013) * 0.02 + (Math.random() - 0.5) * 0.01) * dt * 10;
      const ws = 0.4 + (ctx.wind ?? 0.6);
      wind.x = Math.cos(wind.a) * ws; wind.z = Math.sin(wind.a) * ws;
      for (const P of [flame, smoke, sparks]) P.wind.set(wind.x * 0.6, 0, wind.z * 0.6);
      const near = (x, z, d) => Math.abs(x - player.x) + Math.abs(z - player.z) < d;
      const lights = [];
      let roar = 0, crackle = 0;
      const heard = (x, z, p) => { const d = Math.hypot(x - player.x, z - player.z); const v = Math.max(0, 1 - d / 70) * p; roar = Math.max(roar, v); crackle += v; };
      // ---- soaked things dry out ----
      for (const f of fuels) if (f.wetT > 0) f.wetT -= dt * (rain > 0.3 ? 0 : 1);
      for (const c of cells) if (c.wetT > 0) c.wetT -= dt * (rain > 0.3 ? 0 : 1);
      // ---- things burning ----
      for (const f of fuels) {
        if (f.state === 1) {
          f.t += dt * (1 + rain * 3);
          const k = Math.min(1, f.t / f.burnTime);
          // a fire builds up, burns hot, and dies down to embers
          const life = Math.min(1, f.t / 6) * (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1);
          const power = f.power * Math.max(0.12, life);
          if (f.kind === 'haystack') {
            const slump = 1 - 0.72 * k;
            f.obj.scale.set(f.s * (1 - 0.15 * k), f.s * slump, f.s * (1 - 0.15 * k));
            for (const [o, m] of f.mats) o.material.color.copy(m.color).lerp(_char, Math.min(0.92, k * 1.3));
          }
          if (f.kind === 'leaves') f.obj.scale.set(1, Math.max(0.15, 1 - k), 1);
          if (f.kind === 'alaav') f.logs.scale.setScalar(Math.max(0.3, 1 - k * 0.7));
          if (near(f.x, f.z, 260)) burnFx(f.x, f.y + 0.05, f.z, f.kind === 'haystack' ? f.r * (1 - 0.15 * k) : f.r, f.kind === 'haystack' ? f.h * (1 - 0.72 * k) : f.h, power, dt, wind, f.kind === 'haystack' || f.kind === 'leaves');
          lights.push({ x: f.x, y: f.y + 1.2, z: f.z, p: power });
          heard(f.x, f.z, power);
          // heat reaching its neighbours: other haystacks and leaves, and the stubble
          if (f.reach && !wet(ctx)) {
            for (const o of fuels) {
              if (o === f || o.state !== 0 || o.kind === 'alaav') continue;
              const d = Math.hypot(o.x - f.x, o.z - f.z) - o.r - f.r;
              if (d > f.reach) continue;
              const down = ((o.x - f.x) * wind.x + (o.z - f.z) * wind.z) / Math.max(0.1, Math.hypot(o.x - f.x, o.z - f.z)) / ws;
              o.heat += dt * power * (1 + Math.max(0, down) * 1.5) / (1 + d * d * 0.35);
              if (o.heat > o.catchAt) ignite(o);
            }
            if (f.x > STUBBLE.x0 - f.reach && f.x < STUBBLE.x1 + f.reach && f.z > STUBBLE.z0 - f.reach && f.z < STUBBLE.z1 + f.reach) {
              for (const c of cells) { if (c.state) continue; const d = Math.hypot(c.x - f.x, c.z - f.z) - f.r; if (d < 3) { c.heat += dt * power * 0.6; if (c.heat > 1) igniteCell(c); } }
            }
          }
          if (f.t >= f.burnTime) {
            f.state = 2; f.t = 0;
            if (f.kind !== 'alaav') { if (f.decal < 0) f.decal = newDecal(); setDecal(f.decal, f.x, f.z, f.r * 1.5 + 0.6); }
            if (f.kind === 'leaves') f.obj.visible = false;
          }
        } else if (f.state === 2) {
          // embers out; in time it all comes back: leaves swept up again, the haystack rebuilt, new logs stacked
          f.t += dt;
          if (f.t > (f.kind === 'alaav' ? 120 : REGROW)) {
            f.state = 0; f.t = 0; f.heat = 0;
            if (f.decal >= 0) setDecal(f.decal, f.x, f.z, 0);
            if (f.kind === 'haystack') { f.obj.scale.setScalar(f.s); for (const [o, m] of f.mats) { o.material.dispose(); o.material = m; } f.mats = null; }
            if (f.kind === 'leaves') { f.obj.visible = true; f.obj.scale.set(1, 1, 1); }
            if (f.kind === 'alaav') f.logs.scale.setScalar(1);
          }
        }
      }
      // the alaav's woodpile only stands in winter (unless it's burning)
      if (alaav) alaav.logs.visible = (ctx.season === 'winter' || alaav.state === 1) && alaav.state !== 2;
      updateSitters(dt);
      // ---- the stubble: each burning cell sets its neighbours going, faster downwind ----
      let burning = 0, fx = 0, fz = 0;
      for (const c of cells) {
        if (c.state === 1) {
          c.t += dt * (1 + rain * 3);
          const k = c.t / 7;
          burning++; fx += c.x; fz += c.z;
          setTufts(c, Math.max(0, 1 - k * 1.4));
          if (near(c.x, c.z, 240)) burnFx(c.x, c.y, c.z, 1.0, 0.9, 0.75 * Math.min(1, c.t / 1.2) * (k > 0.7 ? (1 - k) / 0.3 : 1), dt, wind);
          if (!wet(ctx)) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const n = cellAt(c.i + di, c.j + dj);
            if (!n || n.state) continue;
            const l = Math.hypot(di, dj), down = (di * wind.x + dj * wind.z) / (l * ws);
            n.heat += dt * (0.16 / l) * Math.max(0.12, 1 + down * 1.6) * (0.7 + Math.random() * 0.6);
            if (n.heat > 1) igniteCell(n);
          }
          if (c.t >= 7) { c.state = 2; c.t = 0; if (c.decal < 0) c.decal = newDecal(); setDecal(c.decal, c.x, c.z, 1.45); }
        } else if (c.state === 2) {
          c.t += dt;
          // greening over again: the black fades out, the tufts come back
          if (c.t > REGROW) { const g = Math.min(1, (c.t - REGROW) / 30); setDecal(c.decal, c.x, c.z, 1.45 * (1 - g)); setTufts(c, g); if (g >= 1) { c.state = 0; c.t = 0; c.heat = 0; } }
        }
      }
      if (burning) { lights.push({ x: fx / burning, y: groundHeight(fx / burning, fz / burning) + 1, z: fz / burning, p: Math.min(2.2, 0.4 + burning * 0.1) }); heard(fx / burning, fz / burning, Math.min(1.6, 0.3 + burning * 0.06)); }
      // the chulha's own little fire
      if (tea?.lit && chulha && near(chulha.x, chulha.z, 120)) {
        burnFx(chulha.x, chulha.y - 0.08, chulha.z, 0.06, 0.06, tea.boil > 0 ? 0.22 : 0.12, dt, { x: 0, z: 0 });
        lights.push({ x: chulha.x, y: chulha.y + 0.3, z: chulha.z, p: 0.35 });
      }
      // ---- lamps: the families light theirs at dusk, one by one, and put them out in the morning ----
      let changed = false;
      for (let i = 0; i < lamps.length; i++) {
        const L = lamps[i];
        if (L.where === 'house') {
          if (dusk && !L.lit) { L.t += dt; if (L.t > L.delay) { L.lit = 1; L.t = 0; } }
          else if (!dusk && L.lit && !L.byBoy) { L.t += dt; if (L.t > L.delay * 0.6) { L.lit = 0; L.t = 0; } }
          else if (dusk && L.lit) L.t = 0;
        }
        // a lamp the boy lit by day burns down in a few minutes; at the temple and ghat they last till dawn
        if (L.lit && L.byBoy && !dusk) { L.t += dt; if (L.t > 240) { L.lit = 0; L.byBoy = false; L.t = 0; } }
        if (L.lit && L.byBoy && dusk && L.where !== 'house') L.t = 0;
        if (rain > 0.7 && L.lit && L.where !== 'temple') { L.lit = 0; L.byBoy = false; }
        const on = L.lit ? 1 : 0;
        if (fon[i] !== on) { fon[i] = on; changed = true; }
      }
      if (changed) onAttr.needsUpdate = true;
      fmat.uniforms.uTime.value = t; fmat.uniforms.uScale.value = window.innerHeight * 0.5;
      // ---- the glow of the two nearest fires ----
      lights.sort((a, b) => (a.x - player.x) ** 2 + (a.z - player.z) ** 2 - ((b.x - player.x) ** 2 + (b.z - player.z) ** 2));
      glows.forEach((g, i) => {
        const L = lights[i];
        if (!L || !near(L.x, L.z, 90)) { g.intensity = 0; return; }
        g.position.set(L.x, L.y, L.z);
        const fl = 0.8 + 0.2 * Math.sin(t * 17 + i * 3) * Math.sin(t * 9.1 + i);
        g.intensity = (night ? 9 : 4) * L.p * fl;
        g.distance = 10 + L.p * 9;
      });
      hooks.onSound?.(roar, crackle);
      flame.update(dt); smoke.update(dt); sparks.update(dt); steamP.update(dt);
    },
    setRain() {},
    // Water landing at (x, z) — a drop's worth (from the fire tender's hose). Burning things are put out once
    // they've had enough of it (in a cloud of steam), lamps and the chulha go out, and anything soaked won't
    // catch again for a minute and a half. Returns the name of a fire just put out, if one was.
    // is (x, y, z) inside something that can burn? (so water in flight can strike it)
    solidAt(x, y, z) {
      for (const f of fuels) {
        if (Math.abs(f.x - x) > f.r || Math.abs(f.z - z) > f.r) continue;
        const top = f.y + (f.kind === 'haystack' ? f.h * f.obj.scale.y / f.s : f.h);
        if (y < top && y > f.y - 0.2 && Math.hypot(f.x - x, f.z - z) < f.r) return true;
      }
      return false;
    },
    douse(x, z, w = 0.012) {
      let out = null;
      const steam = (px, py, pz, n, r) => { for (let i = 0; i < n; i++) steamP.emit(px + (Math.random() - 0.5) * r, py + Math.random() * 0.5, pz + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 0.6, 1.2 + Math.random() * 1.4, (Math.random() - 0.5) * 0.6, 2.5 + Math.random() * 1.5, 0.5, 2.6, 0.5, 1); };
      for (const f of fuels) {
        const d = Math.hypot(f.x - x, f.z - z);
        if (d > f.r + 0.9) continue;
        f.wetT = 90; f.heat = 0;
        if (f.state !== 1) continue;
        f.water = (f.water ?? 0) + w;
        if (Math.random() < 0.15) steam(f.x, f.y + f.h * 0.4, f.z, 1, f.r);
        if (f.water > f.r * 1.8) {
          f.state = 2; f.t = 0; f.water = 0;
          if (f.kind !== 'alaav') { if (f.decal < 0) f.decal = newDecal(); setDecal(f.decal, f.x, f.z, f.r * 1.5 + 0.6); }
          steam(f.x, f.y + f.h * 0.3, f.z, 26, f.r * 1.4);
          out = f.name;
        }
      }
      if (x > STUBBLE.x0 - 2 && x < STUBBLE.x1 + 2 && z > STUBBLE.z0 - 2 && z < STUBBLE.z1 + 2) {
        for (const c of cells) {
          if (Math.abs(c.x - x) > 1.6 || Math.abs(c.z - z) > 1.6) continue;
          c.wetT = 90; c.heat = 0;
          if (c.state === 1) { c.state = 2; c.t = 0; if (c.decal < 0) c.decal = newDecal(); setDecal(c.decal, c.x, c.z, 1.45); steam(c.x, c.y, c.z, 4, 1.2); out = out ?? 'the burning stubble'; }
        }
      }
      for (const L of lamps) if (L.lit && Math.abs(L.x - x) < 0.6 && Math.abs(L.z - z) < 0.6) { L.lit = 0; L.byBoy = false; L.t = 0; }
      if (tea?.lit && chulha && Math.hypot(chulha.x - x, chulha.z - z) < 0.8) { tea.lit = false; steam(chulha.x, chulha.y, chulha.z, 6, 0.3); out = out ?? 'the chulha'; }
      return out;
    },
  };
}
const _char = new THREE.Color('#1c140e');
