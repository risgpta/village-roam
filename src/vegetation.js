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

function lumpy(r, seed = 0) {
  const g = new THREE.IcosahedronGeometry(r, 1);
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

const GREENS = ['#4a7a2c', '#5a8832', '#669036', '#3f6c2a', '#6e963a', '#527d2e'];
const BARK = '#5a4330';

function broadleaf(R) {
  const trunk = [], leaves = [];
  const th = 2.4 + R() * 1.4;
  trunk.push(paint(new THREE.CylinderGeometry(0.2, 0.36, th, 7).translate(0, th / 2, 0), BARK, R));
  const nb = 3 + Math.floor(R() * 3);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + R() * 0.8, len = 1.4 + R() * 1.4, tilt = 0.55 + R() * 0.5;
    const by = th * (0.72 + R() * 0.2);
    trunk.push(paint(new THREE.CylinderGeometry(0.07, 0.15, len, 5).translate(0, len / 2, 0).rotateZ(-tilt).rotateY(a).translate(0, by, 0), BARK, R));
    const ex = Math.sin(tilt) * len, ey = Math.cos(tilt) * len;
    const end = new V3(ex * Math.cos(a), by + ey, -ex * Math.sin(a));
    const nl = 2 + Math.floor(R() * 2);
    for (let k = 0; k < nl; k++) {
      const r = 0.95 + R() * 0.8;
      leaves.push(paint(lumpy(r, R() * 10).scale(1, 0.78, 1)
        .translate(end.x + (R() - 0.5) * 1.3, end.y + (R() - 0.2) * 0.8, end.z + (R() - 0.5) * 1.3), GREENS[Math.floor(R() * GREENS.length)], R));
    }
  }
  leaves.push(paint(lumpy(1.7 + R() * 0.7, R() * 10).scale(1, 0.8, 1).translate(0, th + 1.5 + R() * 0.5, 0), GREENS[Math.floor(R() * GREENS.length)], R));
  return { trunk: mergeGeometries(trunk), leaves: shadeCanopy(mergeGeometries(leaves)) };
}

function frond(a, e0, L) {
  const n = 10;
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

function palm(R) {
  const trunk = [], leaves = [];
  const h = 6.5 + R() * 3.5, lean = 0.6 + R() * 1.8;
  const curve = new THREE.CatmullRomCurve3([new V3(0, 0, 0), new V3(lean * 0.12, h * 0.33, 0), new V3(lean * 0.45, h * 0.66, 0), new V3(lean, h, 0)]);
  trunk.push(paint(new THREE.TubeGeometry(curve, 14, 0.18, 7, false), '#8a7660', R));
  trunk.push(paint(new THREE.CylinderGeometry(0.26, 0.3, 0.5, 7).translate(0, 0.25, 0), '#7a6650', R));
  trunk.push(paint(new THREE.SphereGeometry(0.3, 8, 6).translate(lean, h, 0), '#6b5a3a', R));
  for (let k = 0; k < 5; k++) {
    const a = R() * Math.PI * 2;
    trunk.push(paint(new THREE.SphereGeometry(0.15, 7, 5).translate(lean + Math.cos(a) * 0.3, h - 0.28, Math.sin(a) * 0.3), '#5d6b2a', R));
  }
  const nf = 10 + Math.floor(R() * 4);
  for (let f = 0; f < nf; f++) {
    const a = (f / nf) * Math.PI * 2 + R() * 0.4;
    const e0 = 0.6 - R() * 0.8;
    const L = 3.0 + R() * 1.3;
    leaves.push(paint(frond(a, e0, L).translate(lean, h, 0), ['#4d7a28', '#5e8a2c', '#6e9134', '#46702a'][f % 4], R));
  }
  return { trunk: mergeGeometries(trunk), leaves: mergeGeometries(leaves) };
}

function bush(R) {
  const leaves = [];
  const n = 2 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.5 + R() * 0.5;
    leaves.push(paint(lumpy(r, R() * 10).scale(1, 0.75, 1).translate((R() - 0.5) * 1.1, r * 0.55, (R() - 0.5) * 1.1), ['#3a5f25', '#4a6e2a', '#5a7a30'][i % 3], R));
  }
  if (R() < 0.3) {
    for (let i = 0; i < 6; i++) leaves.push(paint(new THREE.IcosahedronGeometry(0.09, 0).translate((R() - 0.5) * 1.2, 0.5 + R() * 0.5, (R() - 0.5) * 1.2), R() < 0.5 ? '#e05a7a' : '#f0a020', R, 0));
  }
  return shadeCanopy(mergeGeometries(leaves));
}

