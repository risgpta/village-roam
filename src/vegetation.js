// Instanced trees: neem/mango broadleaf, coconut palms, bushes, rocks, and the great banyan.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './noise.js';
import { applyFoliageWind } from './wind.js';
import { layout, heightAt } from './world.js';

const V3 = THREE.Vector3;
const glowMats = [];
// seasons: broadleaf canopies turn orange in autumn and drop entirely in winter; palms stay green
const leafMeshes = [], leafMats = [];
export function setFoliageSeason(season) {
  for (const m of leafMats) {
    const autumn = season === 'autumn', spring = season === 'spring', summer = season === 'summer';
    m.vertexColors = !autumn;
    m.color.set(autumn ? '#d9782a' : spring ? '#d8ffc8' : summer ? '#e8e0b0' : '#ffffff');
    m.needsUpdate = true;
  }
  for (const l of leafMeshes) l.visible = season !== 'winter';
}
export function setFoliageGlow(v) {
  for (const m of glowMats) m.emissiveIntensity = v;
}
const _c = new THREE.Color();

function paint(geo, hex, R, jitter = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(hex);
  if (jitter) _c.offsetHSL((R() - 0.5) * 0.03 * jitter, (R() - 0.5) * 0.1 * jitter, (R() - 0.5) * 0.06 * jitter);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function lumpy(r, seed = 0, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.2 * Math.sin(x * 3.1 / r + seed) * Math.sin(y * 2.7 / r + seed * 1.3) + 0.1 * Math.sin(z * 4.3 / r - seed);
    p.setXYZ(i, x * k, y * k, z * k);
    // soft, sphere-like normals so canopies read as leafy masses, not facets
    const l = Math.hypot(x, y, z) || 1;
    g.attributes.normal.setXYZ(i, x / l, y / l, z / l);
  }
  return g;
}
// darken the underside and the inside of a canopy: cheap ambient occlusion baked into vertex colors
function shadeCanopy(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  const rad = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const hy = (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y + 1e-3);
    const rr = Math.hypot(p.getX(i) - cx, p.getZ(i) - cz) / (rad + 1e-3);
    const k = (0.66 + 0.34 * Math.pow(hy, 0.8)) * (0.8 + 0.2 * Math.min(1, rr + hy * 0.5));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k * 1.02, c.getZ(i) * k);
  }
  return geo;
}

