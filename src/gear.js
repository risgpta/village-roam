// Weather gear: umbrellas for the monsoon and hurricane lanterns at night, held by any human rig,
// plus a small pool of point lights handed to the lanterns closest to the player.
import * as THREE from 'three';
import { lathe } from './shapes.js';

const UMBRELLA_COLS = ['#1b1b1f', '#1b1b1f', '#2a3f6b', '#7a1f2b', '#2f5d3a', '#3a2a4a'];
let umbrellaCount = 0;

export function makeUmbrella(color) {
  const g = new THREE.Group();
  const col = color ?? UMBRELLA_COLS[umbrellaCount++ % UMBRELLA_COLS.length];
  const cloth = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: '#9a9a9a', metalness: 0.7, roughness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.6 });
  // 8-panel canopy: a shallow dome with scalloped edge between the ribs
  const R = 0.62, N = 8;
  const canopy = lathe([[R, -0.02], [R * 0.85, 0.12], [R * 0.6, 0.22], [R * 0.3, 0.28], [0.02, 0.3]], N * 4);
  const p = canopy.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x);
    const scallop = Math.abs(Math.cos(a * N / 2));
    const edge = 1 - Math.min(1, Math.max(0, y + 0.02) / 0.3);
    p.setY(i, y + (1 - scallop) * 0.05 * edge);
  }
  canopy.computeVertexNormals();
  const cm = new THREE.Mesh(canopy, cloth);
  cm.position.y = 0.8;
  cm.castShadow = true;
  g.add(cm);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.15, 6), metal);
  shaft.position.y = 0.55;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08, 6), metal);
  tip.position.y = 1.14;
  g.add(tip);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12, Math.PI), wood);
  hook.position.set(0.045, -0.02, 0);
  hook.rotation.z = Math.PI;
  g.add(hook);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8), wood);
  grip.position.y = 0.04;
  g.add(grip);
  return g;
}

let halo = null;
function haloTexture() {
  if (halo) return halo;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,220,150,1)');
  grd.addColorStop(0.25, 'rgba(255,170,80,0.45)');
  grd.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  halo = new THREE.CanvasTexture(c);
  halo.colorSpace = THREE.SRGBColorSpace;
  return halo;
}

// A hurricane lantern; origin is the top of the handle (where the hand grips it).
export function makeLantern() {
  const g = new THREE.Group();
  const tin = new THREE.MeshStandardMaterial({ color: '#3d4a3f', metalness: 0.6, roughness: 0.45 });
  const brass = new THREE.MeshStandardMaterial({ color: '#b08a3a', metalness: 0.7, roughness: 0.35 });
  const flame = new THREE.MeshBasicMaterial({ color: '#ffd28a' });
  const glass = new THREE.MeshStandardMaterial({ color: '#fff2d0', emissive: '#ffb04a', emissiveIntensity: 2.2, transparent: true, opacity: 0.55, roughness: 0.1 });
  const add = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; g.add(o); return o; };
  const handle = add(new THREE.TorusGeometry(0.075, 0.006, 4, 16, Math.PI), tin, -0.075);
  handle.rotation.z = 0;
  add(lathe([[0.06, 0], [0.065, 0.02], [0.04, 0.04], [0.012, 0.06]], 12), tin, -0.13); // top cap
  add(lathe([[0.03, 0], [0.06, 0.04], [0.065, 0.1], [0.05, 0.15], [0.032, 0.17]], 14), glass, -0.3); // globe
  add(new THREE.SphereGeometry(0.016, 8, 6).scale(1, 1.8, 1), flame, -0.22);
  for (let i = 0; i < 4; i++) {
    const w = add(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 3), tin, -0.215);
    const a = (i / 4) * Math.PI * 2 + 0.4;
    w.position.x = Math.cos(a) * 0.068;
    w.position.z = Math.sin(a) * 0.068;
  }
  add(lathe([[0.0, 0], [0.075, 0.0], [0.08, 0.03], [0.07, 0.06], [0.035, 0.07]], 16), brass, -0.37); // fuel tank
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
  sprite.scale.setScalar(0.9);
  sprite.position.y = -0.22;
  g.add(sprite);
  g.userData.glowPoint = new THREE.Vector3(0, -0.22, 0);
  g.userData.glass = glass;
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

// ---------------- holding gear ----------------
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

