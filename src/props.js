// Village buildings and props. Static pieces are merged per material to keep draw calls low;
// moving pieces (cows, flags, cloth, boat, kite) are flagged dynamic and kept separate.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './noise.js';
import { applyClothWave } from './wind.js';
import { warpR, layout, heightAt, colliders, surfaces, WATER_Y, RIVER_HALF, MARKET, CRICKET, RV, RBRIDGE, BRIDGES, archTop, BV, TV, MH, NE, NV, EH, CROSSING, HILLTOP, roadX, PG, NP, MP, PEAK, STAIRS } from './world.js';
import { makeCow } from './animals.js';
import { makeLantern } from './gear.js';
import { lathe, limbZ, boulder } from './shapes.js';
import { Puffs } from './particles.js';
import { mudWallCanvas, thatchCanvas, tileCanvas, wovenCanvas, toTexture } from './textures.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...o });

export let M;
let teaLantern = null;
export function setNightGlow(v) {
  M.dark.emissive.set('#ffb35c');
  M.dark.emissiveIntensity = v * 2.2;
  if (teaLantern) {
    teaLantern.userData.glass.emissiveIntensity = v * 2.4;
    teaLantern.children.forEach((c) => { if (c.isSprite) c.visible = v > 0.5; });
  }
  nightLevel = v;
}
let nightLevel = 0;
function materials() {
  const mudA = mudWallCanvas('#c98f5c', 11);
  const mudB = mudWallCanvas('#d8b48a', 21);
  const thatch = thatchCanvas();
  M = {
    mudA: std('#ffffff', { map: toTexture(mudA) }),
    mudB: std('#ffffff', { map: toTexture(mudB) }),
    mudRoundA: std('#ffffff', { map: toTexture(mudA, { repeat: [3, 1] }) }),
    mudRoundB: std('#ffffff', { map: toTexture(mudB, { repeat: [3, 1] }) }),
    mudPlain: std('#c48a58'),
    plinth: std('#a99278'),
    lime: std('#ece3cf'),
    thatch: std('#ffffff', { map: toTexture(thatch), side: THREE.DoubleSide, roughness: 1 }),
    thatchCone: std('#ffffff', { map: toTexture(thatch, { repeat: [4, 1] }), side: THREE.DoubleSide, roughness: 1 }),
    tile: std('#ffffff', { map: toTexture(tileCanvas(), { repeat: [2, 2] }) }),
    wood: std('#6a4a30'),
    woodDark: std('#3e2b1d'),
    doors: [std('#2f5f8f'), std('#3f6e4c'), std('#7a3a22'), std('#5a3a26')],
    dark: std('#1c1612'),
    stone: std('#a0998c'),
    stoneDark: std('#7c766c'),
    saffron: std('#e57a2b'),
    white: std('#f1e9d8'),
    gold: std('#d9a63a', { metalness: 0.6, roughness: 0.35 }),
    terracotta: std('#a6512e'),
    rope: std('#a08a60'),
    jute: std('#ffffff', { map: toTexture(wovenCanvas(), { repeat: [3, 6] }) }),
    leaf: std('#3e6f2a', { flatShading: true }),
    metal: std('#7d8288', { metalness: 0.5, roughness: 0.5 }),
    wellWater: std('#18302b', { roughness: 0.2 }),
    bamboo: std('#b59a5e', { roughness: 0.7 }),
    tin: std('#8d9399', { metalness: 0.55, roughness: 0.45 }),
    tarp: std('#2f5fa8', { roughness: 0.6, side: THREE.DoubleSide }),
    paint: std('#2d7c86'),
    plankA: std('#7a5636'), plankB: std('#664629'),
    alu: std('#c9ccd0', { metalness: 0.8, roughness: 0.3 }),
    chai: std('#b07a4a', { roughness: 0.3 }),
    coal: std('#3a1a0a', { emissive: '#ff5a1a', emissiveIntensity: 1.5 }),
    glassJar: std('#d8e6e2', { roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45 }),
    biscuit: std('#c98b3c'),
    red: std('#b8322b'), yellow: std('#e6b422'), green: std('#2e8b57'), cream: std('#efe6d0'),
  };
}

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);

// ---------------- buildings ----------------
function rectHouse(R) {
  const g = new THREE.Group();
  const w = 5.5 + R() * 2, d = 4.5 + R() * 1.4, h = 2.6 + R() * 0.4, ph = 0.35;
  const mud = R() < 0.6 ? M.mudA : M.mudB;
  mesh(box(w + 0.7, ph + 0.6, d + 0.7), M.plinth, 0, (ph - 0.6) / 2, 0, g);
  mesh(box(w, h, d), mud, 0, ph + h / 2, 0, g);
  const doorX = (R() - 0.5) * w * 0.3;
  mesh(box(1.3, 2.1, 0.06), M.lime, doorX, ph + 1.02, d / 2 + 0.02, g);
  mesh(box(1.0, 1.9, 0.08), M.doors[Math.floor(R() * M.doors.length)], doorX, ph + 0.95, d / 2 + 0.05, g);
  for (const sx of [-1, 1]) {
    const wx = sx * w * 0.32;
    if (Math.abs(wx - doorX) < 1.2) continue;
    mesh(box(0.85, 0.75, 0.05), M.lime, wx, ph + 1.55, d / 2 + 0.02, g);
    mesh(box(0.65, 0.55, 0.07), M.dark, wx, ph + 1.55, d / 2 + 0.04, g);
  }
  // gable roof
  const roofH = 1.4 + R() * 0.4;
  const roofMat = R() < 0.55 ? M.thatch : M.tile;
  const ang = Math.atan2(roofH, d / 2);
  const L = Math.hypot(d / 2, roofH) + 0.65;
  const ridgeY = ph + h + roofH;
  for (const s of [-1, 1]) {
    const r = mesh(box(w + 0.9, 0.14, L), roofMat, 0, ridgeY - (Math.sin(ang) * L) / 2, (s * Math.cos(ang) * L) / 2, g);
    r.rotation.x = s * ang;
  }
  const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, roofH)]);
  const gable = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  gable.rotateY(Math.PI / 2).translate(-w / 2, ph + h, 0);
  mesh(gable, M.mudPlain, 0, 0, 0, g);
  mesh(box(w + 1.0, 0.16, 0.3), roofMat === M.thatch ? M.woodDark : M.terracotta, 0, ridgeY + 0.02, 0, g);
  // veranda
  let ext = 0;
  if (R() < 0.55) {
    ext = 2.0;
    mesh(box(w + 0.7, ph + 0.6, 2.0), M.plinth, 0, (ph - 0.6) / 2, d / 2 + 1.35, g);
    const aw = mesh(box(w * 0.92, 0.08, 2.3), roofMat === M.thatch ? M.thatch : M.tile, 0, ph + h - 0.12, d / 2 + 1.1, g);
    aw.rotation.x = 0.22;
    const np = 3;
    for (let i = 0; i < np; i++) mesh(cyl(0.07, 0.08, h - 0.45, 8), M.wood, -w * 0.42 + (i * w * 0.84) / (np - 1), ph + (h - 0.45) / 2, d / 2 + 2.05, g);
  }
  return { g, w, d, ph, ext, h };
}

function roundHut(R) {
  const g = new THREE.Group();
  const r = 2.3 + R() * 0.6, h = 2.3, ph = 0.3;
  const mud = R() < 0.5 ? M.mudRoundA : M.mudRoundB;
  mesh(cyl(r + 0.35, r + 0.45, ph + 0.6, 24), M.plinth, 0, (ph - 0.6) / 2, 0, g);
  mesh(cyl(r, r, h, 28), mud, 0, ph + h / 2, 0, g);
  mesh(box(1.1, 2.0, 0.12), M.lime, 0, ph + 1.0, r - 0.02, g);
  mesh(box(0.85, 1.8, 0.16), M.doors[Math.floor(R() * M.doors.length)], 0, ph + 0.92, r + 0.0, g);
  const rh = 2.5 + R() * 0.4;
  mesh(new THREE.ConeGeometry(r + 0.95, rh, 28, 1, true), M.thatchCone, 0, ph + h + rh / 2 - 0.15, 0, g);
  mesh(cyl(0.05, 0.12, 0.5, 6), M.woodDark, 0, ph + h + rh - 0.1, 0, g);
  return { g, r, ph };
}

function temple() {
  const g = new THREE.Group();
  mesh(box(7, 0.75, 7), M.stone, 0, -0.125, 0, g);
  mesh(box(6.2, 0.25, 6.2), M.stone, 0, 0.375, 0, g);
  mesh(box(5.4, 0.25, 5.4), M.stoneDark, 0, 0.625, 0, g);
  const b = 0.75;
  mesh(box(3.2, 2.6, 3.2), M.white, 0, b + 1.3, 0, g);
  mesh(box(1.35, 2.05, 0.06), M.saffron, 0, b + 1.02, 1.6, g);
  mesh(box(1.0, 1.8, 0.08), M.dark, 0, b + 0.9, 1.62, g);
  mesh(box(3.35, 0.22, 3.35), M.saffron, 0, b + 2.55, 0, g);
  for (let i = 0; i < 7; i++) {
    const s = 3.0 * (1 - i * 0.12);
    mesh(box(s, 0.46, s), i % 3 === 2 ? M.saffron : M.white, 0, b + 2.9 + i * 0.46, 0, g);
  }
  const top = b + 2.9 + 7 * 0.46;
  mesh(cyl(0.55, 0.55, 0.22, 16), M.saffron, 0, top - 0.1, 0, g);
  mesh(new THREE.SphereGeometry(0.24, 12, 10), M.gold, 0, top + 0.18, 0, g);
  mesh(new THREE.ConeGeometry(0.12, 0.4, 10), M.gold, 0, top + 0.5, 0, g);
  mesh(cyl(0.025, 0.025, 2.2, 6), M.wood, 0.35, top + 1.0, 0, g);
  // entrance arch with bell
  for (const sx of [-1, 1]) mesh(cyl(0.1, 0.12, 2.3, 10), M.saffron, sx * 0.9, b + 1.15, 2.6, g);
  mesh(box(2.1, 0.18, 0.25), M.saffron, 0, b + 2.35, 2.6, g);
  mesh(new THREE.ConeGeometry(0.14, 0.24, 12, 1, true), M.gold, 0, b + 2.1, 2.6, g);
  // flag
  const flagGeo = new THREE.PlaneGeometry(1.1, 0.6, 10, 4).translate(0.55, 0, 0);
  const fp = flagGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setY(i, fp.getY(i) * (1 - (fp.getX(i) / 1.1) * 0.85));
  const flagMat = applyClothWave(new THREE.MeshLambertMaterial({ color: '#f07a1e', side: THREE.DoubleSide }), { mode: 1, size: 1.1 });
  const flag = mesh(flagGeo, flagMat, 0.37, top + 1.75, 0, g);
  flag.userData.dynamic = true;
  return g;
}

function well() {
  const g = new THREE.Group();
  const prof = [[1.0, -0.4], [1.0, 0.85], [1.15, 0.97], [1.36, 0.92], [1.42, 0.5], [1.42, -0.3]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(prof, 24), new THREE.MeshStandardMaterial({ color: '#a0998c', roughness: 0.95, side: THREE.DoubleSide }), 0, 0, 0, g);
  const water = mesh(new THREE.CircleGeometry(1.0, 20), M.wellWater, 0, 0.1, 0, g);
  water.rotation.x = -Math.PI / 2;
  for (const sx of [-1, 1]) mesh(box(0.14, 2.2, 0.14), M.wood, sx * 1.15, 1.1, 0, g);
  const bar = mesh(cyl(0.05, 0.05, 2.5, 8), M.wood, 0, 2.05, 0, g);
  bar.rotation.z = Math.PI / 2;
  const pul = mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 14), M.woodDark, 0, 1.9, 0, g);
  mesh(cyl(0.012, 0.012, 0.85, 4), M.rope, 0.18, 1.45, 0, g);
  mesh(cyl(0.15, 0.12, 0.24, 12), M.metal, 0.18, 0.95, 0, g);
  return g;
}

function haystack(R) {
  const g = new THREE.Group();
  const prof = [[0.01, 3.3], [0.5, 3.1], [1.3, 2.4], [1.75, 1.4], [1.75, 0.5], [1.55, 0]].reverse().map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(prof, 18), M.thatch, 0, -0.05, 0, g);
  mesh(cyl(0.03, 0.04, 1.0, 5), M.woodDark, 0, 3.5, 0, g);
  return g;
}

function charpai() {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box(0.08, 0.45, 0.08), M.wood, sx * 0.42, 0.225, sz * 0.92, g);
  for (const sx of [-1, 1]) mesh(box(0.06, 0.07, 1.9), M.wood, sx * 0.42, 0.42, 0, g);
  for (const sz of [-1, 1]) mesh(box(0.9, 0.07, 0.06), M.wood, 0, 0.42, sz * 0.92, g);
  mesh(box(0.8, 0.02, 1.8), M.jute, 0, 0.43, 0, g);
  return g;
}

function pot(s = 1) {
  const prof = [[0, 0], [0.12, 0.01], [0.2, 0.08], [0.24, 0.2], [0.22, 0.32], [0.14, 0.4], [0.1, 0.43], [0.115, 0.47], [0.1, 0.48]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  return new THREE.Mesh(new THREE.LatheGeometry(prof, 14), M.terracotta);
}

function tulsi() {
  const g = new THREE.Group();
  mesh(box(0.6, 0.85, 0.6), M.lime, 0, 0.42, 0, g);
  mesh(box(0.64, 0.1, 0.64), M.saffron, 0, 0.8, 0, g);
  for (let i = 0; i < 5; i++) mesh(new THREE.IcosahedronGeometry(0.16, 0), M.leaf, (Math.random() - 0.5) * 0.25, 0.95 + Math.random() * 0.25, (Math.random() - 0.5) * 0.25, g);
  return g;
}

function cart() {
  const g = new THREE.Group();
  mesh(box(1.5, 0.1, 2.4), M.wood, 0, 0.95, 0, g);
  for (const sx of [-1, 1]) {
    mesh(box(0.06, 0.35, 2.4), M.woodDark, sx * 0.72, 1.17, 0, g);
    const wheel = new THREE.Group();
    wheel.position.set(sx * 0.95, 0.78, 0);
    g.add(wheel);
    const rim = mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 22), M.woodDark, 0, 0, 0, wheel);
    rim.rotation.y = Math.PI / 2;
    for (let k = 0; k < 8; k++) {
      const sp = mesh(box(0.04, 1.45, 0.05), M.wood, 0, 0, 0, wheel);
      sp.rotation.x = (k / 8) * Math.PI;
    }
    const hub = mesh(cyl(0.11, 0.11, 0.2, 10), M.woodDark, 0, 0, 0, wheel);
    hub.rotation.z = Math.PI / 2;
  }
  const pole = mesh(box(0.12, 0.12, 2.8), M.wood, 0, 0.62, 2.4, g);
  pole.rotation.x = 0.26;
  const yoke = mesh(cyl(0.05, 0.05, 1.8, 6), M.wood, 0, 0.27, 3.75, g);
  yoke.rotation.z = Math.PI / 2;
  // a little hay in the cart
  mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.5, 1.6), M.thatch, 0, 1.0, -0.2, g);
  return g;
}

function clothesline(R) {
  const g = new THREE.Group();
  const span = 4;
  for (const sx of [-1, 1]) mesh(cyl(0.05, 0.06, 2.2, 6), M.wood, (sx * span) / 2, 1.1, 0, g);
  const rope = mesh(cyl(0.01, 0.01, span, 4), M.rope, 0, 2.05, 0, g);
  rope.rotation.z = Math.PI / 2;
  const colors = ['#c2185b', '#f2b705', '#1e6fa8', '#e0612b', '#2e8b57'];
  let x = -span / 2 + 0.35;
  while (x < span / 2 - 0.6) {
    const w = 0.7 + R() * 0.5, h = 1.0 + R() * 0.5;
    const geo = new THREE.PlaneGeometry(w, h, 6, 8).translate(0, -h / 2, 0);
    const mat = applyClothWave(new THREE.MeshLambertMaterial({ color: colors[Math.floor(R() * colors.length)], side: THREE.DoubleSide }), { mode: 0, size: h });
    const c = mesh(geo, mat, x + w / 2, 2.04, 0, g);
    c.userData.dynamic = true;
    x += w + 0.12;
  }
  return g;
}

function ghat() {
  const gh = layout.ghat;
  const g = new THREE.Group();
  g.position.set(gh.x, 0, gh.z);
  g.rotation.y = gh.rot;
  const bottomY = WATER_Y - 2.2;
  for (const s of gh.steps) {
    const hgt = s.top - bottomY;
    mesh(box(s.hw * 2, hgt, s === gh.steps[0] ? 9 : 8), M.stone, s.lx, bottomY + hgt / 2, 0, g);
  }
  for (const sz of [-1, 1]) {
    mesh(box(0.6, 1.4, 0.6), M.white, -2.4, gh.top0 + 0.7, sz * 4.1, g);
    mesh(box(0.7, 0.15, 0.7), M.saffron, -2.4, gh.top0 + 1.45, sz * 4.1, g);
    colliders.push({ kind: 'c', ...localToWorld(gh, -2.4, sz * 4.1), r: 0.45 });
  }
  return g;
}
function localToWorld(o, lx, lz) {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
}

function footbridge() {
  const f = layout.foot;
  const g = new THREE.Group();
  g.position.set(f.x, 0, f.z);
  g.rotation.y = f.rot;
  const L = (RIVER_HALF + 6) * 2;
  const n = Math.floor(L / 0.35);
  for (let i = 0; i < n; i++) {
    const lx = -L / 2 + i * 0.35 + 0.17;
    const plank = mesh(box(0.3, 0.06, 2.1), (i % 3 ? M.wood : M.woodDark), lx, f.top - 0.03, 0, g);
    plank.rotation.y = (Math.random() - 0.5) * 0.03;
  }
  for (const sz of [-1, 1]) mesh(box(L, 0.16, 0.12), M.woodDark, 0, f.top - 0.14, sz * 0.95, g);
  for (let i = 0; i <= 10; i++) {
    const lx = -L / 2 + (i * L) / 10;
    for (const sz of [-1, 1]) mesh(cyl(0.05, 0.06, 1.15, 6), M.wood, lx, f.top + 0.5, sz * 1.08, g);
    if (i % 2 === 0 && Math.abs(lx) < RIVER_HALF + 2) for (const sz of [-1, 1]) mesh(cyl(0.12, 0.14, 3.2, 8), M.woodDark, lx, f.top - 1.7, sz * 0.9, g);
  }
  for (const sz of [-1, 1]) {
    const rail = mesh(cyl(0.035, 0.035, L, 6), M.wood, 0, f.top + 1.0, sz * 1.08, g);
    rail.rotation.z = Math.PI / 2;
  }
  return g;
}

function hilltopShrine() {
  const h = layout.hilltop;
  const g = new THREE.Group();
  g.position.set(h.x + 3, h.y, h.z - 2);
  mesh(box(2.4, 0.5, 2.4), M.stone, 0, 0.05, 0, g);
  mesh(box(1.5, 1.4, 1.5), M.white, 0, 1.0, 0, g);
  mesh(new THREE.ConeGeometry(1.0, 1.4, 4), M.saffron, 0, 2.4, 0, g).rotation.y = Math.PI / 4;
  mesh(box(0.6, 0.9, 0.06), M.dark, 0, 0.85, 0.76, g);
  mesh(cyl(0.025, 0.025, 3, 6), M.wood, 0.9, 1.8, 0.9, g);
  const flagGeo = new THREE.PlaneGeometry(0.9, 0.5, 8, 3).translate(0.45, 0, 0);
  const fp = flagGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setY(i, fp.getY(i) * (1 - (fp.getX(i) / 0.9) * 0.85));
  const flag = mesh(flagGeo, applyClothWave(new THREE.MeshLambertMaterial({ color: '#f07a1e', side: THREE.DoubleSide }), { mode: 1, size: 0.9 }), 0.92, 3.1, 0.9, g);
  flag.userData.dynamic = true;
  // a stone bench facing the valley
  const bench = new THREE.Group();
  bench.position.set(-3, 0, 4.5);
  bench.rotation.y = Math.PI * 0.9;
  for (const sx of [-1, 1]) mesh(box(0.3, 0.45, 0.4), M.stone, sx * 0.7, 0.22, 0, bench);
  mesh(box(1.9, 0.1, 0.5), M.stoneDark, 0, 0.48, 0, bench);
  g.add(bench);
  return g;
}

