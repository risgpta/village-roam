// Two more rides: a green-and-yellow auto rickshaw the boy can drive, and a wooden rowing boat at the ghat.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ellipsoid, lathe } from './shapes.js';
import { ik2 } from './bicycle.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });

// ---- tyres & wheels, shared by every vehicle ----
// tyre: a lathed carcass with rounded shoulders and a bulging sidewall, two staggered rows of tread blocks
// split by a centre groove, and a raised lettering band on each wall. rim: a dished steel wheel with vent
// holes, a hub cap and wheel nuts. Geometry is cached per size, so many wheels cost little.
const _wcache = new Map();
function tyreGeos(r, w) {
  const key = r.toFixed(3) + ':' + w.toFixed(3);
  if (_wcache.has(key)) return _wcache.get(key);
  const prof = [];
  const ri = r * 0.64; // bead seat
  const pts = [[ri, -w * 0.42], [r * 0.78, -w * 0.5], [r * 0.9, -w * 0.5], [r - w * 0.2, -w * 0.46], [r - w * 0.06, -w * 0.36], [r, -w * 0.22], [r, w * 0.22], [r - w * 0.06, w * 0.36], [r - w * 0.2, w * 0.46], [r * 0.9, w * 0.5], [r * 0.78, w * 0.5], [ri, w * 0.42]];
  for (const [a, b] of pts) prof.push(new THREE.Vector2(a, b));
  const carcass = new THREE.LatheGeometry(prof, 40).rotateZ(Math.PI / 2);
  const blocks = [];
  const n = Math.max(18, Math.round(r * 56));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const off = side > 0 ? 0 : Math.PI / n;
      blocks.push(new THREE.BoxGeometry(w * 0.36, r * 0.035, ((Math.PI * 2 * r) / n) * 0.62).translate(side * w * 0.22, r + r * 0.012, 0).rotateX(a + off));
    }
  }
  const tread = mergeGeometries(blocks);
  const band = [];
  for (const sx of [-1, 1]) band.push(new THREE.TorusGeometry(r * 0.84, w * 0.025, 4, 40).rotateY(Math.PI / 2).translate(sx * w * 0.49, 0, 0));
  const letters = mergeGeometries(band);
  // the steel rim: a dish with a ring of vent holes suggested by dark slots, centre hub and nuts
  const dish = new THREE.LatheGeometry([[ri * 1.02, -w * 0.4], [ri * 0.95, -w * 0.3], [ri * 0.55, -w * 0.18], [ri * 0.42, -w * 0.08], [0.001, -w * 0.08]].map(([a, b]) => new THREE.Vector2(a, b)), 28).rotateZ(Math.PI / 2);
  const dishes = mergeGeometries([dish.clone(), dish.clone().scale(-1, 1, 1)]);
  const vents = [], nuts = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    for (const sx of [-1, 1]) vents.push(new THREE.BoxGeometry(0.004, ri * 0.18, ri * 0.11).translate(sx * w * 0.27, ri * 0.72, 0).rotateX(a));
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    for (const sx of [-1, 1]) nuts.push(new THREE.CylinderGeometry(ri * 0.05, ri * 0.05, w * 0.1, 6).rotateZ(Math.PI / 2).translate(sx * w * 0.12, Math.cos(a) * ri * 0.3, Math.sin(a) * ri * 0.3));
  }
  const cap = mergeGeometries([-1, 1].map((sx) => new THREE.SphereGeometry(ri * 0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-sx * Math.PI / 2).scale(0.55, 1, 1).translate(sx * w * 0.1, 0, 0)));
  const out = { carcass, tread, letters, dishes, vents: mergeGeometries(vents), nuts: mergeGeometries(nuts), cap };
  _wcache.set(key, out);
  return out;
}
const _wm = new Map();
const wmat = (c, o) => { const k = c + JSON.stringify(o); if (!_wm.has(k)) _wm.set(k, std(c, o)); return _wm.get(k); };
function wheelMesh(r, w, rubber, hub, { wall = null } = {}) {
  const G = tyreGeos(r, w);
  const g = new THREE.Group();
  const rub = rubber ?? wmat('#1c1b1a', { roughness: 0.92 });
  const steel = hub ?? wmat('#c9cdd1', { metalness: 0.75, roughness: 0.3 });
  const mesh = (geo, m, shadow = true) => { const o = new THREE.Mesh(geo, m); o.castShadow = shadow; g.add(o); return o; };
  mesh(G.carcass, rub);
  mesh(G.tread, wmat('#141312', { roughness: 0.96 }));
  mesh(G.letters, wall ? wmat(wall, { roughness: 0.6 }) : wmat('#2c2b2a', { roughness: 0.8 }), false);
  mesh(G.dishes, steel);
  mesh(G.vents, wmat('#101010', { roughness: 1 }), false);
  mesh(G.nuts, wmat('#e2e5e8', { metalness: 0.9, roughness: 0.2 }), false);
  mesh(G.cap, wmat('#dfe3e6', { metalness: 0.95, roughness: 0.12 }), false);
  return g;
}

// ---------------- auto rickshaw ----------------
// Built from rounded panels: a green tub and cowl with a yellow belt line, a black canvas hood on a yellow
// roof, a curved windshield, chrome trim, mirrors, a little dashboard, lights and a number plate.
const RB = (w, h, d, r = 0.06, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
function plateTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#f2c81e'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#111'; g.font = 'bold 34px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const AUTO = {
  saddle: V(0, 0.76, 0.3), bar: V(0, 1.03, 0.78), stack: V(0.42, 0.3, -1.1),
};
export class AutoRickshaw {
  constructor({ body = '#1f7a44', top = '#f0c419' } = {}) {
    this.kind = 'auto';
    this.L = AUTO;
    const green = std(body, { roughness: 0.32, metalness: 0.25 }), yellow = std(top, { roughness: 0.32, metalness: 0.25 });
    const black = std('#141414', { roughness: 0.55 }), canvas = std('#1a1a1a', { roughness: 0.95, side: THREE.DoubleSide });
    const chrome = std('#d4d8dc', { metalness: 0.95, roughness: 0.18 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe2ea', roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.28, side: THREE.DoubleSide });
    const rubber = std('#1a1918', { roughness: 0.9 }), seat = std('#2a1d18', { roughness: 0.45 }), seam = std('#4a3428', { roughness: 0.5 });
    const red = std('#c4201c', { emissive: '#5a0806', emissiveIntensity: 0.6 }), amber = std('#f08a12', { emissive: '#5a2a06', emissiveIntensity: 0.6 });
    this.lamp = std('#fff6dc', { emissive: '#ffe6aa', emissiveIntensity: 0.3 });
    this.root = new THREE.Group();
    const g = new THREE.Group();
    this.root.add(g);
    this.body = g;
    const add = (geo, m, x, y, z, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; };
    // chassis & floor
    add(RB(1.24, 0.1, 2.05, 0.04), black, 0, 0.34, -0.12);
    // rear tub: green lower body, yellow belt-line, black skirt
    add(RB(1.36, 0.46, 1.22, 0.1, 4), green, 0, 0.6, -0.58);
    add(RB(1.38, 0.07, 1.24, 0.03), yellow, 0, 0.86, -0.58);
    add(RB(1.37, 0.08, 1.23, 0.03), black, 0, 0.4, -0.58);
    // front cowl: tapers to the nose, with the yellow cap and a chrome strip
    const cowl = add(RB(1.04, 0.72, 0.5, 0.2, 5), green, 0, 0.72, 0.86);
    cowl.scale.set(1, 1, 1);
    add(RB(0.86, 0.3, 0.3, 0.12, 4), green, 0, 0.55, 1.12);
    add(RB(1.06, 0.06, 0.52, 0.03), yellow, 0, 1.1, 0.86);
    add(RB(0.9, 0.04, 0.04, 0.015), chrome, 0, 0.82, 1.27);
    // side skirts joining cowl to tub
    for (const sx of [-1, 1]) add(RB(0.06, 0.32, 0.95, 0.03), green, sx * 0.56, 0.55, 0.2);
    // curved windshield in a chrome frame, with a wiper
    const ws = add(new THREE.CylinderGeometry(1.4, 1.4, 0.55, 20, 1, true, -0.34, 0.68).rotateY(Math.PI), glass, 0, 1.38, 2.25);
    ws.rotation.x = -0.18;
    for (const sx of [-1, 1]) { const p = add(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 6), chrome, sx * 0.47, 1.38, 0.87); p.rotation.x = -0.18; }
    add(new THREE.BoxGeometry(0.02, 0.4, 0.01), black, 0.1, 1.3, 0.9).rotation.z = 0.5;
    // the hood: yellow roof panel, black canvas skin wrapping the top and back, valances
    add(RB(1.46, 0.07, 2.16, 0.03), yellow, 0, 1.69, -0.2);
    add(RB(1.42, 0.12, 2.1, 0.06, 4), canvas, 0, 1.62, -0.2);
    add(RB(1.4, 0.72, 0.06, 0.03), canvas, 0, 1.26, -1.24);
    add(RB(0.6, 0.22, 0.02, 0.01), glass, 0, 1.36, -1.275);
    for (const sx of [-1, 1]) {
      add(RB(0.05, 0.16, 2.1, 0.02), canvas, sx * 0.71, 1.54, -0.2);
      add(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 10).rotateX(Math.PI / 2), canvas, sx * 0.7, 1.45, -0.3); // rolled side curtain
      // pillars and the grab rail
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.86, 8), black, sx * 0.67, 1.26, -1.2);
      add(new THREE.CylinderGeometry(0.022, 0.022, 0.84, 8), black, sx * 0.67, 1.27, 0.02);
      add(new THREE.CylinderGeometry(0.016, 0.016, 1.15, 8).rotateX(Math.PI / 2), chrome, sx * 0.64, 1.1, -0.62);
    }
    // seats with seams
    add(RB(0.44, 0.1, 0.34, 0.04), seat, 0, 0.72, 0.3);
    add(RB(0.4, 0.22, 0.06, 0.03), seat, 0, 0.86, 0.13);
    add(RB(1.18, 0.14, 0.46, 0.05, 4), seat, 0, 0.74, -0.68);
    add(RB(1.18, 0.5, 0.1, 0.05, 4), seat, 0, 1.04, -0.93);
    for (const x of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.01, 0.5, 0.11), seam, x, 1.04, -0.93);
    // dashboard with a little speedo
    add(RB(0.6, 0.12, 0.12, 0.04), black, 0, 1.02, 1.0);
    add(new THREE.CircleGeometry(0.04, 16), std('#e8e4d8', { emissive: '#3a3420', emissiveIntensity: 0.5 }), 0.12, 1.04, 0.935).rotation.y = Math.PI;
    // engine & exhaust under the rear bench
    add(RB(0.52, 0.3, 0.45, 0.06), std('#5a5c5e', { metalness: 0.5, roughness: 0.4 }), 0.1, 0.28, -0.85);
    add(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 10).rotateX(Math.PI / 2), chrome, AUTO.stack.x, AUTO.stack.y, -0.88);
    // rear: tail lights, number plate, mudflaps
    for (const sx of [-1, 1]) add(RB(0.12, 0.07, 0.03, 0.015), red, sx * 0.55, 0.72, -1.2);
    const plate = add(new THREE.PlaneGeometry(0.42, 0.11), new THREE.MeshStandardMaterial({ map: plateTexture('UP 32 A 4521'), roughness: 0.5 }), 0, 0.55, -1.195);
    plate.rotation.y = Math.PI;
    // rear wheels with fenders and mudflaps
    this.wheels = [];
    for (const sx of [-1, 1]) {
      const w = wheelMesh(0.24, 0.14, rubber, chrome);
      w.position.set(sx * 0.6, 0.24, -0.65);
      g.add(w);
      this.wheels.push(w);
      add(new THREE.CylinderGeometry(0.29, 0.29, 0.18, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), std('#1f7a44', { side: THREE.DoubleSide, roughness: 0.35, metalness: 0.25 }), sx * 0.6, 0.26, -0.65);
      add(new THREE.BoxGeometry(0.16, 0.18, 0.01), black, sx * 0.6, 0.12, -0.95);
    }
    // front: headlamp in a chrome ring, indicators; steering fork with handlebar, mirrors and the bulb horn
    add(new THREE.TorusGeometry(0.1, 0.018, 8, 20), chrome, 0, 0.82, 1.285);
    add(new THREE.CircleGeometry(0.095, 20), this.lamp, 0, 0.82, 1.29);
    for (const sx of [-1, 1]) add(RB(0.08, 0.05, 0.03, 0.012), amber, sx * 0.38, 0.95, 1.12);
    this.fork = new THREE.Group();
    this.fork.position.set(0, 0.9, 0.98);
    g.add(this.fork);
    const fw = wheelMesh(0.24, 0.12, rubber, chrome);
    fw.position.set(0, 0.24 - 0.9, 0.12);
    this.fork.add(fw);
    this.wheels.push(fw);
    add(new THREE.CylinderGeometry(0.27, 0.27, 0.14, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), std('#1f7a44', { side: THREE.DoubleSide, roughness: 0.35 }), 0, 0.26 - 0.9, 0.12, this.fork);
    const by = AUTO.bar.y - 0.9, bz = AUTO.bar.z - 0.98;
    add(mergeGeometries([
      new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8).translate(0, -0.33, 0.08),
      new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8).rotateZ(Math.PI / 2).translate(0, by, bz),
      new THREE.CylinderGeometry(0.02, 0.02, 0.24, 8).rotateX(0.6).translate(0, by - 0.04, bz + 0.09),
    ]), chrome, 0, 0, 0, this.fork);
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.024, 0.024, 0.13, 10).rotateZ(Math.PI / 2), rubber, sx * 0.27, by, bz, this.fork);
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), chrome, sx * 0.3, by + 0.15, bz + 0.02, this.fork);
      const mir = add(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 16).rotateX(Math.PI / 2), black, sx * 0.32, by + 0.32, bz + 0.03, this.fork);
      mir.rotation.y = sx * 0.3;
    }
    add(new THREE.SphereGeometry(0.045, 10, 8), black, 0.34, by + 0.02, bz - 0.02, this.fork);
    add(new THREE.ConeGeometry(0.04, 0.12, 10).rotateZ(-Math.PI / 2), chrome, 0.43, by + 0.02, bz - 0.02, this.fork);
    this.exhaust = V(AUTO.stack.x, AUTO.stack.y, -1.18);
  }
  foot(side, out) { return out.set(side * 0.13, 0.46, 0.7); }
  update(dt, speed, steer, riding, night = 0) {
    for (const w of this.wheels) w.rotation.x += (speed * dt) / 0.24;
    this.fork.rotation.y = riding ? steer * 1.2 : 0.3;
    this.lamp.emissiveIntensity = riding ? 0.6 + night * 3 : 0.1;
    this.body.position.y = riding && speed > 0.1 ? Math.sin(performance.now() * 0.05) * 0.004 : 0;
  }
}

