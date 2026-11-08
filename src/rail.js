// The railway: ballast, sleepers, rails, a girder bridge over the river, tunnel portals in the hills,
// a level crossing with a gatekeeper's hut — and a passenger train that passes once a minute.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK, TRACK3, TRACKS, RING, TRACK_Y, riverX, RIVER_HALF, WATER_Y, CROSSING, CROSSING3, heightAt, colliders, roadX, BORE_HALF, ROAD_X } from './world.js';
import { toTexture } from './textures.js';
import { lathe, boulder } from './shapes.js';
import { Puffs } from './particles.js';
import { Person } from './people.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const RAIL_TOP = TRACK_Y + 0.42;
const GAUGE = 0.84; // half gauge (broad gauge ≈ 1.68 m)

let TK = TRACK; // the line currently being built
function trackPoint(x) {
  const z = TK.z(x);
  const t = new THREE.Vector3(1, 0, TK.slope(x)).normalize();
  return { p: new THREE.Vector3(x, TRACK_Y, z), t, n: new THREE.Vector3(-t.z, 0, t.x) };
}
const nearRiver = (x) => Math.abs(x - TK.xr) < RIVER_HALF + 9 && TK.open(TK.xr);

// a cross-section profile swept along a stretch of a line's path (s0 → s1)
function ribbonS(P, s0, s1, step, profile, mat) {
  const pos = [], idx = [], uv = [];
  const n = Math.max(1, Math.ceil((s1 - s0) / step));
  const q = {};
  for (let i = 0; i <= n; i++) {
    const t = s0 + ((s1 - s0) * i) / n;
    P.at(t, q);
    const nx = -q.tz, nz = q.tx;
    for (const [o, y] of profile) { pos.push(q.x + nx * o, y, q.z + nz * o); uv.push(o * 0.5, t * 0.5); }
  }
  const m = profile.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = a + m; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
function ribbon(x0, x1, step, profile, mat) {
  // profile: array of [offset, y]; extruded along the track
  const pos = [], idx = [], uv = [];
  const n = Math.ceil((x1 - x0) / step);
  let along = 0, last = null;
  for (let i = 0; i <= n; i++) {
    const { p, n: nn } = trackPoint(x0 + (i * (x1 - x0)) / n);
    if (last) along += p.distanceTo(last);
    last = p;
    for (const [o, y] of profile) { pos.push(p.x + nn.x * o, y, p.z + nn.z * o); uv.push(o * 0.5, along * 0.5); }
  }
  const m = profile.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = a + m;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// Vintage maroon coach side: lined panels, barred windows, class numerals
function coachTexture(night = false, L = { base: '#6a1d18', line: '#e2c37a', dark: '#4a1310', door: '#5a1814' }) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = night ? '#000' : L.base;
  g.fillRect(0, 0, 1024, 256);
  if (!night) {
    // plank seams and panel lining
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < 1024; x += 16) g.fillRect(x, 0, 1, 256);
    g.fillStyle = L.line;
    g.fillRect(0, 52, 1024, 4); g.fillRect(0, 178, 1024, 4); g.fillRect(0, 238, 1024, 3);
    g.fillStyle = L.dark;
    g.fillRect(0, 244, 1024, 12);
    g.fillStyle = L.line;
    g.font = 'bold 34px Georgia, serif';
    g.textAlign = 'center';
    g.fillText('III', 512, 222);
  }
  for (let i = 0; i < 10; i++) {
    const x = 128 + i * 77;
    if (i === 4 || i === 5) continue;
    g.fillStyle = night ? '#ffc874' : '#15110e';
    g.fillRect(x, 74, 50, 86);
    if (!night) {
      g.strokeStyle = L.line; g.lineWidth = 3; g.strokeRect(x - 3, 71, 56, 92);
      g.fillStyle = '#8a8f94';
      for (let k = 1; k < 6; k++) g.fillRect(x + k * 8.3, 74, 2, 86);
      g.fillRect(x, 116, 50, 3);
    } else {
      g.fillStyle = '#000';
      for (let k = 1; k < 6; k++) g.fillRect(x + k * 8.3, 74, 2, 86);
    }
  }
  for (const x of [22, 942]) {
    g.fillStyle = night ? '#000' : L.door;
    g.fillRect(x, 64, 60, 172);
    if (!night) { g.strokeStyle = L.line; g.lineWidth = 3; g.strokeRect(x, 64, 60, 172); }
    g.fillStyle = night ? '#ffc874' : '#15110e';
    g.fillRect(x + 14, 80, 32, 46);
  }
  return c;
}

// A spoked, flanged wheel (axis along x). Two material groups: steel tyre, painted centre.
const wheelGeoCache = new Map();
function wheelGeo(r, spokes, crank = false) {
  const key = r + ':' + spokes + ':' + crank;
  if (wheelGeoCache.has(key)) return wheelGeoCache.get(key);
  const tire = new THREE.LatheGeometry([[r - 0.07, -0.07], [r, -0.07], [r, 0.04], [r + 0.045, 0.05], [r + 0.045, 0.07], [r - 0.07, 0.07], [r - 0.07, -0.07]].map(([a, b]) => new THREE.Vector2(a, b)), 30).rotateZ(Math.PI / 2);
  const parts = [];
  const hubR = Math.max(0.09, r * 0.17);
  for (let i = 0; i < spokes; i++) {
    const len = r - 0.06 - hubR;
    parts.push(new THREE.BoxGeometry(0.05, len, 0.055).translate(0, hubR + len / 2, 0).rotateX((i / spokes) * Math.PI * 2));
  }
  parts.push(new THREE.CylinderGeometry(hubR, hubR, 0.16, 14).rotateZ(Math.PI / 2));
  parts.push(new THREE.CylinderGeometry(hubR * 0.5, hubR * 0.5, 0.26, 8).rotateZ(Math.PI / 2));
  if (crank) {
    parts.push(new THREE.BoxGeometry(0.07, r * 0.32, r * 0.75).translate(0, -r * 0.6, 0)); // counterweight
    parts.push(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 8).rotateZ(Math.PI / 2).translate(0, 0.35, 0)); // crank pin
  }
  const centre = mergeGeometries(parts);
  const g = mergeGeometries([tire.toNonIndexed(), centre.toNonIndexed()], true);
  wheelGeoCache.set(key, g);
  return g;
}

function buildCoach(mats) {
  const g = new THREE.Group();
  const L = 16, W = 2.9, H = 2.5, base = 1.55;
  const wheels = [];
  const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const body = add(new THREE.BoxGeometry(L, H, W), [mats.end, mats.end, mats.roof, mats.under, mats.side, mats.side], 0, base + H / 2, 0);
  body.rotation.y = Math.PI / 2;
  add(new THREE.CylinderGeometry(1.52, 1.52, L + 0.3, 20, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(0.98, 0.27, 1), mats.roof, 0, base + H, 0);
  for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.13, 0.15, 0.22, 10), mats.roof, 0, base + H + 0.45, -L / 2 + 2.5 + i * 3.7); // roof vents
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.24, L), mats.under, sx * 1.36, base - 0.08, 0); // sole bars
  for (const sz of [-1, 1]) {
    // end: buffers, gangway, steps
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 8).rotateX(Math.PI / 2), mats.under, sx * 0.85, base - 0.05, sz * (L / 2 + 0.2));
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14).rotateX(Math.PI / 2), mats.wheel, sx * 0.85, base - 0.05, sz * (L / 2 + 0.43));
      add(new THREE.BoxGeometry(0.5, 0.05, 0.3), mats.under, sx * 1.3, base - 0.45, sz * (L / 2 - 0.6));
    }
    add(new THREE.BoxGeometry(1.1, 2.0, 0.35), mats.under, 0, base + 1.05, sz * (L / 2 + 0.15));
    // bogie: side frames outside the wheels, leaf springs, axle boxes
    const bogie = new THREE.Group();
    bogie.position.set(0, 0, sz * (L / 2 - 2.6));
    g.add(bogie);
    add(new THREE.BoxGeometry(2.2, 0.2, 0.36), mats.under, 0, 1.3, 0, bogie);
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.08, 0.2, 2.9), mats.under, sx * 1.02, 0.95, 0, bogie);
      add(new THREE.BoxGeometry(0.08, 0.12, 1.6), mats.under, sx * 1.02, 0.66, 0, bogie);
      for (const wz of [-0.95, 0.95]) {
        add(new THREE.BoxGeometry(0.16, 0.26, 0.3), mats.under, sx * 1.04, 0.88, wz, bogie);
        add(new THREE.SphereGeometry(1, 10, 6).scale(0.06, 0.07, 0.5), mats.wheel, sx * 1.04, 1.14, wz, bogie);
      }
    }
    for (const wz of [-0.95, 0.95]) {
      const axle = new THREE.Group();
      axle.position.set(0, 0.88, wz);
      bogie.add(axle);
      add(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8).rotateZ(Math.PI / 2), mats.under, 0, 0, 0, axle);
      for (const wx of [-GAUGE, GAUGE]) add(wheelGeo(0.46, 8), [mats.tyre, mats.wheel], wx, 0, 0, axle);
      wheels.push({ o: axle, r: 0.46 });
    }
  }
  return { g, L, wheels };
}