function woodpile(R) {
  const g = new THREE.Group();
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4 - row; i++) {
      const log = mesh(cyl(0.12, 0.12, 1.3, 8), i % 2 ? M.wood : M.woodDark, (i - (3 - row) / 2) * 0.25, 0.12 + row * 0.21, 0, g);
      log.rotation.x = Math.PI / 2;
    }
  }
  mesh(cyl(0.3, 0.34, 0.45, 10), M.woodDark, 1.2, 0.22, 0.6, g);
  return g;
}


// ---------------- chai stall ----------------
function signCanvas() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#b8322b'; g.fillRect(0, 0, 256, 6); g.fillRect(0, 58, 256, 6);
  g.fillStyle = '#7a1f12';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 34px "Tiro Devanagari Hindi", "Kohinoor Devanagari", "Devanagari Sangam MN", serif';
  g.fillText('चाय', 78, 34);
  g.font = 'bold 26px Georgia, serif';
  g.fillText('CHAI', 182, 34);
  return c;
}
function teaStall(R) {
  const g = new THREE.Group();
  // bamboo posts
  for (const [x, z, h] of [[-1.3, -1.15, 2.62], [1.3, -1.15, 2.62], [-1.3, 0.92, 2.3], [1.3, 0.92, 2.3]]) mesh(cyl(0.05, 0.055, h, 8), M.bamboo, x, h / 2, z, g);
  // plank back wall and low side walls
  for (let i = 0; i < 6; i++) mesh(box(0.42, 2.1, 0.05), i % 2 ? M.plankA : M.plankB, -1.05 + i * 0.42, 1.05, -1.17, g);
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) mesh(box(0.05, 1.05, 0.5), i % 2 ? M.plankA : M.plankB, sx * 1.3, 0.52, -0.9 + i * 0.5, g);
  // shelf with packets
  mesh(box(2.4, 0.04, 0.28), M.plankA, 0, 1.55, -1.0, g);
  const packs = [M.red, M.yellow, M.green, M.doors[0], M.cream, M.saffron];
  for (let i = 0; i < 9; i++) mesh(box(0.16 + R() * 0.08, 0.2 + R() * 0.1, 0.12), packs[i % packs.length], -1.0 + i * 0.25, 1.68, -1.0, g);
  // counter
  mesh(box(2.6, 0.92, 0.42), M.paint, 0, 0.46, 0.72, g);
  mesh(box(2.7, 0.05, 0.5), M.plankA, 0, 0.945, 0.72, g);
  mesh(box(2.62, 0.12, 0.43), M.cream, 0, 0.75, 0.725, g);
  // clay chulha with glowing coals and the boiling pan
  mesh(lathe([[0.19, 0], [0.2, 0.08], [0.18, 0.2], [0.16, 0.22], [0.13, 0.22], [0.14, 0.05]], 16), M.terracotta, -0.75, 0.97, 0.7, g);
  mesh(new THREE.CircleGeometry(0.13, 14).rotateX(-Math.PI / 2), M.coal, -0.75, 1.1, 0.7, g);
  mesh(lathe([[0.0, 0], [0.15, 0.0], [0.16, 0.02], [0.165, 0.11], [0.17, 0.115]], 18), M.alu, -0.75, 1.19, 0.7, g);
  mesh(new THREE.CircleGeometry(0.155, 18).rotateX(-Math.PI / 2), M.chai, -0.75, 1.28, 0.7, g);
  const handle = mesh(cyl(0.012, 0.012, 0.3, 6), M.woodDark, -0.75, 1.27, 0.95, g);
  handle.rotation.x = Math.PI / 2;
  // a kettle, a row of kulhads, glass jars of rusk
  const kettle = new THREE.Group();
  kettle.position.set(-0.25, 0.97, 0.66);
  mesh(lathe([[0.0, 0], [0.1, 0.0], [0.12, 0.06], [0.11, 0.14], [0.06, 0.19], [0.03, 0.2]], 16), M.alu, 0, 0, 0, kettle);
  mesh(limbZ(0.022, 0.012, 0.14, 8), M.alu, 0, 0.07, 0.09, kettle).rotation.x = -0.7;
  const kh = mesh(new THREE.TorusGeometry(0.07, 0.01, 5, 12, Math.PI), M.woodDark, 0, 0.18, 0, kettle);
  kh.rotation.y = Math.PI / 2;
  g.add(kettle);
  for (let i = 0; i < 7; i++) {
    const k = mesh(lathe([[0.0, 0], [0.025, 0.0], [0.034, 0.05], [0.036, 0.075]], 10), M.terracotta, 0.2 + (i % 4) * 0.085, 0.97 + (i > 3 ? 0.075 : 0), 0.62 + (i > 3 ? 0.04 : 0), g);
    k.rotation.y = i;
  }
  for (let i = 0; i < 3; i++) {
    const x = 0.75 + i * 0.2;
    mesh(cyl(0.075, 0.075, 0.24, 14), M.glassJar, x, 1.09, 0.7, g);
    mesh(cyl(0.06, 0.06, 0.14, 12), M.biscuit, x, 1.04, 0.7, g);
    mesh(cyl(0.08, 0.08, 0.04, 14), [M.red, M.yellow, M.green][i], x, 1.23, 0.7, g);
  }
  // sloped tin roof, the blue tarp awning and its poles
  const roof = mesh(box(3.2, 0.04, 2.7), M.tin, 0, 2.48, -0.12, g);
  roof.rotation.x = Math.atan2(0.36, 2.4);
  for (let i = -7; i <= 7; i++) mesh(box(0.02, 0.03, 2.7), M.tin, i * 0.21, 2.5, -0.12, g).rotation.x = roof.rotation.x;
  const tg = new THREE.PlaneGeometry(3.3, 2.4, 10, 8);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    const t = (z + 1.2) / 2.4;
    tp.setY(i, -t * 0.25 - Math.sin(t * Math.PI) * 0.12 * (1 - Math.abs(x) / 1.8));
  }
  tg.computeVertexNormals();
  mesh(tg, M.tarp, 0, 2.3, 2.25, g);
  for (const sx of [-1, 1]) mesh(cyl(0.04, 0.045, 2.08, 8), M.bamboo, sx * 1.5, 1.04, 3.4, g);
  const sign = mesh(box(1.5, 0.38, 0.04), new THREE.MeshStandardMaterial({ map: toTexture(signCanvas(), { repeat: [1, 1] }), roughness: 0.8 }), 0, 2.15, 0.96, g);
  sign.userData.dynamic = true;
  // strips of snack packets hanging from the front beam
  mesh(box(2.7, 0.06, 0.06), M.bamboo, 0, 2.28, 0.94, g);
  for (const x of [-1.22, 0.82, 1.02, 1.22]) for (let i = 0; i < 5; i++) mesh(box(0.11, 0.13, 0.01), packs[(i + Math.round(x * 3) + 12) % packs.length], x, 2.15 - i * 0.14, 0.95, g);
  // the customers' bench
  mesh(box(2.0, 0.06, 0.34), M.plankA, 0, 0.45, 2.55, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box(0.06, 0.42, 0.06), M.woodDark, sx * 0.88, 0.21, 2.55 + sz * 0.13, g);
  mesh(box(1.8, 0.04, 0.04), M.woodDark, 0, 0.14, 2.55, g);
  return g;
}


// ---------------- Chhota Gaon, the school and the garden ----------------
function boardCanvas(hi, en, { bg = '#b8322b', fg = '#fff6e0', w = 512, h = 96, icon = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  let x0 = 0;
  if (icon === 'cross') {
    g.fillStyle = '#ffffff'; g.fillRect(18, 14, h - 28, h - 28);
    g.fillStyle = '#1f8a4c';
    const m = (h - 28) / 2 + 18, a = (h - 28) * 0.36, b = (h - 28) * 0.12;
    g.fillRect(m - a, h / 2 - b, a * 2, b * 2); g.fillRect(m - b, h / 2 - a, b * 2, a * 2);
    g.fillStyle = fg; x0 = h - 10;
  }
  g.font = `bold ${Math.round(h * 0.42)}px "Tiro Devanagari Hindi", "Kohinoor Devanagari", "Devanagari Sangam MN", serif`;
  g.fillText(hi, x0 + (w - x0) * 0.3, h / 2 + 2);
  g.font = `bold ${Math.round(h * 0.3)}px Georgia, serif`;
  g.fillText(en, x0 + (w - x0) * 0.72, h / 2 + 2);
  return c;
}
const signMat = (c) => new THREE.MeshStandardMaterial({ map: toTexture(c), roughness: 0.8 });
const wallMats = {};
const wallMat = (col) => (wallMats[col] ??= std(col));

// generic flat-roofed pucca building with a verandah along the front
function pucca({ w, d, h, wall, band, trim, sign, verandah = true, pillars = 4, windows = 2, door = '#3a5a7a', tank = false }) {
  const g = new THREE.Group();
  const ph = 0.3;
  mesh(box(w + 0.6, ph + 0.5, d + (verandah ? 2.4 : 0.6)), M.plinth, 0, (ph - 0.5) / 2, verandah ? 0.9 : 0, g);
  mesh(box(w, h, d), wallMat(wall), 0, ph + h / 2, 0, g);
  mesh(box(w + 0.02, 0.7, d + 0.02), wallMat(band), 0, ph + 0.35, 0, g);
  mesh(box(w + 0.4, 0.25, d + 0.4), wallMat(trim), 0, ph + h + 0.12, 0, g); // roof slab
  mesh(box(w + 0.4, 0.45, 0.12), wallMat(wall), 0, ph + h + 0.45, d / 2 + 0.14, g); // parapet
  mesh(box(1.1, 2.1, 0.08), std(door), 0, ph + 1.05, d / 2 + 0.03, g);
  mesh(box(1.3, 0.12, 0.1), wallMat(trim), 0, ph + 2.17, d / 2 + 0.05, g);
  const wx = [];
  for (let i = 0; i < windows; i++) wx.push(((i + 0.5) / windows - 0.5) * (w - 2.6) + Math.sign(((i + 0.5) / windows - 0.5) || 1) * 1.2);
  for (const x of wx) {
    mesh(box(1.0, 1.0, 0.06), wallMat(trim), x, ph + 1.6, d / 2 + 0.03, g);
    mesh(box(0.8, 0.8, 0.08), M.dark, x, ph + 1.6, d / 2 + 0.04, g);
    for (let k = -2; k <= 2; k++) mesh(box(0.025, 0.8, 0.03), M.metal, x + k * 0.15, ph + 1.6, d / 2 + 0.09, g);
  }
  if (verandah) {
    const vz = d / 2 + 1.8;
    const roof = mesh(box(w + 0.3, 0.1, 2.1), M.tin, 0, ph + h - 0.15, d / 2 + 1.0, g);
    roof.rotation.x = 0.12;
    for (let i = 0; i < pillars; i++) mesh(cyl(0.11, 0.12, h - 0.35, 10), wallMat(trim), -w / 2 + 0.4 + (i * (w - 0.8)) / (pillars - 1), ph + (h - 0.35) / 2, vz, g);
  }
  if (sign) {
    const sg = mesh(box(Math.min(w - 1, 4.6), 0.8, 0.06), signMat(sign), 0, ph + h + 0.45, d / 2 + 0.22, g);
    sg.userData.dynamic = true;
  }
  if (tank) {
    mesh(cyl(0.6, 0.62, 1.1, 16), std('#222426', { roughness: 0.6 }), w / 2 - 1.2, ph + h + 0.8, -d / 2 + 1.2, g);
    mesh(cyl(0.2, 0.2, 0.1, 10), std('#222426'), w / 2 - 1.2, ph + h + 1.4, -d / 2 + 1.2, g);
  }
  return g;
}

function postBox() {
  const g = new THREE.Group();
  const red = std('#c4241c', { roughness: 0.5 });
  mesh(cyl(0.26, 0.28, 1.15, 16), red, 0, 0.575, 0, g);
  mesh(new THREE.SphereGeometry(0.27, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 1.15, 0, g);
  mesh(cyl(0.3, 0.3, 0.06, 16), M.dark, 0, 1.15, 0, g);
  mesh(box(0.26, 0.04, 0.05), M.dark, 0, 0.98, 0.26, g);
  mesh(cyl(0.3, 0.32, 0.12, 16), M.dark, 0, 0.06, 0, g);
  return g;
}

function benchG(len = 1.9) {
  const g = new THREE.Group();
  mesh(box(len, 0.06, 0.38), M.plankA, 0, 0.45, 0, g);
  mesh(box(len, 0.32, 0.05), M.plankA, 0, 0.72, -0.18, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box(0.06, 0.45, 0.06), M.woodDark, sx * (len / 2 - 0.1), 0.22, sz * 0.15, g);
  return g;
}

function flagPole() {
  const g = new THREE.Group();
  mesh(box(1.2, 0.3, 1.2), M.lime, 0, 0.15, 0, g);
  mesh(cyl(0.04, 0.05, 6.5, 8), M.metal, 0, 3.4, 0, g);
  const c = document.createElement('canvas');
  c.width = 96; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ff9933'; x.fillRect(0, 0, 96, 22);
  x.fillStyle = '#ffffff'; x.fillRect(0, 21, 96, 22);
  x.fillStyle = '#138808'; x.fillRect(0, 42, 96, 22);
  x.strokeStyle = '#000080'; x.lineWidth = 2;
  x.beginPath(); x.arc(48, 32, 9, 0, 7); x.stroke();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; x.beginPath(); x.moveTo(48, 32); x.lineTo(48 + Math.cos(a) * 9, 32 + Math.sin(a) * 9); x.lineWidth = 0.8; x.stroke(); }
  const fm = applyClothWave(new THREE.MeshLambertMaterial({ map: toTexture(c), side: THREE.DoubleSide }), { mode: 1, size: 1.5 });
  const flag = mesh(new THREE.PlaneGeometry(1.5, 1.0, 12, 6).translate(0.75, 0, 0), fm, 0.05, 6.1, 0, g);
  flag.userData.dynamic = true;
  return g;
}

function swingSet() {
  const g = new THREE.Group();
  const iron = std('#3d6f8a', { metalness: 0.4, roughness: 0.5 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = mesh(cyl(0.04, 0.04, 2.6, 8), iron, sx * 1.6, 1.25, sz * 0.5, g);
    leg.rotation.x = -sz * 0.2;
  }
  const bar = mesh(cyl(0.045, 0.045, 3.3, 8), iron, 0, 2.5, 0, g);
  bar.rotation.z = Math.PI / 2;
  for (const x of [-0.75, 0.75]) {
    for (const dx of [-0.2, 0.2]) mesh(cyl(0.01, 0.01, 1.95, 4), M.metal, x + dx, 1.5, 0, g);
    mesh(box(0.5, 0.05, 0.22), M.plankA, x, 0.52, 0, g);
  }
  return g;
}
function seeSaw() {
  const g = new THREE.Group();
  mesh(box(0.25, 0.45, 0.3), std('#c43a2a'), 0, 0.22, 0, g);
  const plank = mesh(box(0.28, 0.06, 3.0), std('#e2b33a'), 0, 0.48, 0, g);
  plank.rotation.x = 0.16;
  return g;
}

function gardenFence() {
  const G = layout.garden;
  const g = new THREE.Group();
  const pick = std('#efe8d8');
  const run = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 0.22);
    const a = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = mesh(box(0.07, 0.8, 0.03), pick, x0 + (x1 - x0) * t, 0.4, z0 + (z1 - z0) * t, g);
      p.rotation.y = a + Math.PI / 2;
    }
    for (const y of [0.25, 0.6]) {
      const r = mesh(box(0.03, 0.05, L), pick, (x0 + x1) / 2, y, (z0 + z1) / 2, g);
      r.rotation.y = a;
    }
  };
  const { hw, hd } = G;
  run(-hw, -hd, hw, -hd); run(-hw, hd, hw, hd); run(-hw, -hd, -hw, hd);
  run(hw, -hd, hw, -1.5); run(hw, 1.5, hw, hd);
  // gate arch
  for (const sz of [-1.5, 1.5]) mesh(cyl(0.06, 0.07, 2.4, 8), M.bamboo, hw, 1.2, sz, g);
  const arch = mesh(new THREE.TorusGeometry(1.5, 0.05, 6, 20, Math.PI), M.bamboo, hw, 2.4, 0, g);
  arch.rotation.y = Math.PI / 2;
  // beds of dark soil with brick edging, paths of brick-red murram
  const soil = std('#4a3424', { roughness: 1 }), brick = std('#9a4a2e');
  for (const b of gardenBeds()) {
    mesh(box(b.w, 0.18, b.d), soil, b.x, 0.06, b.z, g);
    mesh(box(b.w + 0.12, 0.12, 0.08), brick, b.x, 0.06, b.z - b.d / 2, g);
    mesh(box(b.w + 0.12, 0.12, 0.08), brick, b.x, 0.06, b.z + b.d / 2, g);
    mesh(box(0.08, 0.12, b.d), brick, b.x - b.w / 2, 0.06, b.z, g);
    mesh(box(0.08, 0.12, b.d), brick, b.x + b.w / 2, 0.06, b.z, g);
  }
  // round centre bed with a little stone fountain
  mesh(cyl(0.9, 1.0, 0.45, 20), M.stone, 0, 0.22, 0, g);
  mesh(cyl(0.75, 0.75, 0.05, 20), M.wellWater, 0, 0.44, 0, g);
  mesh(cyl(0.12, 0.16, 0.9, 10), M.stone, 0, 0.7, 0, g);
  mesh(cyl(0.35, 0.2, 0.12, 14), M.stone, 0, 1.15, 0, g);
  const bn = benchG(1.6); bn.position.set(-hw + 1.2, 0, 0); bn.rotation.y = Math.PI / 2; g.add(bn);
  const bn2 = benchG(1.6); bn2.position.set(0, 0, -hd + 0.9); g.add(bn2);
  return g;
}
export function gardenBeds() {
  const G = layout.garden;
  const out = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ x: sx * G.hw * 0.5, z: sz * G.hd * 0.55, w: G.hw * 0.72, d: G.hd * 0.5 });
  for (const sz of [-1, 1]) out.push({ x: -G.hw + 0.9, z: sz * (G.hd - 1.2), w: 1.2, d: 1.6 });
  return out;
}