// ---------------- scooter ----------------
// A classic step-through scooter: curved leg shield, bulbous side cowls, a long bench seat, chrome trim.
export const SCOOT = { saddle: V(0, 0.74, -0.32), bar: V(0, 1.0, 0.42) };
export class Scooter {
  constructor(color = '#7fc4b8') {
    this.kind = 'scooter';
    this.L = SCOOT;
    const paint = std(color, { roughness: 0.28, metalness: 0.2 }), cream = std('#f1ead8', { roughness: 0.35 });
    const chrome = std('#d4d8dc', { metalness: 0.95, roughness: 0.18 }), rubber = std('#1a1918', { roughness: 0.9 }), seat = std('#3a2418', { roughness: 0.5 });
    this.lamp = std('#fff6dc', { emissive: '#ffe6aa', emissiveIntensity: 0.3 });
    this.root = new THREE.Group();
    const g = new THREE.Group();
    this.root.add(g);
    const add = (geo, m, x, y, z, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; };
    // rear body: a rounded monocoque swelling into the side cowls
    add(ellipsoid(0.24, 0.2, 0.46, 22, 14), paint, 0, 0.42, -0.42);
    for (const sx of [-1, 1]) add(ellipsoid(0.1, 0.17, 0.32, 16, 10), paint, sx * 0.17, 0.38, -0.45);
    add(RB(0.2, 0.06, 0.04, 0.02), chrome, 0, 0.5, -0.88);
    add(RB(0.09, 0.05, 0.02, 0.01), std('#c4201c', { emissive: '#5a0806', emissiveIntensity: 0.6 }), 0, 0.56, -0.885);
    // floorboard with rubber strips, the curved leg shield and the front fender
    add(RB(0.34, 0.06, 0.56, 0.025), paint, 0, 0.27, 0.12);
    for (let i = -2; i <= 2; i++) add(new THREE.BoxGeometry(0.02, 0.012, 0.5), rubber, i * 0.06, 0.305, 0.12);
    const shield = add(new THREE.CylinderGeometry(0.3, 0.26, 0.62, 18, 1, true, -1.15, 2.3), std(color, { side: THREE.DoubleSide, roughness: 0.28, metalness: 0.2 }), 0, 0.6, 0.18);
    shield.rotation.x = -0.15;
    add(new THREE.TorusGeometry(0.29, 0.012, 6, 18, 2.3), chrome, 0, 0.91, 0.18).rotation.set(Math.PI / 2, 0, -1.15 - Math.PI / 2 + Math.PI);
    add(ellipsoid(0.11, 0.1, 0.24, 14, 10), paint, 0, 0.27, 0.62);
    // seat, rear rack, spare-wheel hub, mirrors
    add(RB(0.24, 0.09, 0.56, 0.04, 4), seat, 0, 0.69, -0.32);
    add(RB(0.25, 0.015, 0.58, 0.007), chrome, 0, 0.645, -0.32);
    add(RB(0.22, 0.015, 0.26, 0.006), chrome, 0, 0.66, -0.75);
    // steering column, headset with round headlamp, handlebar
    this.fork = new THREE.Group();
    this.fork.position.set(0, 0.5, 0.5);
    g.add(this.fork);
    add(new THREE.CylinderGeometry(0.03, 0.035, 0.55, 10), paint, 0, 0.2, 0, this.fork);
    add(RB(0.5, 0.1, 0.14, 0.05, 4), paint, 0, 0.5, -0.06, this.fork);
    add(ellipsoid(0.11, 0.1, 0.1, 16, 12), paint, 0, 0.47, 0.05, this.fork);
    add(new THREE.TorusGeometry(0.075, 0.012, 8, 20), chrome, 0, 0.47, 0.145, this.fork);
    add(new THREE.CircleGeometry(0.07, 20), this.lamp, 0, 0.47, 0.15, this.fork);
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.11, 10).rotateZ(Math.PI / 2), rubber, sx * 0.29, 0.5, -0.06, this.fork);
      add(new THREE.CylinderGeometry(0.007, 0.007, 0.24, 6), chrome, sx * 0.2, 0.62, -0.06, this.fork);
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14).rotateX(Math.PI / 2), chrome, sx * 0.22, 0.74, -0.05, this.fork);
    }
    // front fork leg + wheel (steer) and the rear wheel
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), chrome, 0.07, -0.13, 0.1, this.fork);
    this.wheels = [];
    const fw = wheelMesh(0.2, 0.1, rubber, cream, { wall: '#f2efe6' });
    fw.position.set(0, 0.2 - 0.5, 0.12);
    this.fork.add(fw);
    const rw = wheelMesh(0.2, 0.1, rubber, cream, { wall: '#f2efe6' });
    rw.position.set(0, 0.2, -0.55);
    g.add(rw);
    this.wheels.push(fw, rw);
    add(new THREE.CylinderGeometry(0.035, 0.03, 0.3, 10).rotateX(Math.PI / 2), chrome, 0.12, 0.2, -0.72);
    this.stand = add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), chrome, 0.12, 0.12, -0.1);
    this.stand.rotation.z = 0.6;
    // chrome crash guards round the cowls, a rear number plate
    for (const sx of [-1, 1]) {
      const guard = add(new THREE.TorusGeometry(0.2, 0.012, 6, 16, Math.PI * 0.9), chrome, sx * 0.29, 0.38, -0.45);
      guard.rotation.set(0, Math.PI / 2, Math.PI * 0.05);
    }
    const plate = add(new THREE.PlaneGeometry(0.2, 0.08), new THREE.MeshStandardMaterial({ map: plateTexture('MH 12 S 88'), roughness: 0.5 }), 0, 0.42, -0.89);
    plate.rotation.y = Math.PI;
    add(RB(0.2, 0.12, 0.06, 0.03), paint, 0, 0.62, 0.36); // glovebox under the handlebar
    this.exhaust = V(0.12, 0.2, -0.88);
  }
  foot(side, out) { return out.set(side * 0.1, 0.32, 0.16); }
  update(dt, speed, steer, riding, night = 0) {
    for (const w of this.wheels) w.rotation.x += (speed * dt) / 0.2;
    this.fork.rotation.y = riding ? steer : 0.4;
    this.stand.visible = !riding;
    this.lamp.emissiveIntensity = riding ? 0.6 + night * 3 : 0.1;
  }
}


