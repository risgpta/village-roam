// Farming life: sugarcane and sunflower crops, flooded rice paddies, the flower garden's beds,
// and a little red tractor ploughing its field (with a farmer at the wheel and puffs of exhaust).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIELDS, PADDY_Y, heightAt, isBund, layout, GARDEN, dirtMask } from './world.js';
import { applyFoliageWind } from './wind.js';
import { rng } from './noise.js';
import { lathe } from './shapes.js';
import { Puffs } from './particles.js';
import { Person } from './people.js';
import { gardenBeds } from './props.js';

const _c = new THREE.Color();
function paint(geo, hex, jitter = 0, R = Math.random) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  _c.set(hex);
  if (jitter) _c.offsetHSL((R() - 0.5) * 0.04 * jitter, 0, (R() - 0.5) * 0.08 * jitter);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// a long blade-like leaf arching out and drooping from (0,0,0) in direction a
function leaf(len, wid, a, rise, droop, col) {
  const g = new THREE.PlaneGeometry(wid, len, 1, 5).translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len;
    const w = p.getX(i) * (1 - t * 0.85);
    const out = t * len * Math.cos(rise), up = t * len * Math.sin(rise) - droop * t * t * len;
    p.setXYZ(i, w * Math.cos(a) + out * Math.sin(a), up, -w * Math.sin(a) + out * Math.cos(a));
  }
  g.computeVertexNormals();
  return paint(g, col);
}

function sugarcaneClump(R) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const h = 2.4 + R() * 0.9;
    const ox = (R() - 0.5) * 0.3, oz = (R() - 0.5) * 0.3;
    parts.push(paint(new THREE.CylinderGeometry(0.025, 0.035, h, 5, 3).translate(ox, h / 2, oz), i % 2 ? '#7d8a3c' : '#8a7a3e', 1, R));
    for (let k = 0; k < 2; k++) {
      const lf = leaf(1.3 + R() * 0.4, 0.07, R() * Math.PI * 2, 0.9 + R() * 0.4, 0.9, R() < 0.3 ? '#9aa64a' : '#5f8a32');
      lf.translate(ox, h - 0.2 - k * 0.5, oz);
      parts.push(lf);
    }
  }
  return mergeGeometries(parts);
}

function sunflower(R) {
  const parts = [];
  const h = 1.3 + R() * 0.4;
  parts.push(paint(new THREE.CylinderGeometry(0.018, 0.025, h, 4, 2).translate(0, h / 2, 0), '#5f7f2e'));
  for (const [y, a] of [[0.5, 0.3], [0.85, 2.6]]) {
    const lf = new THREE.SphereGeometry(1, 6, 4).scale(0.13, 0.02, 0.1).translate(0.12, 0, 0).rotateY(a).translate(0, h * y, 0);
    parts.push(paint(lf, '#4f7a2a'));
  }
  // head facing the morning sun (east, +x), tilted a little down
  const petals = new THREE.Shape();
  const N = 22;
  for (let i = 0; i <= N * 2; i++) {
    const a = (i / (N * 2)) * Math.PI * 2, r = i % 2 ? 0.19 : 0.11;
    if (i === 0) petals.moveTo(Math.cos(a) * r, Math.sin(a) * r); else petals.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const pg = paint(new THREE.ShapeGeometry(petals), '#f2bf1a');
  const disc = paint(new THREE.CircleGeometry(0.1, 12).translate(0, 0, 0.008), '#4a2a14');
  const back = paint(new THREE.CircleGeometry(0.13, 10).rotateY(Math.PI).translate(0, 0, -0.01), '#5f7f2e');
  const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeRotationZ(-0.35)).premultiply(new THREE.Matrix4().makeTranslation(0.04, h + 0.05, 0));
  for (const g of [pg, disc, back]) parts.push(g.applyMatrix4(m));
  return mergeGeometries(parts);
}

