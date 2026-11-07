// Village animals built from smooth, sculpted pieces: pariah dogs, goats (with kids), hens and a rooster,
// and humped zebu cows. Each has a small procedural rig and its own little behaviour.
import * as THREE from 'three';
import { layout, roadX, heightAt, groundHeight, resolveCollisions, localToWorld, riverDist, riverX, riverSlope, RIVER_HALF, WATER_Y, TEA } from './world.js';
import { Puffs } from './particles.js';
import { WATER, warp } from './world.js';
import { rng } from './noise.js';
import { lathe, limb, limbZ, bodyZ, ellipsoid, taperTube, furMat } from './shapes.js';

const mat = (c, r = 0.9) => (r >= 0.85 ? furMat(c, { rough: r }) : new THREE.MeshStandardMaterial({ color: c, roughness: r }));
const coatM = (c) => furMat(c, { rough: 0.82, short: true }); // a short, sleek coat (cattle, donkeys, deer, dogs)
function part(geo, m, parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent.add(o);
  return o;
}
const damp = (dt, r) => 1 - Math.exp(-dt * r);
const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;

// Merge the plain mesh children of every node, per material: far fewer draw calls, same look.
export function consolidate(root) {
  const nodes = [];
  root.traverse((o) => nodes.push(o));
  for (const n of nodes) {
    const buckets = new Map();
    for (const c of n.children) {
      if (!c.isMesh || c.userData.keep || c.isSprite || c.children.length) continue;
      if (!buckets.has(c.material)) buckets.set(c.material, []);
      buckets.get(c.material).push(c);
    }
    for (const [m, list] of buckets) {
      if (list.length < 2) continue;
      const geos = list.map((c) => {
        c.updateMatrix();
        // keep shared vertices shared: merging as indexed geometry uses a fraction of the memory
        const g = c.geometry.clone().applyMatrix4(c.matrix);
        if (!g.index) { const n = g.attributes.position.count, idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        return g;
      });
      const merged = new THREE.Mesh(mergeGeos(geos), m);
      merged.castShadow = true;
      for (const c of list) n.remove(c);
      n.add(merged);
    }
  }
}
function mergeGeos(geos) {
  let count = 0;
  for (const g of geos) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  let o = 0, icount = 0;
  for (const g of geos) icount += g.index ? g.index.count : g.attributes.position.count;
  const idx = new (count > 65535 ? Uint32Array : Uint16Array)(icount);
  let io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    const n = g.attributes.position.count;
    if (g.index) { const src = g.index.array; for (let i = 0; i < src.length; i++) idx[io++] = src[i] + o; }
    else for (let i = 0; i < n; i++) idx[io++] = i + o;
    o += n;
  }
  const out = new THREE.BufferGeometry();
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

// Natural motion on top of any gait: the body rolls and pitches with each step, the head stays steady
// (counter-bobbing against the body), and the chest rises and falls with breathing.
export function gaitPolish(a, dt, legH) {
  a._t = (a._t ?? Math.random() * 10) + dt;
  const walk = Math.min(1, (a.speed ?? 0) * 0.9);
  const ph = a.phase ?? 0;
  a._roll = (a._roll ?? 0) + ((Math.sin(ph) * 0.045 * walk) - (a._roll ?? 0)) * Math.min(1, dt * 12);
  a.body.rotation.z = a._roll;
  a.body.rotation.x = (a.body.rotation.x ?? 0) * 0.5 + Math.sin(ph * 2) * 0.02 * walk;
  if (a.neck) a.neck.rotation.x += -Math.sin(ph * 2) * 0.05 * walk;
  if (a.head) a.head.rotation.z = -a._roll * 0.8;
  const breathe = Math.sin(a._t * (1.4 + walk * 2)) * 0.012 * (1 - walk * 0.5);
  a.body.scale.set(1 + breathe * 0.6, 1 + breathe, 1);
  if (a.tail) a.tail.rotation.y = Math.sin(a._t * 1.7 + ph) * 0.12 * (1 + walk);
  // feet stay flat: the fetlock unbends against the swing of the leg above (and folds when lying down)
  if (a.legs) for (const l of a.legs) if (l.ankle) {
    const sum = l.hip.rotation.x + l.knee.rotation.x;
    l.ankle.rotation.x = sum > 1.2 ? -sum * 0.5 : -sum * (l.front ? 0.55 : 0.85) + Math.max(0, l.knee.rotation.x) * (l.front ? 0.9 : 0.3);
  }
  void legH;
}

// ---------------- generic four-legged rig ----------------
// A sculpted barrel (withers, a dip behind them, the croup, a deep chest and a tucked-up flank), muscled
// shoulders and haunches, and three-jointed legs with real angulation: the hind leg's stifle points forward
// and the hock back, the cannons stand upright, pasterns slope to cloven hooves, a solid hoof or a paw.
// hip & knee rotations are driven by each animal's gait; the ankle keeps the foot flat (see gaitPolish).
function sculptBarrel(geo, L, r, o) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = z / (L / 2); // -1 rump … +1 chest
    const up = y / r;
    // withers: a rise over the shoulders; the back dips a little behind them; the croup rounds over the hips
    if (up > 0) y += r * up * up * (0.16 * Math.exp(-((t - 0.62) ** 2) / 0.04) * (o.withers ?? 1) - 0.05 * Math.exp(-((t - 0.1) ** 2) / 0.08) + 0.08 * Math.exp(-((t + 0.62) ** 2) / 0.05));
    // a deeper chest, a tucked flank before the hind legs
    if (up < 0) { y *= 1 + 0.12 * Math.exp(-((t - 0.45) ** 2) / 0.08) - (o.tuck ?? 0.18) * Math.exp(-((t + 0.42) ** 2) / 0.05); x *= 1 - 0.1 * Math.exp(-((t + 0.42) ** 2) / 0.05); }
    // the ribcage is wider than the loin
    x *= 1 + 0.06 * Math.exp(-((t - 0.25) ** 2) / 0.1) - 0.05 * Math.exp(-((t + 0.25) ** 2) / 0.05);
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}
export function quadruped(o) {
  const { L, r, legH, legR, coat, belly = coat, hoof, deep = 1.1, neckLen, neckTilt = 0.7, neckR = r * 0.45 } = o;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = legH;
  root.add(body);
  const prof = [[0, -L / 2 - r * 0.42], [r * 0.62, -L / 2 - r * 0.25], [r * 0.9, -L / 2 + r * 0.1], [r * 0.96, -L / 2 + r * 0.45], [r * 0.92, -L * 0.1], [r * 0.95, L * 0.1], [r * 1.0, L * 0.3], [r * 0.92, L / 2 - r * 0.1], [r * 0.6, L / 2 + r * 0.25], [0, L / 2 + r * 0.38]];
  part(sculptBarrel(bodyZ(prof, 26).scale(o.wide ?? 0.92, deep, 1), L, r * deep, o), coat, body);
  if (belly !== coat) part(ellipsoid(r * 0.66, r * 0.4, L * 0.4, 20, 10), belly, body, 0, -r * 0.55, 0.04);
  const hipDrop = r * 0.35;
  const total = legH - hipDrop;
  const paw = hoof === 'paw';
  const sock = o.sock ?? coat;
  const hoofM = paw ? sock : mat(hoof, 0.45);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const front = sz > 0;
    const hip = new THREE.Group();
    hip.position.set(sx * r * 0.5, -hipDrop, front ? L / 2 - r * 0.45 : -(L / 2 - r * 0.6));
    body.add(hip);
    // shoulder blade / haunch: big muscle masses that blend the leg into the body
    if (front) {
      const sh = part(ellipsoid(r * 0.24, r * 0.6, r * 0.36, 14, 10), coat, hip, sx * r * 0.02, r * 0.34, r * 0.02);
      sh.rotation.x = -0.35;
    } else {
      // the haunch: one muscle mass from the hip down over the stifle to the top of the gaskin
      part(ellipsoid(r * 0.3, r * 0.62, r * 0.55, 14, 10), coat, hip, -sx * r * 0.04, r * 0.3, -r * 0.05);
      const th = part(ellipsoid(r * 0.3, r * 0.7, r * 0.45, 14, 10), coat, hip, sx * r * 0.04, -r * 0.4, r * 0.06);
      th.rotation.x = -0.15;
    }
    // the upper bone (humerus / femur) sits inside the body, ending at the elbow / stifle on the belly line;
    // below it the forearm / gaskin, then the cannon and a sloping pastern down to the foot
    const belly = r * deep * 0.92 - hipDrop;
    const a0 = front ? 0.32 : -0.38, a1 = front ? -0.04 : 0.3, a2 = front ? 0.02 : -0.04, a3 = paw ? -0.35 : -0.6;
    const l0 = Math.max(0.01, belly / Math.cos(a0));
    const rest = total - belly;
    const fa = front ? 0.5 : 0.46, fp = paw ? 0.1 : 0.13;
    const l3 = rest * fp / Math.cos(a3);
    const l1 = (rest * fa) / Math.cos(a1), l2 = (rest * (1 - fa - fp)) / Math.cos(a2);
    const end = (l, a) => [-Math.cos(a) * l, -Math.sin(a) * l];
    // upper bone: thick muscle, mostly hidden inside the barrel
    part(limb(legR * (front ? 2.3 : 2.9), legR * (front ? 1.5 : 1.7), l0, 12).rotateX(a0), coat, hip);
    const knee = new THREE.Group();
    { const [y, z] = end(l0, a0); knee.position.set(0, y, z); }
    hip.add(knee);
    part(new THREE.SphereGeometry(legR * (front ? 1.45 : 1.6), 10, 8), coat, knee);
    // forearm / gaskin: muscled at the top, slimming to the knee / hock
    part(limb(legR * (front ? 1.45 : 1.3), legR * 0.86, l1, 12).rotateX(a1), coat, knee);
    const ankle = new THREE.Group();
    { const [y, z] = end(l1, a1); ankle.position.set(0, y, z); }
    knee.add(ankle);
    part(new THREE.SphereGeometry(legR * 0.98, 10, 8).scale(1, 1.15, 1.1), sock, ankle);
    // cannon: slim and straight, a little knob at the fetlock, then the pastern
    part(limb(legR * 0.8, legR * 0.72, l2, 10).rotateX(a2), sock, ankle);
    const [fy0, fz0] = end(l2, a2);
    part(new THREE.SphereGeometry(legR * 0.85, 8, 6), sock, ankle, 0, fy0, fz0);
    part(limb(legR * 0.74, legR * 0.7, l3, 10).rotateX(a3), sock, ankle, 0, fy0, fz0);
    const [py, pz] = end(l3, a3);
    const fy = fy0 + py, fz = fz0 + pz;
    if (paw) {
      part(ellipsoid(legR * 1.1, legR * 0.6, legR * 1.45, 12, 8), sock, ankle, 0, fy - legR * 0.05, fz + legR * 0.4);
      for (let k = 0; k < 4; k++) part(new THREE.SphereGeometry(legR * 0.4, 8, 6), sock, ankle, (k - 1.5) * legR * 0.55, fy - legR * 0.22, fz + legR * 1.3 - Math.abs(k - 1.5) * legR * 0.22);
    } else if (o.solid) {
      part(lathe([[legR * 1.12, 0], [legR * 1.05, legR * 0.8], [legR * 0.82, legR * 1.4]], 12), hoofM, ankle, 0, fy - legR * 0.7, fz + legR * 0.15).rotation.x = -0.2;
    } else {
      // cloven: two toes with a cleft between them, dew claws behind
      for (const tx of [-1, 1]) {
        const toe = part(ellipsoid(legR * 0.52, legR * 0.7, legR * 1.1, 10, 8), hoofM, ankle, tx * legR * 0.46, fy - legR * 0.4, fz + legR * 0.45);
        toe.rotation.x = -0.25;
        part(new THREE.SphereGeometry(legR * 0.2, 6, 5), hoofM, ankle, tx * legR * 0.3, fy + legR * 0.75, fz - legR * 0.6);
      }
    }
    const groups = [hip, knee, ankle];
    legs.push({ hip, knee: groups[1], ankle: groups[2], front, ph: sx * sz > 0 ? 0 : Math.PI });
  }
  const neck = new THREE.Group();
  neck.position.set(0, r * 0.35, L / 2 - r * 0.05);
  body.add(neck);
  // the neck: thick where it meets the chest, a throat line, tapering to the head
  part(limb(neckR * 1.08, neckR * 0.78, neckLen, 14).rotateX(Math.PI + neckTilt), coat, neck);
  part(ellipsoid(neckR * 1.08, neckR * 1.15, neckR * 1.1, 14, 10), coat, neck, 0, -neckR * 0.35, -neckR * 0.45);
  const head = new THREE.Group();
  head.position.set(0, Math.cos(neckTilt) * neckLen, Math.sin(neckTilt) * neckLen);
  neck.add(head);
  const tail = new THREE.Group();
  tail.position.set(0, r * 0.5, -L / 2 - r * 0.15);
  body.add(tail);
  return { root, body, legs, neck, head, tail };
}