// Rig must expose root, arms[0].{shoulder, elbow, hand}, k (scale) and head.
export class Gear {
  constructor(rig) {
    this.rig = rig;
    this.mode = 'none';
    this.umbrella = null;
    this.lantern = null;
    this.swing = 0;
    this.swingV = 0;
    this.lastX = null;
  }
  set(mode) {
    this.mode = mode;
    if (mode === 'umbrella' && !this.umbrella) { this.umbrella = makeUmbrella(); this.rig.root.add(this.umbrella); }
    if (mode === 'lantern' && !this.lantern) { this.lantern = makeLantern(); this.rig.root.add(this.lantern); }
    if (this.umbrella) this.umbrella.visible = mode === 'umbrella';
    if (this.lantern) this.lantern.visible = mode === 'lantern';
  }
  // Override the left arm pose (call after the rig has posed itself, before rendering)
  pose(blend = 1) {
    const a = this.rig.arms[0];
    const L = (cur, tgt) => cur + (tgt - cur) * blend;
    if (this.mode === 'umbrella') {
      a.shoulder.rotation.x = L(a.shoulder.rotation.x, -1.05);
      a.shoulder.rotation.z = L(a.shoulder.rotation.z, 0.12);
      a.elbow.rotation.x = L(a.elbow.rotation.x, -1.35);
    } else if (this.mode === 'lantern') {
      a.shoulder.rotation.x = L(a.shoulder.rotation.x, -0.32 + a.shoulder.rotation.x * 0.25);
      a.shoulder.rotation.z = L(a.shoulder.rotation.z, -0.18);
      a.elbow.rotation.x = L(a.elbow.rotation.x, -0.55);
    }
  }
  // Place the held item at the hand, but keep it upright (umbrella) or hanging (lantern).
  update(dt) {
    if (this.mode === 'none') return;
    const r = this.rig;
    r.root.updateMatrixWorld(true);
    r.arms[0].hand.getWorldPosition(_v);
    r.root.worldToLocal(_v);
    const k = r.k ?? 1;
    if (this.mode === 'umbrella' && this.umbrella) {
      const u = this.umbrella;
      u.position.copy(_v);
      // tilt the shaft so the canopy sits over the head
      _d.set(-_v.x * 0.9, 1.6, -_v.z * 0.6 + 0.08).normalize();
      _q.setFromUnitVectors(_up, _d);
      u.quaternion.slerp(_q, 1 - Math.exp(-dt * 12));
      u.scale.setScalar(Math.max(0.85, k));
    } else if (this.mode === 'lantern' && this.lantern) {
      const l = this.lantern;
      // pendulum: driven by the hand's sideways / forward acceleration
      const wx = r.root.position.x, wz = r.root.position.z;
      if (this.lastX !== null && dt > 0) {
        const sp = Math.hypot(wx - this.lastX.x, wz - this.lastX.z) / dt;
        this.swingV += (-this.swing * 30 - this.swingV * 3 + Math.sin(performance.now() * 0.009) * sp * 1.4) * dt;
        this.swing += this.swingV * dt;
      }
      this.lastX = { x: wx, z: wz };
      l.position.copy(_v);
      l.rotation.set(this.swing * 0.5, 0, this.swing * 0.25);
      l.scale.setScalar(Math.max(0.9, k));
    }
  }
  lightPos(out) {
    if (this.mode !== 'lantern' || !this.lantern) return null;
    return this.lantern.localToWorld(out.copy(this.lantern.userData.glowPoint));
  }
}

// ---------------- lantern lights ----------------
// A fixed number of lights is kept in the scene (constant shader cost) and handed to the nearest lanterns.
export class LanternLights {
  constructor(scene, count = 4) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight('#ffb35a', 0, 11, 1.6);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
    this.on = 0;
    this.sources = []; // { gear } or { point: Vector3 }
    this._p = [];
    for (let i = 0; i < 64; i++) this._p.push(new THREE.Vector3());
  }
  add(src) { this.sources.push(src); }
  update(player, t) {
    if (this.on <= 0) { for (const l of this.lights) l.intensity = 0; return; }
    const cand = [];
    let n = 0;
    for (const s of this.sources) {
      const p = s.gear ? s.gear.lightPos(this._p[n]) : s.point;
      if (!p) continue;
      n++;
      cand.push({ p, d: (p.x - player.x) ** 2 + (p.z - player.z) ** 2, w: s.weight ?? 1 });
    }
    cand.sort((a, b) => a.d - b.d);
    this.lights.forEach((l, i) => {
      const c = cand[i];
      if (!c || c.d > 60 * 60) { l.intensity = 0; return; }
      l.position.copy(c.p);
      const flick = 0.92 + 0.08 * Math.sin(t * 13 + i * 2.1) * Math.sin(t * 7.3 + i);
      l.intensity = this.on * 2.6 * c.w * flick;
    });
  }
}