function buildTender(mats) {
  const g = new THREE.Group();
  const L = 7.2;
  const wheels = [];
  const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  add(new THREE.BoxGeometry(2.7, 0.35, 7.0), mats.under, 0, 1.45, 0);
  add(new THREE.BoxGeometry(2.8, 1.75, 6.6), mats.black, 0, 2.5, -0.1);
  add(new THREE.BoxGeometry(2.86, 0.1, 6.66), mats.brass, 0, 3.38, -0.1);
  add(new THREE.BoxGeometry(2.86, 0.06, 6.66), mats.red, 0, 1.68, -0.1);
  const coal = add(boulder(1.0, 7, { moss: 0, base: '#1a1816', detail: 2 }), mats.coal, 0, 3.35, 1.1);
  coal.scale.set(1.28, 0.42, 2.0);
  add(new THREE.CylinderGeometry(0.28, 0.3, 0.25, 12), mats.black, 0, 3.5, -2.6);
  for (const sz of [-1, 1]) {
    const bz = sz * 2.2;
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.08, 0.22, 2.4), mats.under, sx * 1.02, 0.92, bz);
      for (const wz of [-0.65, 0.65]) add(new THREE.BoxGeometry(0.16, 0.26, 0.28), mats.under, sx * 1.04, 0.88, bz + wz);
    }
    for (const wz of [-0.65, 0.65]) {
      const axle = new THREE.Group();
      axle.position.set(0, 0.88, bz + wz);
      g.add(axle);
      add(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 8).rotateZ(Math.PI / 2), mats.under, 0, 0, 0, axle);
      for (const wx of [-GAUGE, GAUGE]) add(wheelGeo(0.46, 8), [mats.tyre, mats.wheel], wx, 0, 0, axle);
      wheels.push({ o: axle, r: 0.46 });
    }
  }
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14).rotateX(Math.PI / 2), mats.tyre, sx * 0.85, 1.55, -L / 2 - 0.1);
  return { g, L, wheels };
}

// A vintage 2-6-2 steam locomotive: black boiler with brass bands, red spoked drivers, working rods.
function buildLoco(mats) {
  const g = new THREE.Group();
  const L = 13;
  const wheels = [];
  const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const alongZ = (geo) => geo.rotateX(Math.PI / 2);
  const { black, red, brass, under, graphite } = mats;
  // frames and footplate
  add(new THREE.BoxGeometry(1.36, 0.6, 12.2), under, 0, 1.25, 0);
  add(new THREE.BoxGeometry(2.9, 0.07, 9.8), black, 0, 2.13, 1.0);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.14, 9.8), red, sx * 1.45, 2.07, 1.0);
  // boiler, smokebox, chimney, domes
  add(alongZ(new THREE.CylinderGeometry(0.86, 0.86, 7.2, 28)), black, 0, 3.02, 0.4);
  for (const z of [-2.2, -0.6, 1.0, 2.6]) add(new THREE.TorusGeometry(0.868, 0.028, 6, 32), brass, 0, 3.02, z);
  add(alongZ(new THREE.CylinderGeometry(0.93, 0.93, 1.3, 28)), graphite, 0, 3.02, 4.62);
  add(alongZ(new THREE.CylinderGeometry(0.82, 0.82, 0.06, 28)), graphite, 0, 3.02, 5.29);
  add(new THREE.SphereGeometry(0.1, 10, 8), brass, 0, 3.02, 5.33);
  add(new THREE.BoxGeometry(1.7, 0.7, 1.3), graphite, 0, 2.45, 4.62);
  add(lathe([[0.38, 0], [0.27, 0.14], [0.24, 0.6], [0.28, 0.76], [0.37, 0.88], [0.37, 0.95], [0.3, 0.97]], 20), graphite, 0, 3.78, 4.62);
  add(lathe([[0.46, 0], [0.43, 0.2], [0.31, 0.42], [0.12, 0.5], [0, 0.51]], 22), brass, 0, 3.72, 1.6);
  add(lathe([[0.38, 0], [0.33, 0.18], [0.15, 0.32], [0, 0.33]], 18), black, 0, 3.74, -0.6);
  for (const sx of [-0.12, 0.12]) add(new THREE.CylinderGeometry(0.06, 0.07, 0.32, 8), brass, sx, 3.98, -2.5);
  add(lathe([[0.04, 0], [0.04, 0.18], [0.07, 0.24], [0.06, 0.36], [0.0, 0.38]], 10), brass, 0.25, 3.85, -2.95);
  for (const sx of [-1, 1]) add(alongZ(new THREE.CylinderGeometry(0.022, 0.022, 7.0, 6)), brass, sx * 0.94, 3.35, 0.6);
  // headlamp
  add(alongZ(new THREE.CylinderGeometry(0.2, 0.22, 0.36, 14)), graphite, 0, 4.06, 5.05);
  mats.lamp = mats.lamp ?? new THREE.MeshStandardMaterial({ color: '#fff6dd', emissive: '#ffe2a8', emissiveIntensity: 3 });
  add(new THREE.CircleGeometry(0.17, 16), mats.lamp, 0, 4.06, 5.24);
  // cab with spectacle windows and an arched roof
  add(new THREE.BoxGeometry(2.9, 2.45, 0.08), black, 0, 3.34, -3.3);
  for (const sx of [-1, 1]) {
    add(new THREE.CircleGeometry(0.26, 16), mats.glass, sx * 0.88, 4.0, -3.25);
    add(new THREE.TorusGeometry(0.27, 0.035, 6, 18), brass, sx * 0.88, 4.0, -3.25);
    add(new THREE.BoxGeometry(0.08, 1.05, 3.2), black, sx * 1.42, 2.65, -4.9);
    add(new THREE.BoxGeometry(0.1, 0.06, 3.2), brass, sx * 1.43, 3.18, -4.9);
    for (const z of [-3.47, -6.33]) add(new THREE.BoxGeometry(0.08, 1.4, 0.34), black, sx * 1.42, 3.86, z);
    add(new THREE.BoxGeometry(0.03, 0.32, 0.7), brass, sx * 1.47, 2.7, -4.6); // number plate
  }
  add(new THREE.CylinderGeometry(6.7, 6.7, 3.6, 16, 1, true, Math.PI - 0.24, 0.48).rotateX(Math.PI / 2), mats.roofDS, 0, -2.08, -4.9);
  mats.fire = mats.fire ?? new THREE.MeshStandardMaterial({ color: '#3a1205', emissive: '#ff6a1a', emissiveIntensity: 1.2 });
  add(new THREE.BoxGeometry(0.55, 0.42, 0.04), mats.fire, 0, 2.62, -3.36);
  add(new THREE.BoxGeometry(2.9, 0.07, 3.2), under, 0, 2.13, -4.9);
  // cylinders and valve chests
  for (const sx of [-1, 1]) {
    add(alongZ(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16)), black, sx * 1.18, 1.32, 2.72);
    for (const dz of [-0.5, 0.5]) add(alongZ(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16)), brass, sx * 1.18, 1.32, 2.72 + dz);
    add(new THREE.BoxGeometry(0.36, 0.34, 0.9), black, sx * 1.15, 1.78, 2.72);
    add(new THREE.BoxGeometry(0.05, 0.05, 1.8), mats.steel, sx * 1.18, 1.44, 1.3);
    add(new THREE.BoxGeometry(0.05, 0.05, 1.8), mats.steel, sx * 1.18, 1.2, 1.3);
  }
  // front: buffer beam, buffers, cowcatcher
  add(new THREE.BoxGeometry(2.9, 0.5, 0.18), red, 0, 1.55, 6.0);
  for (const sx of [-1, 1]) {
    add(alongZ(new THREE.CylinderGeometry(0.09, 0.11, 0.4, 10)), under, sx * 0.88, 1.55, 6.28);
    add(alongZ(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 16)), mats.steel, sx * 0.88, 1.55, 6.5);
  }
  {
    const sh = new THREE.Shape([new THREE.Vector2(0, 1.32), new THREE.Vector2(0, 0.5), new THREE.Vector2(0.85, 0.47), new THREE.Vector2(0.2, 1.32)]);
    const pilot = new THREE.ExtrudeGeometry(sh, { depth: 2.3, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(1.15, 0, 0);
    add(pilot, mats.pilot, 0, 0, 6.08);
  }
  // wheels: two pony wheels, three coupled drivers, one trailing pair under the cab
  const axle = (r, z, spokes, crank) => {
    const a = new THREE.Group();
    a.position.set(0, 0.42 + r, z);
    g.add(a);
    for (const wx of [-GAUGE, GAUGE]) {
      const w = add(wheelGeo(r, spokes, crank), [mats.tyre, crank ? red : mats.wheel], wx, 0, 0, a);
      if (crank && wx > 0) w.rotation.x = Math.PI / 2; // quartering: right side leads by 90°
    }
    wheels.push({ o: a, r });
    return a;
  };
  axle(0.45, 3.85, 8, false); axle(0.45, 4.95, 8, false);
  const DR = 0.82, drv = [-3.65, -1.9, -0.15];
  for (const z of drv) axle(DR, z, 14, true);
  axle(0.52, -5.3, 10, false);
  // rods: coupling rod (translates on a circle) and main rod from the crosshead to the middle crank
  const rods = [-1, 1].map((sx) => {
    const coupling = add(new THREE.BoxGeometry(0.06, 0.13, drv[2] - drv[0] + 0.3), mats.steel, sx * 1.04, 0, 0);
    const cross = add(new THREE.BoxGeometry(0.14, 0.2, 0.3), mats.steel, sx * 1.18, 1.32, 1.0);
    add(alongZ(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8)).translate(0, 0, 0.95), mats.steel, 0, 0, 0, cross);
    const main = new THREE.Group();
    g.add(main);
    add(new THREE.BoxGeometry(0.07, 0.15, 2.6).translate(0, 0, -1.3), mats.steel, 0, 0, 0, main);
    return { sx, coupling, cross, main, phase: sx > 0 ? Math.PI / 2 : 0 };
  });
  const cy = 0.42 + DR, pin = 0.35, rodL = 2.6;
  const animate = (angle) => {
    for (const r of rods) {
      // wheels rotate by +angle about x: a pin at (y=pin) ends up at (y = pin cos a, z = pin sin a)
      const a = angle + r.phase;
      const py = cy + pin * Math.cos(a), pz = pin * Math.sin(a);
      r.coupling.position.set(r.sx * 1.04, py, (drv[0] + drv[2]) / 2 + pz);
      const mz = drv[1] + pz;
      const dy = 1.32 - py;
      const cz = mz + Math.sqrt(rodL * rodL - dy * dy);
      r.cross.position.set(r.sx * 1.18, 1.32, cz);
      r.main.position.set(r.sx * 1.12, 1.32, cz);
      r.main.rotation.x = Math.atan2(-dy, cz - mz);
    }
  };
  animate(0);
  return { g, L, wheels, animate, chimney: new THREE.Vector3(0, 4.8, 4.62), cylinders: [new THREE.Vector3(-1.2, 1.0, 3.3), new THREE.Vector3(1.2, 1.0, 3.3)] };
}

