// Crash physics: anything knocked over or flung — a cyclist clipped by the bus, a parked scooter shoved by
// the car, a car hit by the train — becomes a loose rigid box for a while. It flies, tumbles and bounces on
// the real ground (impulses at the box's corners, with friction), stops against walls, settles, lies
// there for a moment, and is then set back upright so the game can carry on.
import * as THREE from 'three';
import { groundHeight, resolveCollisions } from './world.js';

const GRAV = 15;
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _r = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _vp = new THREE.Vector3(), _j = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Body {
  // obj: an Object3D parented to the scene. half: half extents of the box, com: box centre in obj's space.
  constructor(obj, { half, com, mass, hold = 3, restitution = 0.25, friction = 0.6, onDone = null, onStep = null, kind = 'thing' }) {
    this.obj = obj;
    this.kind = kind;
    this.half = half.clone();
    this.com = com.clone();
    this.mass = mass;
    this.invM = 1 / mass;
    const [w, h, d] = [half.x * 2, half.y * 2, half.z * 2];
    this.invI = new THREE.Vector3(12 / (mass * (h * h + d * d)), 12 / (mass * (w * w + d * d)), 12 / (mass * (w * w + h * h)));
    this.e = restitution; this.mu = friction;
    obj.updateMatrixWorld(true);
    this.q = obj.getWorldQuaternion(new THREE.Quaternion());
    this.p = obj.localToWorld(com.clone());
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
    this.state = 'fly';
    this.still = 0; this.t = 0; this.hold = hold; this.righting = 0;
    this.onDone = onDone; this.onStep = onStep;
    this.corners = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) this.corners.push(new THREE.Vector3(sx * half.x, sy * half.y, sz * half.z));
    this.lastHit = 0;
  }
  // world-space inverse inertia applied to a vector
  iw(v, out) {
    _qi.copy(this.q).invert();
    out.copy(v).applyQuaternion(_qi).multiply(this.invI).applyQuaternion(this.q);
    return out;
  }
  impulse(J, r) {
    this.v.addScaledVector(J, this.invM);
    this.w.add(this.iw(_a.crossVectors(r, J), _b));
  }
  // a hit from outside: change of velocity dv at a point offset r from the centre (world), plus extra spin
  kick(dv, spin) {
    this.v.add(dv);
    if (spin) this.w.add(spin);
    this.state = 'fly'; this.still = 0; this.righting = 0;
  }
  get radius() { return Math.min(this.half.x, this.half.z) * 0.9; }
  get footprint() { return Math.max(this.half.x, this.half.z); }
  step(h) {
    this.v.y -= GRAV * h;
    this.p.addScaledVector(this.v, h);
    // integrate orientation
    const w = this.w;
    _q.set(w.x * h * 0.5, w.y * h * 0.5, w.z * h * 0.5, 0).multiply(this.q);
    this.q.x += _q.x; this.q.y += _q.y; this.q.z += _q.z; this.q.w += _q.w;
    this.q.normalize();
    // ground contacts at the corners
    let pen = 0, touching = false;
    for (const c of this.corners) {
      _r.copy(c).applyQuaternion(this.q);
      const px = this.p.x + _r.x, py = this.p.y + _r.y, pz = this.p.z + _r.z;
      const gy = groundHeight(px, pz);
      const d = gy - py;
      if (d <= 0) continue;
      touching = true;
      pen = Math.max(pen, d);
      _vp.crossVectors(w, _r).add(this.v);
      const vn = _vp.y;
      if (vn < 0) {
        const k = this.invM + UP.dot(_a.crossVectors(this.iw(_b.crossVectors(_r, UP), _b), _r));
        const jn = (-(1 + (vn < -1.5 ? this.e : 0)) * vn) / k;
        this.impulse(_j.set(0, jn, 0), _r);
        // friction against sliding
        _vp.crossVectors(w, _r).add(this.v);
        _vp.y = 0;
        const vt = _vp.length();
        if (vt > 1e-4) {
          _vp.multiplyScalar(1 / vt);
          const kt = this.invM + _vp.dot(_a.crossVectors(this.iw(_b.crossVectors(_r, _vp), _b), _r));
          const jt = Math.min(vt / kt, this.mu * jn);
          this.impulse(_j.copy(_vp).multiplyScalar(-jt), _r);
        }
      }
    }
    if (pen > 0) this.p.y += pen * 0.8;
    if (touching) {
      // rolling resistance: things lying on the ground stop rocking
      const k = Math.exp(-h * 1.2);
      this.w.multiplyScalar(k);
    }
    this.w.multiplyScalar(Math.exp(-h * 0.15));
    return touching;
  }
  update(dt) {
    this.t += dt;
    if (this.state === 'right') {
      // stand it back up: swing to upright about its own heading, set it down on the ground
      this.righting = Math.min(1, this.righting + dt / 1.1);
      const s = this.righting * this.righting * (3 - 2 * this.righting);
      this.obj.quaternion.copy(this.q0).slerp(this.qUp, s);
      const gy = groundHeight(this.o0.x, this.o0.z);
      this.obj.position.set(this.o0.x, this.o0.y + (gy - this.o0.y) * s, this.o0.z);
      if (this.righting >= 1) { this.state = 'done'; this.onDone?.(this); }
      this.onStep?.(this, dt);
      return;
    }
    if (this.state === 'rest') {
      this.t += 0;
      this.restT += dt;
      if (this.restT > this.hold) this.beginRighting();
      this.onStep?.(this, dt);
      return;
    }
    const n = Math.max(1, Math.ceil(dt / (1 / 150)));
    const h = Math.min(dt, 0.05) / n;
    let touching = false;
    for (let i = 0; i < n; i++) touching = this.step(h) || touching;
    // walls, houses and trees stop it too
    const q = { x: this.p.x, z: this.p.z };
    resolveCollisions(q, this.radius, this.p.y - this.half.y);
    const dx = q.x - this.p.x, dz = q.z - this.p.z, dl = Math.hypot(dx, dz);
    if (dl > 1e-5) {
      const nx = dx / dl, nz = dz / dl, vn = this.v.x * nx + this.v.z * nz;
      if (vn < 0) { this.v.x -= 1.3 * vn * nx; this.v.z -= 1.3 * vn * nz; this.w.multiplyScalar(0.7); }
      this.p.x = q.x; this.p.z = q.z;
    }
    // keep from sinking through on very steep ground
    const gc = groundHeight(this.p.x, this.p.z);
    if (this.p.y < gc - 0.2) { this.p.y = gc; if (this.v.y < 0) this.v.y = 0; }
    this.sync();
    if (touching && this.v.length() < 0.35 && this.w.length() < 0.5) this.still += dt; else this.still = 0;
    if (this.still > 0.6 || this.t > 14) { this.state = 'rest'; this.restT = 0; this.v.set(0, 0, 0); this.w.set(0, 0, 0); }
    this.onStep?.(this, dt);
  }
  sync() {
    this.obj.quaternion.copy(this.q);
    this.obj.position.copy(this.p).sub(_r.copy(this.com).applyQuaternion(this.q));
  }
  beginRighting() {
    this.state = 'right';
    this.righting = 0;
    this.q0 = this.obj.quaternion.clone();
    this.o0 = this.obj.position.clone();
    // heading: the body's forward axis flattened; if it's pointing straight up, use its up axis instead
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.q);
    if (Math.hypot(f.x, f.z) < 0.2) f.set(0, 1, 0).applyQuaternion(this.q);
    this.yaw = Math.atan2(f.x, f.z);
    this.qUp = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw);
  }
  // where the body's origin will end up, for the owner to re-park things there
  get origin() { return this.obj.position; }
}

