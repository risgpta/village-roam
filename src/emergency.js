// The emergency services: a white "108" ambulance (a Traveller-style van with a high patient box) and a red
// "101" fire tender (a crew cab, a long locker body, a ladder and hose reel on top). Both can be driven; with
// the siren on, the light bars flash red and blue and the traffic ahead pulls over.
// Same interface as the other rides: root (the driver's seat at the origin), L.saddle / L.bar, foot(),
// update(dt, speed, steer, riding, night), and the wheels.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
const RB = (w, h, d, r = 0.06, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const redCross = (g, cx, cy, s, col = '#d4161c') => { g.fillStyle = col; g.fillRect(cx - s / 6, cy - s / 2, s / 3, s); g.fillRect(cx - s / 2, cy - s / 6, s, s / 3); };

// the side of the ambulance's patient box: white, the orange-and-red chequer band, 108, the cross, the words
function ambulanceSide() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#f6f6f2'; g.fillRect(0, 0, w, h);
    // the reflective band low down, red and fluorescent orange blocks
    for (let i = 0; i < 32; i++) { g.fillStyle = i % 2 ? '#e2231a' : '#ff8a1c'; g.fillRect(i * 32, h * 0.66, 32, 26); g.fillStyle = i % 2 ? '#ff8a1c' : '#e2231a'; g.fillRect(i * 32, h * 0.66 + 26, 32, 26); }
    g.fillStyle = '#1a5fb4'; g.fillRect(0, h * 0.66 - 10, w, 8);
    redCross(g, w * 0.2, h * 0.36, 170);
    g.fillStyle = '#d4161c'; g.font = 'bold 150px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('108', w * 0.6, h * 0.34);
    g.fillStyle = '#1a3c8a'; g.font = 'bold 54px Arial'; g.fillText('AMBULANCE', w * 0.6, h * 0.53);
    g.font = 'bold 34px "Kohinoor Devanagari", Arial'; g.fillStyle = '#d4161c'; g.fillText('आपातकालीन सेवा', w * 0.6, h * 0.92);
  });
}
// the fire tender's lockers: red roller shutters with their ribs, a white stripe, 101 and FIRE & RESCUE
function fireSide() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#c4161c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i++) {
      const x0 = 20 + i * 335, x1 = x0 + 315;
      g.fillStyle = '#b01218'; g.fillRect(x0, 30, x1 - x0, h * 0.58);
      g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = 36; y < 30 + h * 0.58; y += 12) g.fillRect(x0 + 4, y, x1 - x0 - 8, 2);
      g.fillStyle = '#d8d8d8'; g.fillRect(x0 + (x1 - x0) / 2 - 30, 30 + h * 0.58 - 16, 60, 8); // handle
      g.strokeStyle = '#7a0a0e'; g.lineWidth = 4; g.strokeRect(x0, 30, x1 - x0, h * 0.58);
    }
    g.fillStyle = '#f4f4f0'; g.fillRect(0, h * 0.72, w, 30);
    g.fillStyle = '#ffd21a'; g.fillRect(0, h * 0.72 + 30, w, 10);
    g.fillStyle = '#f4f4f0'; g.font = 'bold 70px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('FIRE & RESCUE · 101', w / 2, h * 0.88);
  });
}
function plate(text) {
  return canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#f2f2ec'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4); g.fillStyle = '#111'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2); });
}
function wheel(r, w, rubber, hub) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 22).rotateZ(Math.PI / 2), rubber); t.castShadow = true; g.add(t);
  const h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 16).rotateZ(Math.PI / 2), hub); g.add(h);
  for (let i = 0; i < 6; i++) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, w + 0.05, 6).rotateZ(Math.PI / 2), rubber); n.position.set(0, Math.cos(i) * r * 0.36, Math.sin(i) * r * 0.36); g.add(n); }
  return g;
}