let BALLAST = null;
function gravelTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#7a7268'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const k = 70 + Math.random() * 90, r = 1.5 + Math.random() * 3.5;
    g.fillStyle = `rgb(${k + 10},${k + 4},${k - 4})`;
    g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, r, r * (0.6 + Math.random() * 0.4), Math.random() * 3, 0, 7); g.fill();
  }
  const t = toTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return t;
}
export function buildRailway(scene) {
  const group = new THREE.Group();
  for (const T of TRACKS) buildLine(group, T);
  // a gated level crossing, with its gateman, wherever a road crosses a line
  for (const X of ROAD_X) roadCrossing(group, X);
  scene.add(group);
  const A = new Train(scene, TRACK, { name: 'Sonpur–Noorpur Passenger', first: 10, coaches: 5 });
  const B = new Train(scene, TRACKS[1], { livery: { base: '#1d4a3c', line: '#ead9a6', dark: '#123228', door: '#183f33' }, end: '#1d4a3c', coaches: 5, first: 150, boiler: '#1c2a22', name: 'Mail' });
  const C = new Train(scene, TRACK3, { livery: { base: '#24407a', line: '#f0d070', dark: '#16284e', door: '#1d3566' }, end: '#24407a', coaches: 3, first: 22, boiler: '#1a1c24', name: 'Mariapur–Noorpur Local' });
  // the ring train goes round and round the whole country, stopping at the junctions and the new villages
  const D = new Train(scene, RING, { livery: { base: '#c46a1a', line: '#f6e2b0', dark: '#8a4410', door: '#9a4e14' }, end: '#c46a1a', coaches: 4, first: 30, boiler: '#202024', name: 'Gol Gaadi — the Ring Train' });
  // and two more ring trains, spaced a third of the way round each, so a train is never far off
  const third = RING.path.L / 3, s0 = RING.halts[0].s;
  const E = new Train(scene, RING, { livery: { base: '#2a6a9a', line: '#f2efe2', dark: '#1a4466', door: '#1f5580' }, end: '#2a6a9a', coaches: 4, startS: s0 + third, boiler: '#1c2026', name: 'Neeli Gol Gaadi — the blue ring train' });
  const F = new Train(scene, RING, { livery: { base: '#3c7a3c', line: '#f2e6b0', dark: '#265426', door: '#2e662e' }, end: '#3c7a3c', coaches: 4, startS: s0 + third * 2, boiler: '#1c221c', name: 'Hari Gol Gaadi — the green ring train' });
  return new Railway([A, B, C, D, E, F]);
}