function crops(group, R) {
  const mat = (h, amp) => applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { height: h, amp, flutter: 0.05 });
  const lods = [];
  for (const [type, x0, x1, z0, z1] of FIELDS) {
    if (type !== 4 && type !== 5) continue;
    const cane = type === 4;
    const variants = [0, 1, 2].map(() => (cane ? sugarcaneClump(R) : sunflower(R)));
    const sx = cane ? 1.5 : 1.05, sz = cane ? 1.3 : 0.85;
    const lists = [[], [], []];
    for (let x = x0 + 1; x < x1 - 1; x += sx) for (let z = z0 + 1; z < z1 - 1; z += sz) {
      const px = x + (R() - 0.5) * 0.35, pz = z + (R() - 0.5) * 0.3;
      if (isBund(px, pz) || dirtMask(px, pz) > 0.2) continue;
      lists[Math.floor(R() * 3)].push({ x: px, z: pz, s: 0.85 + R() * 0.3, r: cane ? R() * 6.28 : (R() - 0.5) * 0.5 });
    }
    const m = mat(cane ? 3 : 1.6, cane ? 0.35 : 0.12);
    const d = new THREE.Object3D();
    const fieldGroup = new THREE.Group();
    variants.forEach((geo, v) => {
      const L = lists[v];
      const im = new THREE.InstancedMesh(geo, m, L.length);
      L.forEach((it, i) => {
        d.position.set(it.x, heightAt(it.x, it.z) - 0.05, it.z);
        d.rotation.set(0, it.r, 0);
        d.scale.setScalar(it.s);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      fieldGroup.add(im);
    });
    group.add(fieldGroup);
    lods.push({ g: fieldGroup, x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 });
  }
  return lods;
}

function paddyWater(group) {
  const f = FIELDS.find((q) => q[0] === 3);
  const [, x0, x1, z0, z1] = f;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSky: { value: new THREE.Color('#c9dcec') }, uNight: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uNight; uniform vec3 uSky; varying vec3 vW;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        float n = vn(vW.xz * 1.5 + uTime * 0.2) * 0.5 + vn(vW.xz * 4.0 - uTime * 0.3) * 0.5;
        float fres = 0.05 + 0.6 * pow(1.0 - max(V.y, 0.0), 4.0);
        vec3 col = mix(vec3(0.16, 0.2, 0.13), uSky * (0.75 + n * 0.2), fres);
        col = mix(col, col * vec3(0.3, 0.38, 0.55), uNight);
        gl_FragColor = vec4(col, 0.78);
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 3, z1 - z0 - 3).rotateX(-Math.PI / 2), mat);
  m.position.set((x0 + x1) / 2, PADDY_Y + 0.12, (z0 + z1) / 2);
  m.renderOrder = 1;
  group.add(m);
  return mat;
}