class EmergencyVehicle {
  build(o) {
    const { len, wid, cabZ, offX, wheelR, wheelX, axles } = o;
    this.root = new THREE.Group();
    const g = new THREE.Group();
    g.position.x = offX; // right-hand drive: the driver's seat is at the origin
    this.root.add(g);
    this.body = g;
    this.add = (geo, m, x, y, z, p = g) => { const w = new THREE.Mesh(geo, m); w.position.set(x, y, z); w.castShadow = true; w.receiveShadow = true; p.add(w); return w; };
    this.lamp = std('#fff6dc', { emissive: '#ffe6aa', emissiveIntensity: 0.3 });
    this.brakeM = std('#c4201c', { emissive: '#ff2a1a', emissiveIntensity: 0.25 });
    this.redL = std('#ff2020', { emissive: '#ff1010', emissiveIntensity: 0.2, roughness: 0.3 });
    this.blueL = std('#2040ff', { emissive: '#1030ff', emissiveIntensity: 0.2, roughness: 0.3 });
    const rubber = std('#1a1918', { roughness: 0.9 }), hub = std('#c8ccd0', { metalness: 0.7, roughness: 0.35 });
    this.wheels = []; this.front = [];
    for (const z of axles) for (const sx of [-1, 1]) {
      const w = wheel(wheelR, 0.26, rubber, hub);
      const holder = new THREE.Group(); holder.position.set(sx * wheelX, wheelR, z); holder.add(w); g.add(holder);
      this.wheels.push(w); if (z === axles[0]) this.front.push(holder);
      this.add(new THREE.CylinderGeometry(wheelR + 0.05, wheelR + 0.05, 0.3, 16, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), std('#141414', { side: THREE.DoubleSide }), sx * wheelX, wheelR + 0.03, z);
    }
    // the light bar on the cab roof: red one side, blue the other, in clear lenses
    const bar = new THREE.Group(); bar.position.set(0, o.roofY + 0.06, cabZ); g.add(bar);
    this.add(RB(1.25, 0.1, 0.28, 0.04), std('#2a2a2a'), 0, 0, 0, bar);
    for (const [sx, m] of [[-1, this.redL], [1, this.blueL]]) for (const k of [0.18, 0.42]) this.add(RB(0.2, 0.11, 0.24, 0.04), m, sx * k, 0.06, 0, bar);
    // headlights, indicators, tail lights
    const amber = std('#f08a12', { emissive: '#5a2a06', emissiveIntensity: 0.6 });
    for (const sx of [-1, 1]) {
      this.add(RB(0.26, 0.16, 0.05, 0.04), this.lamp, sx * (wid / 2 - 0.3), o.lampY, len / 2 + 0.01);
      this.add(RB(0.12, 0.08, 0.05, 0.02), amber, sx * (wid / 2 - 0.12), o.lampY, len / 2);
      this.add(RB(0.16, 0.3, 0.05, 0.03), this.brakeM, sx * (wid / 2 - 0.15), o.lampY + 0.1, -len / 2 - 0.01);
    }
    for (const [z, ry] of [[len / 2 + 0.03, 0], [-len / 2 - 0.03, Math.PI]]) {
      const p = this.add(new THREE.PlaneGeometry(0.42, 0.1), new THREE.MeshStandardMaterial({ map: plate(o.plate), roughness: 0.5 }), 0, 0.5, z);
      p.rotation.y = ry;
    }
    this.siren = false;
    this.t = 0;
  }
  // the driver's seat, the steering wheel in front of it
  cabin(seatY, seatZ, wheelY, wheelZ, trim) {
    const add = this.add, fabric = std('#3a3f48', { roughness: 0.95 });
    const dx = -this.body.position.x;
    for (const sx of [dx, -dx]) { add(RB(0.5, 0.12, 0.5, 0.04), fabric, sx, seatY, seatZ); add(RB(0.5, 0.6, 0.1, 0.04), fabric, sx, seatY + 0.36, seatZ - 0.28); }
    const wg = new THREE.Group(); wg.position.set(dx, wheelY, wheelZ); wg.rotation.x = -0.9; this.body.add(wg);
    add(new THREE.TorusGeometry(0.2, 0.018, 8, 28), std('#141414'), 0, 0, 0, wg);
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12).rotateX(Math.PI / 2), std('#141414'), 0, 0, 0, wg);
    this.steer = wg;
    add(RB(1.6, 0.3, 0.4, 0.06), trim, 0, wheelY - 0.12, wheelZ + 0.32); // the dashboard
  }
  foot(side, out) { return out.set(side * 0.12, this.L.saddle.y - 0.48, this.L.saddle.z + 0.5); }
  update(dt, speed, steer, riding, night = 0) {
    this.t += dt;
    for (const w of this.wheels) w.rotation.x += (speed * dt) / this.wheelR;
    const want = riding ? steer * 0.55 : 0;
    this.steerNow = (this.steerNow ?? 0) + (want - (this.steerNow ?? 0)) * (1 - Math.exp(-dt * 8));
    for (const f of this.front) f.rotation.y = this.steerNow;
    if (this.steer) this.steer.rotation.z = -this.steerNow * 4;
    this.lamp.emissiveIntensity = night ? 4.5 : 0.15;
    this.brakeM.emissiveIntensity = riding && this.brake ? 3 : night ? 0.9 : 0.2;
    // the light bar: red and blue flashing in turn, double flashes
    if (this.siren) {
      const c = (this.t * 2.2) % 1, a = (c < 0.12 || (c > 0.2 && c < 0.32)) ? 1 : 0, b = (c > 0.5 && c < 0.62) || (c > 0.7 && c < 0.82) ? 1 : 0;
      this.redL.emissiveIntensity = 0.2 + a * (night ? 9 : 5); this.blueL.emissiveIntensity = 0.2 + b * (night ? 9 : 5);
    } else { this.redL.emissiveIntensity = 0.2; this.blueL.emissiveIntensity = 0.2; }
  }
}