// a level crossing: a plank-and-concrete deck across the line, striped barrier booms on both sides of the
// road that come down when a train is near (red lamps flashing, the bell ringing), and the gateman's little
// brick cabin, with the gateman himself — he winds the booms down, then sits on his bench till it's gone.
const CROSSINGS = [];
// A level crossing where a road (any road, at any angle) meets one or two lines: a deck level with the
// railheads, striped booms on striped posts either side with flashing red lamps, and the gateman's cabin
// with its winch. X comes from ROAD_X in world.js: centre, road direction, road half-width, the lines.
let gateNo = 11;
function roadCrossing(group, X) {
  const { rdx, rdz, half } = X;
  const at = (u, v) => ({ x: X.x + rdx * u - rdz * v, z: X.z + rdz * u + rdx * v }); // u along the road, v across it
  const roadRot = Math.atan2(rdx, rdz);
  // how far a spot is from the rails (posts, the winch and the cabin go on whichever side is clear)
  const clearOf = (p) => { let m = 99; for (const L of X.tracks) { const n = L.T.path.near(p.x, p.z); if (n) m = Math.min(m, n.d); } return m; };
  const pickV = (u, v) => (clearOf(at(u, v)) >= clearOf(at(u, -v)) ? v : -v);
  // the deck on each line
  const deckM = std('#8d877e', { roughness: 0.95 }), plankM = std('#5a4632', { roughness: 0.9 });
  const lenAlong = Math.min(16, (half * 2 + 1.5) / X.sin);
  for (const L of X.tracks) {
    const q = L.T.path.at(L.s);
    const d = new THREE.Group(); d.position.set(q.x, RAIL_TOP, q.z); d.rotation.y = Math.atan2(q.tx, q.tz); group.add(d);
    for (const [o, w, m] of [[0, GAUGE * 2 - 0.16, deckM], [GAUGE + 0.55, 1.0, plankM], [-(GAUGE + 0.55), 1.0, plankM]]) {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, lenAlong), m);
      pl.position.set(o, -0.07, 0); pl.receiveShadow = true; d.add(pl);
    }
  }
  const white = std('#efefe8'), red = std('#c22d22');
  const stripe = document.createElement('canvas'); stripe.width = 128; stripe.height = 8;
  const sg = stripe.getContext('2d');
  for (let i = 0; i < 8; i++) { sg.fillStyle = i % 2 ? '#c22d22' : '#f2f2ec'; sg.fillRect(i * 16, 0, 16, 8); }
  const boomMat = std('#ffffff', { map: toTexture(stripe) });
  const booms = [], lamps = [], boxes = [];
  const clearU = X.span + 4.5, postV = half + 0.7, boomLen = postV * 2 - 0.3;
  for (const side of [-1, 1]) {
    // the boom post stands at the road's edge on alternate sides, so the two booms close the whole road
    const pv = pickV(clearU * side, postV * side), sgv = Math.sign(pv), pp = at(clearU * side, pv), by = heightAt(pp.x, pp.z);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.3, 0.32), white);
    post.position.set(pp.x, by + 0.65, pp.z); post.castShadow = true; group.add(post);
    const pivot = new THREE.Group();
    pivot.position.set(pp.x, by + 1.2, pp.z);
    pivot.rotation.y = Math.atan2(rdz * sgv, -rdx * sgv); // pointing across the road, toward the far edge
    group.add(pivot);
    const arm = new THREE.Group(); pivot.add(arm);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, boomLen).translate(0, 0, boomLen / 2), boomMat);
    boom.castShadow = true; arm.add(boom);
    const cw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), std('#3a3a3a', { metalness: 0.4 })); cw.position.set(0, 0, -0.5); arm.add(cw);
    for (const z of [boomLen * 0.3, boomLen * 0.62, boomLen * 0.94]) { const tag = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.32), red); tag.position.set(0, -0.2, z); arm.add(tag); }
    booms.push(arm);
    // two red lamps on a post facing the oncoming road, flashing in turn
    const lpos = at(clearU * side + side * 0.5, pv + sgv * 0.6);
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), std('#2a2a2a'));
    lampPost.position.set(lpos.x, by + 1.1, lpos.z); group.add(lampPost);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.05), std('#1a1a1a')); plate.position.set(lpos.x, by + 2.1, lpos.z); plate.rotation.y = roadRot; group.add(plate);
    for (const k of [-1, 1]) {
      const m = new THREE.MeshStandardMaterial({ color: '#5a0a08', emissive: '#ff2010', emissiveIntensity: 0 });
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.12, 14), m);
      const o = at(clearU * side + side * 0.53, pv + sgv * 0.6 + k * 0.18);
      l.position.set(o.x, by + 2.1, o.z);
      l.lookAt(o.x + rdx * side * 5, by + 2.1, o.z + rdz * side * 5);
      group.add(l); lamps.push(m);
    }
    colliders.push({ kind: 'c', x: pp.x, z: pp.z, r: 0.3 });
    // the stretch of road a lowered boom closes
    const bc = at(clearU * side, 0);
    boxes.push({ kind: 'b', x: bc.x, z: bc.z, rot: roadRot, hw: half + 0.8, hd: 0.25 });
  }
  // the gateman's cabin, set back from the road beside the gate, its front toward the road
  // pick the corner (either end, either side of the road) farthest from the rails
  let hu = clearU + 5, hv = half + 5.5;
  { let best = -1; for (const cu of [clearU + 5, -(clearU + 5)]) for (const cv of [half + 5.5, -(half + 5.5)]) { const c = clearOf(at(cu, cv)); if (c > best) { best = c; hu = cu; hv = cv; } } }
  const hp = at(hu, hv), hy = heightAt(hp.x, hp.z);
  const hut = new THREE.Group();
  hut.position.set(hp.x, hy, hp.z);
  hut.rotation.y = Math.atan2(rdz * Math.sign(hv), -rdx * Math.sign(hv)); // facing the road
  const addH = (geo, m, x, y, z, parent = hut) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  addH(new THREE.BoxGeometry(3.0, 2.5, 2.6), std('#ece6d8', { roughness: 0.9 }), 0, 1.25, 0);
  addH(new THREE.BoxGeometry(3.06, 0.5, 2.66), std('#9a3a26'), 0, 0.25, 0);
  addH(new THREE.BoxGeometry(3.2, 0.6, 2.8), std('#9a3a26'), 0, -0.2, 0); // the plinth, down to the ground on a slope
  const roof = addH(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4), std('#a8442c', { roughness: 0.8 }), 0, 3.0, 0);
  roof.scale.set(2.6, 1.0, 2.3);
  addH(new THREE.BoxGeometry(0.9, 1.8, 0.06), std('#2f5a7a'), -0.7, 0.95, 1.31);
  addH(new THREE.BoxGeometry(0.8, 0.7, 0.06), std('#1c1612'), 0.75, 1.55, 1.31);
  for (let i = 0; i < 4; i++) addH(new THREE.BoxGeometry(0.03, 0.7, 0.07), std('#5a5a5a', { metalness: 0.5 }), 0.47 + i * 0.19, 1.55, 1.33);
  const no = ++gateNo;
  const sign = document.createElement('canvas'); sign.width = 512; sign.height = 128;
  const sx = sign.getContext('2d');
  sx.fillStyle = '#f2c418'; sx.fillRect(0, 0, 512, 128); sx.strokeStyle = '#141414'; sx.lineWidth = 8; sx.strokeRect(4, 4, 504, 120);
  sx.fillStyle = '#141414'; sx.textAlign = 'center'; sx.font = 'bold 50px "Noto Sans Devanagari", Arial'; sx.fillText('रेलवे फाटक', 256, 56); sx.font = 'bold 34px Arial'; sx.fillText('LEVEL CROSSING · GATE No. ' + no, 256, 104);
  addH(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshStandardMaterial({ map: toTexture(sign) }), 0, 2.3, 1.34);
  addH(new THREE.BoxGeometry(1.4, 0.08, 0.4), std('#6a4a2c'), 0.3, 0.45, 1.9);
  for (const dx of [-0.35, 0.95]) addH(new THREE.BoxGeometry(0.06, 0.45, 0.35), std('#4a3420'), dx, 0.22, 1.9);
  group.add(hut);
  colliders.push({ kind: 'b', x: hp.x, z: hp.z, rot: hut.rotation.y, hw: 1.5, hd: 1.3 });
  // the winch, between the cabin and the near boom post
  const wp = at(hu - Math.sign(hu) * 3.2, Math.sign(hv) * (half + 2.0));
  const winch = new THREE.Group();
  winch.position.set(wp.x, heightAt(wp.x, wp.z), wp.z); winch.rotation.y = hut.rotation.y; group.add(winch);
  addH(new THREE.BoxGeometry(0.25, 0.9, 0.25), std('#2a4a6a', { metalness: 0.3 }), 0, 0.45, 0, winch);
  const wheel = addH(new THREE.TorusGeometry(0.28, 0.03, 6, 16), std('#c22d22'), 0, 0.95, 0.15, winch);
  // the gateman: blue uniform, white cap
  const man = new Person({ dress: 'pants', top: '#3a5a8a', bottom: '#2a2a32', skin: ['#6e4530', '#7a4c33', '#8a5a3c'][no % 3], mustache: true, headwear: 'cap', turban: '#f2efe6', sleeves: 'short' });
  group.add(man.root);
  const fr = hut.rotation.y;
  const benchAt = { x: hp.x + Math.sin(fr) * 1.9 + Math.cos(fr) * 0.3, z: hp.z + Math.cos(fr) * 1.9 - Math.sin(fr) * 0.3 };
  const winchFront = { x: wp.x + Math.sin(fr) * 0.65, z: wp.z + Math.cos(fr) * 0.65 };
  const XC = { cx: X.x, cz: X.z, booms, lamps, boxes, man, wheel, benchAt, winchFront, hutRot: fr, angle: -1.3, closed: false, t: 0, manP: { ...benchAt }, tracks: X.tracks.map((t) => t.T) };
  CROSSINGS.push(XC);
  return XC;
}
function updateCrossing(X, dt, trains) {
  // close when any train on these lines is within ~80 m of the road; open once it's clear
  let near = false;
  for (const tr of trains) {
    if (!X.tracks.includes(tr.tk)) continue;
    for (const b of tr.boxes) if (Math.hypot(b.x - X.cx, b.z - X.cz) - b.hd < 80) near = true;
  }
  if (near !== X.closed) { X.closed = near; X.t = 0; if (X.onBell) X.onBell(X, near); }
  X.t += dt;
  // the booms come down after the lamps have flashed a few seconds; go up a moment after it's clear
  const want = X.closed && X.t > 2.5 ? 0 : X.closed ? -1.3 : X.t > 1.5 ? -1.3 : 0;
  const moving = Math.abs(want - X.angle) > 0.01;
  X.angle += Math.sign(want - X.angle) * Math.min(Math.abs(want - X.angle), dt * 0.55);
  for (const a of X.booms) a.rotation.x = X.angle;
  const flash = X.closed || X.angle > -1.2;
  for (let i = 0; i < X.lamps.length; i++) X.lamps[i].emissiveIntensity = flash && (Math.floor(X.t * 2.2) + i) % 2 === 0 ? 4 : 0;
  // the gateman: at the winch while it's moving or a train is coming, on his bench otherwise
  const target = X.closed || moving ? X.winchFront : X.benchAt;
  const m = X.man, dx = target.x - X.manP.x, dz = target.z - X.manP.z, d = Math.hypot(dx, dz);
  let sp = 0;
  if (d > 0.1) { sp = 1.3; const k = Math.min(1, (sp * dt) / d); X.manP.x += dx * k; X.manP.z += dz * k; }
  m.root.position.set(X.manP.x, heightAt(X.manP.x, X.manP.z), X.manP.z);
  const face = d > 0.1 ? Math.atan2(dx, dz) : X.closed || moving ? X.hutRot + Math.PI : X.hutRot;
  m.root.rotation.y += Math.atan2(Math.sin(face - m.root.rotation.y), Math.cos(face - m.root.rotation.y)) * Math.min(1, dt * 5);
  m.update(dt, sp, sp > 0 ? 'walk' : moving ? 'stir' : X.closed ? 'idle' : 'sit');
  if (moving) X.wheel.rotation.z += dt * 4;
}