export class Crashes {
  constructor() { this.bodies = []; }
  add(obj, opts) { const b = new Body(obj, opts); this.bodies.push(b); return b; }
  update(dt) {
    for (const b of this.bodies) b.update(dt);
    this.bodies = this.bodies.filter((b) => b.state !== 'done');
  }
}

// how each kind of thing behaves as a loose body (box half-size, centre, mass)
export const SHAPES = {
  bicycle: { half: [0.12, 0.42, 0.85], com: [0, 0.5, 0], mass: 18 },
  moped: { half: [0.24, 0.42, 0.85], com: [0, 0.5, 0.05], mass: 80 },
  scooter: { half: [0.3, 0.45, 0.85], com: [0, 0.55, 0], mass: 100 },
  auto: { half: [0.7, 0.85, 1.35], com: [0, 0.9, -0.1], mass: 350 },
  erick: { half: [0.62, 0.9, 1.4], com: [0, 0.95, -0.2], mass: 420 },
  car: { half: [0.8, 0.68, 1.72], com: [0.33, 0.72, 0], mass: 800 },
  minibus: { half: [1.12, 1.2, 3.35], com: [0.55, 1.32, 0], mass: 3500 },
  person: { half: [0.22, 0.8, 0.14], com: [0, 0.82, 0], mass: 65 },
  bus: { half: [1.25, 1.5, 4.5], com: [0, 1.6, 0], mass: 7000 },
  jeep: { half: [0.9, 0.9, 2.1], com: [0, 1.0, 0], mass: 1800 },
};
export function shapeOf(kind, over = {}) {
  const s = { ...SHAPES[kind], ...over };
  return { half: new THREE.Vector3(...s.half), com: new THREE.Vector3(...s.com), mass: s.mass };
}