// ---------------- the haat: stalls heaped with vegetables, fruit, pots, cloth and sweets ----------------
const TARPS = ['#c2185b', '#1f6fb2', '#e0612b', '#2e8b57', '#f2b705', '#7a2b6e', '#b8322b', '#1d7a7a', '#d4581e', '#3a4fa0'];
const goodsMats = {};
const gm = (c, r = 0.75) => (goodsMats[c] ??= std(c, { roughness: r }));
function heap(g, R, cols, n, r, x0, x1, z0, z1, y, shape = 'sphere') {
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0);
    const mid = 1 - Math.abs((x - (x0 + x1) / 2) / ((x1 - x0) / 2 + 1e-3));
    const yy = y + r + R() * r * 2.2 * mid;
    let geo;
    if (shape === 'long') geo = new THREE.CapsuleGeometry(r * 0.5, r * 3, 3, 6).rotateZ(Math.PI / 2 + (R() - 0.5) * 0.4).rotateY(R() * 3);
    else if (shape === 'banana') geo = new THREE.TorusGeometry(r * 2, r * 0.45, 4, 8, Math.PI * 0.7).rotateX(Math.PI / 2).rotateY(R() * 6);
    else geo = new THREE.SphereGeometry(r * (0.8 + R() * 0.4), 8, 6);
    mesh(geo, gm(cols[Math.floor(R() * cols.length)]), x, yy, z, g);
  }
}
function stall(R, kind, tarp) {
  const g = new THREE.Group();
  // bamboo frame and a sagging, colourful tarp
  for (const sx of [-1, 1]) for (const [sz, h] of [[-1.1, 2.4], [0.7, 2.1]]) mesh(cyl(0.04, 0.045, h, 7), M.bamboo, sx * 1.3, h / 2, sz, g);
  const tg = new THREE.PlaneGeometry(3.0, 2.4, 8, 6).rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), z = tp.getZ(i);
    tp.setY(i, -((z + 1.2) / 2.4) * 0.35 - Math.sin(((x + 1.5) / 3) * Math.PI) * Math.sin(((z + 1.2) / 2.4) * Math.PI) * 0.12);
  }
  tg.computeVertexNormals();
  mesh(tg, std(tarp, { side: THREE.DoubleSide, roughness: 0.7 }), 0, 2.42, -0.2, g);
  // low wooden table (takhat) with a cloth
  mesh(box(2.3, 0.07, 1.0), M.plankA, 0, 0.62, -0.1, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(box(0.07, 0.6, 0.07), M.woodDark, sx * 1.05, 0.3, -0.1 + sz * 0.42, g);
  mesh(box(2.34, 0.02, 1.04), M.jute, 0, 0.665, -0.1, g);
  mesh(cyl(0.2, 0.22, 0.3, 10), M.jute, 0, 0.15, -1.0, g); // the vendor's mora stool
  const y = 0.68;
  if (kind === 0) {
    // vegetables in heaps: tomatoes, onions, green chillies & beans, potatoes, cauliflower, pumpkin
    heap(g, R, ['#c8281e', '#d93a22'], 26, 0.045, -1.05, -0.45, -0.5, 0.3, y);
    heap(g, R, ['#8a4a6a', '#a3566e'], 22, 0.045, -0.35, 0.2, -0.5, 0.3, y);
    heap(g, R, ['#3f8a2a', '#5aa03a'], 30, 0.018, 0.3, 0.75, -0.5, 0.3, y, 'long');
    heap(g, R, ['#b08a5a', '#9a7448'], 18, 0.05, 0.8, 1.1, -0.5, 0.3, y);
    for (const x of [-0.8, -0.1, 0.6]) { mesh(new THREE.SphereGeometry(0.13, 10, 8).scale(1, 0.75, 1), gm('#f2ecd8'), x, y + 0.1, 0.42, g); mesh(new THREE.SphereGeometry(0.15, 8, 6, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), gm('#3f6a2a'), x, y + 0.1, 0.42, g); }
    mesh(new THREE.SphereGeometry(0.22, 12, 8).scale(1, 0.75, 1), gm('#d9781e'), 1.4, 0.18, 0.5, g);
  } else if (kind === 1) {
    // fruit: bananas, mangoes, oranges, a watermelon cut open
    heap(g, R, ['#e8c42a', '#d9b41e'], 16, 0.05, -1.05, -0.4, -0.5, 0.3, y, 'banana');
    heap(g, R, ['#e8a21e', '#c8c42a', '#e07a18'], 24, 0.055, -0.3, 0.35, -0.5, 0.3, y);
    heap(g, R, ['#f08a12'], 22, 0.042, 0.45, 1.05, -0.5, 0.3, y);
    for (const x of [-0.7, 0.2]) mesh(new THREE.SphereGeometry(0.16, 12, 10).scale(1, 0.85, 1.2), gm('#2f5a22'), x, y + 0.14, 0.45, g);
    const half = mesh(new THREE.SphereGeometry(0.16, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), gm('#2f5a22'), 0.9, y, 0.45, g);
    half.rotation.x = Math.PI;
    mesh(new THREE.CircleGeometry(0.15, 12).rotateX(-Math.PI / 2), gm('#e03a3a'), 0.9, y + 0.005, 0.45, g);
    // a bunch hanging from the frame
    mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.4, 8), gm('#d9b41e'), -1.1, 1.8, 0.6, g);
  } else if (kind === 2) {
    // clay pots and diyas
    for (let i = 0; i < 7; i++) { const p = pot(0.75 + R() * 0.5); p.position.set(-1.0 + i * 0.33, y, -0.3 + (i % 2) * 0.35); p.castShadow = true; g.add(p); }
    for (let i = 0; i < 4; i++) { const p = pot(1.3 + R() * 0.4); p.position.set(-1.6 + i * 1.05, 0, 0.75); p.castShadow = true; g.add(p); }
    for (let i = 0; i < 14; i++) mesh(lathe([[0, 0], [0.04, 0.0], [0.05, 0.025]], 8), M.terracotta, -0.9 + (i % 7) * 0.28, y + 0.25 + Math.floor(i / 7) * 0.001, 0.25 + Math.floor(i / 7) * 0.1, g);
  } else if (kind === 3) {
    // cloth: folded stacks and sarees hung on a line
    const cols = ['#c2185b', '#f2b705', '#1e6fa8', '#e0612b', '#2e8b57', '#7a2b6e', '#f4efe2'];
    for (let i = 0; i < 6; i++) for (let k = 0; k < 4; k++) mesh(box(0.32, 0.05, 0.28), gm(cols[(i * 3 + k) % cols.length]), -0.95 + i * 0.38, y + 0.03 + k * 0.05, -0.2 + (i % 2) * 0.35, g);
    const line = mesh(cyl(0.008, 0.008, 2.6, 4), M.rope, 0, 2.0, -1.05, g);
    line.rotation.z = Math.PI / 2;
    for (let i = 0; i < 5; i++) {
      const c = mesh(new THREE.PlaneGeometry(0.42, 1.2, 2, 6).translate(0, -0.6, 0), applyClothWave(new THREE.MeshLambertMaterial({ color: cols[i], side: THREE.DoubleSide }), { mode: 0, size: 1.2 }), -1.0 + i * 0.5, 1.99, -1.05, g);
      c.userData.dynamic = true;
    }
  } else {
    // sweets: jalebi, laddoos, barfi on trays, and a glass case
    mesh(cyl(0.3, 0.3, 0.03, 16), M.metal, -0.75, y + 0.02, 0, g);
    for (let i = 0; i < 10; i++) { const j = mesh(new THREE.TorusGeometry(0.06, 0.014, 4, 10), gm('#f08a12', 0.35), -0.75 + (R() - 0.5) * 0.35, y + 0.06 + R() * 0.06, (R() - 0.5) * 0.35, g); j.rotation.set(Math.PI / 2 + (R() - 0.5) * 0.6, 0, R() * 3); }
    mesh(cyl(0.3, 0.3, 0.03, 16), M.metal, 0.05, y + 0.02, 0, g);
    heap(g, R, ['#f2a71e', '#e8b84a'], 26, 0.032, -0.15, 0.25, -0.2, 0.2, y + 0.02);
    for (let i = 0; i < 12; i++) mesh(box(0.08, 0.04, 0.08), gm(i % 2 ? '#f2eadc' : '#9ac86a'), 0.6 + (i % 4) * 0.1, y + 0.02, -0.2 + Math.floor(i / 4) * 0.12, g);
    mesh(box(0.6, 0.35, 0.4), M.glassJar, 0.75, y + 0.18, 0, g);
  }
  return g;
}
function marketFurniture(R) {
  const g = new THREE.Group();
  for (const st of MARKET.stalls) {
    const s = stall(R, st.i % 5, TARPS[st.i % TARPS.length]);
    s.position.set(st.x, heightAt(st.x, st.z), st.z);
    s.rotation.y = st.rot;
    g.add(s);
  }
  return g;
}
function handPump() {
  const g = new THREE.Group();
  const iron = std('#2f6a4a', { metalness: 0.5, roughness: 0.5 });
  mesh(box(2.2, 0.12, 2.2), M.stone, 0, 0.06, 0, g);
  mesh(box(2.3, 0.08, 0.1), M.stoneDark, 0, 0.16, 1.1, g);
  mesh(cyl(0.11, 0.13, 0.9, 12), iron, 0, 0.55, -0.35, g);
  mesh(cyl(0.15, 0.11, 0.18, 12), iron, 0, 1.06, -0.35, g);
  const spout = mesh(cyl(0.04, 0.035, 0.32, 8), iron, 0, 0.82, -0.2, g);
  spout.rotation.x = Math.PI / 2 - 0.3;
  mesh(cyl(0.035, 0.035, 0.08, 8), iron, 0, 1.1, -0.49, g);
  mesh(cyl(0.2, 0.2, 0.25, 12), M.metal, 0, 0.27, 0.05, g); // a bucket under the spout
  return g;
}
function pumpHandle() {
  const g = new THREE.Group();
  const iron = std('#2f6a4a', { metalness: 0.5, roughness: 0.5 });
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 1.0, 8).rotateX(Math.PI / 2).translate(0, 0, -0.5), iron);
  arm.castShadow = true;
  g.add(arm);
  return g;
}
function waterTank() {
  const g = new THREE.Group();
  const conc = std('#b8b2a6');
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = mesh(cyl(0.22, 0.28, 11, 8), conc, sx * 2.1, 5.5, sz * 2.1, g);
    leg.rotation.set(sz * 0.04, 0, -sx * 0.04);
  }
  for (const y of [3.5, 7]) for (const [a, b, rx] of [[0, -2.0, 0], [0, 2.0, 0], [-2.0, 0, 1], [2.0, 0, 1]]) { const beam = mesh(box(4.2, 0.25, 0.25), conc, a, y, b, g); if (rx) beam.rotation.y = Math.PI / 2; }
  mesh(cyl(3.0, 2.6, 3.2, 24), conc, 0, 12.6, 0, g);
  mesh(cyl(3.1, 3.1, 0.3, 24), std('#9a948a'), 0, 14.3, 0, g);
  mesh(new THREE.ConeGeometry(3.1, 0.8, 24), std('#9a948a'), 0, 14.85, 0, g);
  mesh(cyl(3.02, 3.02, 0.5, 24), std('#2f7aa8'), 0, 12.3, 0, g); // painted band
  for (let i = 0; i < 12; i++) mesh(box(0.08, 0.05, 0.4), M.metal, 2.0, 1 + i, 2.2, g);
  return g;
}
function rangoliCanvas(seed) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const R = rng(seed);
  const pal = [['#e8263a', '#f5b818', '#ffffff', '#1fa36a', '#6a3ac8'], ['#f08a12', '#ffffff', '#d81b60', '#29a3d8', '#f5e01a'], ['#ffffff', '#e8263a', '#1f6fd8', '#f5b818', '#2e8b57']][seed % 3];
  const petals = 6 + Math.floor(R() * 6);
  for (let ring = 5; ring >= 1; ring--) {
    const r = ring * 22;
    g.fillStyle = pal[ring % pal.length];
    for (let i = 0; i < petals * (ring > 2 ? 2 : 1); i++) {
      const a = (i / (petals * (ring > 2 ? 2 : 1))) * Math.PI * 2;
      g.beginPath();
      g.ellipse(128 + Math.cos(a) * r * 0.75, 128 + Math.sin(a) * r * 0.75, r * 0.32, r * 0.14, a, 0, 7);
      g.fill();
    }
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.arc(128, 128, r * 0.5, 0, 7); g.stroke();
  }
  g.fillStyle = pal[0]; g.beginPath(); g.arc(128, 128, 12, 0, 7); g.fill();
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128 + Math.cos(a) * 120, 128 + Math.sin(a) * 120, 3, 0, 7); g.fill(); }
  return c;
}
function kolamCanvas() {
  // the white rice-flour kolam: a dot grid looped with continuous curves
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = 4;
  const n = 5, sp = 36, o = 128 - ((n - 1) * sp) / 2;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (Math.abs(i - 2) + Math.abs(j - 2) > 2) continue;
    const x = o + i * sp, y = o + j * sp;
    g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
    g.beginPath(); g.arc(x, y, sp * 0.5, Math.PI * 0.25 * ((i + j) % 4), Math.PI * 0.25 * ((i + j) % 4) + Math.PI * 1.5); g.stroke();
  }
  g.beginPath(); g.arc(128, 128, 112, 0, 7); g.stroke();
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.arc(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112, 10, a + Math.PI * 0.5, a + Math.PI * 1.5); g.stroke(); }
  return c;
}
function cricketKit() {
  const C = CRICKET;
  const g = new THREE.Group();
  const wood = std('#d9c08a');
  for (const end of [-9, 9]) {
    for (const dx of [-0.12, 0, 0.12]) mesh(cyl(0.018, 0.018, 0.72, 6), wood, dx, 0.36, end, g);
    mesh(box(0.28, 0.02, 0.02), wood, 0, 0.73, end, g);
  }
  g.position.set(C.x, heightAt(C.x, C.z), C.z);
  g.rotation.y = C.rot;
  return g;
}


// ---------------- Marudhar: Rajasthani sandstone & Jodhpur-blue houses, the baoli, a chhatri ----------------
function sandCanvas(base, seed) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const Rn = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) { g.fillStyle = Rn() < 0.5 ? `rgba(90,50,20,${Rn() * 0.08})` : `rgba(255,240,210,${Rn() * 0.1})`; g.beginPath(); g.arc(Rn() * 256, Rn() * 256, 2 + Rn() * 18, 0, 7); g.fill(); }
  // stone courses
  g.strokeStyle = 'rgba(80,50,30,0.18)'; g.lineWidth = 1;
  for (let y = 0; y < 256; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); for (let x = (y / 16) % 2 ? 0 : 20; x < 256; x += 40) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); } }
  return c;
}
const rajMats = {};
function rajMaterials() {
  if (rajMats.sand) return rajMats;
  rajMats.sand = std('#ffffff', { map: toTexture(sandCanvas('#d9a066', 3), { repeat: [2, 1] }) });
  rajMats.blue = std('#ffffff', { map: toTexture(sandCanvas('#5b8fd0', 5), { repeat: [2, 1] }) });
  rajMats.trim = std('#f2e6cc'); rajMats.red = std('#b8322b'); rajMats.dark = M.dark;
  rajMats.doors = [std('#2e7a6a'), std('#c0392b'), std('#d4a017'), std('#6a3a8a')];
  rajMats.stone = std('#c99a62'); rajMats.stoneDark = std('#a87a4a');
  return rajMats;
}
function rajHouse(R, blue, storeys) {
  const Mt = rajMaterials();
  const g = new THREE.Group();
  const w = 5.6 + R() * 1.6, d = 4.6 + R() * 1.2, h = 2.9;
  const wall = blue ? Mt.blue : Mt.sand;
  mesh(box(w + 0.6, 0.5, d + 0.6), Mt.stoneDark, 0, 0.05, 0, g);
  mesh(box(w, h, d), wall, 0, 0.3 + h / 2, 0, g);
  let top = 0.3 + h;
  if (storeys > 1) { mesh(box(w * 0.6, 2.5, d * 0.7), wall, -w * 0.18, top + 1.25, -d * 0.12, g); }
  // flat roof slab with a crenellated parapet
  mesh(box(w + 0.15, 0.15, d + 0.15), Mt.trim, 0, top + 0.07, 0, g);
  for (let i = 0; i < Math.floor(w / 0.6); i++) mesh(box(0.32, 0.35, 0.18), wall, -w / 2 + 0.3 + i * 0.6, top + 0.32, d / 2, g);
  for (let i = 0; i < Math.floor(d / 0.6); i++) for (const sx of [-1, 1]) mesh(box(0.18, 0.35, 0.32), wall, sx * w / 2, top + 0.32, -d / 2 + 0.3 + i * 0.6, g);
  if (storeys > 1) mesh(box(w * 0.62, 0.15, d * 0.72), Mt.trim, -w * 0.18, top + 2.55, -d * 0.12, g);
  // arched doorway with a carved frame and a bright door
  mesh(box(1.4, 2.2, 0.08), Mt.trim, 0, 1.4, d / 2 + 0.02, g);
  mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), Mt.trim, 0, 2.5, d / 2 + 0.02, g);
  mesh(box(1.05, 2.0, 0.1), Mt.doors[Math.floor(R() * Mt.doors.length)], 0, 1.3, d / 2 + 0.05, g);
  mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 14, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), Mt.dark, 0, 2.3, d / 2 + 0.05, g);
  // jharokha: a little projecting balcony window with a domed canopy
  for (const sx of [-1, 1]) {
    const x = sx * w * 0.3;
    mesh(box(1.0, 0.12, 0.5), Mt.trim, x, 2.0, d / 2 + 0.25, g);
    mesh(box(0.8, 0.8, 0.06), Mt.dark, x, 2.45, d / 2 + 0.04, g);
    for (const px of [-0.42, 0.42]) mesh(cyl(0.04, 0.04, 0.85, 6), Mt.trim, x + px, 2.48, d / 2 + 0.45, g);
    mesh(new THREE.SphereGeometry(0.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 0.55), Mt.trim, x, 2.92, d / 2 + 0.28, g);
    mesh(box(0.02, 0.1, 0.5), Mt.red, x, 2.0, d / 2 + 0.5, g);
  }
  // painted mandana pattern band and a hanging toran over the door
  mesh(box(w + 0.02, 0.12, d + 0.02), Mt.red, 0, 0.55, 0, g);
  for (let i = -3; i <= 3; i++) mesh(new THREE.ConeGeometry(0.06, 0.16, 4).rotateX(Math.PI), i % 2 ? M.saffron : M.green, i * 0.18, 2.55, d / 2 + 0.1, g);
  return { g, w, d };
}
function baoli() {
  const Mt = rajMaterials();
  const g = new THREE.Group();
  // a square stepwell: concentric terraces stepping down to green water, with a carved rim
  const bottom = -3.6;
  for (let i = 0; i < 7; i++) {
    const outer = 8.2 - i * 1.0, inner = outer - 1.0, top = -i * 0.5, hgt = top - bottom, y = bottom + hgt / 2;
    const m = i % 2 ? Mt.stone : Mt.stoneDark;
    mesh(box(outer, hgt, 0.5), m, 0, y, outer / 2 - 0.25, g);
    mesh(box(outer, hgt, 0.5), m, 0, y, -outer / 2 + 0.25, g);
    mesh(box(0.5, hgt, inner), m, outer / 2 - 0.25, y, 0, g);
    mesh(box(0.5, hgt, inner), m, -outer / 2 + 0.25, y, 0, g);
  }
  const water = mesh(new THREE.PlaneGeometry(1.4, 1.4).rotateX(-Math.PI / 2), M.wellWater, 0, -3.3, 0, g);
  water.receiveShadow = true;
  for (const [x, z, w, d] of [[0, 4.15, 8.6, 0.3], [0, -4.15, 8.6, 0.3], [4.15, 0, 0.3, 8.6], [-4.15, 0, 0.3, 8.6]]) mesh(box(w, 0.6, d), Mt.trim, x, 0.3, z, g);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { mesh(cyl(0.18, 0.2, 1.4, 8), Mt.trim, sx * 4.15, 0.9, sz * 4.15, g); mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), Mt.red, sx * 4.15, 1.6, sz * 4.15, g); }
  return g;
}
function chhatri() {
  const Mt = rajMaterials();
  const g = new THREE.Group();
  mesh(box(3.6, 0.6, 3.6), Mt.stoneDark, 0, 0.3, 0, g);
  mesh(box(3.2, 0.2, 3.2), Mt.stone, 0, 0.7, 0, g);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(cyl(0.14, 0.16, 2.3, 10), Mt.trim, sx * 1.3, 1.95, sz * 1.3, g);
  mesh(box(3.3, 0.3, 3.3), Mt.trim, 0, 3.2, 0, g);
  mesh(new THREE.SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), Mt.sand, 0, 3.35, 0, g);
  mesh(new THREE.ConeGeometry(0.15, 0.6, 8), M.gold, 0, 5.1, 0, g);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), Mt.sand, sx * 1.4, 3.35, sz * 1.4, g);
  return g;
}
function cactus(R) {
  const g = new THREE.Group();
  const pad = std('#5d7f3a', { roughness: 0.8 });
  const n = 3 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const p = mesh(new THREE.SphereGeometry(0.22, 8, 6).scale(0.5, 1, 0.18), pad, (R() - 0.5) * 0.4, 0.22 + R() * 0.4, (R() - 0.5) * 0.3, g);
    p.rotation.set(0, R() * 3, (R() - 0.5) * 0.9);
  }
  mesh(new THREE.SphereGeometry(0.04, 6, 4), std('#d8406a'), 0, 0.68, 0, g);
  return g;
}
function roadBridge(B = RBRIDGE) {
  // an arched concrete road bridge: deck and parapets follow the same smooth curve the wheels ride on,
  // with tall piers in the river and approach piers on the banks
  const g = new THREE.Group();
  g.position.set(B.x, 0, B.z);
  g.rotation.y = B.rot;
  const conc = std('#bdb7ab'), dark = std('#8d877c'), asphalt = std('#5a5652', { roughness: 0.95 }), yellow = std('#e8c23a');
  const N = 44, L = B.L;
  for (let i = 0; i < N; i++) {
    const x0 = -L / 2 + (i * L) / N, x1 = x0 + L / N, xm = (x0 + x1) / 2;
    const y0 = archTop(B, x0), y1 = archTop(B, x1), ym = (y0 + y1) / 2;
    const len = Math.hypot(x1 - x0, y1 - y0) + 0.02, ang = Math.atan2(y1 - y0, x1 - x0);
    const deck = mesh(box(len, 0.55, 5.6), conc, xm, ym - 0.3, 0, g); deck.rotation.z = ang;
    const road = mesh(box(len, 0.04, 4.9), asphalt, xm, ym - 0.02, 0, g); road.rotation.z = ang;
    if (i % 2 === 0) { const ln = mesh(box(len * 0.6, 0.045, 0.12), yellow, xm, ym, 0, g); ln.rotation.z = ang; }
    for (const sz of [-1, 1]) {
      const par = mesh(box(len, 0.75, 0.26), conc, xm, ym + 0.36, sz * 2.85, g); par.rotation.z = ang;
      const cap = mesh(box(len, 0.08, 0.34), dark, xm, ym + 0.76, sz * 2.85, g); cap.rotation.z = ang;
      if (i % 4 === 0) mesh(box(0.32, 0.95, 0.36), M.white, xm, ym + 0.46, sz * 2.85, g);
    }
  }
  // piers: round columns on footings in the river, with a cap beam under the deck
  for (const x of [-RIVER_HALF * 0.66, 0, RIVER_HALF * 0.66, -RIVER_HALF - 6, RIVER_HALF + 6]) {
    const top = archTop(B, x) - 0.6, bottom = WATER_Y - 2.4;
    for (const sz of [-1.4, 1.4]) mesh(cyl(0.42, 0.5, top - bottom, 14), dark, x, (top + bottom) / 2, sz, g);
    mesh(box(1.1, 0.5, 5.4), dark, x, top - 0.05, 0, g);
    mesh(box(1.6, 0.5, 4.4), dark, x, bottom + 0.25, 0, g);
  }
  return g;
}