// ---------- tunnels ----------
// The bore: a stone-lined arch over a walkway either side of the ballast. It's lit by lamps along the walls
// (alternating sides every 22 m) and a little daylight spilling in at each end; the light is baked into the
// vertex colours, so the inside stays dim and moody whatever the time of day.
const ARCH_WALL = 3.4, ARCH_RISE = 3.2;
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,236,190,1)'); gr.addColorStop(0.3, 'rgba(255,200,120,0.45)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let GLOW = null;
function buildTunnel(group, T, a, b) {
  const P = T.path, q = {}, W = BORE_HALF;
  // the cross-section, going round: walkway, wall, arch, wall, walkway, ballast
  const prof = [[W, 0.12, 'walk'], [2.55, 0.12, 'walk'], [2.4, -0.05, 'bal'], [1.6, 0.25, 'bal'], [-1.6, 0.25, 'bal'], [-2.4, -0.05, 'bal'], [-2.55, 0.12, 'walk'], [-W, 0.12, 'walk'], [-W, 1.2, 'wall'], [-W, ARCH_WALL, 'wall']];
  for (let k = 1; k < 10; k++) { const an = Math.PI - (k / 10) * Math.PI; prof.push([Math.cos(an) * W, ARCH_WALL + Math.sin(an) * ARCH_RISE, 'arch']); }
  prof.push([W, ARCH_WALL, 'wall'], [W, 1.2, 'wall'], [W, 0.12, 'walk']);
  const base = { walk: new THREE.Color('#6d675f'), bal: new THREE.Color('#5a544c'), wall: new THREE.Color('#857c70'), arch: new THREE.Color('#7a7166') };
  const lamps = [];
  for (let t = a + 12, k = 0; t < b - 6; t += 22, k++) lamps.push({ t, side: k % 2 ? 1 : -1 });
  const pos = [], col = [], idx = [];
  const n = Math.max(2, Math.ceil((b - a) / 1.5)), m = prof.length, c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const t = a + ((b - a) * i) / n;
    P.at(t, q);
    const nx = -q.tz, nz = q.tx;
    const day = Math.max(Math.exp(-(t - a) / 9), Math.exp(-(b - t) / 9));
    for (const [o, y, kind] of prof) {
      pos.push(q.x + nx * o, TRACK_Y + y, q.z + nz * o);
      let L = 0.13 + day * 1.3;
      for (const l of lamps) { const dt = l.t - t; if (Math.abs(dt) > 16) continue; const dd = dt * dt + (o - l.side * (W - 0.1)) ** 2 + (y - 4.3) ** 2; L += 1.25 * Math.exp(-dd / (2 * 4.2 * 4.2)); }
      // the joints between courses of stone: faint darker bands
      const course = kind === 'wall' || kind === 'arch' ? 0.9 + 0.1 * Math.abs(Math.sin(t * 2.1)) : 1;
      c.copy(base[kind]).multiplyScalar(Math.min(1.25, L) * course);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) { const p0 = i * m + j, p1 = p0 + m; idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const bore = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  group.add(bore);
  // the lamps: a little iron bracket and a warm glass globe, with a soft glow round it
  const fix = [], bulbs = [];
  GLOW = GLOW ?? new THREE.SpriteMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 });
  for (const l of lamps) {
    P.at(l.t, q);
    const nx = -q.tz, nz = q.tx, o = l.side * (W - 0.25), rot = Math.atan2(q.tx, q.tz);
    const x = q.x + nx * o, z = q.z + nz * o, y = TRACK_Y + 4.3;
    fix.push(new THREE.BoxGeometry(0.42, 0.12, 0.18).rotateY(rot + Math.PI / 2).translate(q.x + nx * (o - l.side * 0.15), y + 0.24, q.z + nz * (o - l.side * 0.15)));
    fix.push(new THREE.CylinderGeometry(0.13, 0.16, 0.12, 8).translate(x, y + 0.2, z));
    bulbs.push(new THREE.SphereGeometry(0.13, 10, 8).translate(x, y, z));
    const sp = new THREE.Sprite(GLOW); sp.position.set(x, y, z); sp.scale.setScalar(2.2); group.add(sp);
  }
  if (fix.length) {
    group.add(new THREE.Mesh(mergeGeometries(fix), new THREE.MeshBasicMaterial({ color: '#1c1a18' })));
    group.add(new THREE.Mesh(mergeGeometries(bulbs), new THREE.MeshBasicMaterial({ color: '#ffe6b0' })));
  }
}
// a stone portal at each end of a tunnel, with a lighter arch of dressed stone round the opening
function tunnelPortal(group, P, t, dir, stone, trim) {
  const q = P.at(t);
  const portal = new THREE.Group();
  portal.position.set(q.x, TRACK_Y, q.z);
  portal.rotation.y = Math.atan2(q.tx * dir, q.tz * dir);
  const hole = () => { const h = new THREE.Path(); h.moveTo(-BORE_HALF, 0); h.lineTo(BORE_HALF, 0); h.lineTo(BORE_HALF, ARCH_WALL); h.absellipse(0, ARCH_WALL, BORE_HALF, ARCH_RISE, 0, Math.PI, false); h.lineTo(-BORE_HALF, 0); return h; };
  const shape = new THREE.Shape();
  shape.moveTo(-10, -1.4); shape.lineTo(10, -1.4); shape.lineTo(10, 12.6); shape.lineTo(-10, 12.6); shape.lineTo(-10, -1.4);
  shape.holes.push(hole());
  const face = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false }), stone);
  face.castShadow = face.receiveShadow = true;
  portal.add(face);
  const ring = new THREE.Shape();
  ring.moveTo(-BORE_HALF - 0.7, 0); ring.lineTo(-BORE_HALF - 0.7, ARCH_WALL); ring.absellipse(0, ARCH_WALL, BORE_HALF + 0.7, ARCH_RISE + 0.7, Math.PI, 0, true); ring.lineTo(BORE_HALF + 0.7, 0); ring.lineTo(-BORE_HALF - 0.7, 0);
  ring.holes.push(hole());
  const arch = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 1.7, bevelEnabled: false }), trim);
  arch.castShadow = true; portal.add(arch);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(21, 0.6, 2.0), trim);
  cap.position.set(0, 12.9, 0.7);
  portal.add(cap);
  // a pilaster either side of the arch
  for (const sx of [-1, 1]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9.5, 0.5), trim); pl.position.set(sx * (BORE_HALF + 1.6), 3.4, 1.55); portal.add(pl); }
  group.add(portal);
  // the face of the portal is solid
  for (const sx of [-1, 1]) colliders.push({ kind: 'b', x: q.x - q.tz * sx * 7.3, z: q.z + q.tx * sx * 7.3, rot: Math.atan2(q.tx, q.tz), hw: 2.7, hd: 0.9, height: TRACK_Y + 12 });
}