// a head built as one lofted shape: cranium, the stop, the muzzle and a soft chin, with a nose pad
export function headShape({ len, w, h, muzzleW = w * 0.62, muzzleH = h * 0.6, drop = 0.25, nose = null, coat, noseM, cheek = 1 }) {
  const g = new THREE.Group();
  const rings = 14, seg = 18;
  const pts = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings; // 0 back of skull … 1 nose tip
    const z = -len * 0.25 + t * len;
    const ease = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
    const rw = (t < 0.08 ? Math.sin((t / 0.08) * Math.PI / 2) : 1) * (muzzleW + (w - muzzleW) * ease) * (1 + 0.12 * cheek * Math.exp(-((t - 0.32) ** 2) / 0.01));
    const rh = (t < 0.08 ? Math.sin((t / 0.08) * Math.PI / 2) : 1) * (muzzleH + (h - muzzleH) * ease) * (t > 0.95 ? Math.sqrt(Math.max(0.05, (1 - t) / 0.05)) : 1);
    const cy = -drop * h * Math.max(0, t - 0.35) * 1.4;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const sy = Math.sin(a), cx = Math.cos(a);
      // flatter on top of the face, rounder under the jaw
      const yy = sy > 0 ? sy * (1 - 0.18 * t) : sy;
      pts.push(cx * rw, cy + yy * rh, z);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pts.length / 3) * 2), 2));
  part(geo, coat, g);
  if (noseM) part(ellipsoid(muzzleW * 0.7, muzzleH * 0.55, len * 0.06, 12, 8), noseM, g, 0, -drop * h * 0.85 + muzzleH * 0.15, -len * 0.25 + len * 0.99);
  void nose;
  g.userData.tip = new THREE.Vector3(0, -drop * h * 0.9, len * 0.75);
  return g;
}

export function eyes(head, x, y, z, s = 0.012) {
  const m = mat('#120d0a', 0.25);
  for (const sx of [-1, 1]) part(new THREE.SphereGeometry(s, 8, 6), m, head, sx * x, y, z);
}

// ---------------- dog ----------------
export class Dog {
  constructor(color, accent, follower, start, home = null) {
    this.home = home;
    const fur = coatM(color), acc = coatM(accent), dark = mat('#141110', 0.4);
    const q = quadruped({ L: 0.44, r: 0.12, legH: 0.45, legR: 0.024, coat: fur, belly: acc, hoof: 'paw', sock: fur, deep: 1.2, tuck: 0.35, neckLen: 0.17, neckTilt: 0.6, neckR: 0.058 });
    Object.assign(this, q);
    const h = this.head;
    // an Indian pariah dog: a wedge-shaped head with a clear stop, a long pointed muzzle, tall pricked ears
    const hs = headShape({ len: 0.22, w: 0.058, h: 0.058, muzzleW: 0.03, muzzleH: 0.028, drop: 0.12, coat: fur, noseM: dark });
    hs.position.set(0, 0.01, 0.0); hs.rotation.x = 0.08;
    h.add(hs);
    part(ellipsoid(0.03, 0.012, 0.05), acc, hs, 0, -0.035, 0.09); // pale under the jaw
    for (const s of [-1, 1]) {
      const ear = part(new THREE.ConeGeometry(0.03, 0.08, 10).scale(1, 1, 0.38), fur, hs, s * 0.038, 0.07, -0.025);
      ear.rotation.set(-0.15, 0, -s * 0.22);
      part(new THREE.ConeGeometry(0.018, 0.05, 8).scale(1, 1, 0.2), mat('#c8988a', 0.7), hs, s * 0.038, 0.066, -0.019).rotation.set(-0.15, 0, -s * 0.22);
    }
    eyes(hs, 0.036, 0.022, 0.045, 0.01);
    part(taperTube([[0, 0, 0], [0, 0.08, -0.05], [0, 0.15, -0.02], [0, 0.16, 0.05]], 0.024, 0.01), fur, this.tail);
    consolidate(this.root);
    this.follower = follower;
    this.p = { ...start };
    this.y = heightAt(start.x, start.z);
    this.facing = Math.random() * 6;
    this.speed = 0;
    this.phase = 0;
    this.t = Math.random() * 10;
    this.state = 'rest';
    this.timer = 3 + Math.random() * 6;
    this.target = null;
    this.restB = 1;
    this.R = rng(follower ? 3 : 9);
    this.barkT = 0;
    this.barkCool = 0;
  }
  bark() { this.barkT = 0.9; this.barkCool = 5 + this.R() * 7; }
  pickTarget() {
    if (this.home) {
      for (let i = 0; i < 20; i++) {
        const a = this.R() * 6.28, d = this.R() * 22;
        const p = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d };
        const q = { ...p };
        resolveCollisions(q, 0.4);
        if (Math.hypot(q.x - p.x, q.z - p.z) < 0.01) return p;
      }
      return { x: this.home.x, z: this.home.z };
    }
    for (let i = 0; i < 30; i++) {
      const z = (this.R() * 2 - 1) * 70, x = roadX(z) + (this.R() * 2 - 1) * 14;
      const p = { x, z };
      const q = { ...p };
      resolveCollisions(q, 0.4);
      if (Math.hypot(q.x - p.x, q.z - p.z) < 0.01) return p;
    }
    return { x: roadX(0), z: 0 };
  }
  update(dt, boy) {
    this.t += dt;
    let want = 0;
    const bd = Math.hypot(boy.x - this.p.x, boy.z - this.p.z);
    if (this.follower && bd < 22 && this.state !== 'rest') this.state = 'follow';
    if (this.state === 'rest') {
      this.timer -= dt;
      if (this.timer < 0) { this.state = 'wander'; this.target = this.pickTarget(); this.stuck = 0; }
    } else if (this.state === 'follow') {
      if (bd > 26) { this.state = 'wander'; this.target = this.pickTarget(); }
      else {
        const tx = boy.x - Math.sin(boy.facing) * 2.0 + Math.cos(boy.facing) * 0.9;
        const tz = boy.z - Math.cos(boy.facing) * 2.0 - Math.sin(boy.facing) * 0.9;
        this.target = { x: tx, z: tz };
        const d = Math.hypot(tx - this.p.x, tz - this.p.z);
        want = d > 5 ? 2.8 : d > 1.2 ? 1.2 : 0;
        if (want === 0 && boy.speed < 0.1 && this.R() < dt * 0.05) { this.state = 'rest'; this.timer = 15 + this.R() * 15; }
      }
    } else {
      const d = Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z);
      want = d > 6 ? 1.7 : 1.0;
      this.stuck = (this.stuck || 0) + dt;
      if (d < 0.6 || this.stuck > 25) { this.state = 'rest'; this.timer = 12 + this.R() * 30; want = 0; }
    }
    this.speed += (want - this.speed) * damp(dt, 4);
    if (this.speed > 0.05 && this.target) {
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z, d = Math.hypot(dx, dz) || 1;
      this.p.x += (dx / d) * this.speed * dt;
      this.p.z += (dz / d) * this.speed * dt;
      resolveCollisions(this.p, 0.3, undefined, true);
      this.facing += wrap(Math.atan2(dx, dz) - this.facing) * damp(dt, 5);
    }
    const gy = groundHeight(this.p.x, this.p.z);
    this.y += (gy - this.y) * damp(dt, 10);
    this.root.position.set(this.p.x, this.y, this.p.z);
    this.root.rotation.y = this.facing;

    const resting = this.state === 'rest' && this.speed < 0.1 ? 1 : 0;
    this.restB += (resting - this.restB) * damp(dt, 2.5);
    const r = this.restB;
    this.phase += this.speed * dt * 7.5;
    const amp = Math.min(1, this.speed) * 0.55;
    for (const l of this.legs) {
      const ph = this.phase + l.ph;
      const walkX = Math.sin(ph) * amp, walkK = Math.max(0, -Math.cos(ph)) * 0.7 * Math.min(1, this.speed);
      const restX = l.front ? -1.45 : -1.25, restK = l.front ? 0.0 : 2.4;
      l.hip.rotation.x = walkX * (1 - r) + restX * r;
      l.knee.rotation.x = walkK * (1 - r) + restK * r;
    }
    this.body.position.y = 0.43 * (1 - r) + 0.16 * r + Math.abs(Math.sin(this.phase)) * 0.02 * (1 - r);
    const lift = Math.max(0, Math.sin(this.t * 0.15)) > 0.8 ? 1 : 0;
    this.neck.rotation.x = r * (0.5 - lift * 0.5) + (1 - r) * Math.sin(this.t * 0.8) * 0.05;
    // barking: head up and a little jolt on each bark
    if (this.barkT > 0) {
      this.barkT -= dt;
      const j = Math.max(0, Math.sin(this.barkT * 26));
      this.neck.rotation.x = -0.35 - j * 0.25;
      this.body.position.y += j * 0.015;
      this.facing += wrap(Math.atan2(boy.x - this.p.x, boy.z - this.p.z) - this.facing) * damp(dt, 6);
    }
    this.neck.rotation.y = Math.sin(this.t * 0.3) * 0.4 * (r * lift + (1 - r) * 0.3);
    this.tail.rotation.z = Math.sin(this.t * (this.state === 'follow' ? 9 : 3)) * (this.state === 'follow' ? 0.5 : 0.2);
    gaitPolish(this, dt, 0.43);
  }
}