// ---------------- foliage made of leaves ----------------
// A crown is built the way real-time foliage usually is: many small flat cards, each showing a spray of leaves
// (drawn once into a texture, with see-through gaps between them), set at all angles round each bough, over a
// small dark core so you never see straight through. The cards are lit as if they were the rounded mass they
// make up, so the crown shades softly while its edge is broken into real leaf shapes.
let leafTex = null;
function leafTexture() {
  if (leafTex) return leafTex;
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  let seed = 4242;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // four different sprays, one per quarter of the sheet
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const cx = tx * 256 + 128, cy = ty * 256 + 128;
    g.fillStyle = '#7d8c64'; g.beginPath(); g.arc(cx, cy, 30, 0, 7); g.fill(); // the solid heart of the spray
    const leaves = 95;
    for (let i = 0; i < leaves; i++) {
      // leaves fan out from twigs near the middle; the later (top) ones are lighter, as if catching the light
      const a = R() * Math.PI * 2, d = Math.pow(R(), 0.7) * 96, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const len = 20 + R() * 16, wid = len * (0.34 + R() * 0.14), rot = a + (R() - 0.5) * 1.5;
      const v = 185 + (i / leaves) * 55 + R() * 15;
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = `rgb(${v * 0.86},${v},${v * 0.72})`;
      g.beginPath(); g.moveTo(-len / 2, 0); g.quadraticCurveTo(0, -wid, len / 2, 0); g.quadraticCurveTo(0, wid, -len / 2, 0); g.fill();
      g.strokeStyle = `rgba(${v * 0.6},${v * 0.72},${v * 0.5},0.9)`; g.lineWidth = 1; g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke(); // midrib
      g.fillStyle = 'rgba(40,60,20,0.18)'; g.beginPath(); g.moveTo(-len / 2, 0); g.quadraticCurveTo(0, wid, len / 2, 0); g.closePath(); g.fill(); // the shaded half
      g.restore();
    }
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 4;
  return leafTex;
}
// lumps: [{ c: Vector3, r, sy, color }] — the boughs of the crown. per: cards on each; size: card size relative to the bough.
function leafCards(lumps, { per = 14, size = 1, seed = 1 } = {}) {
  let sd = seed * 7919 + 13;
  const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const pos = [], nor = [], uv = [], col = [];
  const cc = new THREE.Color(), up = new V3(0, 1, 0), n = new V3(), t = new V3(), b = new V3(), d = new V3(), p = new V3(), q = new V3(), sn = new V3();
  const push = (v, nn, u, w, k) => { pos.push(v.x, v.y, v.z); nor.push(nn.x, nn.y, nn.z); uv.push(u, w); col.push(cc.r * k, cc.g * k, cc.b * k); };
  for (const L of lumps) {
    cc.set(L.color);
    // the dark core: a low-poly ball mapped onto the solid heart of a spray
    const core = new THREE.IcosahedronGeometry(L.r * 0.62, 0).scale(1, L.sy, 1).toNonIndexed(), cp = core.attributes.position;
    for (let i = 0; i < cp.count; i++) { p.fromBufferAttribute(cp, i); sn.copy(p).normalize(); p.add(L.c); push(p, sn, 0.25, 0.25, 0.8); }
    for (let k = 0; k < per; k++) {
      // a card somewhere in the outer shell of the bough, facing roughly outward, twisted at random
      d.set(R() * 2 - 1, R() * 1.5 - 0.45, R() * 2 - 1).normalize();
      p.copy(d).multiplyScalar(L.r * (0.55 + R() * 0.5)); p.y *= L.sy; p.add(L.c);
      n.copy(d).add(q.set(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.1)).normalize();
      t.crossVectors(n, Math.abs(n.y) > 0.9 ? q.set(1, 0, 0) : up).normalize(); b.crossVectors(n, t);
      const roll = R() * 6.28, cs = Math.cos(roll), sr = Math.sin(roll), s = L.r * size * (0.62 + R() * 0.36);
      const tx = t.clone().multiplyScalar(cs).addScaledVector(b, sr), bx = b.clone().multiplyScalar(cs).addScaledVector(t, -sr);
      // shaded as part of the rounded crown, not as a flat card
      sn.copy(d).multiplyScalar(0.75).add(q.set(0, 0.35, 0)).normalize();
      const u0 = R() < 0.5 ? 0 : 0.5, v0 = R() < 0.5 ? 0 : 0.5, kk = 1.25 + R() * 0.4;
      const corner = (a, c2) => q.copy(p).addScaledVector(tx, a * s).addScaledVector(bx, c2 * s).clone();
      const A = corner(-1, -1), B = corner(1, -1), C = corner(1, 1), D = corner(-1, 1);
      push(A, sn, u0, v0, kk); push(B, sn, u0 + 0.5, v0, kk); push(C, sn, u0 + 0.5, v0 + 0.5, kk);
      push(A, sn, u0, v0, kk); push(C, sn, u0 + 0.5, v0 + 0.5, kk); push(D, sn, u0, v0 + 0.5, kk);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
const leafMaterial = (o) => applyFoliageWind(new THREE.MeshLambertMaterial({ map: leafTexture(), vertexColors: true, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, emissive: '#22381a' }), { ...o, cards: true });

const GREENS = ['#4a7a2c', '#5a8832', '#669036', '#3f6c2a', '#6e963a', '#527d2e'];
const BARK = '#5a4330';

// lod 1: the full tree; lod 0: the same tree (same random numbers) in a quarter of the triangles, for far away
function broadleaf(R, lod = 1) {
  const trunk = [], lumps = [];
  const th = 2.4 + R() * 1.4;
  trunk.push(paint(new THREE.CylinderGeometry(0.2, 0.36, th, lod ? 7 : 4).translate(0, th / 2, 0), BARK, R));
  const nb = 3 + Math.floor(R() * 3);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + R() * 0.8, len = 1.4 + R() * 1.4, tilt = 0.55 + R() * 0.5;
    const by = th * (0.72 + R() * 0.2);
    trunk.push(paint(new THREE.CylinderGeometry(0.07, 0.15, len, lod ? 5 : 3).translate(0, len / 2, 0).rotateZ(-tilt).rotateY(a).translate(0, by, 0), BARK, R));
    const ex = Math.sin(tilt) * len, ey = Math.cos(tilt) * len;
    const end = new V3(ex * Math.cos(a), by + ey, -ex * Math.sin(a));
    const nl = 2 + Math.floor(R() * 2);
    for (let k = 0; k < nl; k++) {
      const r = 0.95 + R() * 0.8;
      R();
      lumps.push({ r, sy: 0.78, c: new V3(end.x + (R() - 0.5) * 1.3, end.y + (R() - 0.2) * 0.8, end.z + (R() - 0.5) * 1.3), color: GREENS[Math.floor(R() * GREENS.length)] });
    }
  }
  { const r = 1.7 + R() * 0.7; R(); lumps.push({ r, sy: 0.8, c: new V3(0, th + 1.5 + R() * 0.5, 0), color: GREENS[Math.floor(R() * GREENS.length)] }); }
  return { trunk: mergeGeometries(trunk), leaves: shadeCanopy(leafCards(lumps, lod ? { per: 15, size: 1 } : { per: 6, size: 1.35 })) };
}

function frond(a, e0, L, n = 10) {
  const d = new V3(Math.cos(a), 0, Math.sin(a)), p = new V3(-Math.sin(a), 0, Math.cos(a));
  const P = [], Lf = [], Rt = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = d.clone().multiplyScalar(L * t * Math.cos(e0 * 0.6));
    c.y = Math.sin(e0) * L * t - 1.7 * t * t * (L / 3.5);
    const w = 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.03)) + 0.02;
    P.push(c);
    Lf.push(c.clone().addScaledVector(p, w).add(new V3(0, -0.2 * w, 0)));
    Rt.push(c.clone().addScaledVector(p, -w).add(new V3(0, -0.2 * w, 0)));
  }
  const pos = [];
  const tri = (a1, b1, c1) => pos.push(a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, c1.x, c1.y, c1.z);
  for (let i = 0; i < n; i++) {
    tri(Lf[i], P[i], Lf[i + 1]); tri(P[i], P[i + 1], Lf[i + 1]);
    tri(P[i], Rt[i], P[i + 1]); tri(Rt[i], Rt[i + 1], P[i + 1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

function palm(R, lod = 1) {
  const trunk = [], leaves = [];
  const h = 6.5 + R() * 3.5, lean = 0.6 + R() * 1.8;
  const curve = new THREE.CatmullRomCurve3([new V3(0, 0, 0), new V3(lean * 0.12, h * 0.33, 0), new V3(lean * 0.45, h * 0.66, 0), new V3(lean, h, 0)]);
  trunk.push(paint(new THREE.TubeGeometry(curve, lod ? 14 : 5, 0.18, lod ? 7 : 4, false), '#8a7660', R));
  trunk.push(paint(new THREE.CylinderGeometry(0.26, 0.3, 0.5, lod ? 7 : 4).translate(0, 0.25, 0), '#7a6650', R));
  trunk.push(paint(new THREE.SphereGeometry(0.3, lod ? 8 : 4, lod ? 6 : 3).translate(lean, h, 0), '#6b5a3a', R));
  for (let k = 0; k < 5; k++) {
    const a = R() * Math.PI * 2;
    trunk.push(paint(new THREE.SphereGeometry(0.15, lod ? 7 : 4, lod ? 5 : 3).translate(lean + Math.cos(a) * 0.3, h - 0.28, Math.sin(a) * 0.3), '#5d6b2a', R));
  }
  const nf = 10 + Math.floor(R() * 4);
  for (let f = 0; f < nf; f++) {
    const a = (f / nf) * Math.PI * 2 + R() * 0.4;
    const e0 = 0.6 - R() * 0.8;
    const L = 3.0 + R() * 1.3;
    leaves.push(paint(frond(a, e0, L, lod ? 10 : 3).translate(lean, h, 0), ['#4d7a28', '#5e8a2c', '#6e9134', '#46702a'][f % 4], R));
  }
  return { trunk: mergeGeometries(trunk), leaves: mergeGeometries(leaves) };
}

// eucalyptus (safeda): a tall, straight, pale trunk and a thin, airy crown of grey-green leaves high up
export function eucalyptus(R, lod = 1) {
  const trunk = [], lumps = [];
  const h = 11 + R() * 4, lean = (R() - 0.5) * 0.5;
  const curve = new THREE.CatmullRomCurve3([new V3(0, 0, 0), new V3(lean * 0.2, h * 0.4, 0), new V3(lean * 0.6, h * 0.75, 0.1), new V3(lean, h, 0)]);
  trunk.push(paint(new THREE.TubeGeometry(curve, lod ? 10 : 4, 0.2, lod ? 7 : 4, false), '#d9d2c3', R, 0.6));
  trunk.push(paint(new THREE.CylinderGeometry(0.24, 0.32, 1.2, lod ? 7 : 4).translate(0, 0.6, 0), '#b8ad9a', R, 0.5)); // the rough bark at the foot
  const nb = 3 + Math.floor(R() * 2);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + R(), by = h * (0.6 + R() * 0.25), len = 1.6 + R() * 1.6, tilt = 0.45 + R() * 0.35;
    trunk.push(paint(new THREE.CylinderGeometry(0.04, 0.09, len, lod ? 5 : 3).translate(0, len / 2, 0).rotateZ(-tilt).rotateY(a).translate(lean * (by / h), by, 0), '#cfc6b4', R, 0.5));
    const ex = Math.sin(tilt) * len, ey = Math.cos(tilt) * len;
    lumps.push({ r: 0.8 + R() * 0.5, sy: 1.35, c: new V3(lean * (by / h) + ex * Math.cos(a), by + ey + 0.4, -ex * Math.sin(a)), color: ['#6f8a5c', '#7d9668', '#62805a'][i % 3] });
  }
  for (let k = 0; k < 3; k++) lumps.push({ r: 0.9 + R() * 0.4, sy: 1.4, c: new V3(lean + (R() - 0.5) * 1.2, h - 0.6 + k * 0.9, (R() - 0.5) * 1.2), color: ['#728d60', '#68845a', '#7f9a6c'][k] });
  return { trunk: mergeGeometries(trunk), leaves: shadeCanopy(leafCards(lumps, lod ? { per: 11, size: 0.95, seed: 5 } : { per: 5, size: 1.3, seed: 5 })) };
}

function bush(R, lod = 1) {
  const leaves = [], lumps = [];
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.5 + R() * 0.5;
    R();
    lumps.push({ r, sy: 0.75, c: new V3((R() - 0.5) * 1.1, r * 0.55, (R() - 0.5) * 1.1), color: ['#3a5f25', '#4a6e2a', '#5a7a30'][i % 3] });
  }
  if (R() < 0.3) {
    // a few flowers: tiny bright balls, mapped onto the solid heart of a spray so they stay whole
    for (let i = 0; i < 6; i++) { const f = paint(new THREE.IcosahedronGeometry(0.09, 0).translate((R() - 0.5) * 1.2, 0.5 + R() * 0.5, (R() - 0.5) * 1.2), R() < 0.5 ? '#ff8aa8' : '#ffd060', R, 0); const fu = f.attributes.uv; for (let k = 0; k < fu.count; k++) fu.setXY(k, 0.25, 0.25); leaves.push(f); }
  }
  const cards = shadeCanopy(leafCards(lumps, lod ? { per: 9, size: 1.1, seed: 3 } : { per: 4, size: 1.5, seed: 3 }));
  return leaves.length ? mergeGeometries([cards, ...leaves]) : cards;
}

const dummy = new THREE.Object3D();
// All the trees of one material go into a single BatchedMesh: one draw for the whole forest, each tree culled
// on its own against the view (and the sun's shadow box), and each switching between its full and its light
// version by distance. sets: [{ near, far, items, sink }] — one per variant of the tree.
const NEAR = 240;
const batches = [];
function batched(mat, sets, { cast = true } = {}) {
  let verts = 0, count = 0;
  const geos = [];
  for (const st of sets) for (const g of [st.near, st.far]) { verts += g.attributes.position.count; geos.push(g); }
  for (const st of sets) count += st.items.length;
  const indexed = !!sets[0].near.index;
  let idx = 0; if (indexed) for (const g of geos) idx += g.index.count;
  const m = new THREE.BatchedMesh(Math.max(1, count), verts, indexed ? idx : undefined, mat);
  m.sortObjects = false; // nothing see-through to sort; saves a sort every frame
  m.perObjectFrustumCulled = true;
  m.frustumCulled = false; // the forest as a whole is everywhere; cull tree by tree instead
  m.castShadow = cast; m.receiveShadow = true;
  const ids = [], items = [];
  for (const st of sets) {
    const nearId = m.addGeometry(st.near), farId = m.addGeometry(st.far);
    for (const it of st.items) {
      const id = m.addInstance(farId);
      dummy.position.set(it.x, heightAt(it.x, it.z) - st.sink, it.z);
      dummy.rotation.set(0, it.rot, 0);
      if (it.sv) dummy.scale.copy(it.sv); else dummy.scale.setScalar(it.s);
      dummy.updateMatrix();
      m.setMatrixAt(id, dummy.matrix);
      ids.push(id); items.push({ x: it.x, z: it.z, nearId, farId, lod: 0, on: true });
    }
  }
  batches.push({ m, ids, items, cursor: 0 });
  return m;
}
// a slice of every forest each frame: which trees draw in full, which in the light version, which not at all
// (lost in the haze). The whole land is gone over in a few frames.
export function updateVegetation(camPos, fogDensity) {
  const maxD2 = (2.4 / Math.max(fogDensity, 0.0012)) ** 2, near2 = NEAR * NEAR;
  for (const B of batches) {
    const n = B.items.length, per = Math.min(n, 6000);
    for (let k = 0; k < per; k++) {
      const i = B.cursor; B.cursor = (B.cursor + 1) % n;
      const it = B.items[i], dx = it.x - camPos.x, dz = it.z - camPos.z, d2 = dx * dx + dz * dz;
      const on = d2 < maxD2, lod = d2 < near2 ? 1 : 0;
      if (on !== it.on) { it.on = on; B.m.setVisibleAt(B.ids[i], on); }
      if (on && lod !== it.lod) { it.lod = lod; B.m.setGeometryIdAt(B.ids[i], lod ? it.nearId : it.farId); }
    }
  }
}

// The few kinds of tree in the whole country, and their materials, made once and shared: the neem/mango
// broadleaf, the coconut palm and the eucalyptus (plus bushes). The groves along the railway use them too.
let KIT = null;
export function treeKit() {
  if (KIT) return KIT;
  const trunkMat = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 8, amp: 0.32, flutter: 0 });
  const leafMat = leafMaterial({ height: 8, amp: 0.32, flutter: 0.06, backlight: 0.5 });
  glowMats.push(leafMat);
  leafMats.push(leafMat);
  const palmTrunkMat = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 9, amp: 0.75, flutter: 0 });
  const palmLeafMat = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#22381a' }), { height: 9, amp: 0.75, flutter: 0.1, backlight: 0.55 });
  glowMats.push(palmLeafMat);
  const eucTrunkMat = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 14, amp: 0.4, flutter: 0 });
  const eucLeafMat = leafMaterial({ height: 14, amp: 0.4, flutter: 0.08, backlight: 0.5 });
  glowMats.push(eucLeafMat); leafMats.push(eucLeafMat);
  const bushMat = leafMaterial({ height: 1.4, amp: 0.1, flutter: 0.04, backlight: 0.4 });
  const T = [0, 1, 2].map((v) => ({ v, t: broadleaf(rng(770 + v)), tf: broadleaf(rng(770 + v), 0), p: palm(rng(780 + v)), pf: palm(rng(780 + v), 0), b: bush(rng(790 + v)), bf: bush(rng(790 + v), 0), e: eucalyptus(rng(800 + v)), ef: eucalyptus(rng(800 + v), 0) }));
  KIT = { trunkMat, leafMat, palmTrunkMat, palmLeafMat, eucTrunkMat, eucLeafMat, bushMat, T };
  return KIT;
}
// a forest of one kind of tree from item lists (each item: x, z, s, rot, v = which of the three variants)
export function plantForest(kind, items, sink = 0.15) {
  const K = treeKit(), of = (v) => items.filter((it) => it.v === v), out = [];
  const pick = { broad: ['t', 'tf', K.trunkMat, K.leafMat], palm: ['p', 'pf', K.palmTrunkMat, K.palmLeafMat], euc: ['e', 'ef', K.eucTrunkMat, K.eucLeafMat] }[kind];
  const [nk, fk, tm, lm] = pick;
  if (!items.length) return out;
  out.push(batched(tm, K.T.map((o) => ({ near: o[nk].trunk, far: o[fk].trunk, items: of(o.v), sink }))));
  const leaves = batched(lm, K.T.map((o) => ({ near: o[nk].leaves, far: o[fk].leaves, items: of(o.v), sink })));
  if (kind !== 'palm') leafMeshes.push(leaves);
  out.push(leaves);
  return out;
}