// ---------------- Banglagram (Bengal) ----------------
// A curved "bangla" roof: a thatch shell whose ridge and eaves both sag in a gentle arc.
function banglaRoof(w, d, rise, mat) {
  const geo = new THREE.PlaneGeometry(w + 1.0, (d + 1.2) / 2 * 1.12, 14, 6);
  const p = geo.attributes.position;
  const out = [];
  for (const side of [-1, 1]) {
    const g = geo.clone();
    const q = g.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const u = q.getX(i) / ((w + 1.0) / 2); // -1..1 along the ridge
      const v = q.getY(i) / ((d + 1.2) / 4) * 0.5 + 0.5; // 0 at eave, 1 at ridge
      const curve = (1 - u * u) * 0.35; // ridge and eave both droop toward the ends
      const y = v * rise + Math.sin(v * Math.PI) * 0.15 + curve * (0.4 + v * 0.3) - (1 - v) * 0.05;
      const z = side * (1 - v) * (d + 1.2) / 2;
      q.setXYZ(i, q.getX(i), y, z);
    }
    g.computeVertexNormals();
    out.push(g);
  }
  void p;
  const m = new THREE.Mesh(mergeGeometries(out), mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}
function bengalHut(R) {
  const g = new THREE.Group();
  const w = 5 + R() * 1.4, d = 4 + R() * 0.8, h = 2.2;
  const mud = std(R() < 0.5 ? '#c8a27a' : '#b98f64');
  mesh(box(w + 0.8, 0.5, d + 0.8), M.plinth, 0, 0.0, 0, g);
  mesh(box(w, h, d), mud, 0, 0.25 + h / 2, 0, g);
  mesh(box(w + 0.02, 0.25, d + 0.02), std('#f1ece0'), 0, 0.4, 0, g); // white-washed base band
  mesh(box(0.9, 1.8, 0.08), M.doors[Math.floor(R() * 4)], 0, 1.15, d / 2 + 0.03, g);
  for (const sx of [-1, 1]) mesh(box(0.6, 0.5, 0.06), M.dark, sx * w * 0.3, 1.6, d / 2 + 0.03, g);
  // alpana: white rice-paste motifs by the door
  for (let i = 0; i < 6; i++) mesh(new THREE.CircleGeometry(0.06, 8), std('#f8f4ea'), (i - 2.5) * 0.2, 0.6 + (i % 2) * 0.12, d / 2 + 0.06, g).rotation.y = 0;
  const roof = banglaRoof(w, d, 1.7, M.thatch);
  roof.position.y = 0.25 + h - 0.1;
  g.add(roof);
  // gable ends filled with thatch
  for (const sx of [-1, 1]) {
    const tri = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.3, 0), new THREE.Vector2(d / 2 + 0.3, 0), new THREE.Vector2(0, 1.65)]);
    const gm = mesh(new THREE.ShapeGeometry(tri), M.thatch, sx * (w / 2 + 0.02), 0.25 + h - 0.1, 0, g);
    gm.rotation.y = Math.PI / 2;
  }
  // a little bamboo fence and a drying rack of fish nets
  return { g, w, d };
}
function terracottaTemple() {
  // a Bishnupur-style char-chala temple: square terracotta shrine, curved four-sided roof, a pinnacle
  const g = new THREE.Group();
  const tc = std('#b4552e', { roughness: 0.85 }), tcDark = std('#8a3f22', { roughness: 0.9 });
  mesh(box(5.4, 0.8, 5.4), tcDark, 0, 0.4, 0, g);
  mesh(box(4.4, 2.8, 4.4), tc, 0, 2.2, 0, g);
  // relief panels: rows of small tiles
  for (let r = 0; r < 4; r++) for (let i = -3; i <= 3; i++) mesh(box(0.42, 0.42, 0.06), r % 2 ? tcDark : tc, i * 0.55, 1.3 + r * 0.55, 2.22, g);
  for (const x of [-1.2, 0, 1.2]) { mesh(box(0.8, 1.6, 0.12), M.dark, x, 1.6, 2.24, g); mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.12, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), M.dark, x, 2.4, 2.24, g); }
  const roof = mesh(new THREE.SphereGeometry(3.2, 4, 6, Math.PI / 4, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1), tc, 0, 3.6, 0, g);
  roof.rotation.y = 0;
  mesh(cyl(0.5, 0.7, 0.8, 4), tcDark, 0, 5.6, 0, g).rotation.y = Math.PI / 4;
  mesh(new THREE.SphereGeometry(0.4, 10, 8), tc, 0, 6.2, 0, g);
  mesh(new THREE.ConeGeometry(0.12, 0.6, 8), M.gold, 0, 6.8, 0, g);
  return g;
}
function pukur() {
  // the village pond: still green water, stone steps down one side, lotus pads
  const P = BV.pond;
  const g = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(P.r + 0.6, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2f5a48', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 }));
  water.position.y = -0.55;
  water.receiveShadow = true;
  g.add(water);
  for (let i = 0; i < 5; i++) mesh(box(3.2, 0.25, 0.7), M.stone, 0, -0.1 - i * 0.18, -P.r + 0.2 + i * 0.55, g);
  const pad = std('#3f7a3a', { roughness: 0.6 }), lotus = std('#f2a7c4', { roughness: 0.5 });
  for (let i = 0; i < 22; i++) {
    const a = i * 2.39, r = 2 + (i % 7) * 0.9;
    const p = mesh(new THREE.CircleGeometry(0.35 + (i % 3) * 0.1, 12, 0.3, Math.PI * 1.85).rotateX(-Math.PI / 2), pad, Math.cos(a) * r, -0.53, Math.sin(a) * r, g);
    p.rotation.y = a;
    if (i % 3 === 0) mesh(new THREE.ConeGeometry(0.12, 0.2, 8, 1, true), lotus, Math.cos(a) * r, -0.42, Math.sin(a) * r, g);
  }
  return g;
}
function bananaPlant(R) {
  const g = new THREE.Group();
  const stem = std('#6a8a3a'), leaf = std('#5a9a3a', { side: THREE.DoubleSide, roughness: 0.6 });
  mesh(cyl(0.1, 0.14, 2.2, 8), stem, 0, 1.1, 0, g);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + R();
    const lg = new THREE.PlaneGeometry(0.5, 1.6, 1, 4).translate(0, 0.8, 0);
    const p = lg.attributes.position;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / 1.6; p.setZ(k, -t * t * 0.7); }
    lg.computeVertexNormals();
    const l = mesh(lg, leaf, 0, 2.1, 0, g);
    l.rotation.set(-0.5, a, 0, 'YXZ');
  }
  return g;
}
// ---------------- Thennoor (Tamil Nadu) ----------------
function tamilHouse(R) {
  const g = new THREE.Group();
  const w = 6.2, d = 5 + R() * 0.6, h = 2.6;
  const walls = std(['#f1e8d2', '#f2dca6', '#e8c8b0', '#d8e6d2'][Math.floor(R() * 4)]);
  mesh(box(w + 0.4, 0.4, d + 0.4), M.plinth, 0, 0.0, 0, g);
  mesh(box(w, h, d), walls, 0, 0.2 + h / 2, -0.4, g);
  mesh(box(w + 0.02, 0.35, d + 0.02), std('#9a3a22'), 0, 0.37, -0.4, g); // the red-and-white striped base (kaavi)
  // the thinnai: a raised platform along the front with wooden pillars, under the tiled roof's overhang
  mesh(box(w, 0.6, 1.4), std('#c8b8a0'), 0, 0.3, d / 2 + 0.3, g);
  for (const x of [-w / 2 + 0.3, -w / 6, w / 6, w / 2 - 0.3]) mesh(cyl(0.1, 0.12, 2.2, 10), M.woodDark, x, 1.7, d / 2 + 0.85, g);
  mesh(box(1.0, 2.0, 0.08), std('#5a3a1e'), 0, 1.6, d / 2 - 0.37, g);
  for (const sx of [-1, 1]) mesh(box(0.7, 0.7, 0.06), M.dark, sx * w * 0.32, 1.7, d / 2 - 0.37, g);
  // sloping Mangalore-tile roof, front and back
  const roofH = 1.5;
  for (const sz of [-1, 1]) {
    const L = Math.hypot(d / 2 + 1.2, roofH);
    const r = mesh(box(w + 0.8, 0.12, L), M.tile, 0, 0.2 + h + roofH / 2, sz * (d / 2 + 1.2) / 2 - 0.1, g);
    r.rotation.x = sz * Math.atan2(roofH, d / 2 + 1.2);
  }
  mesh(box(w + 0.9, 0.16, 0.25), M.terracotta, 0, 0.2 + h + roofH, -0.1, g);
  return { g, w, d };
}
function gopuram() {
  // a Dravidian temple: the shrine and, at the gate, a tall tapering tower of colourful sculpted tiers
  const g = new THREE.Group();
  const cols = ['#e8c24a', '#d8503a', '#3a8ac8', '#4aa86a', '#e88ab8', '#f2ead0'];
  mesh(box(7, 0.5, 7), M.stone, 0, 0.25, 0, g);
  mesh(box(5, 3, 5), M.white, 0, 2.0, 0, g);
  mesh(box(1.4, 2.4, 0.1), M.dark, -2.5, 1.7, 0, g).rotation.y = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    const s = 5.2 - i * 0.5, ds = 3.6 - i * 0.34;
    mesh(box(ds, 0.75, s), std(cols[i % cols.length]), 0, 3.85 + i * 0.75, 0, g);
    // tiny figures and niches along each tier
    for (let k = -2; k <= 2; k++) mesh(box(0.08, 0.4, 0.3), std(cols[(i + k + 6) % cols.length]), -ds / 2 - 0.03, 3.85 + i * 0.75, k * s * 0.18, g);
  }
  // the barrel-vaulted crown with kalasam finials
  mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 14, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), std('#e8c24a'), 0, 9.9, 0, g).rotation.y = Math.PI / 2;
  for (const z of [-0.8, 0, 0.8]) mesh(new THREE.ConeGeometry(0.12, 0.5, 8), M.gold, 0, 10.9, z, g);
  // a flagstaff (kodimaram)
  mesh(cyl(0.08, 0.12, 6, 8), M.gold, -5, 3, 0, g);
  return g;
}
function ayyanarHorse() {
  // the village guardian's huge terracotta horse, painted and garlanded
  const g = new THREE.Group();
  const tc = std('#c8642e', { roughness: 0.8 }), paint = std('#f2ead0'), red = std('#c4241c');
  mesh(box(1.2, 0.8, 1.2), M.stone, 0, 0.4, 0, g);
  mesh(new THREE.SphereGeometry(1, 16, 12).scale(0.45, 0.5, 1.0), tc, 0, 2.0, 0, g);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(cyl(0.12, 0.1, 1.2, 8), tc, sx * 0.22, 1.2, sz * 0.6, g);
  const neck = mesh(cyl(0.22, 0.35, 1.3, 10), tc, 0, 2.8, 0.7, g); neck.rotation.x = 0.5;
  const head = mesh(new THREE.SphereGeometry(1, 12, 10).scale(0.22, 0.25, 0.55), tc, 0, 3.4, 1.15, g); head.rotation.x = 0.6;
  for (const sx of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(0.08, 0.3, 6), tc, sx * 0.12, 3.75, 0.95, g); e.rotation.x = -0.3; }
  mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 16).rotateX(Math.PI / 2 - 0.5), red, 0, 2.6, 0.55, g); // garland
  mesh(box(0.5, 0.06, 1.0), paint, 0, 2.5, -0.1, g);
  mesh(box(0.52, 0.04, 1.02), red, 0, 2.53, -0.1, g);
  return g;
}


