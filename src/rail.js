// The railway: ballast, sleepers, rails, a girder bridge over the river, tunnel portals in the hills,
// a level crossing with a gatekeeper's hut — and a passenger train that passes once a minute.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK, TRACK3, TRACKS, TRACK_Y, riverX, RIVER_HALF, WATER_Y, CROSSING, CROSSING3, heightAt, colliders } from './world.js';
import { toTexture } from './textures.js';
import { lathe, boulder } from './shapes.js';
import { Puffs } from './particles.js';

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

function ribbon(x0, x1, step, profile, mat) {
  // profile: array of [offset, y]; extruded along the track
  const pos = [], idx = [];
  const n = Math.ceil((x1 - x0) / step);
  for (let i = 0; i <= n; i++) {
    const { p, n: nn } = trackPoint(x0 + (i * (x1 - x0)) / n);
    for (const [o, y] of profile) pos.push(p.x + nn.x * o, y, p.z + nn.z * o);
  }
  const m = profile.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = a + m;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
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

export function buildRailway(scene) {
  const group = new THREE.Group();
  for (const T of TRACKS) buildLine(group, T, T === TRACK);
  scene.add(group);
  const A = new Train(scene, TRACK, { name: 'Sonpur–Noorpur Passenger', first: 10, coaches: 5 });
  const B = new Train(scene, TRACKS[1], { livery: { base: '#1d4a3c', line: '#ead9a6', dark: '#123228', door: '#183f33' }, end: '#1d4a3c', coaches: 6, first: 150, startDir: -1, boiler: '#1c2a22', layover: 45, name: 'Mail' });
  const C = new Train(scene, TRACK3, { livery: { base: '#24407a', line: '#f0d070', dark: '#16284e', door: '#1d3566' }, end: '#24407a', coaches: 3, first: 22, boiler: '#1a1c24', name: 'Mariapur–Noorpur Local' });
  return new Railway([A, B, C]);
}

// a level crossing: barrier booms either side, and the gatekeeper's hut
function levelCrossing(group, cx, cz, offs = [14, 6.5]) {
  const { t } = trackPoint(cx);
  const white = std('#efefe8'), red = std('#c22d22');
  const stripe = document.createElement('canvas');
  stripe.width = 128; stripe.height = 8;
  const sg = stripe.getContext('2d');
  for (let i = 0; i < 8; i++) { sg.fillStyle = i % 2 ? '#c22d22' : '#f2f2ec'; sg.fillRect(i * 16, 0, 16, 8); }
  const boomMat = std('#ffffff', { map: toTexture(stripe) });
  for (const side of [-1, 1]) {
    const off = side < 0 ? offs[0] : offs[1];
    const bx = cx - t.z * side * off + t.x * side * 4, bz = cz + t.x * side * off + t.z * side * 4;
    const by = heightAt(bx, bz);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.3, 0.35), white);
    post.position.set(bx, by + 0.65, bz);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 7), boomMat);
    boom.geometry.translate(0, 0, 3.5);
    boom.position.set(bx, by + 1.2, bz);
    boom.rotation.y = Math.atan2(-t.x * side, -t.z * side);
    boom.rotateX(-1.25);
    post.castShadow = boom.castShadow = true;
    group.add(post, boom);
    colliders.push({ kind: 'c', x: bx, z: bz, r: 0.3 });
  }
  const hx = cx - t.z * 9 + t.x * 8, hz = cz + t.x * 9 + t.z * 8;
  const hy = heightAt(hx, hz);
  const hut = new THREE.Group();
  hut.position.set(hx, hy, hz);
  hut.rotation.y = Math.atan2(t.x, t.z);
  const yellow = std('#d9b45a');
  const addH = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; hut.add(o); };
  addH(new THREE.BoxGeometry(2.6, 2.4, 2.4), yellow, 0, 1.2, 0);
  addH(new THREE.BoxGeometry(3.2, 0.2, 3.0), red, 0, 2.5, 0);
  addH(new THREE.BoxGeometry(0.9, 1.8, 0.05), std('#3a4a5a'), -0.6, 0.95, 1.22);
  addH(new THREE.BoxGeometry(0.7, 0.6, 0.05), std('#1c1612'), 0.6, 1.5, 1.22);
  group.add(hut);
  colliders.push({ kind: 'b', x: hx, z: hz, rot: hut.rotation.y, hw: 1.3, hd: 1.2 });
}