function gardenFlowers(group, R) {
  const G = GARDEN;
  const gy = heightAt(G.x, G.z);
  const stemGeo = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.007, 0.01, 1, 3).translate(0, 0.5, 0), '#3f6f2a'),
    paint(new THREE.SphereGeometry(1, 5, 3).scale(0.05, 0.012, 0.03).translate(0.04, 0.45, 0), '#4f7f32'),
    paint(new THREE.SphereGeometry(1, 5, 3).scale(0.05, 0.012, 0.03).translate(-0.04, 0.3, 0), '#4f7f32'),
  ]);
  const bloomGeos = {
    pom: new THREE.IcosahedronGeometry(0.055, 1), // marigold
    cup: lathe([[0.0, -0.02], [0.04, -0.01], [0.05, 0.03], [0.035, 0.05]], 8), // rose
    star: new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.025 : 0.06; if (!i) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r); } return s; })()).rotateX(-Math.PI / 2),
  };
  const kinds = [
    { geo: 'pom', cols: ['#f08a12', '#f5b818', '#e86a10'], h: [0.35, 0.55], step: 0.2 },
    { geo: 'cup', cols: ['#c41e3a', '#e0457b', '#f4f0f2'], h: [0.4, 0.6], step: 0.26 },
    { geo: 'star', cols: ['#8a4fc8', '#f6f2ea', '#e65a9a', '#3a6fd8'], h: [0.2, 0.32], step: 0.16 },
  ];
  const beds = gardenBeds();
  const items = { stem: [] };
  for (const k of Object.keys(bloomGeos)) items[k] = [];
  beds.forEach((b, bi) => {
    const kind = kinds[bi % kinds.length];
    for (let x = -b.w / 2 + 0.1; x < b.w / 2 - 0.05; x += kind.step) for (let z = -b.d / 2 + 0.1; z < b.d / 2 - 0.05; z += kind.step) {
      const px = G.x + b.x + x + (R() - 0.5) * 0.06, pz = G.z + b.z + z + (R() - 0.5) * 0.06;
      const h = kind.h[0] + R() * (kind.h[1] - kind.h[0]);
      const y = gy + 0.15;
      items.stem.push({ x: px, y, z: pz, h, r: R() * 6.28 });
      items[kind.geo].push({ x: px, y: y + h, z: pz, r: R() * 6.28, col: kind.cols[Math.floor(R() * kind.cols.length)] });
    }
  });
  const d = new THREE.Object3D();
  const stemMat = applyFoliageWind(new THREE.MeshLambertMaterial({ vertexColors: true }), { height: 0.6, amp: 0.05, flutter: 0.02 });
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, items.stem.length);
  items.stem.forEach((it, i) => { d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.r, 0); d.scale.set(1, it.h, 1); d.updateMatrix(); stems.setMatrixAt(i, d.matrix); });
  stems.computeBoundingSphere();
  group.add(stems);
  const bloomMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: '#221408' });
  for (const k of Object.keys(bloomGeos)) {
    const L = items[k];
    const im = new THREE.InstancedMesh(bloomGeos[k], bloomMat, L.length);
    L.forEach((it, i) => {
      d.position.set(it.x, it.y, it.z); d.rotation.set(0, it.r, 0); d.scale.setScalar(1); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      im.setColorAt(i, _c.set(it.col));
    });
    im.castShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  }
  // hibiscus bushes in the corners
  const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), new THREE.MeshLambertMaterial({ color: '#3f6a2a' }));
  const red = new THREE.MeshLambertMaterial({ color: '#d4202c', emissive: '#300' });
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const b = bush.clone();
    b.position.set(G.x + sx * (G.hw - 0.8), gy + 0.45, G.z + sz * (G.hd - 0.8));
    b.castShadow = true;
    group.add(b);
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.07, 6), red);
      const a = R() * 6.28, e = R() * 1.2;
      f.position.set(b.position.x + Math.cos(a) * Math.cos(e) * 0.56, b.position.y + Math.sin(e) * 0.5, b.position.z + Math.sin(a) * Math.cos(e) * 0.56);
      f.lookAt(b.position.x + Math.cos(a) * 3, b.position.y + Math.sin(e) * 3, b.position.z + Math.sin(a) * 3);
      group.add(f);
    }
  }
}

