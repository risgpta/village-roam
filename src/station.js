// Railway stations: Sonpur, a small country station in its valley beyond the western tunnel, and two little
// halts on the Noorpur–Mariapur line. Each has a raised platform (a step up along the back), yellow name
// boards at both ends, a tin shelter with benches, lamp posts; Sonpur also has its station house with the
// ticket window, a chai stall and a water tap. People wait on the platform with their bundles; when a train
// stands at the platform, passengers climb down from the coach doors and walk off home, and the waiting
// ones walk to the doors and board — up to 40 aboard a train.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Person } from './people.js';
import { streetLight } from './lights.js';
import { colliders, surfaces, heightAt, groundHeight, TRACK_Y } from './world.js';

export const CAPACITY = 40;
const RAIL_TOP = TRACK_Y + 0.42;
const TOP = RAIL_TOP + 0.45; // platform surface
const EDGE = 1.75; // from the track centre to the platform edge
const MATS = new Map();
const mat = (c, r = 0.8, o = {}) => {
  const k = c + r + JSON.stringify(o);
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o }));
  return MATS.get(k);
};
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// platform paving: square stone tiles, slightly varied
let _pave = null;
function paveMat() {
  if (_pave) return _pave;
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9d968a'; g.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const k = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453, r = k - Math.floor(k);
      g.fillStyle = `rgb(${158 + r * 22},${151 + r * 20},${139 + r * 18})`;
      g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  _pave = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  return _pave;
}
// the facing wall of the platform toward the track: old red brick
let _brick = null;
function brickMat() {
  if (_brick) return _brick;
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#d2c6b4'; g.fillRect(0, 0, w, h);
    const bh = h / 8, bw = w / 4;
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
      const k = Math.sin(r * 31.7 + c * 11.3) * 9999, q = k - Math.floor(k);
      g.fillStyle = `rgb(${150 + q * 30},${70 + q * 20},${52 + q * 14})`;
      g.fillRect(c * bw + (r % 2) * bw / 2 + 2, r * bh + 2, bw - 4, bh - 3);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.5, 1);
  _brick = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
  return _brick;
}
// the shelter roof: corrugated tin, painted red
let _tin = null;
function tinTex(len) {
  const t = canvasTex(64, 256, (g, w, h) => {
    for (let y = 0; y < h; y++) { const v = 0.5 + 0.5 * Math.sin((y / h) * Math.PI * 2 * 16); g.fillStyle = `rgb(${120 + v * 40},${38 + v * 14},${30 + v * 10})`; g.fillRect(0, y, w, 1); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, len / 2.4);
  return t;
}
// the fretted wooden valance along the front of the roof, white with a zig-zag edge
let _val = null;
function valanceTex() {
  if (_val) return _val;
  _val = canvasTex(128, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h * 0.45);
    g.fillStyle = '#2f6b4a'; g.fillRect(0, h * 0.12, w, h * 0.08);
    g.fillStyle = '#f4efe2';
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(i * 32, h * 0.44); g.lineTo(i * 32 + 16, h * 0.95); g.lineTo(i * 32 + 32, h * 0.44); g.fill(); }
    g.fillStyle = '#c4241c'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(i * 32 + 16, h * 0.55, 3.5, 0, 7); g.fill(); }
  });
  _val.wrapS = THREE.RepeatWrapping;
  return _val;
}
function clockTex() {
  return canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#fbf8ef'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 5; g.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.lineWidth = i % 3 ? 2 : 4; g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); g.stroke(); }
    g.lineCap = 'round';
    g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(0.3 * 6.28) * 30, 64 - Math.cos(0.3 * 6.28) * 30); g.stroke();
    g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(0.83 * 6.28) * 46, 64 - Math.cos(0.83 * 6.28) * 46); g.stroke();
    g.fillStyle = '#c4241c'; g.beginPath(); g.arc(64, 64, 4, 0, 7); g.fill();
  });
}
function timetableTex(name) {
  return canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = '#f6f3ea'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1d4f8a'; g.fillRect(0, 0, w, 56);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `bold 24px ${DEVA}`; g.fillText('समय सारणी', w / 2, 26); g.font = 'bold 16px Arial'; g.fillText('TIME TABLE · ' + name.toUpperCase(), w / 2, 47);
    g.fillStyle = '#222'; g.font = '15px Arial'; g.textAlign = 'left';
    const rows = [['Passenger', '06:40'], ['Local', '08:15'], ['Gol Gaadi', '09:30'], ['Mail', '11:05'], ['Passenger', '13:20'], ['Local', '15:45'], ['Gol Gaadi', '17:10'], ['Passenger', '19:30']];
    rows.forEach(([n, t], i) => { const y = 84 + i * 29; g.fillText(n, 20, y); g.textAlign = 'right'; g.fillText(t, w - 20, y); g.textAlign = 'left'; g.strokeStyle = '#ccc'; g.beginPath(); g.moveTo(14, y + 9); g.lineTo(w - 14, y + 9); g.stroke(); });
  });
}
const DEVA = '"Tiro Devanagari Hindi", "Kohinoor Devanagari", "Noto Sans Devanagari", sans-serif';
// the classic yellow station board: Hindi above, English below, in black
function boardTex(hi, en) {
  return canvasTex(512, 200, (g, w, h) => {
    g.fillStyle = '#f2c418'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#141414'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 74px ${DEVA}`; g.fillText(hi, w / 2, 70);
    g.font = 'bold 56px Arial, sans-serif'; g.fillText(en.toUpperCase(), w / 2, 150);
  });
}
const SKIN = ['#8a5a3c', '#7a4c33', '#6e4530', '#a06a48', '#5e3a28', '#93613f', '#7f5238', '#b07a52'];
const outfit = (i) => {
  const k = i % 5;
  if (k === 1 || k === 3) {
    const S = [['#d4a017', '#b3202c'], ['#3c6e47', '#2e8b57'], ['#7a2b6e', '#c2185b'], ['#1e6fa8', '#f2b705'], ['#e0612b', '#2e3fa8']][i % 5];
    return { dress: 'saree', k: 0.9 + (i % 3) * 0.02, top: S[0], bottom: S[1], veil: i % 2 === 0, skin: SKIN[(i + 3) % 8] };
  }
  if (k === 4 && i % 3 === 0) return { dress: 'shorts', k: 0.68, headScale: 1.22, top: ['#f4f4f0', '#e0612b', '#2e8b57'][i % 3], bottom: '#2a3a6a', skin: SKIN[(i + 5) % 8], sleeves: 'short' };
  return { dress: ['kurta', 'pants', 'dhoti'][i % 3], top: ['#f4f2ec', '#8fa6c4', '#e9dcc3', '#c9b27a', '#b9c7a5', '#d8a0a0'][i % 6], bottom: ['#f4f1e8', '#3a3a42', '#efece4'][i % 3], skin: SKIN[i % 8], mustache: i % 4 !== 3, sleeves: i % 2 ? 'short' : undefined, headwear: [undefined, 'cap', 'turban', 'topi'][i % 4], turban: ['#e07a1e', '#f2efe6', '#c0392b', '#ffffff'][i % 4] };
};
const CARRY = [null, 'bundle', 'potHead', null, 'bundle', null, null, 'hay'];