// ---------------- small car ----------------
// A cheap little hatchback: rounded body, glasshouse with thin pillars (so you can see the boy driving),
// chrome bumpers, round headlamps, hubcaps. Built right-hand drive: the driver sits at the root's origin.
export const CAR = { saddle: V(0, 0.5, -0.15), bar: V(0, 0.98, 0.45) };
export class SmallCar {
  constructor(color = '#c0392b') {
    this.kind = 'car';
    this.L = CAR;
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const black = std('#161616', { roughness: 0.55 }), chrome = std('#d4d8dc', { metalness: 0.95, roughness: 0.16 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#b8d0dc', roughness: 0.05, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const rubber = std('#1a1918', { roughness: 0.9 }), seat = std('#3a3430', { roughness: 0.6 }), dash = std('#2a2624', { roughness: 0.6 });
    this.lamp = std('#fff6dc', { emissive: '#ffe6aa', emissiveIntensity: 0.3 });
    const red = std('#c4201c', { emissive: '#5a0806', emissiveIntensity: 0.6 }), amber = std('#f08a12', { emissive: '#5a2a06', emissiveIntensity: 0.6 });
    this.root = new THREE.Group();
    const g = new THREE.Group();
    g.position.x = 0.33; // right-hand drive: the body is offset so the driver's seat is at the origin
    this.root.add(g);
    this.body = g;
    const add = (geo, m, x, y, z, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; };
    // body shell: lower tub, bonnet, tail
    add(RB(1.5, 0.46, 3.1, 0.2, 5), paint, 0, 0.56, 0);
    const bonnet = add(RB(1.44, 0.16, 0.95, 0.08, 4), paint, 0, 0.8, 1.02);
    bonnet.rotation.x = 0.07;
    add(RB(1.46, 0.2, 0.5, 0.1, 4), paint, 0, 0.82, -1.25);
    // glasshouse: thin pillars, a roof, glass all round
    add(RB(1.3, 0.07, 1.55, 0.04, 3), paint, 0, 1.38, -0.25);
    for (const sx of [-1, 1]) {
      const a = add(RB(0.06, 0.6, 0.06, 0.02), paint, sx * 0.64, 1.12, 0.62); a.rotation.x = -0.5;
      add(RB(0.06, 0.55, 0.08, 0.02), paint, sx * 0.66, 1.1, -0.15);
      const c = add(RB(0.06, 0.58, 0.08, 0.02), paint, sx * 0.64, 1.1, -1.0); c.rotation.x = 0.35;
      // side glass
      const side = add(new THREE.PlaneGeometry(1.45, 0.5), glass, sx * 0.665, 1.1, -0.2);
      side.rotation.y = sx * Math.PI / 2;
      // door seams and handles, mirrors
      add(new THREE.BoxGeometry(0.005, 0.42, 0.01), black, sx * 0.752, 0.6, -0.12);
      add(RB(0.03, 0.03, 0.12, 0.012), chrome, sx * 0.76, 0.75, -0.3);
      const m = add(RB(0.06, 0.08, 0.14, 0.03), paint, sx * 0.8, 0.98, 0.55); m.rotation.y = sx * 0.3;
    }
    const ws = add(new THREE.PlaneGeometry(1.24, 0.62), glass, 0, 1.12, 0.66); ws.rotation.x = -0.95;
    const rw = add(new THREE.PlaneGeometry(1.2, 0.55), glass, 0, 1.12, -1.08); rw.rotation.x = Math.PI - 0.6;
    // bumpers, grille, lamps, plates
    for (const z of [1.57, -1.57]) add(RB(1.52, 0.14, 0.16, 0.06), chrome, 0, 0.38, z);
    add(RB(0.7, 0.16, 0.04, 0.03), black, 0, 0.62, 1.56);
    for (const sx of [-1, 1]) {
      add(new THREE.TorusGeometry(0.095, 0.02, 8, 20), chrome, sx * 0.5, 0.66, 1.555);
      add(new THREE.CircleGeometry(0.09, 20), this.lamp, sx * 0.5, 0.66, 1.56);
      add(RB(0.1, 0.05, 0.03, 0.012), amber, sx * 0.62, 0.48, 1.56);
      add(RB(0.16, 0.12, 0.03, 0.02), red, sx * 0.55, 0.72, -1.56);
    }
    for (const [z, ry] of [[1.66, 0], [-1.66, Math.PI]]) {
      const p = add(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshStandardMaterial({ map: plateTexture('DL 3C A 0807'), roughness: 0.5 }), 0, 0.48, z);
      p.rotation.y = ry;
    }
    // interior: seats, dashboard, steering wheel (in front of the driver, who sits at x = -0.33 of the body)
    const dx = -0.33;
    add(RB(0.48, 0.12, 0.48, 0.05), seat, dx, 0.52, -0.15);
    add(RB(0.48, 0.55, 0.12, 0.05), seat, dx, 0.82, -0.42).rotation.x = -0.12;
    add(RB(0.48, 0.12, 0.48, 0.05), seat, -dx, 0.52, -0.15);
    add(RB(0.48, 0.55, 0.12, 0.05), seat, -dx, 0.82, -0.42).rotation.x = -0.12;
    add(RB(1.15, 0.4, 0.62, 0.06), seat, 0, 0.62, -0.85);
    add(RB(1.3, 0.16, 0.3, 0.06), dash, 0, 0.9, 0.68);
    const col = add(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), dash, dx, 0.88, 0.58); col.rotation.x = 1.0;
    const wheelG = new THREE.Group();
    wheelG.position.set(dx, 0.98, 0.47);
    wheelG.rotation.x = -0.45;
    g.add(wheelG);
    add(new THREE.TorusGeometry(0.17, 0.02, 8, 24), black, 0, 0, 0, wheelG);
    add(new THREE.BoxGeometry(0.3, 0.025, 0.02), black, 0, 0, 0, wheelG);
    this.steer = wheelG;
    // wheels with hubcaps; front pair steers
    this.wheels = [];
    this.front = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const w = wheelMesh(0.29, 0.18, rubber, chrome);
      const holder = new THREE.Group();
      holder.position.set(sx * 0.68, 0.29, sz * 1.02);
      holder.add(w);
      g.add(holder);
      add(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), black, sx * 0.68, 0.32, sz * 1.02).material = std('#121212', { side: THREE.DoubleSide });
      this.wheels.push(w);
      if (sz > 0) this.front.push(holder);
    }
    this.exhaust = V(0.33 + 0.45, 0.3, -1.66);
  }
  foot(side, out) { return out.set(side * 0.12, 0.32, 0.5); }
  update(dt, speed, steer, riding, night = 0) {
    for (const w of this.wheels) w.rotation.x += (speed * dt) / 0.29;
    const st = riding ? steer * 1.4 : 0.2;
    for (const f of this.front) f.rotation.y = st * 0.6;
    this.steer.rotation.z = -st * 2.2;
    this.lamp.emissiveIntensity = riding ? 0.6 + night * 3 : 0.1;
    this.body.position.y = riding && speed > 0.1 ? Math.sin(performance.now() * 0.03) * 0.003 : 0;
  }
}