export function buildVegetation() {
  const group = new THREE.Group();
  const R = rng(77);
  const { trunkMat, leafMat, palmTrunkMat, palmLeafMat, bushMat, T } = treeKit();
  // the three variants of each kind of tree share one batch per material
  const of = (list, v) => list.filter((it) => it.v === v);
  const lm = batched(leafMat, T.map((o) => ({ near: o.t.leaves, far: o.tf.leaves, items: of(layout.trees, o.v), sink: 0.15 })));
  leafMeshes.push(lm);
  group.add(lm, batched(trunkMat, T.map((o) => ({ near: o.t.trunk, far: o.tf.trunk, items: of(layout.trees, o.v), sink: 0.15 }))));
  group.add(batched(palmTrunkMat, T.map((o) => ({ near: o.p.trunk, far: o.pf.trunk, items: of(layout.palms, o.v), sink: 0.15 }))));
  group.add(batched(palmLeafMat, T.map((o) => ({ near: o.p.leaves, far: o.pf.leaves, items: of(layout.palms, o.v), sink: 0.15 }))));
  group.add(batched(bushMat, T.map((o) => ({ near: o.b, far: o.bf, items: of(layout.bushes, o.v), sink: 0.1 })), { cast: false }));

  // rocks
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8d877c', roughness: 0.9, flatShading: true });
  const rockItems = layout.rocks.map((r) => ({ ...r, sv: new V3(r.s * 1.2, r.s * 0.6, r.s) }));
  {
    const rm = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, rockItems.length));
    rockItems.forEach((it, i) => { dummy.position.set(it.x, heightAt(it.x, it.z) - 0.2, it.z); dummy.rotation.set(0, it.rot, 0); dummy.scale.copy(it.sv); dummy.updateMatrix(); rm.setMatrixAt(i, dummy.matrix); });
    rm.castShadow = rm.receiveShadow = true; rm.computeBoundingSphere();
    group.add(rm);
  }

  group.add(buildBanyan());
  return group;
}