// ---------------- zebu cow ----------------
export function makeCow(color) {
  const body = coatM(color), dark = mat('#2a211b', 0.6), pink = mat('#a88478', 0.6), horn = mat('#d8cbb0', 0.5);
  const shade = new THREE.Color(color).multiplyScalar(0.82);
  const coat2 = coatM('#' + shade.getHexString());
  const q = quadruped({ L: 1.25, r: 0.36, legH: 0.95, legR: 0.05, coat: body, sock: body, hoof: '#2a211b', deep: 1.18, tuck: 0.1, withers: 0.6, neckLen: 0.4, neckTilt: 1.0, neckR: 0.17 });
  // the zebu's hump over the shoulders and a loose dewlap hanging under the neck
  part(ellipsoid(0.13, 0.17, 0.2), coat2, q.body, 0, 0.3, 0.4);
  const dew = part(ellipsoid(0.03, 0.13, 0.2), body, q.neck, 0, -0.1, 0.2); dew.rotation.x = 0.9;
  const h = q.head;
  // a long face: broad forehead, the muzzle squarish and moist, the nose pad wide
  const hs = headShape({ len: 0.5, w: 0.11, h: 0.12, muzzleW: 0.085, muzzleH: 0.075, drop: 0.3, coat: body, noseM: pink });
  hs.rotation.x = 0.45;
  h.add(hs);
  for (const sx of [-1, 1]) {
    part(taperTube([[0, 0, 0], [sx * 0.06, 0.07, -0.01], [sx * 0.09, 0.17, 0.02], [sx * 0.07, 0.25, 0.06]], 0.03, 0.008), horn, hs, sx * 0.07, 0.1, -0.06);
    const ear = part(ellipsoid(0.1, 0.022, 0.045), body, hs, sx * 0.15, 0.04, -0.07);
    ear.rotation.z = sx * -0.45;
    for (const ny of [0]) part(new THREE.SphereGeometry(0.012, 8, 6), dark, hs, sx * 0.03, -0.12 + ny, 0.37); // nostrils
  }
  eyes(hs, 0.1, 0.05, 0.03, 0.018);
  const tail = q.tail;
  tail.position.y += 0.06;
  part(taperTube([[0, 0, 0], [0, -0.2, -0.08], [0, -0.5, -0.06], [0, -0.75, -0.04]], 0.028, 0.015), body, tail);
  part(ellipsoid(0.05, 0.12, 0.05), dark, tail, 0, -0.84, -0.04);
  consolidate(q.root);
  // gentle standing pose
  for (const l of q.legs) { l.hip.rotation.x = l.front ? 0.03 : -0.03; }
  return { g: q.root, neck: q.neck, tail, head: h, legs: q.legs, body: q.body };
}

// ---------------- goat ----------------
const GOAT_COATS = [['#1d1a19', '#2a2524'], ['#5a3a26', '#e8e0d2'], ['#efe9dd', '#d9cdb8'], ['#7a5236', '#2a1f1a'], ['#2a2422', '#e9e2d6']];