// ---------------- Vitthalwadi (Maharashtra) ----------------
function mahaHouse(R) {
  const g = new THREE.Group();
  const w = 6 + R() * 1.2, d = 5, h = 2.6;
  const basalt = std('#5a5652', { roughness: 0.95 }), lime = std(['#f1ead8', '#e8d6b8', '#d8e4ee'][Math.floor(R() * 3)]);
  mesh(box(w + 0.5, 0.6, d + 0.5), basalt, 0, 0.05, 0, g); // the black basalt plinth
  mesh(box(w, 1.0, d), basalt, 0, 0.85, 0, g); // stone lower walls
  for (let i = 0; i < 18; i++) mesh(box(0.5 + R() * 0.4, 0.28, 0.04), std('#6a6662'), -w / 2 + 0.4 + R() * (w - 0.8), 0.45 + R() * 0.8, d / 2 + 0.01, g);
  mesh(box(w, h - 1.0, d), lime, 0, 1.35 + (h - 1.0) / 2, 0, g); // lime-washed upper
  mesh(box(1.0, 2.0, 0.08), std('#6a3a1e'), 0, 1.35, d / 2 + 0.03, g);
  mesh(box(1.2, 0.12, 0.1), M.saffron, 0, 2.42, d / 2 + 0.05, g); // a toran ledge
  for (const sx of [-1, 1]) { mesh(box(0.8, 0.7, 0.06), M.dark, sx * w * 0.3, 1.9, d / 2 + 0.03, g); mesh(box(0.9, 0.08, 0.1), M.woodDark, sx * w * 0.3, 2.28, d / 2 + 0.05, g); }
  // a low hipped roof of country tiles (kaul)
  const roofH = 1.3;
  for (const sz of [-1, 1]) {
    const L = Math.hypot(d / 2 + 0.7, roofH);
    const r = mesh(box(w + 1.0, 0.12, L), M.tile, 0, 0.3 + h + roofH / 2, sz * (d / 2 + 0.7) / 2, g);
    r.rotation.x = sz * Math.atan2(roofH, d / 2 + 0.7);
  }
  for (const sx of [-1, 1]) {
    const tri = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.5, 0), new THREE.Vector2(d / 2 + 0.5, 0), new THREE.Vector2(0, roofH)]);
    mesh(new THREE.ShapeGeometry(tri), M.tile, sx * (w / 2 + 0.3), 0.3 + h, 0, g).rotation.y = sx * Math.PI / 2;
  }
  // a tulsi vrindavan in front
  mesh(box(0.5, 0.8, 0.5), M.lime, 1.8, 0.4, d / 2 + 1.6, g);
  mesh(new THREE.IcosahedronGeometry(0.25, 1), M.leaf, 1.8, 1.0, d / 2 + 1.6, g);
  return { g, w, d };
}
function vitthalTemple() {
  const g = new THREE.Group();
  const stone = std('#6a6460', { roughness: 0.9 }), saffron = M.saffron;
  mesh(box(6, 0.6, 6), stone, 0, 0.3, 0, g);
  mesh(box(4.4, 3, 4.4), std('#f2ead8'), 0, 2.1, 0, g);
  mesh(box(1.2, 2.2, 0.1), M.dark, 0, 1.7, 2.22, g);
  // a curvilinear shikhara in white and saffron, a flag
  for (let i = 0; i < 6; i++) mesh(cyl(1.9 - i * 0.3, 2.1 - i * 0.3, 0.6, 8), i % 2 ? saffron : M.white, 0, 3.9 + i * 0.6, 0, g);
  mesh(new THREE.SphereGeometry(0.4, 10, 8), M.gold, 0, 7.6, 0, g);
  mesh(cyl(0.025, 0.025, 2, 6), M.wood, 0.3, 8.4, 0, g);
  const flag = mesh(new THREE.PlaneGeometry(0.9, 0.55, 8, 3).translate(0.45, 0, 0), applyClothWave(new THREE.MeshLambertMaterial({ color: '#f07a1e', side: THREE.DoubleSide }), { mode: 1, size: 0.9 }), 0.32, 9.1, 0, g);
  flag.userData.dynamic = true;
  return g;
}
function deepmala() {
  // the lamp tower: a stone pillar studded with little brackets for oil lamps, lit at dusk
  const g = new THREE.Group();
  const stone = std('#4e4a46', { roughness: 0.9 });
  mesh(box(1.4, 0.5, 1.4), stone, 0, 0.25, 0, g);
  mesh(cyl(0.35, 0.5, 6, 10), stone, 0, 3.4, 0, g);
  for (let r = 0; r < 10; r++) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r * 0.4, rad = 0.52 - r * 0.015;
    mesh(box(0.18, 0.08, 0.14), stone, Math.cos(a) * rad, 0.9 + r * 0.55, Math.sin(a) * rad, g).rotation.y = -a;
    mesh(new THREE.SphereGeometry(0.045, 6, 4), M.dark, Math.cos(a) * (rad + 0.08), 0.98 + r * 0.55, Math.sin(a) * (rad + 0.08), g);
  }
  mesh(new THREE.ConeGeometry(0.45, 0.8, 10), stone, 0, 6.8, 0, g);
  return g;
}
function wada() {
  // a courtyard house: four wings round an open chowk with a tulsi and a well
  const g = new THREE.Group();
  const lime = std('#ecdcc0'), wood = M.wood;
  const wing = (lx, lz, w, d) => {
    mesh(box(w, 3, d), lime, lx, 1.8, lz, g);
    mesh(box(w + 0.4, 0.15, d + 0.4), M.tile, lx, 3.35, lz, g);
  };
  wing(0, -4.4, 12, 1.6); wing(-5.6, 0, 1.6, 7.2); wing(5.6, 0, 1.6, 7.2); wing(-3.5, 4.4, 5, 1.6); wing(3.5, 4.4, 5, 1.6);
  mesh(box(12.6, 0.3, 10), std('#7a6a5a'), 0, 0.15, 0, g);
  for (let i = -2; i <= 2; i++) mesh(cyl(0.12, 0.14, 2.8, 10), wood, i * 2.0, 1.7, -3.3, g);
  mesh(box(2.0, 2.6, 0.2), std('#5a3a1e'), 0, 1.6, 4.45, g); // the big wooden gate
  for (let i = 0; i < 8; i++) mesh(new THREE.SphereGeometry(0.05, 6, 4), M.gold, -0.7 + (i % 4) * 0.47, 1.0 + Math.floor(i / 4) * 1.2, 4.57, g);
  mesh(box(0.6, 0.8, 0.6), M.lime, 0, 0.7, 0, g);
  mesh(new THREE.IcosahedronGeometry(0.28, 1), M.leaf, 0, 1.25, 0, g);
  return g;
}
// ---------------- the North-East: chang ghar stilt houses, bamboo, tea ----------------
function stiltHouse(R) {
  const g = new THREE.Group();
  const bamboo = M.bamboo, mat = std('#b89a62', { roughness: 0.95 }), dark = std('#6a5230');
  const w = 5.2, d = 4.2, floor = 1.5;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) mesh(cyl(0.07, 0.08, floor + 0.2, 6), dark, -w / 2 + 0.2 + i * (w - 0.4) / 3, (floor + 0.2) / 2 - 0.1, -d / 2 + 0.2 + j * (d - 0.4) / 2, g);
  mesh(box(w + 1.2, 0.12, d + 0.4), bamboo, 0.6, floor, 0, g); // floor, with a front sitting platform
  // woven bamboo walls (a jute weave reads well) and a steep thatched roof with long eaves
  mesh(box(w, 2.0, d), mat, 0, floor + 1.06, 0, g);
  for (let i = 0; i < 8; i++) mesh(box(0.04, 2.0, 0.04), dark, -w / 2 + i * w / 7, floor + 1.06, d / 2 + 0.02, g);
  mesh(box(0.8, 1.6, 0.06), dark, 0.4, floor + 0.86, d / 2 + 0.04, g);
  for (const sz of [-1, 1]) {
    const L = Math.hypot(d / 2 + 1.0, 2.0);
    const r = mesh(box(w + 1.4, 0.18, L), M.thatch, 0, floor + 2.06 + 1.0, sz * (d / 2 + 1.0) / 2, g);
    r.rotation.x = sz * Math.atan2(2.0, d / 2 + 1.0);
  }
  for (const sx of [-1, 1]) {
    const tri = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.7, 0), new THREE.Vector2(d / 2 + 0.7, 0), new THREE.Vector2(0, 2.0)]);
    mesh(new THREE.ShapeGeometry(tri), M.thatch, sx * (w / 2 + 0.55), floor + 2.06, 0, g).rotation.y = sx * Math.PI / 2;
  }
  // a bamboo ladder up to the platform
  for (const sx of [-1, 1]) { const rail = mesh(cyl(0.035, 0.035, 2.0, 5), bamboo, w / 2 + 0.9 + sx * 0.22, 0.75, d / 2 + 0.4, g); rail.rotation.x = 0.5; }
  for (let i = 0; i < 5; i++) mesh(cyl(0.025, 0.025, 0.46, 5).rotateZ(Math.PI / 2), bamboo, w / 2 + 0.9, 0.15 + i * 0.3, d / 2 + 0.85 - i * 0.16, g);
  void R;
  return { g, w, d, floor };
}
function bambooClump(R) {
  const g = new THREE.Group();
  const cane = std('#8aa04a', { roughness: 0.6 }), leaf = std('#5a8a32', { roughness: 0.7 });
  for (let i = 0; i < 9; i++) {
    const h = 6 + R() * 4, a = R() * 6.28, r = R() * 0.7;
    const c = mesh(cyl(0.05, 0.07, h, 6), cane, Math.cos(a) * r, h / 2, Math.sin(a) * r, g);
    c.rotation.set((R() - 0.5) * 0.25, 0, (R() - 0.5) * 0.25);
    for (let k = 0; k < 3; k++) mesh(new THREE.IcosahedronGeometry(0.7 + R() * 0.4, 0).scale(1, 0.5, 1), leaf, Math.cos(a) * r + (R() - 0.5), h * (0.6 + k * 0.15), Math.sin(a) * r + (R() - 0.5), g);
  }
  return g;
}
function teaGarden() {
  // neat hedges of tea bushes in contour rows, with a few tall shade trees
  const T = NE.tea;
  const geo = new THREE.SphereGeometry(1, 10, 6).scale(0.55, 0.45, 0.6);
  const items = [];
  for (let z = T.z0 + 1; z < T.z1 - 1; z += 1.6) for (let x = T.x0 + 1; x < T.x1 - 1; x += 1.0) items.push({ x: x + Math.sin(z) * 0.2, z });
  const im = new THREE.InstancedMesh(geo, std('#5f9a3e', { roughness: 0.75 }), items.length);
  const d = new THREE.Object3D();
  items.forEach((it, i) => { d.position.set(it.x, heightAt(it.x, it.z) + 0.35, it.z); d.rotation.y = it.x; d.scale.set(1, 0.9 + Math.sin(it.x * 3) * 0.1, 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.castShadow = im.receiveShadow = true;
  im.computeBoundingSphere();
  im.userData.dynamic = true;
  return im;
}


// ---------------- road signs: green arrow boards at every junction, welcome boards at each village ----------------
function signCanvasFor(hi, en, km, warn = false, flip = false) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 112;
  const g = c.getContext('2d');
  g.save();
  if (flip) { g.translate(512, 0); g.scale(-1, 1); }
  g.fillStyle = warn ? '#e8b51a' : '#11683a';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(450, 0); g.lineTo(512, 56); g.lineTo(450, 112); g.lineTo(0, 112); g.closePath(); g.fill();
  g.strokeStyle = warn ? '#1a1a1a' : '#ffffff'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(8, 8); g.lineTo(446, 8); g.lineTo(500, 56); g.lineTo(446, 104); g.lineTo(8, 104); g.closePath(); g.stroke();
  g.restore();
  g.fillStyle = warn ? '#1a1a1a' : '#ffffff';
  g.textBaseline = 'middle';
  const x0 = flip ? 90 : 24;
  g.textAlign = 'left';
  g.font = 'bold 34px "Tiro Devanagari Hindi", "Kohinoor Devanagari", "Devanagari Sangam MN", sans-serif';
  g.fillText(hi, x0, 36);
  g.font = 'bold 28px Inter, Arial, sans-serif';
  g.fillText(en, x0, 80);
  if (km) {
    g.textAlign = 'right';
    g.font = 'bold 34px Inter, Arial, sans-serif';
    g.fillText(km, flip ? 496 : 432, 58);
  }
  return c;
}
const signTexCache = new Map();
function signMats(hi, en, km, warn) {
  const k = hi + en + km + warn;
  if (!signTexCache.has(k)) signTexCache.set(k, [false, true].map((f) => new THREE.MeshStandardMaterial({ map: toTexture(signCanvasFor(hi, en, km, warn, f)), roughness: 0.55 })));
  return signTexCache.get(k);
}
const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); return L; };
const P2 = (x, z) => ({ x, z });
function signPost(x, z, entries) {
  // entries: { hi, en, path: [points…] (first = the sign), warn } — each board points toward path[1]
  const g = new THREE.Group();
  const y0 = heightAt(x, z);
  g.position.set(x, y0, z);
  const pole = std('#d8d4cc', { metalness: 0.4, roughness: 0.4 });
  mesh(cyl(0.06, 0.07, 1.2 + entries.length * 0.55, 8), pole, 0, (1.2 + entries.length * 0.55) / 2, 0, g);
  // the pole is striped black-and-white at the bottom, like a real one
  for (let i = 0; i < 3; i++) mesh(cyl(0.075, 0.075, 0.18, 8), M.dark, 0, 0.18 + i * 0.36, 0, g);
  entries.forEach((e, i) => {
    // aim down the road: at the first point a good way along it, not the one right beside the pole
    const next = e.path.find((q, k) => k > 0 && Math.hypot(q.x - x, q.z - z) > 14) || e.path[e.path.length - 1];
    const dx = next.x - x, dz = next.z - z, l = Math.hypot(dx, dz) || 1;
    const km = e.warn ? '' : `${(pathLen(e.path) / 1000).toFixed(1)} km`;
    const [front, back] = signMats(e.hi, e.en, km, e.warn);
    const holder = new THREE.Group();
    holder.position.y = 1.2 + i * 0.55 + 0.25;
    holder.rotation.y = Math.atan2(-dz / l, dx / l);
    g.add(holder);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.46), front);
    f.position.set(1.05, 0, 0.012);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.46), back);
    b.position.set(1.05, 0, -0.012); b.rotation.y = Math.PI;
    for (const m of [f, b]) { m.castShadow = true; holder.add(m); }
    mesh(new THREE.BoxGeometry(2.1, 0.46, 0.02), M.dark, 1.05, 0, 0, holder);
  });
  colliders.push({ kind: 'c', x, z, r: 0.12 });
  return g;
}
function welcomeBoard(x, z, rot, hi, en) {
  const g = new THREE.Group();
  g.position.set(x, heightAt(x, z), z);
  g.rotation.y = rot;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const x2 = c.getContext('2d');
  x2.fillStyle = '#f2e6c8'; x2.fillRect(0, 0, 512, 160);
  x2.strokeStyle = '#b8322b'; x2.lineWidth = 10; x2.strokeRect(8, 8, 496, 144);
  x2.fillStyle = '#b8322b'; x2.textAlign = 'center'; x2.textBaseline = 'middle';
  x2.font = 'bold 26px Inter, Arial, sans-serif'; x2.fillText('स्वागत है  ·  WELCOME TO', 256, 38);
  x2.font = 'bold 46px "Tiro Devanagari Hindi", "Kohinoor Devanagari", sans-serif'; x2.fillText(hi, 256, 88);
  x2.font = 'bold 26px Georgia, serif'; x2.fillStyle = '#5a2a1a'; x2.fillText(en, 256, 130);
  const tex = toTexture(c);
  for (const sx of [-1, 1]) mesh(cyl(0.08, 0.09, 2.6, 8), M.woodDark, sx * 1.3, 1.3, 0, g);
  const front = mesh(new THREE.PlaneGeometry(2.6, 0.82), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), 0, 2.05, 0.03, g);
  const back = mesh(new THREE.PlaneGeometry(2.6, 0.82), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), 0, 2.05, -0.03, g);
  back.rotation.y = Math.PI;
  void front;
  mesh(box(2.7, 0.92, 0.04), M.woodDark, 0, 2.05, 0, g);
  for (const sx of [-1, 1]) colliders.push({ kind: 'c', ...localToWorld({ x, z, rot }, sx * 1.3, 0), r: 0.12 });
  return g;
}
function roadSigns() {
  const g = new THREE.Group();
  const [B1, B2, B3] = BRIDGES;
  const main = (z0, z1) => { const o = []; const st = Math.sign(z1 - z0) * 8; for (let z = z0; st > 0 ? z <= z1 : z >= z1; z += st) o.push(P2(roadX(z), z)); return o; };
  const p = (arr) => arr.map(([x, z]) => P2(x, z));
  // each village's road, from the main-road junction onward
  const toNV = p([[roadX(178) - 2, 178], [NV.x + 12, NV.z]]);
  const toRV = p([[roadX(150) + 2, 150], [40, 152], [B1.w.x, B1.w.z], [B1.e.x, B1.e.z], [150, 158], [210, 145], [292, 167], [RV.x - 16, RV.z]]);
  const toEH = p([[roadX(150) + 2, 150], [40, 152], [B1.w.x, B1.w.z], [B1.e.x, B1.e.z], [150, 156], [142, 120], [EH.x + 4, EH.z + 8]]);
  const toTV = p([[roadX(250) + 2, 250], [33, 310], [B3.w.x, B3.w.z], [B3.e.x, B3.e.z], [138, 357], [198, 408], [TV.x - 16, TV.z]]);
  const toBV = p([[roadX(-150) + 2, -150], [20, -175], [B2.w.x, B2.w.z], [B2.e.x, B2.e.z], [130, -228], [206, -267], [BV.x - 16, BV.z]]);
  const toNE = [...toBV, ...p([[BV.x + 4, BV.z - 14], [306, -392], [304, -536], [NE.x, NE.z + 16]])];
  const westRing = p([[roadX(-62) - 2, -62], [-60, -64], [-130, -80], [-222, -60], [-238, 10]]);
  const toMH = [...westRing, ...p([[-333, 0], [-457, -36], [-551, -69], [MH.x + 16, MH.z]])];
  const toHill = main(-150, HILLTOP.z);
  const V = {
    NV: ['छोटा गाँव', 'Chhota Gaon'], RV: ['मारुधर', 'Marudhar'], EH: ['पार गाँव', 'Paar Gaon'], TV: ['तेन्नूर', 'Thennoor'], BV: ['बांग्लाग्राम', 'Banglagram'],
    NE: ['बाँस पहाड़ी', 'Bamboo Hill'], MH: ['विट्ठलवाड़ी', 'Vitthalwadi'], G: ['गाँव', 'Gaon'], HILL: ['पहाड़ी मंदिर', 'Hilltop shrine'],
    NP: ['नूरपुर', 'Noorpur'], MP: ['मरियापुर', 'Mariapur'], PG: ['पहाड़ी गाँव', 'Pahadi Gaon'], PEAK: ['शिखर मंदिर', 'Shikhar summit'],
  };
  const E = (key, path, extra = {}) => ({ hi: V[key][0], en: V[key][1], path, ...extra });
  const signs = [];
  const add = (x, z, entries) => signs.push([x, z, entries.map((e) => ({ ...e, path: [P2(x, z), ...e.path] }))]);
  // the village centre: everything, with the road you'd take
  add(roadX(36) + 3.2, 36, [E('NV', [...main(36, 178), ...toNV]), E('RV', [...main(36, 150), ...toRV]), E('TV', [...main(36, 250), ...toTV]), E('BV', [...main(36, -150), ...toBV]), E('MH', [...main(36, -62), ...toMH])]);
  add(roadX(-58) + 3.2, -58, [E('MH', toMH), E('BV', [...main(-62, -150), ...toBV]), E('NE', [...main(-62, -150), ...toNE]), E('G', main(-62, 10))]);
  add(roadX(-146) + 3.2, -146, [E('BV', toBV), E('NE', toNE), E('HILL', toHill), E('G', main(-150, 10))]);
  add(roadX(146) + 3.2, 146, [E('RV', toRV), E('EH', toEH), E('NV', [...main(150, 178), ...toNV]), E('TV', [...main(150, 250), ...toTV]), E('G', main(150, 10))]);
  add(roadX(182) - 3.2, 182, [E('NV', toNV), E('MH', [...toNV, ...p([[NV.x - 14, NV.z - 2], [-206, 160], [-232, 95], [-238, 10], [-333, 0], [-457, -36], [-551, -69], [MH.x + 16, MH.z]])]), E('TV', [...main(178, 250), ...toTV]), E('G', main(178, 10))]);
  add(roadX(246) + 3.2, 246, [E('TV', toTV), E('G', main(250, 10))]);
  add(B1.e.x + 6, B1.e.z + 4, [E('RV', p([[150, 158], [210, 145], [292, 167], [RV.x - 16, RV.z]])), E('EH', p([[150, 156], [142, 120], [EH.x + 4, EH.z + 8]])), E('G', [...[...toRV].reverse().slice(4), ...main(150, 10)])]);
  add(RV.x - 20, RV.z + 3, [E('BV', p([[RV.x - 6, RV.z - 16], [303, -168], [BV.x + 14, BV.z + 6]])), E('TV', p([[RV.x - 6, RV.z + 16], [310, 310], [TV.x + 28, TV.z + 8], [TV.x + 12, TV.z]])), E('G', [...toRV].reverse())]);
  add(BV.x + 7, BV.z - 17, [E('NE', p([[306, -392], [304, -536], [NE.x, NE.z + 16]])), E('RV', p([[BV.x + 14, BV.z + 6], [303, -168], [RV.x - 6, RV.z - 16]])), E('G', [...toBV].reverse())]);
  add(TV.x - 20, TV.z + 3, [E('RV', p([[TV.x + 12, TV.z], [TV.x + 28, TV.z + 8], [310, 310], [RV.x - 6, RV.z + 16]])), E('G', [...toTV].reverse())]);
  add(NV.x - 17, NV.z + 2, [E('MH', p([[-206, 160], [-232, 95], [-238, 10], [-333, 0], [-457, -36], [-551, -69], [MH.x + 16, MH.z]])), E('G', [...toNV].reverse())]);
  add(-238 + 3, 13, [E('MH', p([[-333, 0], [-457, -36], [-551, -69], [MH.x + 16, MH.z]])), E('NV', p([[-232, 95], [-206, 160], [NV.x - 14, NV.z - 2]])), E('G', [...westRing].reverse())]);
  const toMP = p([[roadX(warpR(470)) - 2, warpR(470)], [-155, 647], [-305, 723], [MP.x + 18, MP.z]]);
  const toPG = [...main(warpR(470), warpR(540)), ...p([[-18, 724], [PG.x + 14, PG.z]])];
  add(roadX(warpR(462)) + 3.2, warpR(462), [E('MP', toMP), E('PG', toPG), E('G', main(warpR(462), 10))]);
  add(RV.x + 27, RV.z, [E('NP', p([[RV.x + 14, RV.z + 10], [494, 158], [599, 115], [705, 39], [NP.x - 18, NP.z]])), E('RV', p([[RV.x + 6, RV.z], [RV.x, RV.z]]))]);
  add(HILLTOP.x + 5, HILLTOP.z - 9, [E('PEAK', STAIRS.pts.map((q) => P2(q.x, q.z)))]);
  add(roadX(HILLTOP.z + 8) + 3.2, HILLTOP.z + 8, [E('PEAK', [P2(HILLTOP.x, HILLTOP.z), ...STAIRS.pts.map((q) => P2(q.x, q.z))]), E('G', main(HILLTOP.z + 8, 10))]);
  // warnings on the wild tracks
  add(CROSSING.x - 9, CROSSING.z - 12, [{ hi: '⚠ बाघ क्षेत्र', en: 'Tiger country', path: p([[-90, -170]]), warn: true }]);
  add(RV.x + 18, RV.z + 14, [{ hi: '⚠ भेड़िये', en: 'Wolf hills', path: p([[400, 255]]), warn: true }]);
  for (const [x, z, entries] of signs) g.add(signPost(x, z, entries));
  // welcome boards at each village's entrance, facing the road in
  const welcome = (x, z, toward, key) => g.add(welcomeBoard(x, z, Math.atan2(toward.x - x, toward.z - z), ...V[key]));
  welcome(NV.x + 18, NV.z - 4, P2(NV.x + 30, NV.z), 'NV');
  welcome(RV.x - 28, RV.z - 4, P2(RV.x - 40, RV.z), 'RV');
  welcome(BV.x - 26, BV.z + 4, P2(BV.x - 40, BV.z), 'BV');
  welcome(TV.x - 28, TV.z + 4, P2(TV.x - 40, TV.z), 'TV');
  welcome(MH.x + 27, MH.z + 4, P2(MH.x + 40, MH.z), 'MH');
  welcome(NE.x + 4, NE.z + 26, P2(NE.x, NE.z + 40), 'NE');
  welcome(EH.x + 9, EH.z + 16, P2(142, 120), 'EH');
  welcome(roadX(-104) + 4, -104, P2(roadX(-120), -120), 'G');
  welcome(NP.x - 27, NP.z + 4, P2(NP.x - 40, NP.z), 'NP');
  welcome(MP.x + 27, MP.z - 4, P2(MP.x + 40, MP.z), 'MP');
  welcome(PG.x + 27, PG.z - 4, P2(PG.x + 40, PG.z), 'PG');
  return g;
}