function buildLine(group, T) {
  const P = T.path, q = {};
  const d = new THREE.Object3D();
  const ballastMat = BALLAST ?? (BALLAST = new THREE.MeshStandardMaterial({ map: gravelTex(), roughness: 1, color: '#c8c0b4' }));
  const prof = [[-2.4, TRACK_Y - 0.1], [-1.6, TRACK_Y + 0.25], [1.6, TRACK_Y + 0.25], [2.4, TRACK_Y - 0.1]];
  const onBridge = (t) => T.bridges.some(([a, b]) => t > a && t < b);
  const railMatL = std('#6a5a4c', { metalness: 0.6, roughness: 0.55, side: THREE.DoubleSide }), railTopL = std('#c8ccd0', { metalness: 0.95, roughness: 0.18, side: THREE.DoubleSide });
  const ss = [], ssT = [];
  const dimRail = new THREE.MeshBasicMaterial({ color: '#2e2a26', side: THREE.DoubleSide }), dimTop = new THREE.MeshBasicMaterial({ color: '#8c8f92', side: THREE.DoubleSide });
  const runs = [...T.segs.map((g) => [g, false]), ...T.tunnels.map((g) => [g, true])];
  for (const [[a, b], inT] of runs) {
    const railMat = inT ? dimRail : railMatL, railTop = inT ? dimTop : railTopL;
    // ballast everywhere but the bridges (in a tunnel the bore has its own floor)
    let cuts = inT ? [] : [[a, b]];
    for (const [b1, b2] of T.bridges) cuts = cuts.flatMap(([u, v]) => (b2 <= u || b1 >= v ? [[u, v]] : [[u, Math.max(u, b1)], [Math.min(v, b2), v]].filter(([x0, x1]) => x1 - x0 > 1)));
    for (const [u, v] of cuts) group.add(ribbonS(P, u, v, 2, prof, ballastMat));
    // flat-bottomed rails: foot, web and a rounded head
    for (const sx of [-GAUGE, GAUGE]) {
      group.add(ribbonS(P, a, b, 2, [[sx - 0.075, RAIL_TOP - 0.16], [sx - 0.075, RAIL_TOP - 0.14], [sx - 0.012, RAIL_TOP - 0.13], [sx - 0.012, RAIL_TOP - 0.05], [sx - 0.036, RAIL_TOP - 0.04], [sx - 0.036, RAIL_TOP - 0.008], [sx - 0.028, RAIL_TOP]], railMat));
      group.add(ribbonS(P, a, b, 2, [[sx + 0.028, RAIL_TOP], [sx + 0.036, RAIL_TOP - 0.008], [sx + 0.036, RAIL_TOP - 0.04], [sx + 0.012, RAIL_TOP - 0.05], [sx + 0.012, RAIL_TOP - 0.13], [sx + 0.075, RAIL_TOP - 0.14], [sx + 0.075, RAIL_TOP - 0.16]], railMat));
      group.add(ribbonS(P, a, b, 2, [[sx - 0.028, RAIL_TOP], [sx + 0.028, RAIL_TOP]], railTop));
    }
    for (let t = a; t < b; t += 0.62) (inT ? ssT : ss).push(t);
    if (inT) buildTunnel(group, T, a, b);
  }
  // concrete sleepers with dark rail pads and clips
  const slG = mergeGeometries([new THREE.BoxGeometry(0.26, 0.15, 2.6), ...[-GAUGE, GAUGE].flatMap((s2) => [new THREE.BoxGeometry(0.2, 0.03, 0.22).translate(0, 0.085, s2), new THREE.BoxGeometry(0.06, 0.06, 0.06).translate(0.09, 0.1, s2 + 0.1), new THREE.BoxGeometry(0.06, 0.06, 0.06).translate(-0.09, 0.1, s2 - 0.1)])]);
  const sleepers = new THREE.InstancedMesh(slG, std('#a39d92', { roughness: 0.9 }), Math.max(1, ss.length));
  ss.forEach((t, i) => {
    P.at(t, q);
    d.position.set(q.x, onBridge(t) ? RAIL_TOP - 0.2 : TRACK_Y + 0.3, q.z);
    d.rotation.set(0, Math.atan2(q.tx, q.tz) - Math.PI / 2, 0);
    d.updateMatrix();
    sleepers.setMatrixAt(i, d.matrix);
  });
  sleepers.receiveShadow = true;
  sleepers.computeBoundingSphere();
  group.add(sleepers);
  if (ssT.length) {
    const sT = new THREE.InstancedMesh(slG, new THREE.MeshBasicMaterial({ color: '#4c4842' }), ssT.length);
    ssT.forEach((t, i) => { P.at(t, q); d.position.set(q.x, TRACK_Y + 0.3, q.z); d.rotation.set(0, Math.atan2(q.tx, q.tz) - Math.PI / 2, 0); d.updateMatrix(); sT.setMatrixAt(i, d.matrix); });
    sT.computeBoundingSphere();
    group.add(sT);
  }

  // girder bridges over the river: a concrete deck, steel trusses either side, piers in the water
  const steel = std('#56606a', { metalness: 0.4, roughness: 0.6 }), concrete = std('#9c968c');
  for (const [b0, b1] of T.bridges) {
    if (!T.openS((b0 + b1) / 2)) continue;
    group.add(ribbonS(P, b0, b1, 1.5, [[-1.8, RAIL_TOP - 0.62], [-1.8, RAIL_TOP - 0.28], [1.8, RAIL_TOP - 0.28], [1.8, RAIL_TOP - 0.62], [-1.8, RAIL_TOP - 0.62]], concrete));
    for (const sx of [-2.0, 2.0]) {
      group.add(ribbonS(P, b0, b1, 1.5, [[sx - 0.12, RAIL_TOP + 2.45], [sx - 0.12, RAIL_TOP + 2.75], [sx + 0.12, RAIL_TOP + 2.75], [sx + 0.12, RAIL_TOP + 2.45], [sx - 0.12, RAIL_TOP + 2.45]], steel));
      group.add(ribbonS(P, b0, b1, 1.5, [[sx - 0.12, RAIL_TOP - 0.45], [sx - 0.12, RAIL_TOP + 0.05], [sx + 0.12, RAIL_TOP + 0.05], [sx + 0.12, RAIL_TOP - 0.45], [sx - 0.12, RAIL_TOP - 0.45]], steel));
    }
    const n = Math.max(4, Math.round((b1 - b0) / 3.4));
    for (let i = 0; i <= n; i++) {
      const t = b0 + ((b1 - b0) * i) / n;
      P.at(t, q);
      const rot = Math.atan2(q.tx, q.tz);
      for (const sx of [-2.0, 2.0]) {
        const px = q.x - q.tz * sx, pz = q.z + q.tx * sx;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.8, 0.18), steel); post.position.set(px, RAIL_TOP + 1.2, pz); post.rotation.y = rot; post.castShadow = true; group.add(post);
        if (i < n) {
          const tn = b0 + ((b1 - b0) * (i + 0.5)) / n, qq = P.at(tn);
          const diag = new THREE.Mesh(new THREE.BoxGeometry(0.14, Math.hypot(2.8, (b1 - b0) / n), 0.14), steel);
          diag.position.set(qq.x - qq.tz * sx, RAIL_TOP + 1.2, qq.z + qq.tx * sx);
          diag.rotation.set(Math.atan2((b1 - b0) / n, 2.8) * (i % 2 ? 1 : -1), Math.atan2(qq.tx, qq.tz), 0, 'YXZ');
          diag.castShadow = true; group.add(diag);
        }
        if (i % 3 === 0) colliders.push({ kind: 'c', x: px, z: pz, r: 0.2 });
      }
      if (i % 4 === 2) {
        // piers down into the river, or all the way to the floor of the valley
        const gb = Math.min(WATER_Y - 2.5, heightAt(q.x, q.z) - 1), top = RAIL_TOP - 0.6, tall = Math.max(0, -gb - 4);
        const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.7 + tall * 0.03, 0.9 + tall * 0.07, top - gb, 12), concrete);
        pier.position.set(q.x, (top + gb) / 2, q.z); pier.castShadow = pier.receiveShadow = true; group.add(pier);
        if (tall > 0) {
          const capM = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.6, 1.8), concrete); capM.position.set(q.x, top - 0.3, q.z); capM.rotation.y = rot; capM.castShadow = true; group.add(capM);
          colliders.push({ kind: 'c', x: q.x, z: q.z, r: 1.0 + tall * 0.07, height: top - 1 });
        }
      }
    }
  }

  // a portal at each end of every tunnel
  const stone = std('#8f877b', { roughness: 1 }), trim = std('#b3a891', { roughness: 0.95 });
  for (const [a, b] of T.tunnels) for (const [t, dir] of [[a, -1], [b, 1]]) {
    if (!T.closed && (t < 1 || t > P.L - 1)) continue; // the ends of a line run on into the ring, not into a hill
    tunnelPortal(group, P, t, dir, stone, trim);
  }

  // level crossings on the main road (the old one, spanning the main and Mail lines; the Mariapur line's)

  // telegraph poles along the station lines and the ring
  if (T.name === 'mail') return;
  const pg = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.09, 6, 6).translate(0, 3, 0), new THREE.BoxGeometry(1.0, 0.08, 0.08).translate(0, 5.6, 0)]);
  const poleTs = [];
  for (const [a, b] of T.segs) for (let t = a + 10; t < b - 10; t += 45) {
    P.at(t, q);
    if (onBridge(t) || ROAD_X.some((X) => Math.hypot(q.x - X.x, q.z - X.z) < 16)) continue;
    poleTs.push(t);
  }
  const poles = new THREE.InstancedMesh(pg, std('#5a5048'), Math.max(1, poleTs.length));
  const wirePts = [];
  poleTs.forEach((t, i) => {
    P.at(t, q);
    const px = q.x - q.tz * 5, pz = q.z + q.tx * 5, py = heightAt(px, pz);
    d.position.set(px, py, pz);
    d.rotation.set(0, Math.atan2(-q.tz, q.tx), 0);
    d.updateMatrix();
    poles.setMatrixAt(i, d.matrix);
    wirePts.push(new THREE.Vector3(px, py + 5.65, pz));
  });
  poles.castShadow = true;
  poles.computeBoundingSphere();
  group.add(poles);
  const wv = [];
  for (let i = 0; i < wirePts.length - 1; i++) {
    const a = wirePts[i], b = wirePts[i + 1];
    if (a.distanceTo(b) > 60) continue;
    for (let k = 0; k < 8; k++) {
      const t0 = k / 8, t1 = (k + 1) / 8, sag = (t) => -Math.sin(t * Math.PI) * 0.6;
      wv.push(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0 + sag(t0), a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1 + sag(t1), a.z + (b.z - a.z) * t1);
    }
  }
  if (wv.length) { const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3)); group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2a2622' }))); }
  if (!poleTs.length) poles.visible = false;
}

// All the trains behind one interface for the rest of the game.
class Railway {
  constructor(trains) {
    this.trains = trains;
    for (const t of trains) t.others = trains;
    this.boxes = [];
    this.main = trains[0];
    this.lastT = null;
    this.crossings = CROSSINGS;
  }
  set onCrossingBell(f) { for (const X of CROSSINGS) X.onBell = f; }
  // the lowered booms: anything trying to cross the road there is stopped
  closedBoxes() { const o = []; for (const X of CROSSINGS) if (X.angle > -0.6) o.push(...X.boxes); return o; }
  set onEmerge(f) { for (const t of this.trains) t.onEmerge = f; }
  set onChuff(f) { for (const t of this.trains) t.onChuff = f; }
  set onStation(f) { for (const t of this.trains) t.onStation = f; }
  get active() { return this.trains.some((t) => t.active); }
  update(time) {
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(0.1, time - this.lastT));
    this.lastT = time;
    this.boxes.length = 0;
    for (const t of this.trains) { t.update(dt); this.boxes.push(...t.boxes); }
    for (const X of CROSSINGS) updateCrossing(X, dt, this.trains);
  }
  distanceTo(x, z) { return Math.min(...this.trains.map((t) => t.distanceTo(x, z))); }
  setNight(v) { for (const t of this.trains) t.setNight(v); }
  setSmokeColors(a, b) { for (const t of this.trains) t.setSmokeColors(a, b); }
  setWind(x, z) { for (const t of this.trains) t.smoke.wind.set(x, 0, z); }
}