export class Goat {
  constructor(coat, scale, home, R, mother = null, species = 'goat') {
    this.species = species;
    if (species === 'donkey') this.buildDonkey(coat);
    else if (species === 'camel') this.buildCamel(coat);
    else if (species === 'deer') this.buildDeer(coat);
    else if (species === 'cat') this.buildCat(coat);
    else if (species === 'sheep') this.buildSheep(coat, mother);
    else if (species === 'cow') this.buildCow(coat);
    else this.buildGoat(coat, mother);
    if (species !== 'cow') consolidate(this.root);
    this.root.scale.setScalar(scale);
    this.scale = scale;
    this.home = home;
    this.R = R;
    this.mother = mother;
    this.init(home, R);
  }
  buildDeer(coat) {
    // chital: a russet coat dappled with white spots, white belly and throat, the stag with tall antlers
    const spot = document.createElement('canvas');
    spot.width = 128; spot.height = 256;
    const sg = spot.getContext('2d');
    sg.fillStyle = '#b8743a'; sg.fillRect(0, 0, 128, 256);
    sg.fillStyle = '#f2e6d0';
    for (let i = 0; i < 90; i++) { const x = 20 + Math.random() * 88, y = Math.random() * 256; sg.beginPath(); sg.ellipse(x, y, 2.5, 3.5, 0, 0, 7); sg.fill(); }
    const tex = new THREE.CanvasTexture(spot); tex.colorSpace = THREE.SRGBColorSpace;
    const c = furMat('#ffffff', { rough: 0.85, map: tex, short: true }), plain = coatM('#b8743a'), pale = coatM('#f2e8d8'), dark = mat('#2a2220', 0.5);
    const q = quadruped({ L: 0.74, r: 0.16, legH: 0.8, legR: 0.022, coat: c, belly: pale, hoof: '#2a2420', sock: plain, deep: 1.15, tuck: 0.3, neckLen: 0.34, neckTilt: 0.42, neckR: 0.062 });
    Object.assign(this, q);
    this.legH = 0.8; this.restH = 0.28; this.cr = 0.35;
    const h = this.head;
    // a fine, tapering head with big ears, a white throat patch and a dark muzzle
    const hs = headShape({ len: 0.27, w: 0.055, h: 0.06, muzzleW: 0.028, muzzleH: 0.032, drop: 0.28, coat: plain, noseM: dark });
    hs.rotation.x = 0.5;
    h.add(hs);
    part(ellipsoid(0.035, 0.03, 0.03), pale, hs, 0, -0.06, 0.04);
    eyes(hs, 0.048, 0.025, 0.04, 0.012);
    for (const sx of [-1, 1]) { const e = part(ellipsoid(0.022, 0.075, 0.035), plain, hs, sx * 0.055, 0.06, -0.05); e.rotation.set(-0.2, 0, -sx * 0.75); part(ellipsoid(0.014, 0.05, 0.01), pale, hs, sx * 0.058, 0.06, -0.032).rotation.set(-0.2, 0, -sx * 0.75); }
    if (coat[2]) for (const sx of [-1, 1]) {
      // the stag's three-tined antlers
      part(taperTube([[0, 0, 0], [sx * 0.04, 0.15, -0.05], [sx * 0.08, 0.32, -0.04], [sx * 0.06, 0.45, 0.02]], 0.013, 0.005), mat('#6a5a44', 0.7), hs, sx * 0.03, 0.06, -0.06);
      part(taperTube([[0, 0, 0], [sx * 0.02, 0.08, 0.06], [sx * 0.03, 0.14, 0.08]], 0.009, 0.004), mat('#6a5a44', 0.7), hs, sx * 0.05, 0.2, -0.1);
      part(taperTube([[0, 0, 0], [sx * 0.01, 0.04, 0.05], [sx * 0.01, 0.06, 0.09]], 0.009, 0.004), mat('#6a5a44', 0.7), hs, sx * 0.035, 0.08, -0.06);
    }
    part(ellipsoid(0.03, 0.06, 0.02), pale, this.tail, 0, -0.03, -0.01);
  }
  buildSheep(coat, mother) {
    // a Deccani sheep: a thick, lumpy fleece, a bare dark face with long drooping ears, thin dark legs
    const wool = furMat(coat[0], { rough: 1 }), face = mat(coat[1], 0.8), dark = mat('#1e1a18', 0.5);
    const q = quadruped({ L: 0.56, r: 0.2, legH: 0.46, legR: 0.02, coat: wool, belly: wool, hoof: '#2a2420', sock: face, deep: 1.12, tuck: 0.05, neckLen: 0.15, neckTilt: 0.62, neckR: 0.085, wide: 1.05 });
    Object.assign(this, q);
    this.legH = 0.46; this.restH = 0.18; this.cr = 0.32;
    // the fleece: overlapping tufts all over the back and sides
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, zz = -0.26 + (i % 5) * 0.13;
      part(ellipsoid(0.1 + (i % 3) * 0.015, 0.09, 0.11), wool, this.body, Math.cos(a) * 0.13, 0.06 + Math.abs(Math.sin(a)) * 0.08, zz);
    }
    part(ellipsoid(0.12, 0.1, 0.1), wool, this.neck, 0, 0.0, 0.04);
    const h = this.head;
    const hs = headShape({ len: 0.2, w: 0.052, h: 0.058, muzzleW: 0.034, muzzleH: 0.038, drop: 0.3, coat: face, noseM: dark });
    hs.rotation.x = 0.6;
    h.add(hs);
    eyes(hs, 0.045, 0.022, 0.03, 0.01);
    for (const sx of [-1, 1]) { const ear = part(ellipsoid(0.018, 0.07, 0.03), face, hs, sx * 0.055, -0.005, -0.02); ear.rotation.set(0.2, 0, sx * 1.0); }
    part(ellipsoid(0.07, 0.05, 0.06), wool, hs, 0, 0.05, -0.04); // a woolly cap
    part(ellipsoid(0.05, 0.07, 0.05), wool, this.tail, 0, -0.04, -0.02);
    void mother;
  }
  buildCow(coat) {
    const c = makeCow(coat[0]);
    this.root = c.g; this.body = c.body; this.legs = c.legs; this.neck = c.neck; this.head = c.head; this.tail = c.tail;
    this.legH = 0.95; this.restH = 0.4; this.cr = 0.55;
  }
  buildCat(coat) {
    const c = coatM(coat[0]), acc = coatM(coat[1]), pink = mat('#d8a09a', 0.8);
    const q = quadruped({ L: 0.32, r: 0.07, legH: 0.22, legR: 0.014, coat: c, belly: acc, hoof: 'paw', sock: c, deep: 1.1, tuck: 0.3, neckLen: 0.06, neckTilt: 0.5, neckR: 0.042 });
    Object.assign(this, q);
    this.legH = 0.22; this.restH = 0.08; this.cr = 0.15;
    const h = this.head;
    // a round cat's head: short muzzle with whisker pads, big eyes, triangular ears
    part(ellipsoid(0.05, 0.045, 0.047, 18, 12), c, h, 0, 0.02, 0);
    for (const sx of [-1, 1]) part(ellipsoid(0.017, 0.014, 0.016), acc, h, sx * 0.012, 0.0, 0.042);
    part(ellipsoid(0.014, 0.01, 0.012), acc, h, 0, -0.012, 0.038);
    part(new THREE.SphereGeometry(0.007, 6, 4), pink, h, 0, 0.01, 0.052);
    const eyeM = mat('#b8c24a', 0.2);
    for (const sx of [-1, 1]) { part(ellipsoid(0.011, 0.01, 0.006), eyeM, h, sx * 0.02, 0.026, 0.04); part(ellipsoid(0.003, 0.009, 0.004), mat('#0a0806', 0.2), h, sx * 0.02, 0.026, 0.045); }
    for (const sx of [-1, 1]) { const e = part(new THREE.ConeGeometry(0.019, 0.042, 4).scale(1, 1, 0.5), c, h, sx * 0.028, 0.064, -0.005); e.rotation.z = -sx * 0.25; }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const w = part(new THREE.CylinderGeometry(0.0007, 0.0007, 0.06, 3).rotateZ(Math.PI / 2), mat('#f4f0e8', 0.5), h, sx * 0.04, 0.0 - k * 0.005, 0.04); w.rotation.y = -sx * 0.25; w.rotation.z = (k - 1) * 0.15 * sx; }
    part(taperTube([[0, 0, 0], [0, 0.08, -0.06], [0, 0.18, -0.06], [0, 0.24, -0.02]], 0.014, 0.01), c, this.tail);
  }
  buildCamel(coat) {
    const c = mat(coat[0], 0.95), pale = mat('#e2c89a', 0.95), dark = mat('#5a4030', 0.9);
    const q = quadruped({ L: 1.3, r: 0.36, legH: 1.5, legR: 0.055, coat: c, belly: pale, hoof: 'paw', sock: c, deep: 1.05, neckLen: 0.85, neckTilt: 0.75, neckR: 0.13 });
    Object.assign(this, q);
    this.legH = 1.5; this.restH = 0.55; this.cr = 0.8;
    part(ellipsoid(0.3, 0.38, 0.42), c, this.body, 0, 0.42, 0.0); // the hump
    const h = this.head;
    part(ellipsoid(0.11, 0.11, 0.15), c, h, 0, 0.0, 0.02);
    const m = part(limbZ(0.09, 0.07, 0.3, 12), c, h, 0, -0.04, 0.08); m.rotation.x = 0.35;
    part(ellipsoid(0.07, 0.035, 0.05), dark, h, 0, -0.14, 0.36);
    eyes(h, 0.09, 0.04, 0.05, 0.016);
    for (const sx of [-1, 1]) part(ellipsoid(0.02, 0.045, 0.025), c, h, sx * 0.07, 0.11, -0.06);
    part(taperTube([[0, 0, 0], [0, -0.25, -0.05], [0, -0.45, -0.04]], 0.03, 0.02), c, this.tail);
    if (coat[2]) {
      // a decorated saddle: red and gold cloth with tassels, a bead collar
      part(ellipsoid(0.42, 0.12, 0.5), mat('#b8322b', 0.8), this.body, 0, 0.62, 0.0);
      part(ellipsoid(0.44, 0.04, 0.52), mat('#e0a82a', 0.6), this.body, 0, 0.57, 0.0);
      for (let i = 0; i < 6; i++) part(new THREE.SphereGeometry(0.04, 6, 4), mat(['#e0612b', '#2e8b57', '#f2b705'][i % 3], 0.6), this.body, (i % 2 ? 1 : -1) * 0.42, 0.35, -0.3 + Math.floor(i / 2) * 0.3);
      part(new THREE.TorusGeometry(0.15, 0.025, 6, 14).rotateX(Math.PI / 2 - 0.7), mat('#f2b705', 0.5), this.neck, 0, 0.3, 0.3);
    }
  }
  buildDonkey(coat) {
    const c = coatM(coat[0]), pale = coatM('#e6e0d4'), dark = mat('#2e2925', 0.9);
    const q = quadruped({ L: 0.8, r: 0.22, legH: 0.74, legR: 0.04, coat: c, belly: pale, hoof: '#2a2420', solid: true, deep: 1.2, tuck: 0.12, neckLen: 0.36, neckTilt: 0.62, neckR: 0.095 });
    Object.assign(this, q);
    this.legH = 0.74; this.restH = 0.27; this.cr = 0.45;
    const h = this.head;
    // a big, long donkey head: pale muzzle and eye rings, very long ears with dark tips
    const hs = headShape({ len: 0.42, w: 0.082, h: 0.095, muzzleW: 0.062, muzzleH: 0.068, drop: 0.25, coat: c, noseM: dark });
    hs.rotation.x = 0.75;
    h.add(hs);
    part(ellipsoid(0.066, 0.07, 0.1, 16, 10), pale, hs, 0, -0.065, 0.22);
    for (const sx of [-1, 1]) part(new THREE.TorusGeometry(0.018, 0.007, 6, 14).rotateY(Math.PI / 2), pale, hs, sx * 0.078, 0.035, 0.03);
    eyes(hs, 0.08, 0.035, 0.03, 0.014);
    for (const sx of [-1, 1]) {
      const ear = part(ellipsoid(0.03, 0.17, 0.048), c, hs, sx * 0.05, 0.16, -0.08);
      ear.rotation.set(-0.35, 0, -sx * 0.3);
      part(ellipsoid(0.017, 0.05, 0.02), dark, hs, sx * 0.1, 0.31, -0.13).rotation.set(-0.35, 0, -sx * 0.3);
    }
    // stiff dark mane and the shoulder cross stripe
    part(limb(0.035, 0.03, 0.34, 8).rotateX(Math.PI + 0.62), dark, this.neck, 0, 0.07, -0.02);
    part(new THREE.TorusGeometry(0.235, 0.012, 4, 16, Math.PI).rotateY(Math.PI / 2), dark, this.body, 0, 0.0, 0.18).scale.y = 1.15;
    part(taperTube([[0, 0, 0], [0, -0.15, -0.05], [0, -0.38, -0.04]], 0.02, 0.012), c, this.tail);
    part(ellipsoid(0.035, 0.09, 0.035), dark, this.tail, 0, -0.45, -0.04);
    if (coat[2]) {
      // a dhobi's donkey carrying bundles of washing
      for (const sx of [-1, 1]) part(ellipsoid(0.14, 0.13, 0.2), mat(sx < 0 ? '#e9e2d2' : '#c84a3a', 0.95), this.body, sx * 0.24, 0.12, -0.02);
      part(ellipsoid(0.16, 0.06, 0.18), mat('#d8c8a0', 0.95), this.body, 0, 0.27, -0.02);
    }
  }
  buildGoat(coat, mother) {
    const c = mat(coat[0], 0.95), acc = mat(coat[1], 0.95);
    const q = quadruped({ L: 0.54, r: 0.15, legH: 0.5, legR: 0.022, coat: c, belly: acc, hoof: '#2a2420', sock: c, deep: 1.2, tuck: 0.15, neckLen: 0.2, neckTilt: 0.5, neckR: 0.06 });
    Object.assign(this, q);
    this.legH = 0.5; this.restH = 0.17; this.cr = 0.3;
    const h = this.head;
    // a goat's head: a Roman nose, long floppy ears (as Indian goats have), swept-back horns and a beard
    const hs = headShape({ len: 0.24, w: 0.05, h: 0.06, muzzleW: 0.03, muzzleH: 0.036, drop: 0.32, coat: c, noseM: mat('#2a2220', 0.5) });
    hs.rotation.x = 0.55;
    h.add(hs);
    eyes(hs, 0.046, 0.025, 0.035, 0.011);
    for (const sx of [-1, 1]) {
      const ear = part(ellipsoid(0.02, 0.09, 0.04), c, hs, sx * 0.058, -0.01, -0.02);
      ear.rotation.set(0.15, 0, sx * 0.6);
      if (!mother) part(taperTube([[0, 0, 0], [0, 0.05, -0.03], [0, 0.08, -0.09], [0, 0.065, -0.15]], 0.015, 0.004), mat('#5d544a', 0.6), hs, sx * 0.025, 0.055, -0.04);
    }
    if (!mother) part(new THREE.ConeGeometry(0.016, 0.075, 6).rotateX(Math.PI), c, hs, 0, -0.1, 0.1);
    part(limb(0.022, 0.012, 0.08, 8).rotateX(Math.PI - 0.5), c, this.tail);
  }
  init(home, R) {
    this.p = { x: home.x + (R() - 0.5) * 4, z: home.z + (R() - 0.5) * 4 };
    this.y = heightAt(this.p.x, this.p.z);
    this.facing = R() * 6.28;
    this.speed = 0;
    this.phase = 0;
    this.t = R() * 20;
    this.state = 'graze';
    this.timer = 2 + R() * 8;
    this.target = null;
    this.restB = 0;
    this.night = false;
  }
  pick() {
    for (let i = 0; i < 12; i++) {
      const a = this.R() * Math.PI * 2, d = 2 + this.R() * this.home.r;
      const x = this.home.x + Math.cos(a) * d, z = this.home.z + Math.sin(a) * d;
      if (riverDist(x, z) < RIVER_HALF + 3 || heightAt(x, z) < WATER_Y + 0.3) continue;
      return { x, z };
    }
    return { x: this.home.x, z: this.home.z };
  }
  update(dt, boy) {
    this.t += dt;
    let want = 0;
    if (this.night) this.state = 'rest';
    else if (this.state === 'rest') { this.state = 'graze'; this.timer = 3; }
    if (this.leader && !this.night) this.home = this.leader.home;
    if (this.leader && !this.night && this.leader.moving) {
      // on the move with the herd: a loose bunch trailing the herder
      const L = this.leader, sl = this.slot;
      const fx = Math.sin(L.facing), fz = Math.cos(L.facing);
      const tx = L.x - fx * (2.6 + sl.b) + fz * sl.s, tz = L.z - fz * (2.6 + sl.b) - fx * sl.s;
      const d = Math.hypot(tx - this.p.x, tz - this.p.z);
      this.target = { x: tx, z: tz };
      this.state = d > 0.9 ? 'walk' : 'graze';
      want = d > 7 ? 2.0 : d > 0.9 ? Math.min(1.35, 0.35 + d * 0.25) : 0;
      if (this.state === 'graze') this.timer = 1 + this.R() * 3;
    } else if (this.mother && !this.night) {
      const m = this.mother;
      const tx = m.p.x - Math.sin(m.facing) * 0.8 + Math.cos(m.facing) * 0.5, tz = m.p.z - Math.cos(m.facing) * 0.8 - Math.sin(m.facing) * 0.5;
      const d = Math.hypot(tx - this.p.x, tz - this.p.z);
      this.target = { x: tx, z: tz };
      this.state = d > 0.6 ? 'walk' : 'graze';
      want = d > 3 ? 1.6 : d > 0.6 ? 0.7 : 0;
    } else if (this.state === 'graze') {
      this.timer -= dt;
      if (this.timer < 0) { this.state = 'walk'; this.target = this.pick(); this.stuck = 0; }
    } else if (this.state === 'walk') {
      const d = Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z);
      this.stuck = (this.stuck || 0) + dt;
      want = 0.55;
      if (d < 0.4 || this.stuck > 14) { this.state = 'graze'; this.timer = 6 + this.R() * 14; }
    }
    // shy away from the boy: deer bolt from far off, cats dash for cover, the rest just step aside
    const bx = this.p.x - boy.x, bz = this.p.z - boy.z, bd = Math.hypot(bx, bz);
    const shy = this.species === 'deer' ? 15 : this.species === 'cat' ? 3.5 : 1.8;
    if (bd < shy && !this.night) {
      const run = this.species === 'deer' ? 28 : this.species === 'cat' ? 6 : 2.5;
      this.target = { x: this.p.x + (bx / bd) * run, z: this.p.z + (bz / bd) * run };
      this.state = 'walk';
      this.stuck = 0;
      want = this.species === 'deer' ? 7 : this.species === 'cat' ? 4 : 1.4;
    }
    this.speed += (want - this.speed) * damp(dt, 4);
    if (this.speed > 0.04 && this.target) {
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z, d = Math.hypot(dx, dz) || 1;
      if (d > 0.05) {
        this.p.x += (dx / d) * this.speed * dt;
        this.p.z += (dz / d) * this.speed * dt;
        resolveCollisions(this.p, this.cr * this.scale, undefined, true);
        this.facing += wrap(Math.atan2(dx, dz) - this.facing) * damp(dt, 4);
      }
    }
    const gy = groundHeight(this.p.x, this.p.z);
    this.y += (gy - this.y) * damp(dt, 10);
    this.root.position.set(this.p.x, this.y, this.p.z);
    this.root.rotation.y = this.facing;

    const rest = this.state === 'rest' ? 1 : 0;
    this.restB += (rest - this.restB) * damp(dt, 1.5);
    const r = this.restB;
    this.phase += this.speed * dt * 8.5 / this.scale;
    const amp = Math.min(1, this.speed * 1.4) * 0.5;
    for (const l of this.legs) {
      const ph = this.phase + l.ph;
      const wx = Math.sin(ph) * amp, wk = Math.max(0, -Math.cos(ph)) * 0.8 * Math.min(1, this.speed * 1.5);
      // lying down: legs folded beneath
      l.hip.rotation.x = wx * (1 - r) + (l.front ? -1.5 : -1.35) * r;
      l.knee.rotation.x = wk * (1 - r) + (l.front ? 2.9 : 2.6) * r;
    }
    const graze = this.state === 'graze' ? 1 : 0;
    this.grazeB = (this.grazeB ?? 0) + (graze - (this.grazeB ?? 0)) * damp(dt, 2.5);
    const g = this.grazeB * (1 - r);
    const lookUp = Math.sin(this.t * 0.21 + this.p.x) > 0.75 ? 1 : 0;
    this.neck.rotation.x = g * (1.35 - lookUp * 1.2) + Math.sin(this.t * 7) * 0.03 * g + r * 0.15;
    this.neck.rotation.y = Math.sin(this.t * 0.35) * 0.3 * (g + r);
    this.head.rotation.x = g * 0.3 + Math.sin(this.t * 9) * 0.04 * g;
    this.tail.rotation.x = Math.sin(this.t * 6) * 0.25 * (Math.sin(this.t * 0.7) > 0.3 ? 1 : 0.1);
    this.body.position.y = this.legH * (1 - r) + this.restH * r + Math.abs(Math.sin(this.phase)) * 0.015 * (1 - r);
    gaitPolish(this, dt, this.legH);
  }
}