// ---------------- the tractor ----------------
function tractorModel() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#c0281e', roughness: 0.45, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1e1d1c', roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({ color: '#9a9ea2', metalness: 0.7, roughness: 0.35 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#e2b628', roughness: 0.5 });
  const add = (geo, m, x, y, z, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  add(new THREE.BoxGeometry(0.7, 0.62, 1.55), red, 0, 1.0, 0.65);
  add(new THREE.CylinderGeometry(0.35, 0.35, 0.7, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), red, 0, 1.3, 0.65).scale.set(1, 0.5, 1);
  add(new THREE.BoxGeometry(0.62, 0.5, 0.05), dark, 0, 0.98, 1.44);
  for (const sx of [-0.22, 0.22]) add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fff5d8', emissive: '#ffe2a0', emissiveIntensity: 0.4 }), sx, 1.18, 1.45);
  add(new THREE.BoxGeometry(0.5, 0.5, 0.9), dark, 0, 0.72, 0.6); // engine block
  add(new THREE.BoxGeometry(0.8, 0.5, 0.9), red, 0, 0.85, -0.5); // gearbox / body
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.8, 8), dark, 0.25, 1.65, 0.95); // exhaust stack
  add(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 8), dark, 0.25, 2.06, 0.95);
  // seat, steering
  add(new THREE.BoxGeometry(0.42, 0.08, 0.36), dark, 0, 1.2, -0.62);
  add(new THREE.BoxGeometry(0.42, 0.32, 0.06), dark, 0, 1.38, -0.82);
  const col = add(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), steel, 0, 1.42, -0.15);
  col.rotation.x = -0.5;
  const sw = add(new THREE.TorusGeometry(0.17, 0.02, 6, 18), dark, 0, 1.66, -0.28);
  sw.rotation.x = Math.PI / 2 - 0.5;
  // mudguards
  for (const sx of [-1, 1]) {
    const mg = add(new THREE.CylinderGeometry(0.75, 0.75, 0.42, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), red, sx * 0.76, 0.66, -0.55);
    mg.material = new THREE.MeshStandardMaterial({ color: '#c0281e', roughness: 0.45, side: THREE.DoubleSide });
  }
  const wheels = [];
  const tyre = (r, w, x, y, z) => {
    const wg = new THREE.Group();
    wg.position.set(x, y, z);
    g.add(wg);
    add(new THREE.CylinderGeometry(r, r, w, 22).rotateZ(Math.PI / 2), dark, 0, 0, 0, wg);
    add(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 16).rotateZ(Math.PI / 2), yellow, 0, 0, 0, wg);
    const n = Math.round(r * 26);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lug = add(new THREE.BoxGeometry(w * 0.9, 0.05, 0.08), dark, 0, Math.cos(a) * r, Math.sin(a) * r, wg);
      lug.rotation.x = -a;
      lug.rotation.y = (i % 2 ? 0.35 : -0.35);
    }
    wheels.push({ g: wg, r });
    return wg;
  };
  tyre(0.65, 0.36, -0.78, 0.65, -0.55); tyre(0.65, 0.36, 0.78, 0.65, -0.55);
  const fl = tyre(0.34, 0.16, -0.5, 0.34, 1.15), fr = tyre(0.34, 0.16, 0.5, 0.34, 1.15);
  // a disc plough behind
  const plough = new THREE.Group();
  plough.position.set(0, 0, -1.45);
  g.add(plough);
  add(new THREE.BoxGeometry(1.5, 0.1, 0.1), steel, 0, 0.55, 0, plough);
  add(new THREE.BoxGeometry(0.08, 0.1, 0.7), steel, 0, 0.55, 0.3, plough);
  for (const x of [-0.5, 0, 0.5]) {
    add(new THREE.BoxGeometry(0.05, 0.4, 0.05), steel, x, 0.35, 0, plough);
    const disc = add(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 14).rotateZ(Math.PI / 2), steel, x, 0.16, -0.05, plough);
    disc.rotation.y = 0.4;
  }
  return { g, wheels, front: [fl, fr], stack: new THREE.Vector3(0.25, 2.1, 0.95) };
}