export class Ambulance extends EmergencyVehicle {
  constructor() {
    super();
    this.kind = 'ambulance';
    this.wheelR = 0.38;
    this.L = { saddle: V(0, 1.02, 0.85), bar: V(0, 1.4, 1.25) };
    this.build({ len: 5.1, wid: 1.95, cabZ: 1.4, offX: 0.45, wheelR: 0.38, wheelX: 0.86, axles: [1.75, -1.55], roofY: 2.12, lampY: 0.9, plate: 'HR 26 GA 108' });
    const add = this.add;
    const white = new THREE.MeshPhysicalMaterial({ color: '#f6f6f2', roughness: 0.3, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const black = std('#151515', { roughness: 0.6 }), trim = std('#2a2a2a', { roughness: 0.8 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#9fb8c6', roughness: 0.05, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const frosted = std('#dfe6ea', { roughness: 0.2, transparent: true, opacity: 0.85 });
    const side = new THREE.MeshStandardMaterial({ map: ambulanceSide(), roughness: 0.4 });
    // the chassis, the cab with its short bonnet, the tall patient box behind
    add(RB(1.9, 0.32, 4.9, 0.08), black, 0, 0.5, 0);
    add(RB(1.92, 0.62, 0.9, 0.18, 4), white, 0, 0.98, 2.1); // the bonnet
    add(RB(1.95, 1.05, 1.2, 0.14, 4), white, 0, 1.55, 1.25); // the cab
    add(RB(1.98, 1.75, 3.0, 0.1, 4), white, 0, 1.52, -0.95); // the patient box
    // the livery on both sides of the box, and the back doors
    for (const sx of [-1, 1]) { const d = add(new THREE.PlaneGeometry(2.9, 1.45), side, sx * 0.995, 1.42, -0.95); d.rotation.y = sx * Math.PI / 2; if (sx < 0) d.scale.x = -1; }
    { const b = add(new THREE.PlaneGeometry(1.8, 1.6), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (g2, w, h) => { g2.fillStyle = '#f6f6f2'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#888'; g2.fillRect(w / 2 - 2, 0, 4, h); redCross(g2, w * 0.27, h * 0.35, 120); redCross(g2, w * 0.73, h * 0.35, 120); for (let i = 0; i < 16; i++) { g2.fillStyle = i % 2 ? '#e2231a' : '#ff8a1c'; g2.fillRect(i * 32, h * 0.72, 32, 40); } }), roughness: 0.4 }), 0, 1.45, -2.47); b.rotation.y = Math.PI; }
    // ECNALUBMA across the front, so it reads in a mirror
    { const f = add(new THREE.PlaneGeometry(1.4, 0.22), new THREE.MeshStandardMaterial({ map: canvasTex(512, 80, (g2, w, h) => { g2.fillStyle = '#f6f6f2'; g2.fillRect(0, 0, w, h); g2.save(); g2.scale(-1, 1); g2.fillStyle = '#d4161c'; g2.font = 'bold 60px Arial'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('AMBULANCE', -w / 2, h / 2 + 2); g2.restore(); }), roughness: 0.4 }), 0, 1.2, 2.56); f.rotation.x = -0.25; }
    // glass: the windscreen, the cab's side windows, frosted panes in the box
    const ws = add(new THREE.PlaneGeometry(1.75, 0.75), glass, 0, 1.68, 1.86); ws.rotation.x = -0.3;
    for (const sx of [-1, 1]) {
      const w = add(new THREE.PlaneGeometry(0.85, 0.55), glass, sx * 0.98, 1.72, 1.3); w.rotation.y = sx * Math.PI / 2;
      const fw = add(new THREE.PlaneGeometry(0.9, 0.4), frosted, sx * 1.0, 1.98, -0.3); fw.rotation.y = sx * Math.PI / 2;
      const m = add(RB(0.08, 0.28, 0.18, 0.03), black, sx * 1.12, 1.6, 1.75); void m; // mirrors
    }
    // the grille and the bumpers
    add(RB(1.2, 0.3, 0.06, 0.03), black, 0, 0.9, 2.56);
    for (const z of [2.58, -2.5]) add(RB(1.98, 0.18, 0.14, 0.05), std('#3a3a3a', { roughness: 0.7 }), 0, 0.52, z);
    // inside the box: a stretcher with a red blanket and an oxygen cylinder (seen through the back doors' glass)
    add(RB(0.6, 0.12, 1.9, 0.04), std('#9aa0a6', { metalness: 0.6 }), 0.35, 0.95, -1.1);
    add(RB(0.55, 0.06, 1.6, 0.03), std('#b3202a', { roughness: 0.9 }), 0.35, 1.04, -1.15);
    add(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 12), std('#2e7a4a', { roughness: 0.4 }), -0.7, 1.1, -1.9);
    this.cabin(0.95, 0.85, 1.4, 1.3, trim);
    this.exhaust = V(0.45 + 0.6, 0.35, -2.5);
  }
}

export class FireTruck extends EmergencyVehicle {
  constructor() {
    super();
    this.kind = 'firetruck';
    this.wheelR = 0.5;
    this.L = { saddle: V(0, 1.42, 2.25), bar: V(0, 1.85, 2.68) };
    this.build({ len: 7.4, wid: 2.35, cabZ: 2.4, offX: 0.55, wheelR: 0.5, wheelX: 0.98, axles: [2.55, -2.1], roofY: 2.75, lampY: 1.05, plate: 'HR 26 FS 101' });
    const add = this.add;
    const red = new THREE.MeshPhysicalMaterial({ color: '#c4161c', roughness: 0.32, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const black = std('#151515', { roughness: 0.6 }), trim = std('#2a2a2a', { roughness: 0.8 }), chrome = std('#d4d8dc', { metalness: 0.95, roughness: 0.18 });
    const alu = std('#c8ccd0', { metalness: 0.8, roughness: 0.35 }), white = std('#f4f4f0', { roughness: 0.5 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#9fb8c6', roughness: 0.05, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const lockers = new THREE.MeshStandardMaterial({ map: fireSide(), roughness: 0.4 });
    // chassis, the crew cab up front, the long locker body with the water tank
    add(RB(2.2, 0.4, 7.2, 0.08), black, 0, 0.75, 0);
    add(RB(2.35, 1.75, 2.3, 0.16, 4), red, 0, 1.9, 2.5);
    add(RB(2.35, 1.8, 4.6, 0.08, 3), red, 0, 1.9, -1.25);
    for (const sx of [-1, 1]) { const d = add(new THREE.PlaneGeometry(4.5, 1.7), lockers, sx * 1.181, 1.9, -1.25); d.rotation.y = sx * Math.PI / 2; if (sx < 0) d.scale.x = -1; }
    // a white stripe and FIRE on the cab, the big windscreen, side windows
    for (const sx of [-1, 1]) {
      const s = add(new THREE.PlaneGeometry(2.25, 0.4), new THREE.MeshStandardMaterial({ map: canvasTex(512, 96, (g2, w, h) => { g2.fillStyle = '#f4f4f0'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#c4161c'; g2.font = 'bold 66px Arial'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillText('अग्निशमन  FIRE', w / 2, h / 2 + 3); }), roughness: 0.5 }), sx * 1.181, 1.35, 2.5);
      s.rotation.y = sx * Math.PI / 2; if (sx < 0) s.scale.x = -1;
      const w = add(new THREE.PlaneGeometry(1.4, 0.7), glass, sx * 1.18, 2.3, 2.6); w.rotation.y = sx * Math.PI / 2;
      add(RB(0.1, 0.35, 0.2, 0.03), black, sx * 1.32, 2.2, 3.4); // mirrors
    }
    const ws = add(new THREE.PlaneGeometry(2.1, 0.85), glass, 0, 2.35, 3.66); ws.rotation.x = -0.12;
    add(RB(1.6, 0.4, 0.06, 0.03), chrome, 0, 1.25, 3.67); // the grille
    add(RB(2.4, 0.22, 0.18, 0.06), chrome, 0, 0.75, 3.72); // the bumper
    add(new THREE.CylinderGeometry(0.14, 0.18, 0.2, 14), std('#d9a63a', { metalness: 0.9, roughness: 0.2 }), 0.7, 1.15, 3.78).rotation.x = Math.PI / 2; // the brass bell
    // up top: the ladder on its rack, a coiled hose reel behind the cab, the pump panel at the back
    for (const sx of [-0.35, 0.35]) add(RB(0.06, 0.06, 4.8, 0.02), alu, sx, 2.98, -1.0);
    for (let i = 0; i < 16; i++) add(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 6).rotateZ(Math.PI / 2), alu, 0, 2.98, 1.3 - i * 0.3);
    for (const z of [0.9, -2.8]) add(RB(0.9, 0.18, 0.12, 0.03), alu, 0, 2.86, z);
    add(new THREE.CylinderGeometry(0.42, 0.42, 0.75, 18).rotateZ(Math.PI / 2), std('#3a3a3a', { roughness: 0.8 }), 0, 3.25, 1.05);
    add(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 18).rotateZ(Math.PI / 2), alu, 0.4, 3.25, 1.05);
    add(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 18).rotateZ(Math.PI / 2), alu, -0.4, 3.25, 1.05);
    add(RB(1.9, 0.9, 0.08, 0.04), alu, 0, 1.6, -3.56);
    for (const sx of [-0.5, 0, 0.5]) add(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 12).rotateX(Math.PI / 2), chrome, sx, 1.55, -3.63);
    add(RB(2.2, 0.06, 0.4, 0.02), white, 0, 0.6, -3.5); // the rear step
    this.cabin(1.35, 2.25, 1.85, 2.72, trim);
    this.exhaust = V(0.55 + 0.9, 0.6, -3.6);
  }
}