// ---------------- hens ----------------
const HEN_COLS = [['#8a4b22', '#5e2f14'], ['#efe7d8', '#d8ccb5'], ['#2a201c', '#5a2c1c'], ['#b8743a', '#6e3a18'], ['#d9cbb0', '#8a6a48']];
let henMats = null;

export class Hen {
  constructor(cols, rooster, home, R) {
    if (!henMats) henMats = { yellow: mat('#d9a43a', 0.6), red: mat('#c4241c', 0.5), eye: mat('#120d0a', 0.3), sickle: mat('#1c2a24', 0.35) };
    const M = henMats;
    const plum = mat(cols[0], 0.95), wing = mat(cols[1], 0.95);
    const s = rooster ? 1.22 : 1;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = 0.2;
    this.root.add(this.body);
    const torso = new THREE.Group();
    torso.rotation.x = 0.22;
    this.body.add(torso);
    part(bodyZ([[0, -0.13], [0.055, -0.12], [0.09, -0.065], [0.1, 0.0], [0.092, 0.05], [0.06, 0.095], [0, 0.11]], 16).scale(0.92, 1.05, 1), plum, torso);
    // tail feathers, fanned
    const tailMat = rooster ? M.sickle : wing;
    for (let i = -2; i <= 2; i++) {
      const f = part(ellipsoid(0.01, rooster ? 0.1 : 0.065, rooster ? 0.06 : 0.04), tailMat, torso, i * 0.018, 0.07, -0.11);
      f.rotation.set(-0.45 - (rooster ? 0.2 : 0), 0, i * 0.18);
    }
    if (rooster) for (const i of [-1, 1]) {
      part(taperTube([[0, 0, 0], [0, 0.1, -0.06], [0, 0.12, -0.16], [0, 0.04, -0.22]], 0.012, 0.004), M.sickle, torso, i * 0.015, 0.08, -0.1);
    }
    this.wings = [-1, 1].map((sx) => {
      const w = new THREE.Group();
      w.position.set(sx * 0.075, 0.025, 0.02);
      torso.add(w);
      part(ellipsoid(0.022, 0.055, 0.095), wing, w, sx * 0.008, -0.02, -0.03);
      return w;
    });
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.05, 0.075);
    this.body.add(this.neck);
    part(limb(0.034, 0.042, 0.1, 10).rotateX(Math.PI - 0.15), rooster ? wing : plum, this.neck);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.1, 0.02);
    this.neck.add(this.head);
    part(ellipsoid(0.033, 0.036, 0.04), plum, this.head);
    part(new THREE.ConeGeometry(0.011, 0.032, 6).rotateX(Math.PI / 2), M.yellow, this.head, 0, -0.006, 0.045);
    const cs = rooster ? 1.6 : 1;
    for (let i = 0; i < 3; i++) part(new THREE.SphereGeometry(0.011 * cs, 6, 5), M.red, this.head, 0, 0.034 + (i === 1 ? 0.008 * cs : 0), 0.022 - i * 0.016);
    for (const sx of [-1, 1]) part(ellipsoid(0.007, 0.014 * cs, 0.009), M.red, this.head, sx * 0.006, -0.03, 0.03);
    for (const sx of [-1, 1]) part(new THREE.SphereGeometry(0.0065, 6, 4), M.eye, this.head, sx * 0.027, 0.008, 0.018);
    this.legs = [-1, 1].map((sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.035, -0.04, 0.005);
      this.body.add(hip);
      part(ellipsoid(0.035, 0.04, 0.045), plum, hip, 0, 0.0, 0);
      part(limb(0.008, 0.007, 0.11, 6), M.yellow, hip, 0, -0.02, 0);
      for (const a of [-0.45, 0, 0.45]) {
        const toe = part(limbZ(0.005, 0.004, 0.04, 5), M.yellow, hip, 0, -0.152, 0);
        toe.rotation.y = a;
      }
      return hip;
    });
    consolidate(this.root);
    this.root.scale.setScalar(s);
    this.s = s;
    this.home = home;
    this.R = R;
    this.p = { x: home.x + (R() - 0.5) * 3, z: home.z + (R() - 0.5) * 3 };
    this.y = heightAt(this.p.x, this.p.z);
    this.facing = R() * 6.28;
    this.speed = 0;
    this.phase = 0;
    this.t = R() * 10;
    this.state = 'peck';
    this.timer = R() * 4;
    this.flap = 0;
    this.roostB = 0;
    this.night = false;
  }
  update(dt, boy) {
    this.t += dt;
    let want = 0;
    const bx = this.p.x - boy.x, bz = this.p.z - boy.z, bd = Math.hypot(bx, bz);
    if (this.night) this.state = 'roost';
    else if (this.state === 'roost') { this.state = 'peck'; this.timer = 2; }
    if (!this.night && bd < 2.3 && this.state !== 'flee') {
      this.state = 'flee';
      this.timer = 1.2 + this.R() * 0.8;
      const a = Math.atan2(bx, bz) + (this.R() - 0.5) * 1.2;
      this.target = { x: this.p.x + Math.sin(a) * 4, z: this.p.z + Math.cos(a) * 4 };
    }
    if (this.state === 'peck') {
      this.timer -= dt;
      if (this.timer < 0) {
        const a = this.R() * 6.28, d = this.R() * this.home.r;
        this.target = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d };
        this.state = 'walk';
        this.stuck = 0;
      }
    } else if (this.state === 'walk') {
      want = 0.45;
      this.stuck += dt;
      if (Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z) < 0.15 || this.stuck > 8) { this.state = 'peck'; this.timer = 2 + this.R() * 6; }
    } else if (this.state === 'flee') {
      want = 2.6;
      this.timer -= dt;
      if (this.timer < 0) { this.state = 'peck'; this.timer = 1 + this.R() * 3; }
    }
    this.speed += (want - this.speed) * damp(dt, this.state === 'flee' ? 10 : 6);
    if (this.speed > 0.03 && this.target) {
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z, d = Math.hypot(dx, dz) || 1;
      if (d > 0.05) {
        this.p.x += (dx / d) * this.speed * dt;
        this.p.z += (dz / d) * this.speed * dt;
        resolveCollisions(this.p, 0.12, undefined, true);
        this.facing += wrap(Math.atan2(dx, dz) - this.facing) * damp(dt, 9);
      }
    }
    const gy = groundHeight(this.p.x, this.p.z);
    this.y += (gy - this.y) * damp(dt, 12);
    // a little hop and flutter when fleeing
    this.flap += ((this.state === 'flee' ? 1 : 0) - this.flap) * damp(dt, 8);
    const hop = this.flap * Math.abs(Math.sin(this.t * 9)) * 0.08;
    this.root.position.set(this.p.x, this.y + hop, this.p.z);
    this.root.rotation.y = this.facing;

    this.roostB += ((this.state === 'roost' ? 1 : 0) - this.roostB) * damp(dt, 1.5);
    const r = this.roostB;
    this.phase += this.speed * dt * 22;
    const amp = Math.min(1, this.speed * 2) * 0.7;
    this.legs.forEach((l, i) => {
      l.rotation.x = Math.sin(this.phase + i * Math.PI) * amp * (1 - r) + r * -1.2;
    });
    this.body.position.y = (0.2 - r * 0.11) * 1 + Math.abs(Math.sin(this.phase)) * 0.012 * amp;
    for (const [i, w] of this.wings.entries()) w.rotation.z = (i ? -1 : 1) * this.flap * (0.3 + Math.sin(this.t * 38) * 0.6);
    // pecking, and the head-bobbing walk
    let peck = 0;
    if (this.state === 'peck') {
      const c = (this.t * 1.3) % 2.2;
      peck = c < 0.18 ? Math.sin((c / 0.18) * Math.PI) : c > 1.1 && c < 1.26 ? Math.sin(((c - 1.1) / 0.16) * Math.PI) : 0;
    }
    this.neck.rotation.x = peck * 1.5 + r * 0.5 + Math.sin(this.t * 0.6) * 0.05;
    this.head.position.z = 0.02 + (this.state === 'walk' ? ((this.phase / Math.PI) % 1) * 0.025 : 0);
    this.head.rotation.y = this.state === 'peck' && peck === 0 ? Math.sin(this.t * 2.3) * 0.5 : 0;
    this.neck.rotation.y = 0;
  }
}