const dummy = new THREE.Object3D();
function instanced(geo, mat, items, { cast = true, sink = 0.15 } = {}) {
  if (!items.length) return new THREE.Group();
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, i) => {
    dummy.position.set(it.x, heightAt(it.x, it.z) - sink, it.z);
    dummy.rotation.set(0, it.rot, 0);
    if (it.sv) dummy.scale.copy(it.sv); else dummy.scale.setScalar(it.s);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
  });
  m.castShadow = cast;
  m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

export function buildVegetation() {
  const group = new THREE.Group();
  const R = rng(77);

  const trunkMat = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 8, amp: 0.32, flutter: 0 });
  const leafMat = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#22381a' }), { height: 8, amp: 0.32, flutter: 0.05 });
  glowMats.push(leafMat);
  leafMats.push(leafMat);
  const palmTrunkMat = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 9, amp: 0.75, flutter: 0 });
  const palmLeafMat = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: '#22381a' }), { height: 9, amp: 0.75, flutter: 0.1 });
  glowMats.push(palmLeafMat);
  const bushMat = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 1.4, amp: 0.1, flutter: 0.03 });

  for (let v = 0; v < 3; v++) {
    const t = broadleaf(R);
    const items = layout.trees.filter((it) => it.v === v);
    const lm = instanced(t.leaves, leafMat, items);
    leafMeshes.push(lm);
    group.add(instanced(t.trunk, trunkMat, items), lm);
    const p = palm(R);
    const pitems = layout.palms.filter((it) => it.v === v);
    group.add(instanced(p.trunk, palmTrunkMat, pitems), instanced(p.leaves, palmLeafMat, pitems));
    const b = bush(R);
    group.add(instanced(b, bushMat, layout.bushes.filter((it) => it.v === v), { cast: false, sink: 0.1 }));
  }

  // rocks
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#8d877c', roughness: 0.9, flatShading: true });
  const rockItems = layout.rocks.map((r) => ({ ...r, sv: new V3(r.s * 1.2, r.s * 0.6, r.s) }));
  group.add(instanced(rockGeo, rockMat, rockItems, { sink: 0.2 }));

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

  const trunk = [], leaves = [], roots = [];
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
    leaves.push(paint(lumpy(r, R() * 10).scale(1, 0.68, 1).translate(Math.cos(a) * d, yy, Math.sin(a) * d), GREENS[Math.floor(R() * GREENS.length)], R));
  }
  for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, d = 5.4 + R() * 8;
    const len = 2.5 + R() * 5.5;
    const top = 8.6;
    roots.push(paint(new THREE.CylinderGeometry(0.02, 0.04, len, 4).translate(Math.cos(a) * d, top - len / 2, Math.sin(a) * d), '#9a8770', R));
  }
  const tm = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 14, amp: 0.1, flutter: 0 });
  const lm = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#22381a' }), { height: 14, amp: 0.1, flutter: 0.06 });
  glowMats.push(lm);
  leafMats.push(lm);
  const rm = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 14, amp: 0.1, flutter: 0.03 });
  for (const [geos, mat, shade] of [[trunk, tm], [leaves, lm, true], [roots, rm]]) {
    let geo = mergeGeometries(geos);
    if (shade) geo = shadeCanopy(geo);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (mat === lm) leafMeshes.push(m);
    g.add(m);
  }
  return g;
}