// ---------------- the train ----------------
// A little timetable runs it: out of the tunnel at one end, along the line, a stop at each station (the
// doors open, people get on and off), into the tunnel at the far end, a wait, and back again. The boy can
// climb into the cab while it's standing at a station and drive it himself.
const CRUISE = 22, ACCEL = 0.7, BRAKE = 0.9, TOP = 120 / 3.6; // timetable cruise ~80 km/h; the boy can take her up to 120
class Train {
  constructor(scene, track, o) {
    this.tk = track;
    this.name = o.name ?? 'Passenger';
    const side = toTexture(coachTexture(false, o.livery));
    const glow = toTexture(coachTexture(true, o.livery));
    this.mats = {
      side: new THREE.MeshStandardMaterial({ map: side, emissiveMap: glow, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.7 }),
      end: std(o.end ?? '#5a1814', { roughness: 0.7 }),
      roof: std('#4c4f52', { roughness: 0.75 }),
      roofDS: std('#1c1c1e', { roughness: 0.6, side: THREE.DoubleSide }),
      under: std('#1d1c1b'),
      wheel: std('#262423', { roughness: 0.6 }),
      tyre: std('#8d9196', { metalness: 0.8, roughness: 0.35 }),
      steel: std('#a3a8ad', { metalness: 0.85, roughness: 0.3 }),
      glass: std('#1a2228', { roughness: 0.1, metalness: 0.3 }),
      black: std(o.boiler ?? '#141516', { roughness: 0.45, metalness: 0.3 }),
      graphite: std('#2a2b2d', { roughness: 0.7, metalness: 0.2 }),
      red: std('#9b2318', { roughness: 0.5 }),
      brass: std('#c8a04a', { metalness: 0.85, roughness: 0.28 }),
      pilot: std('#7d1c13', { roughness: 0.6 }),
      coal: std('#151413', { roughness: 0.9, vertexColors: true }),
    };
    this.cars = [];
    this.loco = buildLoco(this.mats);
    this.cars.push(this.loco);
    this.cars.push(buildTender(this.mats));
    for (let i = 0; i < (o.coaches ?? 7); i++) { const c = buildCoach(this.mats); c.coach = true; this.cars.push(c); }
    // trains on the station lines have an engine at each end, so at the last station they simply reverse
    this.termini = !!track.termini;
    this.locos = [this.loco];
    if (this.termini) {
      const t2 = buildTender(this.mats); t2.rev = true; this.cars.push(t2);
      const l2 = buildLoco(this.mats); l2.rev = true; this.cars.push(l2); this.locos.push(l2);
    }
    let off = 0;
    for (const c of this.cars) {
      c.off = off + c.L / 2;
      off += c.L + 0.7;
      c.g.visible = false;
      scene.add(c.g);
    }
    this.length = off;
    // the line it runs on, and its stations by distance along it
    this.path = track.path;
    this.sOff = 0;
    // the station lines run on their drive route (their line plus the ring beyond each junction), so a driven
    // train can carry on through the junction onto the ring; their halts sit at s + sOff on it
    if (track.termini && track.drive) { this.path = track.drive.path; this.sOff = track.drive.off; }
    this.sW = 0;
    this.sE = this.path.L;
    this.loopLine = !!track.loop;
    this.halts = (track.halts ?? []).map((h) => ({ ...h }));
    this.layover = o.layover ?? 25;
    this.startDir = o.startDir ?? 1;
    this.dir = this.startDir;
    this.head = this.dir > 0 ? this.sW - 30 : this.sE + 30;
    this.v = 0;
    this.mode = 'wait';
    this.timer = o.first ?? 12;
    this.served = new Set();
    this.travel = 0;
    this.active = false;
    this.boxes = [];
    this.wasOpen = false;
    this.onEmerge = null;
    this.onStation = null;
    this.drive = { throttle: 0, brake: 0 };
    this.at = null; // the halt it's standing at
    this.cabSign = 1;
    if (this.loopLine) {
      this.termini = false; this.dir = 1; this.m = 1;
      if (o.startS !== undefined) { this.head = o.startS; this.mode = 'run'; this.v = 0; this.at = null; } // starts out between stations
      else { this.head = this.stopFor(this.halts[0]); this.mode = 'dwell'; this.timer = o.first ?? 12; this.at = this.halts[0]; }
    }
    if (this.termini) {
      // starts standing at the western terminus, facing east
      this.dir = 1; this.m = 1;
      const h0 = this.halts.reduce((a, b) => (b.s < a.s ? b : a));
      this.head = this.stopFor(h0);
      this.mode = 'dwell'; this.timer = o.first ?? 12; this.at = h0;
    }
    this.smoke = new Puffs({ max: 320, color: '#dad6cf', dark: '#3b3936', opacity: 0.85, buoyancy: 0.4, drag: 0.55 });
    scene.add(this.smoke.mesh);
    this.emitAcc = 0;
    this.steamAcc = 0;
    this._v = new THREE.Vector3();
  }
  point(s) {
    const q = this.path.at(s);
    return new THREE.Vector3(q.x, RAIL_TOP, q.z);
  }
  openAt(s) { const q = s - this.sOff; return q < 0 || q > this.tk.path.L ? true : this.tk.openS(q); }
  get tail() { return this.head - this.dir * this.length; }
  // where the head stops so the train stands centred on a platform
  stopFor(h) { const s = h.s + this.sOff; return this.termini || this.loopLine ? s + this.length / 2 : s + this.dir * this.length / 2 - this.dir * 6; }
  setNight(v) {
    this.mats.side.emissiveIntensity = v * 1.6;
    this.mats.fire.emissiveIntensity = 1.2 + v * 2.5;
    this.mats.lamp.emissiveIntensity = 2 + v * 3;
  }
  setSmokeColors(light, dark) {
    this.smoke.material.uniforms.uColor.value.set(light);
    this.smoke.material.uniforms.uDark.value.set(dark);
  }
  // the next station ahead that hasn't been served this trip
  nextHalt() {
    let best = null, bd = Infinity;
    for (const h of this.halts) {
      if (this.served.has(h)) continue;
      const d = (this.stopFor(h) - this.head) * this.dir;
      if (d > -2 && d < bd) { bd = d; best = h; }
    }
    return best ? { h: best, d: bd } : null;
  }
  // the boy takes over (only while it's standing at a station) and hands back
  takeControl() { this.mode = 'driven'; this.drive.throttle = 0; this.drive.brake = 0; }
  release() {
    if (this.loopLine) { this.mode = this.v === 0 && this.at ? 'dwell' : 'run'; this.timer = 8; return; }
    if (this.termini) {
      if (this.v !== 0) this.m = Math.sign(this.v);
      else if (!this.nextStop(this.m)) this.m = -this.m;
      this.mode = this.v === 0 && this.at ? 'dwell' : 'run';
      this.timer = 8;
      return;
    }
    this.mode = this.v === 0 && this.at ? 'dwell' : 'run';
    this.timer = 6;
    // stations behind it on this trip count as served
    this.served = new Set(this.halts.filter((h) => (this.stopFor(h) - this.head) * this.dir < 5));
  }
  // the station lines: run from terminus to terminus, stopping at every platform, reversing at the ends
  nextStop(m) {
    let best = null, bd = Infinity;
    for (const h of this.halts) { const d = (this.stopFor(h) - this.head) * m; if (d > 0.5 && d < bd) { bd = d; best = h; } }
    return best ? { h: best, d: bd } : null;
  }
  updateTermini(dt) {
    if (this.mode === 'dwell') {
      this.v = 0;
      this.timer -= dt;
      if (this.timer <= 0) {
        if (!this.nextStop(this.m)) this.m = -this.m; // the end of the line: back the other way
        this.mode = 'run';
        if (this.at && this.onStation) this.onStation('depart', this, this.at);
        this.at = null;
      }
    } else if (this.mode === 'run') {
      const nh = this.nextStop(this.m);
      let target = CRUISE;
      if (nh) target = Math.min(target, Math.sqrt(Math.max(0, 2 * BRAKE * Math.max(0, nh.d - 0.5))));
      const sp = Math.abs(this.v);
      const nsp = sp < target ? Math.min(target, sp + ACCEL * dt) : Math.max(target, sp - BRAKE * 1.6 * dt);
      this.v = nsp * this.m;
      this.head += this.v * dt;
      if (nh && nh.d < 0.6 && nsp < 1.2) {
        this.v = 0; this.head = this.stopFor(nh.h); this.at = nh.h;
        this.mode = 'dwell'; this.timer = nh.h.noStation ? 12 : 45; // 45 s at every platform: time to get on, or take over the cab
        if (this.onStation) this.onStation('arrive', this, nh.h);
      }
    } else if (this.mode === 'driven') {
      const { throttle, brake } = this.drive;
      if (brake > 0) { const dv = (BRAKE * 2.2) * dt; this.v = Math.abs(this.v) <= dv ? 0 : this.v - Math.sign(this.v) * dv; }
      else if (throttle !== 0) this.v = THREE.MathUtils.clamp(this.v + throttle * this.cabSign * ACCEL * 1.5 * dt, -TOP, TOP);
      else { const dv = 0.08 * dt; this.v = Math.abs(this.v) <= dv ? 0 : this.v - Math.sign(this.v) * dv; }
      this.head += this.v * dt;
      // buffer stops beyond the end platforms
      if (this.head > this.sE - 2) { this.head = this.sE - 2; this.v = 0; this.bumped = true; }
      if (this.head - this.length < this.sW + 2) { this.head = this.sW + 2 + this.length; this.v = 0; this.bumped = true; }
      this.at = null;
      if (this.v === 0) for (const h of this.halts) if (Math.abs(this.head - this.stopFor(h)) < 22) this.at = h;
    }
  }
  // the ring: round and round, always forward, stopping at every station
  nextLoopStop() {
    const L = this.path.L;
    let best = null, bd = Infinity;
    for (const h of this.halts) { let d = (((this.stopFor(h) - this.head) % L) + L) % L; if (d < 0.5) d += L; if (d < bd) { bd = d; best = h; } }
    return best ? { h: best, d: bd } : null;
  }
  updateLoop(dt) {
    const L = this.path.L;
    if (this.mode === 'dwell') {
      this.v = 0; this.timer -= dt;
      if (this.timer <= 0) { this.mode = 'run'; if (this.at && this.onStation) this.onStation('depart', this, this.at); this.at = null; }
    } else if (this.mode === 'run') {
      const nh = this.nextLoopStop();
      const target = nh ? Math.min(CRUISE, Math.sqrt(Math.max(0, 2 * BRAKE * Math.max(0, nh.d - 0.5)))) : CRUISE;
      this.v = this.v < target ? Math.min(target, this.v + ACCEL * dt) : Math.max(target, this.v - BRAKE * 1.6 * dt);
      const step = this.v * dt;
      if (nh && nh.d - step < 0.6 && this.v < 1.2) {
        this.head += nh.d; this.v = 0; this.at = nh.h; this.mode = 'dwell'; this.timer = 45;
        if (this.onStation) this.onStation('arrive', this, nh.h);
      } else this.head += step;
    } else if (this.mode === 'driven') {
      const { throttle, brake } = this.drive;
      if (brake > 0) { const dv = BRAKE * 2.2 * dt; this.v = Math.abs(this.v) <= dv ? 0 : this.v - Math.sign(this.v) * dv; }
      else if (throttle !== 0) this.v = THREE.MathUtils.clamp(this.v + throttle * ACCEL * 1.5 * dt, -6, TOP);
      else { const dv = 0.08 * dt; this.v = Math.abs(this.v) <= dv ? 0 : this.v - Math.sign(this.v) * dv; }
      this.head += this.v * dt;
      this.at = null;
      if (this.v === 0) for (const h of this.halts) { const d = (((this.head - this.stopFor(h)) % L) + L) % L; if (d < 22 || d > L - 22) this.at = h; }
    }
    if (this.head > 4 * L) this.head -= 2 * L; // keep the number small; positions wrap round the ring anyway
  }
  update(dt) {
    this.boxes.length = 0;
    const prevHead = this.head;
    if (this.loopLine) this.updateLoop(dt);
    else if (this.termini) this.updateTermini(dt);
    else if (this.mode === 'wait') {
      // hidden in the tunnel at one end of the line, waiting to come back
      this.v = 0;
      this.timer -= dt;
      if (this.timer <= 0) { this.mode = 'run'; this.served.clear(); }
    } else if (this.mode === 'dwell') {
      this.v = 0;
      this.timer -= dt;
      if (this.timer <= 0) {
        this.mode = 'run';
        if (this.at && this.onStation) this.onStation('depart', this, this.at);
        this.at = null;
      }
    } else if (this.mode === 'run') {
      const nh = this.nextHalt();
      let target = CRUISE;
      if (nh) {
        const brakeV = Math.sqrt(Math.max(0, 2 * BRAKE * Math.max(0, nh.d - 0.5)));
        target = Math.min(target, brakeV);
        if (nh.d < 0.6 && this.v < 1.2) {
          this.v = 0; this.head = this.stopFor(nh.h);
          this.served.add(nh.h); this.at = nh.h;
          this.mode = 'dwell'; this.timer = 45;
          if (this.onStation) this.onStation('arrive', this, nh.h);
        }
      }
      if (this.mode === 'run') {
        if (this.v < target) this.v = Math.min(target, this.v + ACCEL * dt);
        else this.v = Math.max(target, this.v - BRAKE * 1.6 * dt);
        this.head += this.dir * this.v * dt;
        // into the far tunnel: wait there, then come back the other way
        if ((this.dir > 0 && this.tail > this.sE + 30) || (this.dir < 0 && this.tail < this.sW - 30)) {
          this.dir = -this.dir;
          this.head = this.dir > 0 ? this.sW - 30 : this.sE + 30;
          this.mode = 'wait'; this.timer = this.layover; this.v = 0;
        }
      }
    } else if (this.mode === 'driven') {
      // v is signed along the direction the engine faces
      const { throttle, brake } = this.drive;
      if (brake > 0) { const dv = (BRAKE * 2.2) * dt; this.v = Math.abs(this.v) <= dv ? 0 : this.v - Math.sign(this.v) * dv; }
      else if (throttle !== 0) this.v = THREE.MathUtils.clamp(this.v + throttle * ACCEL * 1.5 * dt, -6, TOP);
      else { const dv = 0.08 * dt; this.v = Math.abs(this.v) <= dv ? 0 : this.v - Math.sign(this.v) * dv; }
      this.head += this.dir * this.v * dt;
      // the ends of the line: buffers inside the tunnels
      const lo = this.sW + 4, hi = this.sE - 4;
      const front = this.head, back = this.tail;
      const minS = Math.min(front, back), maxS = Math.max(front, back);
      if (minS < lo) { this.head += lo - minS; this.v = 0; this.bumped = true; }
      if (maxS > hi) { this.head -= maxS - hi; this.v = 0; this.bumped = true; }
      // standing at a platform?
      this.at = null;
      if (this.v === 0) for (const h of this.halts) if (Math.abs(this.head - this.stopFor(h)) < 22) this.at = h;
    }
    // never run into another train sharing the line (the station lines run onto the ring at the junctions):
    // stop a few metres short of it
    if (this.head !== prevHead && this.others) {
      const sg = Math.sign(this.head - prevHead), ends = [this.head, this.tail];
      const fs = sg > 0 ? Math.max(...ends) : Math.min(...ends);
      const f = this.path.at(fs + sg * 1.5);
      let hit = false;
      for (const o of this.others) {
        if (o === this) continue;
        for (const b of o.boxes) {
          const dx = f.x - b.x, dz = f.z - b.z, c = Math.cos(b.rot), sn = Math.sin(b.rot);
          const lz = dx * sn + dz * c, lx = dx * c - dz * sn;
          if (Math.abs(lx) < 2.4 && Math.abs(lz) < b.hd + 3) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) { this.head = prevHead; this.v = 0; this.bumped = true; }
    }
    const ds = this.head - prevHead;
    this.travel += this.termini || this.loopLine ? ds : ds * this.dir;
    // cars along the line
    let anyVis = false;
    const speed = Math.abs(this.v);
    for (const c of this.cars) {
      const sc = this.head - this.dir * c.off;
      const vis = this.mode !== 'wait'; // the tunnels are real now: the train is seen going in and coming out
      c.g.visible = vis;
      c.s = sc;
      if (!vis) continue;
      anyVis = true;
      const a = this.point(sc + this.dir * Math.max(0.5, c.L / 2 - 3)), b = this.point(sc - this.dir * Math.max(0.5, c.L / 2 - 3));
      c.g.position.set((a.x + b.x) / 2, RAIL_TOP - 0.42, (a.z + b.z) / 2);
      c.g.rotation.y = Math.atan2(a.x - b.x, a.z - b.z) + (c.rev ? Math.PI : 0);
      const tv = c.rev ? -this.travel : this.travel;
      for (const w of c.wheels) w.o.rotation.x = tv / w.r;
      if (c.animate) c.animate(tv / 0.82);
      const vs = c.rev ? -this.v : this.v;
      this.boxes.push({ kind: 'b', x: c.g.position.x, z: c.g.position.z, rot: c.g.rotation.y, hw: 1.7, hd: c.L / 2 + 0.35, vx: Math.sin(c.g.rotation.y) * vs, vz: Math.cos(c.g.rotation.y) * vs, loco: c === this.loco, moving: speed > 0.3 });
    }
    this.active = anyVis;
    // a whistle as the engine comes out of a tunnel
    const L0 = this.loco;
    const open0 = this.mode !== 'wait' && this.openAt(this.head - this.dir * L0.off);
    if (open0 && !this.wasOpen && speed > 1 && this.onEmerge) this.onEmerge(this);
    this.wasOpen = open0;
    // chuff chuff: four exhaust beats per turn of the drivers; a lazy plume while standing
    for (const L of this.locos) {
    const open = this.mode !== 'wait' && this.openAt(L.s ?? this.head);
    const tv = L.rev ? -this.travel : this.travel;
    if (L.g.visible && open && dt > 0) {
      L.g.updateMatrixWorld();
      const fwdX = Math.sin(L.g.rotation.y), fwdZ = Math.cos(L.g.rotation.y);
      const beat = Math.pow(Math.max(0, Math.sin((tv / 0.82) * 2)), 6);
      const chuffN = Math.floor((Math.abs(tv) / 0.82) * 2 / Math.PI);
      if (L === this.loco && chuffN !== this.chuffN) { this.chuffN = chuffN; if (this.onChuff && speed > 0.2) this.onChuff(L.g.position); }
      const k = Math.min(1, speed / CRUISE);
      this.emitAcc += dt * (3 + k * 11 + beat * 60 * k);
      const ch = L.g.localToWorld(this._v.copy(L.chimney));
      const sv = this.termini ? this.v * (L.rev ? -1 : 1) : this.v;
      while (this.emitAcc > 1) {
        this.emitAcc -= 1;
        const up = 2.5 + k * 2 + Math.random() * 2.5;
        this.smoke.emit(ch.x + (Math.random() - 0.5) * 0.3, ch.y, ch.z + (Math.random() - 0.5) * 0.3,
          fwdX * sv * 0.25 + (Math.random() - 0.5) * 0.8, up, fwdZ * sv * 0.25 + (Math.random() - 0.5) * 0.8,
          4.5 + Math.random() * 2.5, 0.6, 4 + k * 2 + Math.random() * 3, 0.65 + k * 0.1, 0.05 + Math.random() * 0.2);
      }
      this.steamAcc += dt * (speed > 0.2 ? 5 : this.mode === 'dwell' || this.mode === 'driven' ? 1.5 : 0);
      while (this.steamAcc > 1) {
        this.steamAcc -= 1;
        const cyl = L.cylinders[Math.random() < 0.5 ? 0 : 1];
        const p = L.g.localToWorld(this._v.copy(cyl));
        const sx = Math.sign(cyl.x);
        this.smoke.emit(p.x + fwdZ * sx * 0.3, p.y, p.z - fwdX * sx * 0.3, fwdZ * sx * 1.6, 0.4, -fwdX * sx * 1.6, 1.2, 0.3, 1.6, 0.5, 1);
      }
    }
    }
    this.smoke.update(dt);
    this.headInfo = { dir: this.dir, head: this.head };
  }
  // the world position of each coach door on one side (±1 = the engine's left / right), for boarding
  doors(side) {
    const out = [];
    for (const c of this.cars) {
      if (!c.coach || !c.g.visible) continue;
      for (const lz of [-c.L / 2 + 1.0, c.L / 2 - 1.0]) out.push(c.g.localToWorld(new THREE.Vector3(side * 1.5, 0, lz)));
    }
    return out;
  }
  distanceTo(x, z) {
    let m = Infinity;
    for (const b of this.boxes) m = Math.max(0, Math.min(m, Math.hypot(b.x - x, b.z - z) - b.hd));
    return m;
  }
}