// ---------------- peacock ----------------
let featherTex = null;
function featherTexture() {
  if (featherTex) return featherTex;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0, '#3a5a2a'); grd.addColorStop(0.6, '#5a8a3a'); grd.addColorStop(1, '#2a6a4a');
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(16, 128); g.quadraticCurveTo(0, 60, 6, 14); g.quadraticCurveTo(16, -4, 26, 14); g.quadraticCurveTo(32, 60, 16, 128); g.fill();
  // the eye
  for (const [r, col] of [[11, '#c9a43a'], [8.5, '#2a9a8a'], [6, '#1e3aa8'], [3.5, '#0e1430']]) { g.fillStyle = col; g.beginPath(); g.ellipse(16, 20, r * 0.85, r, 0, 0, 7); g.fill(); }
  featherTex = new THREE.CanvasTexture(c);
  featherTex.colorSpace = THREE.SRGBColorSpace;
  return featherTex;
}
class Peacock {
  constructor(home, R) {
    const blue = mat('#1f4fb8', 0.35), green = mat('#2a6a4a', 0.5), brown = mat('#8a5a32', 0.8), grey = mat('#8a8a86', 0.7), white = mat('#f2f0ea', 0.5), dark = mat('#121010', 0.3);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = 0.55;
    this.root.add(this.body);
    part(bodyZ([[0, -0.2], [0.08, -0.17], [0.13, -0.06], [0.14, 0.04], [0.11, 0.13], [0, 0.18]], 16).scale(0.85, 1, 1), blue, this.body);
    for (const sx of [-1, 1]) part(ellipsoid(0.04, 0.1, 0.17), brown, this.body, sx * 0.1, 0.0, -0.05);
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.06, 0.12);
    this.body.add(this.neck);
    part(limb(0.045, 0.055, 0.3, 10).rotateX(Math.PI - 0.25), blue, this.neck);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.3, 0.07);
    this.neck.add(this.head);
    part(ellipsoid(0.04, 0.045, 0.055), blue, this.head);
    part(new THREE.ConeGeometry(0.013, 0.05, 6).rotateX(Math.PI / 2), grey, this.head, 0, -0.01, 0.07);
    for (const sx of [-1, 1]) { part(ellipsoid(0.01, 0.014, 0.022), white, this.head, sx * 0.032, 0.008, 0.02); part(new THREE.SphereGeometry(0.007, 6, 4), dark, this.head, sx * 0.035, 0.008, 0.028); }
    for (let i = -2; i <= 2; i++) { // crest
      part(new THREE.CylinderGeometry(0.002, 0.002, 0.08, 3), blue, this.head, i * 0.008, 0.07, -0.01 - Math.abs(i) * 0.004);
      part(new THREE.SphereGeometry(0.009, 6, 4), blue, this.head, i * 0.008, 0.11, -0.01 - Math.abs(i) * 0.004);
    }
    // the train: feathers on pivots at the rump; trailing behind or raised in a fan
    this.feathers = [];
    const fm = new THREE.MeshLambertMaterial({ map: featherTexture(), side: THREE.DoubleSide, transparent: true, alphaTest: 0.4 });
    const fg = new THREE.PlaneGeometry(0.22, 1.25).translate(0, 0.62, 0);
    this.fan = new THREE.Group();
    this.fan.position.set(0, 0.04, -0.17);
    this.body.add(this.fan);
    const N = 26;
    for (let i = 0; i < N; i++) {
      const pv = new THREE.Group();
      this.fan.add(pv);
      const f = new THREE.Mesh(fg, fm);
      f.castShadow = true;
      f.scale.set(1, 0.75 + (1 - Math.abs(i / (N - 1) - 0.5) * 2) * 0.35, 1);
      pv.add(f);
      this.feathers.push({ pv, a: (i / (N - 1) - 0.5) * Math.PI * 0.95, layer: i % 2 });
    }
    this.legs = [-1, 1].map((sx) => {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.05, -0.08, 0);
      this.body.add(hip);
      part(limb(0.014, 0.011, 0.45, 6), grey, hip);
      return hip;
    });
    consolidate(this.root);
    this.home = home; this.R = R;
    this.p = { x: home.x + (R() - 0.5) * 4, z: home.z + (R() - 0.5) * 4 };
    this.y = heightAt(this.p.x, this.p.z);
    this.facing = R() * 6; this.speed = 0; this.phase = 0; this.t = R() * 10;
    this.state = 'peck'; this.timer = 3; this.display = 0; this.night = false;
    this.onCall = null;
  }
  update(dt, boy) {
    this.t += dt;
    let want = 0;
    const bd = Math.hypot(this.p.x - boy.x, this.p.z - boy.z);
    if (this.night) this.state = 'rest';
    else if (this.state === 'rest') this.state = 'peck';
    this.timer -= dt;
    if (this.state === 'peck' && this.timer < 0) {
      if (this.R() < 0.3) { this.state = 'show'; this.timer = 7 + this.R() * 5; this.onCall?.(bd); }
      else { this.state = 'walk'; const a = this.R() * 6.28, d = this.R() * this.home.r; this.target = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d }; this.timer = 10; }
    } else if (this.state === 'walk') {
      want = 0.5;
      if (Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z) < 0.3 || this.timer < 0) { this.state = 'peck'; this.timer = 3 + this.R() * 5; }
    } else if (this.state === 'show') {
      this.facing += Math.sin(this.t * 0.8) * dt * 0.6; // turning slowly to show off
      if (this.timer < 0) { this.state = 'peck'; this.timer = 4; }
    }
    if (bd < 3 && !this.night) { this.state = 'walk'; this.target = { x: this.p.x + (this.p.x - boy.x) * 2, z: this.p.z + (this.p.z - boy.z) * 2 }; this.timer = 3; want = 1.4; }
    this.speed += (want - this.speed) * damp(dt, 4);
    if (this.speed > 0.03 && this.target) {
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z, d = Math.hypot(dx, dz) || 1;
      this.p.x += (dx / d) * this.speed * dt; this.p.z += (dz / d) * this.speed * dt;
      resolveCollisions(this.p, 0.2, undefined, true);
      this.facing += wrap(Math.atan2(dx, dz) - this.facing) * damp(dt, 5);
    }
    this.y += (groundHeight(this.p.x, this.p.z) - this.y) * damp(dt, 10);
    this.root.position.set(this.p.x, this.y, this.p.z);
    this.root.rotation.y = this.facing;
    this.phase += this.speed * dt * 12;
    this.legs.forEach((l, i) => (l.rotation.x = Math.sin(this.phase + i * Math.PI) * 0.5 * Math.min(1, this.speed * 2)));
    this.display += ((this.state === 'show' ? 1 : 0) - this.display) * damp(dt, 1.8);
    const d = this.display, shiver = d > 0.9 ? Math.sin(this.t * 40) * 0.02 : 0;
    for (const f of this.feathers) {
      // trailing: lie back close together; display: stand up and spread into a fan
      const spread = f.a * d;
      f.pv.rotation.set(-Math.PI / 2 * (1 - d) - 0.12 * d + shiver + f.layer * 0.02, 0, -spread, 'YXZ');
      f.pv.rotation.y = 0;
      f.pv.position.z = -f.layer * 0.01;
    }
    this.fan.rotation.x = -0.1 * (1 - d);
    this.body.position.y = this.night ? 0.25 : 0.55 + Math.abs(Math.sin(this.phase)) * 0.01;
    const peck = this.state === 'peck' ? Math.max(0, Math.sin(this.t * 2.2)) ** 6 : 0;
    this.neck.rotation.x = peck * 1.2 + (this.night ? 0.8 : 0) - d * 0.15;
    this.head.rotation.y = this.state === 'peck' && !peck ? Math.sin(this.t * 1.7) * 0.5 : 0;
  }
}