function buildLine(group, T, main) {
  TK = T;
  const d = new THREE.Object3D();
  const ballastMat = std('#7d746a', { roughness: 1 });
  const prof = [[-2.4, TRACK_Y - 0.1], [-1.6, TRACK_Y + 0.25], [1.6, TRACK_Y + 0.25], [2.4, TRACK_Y - 0.1]];
  const bx0 = T.xr - RIVER_HALF - 9, bx1 = T.xr + RIVER_HALF + 9;
  const hasBridge = T.open(T.xr);
  const railMat = std('#9aa0a6', { metalness: 0.85, roughness: 0.3 });
  const xs = [];
  // every open stretch gets ballast, sleepers and rails (running a little way into the tunnel mouths)
  for (const [a, b] of T.segs) {
    const x0 = T.termini ? a : a - 4, x1 = T.termini ? b : b + 4;
    if (hasBridge && T.xr > a && T.xr < b) group.add(ribbon(x0, bx0, 2, prof, ballastMat), ribbon(bx1, x1, 2, prof, ballastMat));
    else group.add(ribbon(x0, x1, 2, prof, ballastMat));
    // keep the sleepers evenly spaced along the line, not along x, so the curving line stays tidy
    for (let x = x0; x < x1; x += 0.62 / Math.sqrt(1 + T.slope(x) ** 2)) xs.push(x);
    for (const sx of [-GAUGE, GAUGE]) group.add(ribbon(x0, x1, 1, [[sx - 0.04, RAIL_TOP - 0.16], [sx - 0.035, RAIL_TOP], [sx + 0.035, RAIL_TOP], [sx + 0.04, RAIL_TOP - 0.16]], railMat));
  }
  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.14, 2.5), std('#8a857c'), xs.length);
  xs.forEach((x, i) => {
    const { p, t } = trackPoint(x);
    d.position.set(p.x, nearRiver(x) ? RAIL_TOP - 0.2 : TRACK_Y + 0.3, p.z);
    d.rotation.set(0, Math.atan2(t.x, t.z) - Math.PI / 2, 0);
    d.updateMatrix();
    sleepers.setMatrixAt(i, d.matrix);
  });
  sleepers.receiveShadow = true;
  sleepers.computeBoundingSphere();
  group.add(sleepers);

  // girder bridge over the river
  if (hasBridge) {
    const steel = std('#56606a', { metalness: 0.4, roughness: 0.6 });
    const concrete = std('#9c968c');
    const bL = bx1 - bx0;
    const { p: bc, t: bt } = trackPoint(T.xr);
    const blen = bL * Math.sqrt(1 + T.slope(T.xr) ** 2);
    const bridge = new THREE.Group();
    bridge.position.set(bc.x, 0, bc.z);
    bridge.rotation.y = Math.atan2(bt.x, bt.z);
    const addB = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; bridge.add(o); return o; };
    addB(new THREE.BoxGeometry(3.6, 0.35, blen), concrete, 0, RAIL_TOP - 0.45, 0);
    for (const sx of [-1, 1]) {
      addB(new THREE.BoxGeometry(0.25, 0.3, blen), steel, sx * 2.0, RAIL_TOP + 2.6, 0);
      addB(new THREE.BoxGeometry(0.25, 0.5, blen), steel, sx * 2.0, RAIL_TOP - 0.2, 0);
      const n = 12;
      for (let i = 0; i <= n; i++) {
        const z = -blen / 2 + (i * blen) / n;
        addB(new THREE.BoxGeometry(0.18, 2.8, 0.18), steel, sx * 2.0, RAIL_TOP + 1.2, z);
        if (i < n) {
          const diag = addB(new THREE.BoxGeometry(0.14, Math.hypot(2.8, blen / n), 0.14), steel, sx * 2.0, RAIL_TOP + 1.2, z + blen / n / 2);
          diag.rotation.x = Math.atan2(blen / n, 2.8) * (i % 2 ? 1 : -1);
        }
      }
    }
    for (const z of [-blen / 3, 0, blen / 3]) addB(new THREE.CylinderGeometry(0.7, 0.9, RAIL_TOP - WATER_Y + 2.5, 12), concrete, 0, (RAIL_TOP + WATER_Y - 2.5) / 2 - 0.4, z);
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) colliders.push({ kind: 'c', x: bc.x + bt.x * (-blen / 2 + i * blen / 2) + sx * bt.z * 2.0, z: bc.z + bt.z * (-blen / 2 + i * blen / 2) - sx * bt.x * 2.0, r: 0.2 });
    group.add(bridge);
  }

  // the station lines end at buffer stops beyond their last platforms
  if (T.termini) {
    const red = std('#b8261c', { roughness: 0.6 }), white = std('#efefe8'), iron = std('#3a3836', { roughness: 0.6 });
    for (const [x, dir] of [[T.xW + 0.5, 1], [T.xE - 0.5, -1]]) {
      const { p, t } = trackPoint(x);
      const g = new THREE.Group();
      g.position.set(p.x, RAIL_TOP, p.z);
      g.rotation.y = Math.atan2(t.x * dir, t.z * dir); // facing along the line, toward the trains
      const add = (geo, m, x2, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x2, y, z); o.castShadow = true; g.add(o); return o; };
      add(new THREE.BoxGeometry(2.6, 0.5, 0.35), red, 0, 0.75, 0);
      add(new THREE.BoxGeometry(2.6, 0.12, 0.37), white, 0, 0.75, 0);
      for (const sx of [-0.85, 0.85]) {
        add(new THREE.CylinderGeometry(0.16, 0.16, 0.4, 12).rotateX(Math.PI / 2), iron, sx, 0.75, 0.35);
        const leg = add(new THREE.BoxGeometry(0.12, 0.12, 2.2), iron, sx, 0.35, -0.9); leg.rotation.x = -0.35;
      }
      add(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12).rotateX(Math.PI / 2), std('#ff3a1a', { emissive: '#ff2a10', emissiveIntensity: 1.5 }), 0, 1.15, 0.2);
      group.add(g);
      colliders.push({ kind: 'b', x: p.x, z: p.z, rot: g.rotation.y, hw: 1.4, hd: 0.4, height: RAIL_TOP + 1.2 });
    }
  }
  // tunnel portals wherever a stretch meets a hill (the old Mail line)
  const stone = std('#8f877b', { roughness: 1 });
  const dark = new THREE.MeshBasicMaterial({ color: '#050505' });
  if (!T.termini) for (const [a, b] of T.segs) for (const [x, dir] of [[a, 1], [b, -1]]) {
    const { p, t } = trackPoint(x);
    const portal = new THREE.Group();
    portal.position.set(p.x, TRACK_Y - 1, p.z);
    portal.rotation.y = Math.atan2(t.x * dir, t.z * dir);
    const shape = new THREE.Shape();
    shape.moveTo(-8, -0.6); shape.lineTo(8, -0.6); shape.lineTo(8, 11); shape.lineTo(-8, 11); shape.lineTo(-8, -0.6);
    const hole = new THREE.Path();
    hole.moveTo(-2.6, 0); hole.lineTo(2.6, 0); hole.lineTo(2.6, 5.2); hole.absarc(0, 5.2, 2.6, 0, Math.PI, false); hole.lineTo(-2.6, 0);
    shape.holes.push(hole);
    const face = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false }), stone);
    face.castShadow = face.receiveShadow = true;
    portal.add(face);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 8.5), dark);
    back.position.set(0, 4, -1.5);
    portal.add(back);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(17, 0.6, 2.0), std('#7b7367'));
    cap.position.set(0, 11.2, 0.8);
    portal.add(cap);
    group.add(portal);
  }

  // level crossings: the old one on the main line (its booms span both lines), and the new line's on the north road
  if (main) levelCrossing(group, CROSSING.x, CROSSING.z);
  if (T === TRACK3) levelCrossing(group, CROSSING3.x, CROSSING3.z, [6.5, 6.5]);

  // telegraph poles along the line
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 6, 6).translate(0, 3, 0);
  const armGeo = new THREE.BoxGeometry(1.0, 0.08, 0.08).translate(0, 5.6, 0);
  const pg = mergeGeometries([poleGeo, armGeo]);
  const poleXs = [];
  if (main || T === TRACK3) for (const [a, b] of T.segs) for (let x = a + 10; x < b - 10; x += 45 / Math.sqrt(1 + T.slope(x) ** 2)) if (!nearRiver(x) && Math.abs(x - CROSSING.x) > 10 && Math.abs(x - CROSSING3.x) > 10) poleXs.push(x);
  const poles = new THREE.InstancedMesh(pg, std('#5a5048'), Math.max(1, poleXs.length));
  const wirePts = [];
  poleXs.forEach((x, i) => {
    const { p, n } = trackPoint(x);
    const px = p.x + n.x * 5, pz = p.z + n.z * 5;
    const py = heightAt(px, pz);
    d.position.set(px, py, pz);
    d.rotation.set(0, Math.atan2(n.x, n.z), 0);
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
    if (a.distanceTo(b) > 60) continue; // no wire over a tunnel
    for (let k = 0; k < 8; k++) {
      const t0 = k / 8, t1 = (k + 1) / 8;
      const sag = (t) => -Math.sin(t * Math.PI) * 0.6;
      wv.push(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0 + sag(t0), a.z + (b.z - a.z) * t0);
      wv.push(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1 + sag(t1), a.z + (b.z - a.z) * t1);
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3));
  if (wv.length) group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2a2622' })));
  if (!poleXs.length) poles.visible = false;
}