// one station (or halt) beside one track
function buildStation(scene, train, h, hooks, line = [train]) {
  const T = train.tk;
  const big = !!h.big;
  const L = h.L ?? (big ? 170 : 100), W = h.W ?? (big ? 6.5 : 4.2);
  const side = h.side;
  // the station's frame: u along the track (from the platform centre), v out from the track centre
  const frame = (u) => {
    const q = T.path.at(h.s + u);
    return { x: q.x, z: q.z, tx: q.tx, tz: q.tz, nx: -q.tz * side, nz: q.tx * side, rot: Math.atan2(q.tx, q.tz) };
  };
  const at = (u, v) => { const f = frame(u); return { x: f.x + f.nx * v, z: f.z + f.nz * v }; };
  const group = new THREE.Group();
  scene.add(group);
  const parts = { plat: [], edge: [], step: [], cope: [], face: [] };
  const box = (list, w, hgt, d, x, y, z, rot) => list.push(new THREE.BoxGeometry(w, hgt, d).rotateY(rot).translate(x, y, z));
  let benches = [], lampMats = [];
  // (the junction's island platform is built once, by the Mariapur line's halt; the main line's shares it)
  if (!h.island) {
  // the platform, built in 5 m slabs that follow the curve of the line
  for (let u = -L / 2; u < L / 2; u += 5) {
    const um = u + 2.5, f = frame(um);
    const c = at(um, EDGE + W / 2);
    const back = at(um, EDGE + W + 1.0);
    const gB = heightAt(back.x, back.z), gF = Math.min(heightAt(c.x, c.z), TRACK_Y);
    const base = Math.min(gB, gF) - 0.3;
    box(parts.plat, W, TOP - base, 5.06, c.x, (TOP + base) / 2, c.z, f.rot);
    const e = at(um, EDGE + 0.95);
    box(parts.edge, 0.14, 0.02, 5.06, e.x, TOP + 0.01, e.z, f.rot); // the yellow line to stand behind
    const cp = at(um, EDGE + 0.3);
    box(parts.cope, 0.72, 0.14, 5.06, cp.x, TOP - 0.06, cp.z, f.rot); // stone coping with a lip over the track
    const fc = at(um, EDGE + 0.04);
    box(parts.face, 0.12, TOP - 0.13 - base, 5.06, fc.x, (TOP - 0.13 + base) / 2, fc.z, f.rot); // brick face
    surfaces.push({ kind: 'b', x: c.x, z: c.z, rot: f.rot, hw: W / 2, hd: 2.55, top: TOP });
    // a step along the back so you can walk up from the ground
    const rise = TOP - gB;
    if (rise > 0.55) {
      const nSteps = Math.min(3, Math.ceil(rise / 0.55));
      for (let k = 1; k < nSteps + 0 + 1; k++) {
        if (k === nSteps) break;
        const top = gB + (rise * k) / nSteps;
        const sc = at(um, EDGE + W + 0.45 + (nSteps - 1 - k) * 0.9);
        box(parts.step, 0.9, top - base, 5.06, sc.x, (top + base) / 2, sc.z, f.rot);
        surfaces.push({ kind: 'b', x: sc.x, z: sc.z, rot: f.rot, hw: 0.45, hd: 2.55, top });
      }
    }
  }
  const mesh = (geos, m, shadow = true) => { const o = new THREE.Mesh(mergeGeometries(geos), m); o.castShadow = shadow; o.receiveShadow = true; group.add(o); return o; };
  mesh(parts.plat, paveMat());
  mesh(parts.edge, mat('#f0d23a', 0.7), false);
  mesh(parts.cope, mat('#d6cfbf', 0.9));
  mesh(parts.face, brickMat());
  if (parts.step.length) mesh(parts.step, mat('#938b7f', 0.95));
  const add = (geo, m, x, y, z, ry = 0, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const placed = (u, v, y = TOP) => { const f = frame(u), p = at(u, v); const g = new THREE.Group(); g.position.set(p.x, y, p.z); g.rotation.y = f.rot; group.add(g); return g; };
  // in a placed group: local +z runs along the track, local +x points away from the track (side +1) — flip for side -1
  const sx = -side; // a placed group's local +x points toward the track for side +1, so flip: sx * (+x) is "away from the track"
  // name boards at both ends, readable from the platform and from a passing train
  const bt = new THREE.MeshStandardMaterial({ map: boardTex(h.hi, h.name), roughness: 0.6 });
  for (const u of [-L / 2 + 8, L / 2 - 8]) {
    const g = placed(u, EDGE + W - 1.2);
    for (const px of [-1.3, 1.3]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), mat('#2a2a2a', 0.6), 0, 1.3, px, 0, g);
    const b = add(new THREE.PlaneGeometry(3.2, 1.25), bt, 0, 2.5, 0, Math.PI / 2 * -sx, g);
    const b2 = add(new THREE.PlaneGeometry(3.2, 1.25), bt, 0, 2.5, 0, Math.PI / 2 * sx, g);
    b.position.x = -0.02 * sx; b2.position.x = 0.02 * sx;
    colliders.push({ kind: 'c', ...at(u, EDGE + W - 1.2), r: 0.3, height: TOP + 3 });
  }
  // the tin shelter: posts along the back, a roof sloping toward the track, benches beneath
  const SL = big ? 42 : 12;
  const roofM = mat('#8a2a22', 0.55, { side: THREE.DoubleSide }), postM = mat('#4a5560', 0.5, { metalness: 0.4 });
  const greenM = mat('#2f6b4a', 0.6), creamM = mat('#f2efe6', 0.6);
  for (let u = -SL / 2; u <= SL / 2 + 0.1; u += 6) {
    // cast-iron posts, painted: a plinth at the foot, a collar and a curved bracket up under the roof
    const g = placed(u, EDGE + W - 0.6);
    add(new THREE.CylinderGeometry(0.08, 0.1, 3.3, 10), postM, 0, 1.65, 0, 0, g);
    add(new THREE.CylinderGeometry(0.17, 0.2, 0.35, 10), greenM, 0, 0.17, 0, 0, g);
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 10), greenM, 0, 2.9, 0, 0, g);
    // a beam across under the roof, from the back post out toward the track
    const beam = add(new THREE.BoxGeometry(W - 0.4, 0.16, 0.12), greenM, -sx * (W - 0.6) / 2 + sx * 0.3, 3.2 + 0.09 * (W - 0.6) / 2, 0, 0, g);
    beam.rotation.z = -0.09 * side * sx * -1;
    const br = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 5, 10, Math.PI / 2), greenM);
    br.position.set(-sx * 0.5, 2.7, 0); br.rotation.y = sx > 0 ? 0 : Math.PI; g.add(br);
    colliders.push({ kind: 'c', ...at(u, EDGE + W - 0.6), r: 0.18, height: TOP + 3.5 });
  }
  {
    const f = frame(0), c = at(0, EDGE + W / 2 + 0.4);
    const tin = new THREE.MeshStandardMaterial({ map: tinTex(SL + 1.5), roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    const roof = add(new THREE.BoxGeometry(W + 0.6, 0.06, SL + 1.5), tin, c.x, TOP + 3.35, c.z, f.rot);
    roof.rotateZ(0.09 * side);
    // the fretted valance hanging along the front, toward the track
    const vg = placed(0, EDGE + 0.62);
    const vt = valanceTex().clone(); vt.needsUpdate = true; vt.repeat.set((SL + 1.5) / 1.2, 1);
    const vm = new THREE.MeshStandardMaterial({ map: vt, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, roughness: 0.7 });
    const val = add(new THREE.PlaneGeometry(SL + 1.5, 0.55), vm, 0, 2.95 + 0.09 * 0.1, 0, Math.PI / 2, vg); val.castShadow = false;
    // and a gutter along the back
    const gb = at(0, EDGE + W + 0.6);
    add(new THREE.CylinderGeometry(0.07, 0.07, SL + 1.5, 8).rotateX(Math.PI / 2), postM, gb.x, TOP + 3.08, gb.z, f.rot);
    // the station clock, hung from the roof, with a face on each side
    const cg = placed(0, EDGE + 1.6);
    const cm = new THREE.MeshStandardMaterial({ map: clockTex(), roughness: 0.4 });
    add(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 24).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), mat('#1a1a1a', 0.4), 0, 2.45, 0, Math.PI / 2, cg);
    for (const d of [-1, 1]) add(new THREE.CircleGeometry(0.38, 24), cm, d * 0.075, 2.45, 0, d * Math.PI / 2, cg);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), postM, 0, 2.95, 0, 0, cg);
    void creamM;
  }
  for (let u = -SL / 2 + 3; u < SL / 2 - 2; u += big ? 7 : 6) {
    const g = placed(u, EDGE + W - 1.4);
    add(new THREE.BoxGeometry(0.5, 0.06, 2.0), mat('#6a4a2c', 0.75), 0, 0.46, 0, 0, g);
    add(new THREE.BoxGeometry(0.06, 0.4, 2.0), mat('#6a4a2c', 0.75), 0.24 * sx, 0.72, 0, 0, g);
    for (const dz of [-0.85, 0.85]) add(new THREE.BoxGeometry(0.45, 0.46, 0.06), mat('#3a3a3a', 0.6), 0, 0.23, dz, 0, g);
    for (const dz of [-0.5, 0.5]) benches.push({ u: u + dz, v: EDGE + W - 1.45 });
  }
  // three street lights along the platform, their lamps reaching out over the edge
  for (const u of [-L * 0.38, SL / 2 + 9, L * 0.38]) {
    const g = placed(u, EDGE + W - 0.45);
    const sl = streetLight({ height: 5.4, reach: 1.9, base: false });
    sl.rotation.y = sx > 0 ? Math.PI : 0; // the arm toward the track
    sl.userData.pool.scale.setScalar(0.85);
    g.add(sl);
    colliders.push({ kind: 'c', ...at(u, EDGE + W - 0.45), r: 0.14, height: TOP + 5 });
  }
  // the little things on every platform: fire buckets, a timetable, dustbins, potted plants
  {
    const fg = placed(-SL / 2 - 4, EDGE + W - 0.5);
    add(new THREE.BoxGeometry(0.12, 1.5, 1.7), mat('#b8241c', 0.6), sx * 0.1, 0.75, 0, 0, fg);
    add(new THREE.BoxGeometry(0.3, 0.06, 1.7), mat('#b8241c', 0.6), -sx * 0.05, 1.3, 0, 0, fg);
    const bucketGeo = new THREE.CylinderGeometry(0.15, 0.11, 0.28, 10, 1, true);
    const sandM = mat('#d9c39a', 1);
    for (let i = 0; i < 4; i++) {
      const z = -0.6 + i * 0.4;
      add(bucketGeo, mat('#d42a1e', 0.5, { side: THREE.DoubleSide }), -sx * 0.12, 1.14, z, 0, fg);
      add(new THREE.CircleGeometry(0.14, 10).rotateX(-Math.PI / 2), sandM, -sx * 0.12, 1.24, z, 0, fg);
    }
    colliders.push({ kind: 'c', ...at(-SL / 2 - 4, EDGE + W - 0.5), r: 0.5, height: TOP + 1.5 });
    const tg = placed(-SL / 2 - 8, EDGE + W - 0.4);
    for (const dz of [-0.55, 0.55]) add(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), postM, 0, 1.15, dz, 0, tg);
    add(new THREE.BoxGeometry(0.06, 1.25, 1.3), mat('#1d4f8a', 0.6), 0, 1.65, 0, 0, tg);
    add(new THREE.PlaneGeometry(1.0, 1.25), new THREE.MeshStandardMaterial({ map: timetableTex(h.name), roughness: 0.6 }), -sx * 0.035, 1.65, 0, -sx * Math.PI / 2, tg);
    colliders.push({ kind: 'c', ...at(-SL / 2 - 8, EDGE + W - 0.4), r: 0.6, height: TOP + 2.3 });
    for (const u of [-SL / 2 - 1.5, SL / 2 + 1.5]) {
      const bg = placed(u, EDGE + W - 0.7);
      add(new THREE.CylinderGeometry(0.22, 0.19, 0.7, 12), mat('#2f6b4a', 0.6), 0, 0.35, 0, 0, bg);
      add(new THREE.CylinderGeometry(0.235, 0.235, 0.06, 12), mat('#1e4a32', 0.6), 0, 0.72, 0, 0, bg);
      colliders.push({ kind: 'c', ...at(u, EDGE + W - 0.7), r: 0.25, height: TOP + 0.8 });
    }
    const potM = mat('#b0582e', 0.85), leafM = mat('#3f7a2e', 0.9), flowerM = mat('#e0412b', 0.8);
    for (let u = -L / 2 + 14; u < L / 2 - 12; u += big ? 14 : 18) {
      if (Math.abs(u) < SL / 2 + 10) continue;
      const pg = placed(u, EDGE + W - 0.45);
      add(new THREE.CylinderGeometry(0.28, 0.2, 0.5, 10), potM, 0, 0.25, 0, 0, pg);
      add(new THREE.IcosahedronGeometry(0.42, 1), leafM, 0, 0.75, 0, 0, pg).scale.set(1, 0.8, 1);
      for (let k = 0; k < 3; k++) add(new THREE.SphereGeometry(0.07, 6, 5), flowerM, Math.cos(k * 2.1) * 0.25, 0.95, Math.sin(k * 2.1) * 0.25, 0, pg);
    }
    // the halts get a little brick booking office on the platform
    if (!big) {
      const og = placed(SL / 2 + 4.5, EDGE + W - 1.3);
      add(new THREE.BoxGeometry(2.2, 2.5, 2.6), mat('#e3c48a', 0.9), 0, 1.25, 0, 0, og);
      add(new THREE.BoxGeometry(2.24, 0.35, 2.64), mat('#7a2a1e', 0.7), 0, 0.17, 0, 0, og);
      const r = add(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4), mat('#9a3a26', 0.7), 0, 2.85, 0, 0, og); r.scale.set(2.0, 0.8, 2.3);
      add(new THREE.BoxGeometry(0.05, 0.6, 0.7), mat('#2a2a2a', 0.5), -sx * 1.11, 1.35, 0.3, 0, og);
      add(new THREE.BoxGeometry(0.05, 1.9, 0.8), mat('#3a5a48', 0.7), -sx * 1.11, 0.95, -0.75, 0, og);
      add(new THREE.PlaneGeometry(1.3, 0.3), new THREE.MeshStandardMaterial({ map: canvasTex(256, 60, (x, w, hh) => { x.fillStyle = '#1d4f8a'; x.fillRect(0, 0, w, hh); x.fillStyle = '#fff'; x.font = `bold 26px ${DEVA}`; x.textAlign = 'center'; x.fillText('टिकट · TICKETS', w / 2, 38); }) }), -sx * 1.14, 1.85, 0.3, -sx * Math.PI / 2, og);
      colliders.push({ kind: 'b', ...at(SL / 2 + 4.5, EDGE + W - 1.3), rot: frame(SL / 2 + 4.5).rot, hw: 1.15, hd: 1.35, height: TOP + 3 });
    }
  }
  // Sonpur: the station house behind the platform, the chai stall and a water tap
  if (big) {
    const f = frame(6), hb = at(6, EDGE + W + 7.5);
    const gH = heightAt(hb.x, hb.z);
    const g = new THREE.Group(); g.position.set(hb.x, gH, hb.z); g.rotation.y = f.rot; group.add(g);
    const wall = mat('#e3c48a', 0.9), trim = mat('#7a2a1e', 0.7);
    // in g: x across (+ away from the track when side = 1), z along
    add(new THREE.BoxGeometry(6, 3.4, 16), wall, 0, 1.7, 0, 0, g);
    add(new THREE.BoxGeometry(6.04, 0.5, 16.04), trim, 0, 0.25, 0, 0, g);
    add(new THREE.BoxGeometry(6.04, 0.22, 16.04), trim, 0, 3.3, 0, 0, g);
    const roof = add(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4), mat('#9a3a26', 0.7), 0, 4.15, 0, 0, g);
    roof.scale.set(5.2, 1.7, 12.6);
    // the face toward the platform: doors, barred windows, the ticket window and the name over the door
    const face = -3.02 * sx;
    for (const dz of [-5.5, 0, 5.5]) {
      add(new THREE.BoxGeometry(0.06, 2.2, 1.3), mat('#3a5a48', 0.7), face, 1.1, dz, 0, g);
      add(new THREE.BoxGeometry(0.08, 0.12, 1.5), trim, face, 2.3, dz, 0, g);
    }
    for (const dz of [-2.8, 2.8]) add(new THREE.BoxGeometry(0.06, 1.0, 1.0), mat('#2a2a2a', 0.5), face, 1.8, dz, 0, g);
    const tw = add(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ map: canvasTex(256, 52, (x, w, hh) => { x.fillStyle = '#1d4f8a'; x.fillRect(0, 0, w, hh); x.fillStyle = '#fff'; x.font = `bold 26px ${DEVA}`; x.textAlign = 'center'; x.fillText('टिकट घर · TICKETS', w / 2, 35); }) }), face - 0.04 * sx, 2.65, 2.8, -Math.PI / 2 * sx, g);
    void tw;
    const nb = add(new THREE.PlaneGeometry(5, 0.9), bt, face - 0.04 * sx, 3.75, 0, -Math.PI / 2 * sx, g);
    void nb;
    colliders.push({ kind: 'b', x: hb.x, z: hb.z, rot: f.rot, hw: 3.1, hd: 8.1 });
    // chai stall on the platform
    const cg = placed(-30, EDGE + W - 2.0);
    add(new THREE.BoxGeometry(1.4, 1.0, 2.2), mat('#2e7a5a', 0.7), 0, 0.5, 0, 0, cg);
    add(new THREE.BoxGeometry(1.6, 0.06, 2.6), mat('#c8a050', 0.6), 0, 2.2, 0, 0, cg);
    for (const dz of [-1.1, 1.1]) add(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), postM, 0.6 * sx, 1.6, dz, 0, cg);
    add(new THREE.CylinderGeometry(0.16, 0.14, 0.3, 10), mat('#c0c4c8', 0.3, { metalness: 0.8 }), 0, 1.15, 0.5, 0, cg);
    colliders.push({ kind: 'b', ...at(-30, EDGE + W - 2.0), rot: frame(-30).rot, hw: 0.75, hd: 1.15, height: TOP + 2.3 });
    const chaiwala = new Person({ dress: 'kurta', top: '#f4f2ec', bottom: '#f4f1e8', skin: '#6e4530', mustache: true, headwear: 'topi' });
    chaiwala.root.position.set(0.95 * sx, 0, 0.2); chaiwala.root.rotation.y = -Math.PI / 2 * sx; cg.add(chaiwala.root);
    chaiwala.prop('kettle', true);
    h.chaiwala = chaiwala;
    // a water tap (pyau) on a little plinth
    const wg = placed(22, EDGE + W - 1.0);
    add(new THREE.BoxGeometry(0.8, 0.9, 1.6), mat('#b9b2a6', 0.9), 0, 0.45, 0, 0, wg);
    for (const dz of [-0.5, 0, 0.5]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 6).rotateZ(Math.PI / 2), mat('#c0c4c8', 0.3, { metalness: 0.8 }), -0.45 * sx, 0.8, dz, 0, wg);
    colliders.push({ kind: 'b', ...at(22, EDGE + W - 1.0), rot: frame(22).rot, hw: 0.4, hd: 0.8, height: TOP + 1 });
  }

  }
  // ---- the people ----
  const nPool = big ? 40 : h.W ? 18 : h.village ? 12 : 8; // the junction halts out on the ring stay quiet
  const pool = [];
  for (let i = 0; i < nPool; i++) {
    const p = new Person(outfit(i + (big ? 0 : 50)));
    p.root.visible = false;
    group.add(p.root);
    const carry = CARRY[i % CARRY.length];
    if (carry) p.prop(carry, true);
    pool.push({ p, state: 'hidden', t: 0, u: 0, v: 0, x: 0, z: 0, tx: 0, tz: 0, seat: null, carry });
  }
  const yard = h.yard;
  const home = big ? hooks.sonpur ?? yard : hooks.villageFor?.(h) ?? yard;
  const SLb = big ? 42 : 12;
  const blocked = (u) => [-SLb / 2 - 4, -SLb / 2 - 8, SLb / 2 + 1.5, -SLb / 2 - 1.5, ...(big ? [] : [SLb / 2 + 4.5])].some((b) => Math.abs(u - b) < 2.2);
  const spot = () => { let u; do u = (Math.random() - 0.5) * (L - 30); while (blocked(u)); return { u, v: EDGE + 1.0 + Math.random() * (W - 2.4) }; };
  const setAt = (q, u, v) => { const p = at(u, v); q.x = p.x; q.z = p.z; };
  const goTo = (q, x, z) => { q.tx = x; q.tz = z; };
  // start with some waiting
  let freeSeats = benches.slice();
  const wait = (q) => {
    q.state = 'wait'; q.p.root.visible = true;
    const sp = spot();
    q.seat = null;
    if (freeSeats.length && Math.random() < 0.45) { q.seat = freeSeats.splice(Math.floor(Math.random() * freeSeats.length), 1)[0]; sp.u = q.seat.u; sp.v = q.seat.v; }
    setAt(q, sp.u, sp.v); goTo(q, q.x, q.z);
    { const f = frame(sp.u); q.face = Math.atan2(-f.nx, -f.nz); } // facing the track, ready for the train
    q.p.root.rotation.y = q.face;
  };
  const startWaiting = big ? 22 : nPool <= 8 ? 3 : 5;
  pool.slice(0, startWaiting).forEach(wait);
  let respawn = 6;
  const serve = { train: null, t: 0, alight: 0, boardSide: 1, doors: [] };
  const st = {
    h, train, group, pool, lampMats,
    near: false,
    waiting: () => pool.filter((q) => q.state === 'wait').length,
    update(dt, player, night) {
      const dP = Math.hypot(player.x - yard.x, player.z - yard.z);
      this.near = dP < 260;
      group.visible = dP < 700;
      for (const m of lampMats) m.emissiveIntensity = night ? 3.5 : 0.1;
      // whichever train on this line is standing at the platform (the ring has three)
      let tr = st.train;
      for (const t of line) if (t.at && t.at.name === h.name && t.v === 0 && (t.mode === 'dwell' || t.mode === 'driven')) { tr = t; break; }
      st.train = tr;
      const standing = !!tr.at && tr.at.name === h.name && tr.v === 0 && (tr.mode === 'dwell' || tr.mode === 'driven');
      // a train has come in: work out which side its doors open, how many get off
      if (standing && serve.train !== tr) {
        serve.train = tr; serve.t = 0;
        const c = at(0, EDGE + W / 2);
        const dl = tr.doors(1), dr = tr.doors(-1);
        const dist = (ds) => (ds.length ? Math.hypot(ds[0].x - c.x, ds[0].z - c.z) : 1e9);
        serve.boardSide = dist(dl) < dist(dr) ? 1 : -1;
        serve.alight = Math.min(tr.aboard, Math.round(tr.aboard * (0.3 + Math.random() * 0.35)), pool.filter((q) => q.state === 'hidden').length);
        serve.alightAcc = 0;
        hooks.onArrive?.(st, serve.alight);
      }
      if (!standing && serve.train) {
        // it's pulling out: anyone still walking to a door turns back
        for (const q of pool) if (q.state === 'board') wait(q);
        serve.train = null;
      }
      if (standing) {
        serve.t += dt;
        serve.doors = tr.doors(serve.boardSide);
        // passengers climb down, one after another
        if (serve.alight > 0 && serve.t > 1.5) {
          serve.alightAcc += dt * 2.2;
          while (serve.alightAcc > 1 && serve.alight > 0) {
            serve.alightAcc -= 1;
            const q = pool.find((o) => o.state === 'hidden');
            if (!q || !serve.doors.length) { serve.alight = 0; break; }
            const d = serve.doors[Math.floor(Math.random() * serve.doors.length)];
            q.x = d.x; q.z = d.z; q.state = 'alight'; q.t = 0; q.p.root.visible = true;
            tr.aboard = Math.max(0, tr.aboard - 1); serve.alight--;
            // step onto the platform, then head for the back and home
            const out = at(0, EDGE + W + 2);
            q.tx = d.x + (out.x - d.x) * 0.12; q.tz = d.z + (out.z - d.z) * 0.12;
            q.leg = 0;
          }
        }
        // far from the boy, nobody needs to see them walk: the waiting ones just get on
        if (!this.near && serve.alight <= 0 && serve.t > 3) {
          for (const q of pool) if (q.state === 'wait' && tr.aboard < CAPACITY) { q.state = 'hidden'; q.p.root.visible = false; tr.aboard++; if (q.seat) { freeSeats.push(q.seat); q.seat = null; } }
        }
        // then the waiting people walk to the doors and get in, until it's full
        if (serve.alight <= 0 && serve.t > 3) {
          for (const q of pool) {
            if (q.state !== 'wait' || tr.aboard + pool.filter((o) => o.state === 'board').length >= CAPACITY) continue;
            if (Math.random() > dt * 1.4) continue;
            let best = null, bd = 1e9;
            for (const d of serve.doors) { const dd = Math.hypot(d.x - q.x, d.z - q.z); if (dd < bd) { bd = dd; best = d; } }
            if (!best) continue;
            if (q.seat) { freeSeats.push(q.seat); q.seat = null; }
            q.state = 'board'; q.door = best; goTo(q, best.x, best.z);
          }
        }
      }
      // more people turn up over time
      respawn -= dt;
      if (respawn <= 0) {
        respawn = big ? 4 + Math.random() * 6 : 12 + Math.random() * 14;
        if (this.waiting() < (big ? 26 : Math.min(7, nPool - 3))) { const q = pool.find((o) => o.state === 'hidden'); if (q && !standing) wait(q); }
      }
      // move everyone
      const vis = dP < 330;
      for (const q of pool) q.p.root.visible = vis && q.state !== 'hidden';
      if (!this.near) { for (const q of pool) if (q.state === 'alight' || q.state === 'leave') { q.state = 'hidden'; q.p.root.visible = false; } return; }
      for (const q of pool) {
        if (q.state === 'hidden') continue;
        const dx = q.tx - q.x, dz = q.tz - q.z, d = Math.hypot(dx, dz);
        const sp = q.state === 'wait' ? 0 : 1.25;
        let moving = false;
        if (d > 0.08 && sp > 0) {
          const k = Math.min(1, (sp * dt) / d);
          q.x += dx * k; q.z += dz * k; moving = true;
          q.face = Math.atan2(dx, dz);
        } else if (q.state === 'board') {
          // in through the door
          q.state = 'hidden'; q.p.root.visible = false; tr.aboard = Math.min(CAPACITY, tr.aboard + 1);
          if (q.seat) { freeSeats.push(q.seat); q.seat = null; }
          continue;
        } else if (q.state === 'alight') {
          q.leg++;
          if (q.leg === 1) { const o = at((Math.random() - 0.5) * 30, EDGE + W + 2.5); goTo(q, o.x, o.z); }
          else { q.state = 'leave'; goTo(q, home.x + (Math.random() - 0.5) * 16, home.z + (Math.random() - 0.5) * 16); }
        } else if (q.state === 'leave') { q.state = 'hidden'; q.p.root.visible = false; continue; }
        if (q.state === 'board' && q.door) {
          // doors move with the train; keep aiming at the one picked
          let best = q.door, bd = 1e9;
          for (const dd of serve.doors) { const e = Math.hypot(dd.x - q.door.x, dd.z - q.door.z); if (e < bd) { bd = e; best = dd; } }
          q.door = best; goTo(q, best.x, best.z);
        }
        const y = (q.state === 'alight' && q.leg === 0) || q.state === 'board' ? TOP : groundHeight(q.x, q.z, TOP + 0.3);
        q.p.root.position.set(q.x, y, q.z);
        q.p.root.rotation.y += Math.atan2(Math.sin(q.face - q.p.root.rotation.y), Math.cos(q.face - q.p.root.rotation.y)) * Math.min(1, dt * 6);
        q.p.update(dt, moving ? sp : 0, moving ? 'walk' : q.seat ? 'sit' : 'idle');
      }
      if (h.chaiwala) h.chaiwala.update(dt, 0, 'pour');
    },
  };
  // the person rigs live in world space, not in the station group's frame
  for (const q of pool) { group.remove(q.p.root); scene.add(q.p.root); }
  return st;
}

export function buildStations(scene, railway, hooks = {}) {
  const stations = [];
  // one set of platforms per line, served by every train that runs on it
  const lines = new Map();
  for (const tr of railway.trains) {
    tr.aboard = 12 + Math.floor(Math.random() * 14);
    if (!lines.has(tr.tk)) lines.set(tr.tk, []);
    lines.get(tr.tk).push(tr);
  }
  for (const line of lines.values()) for (const h of line[0].halts) if (!h.noStation) stations.push(buildStation(scene, line[0], h, hooks, line));
  return {
    stations,
    update(dt, player, night) { for (const s of stations) s.update(dt, player, night); },
    // the station a train is standing at, if any
    of(h) { return stations.find((s) => s.h.name === h.name); },
  };
}