class Tractor {
  constructor(scene) {
    const f = layout.tractorField;
    const m = tractorModel();
    Object.assign(this, m);
    scene.add(this.g);
    // the farmer at the wheel
    this.driver = new Person({ dress: 'dhoti', top: '#e4ddc8', bottom: '#efe9dc', headwear: 'turban', turban: '#f0c419', mustache: true, skin: '#76492f', sleeves: 'short' });
    this.driver.seatH = 0;
    this.driver.root.position.set(0, 1.22, -0.6);
    this.g.add(this.driver.root);
    // boustrophedon path over the field, with U-turns at the headlands
    const pts = [];
    const xa = f.x0 + 5, xb = f.x1 - 5, R = 2.2;
    let dir = 1;
    for (let z = f.z0 + 4; z < f.z1 - 4 - R * 2; z += R * 2) {
      const [xs, xe] = dir > 0 ? [xa, xb] : [xb, xa];
      pts.push(new THREE.Vector2(xs, z), new THREE.Vector2(xe, z));
      for (let i = 1; i < 10; i++) {
        const a = (i / 10) * Math.PI;
        pts.push(new THREE.Vector2(xe + dir * Math.sin(a) * R, z + R - Math.cos(a) * R));
      }
      dir = -dir;
    }
    // back to the start along the field's edge
    const last = pts[pts.length - 1];
    pts.push(new THREE.Vector2(last.x, f.z0 + 1.5), new THREE.Vector2(xa - 2, f.z0 + 1.5), new THREE.Vector2(xa - 2, f.z0 + 4), new THREE.Vector2(xa, f.z0 + 4));
    this.pts = pts;
    this.seg = [0];
    for (let i = 1; i < pts.length; i++) this.seg.push(this.seg[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.total = this.seg[this.seg.length - 1];
    this.s = 0;
    this.speed = 2.4;
    this.box = { kind: 'b', x: 0, z: 0, rot: 0, hw: 1.0, hd: 2.3 };
    this.smoke = new Puffs({ max: 90, color: '#8a8680', dark: '#3a3836', opacity: 0.7, buoyancy: 0.5, drag: 0.9 });
    scene.add(this.smoke.mesh);
    this.acc = 0;
    this.heading = 0;
    this._v = new THREE.Vector3();
    this.paused = 0;
  }
  at(s, out) {
    s = ((s % this.total) + this.total) % this.total;
    let i = 1;
    while (i < this.seg.length - 1 && this.seg[i] < s) i++;
    const a = this.pts[i - 1], b = this.pts[i];
    const t = (s - this.seg[i - 1]) / (this.seg[i] - this.seg[i - 1] || 1);
    return out.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  update(dt, t, player) {
    // stop for the boy if he stands in the way
    const p = this.at(this.s, new THREE.Vector2());
    const ahead = this.at(this.s + 2.2, new THREE.Vector2());
    const blocked = Math.hypot(player.x - ahead.x, player.z - ahead.y) < 1.6;
    const v = blocked ? 0 : this.speed;
    this.s += v * dt;
    const q = this.at(this.s + 0.6, new THREE.Vector2());
    const want = Math.atan2(q.x - p.x, q.y - p.y);
    let dh = ((want - this.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.heading += dh * (1 - Math.exp(-dt * 6));
    this.g.position.set(p.x, heightAt(p.x, p.y), p.y);
    this.g.rotation.y = this.heading;
    this.g.rotation.z = Math.sin(t * 9) * 0.006; // engine shake
    for (const w of this.wheels) w.g.rotation.x += (v * dt) / w.r;
    for (const w of this.front) w.rotation.y = Math.max(-0.5, Math.min(0.5, dh * 3));
    this.box.x = p.x + Math.sin(this.heading) * -0.2; this.box.z = p.y + Math.cos(this.heading) * -0.2; this.box.rot = this.heading;
    this.driver.update(dt, 0, 'drive');
    const near = Math.abs(player.x - p.x) + Math.abs(player.z - p.y) < 200;
    if (near) {
      this.acc += dt * (blocked ? 3 : 7);
      this.g.updateMatrixWorld();
      const s = this.g.localToWorld(this._v.copy(this.stack));
      while (this.acc > 1) {
        this.acc -= 1;
        this.smoke.emit(s.x, s.y, s.z, (Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, 2.2 + Math.random(), 0.15, 1.1, 0.6, 0.1);
      }
    }
    this.smoke.update(dt);
    this.pos = p;
  }
}

export function buildFarm(scene) {
  const R = rng(9090);
  const group = new THREE.Group();
  const lods = crops(group, R);
  const paddy = paddyWater(group);
  const paddyMesh = group.children[group.children.length - 1];
  gardenFlowers(group, R);
  scene.add(group);
  const tractor = new Tractor(scene);
  return {
    tractor,
    paddy,
    setTheme({ night, sky }) {
      paddy.uniforms.uNight.value = night ? 0.8 : 0;
      paddy.uniforms.uSky.value.set(sky).multiplyScalar(night ? 0.4 : 0.85);
    },
    cropsOn: true,
    setSeason(season) {
      this.cropsOn = season === 'spring' || season === 'summer';
      paddyMesh.visible = season === 'spring';
    },
    update(dt, t, player) {
      paddy.uniforms.uTime.value = t;
      for (const l of lods) l.g.visible = this.cropsOn && Math.hypot(l.x - player.x, l.z - player.z) - l.r < 320;
      tractor.update(dt, t, player);
    },
    colliders() { return [tractor.box]; },
    tractorDistance(x, z) { return tractor.pos ? Math.hypot(tractor.pos.x - x, tractor.pos.y - z) : 999; },
  };
}