// All the trains behind one interface for the rest of the game.
class Railway {
  constructor(trains) {
    this.trains = trains;
    this.boxes = [];
    this.main = trains[0];
    this.lastT = null;
  }
  set onEmerge(f) { for (const t of this.trains) t.onEmerge = f; }
  set onChuff(f) { for (const t of this.trains) t.onChuff = f; }
  set onStation(f) { for (const t of this.trains) t.onStation = f; }
  get active() { return this.trains.some((t) => t.active); }
  update(time) {
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(0.1, time - this.lastT));
    this.lastT = time;
    this.boxes.length = 0;
    for (const t of this.trains) { t.update(dt); this.boxes.push(...t.boxes); }
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
const CRUISE = 15, ACCEL = 0.55, BRAKE = 0.75;
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
    // arc-length table
    this.xs = [];
    this.ss = [];
    const tz = track.z;
    let s = 0, px = track.xW - 300, pz = tz(px);
    for (let x = track.xW - 300; x <= track.xE + 300; x += 1) {
      const z = tz(x);
      s += Math.hypot(x - px, z - pz);
      this.xs.push(x); this.ss.push(s);
      px = x; pz = z;
    }
    this.sW = this.sAt(track.xW);
    this.sE = this.sAt(track.xE);
    // stations along the line, by distance along it
    this.halts = (track.halts ?? []).map((h) => ({ ...h, s: this.sAt(h.x) }));
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
  sAt(x) { return this.ss[Math.max(0, Math.min(this.ss.length - 1, Math.round(x - this.xs[0])))]; }
  xAt(s) {
    let lo = 0, hi = this.ss.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.ss[m] < s) lo = m; else hi = m; }
    const t = (s - this.ss[lo]) / (this.ss[hi] - this.ss[lo] || 1);
    return this.xs[lo] + (this.xs[hi] - this.xs[lo]) * t;
  }
  point(s) {
    const x = this.xAt(s);
    return new THREE.Vector3(x, RAIL_TOP, this.tk.z(x));
  }
  openAt(s) { return this.tk.open(this.xAt(s)); }
  get tail() { return this.head - this.dir * this.length; }
  // where the head stops so the train stands centred on a platform
  stopFor(h) { return this.termini ? h.s + this.length / 2 : h.s + this.dir * this.length / 2 - this.dir * 6; }
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
        this.mode = 'dwell'; this.timer = nh.h.big || !this.nextStop(this.m) ? 30 : 22;
        if (this.onStation) this.onStation('arrive', this, nh.h);
      }
    } else if (this.mode === 'driven') {
      const { throttle, brake } = this.drive;
      if (brake > 0) { const dv = (BRAKE * 2.2) * dt; this.v = Math.abs(this.v) <= dv ? 0 : this.v - Math.sign(this.v) * dv; }
      else if (throttle !== 0) this.v = THREE.MathUtils.clamp(this.v + throttle * this.cabSign * ACCEL * 1.2 * dt, -22, 22);
      else { const dv = 0.08 * dt; this.v = Math.abs(this.v) <= dv ? 0 : this.v - Math.sign(this.v) * dv; }
      this.head += this.v * dt;
      // buffer stops beyond the end platforms
      if (this.head > this.sE - 2) { this.head = this.sE - 2; this.v = 0; this.bumped = true; }
      if (this.head - this.length < this.sW + 2) { this.head = this.sW + 2 + this.length; this.v = 0; this.bumped = true; }
      this.at = null;
      if (this.v === 0) for (const h of this.halts) if (Math.abs(this.head - this.stopFor(h)) < 22) this.at = h;
    }
  }
  update(dt) {
    this.boxes.length = 0;
    const prevHead = this.head;
    if (this.termini) this.updateTermini(dt);
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
          this.mode = 'dwell'; this.timer = nh.h.big ? 32 : 20;
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
      else if (throttle !== 0) this.v = THREE.MathUtils.clamp(this.v + throttle * ACCEL * 1.2 * dt, -6, 22);
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
    const ds = this.head - prevHead;
    this.travel += this.termini ? ds : ds * this.dir;
    // cars along the line
    let anyVis = false;
    const speed = Math.abs(this.v);
    for (const c of this.cars) {
      const sc = this.head - this.dir * c.off;
      const vis = this.mode !== 'wait' && (this.openAt(sc + c.L / 2 + 3) || this.openAt(sc - c.L / 2 - 3) || this.openAt(sc));
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