// ---------------- Pahadi Gaon: kath-kuni houses, a pagoda temple, apple trees; and the rocky hills ----------------
function pahadiHouse(R) {
  const g = new THREE.Group();
  const w = 5.4, d = 4.6;
  const stone = std('#8a847a', { roughness: 0.95 }), timber = std('#6a4428', { roughness: 0.8 }), slate = std('#5a5f66', { roughness: 0.7 });
  mesh(box(w + 0.5, 0.6, d + 0.5), stone, 0, 0.05, 0, g);
  // kath-kuni: alternating courses of dry stone and timber beams
  for (let i = 0; i < 9; i++) mesh(box(w + (i % 2) * 0.12, 0.42, d + (i % 2) * 0.12), i % 2 ? timber : stone, 0, 0.55 + i * 0.42, 0, g);
  const top = 0.35 + 9 * 0.42;
  mesh(box(1.0, 1.9, 0.08), std('#4a2e1a'), 0, 1.3, d / 2 + 0.06, g);
  for (const sx of [-1, 1]) mesh(box(0.6, 0.6, 0.08), M.dark, sx * w * 0.3, 1.6, d / 2 + 0.07, g);
  // carved wooden balcony running round the upper storey
  mesh(box(w + 1.2, 0.12, 1.0), timber, 0, 2.55, d / 2 + 0.45, g);
  for (let i = 0; i <= 10; i++) mesh(box(0.06, 0.7, 0.06), timber, -w / 2 - 0.55 + i * (w + 1.1) / 10, 2.95, d / 2 + 0.9, g);
  mesh(box(w + 1.2, 0.08, 0.1), timber, 0, 3.32, d / 2 + 0.9, g);
  for (const sx of [-1, 1]) mesh(box(0.7, 0.8, 0.06), M.dark, sx * w * 0.25, 3.1, d / 2 + 0.07, g);
  // slate roof, steep, with overhanging eaves and a ridge beam
  const rh = 1.6;
  for (const sz of [-1, 1]) {
    const L = Math.hypot(d / 2 + 1.3, rh);
    const r = mesh(box(w + 1.4, 0.14, L), slate, 0, top + rh / 2, sz * (d / 2 + 1.3) / 2, g);
    r.rotation.x = sz * Math.atan2(rh, d / 2 + 1.3);
    for (let k = 1; k < 5; k++) { const ln = mesh(box(w + 1.42, 0.02, 0.05), std('#4a4e54'), 0, top + rh * (1 - k / 5) + 0.09, sz * (d / 2 + 1.3) * k / 5, g); ln.rotation.x = r.rotation.x; }
  }
  mesh(box(w + 1.5, 0.18, 0.22), timber, 0, top + rh + 0.03, 0, g);
  for (const sx of [-1, 1]) {
    const tri = new THREE.Shape([new THREE.Vector2(-d / 2 - 0.4, 0), new THREE.Vector2(d / 2 + 0.4, 0), new THREE.Vector2(0, rh)]);
    mesh(new THREE.ShapeGeometry(tri), timber, sx * (w / 2 + 0.05), top, 0, g).rotation.y = sx * Math.PI / 2;
  }
  void R;
  return { g, w, d };
}
function pagodaTemple() {
  // Himachali pagoda temple: a stone-and-timber cella under three tiers of sloping slate roofs
  const g = new THREE.Group();
  const stone = std('#8a847a'), timber = std('#6a4428'), slate = std('#5a5f66');
  mesh(box(5.6, 0.6, 5.6), stone, 0, 0.3, 0, g);
  for (let i = 0; i < 6; i++) mesh(box(3.8, 0.42, 3.8), i % 2 ? timber : stone, 0, 0.8 + i * 0.42, 0, g);
  mesh(box(1.0, 1.8, 0.08), M.dark, 0, 1.5, 1.95, g);
  for (let t = 0; t < 3; t++) {
    const s = 5.4 - t * 1.4, y = 3.4 + t * 1.5;
    mesh(new THREE.ConeGeometry(s * 0.75, 1.3, 4, 1, true), std('#5a5f66', { side: THREE.DoubleSide }), 0, y + 0.6, 0, g).rotation.y = Math.PI / 4;
    mesh(box(s * 0.55, 0.9, s * 0.55), timber, 0, y + 1.3, 0, g);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; mesh(new THREE.ConeGeometry(0.05, 0.3, 4).rotateX(Math.PI), M.gold, Math.cos(a) * s * 0.48, y - 0.05, Math.sin(a) * s * 0.48, g); }
  }
  mesh(new THREE.SphereGeometry(0.35, 10, 8), M.gold, 0, 8.4, 0, g);
  mesh(new THREE.ConeGeometry(0.12, 0.7, 8), M.gold, 0, 8.9, 0, g);
  void slate;
  return g;
}
function appleTree(R) {
  const g = new THREE.Group();
  mesh(cyl(0.1, 0.16, 1.6, 7), std('#5a4330'), 0, 0.8, 0, g);
  for (let i = 0; i < 4; i++) mesh(new THREE.IcosahedronGeometry(0.85 + R() * 0.3, 1), std('#4f8a32', { roughness: 0.8 }), (R() - 0.5) * 1.0, 2.1 + R() * 0.5, (R() - 0.5) * 1.0, g);
  for (let i = 0; i < 14; i++) { const a = R() * 6.28, e = R() * 1.2; mesh(new THREE.SphereGeometry(0.07, 8, 6), std('#c4201c', { roughness: 0.4 }), Math.cos(a) * Math.cos(e) * 1.05, 2.2 + Math.sin(e) * 0.8, Math.sin(a) * Math.cos(e) * 1.05, g); }
  return g;
}
function crags() {
  // weathered granite boulders in three shapes, instanced; lichen and moss baked into their colours
  const out = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  [0, 1, 2].forEach((v) => {
    const geo = boulder(1, 10 + v * 7, { moss: 0.35, base: ['#9a9286', '#8a847c', '#a8a096'][v], detail: 2 });
    const items = layout.crags.filter((c) => c.v === v);
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    const d = new THREE.Object3D();
    items.forEach((c, i) => {
      d.position.set(c.x, heightAt(c.x, c.z) + c.s * 0.25, c.z);
      d.rotation.set((v - 1) * 0.3, c.rot, 0);
      d.scale.set(c.s * (1 + v * 0.2), c.s * (0.7 + v * 0.15), c.s);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    });
    im.castShadow = im.receiveShadow = true;
    im.computeBoundingSphere();
    im.userData.dynamic = true;
    out.add(im);
  });
  return out;
}