// ---------------- hare / rabbit ----------------
class Rabbit {
  constructor(home, R) {
    const fur = mat(['#9a7a5a', '#a88a68', '#8a7058'][Math.floor(R() * 3)], 0.95), pale = mat('#e6dccb', 0.95), pink = mat('#d8a09a', 0.8), dark = mat('#2a2220', 0.7);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = 0.13;
    this.root.add(this.body);
    part(ellipsoid(0.1, 0.1, 0.15, 14, 10), fur, this.body, 0, 0, -0.02);
    part(ellipsoid(0.07, 0.06, 0.1), pale, this.body, 0, -0.04, 0.0);
    for (const sx of [-1, 1]) part(ellipsoid(0.045, 0.08, 0.09), fur, this.body, sx * 0.06, -0.01, -0.07);
    this.hind = [-1, 1].map((sx) => { const g = new THREE.Group(); g.position.set(sx * 0.06, -0.07, -0.06); this.body.add(g); part(ellipsoid(0.03, 0.02, 0.09), fur, g, 0, -0.04, 0.04); return g; });
    this.front = [-1, 1].map((sx) => { const g = new THREE.Group(); g.position.set(sx * 0.04, -0.05, 0.09); this.body.add(g); part(limb(0.015, 0.012, 0.07, 6), fur, g); return g; });
    part(new THREE.SphereGeometry(0.035, 8, 6), pale, this.body, 0, 0.03, -0.16);
    part(ellipsoid(0.02, 0.018, 0.012), dark, this.body, 0, 0.055, -0.17);
    this.head = new THREE.Group();
    this.head.position.set(0, 0.07, 0.12);
    this.body.add(this.head);
    part(ellipsoid(0.055, 0.055, 0.07), fur, this.head);
    part(new THREE.SphereGeometry(0.012, 6, 4), pink, this.head, 0, -0.01, 0.068);
    eyes(this.head, 0.04, 0.012, 0.035, 0.009);
    this.ears = [-1, 1].map((sx) => {
      const e = new THREE.Group();
      e.position.set(sx * 0.022, 0.04, -0.02);
      this.head.add(e);
      part(ellipsoid(0.02, 0.1, 0.035), fur, e, 0, 0.09, 0);
      part(ellipsoid(0.012, 0.08, 0.02), pink, e, 0, 0.09, 0.012);
      return e;
    });
    consolidate(this.root);
    this.home = home; this.R = R;
    this.p = { x: home.x + (R() - 0.5) * 6, z: home.z + (R() - 0.5) * 6 };
    this.y = heightAt(this.p.x, this.p.z);
    this.facing = R() * 6; this.t = R() * 10; this.hop = 0; this.hopping = false; this.timer = R() * 3; this.flee = 0; this.target = null; this.night = false;
  }
  update(dt, boy) {
    this.t += dt;
    const bx = this.p.x - boy.x, bz = this.p.z - boy.z, bd = Math.hypot(bx, bz);
    if (bd < 6 && this.flee <= 0) {
      this.flee = 2 + this.R();
      const a = Math.atan2(bx, bz) + (this.R() - 0.5) * 0.8;
      this.target = { x: this.p.x + Math.sin(a) * 12, z: this.p.z + Math.cos(a) * 12 };
    }
    this.flee -= dt;
    this.timer -= dt;
    // little hops when grazing about, long bounding leaps when fleeing
    const fleeing = this.flee > 0;
    if (!this.hopping && (fleeing || (this.timer < 0 && !this.night))) {
      if (!fleeing && (!this.target || Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z) < 0.4)) {
        const a = this.R() * 6.28, d = this.R() * this.home.r;
        this.target = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d };
      }
      this.hopping = true; this.hop = 0;
      this.hopLen = fleeing ? 1.4 : 0.35; this.hopDur = fleeing ? 0.28 : 0.3;
      this.timer = fleeing ? 0 : 0.2 + this.R() * (this.R() < 0.2 ? 6 : 1.2);
    }
    let lift = 0;
    if (this.hopping && this.target) {
      this.hop += dt / this.hopDur;
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z, d = Math.hypot(dx, dz) || 1;
      this.facing += wrap(Math.atan2(dx, dz) - this.facing) * damp(dt, 12);
      const step = Math.min(d, (this.hopLen / this.hopDur) * dt);
      this.p.x += (dx / d) * step; this.p.z += (dz / d) * step;
      resolveCollisions(this.p, 0.1, undefined, true);
      lift = Math.sin(Math.min(1, this.hop) * Math.PI) * (fleeing ? 0.3 : 0.1);
      if (this.hop >= 1) this.hopping = false;
    }
    this.y += (groundHeight(this.p.x, this.p.z) - this.y) * damp(dt, 14);
    this.root.position.set(this.p.x, this.y + lift, this.p.z);
    this.root.rotation.y = this.facing;
    const h = this.hopping ? Math.sin(this.hop * Math.PI) : 0;
    this.body.rotation.x = this.hopping ? -0.35 + this.hop * 0.6 : 0;
    for (const g of this.hind) g.rotation.x = h * 1.1;
    for (const g of this.front) g.rotation.x = -h * 0.9;
    // sitting: nose twitch, ears turning; alert ears straight up when the boy is near
    const alert = bd < 12 ? 1 : 0;
    this.ears.forEach((e, i) => { e.rotation.x = (fleeing ? -0.9 : -0.2 + Math.sin(this.t * 0.7 + i) * 0.15 * (1 - alert)); e.rotation.z = (i ? -1 : 1) * (0.15 + Math.sin(this.t * 0.4 + i * 2) * 0.1); });
    this.head.rotation.x = Math.sin(this.t * 14) * 0.03 + (this.hopping ? 0.2 : alert * -0.15);
  }
}

// ---------------- Indian palm squirrel ----------------
class Squirrel {
  constructor(trees, R) {
    const fur = mat('#8a7a68', 0.95), pale = mat('#e8dcc8', 0.95), dark = mat('#3a3028', 0.9);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.position.y = 0.05;
    part(ellipsoid(0.04, 0.038, 0.085, 12, 8), fur, this.body);
    for (const x of [-0.016, 0, 0.016]) part(ellipsoid(0.005, 0.004, 0.07), x ? pale : pale, this.body, x, 0.035, 0); // the three stripes
    for (const x of [-0.008, 0.008]) part(ellipsoid(0.005, 0.004, 0.06), dark, this.body, x, 0.037, 0);
    part(ellipsoid(0.03, 0.03, 0.04), fur, this.body, 0, 0.015, 0.08);
    part(new THREE.SphereGeometry(0.008, 6, 4), dark, this.body, 0, 0.01, 0.12);
    eyes(this.body, 0.02, 0.025, 0.09, 0.006);
    for (const sx of [-1, 1]) part(ellipsoid(0.008, 0.014, 0.006), fur, this.body, sx * 0.016, 0.045, 0.07);
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.01, -0.08);
    this.body.add(this.tail);
    part(taperTube([[0, 0, 0], [0, 0.05, -0.06], [0, 0.13, -0.07], [0, 0.18, -0.03]], 0.026, 0.02, 8), fur, this.tail);
    consolidate(this.root);
    this.trees = trees; this.R = R;
    this.tree = trees[0];
    this.p = { x: this.tree.x + 1.2, z: this.tree.z };
    this.y = heightAt(this.p.x, this.p.z);
    this.climb = 0; this.state = 'ground'; this.timer = R() * 4; this.t = R() * 10; this.facing = 0; this.target = null; this.speed = 0;
  }
  update(dt, boy) {
    this.t += dt;
    this.timer -= dt;
    const T = this.tree, trunkR = 0.3 * T.s + 0.04;
    const bd = Math.hypot(this.p.x - boy.x, this.p.z - boy.z);
    if (this.state === 'ground') {
      if (bd < 4.5) { this.state = 'dash'; this.target = this.trunkPoint(); }
      else if (this.timer < 0) {
        if (this.R() < 0.4) { this.state = 'dash'; this.tree = this.trees[Math.floor(this.R() * this.trees.length)]; this.target = this.trunkPoint(); }
        else { const a = this.R() * 6.28, d = 1 + this.R() * 3; this.target = { x: T.x + Math.cos(a) * d, z: T.z + Math.sin(a) * d }; this.timer = 1 + this.R() * 3; }
      }
      if (this.target) this.run(this.target, 1.6, dt);
    } else if (this.state === 'dash') {
      if (this.run(this.target, 4.2, dt)) { this.state = 'up'; this.climbTop = (1.6 + this.R() * 1.2) * this.tree.s; }
    } else if (this.state === 'up') {
      this.climb = Math.min(this.climbTop, this.climb + dt * 2.2);
      if (this.climb >= this.climbTop) { this.state = 'perch'; this.timer = 4 + this.R() * 8; }
    } else if (this.state === 'perch') {
      if (this.timer < 0 && bd > 7) this.state = 'down';
    } else if (this.state === 'down') {
      this.climb = Math.max(0, this.climb - dt * 1.6);
      if (this.climb <= 0) { this.state = 'ground'; this.timer = 1; const a = Math.atan2(this.p.x - T.x, this.p.z - T.z); this.target = { x: T.x + Math.sin(a) * 1.5, z: T.z + Math.cos(a) * 1.5 }; }
    }
    const onTrunk = this.climb > 0.05 || this.state === 'up';
    const gy = groundHeight(this.p.x, this.p.z);
    if (onTrunk) {
      // head up (or down) the trunk, belly to the bark
      const a = Math.atan2(this.p.x - T.x, this.p.z - T.z);
      this.p.x = T.x + Math.sin(a) * trunkR; this.p.z = T.z + Math.cos(a) * trunkR;
      this.root.position.set(this.p.x, gy + this.climb + 0.05, this.p.z);
      this.root.rotation.set(this.state === 'down' ? Math.PI / 2 : -Math.PI / 2, a + Math.PI, 0, 'YXZ');
    } else {
      this.y += (gy - this.y) * damp(dt, 14);
      this.root.position.set(this.p.x, this.y, this.p.z);
      this.root.rotation.set(0, this.facing, 0, 'YXZ');
    }
    const moving = this.speed > 0.1 || this.state === 'up' || this.state === 'down';
    this.body.position.y = 0.05 + (moving ? Math.abs(Math.sin(this.t * 22)) * 0.025 : 0);
    this.tail.rotation.x = moving ? -0.4 : Math.sin(this.t * 3) * 0.25 + (Math.sin(this.t * 0.7) > 0.8 ? Math.sin(this.t * 30) * 0.2 : 0);
  }
  trunkPoint() {
    const T = this.tree, a = Math.atan2(this.p.x - T.x, this.p.z - T.z);
    return { x: T.x + Math.sin(a) * (0.3 * T.s + 0.05), z: T.z + Math.cos(a) * (0.3 * T.s + 0.05) };
  }
  run(target, v, dt) {
    const dx = target.x - this.p.x, dz = target.z - this.p.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { this.speed = 0; return true; }
    const burst = Math.sin(this.t * 3) > -0.3 ? 1 : 0; // stop-start scampering
    this.speed = v * burst;
    this.p.x += (dx / d) * Math.min(d, this.speed * dt); this.p.z += (dz / d) * Math.min(d, this.speed * dt);
    this.facing += wrap(Math.atan2(dx, dz) - this.facing) * damp(dt, 14);
    return false;
  }
}