function buildBanyan() {
  const R = rng(1234);
  const { x, z, y } = layout.banyan;
  const g = new THREE.Group();
  g.position.set(x, y, z);

  const stone = new THREE.MeshStandardMaterial({ color: '#a39a8a', roughness: 0.95 });
  const lime = new THREE.MeshStandardMaterial({ color: '#e6dccb', roughness: 0.9 });
  const plat = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.15, 1.1, 40), stone);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.12, 6, 48), lime);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.55;
  plat.castShadow = plat.receiveShadow = true;
  g.add(plat, rim);
  const shrine = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8).scale(1, 1.3, 1), new THREE.MeshStandardMaterial({ color: '#d3471f', roughness: 0.6 }));
  shrine.position.set(2.4, 0.75, 1.2);
  g.add(shrine);
  // sacred threads tied round the trunk
  const thread = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.03, 4, 40), new THREE.MeshStandardMaterial({ color: '#d63a2a' }));
  thread.rotation.x = Math.PI / 2; thread.position.y = 1.6;
  g.add(thread);

  const trunk = [], lumps = [], roots = [];
  const BK = '#6a5948';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    trunk.push(paint(new THREE.CylinderGeometry(0.75, 1.25, 6.5, 9).translate(Math.cos(a) * 0.8, 3.25, Math.sin(a) * 0.8), BK, R));
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + R() * 0.4, len = 8 + R() * 4, tilt = 1.05 + R() * 0.3;
    trunk.push(paint(new THREE.CylinderGeometry(0.25, 0.65, len, 7).translate(0, len / 2, 0).rotateZ(-tilt).rotateY(a).translate(0, 5 + R(), 0), BK, R));
  }
  // pillar roots that have become trunks
  for (const p of layout.banyan.pillars) {
    const lx = p.x - x, lz = p.z - z;
    trunk.push(paint(new THREE.CylinderGeometry(0.28, 0.42, 9.5, 7).translate(lx, 4.6, lz), BK, R));
  }
  for (let i = 0; i < 80; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 15;
    const yy = 8.5 + (1 - d / 15) * 3.5 + R() * 1.4;
    const r = 2.1 + R() * 1.3;
    R();
    lumps.push({ r, sy: 0.68, c: new V3(Math.cos(a) * d, yy, Math.sin(a) * d), color: GREENS[Math.floor(R() * GREENS.length)] });
  }
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, d = 5.4 + R() * 8;
    const len = 2.5 + R() * 5.5;
    const top = 8.6;
    roots.push(paint(new THREE.CylinderGeometry(0.02, 0.04, len, 4).translate(Math.cos(a) * d, top - len / 2, Math.sin(a) * d), '#9a8770', R));
  }
  const tm = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 14, amp: 0.1, flutter: 0 });
  const lm = leafMaterial({ height: 14, amp: 0.1, flutter: 0.06, backlight: 0.5 });
  glowMats.push(lm);
  leafMats.push(lm);
  const rm = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 14, amp: 0.1, flutter: 0.03 });
  for (const [geos, mat] of [[trunk, tm], [null, lm], [roots, rm]]) {
    // the great crown: many smaller sprays on each bough, so the leaves stay leaf-sized
    const geo = geos ? mergeGeometries(geos) : shadeCanopy(leafCards(lumps, { per: 34, size: 0.5, seed: 9 }));
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (mat === lm) leafMeshes.push(m);
    g.add(m);
  }
  return g;
}