// ---------------- rowing boat ----------------
function boatTexture(outside) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const y = i * 16;
    let col = outside ? (i < 2 ? '#b8322b' : i < 3 ? '#f2ead8' : i % 2 ? '#2f6f9a' : '#2a6390') : i % 2 ? '#7a5232' : '#6a4628';
    if (outside && i > 11) col = '#3a2a1e';
    g.fillStyle = col; g.fillRect(0, y, 64, 16);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 15, 64, 1);
    for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`; g.fillRect(Math.random() * 64, y + Math.random() * 14, 10 + Math.random() * 20, 1); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}
function eyeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 72;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f0e0'; g.beginPath(); g.ellipse(64, 36, 58, 30, 0, 0, 7); g.fill();
  g.lineWidth = 5; g.strokeStyle = '#111'; g.stroke();
  g.fillStyle = '#c4241c'; g.beginPath(); g.arc(64, 36, 20, 0, 7); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(64, 36, 11, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.lineWidth = 1.5;
  for (let i = 0; i < 64; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 64); g.stroke(); g.beginPath(); g.moveTo(i + 32, 0); g.lineTo(i, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); return t;
}
export class RowBoat {
  constructor() {
    this.kind = 'boat';
    const wood = std('#6a4428', { roughness: 0.8 }), dark = std('#3e2a1a', { roughness: 0.85 }), paint = std('#2f6f8a', { roughness: 0.7 });
    const inside = std('#5a3a22', { roughness: 0.9, side: THREE.DoubleSide });
    this.root = new THREE.Group();
    const g = new THREE.Group();
    g.position.y = -0.22;
    this.root.add(g);
    this.hull = g;
    // hull: half an ellipsoid, pointed at both ends, painted band at the rim
    const hullGeo = new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.72, 0.42, 2.3);
    const hp = hullGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const z = hp.getZ(i) / 2.3;
      hp.setX(i, hp.getX(i) * (1 - Math.pow(Math.abs(z), 3) * 0.6));
      hp.setY(i, hp.getY(i) + Math.pow(Math.abs(z), 2.5) * 0.18);
    }
    hullGeo.computeVertexNormals();
    // painted planking outside (blue and white strakes, a red band), bare wood inside
    const outer = new THREE.MeshStandardMaterial({ map: boatTexture(true), roughness: 0.6 });
    const inner = new THREE.MeshStandardMaterial({ map: boatTexture(false), roughness: 0.85, side: THREE.BackSide });
    for (const m of [outer, inner]) {
      const hull = new THREE.Mesh(hullGeo, m);
      hull.position.y = 0.34;
      hull.castShadow = true;
      hull.receiveShadow = true;
      g.add(hull);
    }
    // ribs, a painted eye on each side of the bow, a coil of rope and a fishing net heaped in the stern
    for (const z of [-1.5, -0.9, -0.3, 0.6, 1.2]) {
      const w = 0.72 * Math.sqrt(1 - (z / 2.3) ** 2) * (1 - Math.pow(Math.abs(z / 2.3), 3) * 0.6);
      const rib = new THREE.Mesh(new THREE.TorusGeometry(1, 0.018, 4, 14, Math.PI).scale(w * 0.97, 0.4, 1), dark);
      rib.rotation.z = Math.PI;
      rib.position.set(0, 0.34, z);
      g.add(rib);
    }
    const eyeMat = new THREE.MeshStandardMaterial({ map: eyeTexture(), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.15), eyeMat);
      e.position.set(sx * 0.4, 0.32, 1.72);
      e.rotation.y = sx * (Math.PI / 2 - 0.45);
      g.add(e);
    }
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 18).rotateX(Math.PI / 2), std('#b8a070', { roughness: 0.95 }));
    rope.position.set(0.15, 0.08, 1.0);
    g.add(rope);
    const net = new THREE.Mesh(ellipsoid(0.32, 0.1, 0.35, 12, 8), new THREE.MeshStandardMaterial({ map: netTexture(), color: '#d8d0b8', roughness: 1, transparent: true, alphaTest: 0.3 }));
    net.position.set(-0.05, 0.08, -1.3);
    g.add(net);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 5, 32).rotateX(Math.PI / 2).scale(0.71, 1, 2.28), paint);
    rim.position.y = 0.35;
    g.add(rim);
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    add(new THREE.BoxGeometry(1.25, 0.05, 0.28), wood, 0, 0.26, 0.05); // rowing thwart (seat)
    add(new THREE.BoxGeometry(0.9, 0.05, 0.25), wood, 0, 0.24, -1.2);
    add(new THREE.BoxGeometry(0.7, 0.05, 0.22), wood, 0, 0.24, 1.25);
    for (const z of [-0.6, 0.6]) add(new THREE.BoxGeometry(0.9, 0.03, 0.08), dark, 0, 0.05, z);
    // oars pivot in oarlocks on the gunwales
    this.oars = [-1, 1].map((sx) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.66, 0.4, 0.3);
      g.add(pivot);
      const oar = new THREE.Group();
      pivot.add(oar);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 2.3, 6).rotateZ(Math.PI / 2).translate(sx * 0.55, 0, 0), wood);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.16).translate(sx * 1.55, 0, 0), wood);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 6).rotateZ(Math.PI / 2).translate(-sx * 0.55, 0, 0), dark);
      for (const m of [shaft, blade, grip]) { m.castShadow = true; oar.add(m); }
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), dark, sx * 0.66, 0.38, 0.3);
      return { sx, pivot, oar };
    });
    this.phase = 0;
    this.saddle = V(0, 0.08, 0.05);
    this.dips = [];
  }
  // hands hold the oar grips; returns grip position in the boat root's space
  grip(i, out) {
    const o = this.oars[i];
    o.oar.updateMatrixWorld(true);
    out.set(-o.sx * 0.55, 0, 0);
    o.oar.localToWorld(out);
    return this.root.worldToLocal(out);
  }
  update(dt, speed, steer, riding) {
    // a stroke cycle: blades sweep back in the water, lift, swing forward in the air
    const pulling = riding && (speed > 0.15 || Math.abs(steer) > 0.05);
    this.phase += dt * (pulling ? 1.7 + speed * 0.9 : 0);
    const c = this.phase;
    this.dips.length = 0;
    for (const o of this.oars) {
      const turnBias = -o.sx * steer * 0.6;
      const sweep = pulling ? Math.sin(c) * 0.55 * (1 + turnBias) : 0.15;
      const lift = pulling ? (Math.cos(c) > 0 ? -0.12 : 0.18) : 0.35;
      o.oar.rotation.set(0, -o.sx * sweep, o.sx * (lift));
      if (pulling && Math.cos(c) > 0.95) this.dips.push(o.sx);
    }
    const t = performance.now() * 0.001;
    this.hull.rotation.z = Math.sin(t * 0.9) * 0.025 + (riding ? -steer * 0.06 : 0);
    this.hull.rotation.x = Math.sin(t * 1.1) * 0.015;
    this.hull.position.y = -0.22 + Math.sin(t * 1.3) * 0.02;
  }
}

// Pose the boy seated on the boat's thwart, hands on the two oar grips.
const _a = new THREE.Vector3();
export function poseRower(rig, boat) {
  const k = rig.k;
  rig.body.rotation.x = 0;
  rig.body.position.set(0, boat.saddle.y + 0.06 - rig.hipY, 0);
  rig.legs.forEach((l, i) => {
    l.hip.rotation.set(-1.45, 0, (i ? 1 : -1) * 0.12);
    l.knee.rotation.x = 1.0;
  });
  const lean = 0.15 + Math.cos(boat.phase) * 0.18;
  rig.torso.rotation.set(lean, 0, 0);
  const A1 = 0.3 * k, A2 = 0.32 * k;
  const shY = rig.body.position.y + rig.hipY + Math.cos(lean) * 0.505 * k;
  const shZ = rig.body.position.z + Math.sin(lean) * 0.505 * k;
  rig.arms.forEach((a, i) => {
    boat.grip(i, _a);
    const s = ik2(_a.y - shY, _a.z - shZ, A1, A2);
    a.shoulder.rotation.x = -(s.phi - s.a) - lean;
    const side = i === 0 ? -1 : 1;
    a.shoulder.rotation.z = side * Math.max(0.05, Math.min(0.9, Math.atan2(Math.abs(_a.x) - 0.13, 0.3)));
    a.elbow.rotation.x = -s.bend;
  });
}

// ---------------- village bus & jeep (driven by villagers along the roads) ----------------
function boardTexture(hi, en, bg = '#1a1a1a', fg = '#ffd84a') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 64);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 30px "Tiro Devanagari Hindi", "Kohinoor Devanagari", sans-serif';
  g.fillText(hi, 150, 34);
  g.font = 'bold 26px "Courier New", monospace';
  g.fillText(en, 380, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// a proper road wheel: rounded tyre with tread blocks, a dished steel rim, hub cap and wheel nuts
function roadWheel(r, w, { rim = '#c9cdd1', tyre = '#1c1b1a', wall = null } = {}) {
  return wheelMesh(r, w, wmat(tyre, { roughness: 0.92 }), wmat(rim, { metalness: 0.75, roughness: 0.3 }), { wall });
}
function liveryTexture({ base, band, stripe, hi, en }) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = band; g.fillRect(0, 10, 1024, 22);
  g.fillStyle = stripe; g.fillRect(0, 96, 1024, 10); g.fillRect(0, 112, 1024, 4);
  g.fillStyle = band; g.textBaseline = 'middle';
  g.font = 'bold 44px "Tiro Devanagari Hindi", "Kohinoor Devanagari", sans-serif'; g.fillText(hi, 250, 66);
  g.font = 'bold 34px Georgia, serif'; g.fillText(en, 560, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
export class VillageBus {
  constructor({ color = '#b8322b', band = '#f2e6c8', stripe = '#1a1a1a', dest = ['गाँव – मारुधर', 'GAON-MARUDHAR'], name = ['ग्राम सेवा', 'GRAM SEVA'] } = {}) {
    this.kind = 'bus';
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const bandM = new THREE.MeshPhysicalMaterial({ color: band, roughness: 0.35, clearcoat: 0.5 });
    const black = std('#141414', { roughness: 0.55 }), chrome = std('#d4d8dc', { metalness: 0.92, roughness: 0.16 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#25343c', roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    const seatM = std('#3a4a6a', { roughness: 0.7 }), floorM = std('#3a3632'), interior = std('#d8d0c0', { side: THREE.BackSide });
    this.root = new THREE.Group();
    const g = new THREE.Group();
    this.root.add(g);
    this.body = g;
    const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
    const L = 9, W = 2.45, base = 0.8;
    // chassis, skirts and the lower body with its painted livery
    add(RB(W - 0.2, 0.25, L - 0.6, 0.05), black, 0, base - 0.05, 0);
    add(RB(W, 1.05, L, 0.14, 4), paint, 0, base + 0.55, 0);
    const liv = new THREE.MeshStandardMaterial({ map: liveryTexture({ base: color, band, stripe, hi: name[0], en: name[1] }), roughness: 0.35 });
    for (const sx of [-1, 1]) { const pl = add(new THREE.PlaneGeometry(L - 1.4, 0.95), liv, sx * (W / 2 + 0.003), base + 0.55, 0); pl.rotation.y = sx * Math.PI / 2; }
    add(RB(W + 0.02, 0.16, L + 0.02, 0.05), bandM, 0, base + 1.12, 0);
    // window band: pillars between big glass panes; seats and passengers' heads show through
    const winY = base + 1.62;
    add(RB(W - 0.08, 0.95, L - 0.2, 0.06), interior, 0, winY, 0);
    for (const sx of [-1, 1]) {
      const pane = add(new THREE.PlaneGeometry(L - 1.0, 0.82), glass, sx * (W / 2 - 0.02), winY, -0.1); pane.rotation.y = sx * Math.PI / 2;
      for (let i = 0; i <= 9; i++) add(RB(0.07, 0.9, 0.12, 0.02), paint, sx * (W / 2 - 0.01), winY, -L / 2 + 0.55 + i * ((L - 1.1) / 9));
      add(new THREE.BoxGeometry(0.03, 0.03, L - 1.0), chrome, sx * (W / 2), winY - 0.05, -0.1);
    }
    for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) {
      add(RB(0.85, 0.45, 0.12, 0.04), seatM, sx * 0.55, base + 1.05, -3.2 + i * 0.85);
      add(RB(0.85, 0.1, 0.42, 0.04), seatM, sx * 0.55, base + 0.82, -3.0 + i * 0.85);
    }
    add(new THREE.BoxGeometry(W - 0.2, 0.04, L - 0.4), floorM, 0, base + 0.62, 0);
    // roof: rounded, with a hatch, rails and luggage
    add(RB(W, 0.36, L, 0.18, 4), bandM, 0, winY + 0.62, 0);
    add(RB(0.8, 0.08, 0.8, 0.04), chrome, 0, winY + 0.83, -1.2);
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.025, 0.025, 5.4, 6).rotateX(Math.PI / 2), chrome, sx * 1.0, winY + 1.0, -0.8);
      for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6), chrome, sx * 1.0, winY + 0.9, -3.4 + i * 1.05);
    }
    const bag = [std('#3a5a8a'), std('#8a3a2a'), std('#d8c8a0'), std('#2e6b4a'), std('#6a4a2a')];
    for (let i = 0; i < 7; i++) add(RB(0.6 + (i % 3) * 0.2, 0.34 + (i % 2) * 0.1, 0.55, 0.08), bag[i % 5], (i % 2 ? -0.4 : 0.42), winY + 1.0, -3.2 + i * 0.75);
    add(RB(1.0, 0.2, 0.9, 0.08), std('#c9a95e', { roughness: 1 }), 0, winY + 1.0, 1.3); // a sack of grain
    // the front: slightly raked two-pane windscreen, wipers, lit destination board, grille, lamps, bumper
    const fz = L / 2;
    for (const sx of [-1, 1]) { const ws = add(new THREE.PlaneGeometry(1.08, 1.0), glass, sx * 0.56, winY - 0.05, fz + 0.02); ws.rotation.x = -0.08; }
    add(RB(0.06, 1.05, 0.06, 0.02), black, 0, winY - 0.05, fz + 0.03);
    for (const sx of [-1, 1]) { const wp = add(new THREE.BoxGeometry(0.02, 0.7, 0.02), black, sx * 0.5, winY - 0.25, fz + 0.06); wp.rotation.z = sx * 0.6; }
    const board = add(new THREE.PlaneGeometry(2.0, 0.26), new THREE.MeshStandardMaterial({ map: boardTexture(...dest), emissive: '#ffffff', emissiveMap: boardTexture(...dest), emissiveIntensity: 0.5 }), 0, winY + 0.56, fz + 0.03);
    void board;
    add(RB(1.3, 0.35, 0.06, 0.04), chrome, 0, base + 0.55, fz + 0.03);
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(1.2, 0.03, 0.02), black, 0, base + 0.42 + i * 0.065, fz + 0.065);
    this.lamps = std('#fff6dc', { emissive: '#ffe6aa', emissiveIntensity: 0.6 });
    for (const sx of [-1, 1]) {
      add(new THREE.TorusGeometry(0.15, 0.03, 8, 18), chrome, sx * 0.88, base + 0.55, fz + 0.04);
      add(new THREE.CircleGeometry(0.14, 18), this.lamps, sx * 0.88, base + 0.55, fz + 0.045);
      add(RB(0.12, 0.08, 0.04, 0.015), std('#f08a12', { emissive: '#5a2a06', emissiveIntensity: 0.6 }), sx * 1.1, base + 0.85, fz + 0.03);
      // mirrors on long arms
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6).rotateZ(Math.PI / 2), black, sx * (W / 2 + 0.25), winY + 0.3, fz - 0.15);
      add(RB(0.08, 0.38, 0.22, 0.04), black, sx * (W / 2 + 0.5), winY + 0.15, fz - 0.1);
      // rear lamps
      add(RB(0.16, 0.3, 0.04, 0.02), std('#c4201c', { emissive: '#5a0806', emissiveIntensity: 0.7 }), sx * 1.0, base + 0.6, -fz - 0.02);
    }
    add(RB(W + 0.06, 0.24, 0.24, 0.08), black, 0, base - 0.02, fz + 0.06);
    add(RB(W + 0.06, 0.24, 0.24, 0.08), black, 0, base - 0.02, -fz - 0.06);
    const rearGlass = add(new THREE.PlaneGeometry(2.0, 0.7), glass, 0, winY + 0.05, -fz - 0.02); rearGlass.rotation.y = Math.PI;
    for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(0.4, 0.03, 0.04), chrome, -0.8, base + 0.4 + i * 0.3, -fz - 0.05); // ladder to the roof
    // the door (left side, front) with glass, and steps
    add(new THREE.PlaneGeometry(0.85, 1.75), glass, W / 2 + 0.004, base + 1.05, fz - 1.2).rotation.y = Math.PI / 2;
    add(RB(0.04, 1.8, 0.05, 0.015), chrome, W / 2 + 0.01, base + 1.05, fz - 1.2);
    for (let i = 0; i < 2; i++) add(RB(0.3, 0.05, 0.8, 0.02), chrome, W / 2 - 0.1, base - 0.15 + i * 0.25, fz - 1.2);
    // wheels in black-lined arches
    this.wheels = [];
    for (const [sx, sz] of [[-1, 2.9], [1, 2.9], [-1, -2.6], [1, -2.6]]) {
      const w = roadWheel(0.52, 0.32);
      w.position.set(sx * 1.02, 0.52, sz);
      g.add(w);
      this.wheels.push(w);
      add(new THREE.CylinderGeometry(0.62, 0.62, 0.36, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), std('#0e0e0e', { side: THREE.DoubleSide }), sx * 1.02, 0.56, sz);
    }
    this.seats = [];
    for (let i = 0; i < 7; i++) this.seats.push(V((i % 2 ? 1 : -1) * 0.55, base + 0.86, -2.9 + i * 0.85));
    this.driverSeat = V(-0.6, base + 0.86, fz - 0.9);
    this.len = L; this.half = W / 2; this.wheelR = 0.52;
  }
  update(dt, speed) { for (const w of this.wheels) w.rotation.x += (speed * dt) / this.wheelR; }
}
export class Jeep {
  constructor({ color = '#4a5a3a' } = {}) {
    this.kind = 'jeep';
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, metalness: 0.15, clearcoat: 0.3 });
    const black = std('#141414', { roughness: 0.6 }), chrome = std('#d4d8dc', { metalness: 0.92, roughness: 0.16 });
    const canvasM = std('#4a4636', { roughness: 0.95, side: THREE.DoubleSide }), seat = std('#2a2420', { roughness: 0.6 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#b8d0dc', roughness: 0.05, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    this.root = new THREE.Group();
    const g = new THREE.Group();
    this.root.add(g);
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    // the tub with rolled edges and a door cut-out each side
    add(RB(1.6, 0.65, 2.6, 0.12, 4), paint, 0, 0.95, -0.55);
    add(RB(1.62, 0.06, 2.62, 0.03), black, 0, 1.28, -0.55);
    // bonnet, the slotted grille between round lamps, flared front wings
    add(RB(1.24, 0.42, 1.35, 0.1, 4), paint, 0, 1.08, 1.35);
    add(RB(1.0, 0.5, 0.06, 0.03), paint, 0, 1.02, 2.02);
    for (let i = -3; i <= 3; i++) add(RB(0.06, 0.36, 0.03, 0.015), black, i * 0.12, 1.04, 2.05);
    for (const sx of [-1, 1]) {
      add(RB(0.4, 0.12, 1.35, 0.06), paint, sx * 0.78, 1.04, 1.35);
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.38, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), black, sx * 0.79, 0.52, 1.3).material = std('#101010', { side: THREE.DoubleSide });
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.38, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), black, sx * 0.79, 0.52, -1.15).material = std('#101010', { side: THREE.DoubleSide });
      add(new THREE.TorusGeometry(0.12, 0.025, 8, 18), chrome, sx * 0.42, 1.1, 2.06);
      add(new THREE.CircleGeometry(0.11, 18), std('#fff6dc', { emissive: '#ffe6aa', emissiveIntensity: 0.5 }), sx * 0.42, 1.1, 2.065);
      add(RB(0.5, 0.05, 0.9, 0.02), black, sx * 0.86, 0.6, 0.1); // side step
      add(RB(0.12, 0.08, 0.03, 0.01), std('#c4201c', { emissive: '#5a0806', emissiveIntensity: 0.6 }), sx * 0.65, 1.0, -1.87);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), chrome, sx * 0.72, 1.55, 0.62);
      add(RB(0.04, 0.12, 0.16, 0.02), black, sx * 0.76, 1.72, 0.62);
    }
    // folding windscreen, steering wheel, seats, bull bar, spare wheel, canvas hood on a frame
    add(new THREE.BoxGeometry(1.36, 0.46, 0.02), glass, 0, 1.55, 0.62);
    add(RB(1.42, 0.52, 0.06, 0.02), black, 0, 1.55, 0.62).scale.set(1, 1, 0.3);
    const sw = add(new THREE.TorusGeometry(0.17, 0.02, 8, 22), black, -0.38, 1.35, 0.42); sw.rotation.x = -0.9;
    for (const sx of [-1, 1]) { add(RB(0.48, 0.12, 0.45, 0.05), seat, sx * 0.38, 1.0, -0.02); add(RB(0.48, 0.45, 0.1, 0.05), seat, sx * 0.38, 1.25, -0.26); }
    for (const sx of [-1, 1]) add(RB(0.34, 0.12, 1.1, 0.04), seat, sx * 0.55, 1.0, -1.15);
    add(RB(1.4, 0.1, 0.1, 0.04), chrome, 0, 0.75, 2.2);
    for (const sx of [-1, 1]) add(RB(0.08, 0.45, 0.08, 0.03), chrome, sx * 0.55, 0.95, 2.17);
    const spare = roadWheel(0.36, 0.24); spare.position.set(0, 1.05, -1.98); spare.rotation.y = Math.PI / 2; g.add(spare);
    for (const [x, z] of [[-0.78, 0.55], [0.78, 0.55], [-0.78, -1.82], [0.78, -1.82]]) add(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), black, x, 1.75, z);
    add(RB(1.62, 0.06, 2.45, 0.03), canvasM, 0, 2.25, -0.63);
    for (const sx of [-1, 1]) add(new THREE.PlaneGeometry(1.7, 0.55), canvasM, sx * 0.8, 1.95, -1.0).rotation.y = Math.PI / 2;
    add(new THREE.PlaneGeometry(1.6, 0.6), canvasM, 0, 1.95, -1.85);
    const plate = add(new THREE.PlaneGeometry(0.42, 0.11), new THREE.MeshStandardMaterial({ map: plateTexture('UK 07 J 1947'), roughness: 0.5 }), 0, 0.8, 2.24);
    void plate;
    this.wheels = [];
    for (const [sx, sz] of [[-1, 1.3], [1, 1.3], [-1, -1.15], [1, -1.15]]) {
      const w = roadWheel(0.38, 0.27);
      w.position.set(sx * 0.79, 0.38, sz);
      g.add(w);
      this.wheels.push(w);
    }
    this.seats = [V(0.38, 1.06, 0.0), V(-0.55, 1.06, -1.0), V(0.55, 1.06, -1.3)];
    this.driverSeat = V(-0.38, 1.06, 0.0);
    this.len = 4.3; this.half = 0.9; this.wheelR = 0.38;
  }
  update(dt, speed) { for (const w of this.wheels) w.rotation.x += (speed * dt) / this.wheelR; }
}

// ---------------- a bus or jeep taken over from the road ----------------
// The traffic vehicle (and anyone still riding in it) is moved inside a new root whose origin is the driver's
// seat, which is where the boy sits on every vehicle he drives.
export class TakenVehicle {
  constructor(veh, riders = []) {
    this.veh = veh; this.kind = veh.kind; this.riders = riders;
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    const d = veh.driverSeat;
    this.inner.position.set(-d.x, 0, -d.z);
    veh.root.position.set(0, 0, 0); veh.root.rotation.set(0, 0, 0);
    this.inner.add(veh.root);
    for (const q of riders) this.inner.add(q.root);
    this.L = { saddle: V(0, d.y, 0), bar: V(0, d.y + 0.34, 0.44) };
    this.exhaust = V(-d.x + veh.half * 0.6, 0.35, -d.z - veh.len / 2 - 0.05);
    this.brake = false;
  }
  foot(side, out) { return out.set(side * 0.16, this.L.saddle.y - 0.5, 0.5); }
  update(dt, speed) {
    this.veh.update(dt, speed);
    if (this.root.visible) for (const q of this.riders) q.update(dt, 0, 'sit');
  }
}

// ---------------- the little village minibus the boy can drive ----------------
// Right-hand drive like every Indian bus: the boy sits front-right at the root's origin (the body is offset),
// the passenger door is front-left, ten seats inside. A door that folds open at stops, steering front wheels,
// brake and reversing lamps.
export const MINI = { saddle: V(0, 1.33, 2.02), bar: V(0, 1.76, 2.48) };
export class MiniBus {
  constructor({ color = '#1f8a5a', band = '#f2c21a' } = {}) {
    this.kind = 'minibus';
    this.L = MINI;
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const cream = new THREE.MeshPhysicalMaterial({ color: '#f2ead6', roughness: 0.35, clearcoat: 0.6 });
    const bandM = new THREE.MeshPhysicalMaterial({ color: band, roughness: 0.35, clearcoat: 0.6 });
    const black = std('#141414', { roughness: 0.55 }), chrome = std('#d4d8dc', { metalness: 0.92, roughness: 0.16 });
    // clear glass that doesn't throw a shadow, so the sun gets in and you can see who's aboard
    const glass = new THREE.MeshPhysicalMaterial({ color: '#d8ecf2', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 });
    const seatM = std('#8a2424', { roughness: 0.45 }), seatEdge = std('#5a1616', { roughness: 0.5 });
    const floorM = std('#3e4a44', { roughness: 0.9 }), wallIn = std('#e6dcc4', { roughness: 0.7 }), wood = std('#8a5a32', { roughness: 0.55 });
    this.root = new THREE.Group();
    const g = new THREE.Group();
    g.position.x = 0.55;
    this.root.add(g);
    this.body = g;
    const add = (geo, m, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = m !== glass; o.receiveShadow = true; parent.add(o); return o; };
    const L = 6.6, W = 2.2, base = 0.62, fz = L / 2;
    const floorY = base + 0.3, sill = base + 0.96, doorZ0 = fz - 0.92, doorZ1 = fz - 0.04;
    this.floorY = floorY;
    // chassis and the floor pan (the green skirt doubles as the floor)
    add(RB(W - 0.25, 0.22, L - 0.8, 0.05), black, 0, base - 0.08, 0);
    add(RB(W + 0.02, 0.32, L + 0.02, 0.1, 3), paint, 0, base + 0.14, 0);
    // a hollow body: side walls (with the doorway left open), front and back, cream outside and in
    const wallH = sill - floorY + 0.02, wallY = (sill + floorY) / 2;
    add(RB(0.07, wallH, L, 0.03), cream, -(W / 2 - 0.035), wallY, 0);
    add(RB(0.07, wallH, doorZ0 + fz, 0.03), cream, W / 2 - 0.035, wallY, (doorZ0 - fz) / 2);
    add(RB(0.07, wallH, fz - doorZ1, 0.03), cream, W / 2 - 0.035, wallY, (doorZ1 + fz) / 2);
    add(RB(W, wallH, 0.08, 0.03), cream, 0, wallY, fz - 0.04);
    add(RB(W, wallH, 0.08, 0.03), cream, 0, wallY, -fz + 0.04);
    // inside: a panelled lining, a ribbed rubber floor mat, a wooden rail under the windows
    for (const sx of [-1, 1]) {
      const segs = sx > 0 ? [[-fz + 0.1, doorZ0 - 0.02]] : [[-fz + 0.1, fz - 0.1]];
      for (const [z0, z1] of segs) {
        add(new THREE.BoxGeometry(0.01, wallH - 0.1, z1 - z0), wallIn, sx * (W / 2 - 0.075), wallY + 0.02, (z0 + z1) / 2);
        add(RB(0.05, 0.05, z1 - z0, 0.02), wood, sx * (W / 2 - 0.09), sill - 0.02, (z0 + z1) / 2);
      }
    }
    add(new THREE.BoxGeometry(W - 0.16, 0.012, L - 0.2), floorM, 0, floorY + 0.006, 0);
    for (let i = 0; i < 26; i++) add(new THREE.BoxGeometry(0.42, 0.008, 0.03), std('#2a322e'), 0, floorY + 0.014, -fz + 0.4 + i * 0.22);
    // the yellow belt and the livery boards, outside only
    for (const sx of [-1, 1]) {
      if (sx < 0) add(RB(0.03, 0.12, L + 0.02, 0.012), bandM, -(W / 2 + 0.003), base + 0.86, 0);
      else {
        add(RB(0.03, 0.12, doorZ0 + fz, 0.012), bandM, W / 2 + 0.003, base + 0.86, (doorZ0 - fz) / 2);
        add(RB(0.03, 0.12, fz - doorZ1, 0.012), bandM, W / 2 + 0.003, base + 0.86, (doorZ1 + fz) / 2);
      }
    }
    for (const sz of [-1, 1]) add(RB(W + 0.02, 0.12, 0.03, 0.012), bandM, 0, base + 0.86, sz * (fz + 0.003));
    const liv = new THREE.MeshStandardMaterial({ map: liveryTexture({ base: '#f2ead6', band: color, stripe: band, hi: 'गाँव मिनी बस', en: 'GAON MINI BUS' }), roughness: 0.35 });
    for (const sx of [-1, 1]) { const pl = add(new THREE.PlaneGeometry(L - 2.6, 0.5), liv, sx * (W / 2 + 0.006), base + 0.52, -0.6); pl.rotation.y = sx * Math.PI / 2; pl.castShadow = false; }
    // the glasshouse: slim pillars and big clear side windows
    const winY = base + 1.42;
    for (const sx of [-1, 1]) {
      const pane = add(new THREE.PlaneGeometry(L - 0.6, 0.86), glass, sx * (W / 2 - 0.02), winY, -0.05); pane.rotation.y = sx * Math.PI / 2;
      for (let i = 0; i <= 6; i++) {
        const z = -L / 2 + 0.35 + i * ((L - 0.9) / 6);
        if (sx > 0 && z > doorZ0 - 0.05 && z < doorZ1 + 0.05) continue;
        add(RB(0.07, 0.9, 0.08, 0.02), paint, sx * (W / 2 - 0.02), winY, z);
      }
      add(new THREE.BoxGeometry(0.03, 0.03, L - 0.6), chrome, sx * (W / 2 + 0.005), winY - 0.4, -0.05);
      // curtains bunched at the window pillars
      for (let i = 1; i < 6; i += 2) { const z = -L / 2 + 0.35 + i * ((L - 0.9) / 6); if (sx > 0 && z > doorZ0 - 0.3) continue; add(RB(0.05, 0.62, 0.16, 0.025), std(i % 4 === 1 ? '#c8642a' : '#2a6a8a', { roughness: 1 }), sx * (W / 2 - 0.08), winY + 0.05, z + 0.12); }
    }
    // seats: five rows of two facing forward, high-backed rexine benches with a chrome grab bar
    this.seats = [];
    const seatTop = floorY + 0.45;
    const bench = (x, z) => {
      add(RB(0.8, 0.12, 0.44, 0.05), seatM, x, seatTop - 0.06, z);
      add(RB(0.8, 0.6, 0.09, 0.04), seatM, x, seatTop + 0.3, z - 0.23).rotation.x = -0.1;
      add(RB(0.82, 0.05, 0.11, 0.02), seatEdge, x, seatTop + 0.6, z - 0.26);
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.6, 6).rotateZ(Math.PI / 2), chrome, x, seatTop + 0.66, z - 0.22);
      for (const lx of [-0.32, 0.32]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 6), chrome, x + lx, floorY + 0.2, z + 0.05);
    };
    for (let r = 0; r < 5; r++) for (const sx of [-1, 1]) {
      const z = 1.05 - r * 0.88, x = sx * 0.6;
      if (sx > 0 && r === 0) continue; // the gangway by the door
      bench(x, z);
      this.seats.push(V(x + 0.55, seatTop, z + 0.04));
    }
    bench(0.6, -3.0 + 0.32); this.seats.push(V(0.55 + 0.6, seatTop, -2.64));
    // a pole by the door and one mid-way, a grab rail along the ceiling with hand straps, tube lights
    for (const [x, z] of [[0.3, doorZ0 + 0.05], [0.28, -0.75]]) add(new THREE.CylinderGeometry(0.02, 0.02, winY + 0.42 - floorY, 8), chrome, x, (winY + 0.42 + floorY) / 2, z);
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.016, 0.016, L - 1.2, 6).rotateX(Math.PI / 2), chrome, sx * 0.32, winY + 0.36, -0.3);
      for (let i = 0; i < 6; i++) add(new THREE.TorusGeometry(0.05, 0.01, 5, 12), std('#2a2a2a'), sx * 0.32, winY + 0.26, -2.6 + i * 0.9).rotation.y = Math.PI / 2;
    }
    this.cabinLight = std('#fffbe8', { emissive: '#fff2cc', emissiveIntensity: 0.2 });
    for (const z of [-2, 0, 2]) add(RB(0.12, 0.03, 1.2, 0.01), this.cabinLight, 0, winY + 0.43, z);
    // the driver's corner: a sprung seat, the dashboard with dials, a big wheel, a little shrine and a garland
    add(RB(0.55, 0.12, 0.5, 0.05), seatM, -0.55, seatTop - 0.07, 2.02);
    add(RB(0.55, 0.62, 0.1, 0.04), seatM, -0.55, seatTop + 0.3, 1.76).rotation.x = -0.14;
    add(new THREE.CylinderGeometry(0.06, 0.09, seatTop - 0.13 - floorY, 8), black, -0.55, (seatTop - 0.13 + floorY) / 2, 2.02);
    add(RB(0.08, 0.5, 0.4, 0.02), wood, -0.12, floorY + 0.25, 2.05); // the engine hump beside the driver
    add(RB(W - 0.12, 0.34, 0.5, 0.06), std('#2a2624', { roughness: 0.7 }), 0, sill - 0.14, fz - 0.3);
    add(RB(W - 0.14, 0.04, 0.36, 0.02), std('#3a332e'), 0, sill + 0.04, fz - 0.28);
    this.dial = std('#f4efe0', { emissive: '#ffe9b0', emissiveIntensity: 0.15 });
    for (const dx of [-0.72, -0.42]) {
      const d = add(new THREE.CircleGeometry(0.075, 20), this.dial, dx, sill - 0.08, fz - 0.56); d.rotation.y = Math.PI;
      const rim = add(new THREE.TorusGeometry(0.08, 0.012, 6, 20), chrome, dx, sill - 0.08, fz - 0.56);
      const needle = add(new THREE.BoxGeometry(0.006, 0.06, 0.004), std('#c4201c'), dx, sill - 0.06, fz - 0.565); needle.rotation.z = 0.6; void rim;
    }
    add(RB(0.12, 0.14, 0.08, 0.02), std('#c8a04a', { metalness: 0.7, roughness: 0.3 }), 0.2, sill + 0.12, fz - 0.26); // a little brass shrine
    add(new THREE.SphereGeometry(0.03, 8, 6), std('#e07a1e', { emissive: '#5a2a06' }), 0.2, sill + 0.21, fz - 0.26);
    const gar = new THREE.TorusGeometry(0.16, 0.022, 6, 18, Math.PI);
    add(gar, std('#f2a41a', { roughness: 0.9 }), 0.2, winY + 0.2, fz - 0.12).rotation.z = Math.PI;
    const col = add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), black, -0.55, MINI.bar.y - 0.2, MINI.bar.z + 0.25); col.rotation.x = 0.9;
    const sw = new THREE.Group(); sw.position.set(-0.55, MINI.bar.y, MINI.bar.z); sw.rotation.x = -0.75; g.add(sw);
    add(new THREE.TorusGeometry(0.24, 0.024, 8, 28), black, 0, 0, 0, sw);
    add(new THREE.BoxGeometry(0.46, 0.03, 0.025), black, 0, 0, 0, sw);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateX(Math.PI / 2), chrome, 0, 0, 0, sw);
    this.wheelSteer = sw;
    // a waist-high rail behind the driver
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.7, 6).rotateZ(Math.PI / 2), chrome, -0.5, floorY + 0.9, 1.58);
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.9, 6), chrome, -0.15, floorY + 0.45, 1.58);
    // roof: rounded with a roof rack and a couple of bundles
    add(RB(W, 0.28, L, 0.14, 4), paint, 0, winY + 0.58, 0);
    add(new THREE.BoxGeometry(W - 0.12, 0.01, L - 0.12), wallIn, 0, winY + 0.44, 0);
    for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.02, 0.02, 3.4, 6).rotateX(Math.PI / 2), chrome, sx * 0.85, winY + 0.84, -0.9);
    add(RB(0.8, 0.3, 0.6, 0.08), std('#3a5a8a'), 0.3, winY + 0.87, -1.4);
    add(RB(0.6, 0.26, 0.5, 0.08), std('#c9a95e', { roughness: 1 }), -0.35, winY + 0.85, -0.4);
    // the front: a big raked windscreen, wipers, destination board, grille, lamps and bumper
    const ws = add(new THREE.PlaneGeometry(W - 0.12, 0.92), glass, 0, winY + 0.02, fz - 0.01); ws.rotation.x = -0.1;
    for (const sx of [-1, 1]) add(RB(0.09, 0.95, 0.09, 0.03), paint, sx * (W / 2 - 0.04), winY, fz - 0.04);
    for (const sx of [-1, 1]) { const wp = add(new THREE.BoxGeometry(0.02, 0.62, 0.02), black, sx * 0.45, winY - 0.22, fz + 0.1); wp.rotation.z = sx * 0.7; }
    const dest = boardTexture('सब गाँव', 'ALL VILLAGES');
    add(new THREE.PlaneGeometry(1.7, 0.22), new THREE.MeshStandardMaterial({ map: dest, emissive: '#ffffff', emissiveMap: dest, emissiveIntensity: 0.5 }), 0, winY + 0.56, fz + 0.075);
    add(RB(1.1, 0.32, 0.06, 0.04), chrome, 0, base + 0.42, fz + 0.03);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(1.0, 0.03, 0.02), black, 0, base + 0.32 + i * 0.065, fz + 0.065);
    this.lamp = std('#fff6dc', { emissive: '#ffe6aa', emissiveIntensity: 0.3 });
    this.brakeM = std('#c4201c', { emissive: '#ff2a1a', emissiveIntensity: 0.3 });
    this.revM = std('#f4f2ec', { emissive: '#ffffff', emissiveIntensity: 0 });
    for (const sx of [-1, 1]) {
      add(new THREE.TorusGeometry(0.13, 0.025, 8, 18), chrome, sx * 0.78, base + 0.45, fz + 0.04);
      add(new THREE.CircleGeometry(0.12, 18), this.lamp, sx * 0.78, base + 0.45, fz + 0.045);
      add(RB(0.12, 0.07, 0.04, 0.015), std('#f08a12', { emissive: '#5a2a06', emissiveIntensity: 0.6 }), sx * 0.98, base + 0.72, fz + 0.03);
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.45, 6).rotateZ(Math.PI / 2), black, sx * (W / 2 + 0.2), winY + 0.18, fz - 0.15);
      add(RB(0.07, 0.3, 0.18, 0.03), black, sx * (W / 2 + 0.4), winY + 0.05, fz - 0.1);
      add(RB(0.14, 0.24, 0.04, 0.02), this.brakeM, sx * 0.9, base + 0.55, -fz - 0.02);
      add(RB(0.12, 0.1, 0.04, 0.02), this.revM, sx * 0.9, base + 0.3, -fz - 0.02);
    }
    add(RB(W + 0.06, 0.2, 0.22, 0.08), black, 0, base - 0.02, fz + 0.06);
    add(RB(W + 0.06, 0.2, 0.22, 0.08), black, 0, base - 0.05, -fz - 0.06);
    const rg = add(new THREE.PlaneGeometry(W - 0.4, 0.6), glass, 0, winY + 0.05, -fz - 0.02); rg.rotation.y = Math.PI;
    const plate = add(new THREE.PlaneGeometry(0.42, 0.11), new THREE.MeshStandardMaterial({ map: plateTexture('UP 65 B 2024'), roughness: 0.5 }), 0, base + 0.15, -fz - 0.18); plate.rotation.y = Math.PI;
    // the folding door: front-left, it swings open at stops
    this.door = new THREE.Group();
    this.door.position.set(W / 2 + 0.01, base + 0.02, doorZ1);
    g.add(this.door);
    add(RB(0.05, 0.95, 0.86, 0.02), paint, 0, 0.62, -0.43, this.door);
    add(RB(0.05, 0.08, 0.86, 0.02), paint, 0, 1.94, -0.43, this.door);
    for (const dz of [-0.03, -0.83]) add(RB(0.05, 0.9, 0.06, 0.02), paint, 0, 1.5, dz, this.door);
    add(new THREE.PlaneGeometry(0.76, 0.86), glass, 0.0, 1.5, -0.43, this.door).rotation.y = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 6), chrome, -0.04, 1.2, -0.75, this.door);
    for (let i = 0; i < 2; i++) add(RB(0.34 - i * 0.12, 0.05, 0.8, 0.02), chrome, W / 2 - 0.16 - i * 0.06 + (1 - i) * 0.0, base - 0.12 + i * 0.2, (doorZ0 + doorZ1) / 2);
    this.doorT = 0; this.doorWant = 0;
    // wheels in arches; the front pair steers
    this.wheels = []; this.front = [];
    for (const [sx, sz] of [[-1, 2.1], [1, 2.1], [-1, -2.0], [1, -2.0]]) {
      const holder = new THREE.Group();
      holder.position.set(sx * 0.93, 0.42, sz);
      g.add(holder);
      const w = roadWheel(0.42, 0.27);
      holder.add(w);
      this.wheels.push(w);
      if (sz > 0) this.front.push(holder);
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.32, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), std('#0e0e0e', { side: THREE.DoubleSide }), sx * 0.93, 0.47, sz);
    }
    this.exhaust = V(0.55 - 0.7, 0.32, -fz - 0.1);
    this.doorPos = V(0.55 + W / 2 + 0.55, 0, (doorZ0 + doorZ1) / 2); // where people stand to climb in (root space)
    this.len = L; this.half = W / 2; this.wheelR = 0.42;
    this.brake = false;
  }
  foot(side, out) { return out.set(side * 0.14, this.floorY + 0.08, 2.62); }
  update(dt, speed, steer, riding, night = 0) {
    for (const w of this.wheels) w.rotation.x += (speed * dt) / this.wheelR;
    const st = riding ? steer * 1.3 : 0;
    for (const f of this.front) f.rotation.y = st * 0.6;
    this.wheelSteer.rotation.z = -st * 2.4;
    this.lamp.emissiveIntensity = riding ? 0.6 + night * 3 : 0.1;
    this.brakeM.emissiveIntensity = riding ? (this.brake ? 2.2 : 0.35 + night * 0.4) : 0.1;
    this.revM.emissiveIntensity = riding && speed < -0.1 ? 2.5 : 0;
    this.cabinLight.emissiveIntensity = 0.2 + night * 2.2;
    this.dial.emissiveIntensity = riding ? 0.3 + night * 1.2 : 0.05;
    this.doorT += (this.doorWant - this.doorT) * (1 - Math.exp(-dt * 5));
    this.door.rotation.y = this.doorT * 1.35;
    this.body.position.y = riding && Math.abs(speed) > 0.1 ? Math.sin(performance.now() * 0.025) * 0.006 : 0;
  }
}

// ---------------- e-rickshaw ----------------
// The battery tuk-tuk of every Indian town: a sky-blue body on three small wheels, a white fibre canopy on
// thin pillars, open sides, the driver up front on a bike-style seat with handlebars, and two benches behind
// facing each other — two passengers on each, four at most. It hums instead of putt-putting.
export const ERICK = { saddle: V(0, 0.86, 0.5), bar: V(0, 1.12, 0.92) };
export class ERickshaw {
  constructor({ color = '#2a9fd0', trim = '#e8382f' } = {}) {
    this.kind = 'erick';
    this.L = ERICK;
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const white = std('#f3f2ec', { roughness: 0.4 }), red = std(trim, { roughness: 0.4 });
    const black = std('#151515', { roughness: 0.6 }), chrome = std('#d4d8dc', { metalness: 0.95, roughness: 0.18 });
    const rubber = std('#1a1918', { roughness: 0.9 }), seatM = std('#7a1e22', { roughness: 0.45 }), seatM2 = std('#3a2a20', { roughness: 0.5 });
    const floorM = std('#3a3c3e', { roughness: 0.8, metalness: 0.3 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe2ea', roughness: 0.05, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
    const tail = std('#c4201c', { emissive: '#5a0806', emissiveIntensity: 0.6 }), amber = std('#f08a12', { emissive: '#5a2a06', emissiveIntensity: 0.6 });
    this.lamp = std('#fff6dc', { emissive: '#ffe6aa', emissiveIntensity: 0.3 });
    this.brakeM = tail;
    this.root = new THREE.Group();
    const g = new THREE.Group();
    this.root.add(g);
    this.body = g;
    const add = (geo, m, x, y, z, p = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = m !== glass; o.receiveShadow = true; p.add(o); return o; };
    const W = 1.12, F = 0.45; // body width, floor top
    this.floorY = F;
    // chassis, floor and the step boards along both sides
    add(RB(W - 0.1, 0.12, 2.5, 0.03), black, 0, 0.33, -0.2);
    add(RB(W, 0.05, 2.0, 0.02), floorM, 0, F - 0.025, -0.45);
    for (const sx of [-1, 1]) add(RB(0.16, 0.035, 0.7, 0.01), chrome, sx * (W / 2 + 0.05), 0.36, -0.42);
    // the body tub: low side panels round the passenger well, a red belt stripe, a closed back
    for (const sx of [-1, 1]) {
      add(RB(0.05, 0.42, 0.42, 0.02), paint, sx * W / 2, F + 0.17, -1.18);
      add(RB(0.05, 0.42, 0.42, 0.02), paint, sx * W / 2, F + 0.17, 0.12);
      add(RB(0.055, 0.05, 0.42, 0.01), red, sx * W / 2, F + 0.33, -1.18);
      add(RB(0.055, 0.05, 0.42, 0.01), red, sx * W / 2, F + 0.33, 0.12);
      add(RB(0.06, 0.2, 1.9, 0.02), paint, sx * W / 2, F - 0.05, -0.5); // skirt below the floor
      // wheel arches over the rear wheels
      add(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), std(color, { side: THREE.DoubleSide, roughness: 0.35 }), sx * (W / 2 + 0.02), 0.27, -0.82);
    }
    add(RB(W, 0.95, 0.06, 0.03), paint, 0, F + 0.4, -1.42);
    add(RB(W + 0.01, 0.06, 0.07, 0.02), red, 0, F + 0.62, -1.42);
    // front: the rounded nose fairing over the front wheel, a dash with a battery meter, windscreen
    add(RB(0.86, 0.75, 0.42, 0.18, 5), paint, 0, 0.72, 1.05);
    add(RB(0.6, 0.32, 0.3, 0.12, 4), paint, 0, 0.44, 1.2);
    add(RB(0.88, 0.06, 0.44, 0.03), white, 0, 1.11, 1.03);
    add(RB(0.6, 0.04, 0.04, 0.015), chrome, 0, 0.95, 1.27);
    add(RB(0.62, 0.1, 0.12, 0.04), black, 0, 1.08, 0.83);
    this.dial = std('#e8e4d8', { emissive: '#4adf6a', emissiveIntensity: 0.3 });
    add(new THREE.CircleGeometry(0.045, 16), this.dial, 0, 1.1, 0.766).rotation.y = Math.PI;
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.018, 0.03, 0.005), this.dial, -0.2 + i * 0.024, 1.1, 0.768);
    const ws = add(RB(0.92, 0.62, 0.02, 0.01), glass, 0, 1.5, 1.08);
    ws.rotation.x = -0.12;
    add(new THREE.BoxGeometry(0.02, 0.4, 0.01), black, 0.12, 1.42, 1.11).rotation.z = 0.5;
    // pillars, roof and the luggage rail
    for (const sx of [-1, 1]) {
      const fp = add(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 8), black, sx * 0.47, 1.5, 1.1);
      fp.rotation.x = -0.12;
      for (const z of [0.22, -1.38]) add(new THREE.CylinderGeometry(0.022, 0.022, 1.36, 8), chrome, sx * (W / 2 - 0.03), F + 0.73 + (z > 0 ? 0 : 0.03), z);
      add(new THREE.CylinderGeometry(0.016, 0.016, 1.55, 8).rotateX(Math.PI / 2), chrome, sx * (W / 2 - 0.03), 1.5, -0.58); // grab rail
    }
    add(RB(W + 0.18, 0.07, 2.75, 0.03), white, 0, 1.86, -0.18);
    add(RB(W + 0.1, 0.04, 2.6, 0.02), std('#d9d6cc', { roughness: 0.6 }), 0, 1.81, -0.18);
    add(RB(W + 0.2, 0.08, 0.06, 0.02), red, 0, 1.84, 1.18);
    for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.012, 0.012, 2.3, 6).rotateX(Math.PI / 2), chrome, sx * 0.5, 1.95, -0.25);
    // fringe of little tassels along the canopy edge, as the drivers like
    {
      const cols = ['#e8382f', '#f2c21a', '#2e8b57', '#ffffff'];
      const geo = new THREE.ConeGeometry(0.025, 0.08, 6).rotateX(Math.PI);
      for (const sx of [-1, 1]) for (let i = 0; i < 12; i++) add(geo, std(cols[i % 4], { roughness: 0.8 }), sx * (W / 2 + 0.09), 1.77, 1.05 - i * 0.22);
    }
    // the driver's seat with a backrest that is also the back of the rear-facing bench
    add(RB(0.5, 0.1, 0.36, 0.04), seatM2, 0, ERICK.saddle.y - 0.05, ERICK.saddle.z);
    add(RB(0.36, 0.38, 0.12, 0.04), seatM2, 0, F + 0.2, ERICK.saddle.z);
    add(RB(W - 0.08, 0.5, 0.07, 0.03), paint, 0, F + 0.65, 0.26);
    // passenger benches: one behind the driver facing back, one at the rear facing forward
    this.seats = []; this.seatRot = [];
    const bench = (zc, dir) => {
      add(RB(W - 0.12, 0.38, 0.36, 0.03), paint, 0, F + 0.19, zc);
      add(RB(W - 0.1, 0.1, 0.4, 0.04), seatM, 0, F + 0.43, zc);
      add(RB(W - 0.1, 0.42, 0.08, 0.04), seatM, 0, F + 0.72, zc - dir * 0.22);
      for (const x of [-0.25, 0.25]) { this.seats.push(V(x, F + 0.48, zc + dir * 0.04)); this.seatRot.push(dir > 0 ? 0 : Math.PI); }
    };
    bench(-0.06, -1);
    bench(-1.16, 1);
    // battery box under the rear bench and its cable, a speaker horn
    add(RB(0.6, 0.22, 0.36, 0.03), std('#1e1e1e', { roughness: 0.5 }), 0, F - 0.13, -1.0);
    // rear: tail lamps, number plate, a sticker
    for (const sx of [-1, 1]) add(RB(0.1, 0.12, 0.03, 0.015), tail, sx * 0.44, F + 0.25, -1.455);
    const plate = add(new THREE.PlaneGeometry(0.4, 0.1), new THREE.MeshStandardMaterial({ map: plateTexture('UP 32 E 0786'), roughness: 0.5 }), 0, F + 0.12, -1.456);
    plate.rotation.y = Math.PI;
    {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = color; x.fillRect(0, 0, 256, 64);
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 30px "Tiro Devanagari Hindi", "Kohinoor Devanagari", sans-serif';
      x.fillText('शुभ यात्रा', 128, 34);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      add(new THREE.PlaneGeometry(0.62, 0.16), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }), 0, F + 0.47, -1.456).rotation.y = Math.PI;
    }
    // wheels: two at the back on a solid axle, one up front in the fork
    this.wheels = [];
    for (const sx of [-1, 1]) {
      const w = wheelMesh(0.25, 0.13, rubber, chrome);
      w.position.set(sx * (W / 2 - 0.02), 0.25, -0.82);
      g.add(w);
      this.wheels.push(w);
    }
    // headlamp, indicators
    add(new THREE.TorusGeometry(0.085, 0.016, 8, 20), chrome, 0, 0.82, 1.27);
    add(new THREE.CircleGeometry(0.08, 20), this.lamp, 0, 0.82, 1.272);
    for (const sx of [-1, 1]) add(RB(0.07, 0.05, 0.03, 0.012), amber, sx * 0.36, 0.98, 1.25);
    this.fork = new THREE.Group();
    this.fork.position.set(0, 0.95, 0.98);
    g.add(this.fork);
    const fw = wheelMesh(0.25, 0.12, rubber, chrome);
    fw.position.set(0, 0.25 - 0.95, 0.12);
    this.fork.add(fw);
    this.wheels.push(fw);
    const by = ERICK.bar.y - 0.95, bz = ERICK.bar.z - 0.98;
    add(mergeGeometries([
      new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8).rotateZ(Math.PI / 2).translate(0, by, bz),
      new THREE.CylinderGeometry(0.024, 0.024, 0.2, 8).translate(0, by - 0.1, bz + 0.02),
    ]), chrome, 0, 0, 0, this.fork);
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.024, 0.024, 0.13, 10).rotateZ(Math.PI / 2), rubber, sx * 0.27, by, bz, this.fork);
      add(new THREE.CylinderGeometry(0.007, 0.007, 0.3, 6), chrome, sx * 0.3, by + 0.15, bz + 0.02, this.fork);
      add(new THREE.CylinderGeometry(0.055, 0.055, 0.015, 16).rotateX(Math.PI / 2), black, sx * 0.32, by + 0.31, bz + 0.03, this.fork).rotation.y = sx * 0.3;
    }
    this.exhaust = V(0, 0.4, -1.5); // nothing comes out, but nitro sparks need somewhere to start
    this.doorPos = V(W / 2 + 0.45, 0, -0.62); // passengers step in from the kerb side, between the benches
    this.brake = false;
  }
  // in through the open side, into the foot-well between the benches, then sit
  pathIn(seat) {
    const S = this.seats[seat], F = this.floorY, dir = this.seatRot[seat] ? -1 : 1;
    return [
      V(this.doorPos.x - 0.25, F * 0.6, this.doorPos.z),
      V(0.42, F, -0.62),
      V(S.x, F, -0.62),
      V(S.x, F, S.z + dir * 0.28),
      V(S.x, S.y, S.z),
    ];
  }
  foot(side, out) { return out.set(side * 0.16, this.floorY + 0.05, 0.86); }
  update(dt, speed, steer, riding, night = 0) {
    for (const w of this.wheels) w.rotation.x += (speed * dt) / 0.25;
    this.fork.rotation.y = riding ? steer * 1.2 : 0.25;
    this.lamp.emissiveIntensity = riding ? 0.6 + night * 3 : 0.1;
    this.brakeM.emissiveIntensity = riding ? (this.brake ? 2.2 : 0.35 + night * 0.4) : 0.1;
    this.dial.emissiveIntensity = riding ? 0.4 + night : 0.05;
    this.body.position.y = riding && Math.abs(speed) > 0.1 ? Math.sin(performance.now() * 0.03) * 0.004 : 0;
  }
}