// ---------------- Noorpur: lime-washed homes, the masjid, the kabristan ----------------
const archDoor = (g, x, y0, z, wdt, ht, mat, frame) => {
  // a doorway or window with a round arch: a panel, a half-disc on top, and a painted frame
  mesh(box(wdt, ht - wdt / 2, 0.06), mat, x, y0 + (ht - wdt / 2) / 2, z, g);
  mesh(new THREE.CircleGeometry(wdt / 2, 18, 0, Math.PI), mat, x, y0 + ht - wdt / 2, z + 0.031, g);
  if (frame) {
    mesh(new THREE.TorusGeometry(wdt / 2 + 0.06, 0.05, 6, 18, Math.PI), frame, x, y0 + ht - wdt / 2, z + 0.03, g);
    for (const sx of [-1, 1]) mesh(box(0.1, ht - wdt / 2, 0.08), frame, x + sx * (wdt / 2 + 0.06), y0 + (ht - wdt / 2) / 2, z + 0.03, g);
  }
};
function noorHouse(R) {
  const g = new THREE.Group();
  const walls = ['#f1ede4', '#d9ead8', '#dfe8f0', '#efe2c4', '#e3f0e6', '#f3e9dc'];
  const wall = wallMat(walls[Math.floor(R() * walls.length)]);
  const trim = wallMat(['#2e7d5b', '#2f6f9a', '#1f6a6a', '#8a5a2a'][Math.floor(R() * 4)]);
  const w = 5.4 + R() * 1.0, d = 4.6 + R() * 0.6, two = R() < 0.35, h = two ? 5.6 : 3.1;
  mesh(box(w + 0.4, 0.4, d + 0.4), M.plinth, 0, 0.1, 0, g);
  mesh(box(w, h, d), wall, 0, h / 2 + 0.3, 0, g);
  mesh(box(w + 0.02, 0.5, d + 0.02), trim, 0, 0.55, 0, g);
  mesh(box(w + 0.14, 0.14, d + 0.14), trim, 0, h + 0.33, 0, g);
  // parapet, with little stepped merlons on the front
  for (const [sx, sz, lw, ld] of [[0, 1, w, 0.14], [0, -1, w, 0.14], [1, 0, 0.14, d], [-1, 0, 0.14, d]]) mesh(box(lw, 0.4, ld), wall, sx * (w / 2 - 0.07), h + 0.6, sz * (d / 2 - 0.07), g);
  for (let i = 0; i < 6; i++) mesh(box(0.3, 0.22, 0.16), wall, -w / 2 + 0.4 + (i * (w - 0.8)) / 5, h + 0.9, d / 2 - 0.07, g);
  const doorM = std(['#2e5a3a', '#2a4f6a', '#5a3a26'][Math.floor(R() * 3)]);
  archDoor(g, 0, 0.3, d / 2 + 0.01, 1.0, 2.1, doorM, trim);
  for (const sx of [-1, 1]) {
    archDoor(g, sx * w * 0.31, 1.05, d / 2 + 0.01, 0.7, 1.2, M.dark, trim);
    for (let k = -1; k <= 1; k++) mesh(box(0.02, 0.85, 0.03), M.metal, sx * w * 0.31 + k * 0.16, 1.5, d / 2 + 0.07, g);
    if (two) { archDoor(g, sx * w * 0.25, 3.6, d / 2 + 0.01, 0.7, 1.2, M.dark, trim); }
  }
  if (two) {
    // a little jharokha balcony over the door
    mesh(box(1.8, 0.12, 0.7), trim, 0, 3.3, d / 2 + 0.35, g);
    for (let i = 0; i <= 6; i++) mesh(box(0.05, 0.55, 0.05), trim, -0.85 + i * 0.283, 3.6, d / 2 + 0.66, g);
    archDoor(g, 0, 3.36, d / 2 + 0.01, 0.8, 1.6, doorM, trim);
  }
  // rooftop: a black water tank, now and then a dish antenna
  if (R() < 0.6) { mesh(cyl(0.5, 0.52, 0.9, 16), std('#1e2022', { roughness: 0.6 }), w / 2 - 1.0, h + 0.85, -d / 2 + 1.0, g); mesh(cyl(0.18, 0.18, 0.08, 10), std('#1e2022'), w / 2 - 1.0, h + 1.33, -d / 2 + 1.0, g); }
  if (R() < 0.4) { const dsh = mesh(new THREE.SphereGeometry(0.38, 14, 6, 0, Math.PI * 2, 0, 0.9), std('#d8d8d4', { side: THREE.DoubleSide }), -w / 2 + 0.9, h + 1.1, d / 2 - 0.6, g); dsh.rotation.x = 1.1; }
  // steps up to the door
  mesh(box(1.6, 0.18, 0.5), M.stone, 0, 0.09, d / 2 + 0.45, g);
  return { g, w, d };
}
function masjid() {
  // a white masjid: three-arched prayer hall, a big onion dome on a drum with two little ones,
  // two slender minarets with balconies, a paved sehan in front with the wazu tank
  const g = new THREE.Group();
  const white = wallMat('#f4f2ec'), green = wallMat('#1f7a52'), stone = M.stone, gold = M.gold;
  const marble = std('#ece8e0', { roughness: 0.5 });
  mesh(box(14, 0.4, 18), marble, 0, 0.2, 1, g); // plinth & sehan
  const hz = -3; // hall centre
  mesh(box(12, 5.2, 8), white, 0, 0.4 + 2.6, hz, g);
  mesh(box(12.2, 0.3, 8.2), green, 0, 5.75, hz, g);
  for (let i = 0; i < 20; i++) mesh(box(0.35, 0.4, 0.2), white, -5.7 + i * 0.6, 6.1, hz + 4.0, g); // merlons along the front
  // the facade: three tall pointed arches (dark recesses with green frames)
  for (const x of [-3.6, 0, 3.6]) {
    const big = x === 0;
    const aw = big ? 2.4 : 1.8, ah = big ? 4.2 : 3.4;
    mesh(box(aw, ah - aw / 2, 0.1), M.dark, x, 0.4 + (ah - aw / 2) / 2, hz + 4.02, g);
    const ptd = new THREE.Shape();
    ptd.moveTo(-aw / 2, 0); ptd.quadraticCurveTo(-aw / 2, aw * 0.55, 0, aw * 0.85); ptd.quadraticCurveTo(aw / 2, aw * 0.55, aw / 2, 0); ptd.closePath();
    mesh(new THREE.ShapeGeometry(ptd, 12), M.dark, x, 0.4 + ah - aw / 2, hz + 4.07, g);
    const frame = new THREE.Shape();
    frame.moveTo(-aw / 2 - 0.15, 0); frame.quadraticCurveTo(-aw / 2 - 0.15, aw * 0.62, 0, aw * 0.98); frame.quadraticCurveTo(aw / 2 + 0.15, aw * 0.62, aw / 2 + 0.15, 0); frame.closePath();
    mesh(new THREE.ShapeGeometry(frame, 12), green, x, 0.4 + ah - aw / 2, hz + 4.04, g);
    for (const sx of [-1, 1]) mesh(box(0.15, ah - aw / 2, 0.08), green, x + sx * (aw / 2 + 0.07), 0.4 + (ah - aw / 2) / 2, hz + 4.05, g);
  }
  // domes on drums, with gold finials
  const dome = (r, y, x) => {
    mesh(cyl(r * 0.92, r * 0.92, r * 0.5, 24), white, x, y, hz, g);
    // an onion profile: swelling out past the drum, then drawing in to a point
    const prof = [[0.92, 0], [1.04, 0.25], [1.08, 0.5], [1.0, 0.78], [0.82, 1.02], [0.55, 1.22], [0.28, 1.36], [0.08, 1.45], [0.001, 1.48]].map(([a, b]) => [a * r, b * r]);
    mesh(lathe(prof, 28), white, x, y + r * 0.25, hz, g);
    mesh(cyl(0.03, 0.05, r * 0.6, 6), gold, x, y + r * 1.6, hz, g);
    mesh(new THREE.SphereGeometry(r * 0.1, 10, 8), gold, x, y + r * 1.5, hz, g);
    mesh(new THREE.TorusGeometry(r * 0.12, r * 0.025, 6, 16, Math.PI * 1.4), gold, x, y + r * 1.95, hz, g).rotation.z = 0.9;
  };
  dome(2.6, 6.2, 0);
  dome(1.2, 6.0, -4.3);
  dome(1.2, 6.0, 4.3);
  // minarets at the front corners
  for (const sx of [-1, 1]) {
    const m = new THREE.Group();
    m.position.set(sx * 6.6, 0.4, 1.6);
    g.add(m);
    mesh(box(1.4, 1.2, 1.4), white, 0, 0.6, 0, m);
    mesh(cyl(0.55, 0.7, 7, 12), white, 0, 4.7, 0, m);
    mesh(cyl(0.85, 0.85, 0.25, 12), green, 0, 8.3, 0, m);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; mesh(cyl(0.04, 0.04, 0.6, 5), white, Math.cos(a) * 0.8, 8.7, Math.sin(a) * 0.8, m); }
    mesh(cyl(0.85, 0.85, 0.08, 12), green, 0, 9.0, 0, m);
    mesh(cyl(0.45, 0.5, 2.2, 12), white, 0, 10.2, 0, m);
    mesh(new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.4, 1), white, 0, 11.3, 0, m);
    mesh(cyl(0.02, 0.04, 0.6, 6), gold, 0, 12.3, 0, m);
    mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 14, Math.PI * 1.4), gold, 0, 12.75, 0, m).rotation.z = 0.9;
    // a loudspeaker for the azaan
    mesh(new THREE.ConeGeometry(0.16, 0.35, 10, 1, true).rotateX(Math.PI / 2), std('#d8d8d4', { side: THREE.DoubleSide }), sx * -0.3, 9.6, 0.5, m);
  }
  // wazu tank with water and taps, and a green-lettered board
  mesh(box(3.2, 0.6, 2.0), marble, 0, 0.7, 6, g);
  mesh(box(2.8, 0.05, 1.6), std('#3a7a82', { roughness: 0.15, metalness: 0.2 }), 0, 0.98, 6, g);
  for (let i = -2; i <= 2; i++) mesh(cyl(0.025, 0.025, 0.18, 6).rotateX(Math.PI / 2), M.metal, i * 0.55, 0.85, 7.05, g);
  const sign = mesh(box(4.2, 0.7, 0.06), signMat(boardCanvas('नूरपुर मस्जिद', 'NOORPUR MASJID', { bg: '#1f7a52' })), 0, 5.2, hz + 4.12, g);
  sign.userData.dynamic = true;
  // a low front wall with a gate opening toward the chowk
  for (const sx of [-1, 1]) mesh(box(5.2, 0.8, 0.25), white, sx * 4.4, 0.8, 9.8, g);
  for (const sx of [-1, 1]) { mesh(box(0.5, 2.2, 0.5), green, sx * 1.6, 1.5, 9.8, g); mesh(new THREE.SphereGeometry(0.28, 10, 8), white, sx * 1.6, 2.8, 9.8, g); }
  return g;
}
function kabristan(K) {
  // a walled graveyard: lime-washed wall, a green gate, rows of graves — earth mounds with headstones,
  // some with green chadars and marigolds, a few in little marble enclosures
  const g = new THREE.Group();
  const wall = wallMat('#e9e4d8'), green = wallMat('#1f7a52');
  const w = K.hw * 2, d = K.hd * 2;
  for (const [x, z, lw, ld] of [[0, -K.hd, w, 0.3], [-K.hw, 0, 0.3, d], [K.hw, 0, 0.3, d], [-K.hw / 2 - 1, K.hd, K.hw - 2, 0.3], [K.hw / 2 + 1, K.hd, K.hw - 2, 0.3]]) {
    mesh(box(lw, 1.1, ld), wall, x, 0.55, z, g);
    mesh(box(lw + 0.06, 0.08, ld + 0.06), green, x, 1.14, z, g);
  }
  for (const sx of [-1, 1]) { mesh(box(0.5, 2.0, 0.5), green, sx * 1.1, 1.0, K.hd, g); mesh(new THREE.ConeGeometry(0.3, 0.5, 8), wall, sx * 1.1, 2.25, K.hd, g); }
  const arch = new THREE.Shape(); arch.moveTo(-1.35, 0); arch.quadraticCurveTo(0, 1.2, 1.35, 0); arch.lineTo(1.35, 0.25); arch.quadraticCurveTo(0, 1.45, -1.35, 0.25); arch.closePath();
  mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.25, bevelEnabled: false }), green, 0, 2.0, K.hd - 0.12, g);
  const board = mesh(box(2.4, 0.42, 0.05), signMat(boardCanvas('क़ब्रिस्तान', 'KABRISTAN', { bg: '#1f7a52' })), 0, 2.75, K.hd + 0.05, g);
  board.userData.dynamic = true;
  const earth = std('#7a6248', { roughness: 1 }), lime = std('#e8e2d4'), marble = std('#efece6', { roughness: 0.4 });
  const chadar = std('#1f8a4c', { roughness: 0.9 }), marigold = std('#f29a1a', { roughness: 0.8 }), stoneM = std('#9a958a');
  for (const gr of K.graves) {
    const q = new THREE.Group();
    q.position.set(gr.x - K.x, 0, gr.z - K.z);
    q.rotation.y = gr.rot;
    q.scale.setScalar(gr.s);
    g.add(q);
    if (gr.v === 2) {
      mesh(box(1.3, 0.35, 2.4), marble, 0, 0.18, 0, q);
      mesh(box(0.9, 0.3, 1.9), marble, 0, 0.5, 0, q);
    } else {
      mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.5, 0.32, 1.05), gr.v ? lime : earth, 0, 0.02, 0, q);
      mesh(box(1.1, 0.12, 2.2), stoneM, 0, 0.06, 0, q);
    }
    mesh(box(0.5, 0.75, 0.1), gr.v === 2 ? marble : stoneM, 0, 0.4, -1.1, q); // headstone
    mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.1, 14, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), gr.v === 2 ? marble : stoneM, 0, 0.78, -1.1, q);
    if (gr.v === 1) {
      mesh(box(0.9, 0.04, 1.8), chadar, 0, 0.33, 0, q);
      for (let i = 0; i < 5; i++) mesh(new THREE.SphereGeometry(0.06, 6, 5), marigold, (i - 2) * 0.12, 0.38, 0.2 + (i % 2) * 0.2, q);
    }
  }
  return g;
}
// ---------------- Mariapur: Goan-style cottages, the church, the cemetery ----------------
function goanHouse(R) {
  const g = new THREE.Group();
  const cols = ['#e8c14a', '#6fa8c8', '#e89ab0', '#8cc08a', '#d97a4a', '#b9a4d8'];
  const wall = wallMat(cols[Math.floor(R() * cols.length)]), white = wallMat('#f4f1ea');
  const w = 6.2 + R() * 0.8, d = 5.0, h = 3.0;
  mesh(box(w + 0.5, 0.5, d + 2.4), M.plinth, 0, 0.1, 0.9, g);
  mesh(box(w, h, d), wall, 0, h / 2 + 0.35, 0, g);
  // white pilasters and cornice, the classic trim
  for (const x of [-w / 2, -w / 6, w / 6, w / 2]) mesh(box(0.28, h, 0.1), white, x, h / 2 + 0.35, d / 2 + 0.04, g);
  mesh(box(w + 0.2, 0.18, d + 0.2), white, 0, h + 0.4, 0, g);
  const doorM = std(['#2a5a8a', '#7a2b22', '#2e6b4a'][Math.floor(R() * 3)]);
  archDoor(g, 0, 0.35, d / 2 + 0.02, 1.0, 2.2, doorM, white);
  for (const sx of [-1, 1]) {
    archDoor(g, sx * w / 3, 1.1, d / 2 + 0.02, 0.8, 1.4, M.dark, white);
    // oyster-shell window panes: pale squares in a wooden grid
    for (let k = -1; k <= 1; k++) mesh(box(0.02, 0.9, 0.03), M.woodDark, sx * w / 3 + k * 0.2, 1.6, d / 2 + 0.07, g);
  }
  // a balcão: the porch with built-in seats either side of the steps
  for (const sx of [-1, 1]) { mesh(box(1.8, 0.45, 0.5), white, sx * 1.5, 0.55, d / 2 + 1.6, g); mesh(box(0.25, 0.9, 1.7), white, sx * 2.5, 0.75, d / 2 + 0.95, g); }
  for (const sx of [-1, 1]) mesh(cyl(0.12, 0.14, 2.6, 10), white, sx * 2.5, 1.65, d / 2 + 1.9, g);
  // the tiled roof: a gable over the house and a lean-to over the porch
  const rh = 1.5;
  for (const sz of [-1, 1]) {
    const L = Math.hypot(d / 2 + 0.6, rh);
    const r = mesh(box(w + 0.8, 0.12, L), M.tile, 0, h + 0.45 + rh / 2, sz * (d / 2 + 0.6) / 2, g);
    r.rotation.x = sz * Math.atan2(rh, d / 2 + 0.6);
  }
  for (const sx of [-1, 1]) {
    const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rh)]);
    mesh(new THREE.ShapeGeometry(tri), wall, sx * (w / 2 + 0.01), h + 0.45, 0, g).rotation.y = sx * Math.PI / 2;
  }
  const porch = mesh(box(5.6, 0.1, 2.4), M.tile, 0, h + 0.05, d / 2 + 1.2, g);
  porch.rotation.x = 0.22;
  // a little white cross over the door
  mesh(box(0.08, 0.5, 0.06), white, 0, 3.05, d / 2 + 0.08, g);
  mesh(box(0.3, 0.08, 0.06), white, 0, 3.15, d / 2 + 0.08, g);
  void R;
  return { g, w, d };
}
function church() {
  // a whitewashed church in the Goan-Kerala style: a long nave under a red-tile roof, a tall stepped facade
  // with twin bell towers, pilasters, scrolls, a rose window and the cross on top. Faces local +z.
  const g = new THREE.Group();
  const white = wallMat('#f6f4ee'), cream = wallMat('#efe2c0'), blue = wallMat('#3a6aa8');
  const L = 16, W = 8.4, H = 6;
  mesh(box(W + 1.2, 0.5, L + 3), M.stone, 0, 0.25, 0.8, g);
  for (let i = 0; i < 4; i++) mesh(box(4 - i * 0.4, 0.18, 0.6), M.stone, 0, 0.09 + i * 0.12, L / 2 + 2.6 - i * 0.4, g);
  mesh(box(W, H, L), white, 0, 0.5 + H / 2, 0, g);
  mesh(box(W + 0.05, 0.6, L + 0.05), cream, 0, 0.8, 0, g);
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
    const z = -L / 2 + 2 + i * 3;
    const wdw = new THREE.Group(); wdw.position.set(sx * (W / 2 + 0.01), 0, z); wdw.rotation.y = sx * Math.PI / 2; g.add(wdw);
    archDoor(wdw, 0, 2.0, 0, 1.0, 2.6, M.dark, blue);
    mesh(box(0.3, H, 0.3), cream, sx * (W / 2 + 0.05), 0.5 + H / 2, z + 1.5, g);
  }
  const rh = 3.0;
  for (const sx of [-1, 1]) {
    const Lr = Math.hypot(W / 2 + 0.7, rh);
    const r = mesh(box(Lr, 0.16, L + 0.6), M.tile, sx * (W / 2 + 0.7) / 2, 0.5 + H + rh / 2, -0.3, g);
    r.rotation.z = -sx * Math.atan2(rh, W / 2 + 0.7);
  }
  // facade: stepped gable wall, wider than the nave, with pilasters, a cornice, scrolls and the cross
  const fz = L / 2 + 0.2;
  mesh(box(W + 1.0, H + 0.4, 0.5), white, 0, 0.5 + (H + 0.4) / 2, fz, g);
  mesh(box(W + 1.2, 0.3, 0.6), cream, 0, 0.5 + H + 0.4, fz, g);
  mesh(box(4.4, 2.6, 0.45), white, 0, 0.5 + H + 1.85, fz, g);
  mesh(box(4.6, 0.25, 0.55), cream, 0, 0.5 + H + 3.2, fz, g);
  const gable = new THREE.Shape([new THREE.Vector2(-2.2, 0), new THREE.Vector2(2.2, 0), new THREE.Vector2(0, 1.8)]);
  mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.45, bevelEnabled: false }), white, 0, 0.5 + H + 3.3, fz - 0.22, g);
  for (const sx of [-1, 1]) {
    const scroll = mesh(new THREE.TorusGeometry(0.7, 0.18, 8, 16, Math.PI / 2), white, sx * 2.6, 0.5 + H + 0.6, fz, g);
    scroll.rotation.z = sx > 0 ? 0 : Math.PI / 2;
  }
  mesh(box(0.22, 1.6, 0.22), cream, 0, 0.5 + H + 5.9, fz, g);
  mesh(box(0.9, 0.22, 0.22), cream, 0, 0.5 + H + 6.25, fz, g);
  for (const x of [-3.1, -1.2, 1.2, 3.1]) mesh(box(0.35, H + 0.3, 0.2), cream, x, 0.5 + (H + 0.3) / 2, fz + 0.3, g);
  archDoor(g, 0, 0.5, fz + 0.26, 1.8, 3.6, std('#5a3420'), cream);
  for (const sx of [-1, 1]) archDoor(g, sx * 2.15, 3.0, fz + 0.26, 0.8, 1.8, M.dark, cream);
  // rose window with stained glass
  const rose = new THREE.Group(); rose.position.set(0, 0.5 + H + 1.8, fz + 0.24); g.add(rose);
  mesh(new THREE.TorusGeometry(0.75, 0.1, 8, 24), cream, 0, 0, 0.02, rose);
  const glassC = ['#c0392b', '#2e6aa8', '#e6b422', '#2e8b57'];
  for (let k = 0; k < 8; k++) mesh(new THREE.CircleGeometry(0.7, 6, (k / 8) * Math.PI * 2, Math.PI / 4), std(glassC[k % 4], { emissive: glassC[k % 4], emissiveIntensity: 0.25 }), 0, 0, 0, rose);
  // twin bell towers
  for (const sx of [-1, 1]) {
    const t = new THREE.Group(); t.position.set(sx * (W / 2 + 0.2), 0.5, fz - 0.4); g.add(t);
    mesh(box(1.9, H + 3.4, 1.9), white, 0, (H + 3.4) / 2, 0, t);
    mesh(box(2.1, 0.25, 2.1), cream, 0, H + 3.45, 0, t);
    // the open belfry: four corner piers, a bell
    for (const [cx, cz] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) mesh(box(0.35, 1.6, 0.35), white, cx, H + 4.35, cz, t);
    mesh(lathe([[0.001, 0], [0.32, 0.02], [0.3, 0.12], [0.22, 0.45], [0.18, 0.6], [0.001, 0.62]], 16), M.gold, 0, H + 3.75, 0, t);
    mesh(box(2.1, 0.25, 2.1), cream, 0, H + 5.25, 0, t);
    mesh(new THREE.SphereGeometry(0.85, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, H + 5.35, 0, t);
    mesh(box(0.1, 0.8, 0.1), cream, 0, H + 6.5, 0, t);
    mesh(box(0.45, 0.1, 0.1), cream, 0, H + 6.65, 0, t);
  }
  const sign = mesh(box(3.6, 0.5, 0.05), signMat(boardCanvas('संत मरियम चर्च', "ST. MARY'S CHURCH", { bg: '#3a6aa8' })), 0, 4.75, fz + 0.36, g);
  sign.userData.dynamic = true;
  return g;
}
function wayCross() {
  const g = new THREE.Group();
  const white = wallMat('#f6f4ee');
  for (let i = 0; i < 3; i++) mesh(box(2.2 - i * 0.55, 0.3, 2.2 - i * 0.55), i % 2 ? white : M.stone, 0, 0.15 + i * 0.3, 0, g);
  mesh(box(0.45, 1.0, 0.45), white, 0, 1.4, 0, g);
  mesh(box(0.22, 3.0, 0.22), white, 0, 3.3, 0, g);
  mesh(box(1.3, 0.22, 0.22), white, 0, 4.0, 0, g);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mesh(cyl(0.05, 0.06, 0.16, 8), std('#efe6d0'), Math.cos(a) * 0.75, 0.98, Math.sin(a) * 0.75, g); } // candles
  return g;
}
function cemetery(C) {
  const g = new THREE.Group();
  const wall = wallMat('#efece4'), blue = wallMat('#3a6aa8');
  const w = C.hw * 2, d = C.hd * 2;
  for (const [x, z, lw, ld] of [[0, C.hd, w, 0.3], [0, -C.hd, w, 0.3], [-C.hw, 0, 0.3, d], [C.hw, -C.hd / 2 - 1, 0.3, C.hd - 2], [C.hw, C.hd / 2 + 1, 0.3, C.hd - 2]]) {
    mesh(box(lw, 1.0, ld), wall, x, 0.5, z, g);
    mesh(box(lw + 0.06, 0.08, ld + 0.06), blue, x, 1.04, z, g);
  }
  // the gate: two piers with crosses, an iron grille arch
  for (const sz of [-1, 1]) { mesh(box(0.5, 2.0, 0.5), wall, C.hw, 1.0, sz * 1.1, g); mesh(box(0.08, 0.5, 0.08), blue, C.hw, 2.3, sz * 1.1, g); mesh(box(0.08, 0.08, 0.3), blue, C.hw, 2.4, sz * 1.1, g); }
  const marble = std('#f2efe8', { roughness: 0.4 }), grey = std('#9a958c'), dark = std('#5a5650'), flowers = [std('#e8302a'), std('#f2c21a'), std('#f4f2ec')];
  for (const gr of C.graves) {
    const q = new THREE.Group();
    q.position.set(gr.x - C.x, 0, gr.z - C.z);
    q.rotation.y = gr.rot;
    q.scale.setScalar(gr.s);
    g.add(q);
    mesh(box(0.9, 0.25, 2.0), gr.v === 0 ? marble : grey, 0, 0.12, 0, q);
    if (gr.v === 1) {
      mesh(box(0.6, 0.9, 0.12), dark, 0, 0.55, -0.95, q); // headstone
      mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), dark, 0, 1.0, -0.95, q);
    } else {
      // a white cross at the head
      mesh(box(0.12, 1.3, 0.12), marble, 0, 0.75, -0.9, q);
      mesh(box(0.6, 0.12, 0.12), marble, 0, 1.1, -0.9, q);
    }
    if (gr.v !== 2) for (let i = 0; i < 4; i++) mesh(new THREE.SphereGeometry(0.07, 6, 5), flowers[(i + gr.v) % 3], (i - 1.5) * 0.15, 0.3, 0.3, q);
    if (gr.v === 2) mesh(cyl(0.05, 0.05, 0.18, 8), std('#efe6d0', { emissive: '#ffb35c', emissiveIntensity: 0.5 }), 0.25, 0.34, 0.6, q);
  }
  // a big crucifix at the far end
  mesh(box(1.6, 0.6, 1.6), M.stone, -C.hw + 2, 0.3, 0, g);
  mesh(box(0.25, 4.0, 0.25), marble, -C.hw + 2, 2.6, 0, g);
  mesh(box(0.25, 0.25, 1.6), marble, -C.hw + 2, 3.6, 0, g);
  return g;
}
// ---------------- bus stops ----------------
function busShelter(stop) {
  const g = new THREE.Group();
  const steel = std('#c9cdd1', { metalness: 0.6, roughness: 0.35 }), blue = std('#2a6aa8', { roughness: 0.5 });
  for (const sx of [-1, 1]) { mesh(cyl(0.05, 0.05, 2.5, 8), steel, sx * 1.4, 1.25, -0.8, g); mesh(cyl(0.05, 0.05, 2.3, 8), steel, sx * 1.4, 1.15, 0.5, g); }
  const roof = mesh(box(3.3, 0.08, 1.9), M.tin, 0, 2.45, -0.15, g);
  roof.rotation.x = -0.1;
  mesh(box(2.9, 1.8, 0.05), blue, 0, 1.25, -0.82, g);
  mesh(box(2.4, 0.06, 0.42), M.plankA, 0, 0.5, -0.5, g);
  for (const sx of [-1, 1]) mesh(box(0.06, 0.5, 0.06), steel, sx * 1.1, 0.25, -0.5, g);
  const sign = mesh(box(3.0, 0.42, 0.05), signMat(boardCanvas(stop.hi, stop.en, { bg: '#2a6aa8' })), 0, 2.2, 0.76, g);
  sign.userData.dynamic = true;
  // a round "BUS" stop sign on a pole
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x2 = c.getContext('2d');
  x2.fillStyle = '#c4241c'; x2.beginPath(); x2.arc(64, 64, 62, 0, 7); x2.fill();
  x2.fillStyle = '#fff'; x2.beginPath(); x2.arc(64, 64, 48, 0, 7); x2.fill();
  x2.fillStyle = '#1a3a8a'; x2.font = 'bold 30px Arial'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('BUS', 64, 52); x2.font = 'bold 22px "Kohinoor Devanagari", sans-serif'; x2.fillText('बस', 64, 84);
  mesh(cyl(0.04, 0.04, 2.6, 8), steel, 1.9, 1.3, 0.6, g);
  const disc = mesh(new THREE.CircleGeometry(0.32, 24), new THREE.MeshStandardMaterial({ map: toTexture(c), roughness: 0.6, side: THREE.DoubleSide }), 1.9, 2.5, 0.65, g);
  disc.userData.dynamic = true;
  colliders.push({ kind: 'c', ...localToWorld(stop, 1.9, 0.6), r: 0.1 });
  return g;
}
// ---------------- the mountain: the stone stairway and the summit shrine ----------------
function stairway() {
  const S = STAIRS;
  const out = new THREE.Group();
  const at = (s) => {
    const g = S.segs.find((q) => s <= q.s0 + q.l + 1e-6) || S.segs[S.segs.length - 1];
    const t = Math.min(g.l, Math.max(0, s - g.s0));
    return { x: g.ax + g.dx * t, z: g.az + g.dz * t, dx: g.dx, dz: g.dz };
  };
  const stepM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 });
  const kerbM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 });
  const stepGeo = new THREE.BoxGeometry(S.W * 2, 1.6, S.run + 0.04).translate(0, -0.8, 0);
  const kerbGeo = new THREE.BoxGeometry(0.34, 2.0, S.run + 0.06).translate(0, -0.65, 0);
  const steps = new THREE.InstancedMesh(stepGeo, stepM, S.N);
  const kerbs = new THREE.InstancedMesh(kerbGeo, kerbM, S.N * 2);
  const d = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < S.N; i++) {
    const p = at((i + 0.5) * S.run);
    const top = S.h0 + (i + 1) * S.rise;
    d.position.set(p.x, top, p.z);
    d.rotation.set(0, Math.atan2(p.dx, p.dz), 0);
    d.scale.set(1, 1, 1);
    d.updateMatrix();
    steps.setMatrixAt(i, d.matrix);
    const n = Math.sin(i * 12.9898) * 43758.5453; const r = n - Math.floor(n);
    steps.setColorAt(i, col.set('#a49c8e').multiplyScalar(0.86 + r * 0.22));
    for (const [k, sx] of [[0, -1], [1, 1]]) {
      d.position.set(p.x + p.dz * sx * (S.W + 0.17), top + 0.32, p.z - p.dx * sx * (S.W + 0.17));
      d.updateMatrix();
      kerbs.setMatrixAt(i * 2 + k, d.matrix);
      kerbs.setColorAt(i * 2 + k, col.set('#8a847a').multiplyScalar(0.9 + r * 0.15));
    }
  }
  for (const m of [steps, kerbs]) { m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); m.userData.dynamic = true; out.add(m); }
  // lamp pillars every so often, alternating sides, and painted step markers
  const lamps = [];
  for (let i = 30; i < S.N; i += 45) {
    const p = at(i * S.run), sx = (i / 45) % 2 ? 1 : -1, top = S.h0 + (i + 1) * S.rise + 0.32;
    const x = p.x + p.dz * sx * (S.W + 0.17), z = p.z - p.dx * sx * (S.W + 0.17);
    lamps.push(new THREE.BoxGeometry(0.3, 1.1, 0.3).translate(x, top + 0.55, z));
    lamps.push(new THREE.ConeGeometry(0.28, 0.35, 4).rotateY(Math.PI / 4).translate(x, top + 1.32, z));
  }
  const lampM = mergeGeometries(lamps.map((q) => q.toNonIndexed()));
  out.add(mesh(lampM, M.white));
  const glows = [];
  for (let i = 30; i < S.N; i += 45) {
    const p = at(i * S.run), sx = (i / 45) % 2 ? 1 : -1, top = S.h0 + (i + 1) * S.rise + 0.32;
    glows.push(new THREE.BoxGeometry(0.32, 0.22, 0.32).translate(p.x + p.dz * sx * (S.W + 0.17), top + 0.98, p.z - p.dx * sx * (S.W + 0.17)));
  }
  out.add(mesh(mergeGeometries(glows.map((q) => q.toNonIndexed())), M.dark));
  // a carved gateway arch at the bottom, with bells
  {
    const p = at(0.5);
    const gate = new THREE.Group();
    gate.position.set(p.x, S.h0, p.z);
    gate.rotation.y = Math.atan2(p.dx, p.dz);
    for (const sx of [-1, 1]) { mesh(box(0.6, 3.6, 0.6), M.saffron, sx * (S.W + 0.4), 1.8, 0, gate); mesh(new THREE.SphereGeometry(0.35, 10, 8), M.gold, sx * (S.W + 0.4), 3.8, 0, gate); }
    mesh(box(S.W * 2 + 1.6, 0.5, 0.7), M.saffron, 0, 3.7, 0, gate);
    const c = boardCanvas('शिखर मंदिर · ' + S.N + ' सीढ़ियाँ', 'SHIKHAR · ' + S.N + ' STEPS', { bg: '#c0561c' });
    const b = mesh(box(3.2, 0.5, 0.05), signMat(c), 0, 4.3, 0.36, gate); b.userData.dynamic = true;
    const b2 = mesh(box(3.2, 0.5, 0.05), signMat(c), 0, 4.3, -0.36, gate); b2.rotation.y = Math.PI; b2.userData.dynamic = true;
    for (let i = 0; i < 3; i++) mesh(lathe([[0.001, 0], [0.14, 0.01], [0.12, 0.08], [0.08, 0.2], [0.001, 0.22]], 12), M.gold, (i - 1) * 0.7, 3.15, 0, gate);
    out.add(gate);
  }
  return out;
}
function summitShrine() {
  const P = PEAK;
  const g = new THREE.Group();
  g.position.set(P.x, P.y, P.z);
  const white = wallMat('#f6f2ea');
  // an octagonal stone platform with a parapet round the edge (open toward the stairs)
  mesh(cyl(9, 9.3, 0.5, 8), M.stone, 0, 0.1, 0, g);
  surfaces.push({ kind: 'c', x: P.x, z: P.z, r: 9.0, top: P.y + 0.35 });
  const ux = STAIRS.pts[STAIRS.pts.length - 1].x - P.x, uz = STAIRS.pts[STAIRS.pts.length - 1].z - P.z;
  const openA = Math.atan2(uz, ux);
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    let da = Math.abs(((a - openA + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (da < 0.3) continue;
    mesh(box(1.8, 0.6, 0.3), M.stoneDark, Math.cos(a) * 8.8, 0.65, Math.sin(a) * 8.8, g).rotation.y = -a + Math.PI / 2;
  }
  // the shrine: a white shikhara temple with a saffron spire and gold kalash
  const t = new THREE.Group(); t.rotation.y = -openA + Math.PI / 2; g.add(t);
  mesh(box(4.4, 0.6, 4.4), M.stone, 0, 0.65, 0, t);
  mesh(box(3.2, 2.6, 3.2), white, 0, 2.25, 0, t);
  const prof = [];
  for (let i = 0; i <= 12; i++) { const y = i / 12; prof.push([1.65 * (1 - y * y * 0.82), y * 4.8]); }
  prof.push([0.001, 4.85]);
  mesh(lathe(prof, 4).rotateY(Math.PI / 4), M.saffron, 0, 3.55, 0, t);
  for (let i = 1; i < 6; i++) { const y = i / 6, rr = 1.65 * (1 - y * y * 0.82) * 1.04; mesh(cyl(rr, rr, 0.1, 4).rotateY(Math.PI / 4), white, 0, 3.55 + y * 4.8, 0, t); }
  mesh(new THREE.SphereGeometry(0.4, 12, 10), M.gold, 0, 8.6, 0, t);
  mesh(new THREE.ConeGeometry(0.15, 0.8, 8), M.gold, 0, 9.2, 0, t);
  mesh(box(1.0, 1.7, 0.08), M.dark, 0, 1.8, 1.62, t);
  // porch with four pillars and a hanging bell
  mesh(box(3.6, 0.2, 2.4), white, 0, 3.2, 2.6, t);
  for (const sx of [-1, 1]) for (const sz of [0, 1]) mesh(cyl(0.12, 0.14, 2.3, 10), white, sx * 1.6, 2.05, 1.8 + sz * 1.6, t);
  mesh(lathe([[0.001, 0], [0.22, 0.01], [0.2, 0.1], [0.13, 0.32], [0.001, 0.36]], 14), M.gold, 0, 2.7, 3.1, t);
  // the flag on a tall mast, and strings of prayer flags to the platform edge
  mesh(cyl(0.04, 0.05, 6, 6), M.wood, 2.6, 3.5, -2.6, t);
  const flagGeo = new THREE.PlaneGeometry(1.6, 0.9, 10, 4).translate(0.8, 0, 0);
  const fp = flagGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setY(i, fp.getY(i) * (1 - (fp.getX(i) / 1.6) * 0.85));
  const flag = mesh(flagGeo, applyClothWave(new THREE.MeshLambertMaterial({ color: '#f07a1e', side: THREE.DoubleSide }), { mode: 1, size: 1.6 }), 2.62, 6.0, -2.6, t);
  flag.userData.dynamic = true;
  const pf = [];
  const pcol = [[0.2, 0.4, 0.9], [0.95, 0.95, 0.95], [0.9, 0.2, 0.15], [0.2, 0.7, 0.3], [0.95, 0.8, 0.1]];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.5;
    const A = new THREE.Vector3(0, 8.2, 0), B = new THREE.Vector3(Math.cos(a) * 8.6, 1.4, Math.sin(a) * 8.6);
    for (let i = 1; i < 14; i++) {
      const u = i / 14;
      const p = A.clone().lerp(B, u); p.y -= Math.sin(u * Math.PI) * 1.2;
      const q = new THREE.PlaneGeometry(0.32, 0.36).translate(0, -0.18, 0).rotateY(-a + Math.PI / 2).translate(p.x, p.y, p.z);
      pf.push(q.toNonIndexed());
    }
    mesh(cyl(0.05, 0.05, 1.6, 6), M.wood, B.x, 0.8, B.z, g);
  }
  // fix colours to match the non-indexed vertex count
  const pg = mergeGeometries(pf);
  const cc = new Float32Array(pg.attributes.position.count * 3);
  let ci = 0; for (const q of pf) { const c = pcol[(ci / 6 | 0) % 5]; for (let v = 0; v < q.attributes.position.count; v++) cc.set(c, (ci++) * 3); }
  pg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const flags = mesh(pg, applyClothWave(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { mode: 1, size: 0.4 }));
  flags.userData.dynamic = true;
  g.add(flags);
  // a stone marker with the height, benches facing the view
  const mark = new THREE.Group(); mark.position.set(Math.cos(openA + 0.6) * 6, 0.35, Math.sin(openA + 0.6) * 6); g.add(mark);
  mesh(box(0.8, 1.0, 0.4), M.stone, 0, 0.5, 0, mark);
  const mc = boardCanvas('शिखर', `SHIKHAR · ${Math.round(P.y)} m`, { bg: '#5a5650' });
  const mm = mesh(box(0.78, 0.4, 0.02), signMat(mc), 0, 0.75, 0.21, mark); mm.userData.dynamic = true;
  mark.rotation.y = -openA - 0.6 - Math.PI / 2;
  for (const a of [openA + 2.2, openA - 2.2, openA + Math.PI]) {
    const b = new THREE.Group(); b.position.set(Math.cos(a) * 7, 0.35, Math.sin(a) * 7); b.rotation.y = -a - Math.PI / 2; g.add(b);
    for (const sx of [-1, 1]) mesh(box(0.3, 0.45, 0.4), M.stone, sx * 0.7, 0.22, 0, b);
    mesh(box(1.9, 0.1, 0.5), M.stoneDark, 0, 0.48, 0, b);
    colliders.push({ kind: 'c', x: P.x + Math.cos(a) * 7, z: P.z + Math.sin(a) * 7, r: 0.6 });
  }
  colliders.push({ kind: 'c', x: P.x, z: P.z, r: 2.4 });
  return g;
}

// ---------------- dynamic things ----------------
function boat() {
  const g = new THREE.Group();
  const hull = mesh(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.75, 0.45, 2.6), std('#5b3b22', { side: THREE.DoubleSide }), 0, 0.15, 0, g);
  const rim = mesh(new THREE.TorusGeometry(1, 0.05, 5, 24).rotateX(Math.PI / 2).scale(0.75, 1, 2.6), M.woodDark, 0, 0.15, 0, g);
  for (const z of [-0.8, 0.6]) mesh(box(1.35, 0.05, 0.25), M.wood, 0, 0.1, z, g);
  return g;
}