// ---------------- population ----------------
export function buildAnimals(scene) {
  const R = rng(5150);
  const houses = layout.houses.filter((h) => h.side !== 0);
  const goats = [];
  const goatHomes = [
    { x: -33, z: -8, r: 8 },
    { x: 30, z: 4, r: 7 },
    { x: -26, z: 54, r: 8 },
  ];
  goatHomes.forEach((home, gi) => {
    const n = gi === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const g = new Goat(GOAT_COATS[(gi * 2 + i) % GOAT_COATS.length], 0.95 + R() * 0.12, home, R);
      goats.push(g);
      if (i === 0 && gi !== 1) goats.push(new Goat(GOAT_COATS[(gi + 3) % GOAT_COATS.length], 0.58, home, R, g));
    }
  });
  // donkeys grazing by the river, one carrying the dhobi's washing
  const dk = layout.donkeys;
  for (const [i, coat] of [['#8a847c', 0], ['#6e6862', 1], ['#9a928a', 0]].entries()) {
    goats.push(new Goat([coat[0], '#e6e0d4', coat[1]], 0.95 + i * 0.05, dk, R, null, 'donkey'));
  }
  // camels in Marudhar
  if (layout.rv) {
    const camelHome = { x: layout.rv.x + 22, z: layout.rv.z + 26, r: 18 };
    for (const [i, coat] of [['#c49a62', 1], ['#b08454', 0], ['#d2aa72', 0]].entries()) goats.push(new Goat([coat[0], '#e2c89a', coat[1]], 1 - i * 0.05, camelHome, R, null, 'camel'));
  }
  // chital herds on the hill meadows, and the village cats
  for (const [hx0, hz0, n] of [[-200, -470, 6], [360, 420, 5], [-470, 330, 5]]) {
    const { x: hx, z: hz } = warp(hx0, hz0);
    const home = { x: hx, z: hz, r: 26 };
    for (let i = 0; i < n; i++) goats.push(new Goat(['#b8743a', '#f2e8d8', i === 0 ? 1 : 0], i === 0 ? 1.1 : 0.85 + R() * 0.15, home, R, null, 'deer'));
  }
  for (const [i, [hx, hz]] of [[10, 40], [-12, -30], [6, 64], [-170, 182]].entries()) goats.push(new Goat([['#d8863a', '#f2e2c8'], ['#3a3632', '#e8e2d8'], ['#8a8278', '#d8d0c4'], ['#e8e2d8', '#f6f2ea']][i], 1, { x: hx, z: hz, r: 10 }, R, null, 'cat'));
  const hens = [];
  const henHomes = [];
  for (const h of houses.slice(0, 14)) if (R() < 0.45) henHomes.push({ ...localToWorld(h, 1.5, 6.5), r: 3.5 });
  henHomes.push({ ...localToWorld(TEA, 0, 2.6), r: 2.5 }); // crumbs by the tea stall
  henHomes.slice(0, 6).forEach((home, i) => {
    const n = 2 + Math.floor(R() * 2);
    for (let k = 0; k < n; k++) hens.push(new Hen(HEN_COLS[Math.floor(R() * HEN_COLS.length)], k === 0 && i % 2 === 0, home, R));
  });
  const peacocks = [{ x: -55, z: 60, r: 9 }, { x: -48, z: 70, r: 7 }, { x: 100, z: -12, r: 10 }].map((h) => new Peacock(h, R));
  // hares in the open meadows at the field edges
  const rabbits = [];
  for (const h of [{ x: -38, z: -64, r: 8 }, { x: 60, z: -48, r: 8 }, { x: -118, z: 60, r: 9 }, { x: -135, z: -78, r: 8 }, { x: 70, z: 160, r: 10 }, { x: -85, z: 150, r: 10 }, { x: 175, z: -10, r: 8 }])
    for (let i = 0; i < 2; i++) rabbits.push(new Rabbit(h, R));
  // palm squirrels about the trees nearest the villages
  const nearTrees = layout.trees.filter((t) => Math.hypot(t.x, t.z) < 140 && t.s < 1.4);
  const squirrels = [];
  for (let i = 0; i < 12 && nearTrees.length > 3; i++) {
    const t0 = nearTrees[Math.floor(R() * nearTrees.length)];
    const grove = nearTrees.filter((t) => Math.hypot(t.x - t0.x, t.z - t0.z) < 18).slice(0, 4);
    squirrels.push(new Squirrel(grove.length > 1 ? grove : [t0], R));
  }
  for (const a of [...goats, ...hens, ...peacocks, ...rabbits, ...squirrels]) scene.add(a.root);
  return {
    goats, hens,
    peacocks, rabbits, squirrels,
    setNight(v) { for (const a of goats) a.night = v; for (const a of hens) a.night = v; for (const a of peacocks) a.night = v; },
    update(dt, boy) {
      for (const g of goats) {
        if (Math.abs(g.p.x - boy.x) > 120 || Math.abs(g.p.z - boy.z) > 120) { g.root.visible = false; continue; }
        g.root.visible = true;
        g.update(dt, boy);
      }
      for (const a of [...rabbits, ...squirrels]) {
        const far = Math.abs(a.p.x - boy.x) > 90 || Math.abs(a.p.z - boy.z) > 90;
        a.root.visible = !far;
        if (!far) a.update(dt, boy);
      }
      for (const pc of peacocks) {
        const far = Math.abs(pc.p.x - boy.x) > 110 || Math.abs(pc.p.z - boy.z) > 110;
        pc.root.visible = !far;
        if (!far) pc.update(dt, boy);
      }
      for (const h of hens) {
        if (Math.abs(h.p.x - boy.x) > 70 || Math.abs(h.p.z - boy.z) > 70) { h.root.visible = false; continue; }
        h.root.visible = true;
        h.update(dt, boy);
      }
    },
    colliders() {
      return goats.map((g) => ({ kind: 'c', x: g.p.x, z: g.p.z, r: g.cr * g.scale }));
    },
  };
}

// ---------------- fish ----------------
// A shoal kept around the stretch of river nearest the boy: they dart about under the surface and,
// every few seconds, one leaps clear of the water with a splash.
export function buildFish(scene, onSplash) {
  const silver = new THREE.MeshStandardMaterial({ color: '#a9b4b2', metalness: 0.55, roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: '#3d4a44', metalness: 0.3, roughness: 0.5 });
  const bodyGeo = bodyZ([[0, -0.16], [0.03, -0.12], [0.055, -0.03], [0.06, 0.03], [0.045, 0.09], [0.0, 0.13]], 10).scale(0.55, 1, 1);
  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0.07, -0.09, 0, -0.07, -0.09], 3));
  tailGeo.computeVertexNormals();
  const finMat = new THREE.MeshStandardMaterial({ color: '#5a6a62', side: THREE.DoubleSide, roughness: 0.5 });
  const fish = [];
  for (let i = 0; i < 26; i++) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(bodyGeo, i % 4 === 0 ? dark : silver);
    g.add(b);
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4).scale(0.012, 0.03, 0.1), dark);
    back.position.set(0, 0.05, 0);
    g.add(back);
    const tail = new THREE.Group();
    tail.position.z = -0.15;
    tail.add(new THREE.Mesh(tailGeo, finMat));
    g.add(tail);
    const s = 0.8 + Math.random() * 0.9;
    g.scale.setScalar(s);
    scene.add(g);
    fish.push({ g, tail, z: 0, u: 0, d: 0, v: 0.6 + Math.random() * 0.8, dir: Math.random() < 0.5 ? 1 : -1, ph: Math.random() * 10, jump: -1, spawned: false });
  }
  const splash = new Puffs({ max: 120, color: '#eef4f4', opacity: 0.6, buoyancy: -6, drag: 0.4 });
  scene.add(splash.mesh);
  let nextJump = 3;
  const spawn = (f, pz) => {
    f.z = pz + (Math.random() - 0.5) * 80;
    f.u = (Math.random() - 0.5) * (RIVER_HALF * 1.4);
    f.d = 0.12 + Math.random() * 0.45;
    f.spawned = true;
  };
  const burst = (x, z, n) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 0.6 + Math.random() * 1.4;
      splash.emit(x, WATER_Y + 0.05, z, Math.cos(a) * sp, 1.8 + Math.random() * 1.6, Math.sin(a) * sp, 0.7 + Math.random() * 0.4, 0.06, 0.25, 0.9);
    }
  };
  return {
    update(dt, t, player) {
      const near = riverDist(player.x, player.z) < 90;
      for (const f of fish) f.g.visible = near;
      splash.update(dt);
      if (!near) return;
      nextJump -= dt;
      for (const f of fish) {
        if (!f.spawned || Math.abs(f.z - player.z) > 60) spawn(f, player.z);
        f.ph += dt;
        // darting: bursts of speed, sudden turns
        const burstV = f.v * (1 + Math.max(0, Math.sin(f.ph * 1.7)) * 1.5);
        f.z += f.dir * burstV * dt;
        f.u += Math.sin(f.ph * 0.9) * dt * 0.6;
        if (Math.abs(f.u) > RIVER_HALF * 0.75) f.u *= 0.98;
        if (Math.random() < dt * 0.08) f.dir *= -1;
        // swimmers scare them off
        const cx = riverX(f.z) + f.u;
        const dx = cx - player.x, dz = f.z - player.z, dd = Math.hypot(dx, dz);
        if (dd < 2.5) { f.u += Math.sign(dx || 1) * dt * 3; f.dir = Math.sign(dz || 1); }
        const slope = riverSlope(f.z);
        let x = riverX(f.z) + f.u, y = WATER_Y + WATER.off - f.d, z = f.z;
        const bed = heightAt(x, z);
        if (y < bed + 0.08) y = bed + 0.08;
        let pitch = 0;
        if (f.jump >= 0) {
          f.jump += dt / 0.95;
          const j = f.jump;
          y = WATER_Y - 0.1 + Math.sin(j * Math.PI) * 0.75;
          f.z += f.dir * dt * 1.6;
          pitch = -Math.cos(j * Math.PI) * 1.1;
          if (j >= 1) { f.jump = -1; burst(x, z, 14); onSplash?.(Math.hypot(x - player.x, z - player.z)); }
        }
        f.g.position.set(x, y, z);
        f.g.rotation.set(pitch, Math.atan2(slope * f.dir, f.dir), 0, 'YXZ');
        f.tail.rotation.y = Math.sin(t * (8 + burstV * 6) + f.ph) * 0.5;
      }
      if (nextJump < 0) {
        nextJump = 3 + Math.random() * 5;
        const cand = fish.filter((f) => f.jump < 0 && Math.abs(f.z - player.z) < 35);
        const f = cand[Math.floor(Math.random() * cand.length)];
        if (f) { f.jump = 0; burst(riverX(f.z) + f.u, f.z, 8); }
      }
    },
  };
}