function kite() {
  const g = new THREE.Group();
  const shape = new THREE.BufferGeometry();
  shape.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.5, 0, -0.35, 0, 0, 0, -0.5, 0, 0, 0.5, 0, 0, -0.5, 0, 0.35, 0, 0], 3));
  shape.setAttribute('color', new THREE.Float32BufferAttribute([1, 0.2, 0.3, 1, 0.2, 0.3, 1, 0.2, 0.3, 1, 0.8, 0.1, 1, 0.8, 0.1, 1, 0.8, 0.1], 3));
  shape.computeVertexNormals();
  g.add(new THREE.Mesh(shape, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 1.2).translate(0, -1.1, 0), new THREE.MeshBasicMaterial({ color: '#ffd23f', side: THREE.DoubleSide }));
  g.add(tail);
  return g;
}

// ---------------- merge ----------------
function mergeStatic(root, out) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const dynamic = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.dynamic) { dynamic.push(o); return; }
    let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo);
  });
  for (const [mat, geos] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = m.receiveShadow = true;
    out.add(m);
  }
  for (const d of dynamic) out.attach(d);
}

export function buildVillage() {
  materials();
  const R = rng(4242);
  const root = new THREE.Group();
  const out = new THREE.Group();
  const place = (obj, x, z, rot = 0, yOff = 0) => {
    obj.position.set(x, heightAt(x, z) + yOff, z);
    obj.rotation.y = rot;
    root.add(obj);
    return obj;
  };

  let lines = 0;
  for (const h of layout.houses) {
    const HR = rng(h.seed);
    if (h.type === 'pahadi') {
      const H = pahadiHouse(HR);
      place(H.g, h.x, h.z, h.rot, -0.05);
      colliders.push({ kind: 'b', x: h.x, z: h.z, rot: h.rot, hw: H.w / 2 + 0.2, hd: H.d / 2 + 0.2 });
      continue;
    }
    if (h.type === 'noor' || h.type === 'goan') {
      const H = h.type === 'noor' ? noorHouse(HR) : goanHouse(HR);
      place(H.g, h.x, h.z, h.rot, -0.05);
      colliders.push({ kind: 'b', x: h.x, z: h.z, rot: h.rot, hw: H.w / 2 + 0.2, hd: H.d / 2 + 0.2 });
      continue;
    }
    if (h.type === 'ne') {
      const H = stiltHouse(HR);
      place(H.g, h.x, h.z, h.rot, -0.05);
      colliders.push({ kind: 'b', x: h.x, z: h.z, rot: h.rot, hw: H.w / 2 + 0.2, hd: H.d / 2 + 0.2 });
      continue;
    }
    if (h.type === 'bengal' || h.type === 'tamil' || h.type === 'maha') {
      const H = h.type === 'bengal' ? bengalHut(HR) : h.type === 'tamil' ? tamilHouse(HR) : mahaHouse(HR);
      place(H.g, h.x, h.z, h.rot, -0.05);
      colliders.push({ kind: 'b', x: h.x, z: h.z, rot: h.rot, hw: H.w / 2 + 0.1, hd: H.d / 2 + 0.1 });
      continue;
    }
    if (h.type === 'raj') {
      const H = rajHouse(HR, h.blue, h.storeys);
      place(H.g, h.x, h.z, h.rot, -0.05);
      colliders.push({ kind: 'b', x: h.x, z: h.z, rot: h.rot, hw: H.w / 2 + 0.1, hd: H.d / 2 + 0.1 });
      continue;
    }
    if (h.type === 'rect') {
      const H = rectHouse(HR);
      place(H.g, h.x, h.z, h.rot, -0.05);
      const fwdOff = H.ext / 2;
      const f = { x: h.x + Math.sin(h.rot) * fwdOff, z: h.z + Math.cos(h.rot) * fwdOff };
      colliders.push({ kind: 'b', x: h.x, z: h.z, rot: h.rot, hw: H.w / 2 + 0.05, hd: H.d / 2 + 0.05 });
      surfaces.push({ kind: 'b', x: f.x, z: f.z, rot: h.rot, hw: H.w / 2 + 0.35, hd: H.d / 2 + 0.35 + H.ext / 2, top: heightAt(h.x, h.z) - 0.05 + H.ph });
      if (H.ext) {
        for (let i = 0; i < 3; i++) {
          const lx = -H.w * 0.42 + (i * H.w * 0.84) / 2;
          colliders.push({ kind: 'c', ...localToWorld(h, lx, H.d / 2 + 2.05), r: 0.12 });
        }
      }
      if (lines < 4 && HR() < 0.5) {
        lines++;
        const cl = clothesline(HR);
        cl.position.set(0, 0.05, -(H.d / 2 + 2.6));
        H.g.add(cl);
      }
    } else {
      const H = roundHut(HR);
      place(H.g, h.x, h.z, h.rot, -0.05);
      colliders.push({ kind: 'c', x: h.x, z: h.z, r: H.r + 0.05 });
      surfaces.push({ kind: 'c', x: h.x, z: h.z, r: H.r + 0.4, top: heightAt(h.x, h.z) - 0.05 + H.ph });
    }
  }

  const T = layout.temple;
  place(temple(), T.x, T.z, T.rot, 0);
  place(well(), layout.well.x, layout.well.z, 0.4, 0);
  for (const hs of layout.haystacks) place(haystack(R), hs.x, hs.z, R() * 6).scale.setScalar(hs.s);
  for (const c of layout.charpais) { place(charpai(), c.x, c.z, c.rot); colliders.push({ kind: 'b', x: c.x, z: c.z, rot: c.rot, hw: 0.45, hd: 0.95 }); }
  for (const p of layout.pots) place(pot(p.s), p.x, p.z, 0, -0.02);
  for (const t of layout.tulsis) { place(tulsi(), t.x, t.z, t.rot); colliders.push({ kind: 'c', x: t.x, z: t.z, r: 0.4 }); }
  if (layout.cart) place(cart(), layout.cart.x, layout.cart.z, layout.cart.rot);
  root.add(ghat());
  root.add(footbridge());
  root.add(hilltopShrine());
  for (const w of layout.woodpiles) place(woodpile(R), w.x, w.z, w.rot);
  const TS = layout.tea;
  place(teaStall(R), TS.x, TS.z, TS.rot, 0);
  {
    const po = layout.postOffice, hp = layout.hospital, S = layout.school, G = layout.garden;
    place(pucca({ w: 6.4, d: 5.2, h: 3.0, wall: '#e8c77a', band: '#8c3f24', trim: '#b8322b', pillars: 3, windows: 2, door: '#7a2b22',
      sign: boardCanvas('डाकघर', 'POST OFFICE') }), po.x, po.z, po.rot, 0);
    place(postBox(), po.box.x, po.box.z, po.rot);
    place(pucca({ w: 10.4, d: 6.4, h: 3.2, wall: '#f1ede4', band: '#2f7a8a', trim: '#2f7a8a', pillars: 5, windows: 4, door: '#2f5f8f', tank: true,
      sign: boardCanvas('अस्पताल', 'HOSPITAL', { bg: '#1f6f8a', icon: 'cross' }) }), hp.x, hp.z, hp.rot, 0);
    place(benchG(1.9), hp.bench.x, hp.bench.z, hp.rot + Math.PI);
    place(pucca({ w: 14, d: 6, h: 3.1, wall: '#e9c46a', band: '#9a3b22', trim: '#9a3b22', pillars: 6, windows: 4, door: '#2e6b4a',
      sign: boardCanvas('पाठशाला', 'VILLAGE SCHOOL', { bg: '#2e6b4a' }) }), S.x + 1, S.z, S.rot, 0);
    place(flagPole(), S.flag.x, S.flag.z, 0);
    const lw = (o, lx, lz) => localToWorld(o, lx, lz);
    const sw = lw(S, -5, 12); place(swingSet(), sw.x, sw.z, S.rot + Math.PI / 2);
    const sz = lw(S, 4, 13); place(seeSaw(), sz.x, sz.z, S.rot);
    colliders.push({ kind: 'b', ...sw, rot: S.rot + Math.PI / 2, hw: 1.7, hd: 0.6, npcPass: true });
    place(gardenFence(), G.x, G.z, 0);
    root.add(marketFurniture(R));
    { const b = baoli(); b.position.set(RV.x, heightAt(RV.x + 6, RV.z), RV.z); root.add(b); }
    place(chhatri(), RV.chhatri.x, RV.chhatri.z, 0.4);
    for (const c of layout.cacti) place(cactus(R), c.x, c.z, c.rot).scale.setScalar(c.s);
    for (const B of BRIDGES) root.add(roadBridge(B));
    { const p = pukur(); p.position.set(BV.pond.x, heightAt(BV.pond.x + 11, BV.pond.z), BV.pond.z); root.add(p); }
    place(terracottaTemple(), BV.temple.x, BV.temple.z, BV.temple.rot);
    for (const b of layout.bananas) place(bananaPlant(R), b.x, b.z, b.rot).scale.setScalar(b.s);
    place(gopuram(), TV.temple.x, TV.temple.z, 0);
    place(vitthalTemple(), MH.temple.x, MH.temple.z, MH.temple.rot);
    place(deepmala(), MH.deepmala.x, MH.deepmala.z, 0);
    place(wada(), MH.wada.x, MH.wada.z, MH.wada.rot);
    for (const b of layout.bamboo) place(bambooClump(R), b.x, b.z, b.rot).scale.setScalar(b.s);
    root.add(teaGarden());
    place(pagodaTemple(), PG.temple.x, PG.temple.z, 0.3);
    for (const a of layout.apples) place(appleTree(R), a.x, a.z, a.rot).scale.setScalar(a.s);
    root.add(crags());
    place(masjid(), NP.masjid.x, NP.masjid.z, 0);
    place(kabristan(NP.kab), NP.kab.x, NP.kab.z, 0);
    place(church(), MP.church.x, MP.church.z, MP.church.rot);
    place(wayCross(), MP.x, MP.z, 0.5);
    place(cemetery(MP.cem), MP.cem.x, MP.cem.z, 0);
    for (const b of layout.busStops) place(busShelter(b), b.x, b.z, b.rot);
    root.add(stairway());
    root.add(summitShrine());
    out.add(roadSigns());
    for (const hh of TV.horses) place(ayyanarHorse(), hh.x, hh.z, Math.PI);
    root.add(cricketKit());
    place(handPump(), layout.pump.x, layout.pump.z, layout.pump.rot);
    place(waterTank(), layout.tank.x, layout.tank.z, 0.3);
  }

  mergeStatic(root, out);

  // the pump's handle moves (driven by whoever is pumping), rangoli at a few doorsteps
  {
    const P = layout.pump;
    const h = pumpHandle();
    const c = Math.cos(P.rot), s = Math.sin(P.rot);
    h.position.set(P.x + -0.35 * s, heightAt(P.x, P.z) + 1.05, P.z + -0.35 * c);
    h.rotation.y = P.rot;
    out.add(h);
    P.handle = h;
    const texs = [0, 1, 2].map((i) => toTexture(rangoliCanvas(i + 3)));
    const kolamTex = toTexture(kolamCanvas());
    for (const hh of layout.houses.filter((x) => x.type === 'tamil')) {
      const p = localToWorld(hh, 0, 5.4);
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: kolamTex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(p.x, heightAt(p.x, p.z) + 0.03, p.z);
      out.add(m);
    }
    const houses = layout.houses.filter((x) => x.side !== 0).slice(0, 12);
    houses.forEach((hh, i) => {
      if (i % 2) return;
      const p = localToWorld(hh, 0, hh.type === 'rect' ? 6.2 : 4.6);
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: texs[i % 3], transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(p.x, heightAt(p.x, p.z) + 0.03, p.z);
      m.receiveShadow = true;
      out.add(m);
    });
  }
  // tea stall: hanging lantern, steam off the pan
  const lw = (lx, y, lz) => { const c = Math.cos(TS.rot), s = Math.sin(TS.rot); return new THREE.Vector3(TS.x + lx * c + lz * s, heightAt(TS.x, TS.z) + y, TS.z - lx * s + lz * c); };
  teaLantern = makeLantern();
  teaLantern.position.copy(lw(-0.98, 2.12, 1.02));
  out.add(teaLantern);
  const teaLight = lw(-0.98, 1.9, 1.02);
  const panPos = lw(-0.75, 1.3, 0.7);
  const steam = new Puffs({ max: 60, color: '#f4f2ee', opacity: 0.28, buoyancy: 0.5, drag: 1.4 });
  out.add(steam.mesh);
  let steamAcc = 0;

  // dynamic actors
  const cows = layout.cows.map((c) => {
    const cow = makeCow(c.color);
    cow.g.position.set(c.x, heightAt(c.x, c.z), c.z);
    cow.g.rotation.y = c.rot;
    out.add(cow.g);
    return { ...cow, phase: c.phase };
  });

  const gh = layout.ghat;
  const boatObj = boat();
  const bp = localToWorld(gh, 7.2, 5.5);
  boatObj.position.set(bp.x, WATER_Y, bp.z);
  boatObj.rotation.y = gh.rot + 0.25;
  out.add(boatObj);

  const kiteObj = kite();
  kiteObj.position.set(38, 30, -48);
  out.add(kiteObj);

  const update = (t, dt = 0.016, player) => {
    M.coal.emissiveIntensity = (1.2 + nightLevel * 1.5) * (0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 4.3));
    if (!player || Math.abs(player.x - TS.x) + Math.abs(player.z - TS.z) < 120) {
      steamAcc += dt * 7;
      while (steamAcc > 1) {
        steamAcc -= 1;
        steam.emit(panPos.x + (Math.random() - 0.5) * 0.2, panPos.y, panPos.z + (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.1, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.1, 2.2 + Math.random(), 0.1, 0.6, 0.9);
      }
    }
    steam.update(dt);
    teaLantern.rotation.z = Math.sin(t * 0.9) * 0.05;
    for (const c of cows) {
      const k = t * 0.35 + c.phase;
      const graze = Math.sin(k) * 0.5 + 0.5;
      c.neck.rotation.x = 0.1 + Math.pow(graze, 2) * 1.35 + Math.sin(t * 6 + c.phase) * 0.02 * graze;
      c.neck.rotation.y = Math.sin(k * 0.37) * 0.25;
      c.tail.rotation.z = Math.sin(t * 2.1 + c.phase) * 0.35;
      c.tail.rotation.x = 0.15 + Math.sin(t * 1.3 + c.phase) * 0.1;
    }
    boatObj.position.y = WATER_Y + 0.12 + Math.sin(t * 1.3) * 0.04;
    boatObj.rotation.z = Math.sin(t * 0.9) * 0.04;
    boatObj.rotation.x = Math.sin(t * 1.1 + 1) * 0.02;
    kiteObj.position.set(38 + Math.sin(t * 0.5) * 2.5, 30 + Math.sin(t * 0.8) * 1.5, -48 + Math.cos(t * 0.37) * 1.5);
    kiteObj.rotation.z = Math.sin(t * 1.1) * 0.3;
    kiteObj.rotation.y = Math.sin(t * 0.4) * 0.4;
  };

  return { group: out, update, cows: layout.cows, teaLight, kite: kiteObj, setSteamColor: (c) => { steam.material.uniforms.uColor.value.set(c); steam.material.uniforms.uDark.value.set(c); } };
}
