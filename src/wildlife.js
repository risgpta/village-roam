// The wild edges: mugger crocodiles basking on far stretches of the river, a tiger in the hills,
// and a wolf pack on the far side. They keep away from the villages, but don't get too close.
import * as THREE from 'three';
import { heightAt, groundHeight, riverX, RIVER_HALF, WATER_Y, resolveCollisions, WILD, warpR, JUNGLE_HOMES, layout } from './world.js';
import { quadruped, eyes, consolidate, gaitPolish } from './animals.js';
import { ellipsoid, limb, limbZ, bodyZ, taperTube, lathe, furMat } from './shapes.js';
import { rng } from './noise.js';

const mat = (c, r = 0.85, o = {}) => (r >= 0.85 && !Object.keys(o).length ? furMat(c, { rough: r }) : new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o }));
function part(geo, m, parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent.add(o);
  return o;
}
const damp = (dt, r) => 1 - Math.exp(-dt * r);
const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };

function tigerCoat() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, '#e9e2d2'); grd.addColorStop(0.22, '#d77a22'); grd.addColorStop(0.5, '#c8661a'); grd.addColorStop(0.78, '#d77a22'); grd.addColorStop(1, '#e9e2d2');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
  const R = rng(77);
  g.fillStyle = '#16110d';
  for (let y = 10; y < 512; y += 22 + R() * 10) {
    // a stripe wraps from the spine (u = 0.5) down each flank, thinning and forking
    for (const side of [-1, 1]) {
      g.beginPath();
      const w = 5 + R() * 6, len = 70 + R() * 40;
      g.moveTo(128, y);
      g.bezierCurveTo(128 + side * len * 0.4, y + (R() - 0.5) * 18, 128 + side * len * 0.8, y + (R() - 0.3) * 24, 128 + side * len, y + 10 + R() * 12);
      g.lineTo(128 + side * len - side * 3, y + 14 + R() * 10);
      g.bezierCurveTo(128 + side * len * 0.7, y + w + 6, 128 + side * len * 0.35, y + w, 128, y + w);
      g.fill();
    }
  }
  return tex(c);
}
function leopardCoat() {
  // golden fur covered in rosettes: broken dark rings with a tawny centre
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, '#efe4cc'); grd.addColorStop(0.24, '#d8a24a'); grd.addColorStop(0.5, '#c88e3a'); grd.addColorStop(0.76, '#d8a24a'); grd.addColorStop(1, '#efe4cc');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 512);
  const R = rng(99);
  for (let i = 0; i < 260; i++) {
    const x = 30 + R() * 196, y = R() * 512, r = 5 + R() * 6;
    g.fillStyle = '#b8782a'; g.beginPath(); g.arc(x, y, r * 0.7, 0, 7); g.fill();
    g.strokeStyle = '#1a140e'; g.lineWidth = 2.6;
    for (let k = 0; k < 4; k++) { const a0 = (k / 4) * Math.PI * 2 + R(); g.beginPath(); g.arc(x, y, r, a0, a0 + 1.1); g.stroke(); }
  }
  return tex(c);
}
function crocSkin() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4a4a32'; g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 8) for (let x = 0; x < 128; x += 8) {
    const v = 50 + ((x * 7 + y * 13) % 23);
    g.fillStyle = `rgb(${v + 10},${v + 12},${v - 8})`;
    g.fillRect(x + 1, y + 1, 6, 6);
  }
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(190,180,130,0.7)'); grd.addColorStop(0.25, 'rgba(0,0,0,0)'); grd.addColorStop(0.75, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(190,180,130,0.7)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 256);
  return tex(c);
}

// ---------------- mugger crocodile ----------------
class Crocodile {
  constructor(z, side, R) {
    const skin = new THREE.MeshStandardMaterial({ map: crocSkin(), roughness: 0.6 });
    const dark = mat('#2f3020', 0.7), belly = mat('#b8ae84', 0.8), tooth = mat('#f2ecd8', 0.4), eye = mat('#c8a43a', 0.3, { emissive: '#3a2a08' });
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = 0.18;
    this.root.add(this.body);
    part(bodyZ([[0, -0.55], [0.16, -0.45], [0.27, -0.2], [0.3, 0.15], [0.26, 0.45], [0.16, 0.62], [0, 0.68]], 18).scale(1, 0.42, 1), skin, this.body);
    part(ellipsoid(0.27, 0.06, 0.55), belly, this.body, 0, -0.09, 0.05);
    for (let i = 0; i < 9; i++) for (const sx of [-0.08, 0.08]) part(new THREE.ConeGeometry(0.03, 0.05, 4), dark, this.body, sx, 0.12, -0.45 + i * 0.12);
    // tail in three swinging segments
    this.tail = [];
    let parent = this.body, z0 = -0.5;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, 0, z0);
      parent.add(seg);
      const r0 = 0.15 - i * 0.045, r1 = 0.11 - i * 0.04, L = 0.55;
      part(limbZ(r0, Math.max(0.015, r1), L, 10).rotateY(Math.PI).scale(0.75, 0.6, 1), skin, seg);
      for (let k = 0; k < 4; k++) part(new THREE.ConeGeometry(0.022, 0.05, 4), dark, seg, 0, r0 * 0.55, -0.1 - k * 0.12);
      this.tail.push(seg);
      parent = seg; z0 = -L;
    }
    // head: flat broad snout, a hinged lower jaw with teeth
    this.head = new THREE.Group();
    this.head.position.set(0, 0.03, 0.62);
    this.body.add(this.head);
    part(ellipsoid(0.16, 0.08, 0.16), skin, this.head, 0, 0.02, 0.05);
    part(limbZ(0.12, 0.06, 0.42, 12).scale(1, 0.35, 1), skin, this.head, 0, 0.01, 0.12);
    for (const sx of [-1, 1]) {
      part(new THREE.SphereGeometry(0.025, 8, 6), eye, this.head, sx * 0.07, 0.08, 0.06);
      for (let k = 0; k < 6; k++) part(new THREE.ConeGeometry(0.008, 0.03, 4).rotateX(Math.PI), tooth, this.head, sx * (0.09 - k * 0.01), -0.02, 0.18 + k * 0.06);
    }
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.02, 0.08);
    this.head.add(this.jaw);
    part(limbZ(0.11, 0.05, 0.42, 12).scale(1, 0.25, 1), belly, this.jaw, 0, -0.02, 0.04);
    for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) part(new THREE.ConeGeometry(0.008, 0.03, 4), tooth, this.jaw, sx * (0.08 - k * 0.01), 0.0, 0.12 + k * 0.06);
    // splayed legs
    this.legs = [];
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.24, -0.04, sz * 0.32);
      this.body.add(hip);
      part(limbZ(0.06, 0.04, 0.22, 8).rotateY(sx * Math.PI / 2).rotateZ(-sx * 0.5), skin, hip);
      part(ellipsoid(0.06, 0.02, 0.07), dark, hip, sx * 0.2, -0.12, 0.03);
      this.legs.push({ hip, sx, sz });
    }
    consolidate(this.root);
    this.root.scale.setScalar(1.25);
    this.z = z;
    this.side = side;
    this.R = R;
    this.bank = z;
    this.place();
    this.state = 'bask';
    this.t = R() * 10;
    this.timer = 10 + R() * 20;
    this.gape = 0;
    this.lungeT = -1;
  }
  bankPoint(z) {
    const x = riverX(z) + this.side * (RIVER_HALF + 1.2);
    return { x, z };
  }
  place() {
    const b = this.bankPoint(this.z);
    this.x = b.x; this.y = heightAt(b.x, b.z);
    this.facing = this.side > 0 ? -Math.PI / 2 : Math.PI / 2; // facing the water
  }
  update(dt, boy, ev) {
    this.t += dt;
    const bx = boy.x - this.x, bz = boy.z - this.z, bd = Math.hypot(bx, bz);
    let speed = 0;
    if (this.state === 'bask') {
      this.gape += ((Math.sin(this.t * 0.15) > 0.3 ? 0.55 : 0.05) - this.gape) * damp(dt, 1);
      if (bd < 9) { this.state = 'alert'; ev.hiss?.(bd); this.timer = 2.5; }
      this.timer -= dt;
      if (this.timer < 0) { this.state = 'swim'; this.timer = 15 + this.R() * 20; this.swimDir = this.R() < 0.5 ? 1 : -1; }
    } else if (this.state === 'alert') {
      this.facing += wrap(Math.atan2(bx, bz) - this.facing) * damp(dt, 4);
      this.gape += (0.7 - this.gape) * damp(dt, 6);
      this.timer -= dt;
      if (bd < 5 && this.lungeT < 0) { this.lungeT = 0; ev.snap?.(this.x, this.z, 'crocodile'); }
      if (this.lungeT >= 0) {
        this.lungeT += dt;
        const k = this.lungeT < 0.35 ? 1 : 0;
        speed = k * 5;
        this.gape = this.lungeT < 0.25 ? 1 : 0;
        if (this.lungeT > 0.8) { this.lungeT = -1; this.state = 'swim'; this.timer = 12; this.swimDir = Math.sign(bz) || 1; this.swimDir *= -1; }
      } else if (this.timer < 0 && bd > 9) this.state = 'bask';
    } else if (this.state === 'swim') {
      // slip into the water, cruise along the river, come back out to bask
      this.gape += (0 - this.gape) * damp(dt, 3);
      const mid = riverX(this.z) + this.side * RIVER_HALF * 0.4;
      this.z += this.swimDir * 0.7 * dt;
      if (Math.abs(this.z - this.bank) > 30) this.swimDir = Math.sign(this.bank - this.z);
      this.x += (mid - this.x) * damp(dt, 0.6);
      this.facing += wrap(Math.atan2(0, this.swimDir) - this.facing) * damp(dt, 1.5);
      speed = 0.7;
      this.timer -= dt;
      if (this.timer < 0) { this.state = 'return'; }
    } else if (this.state === 'return') {
      const b = this.bankPoint(this.z);
      const d = Math.hypot(b.x - this.x, b.z - this.z);
      this.facing += wrap(Math.atan2(b.x - this.x, b.z - this.z) - this.facing) * damp(dt, 2);
      this.x += ((b.x - this.x) / (d || 1)) * 0.6 * dt;
      speed = 0.6;
      if (d < 0.3) { this.state = 'bask'; this.timer = 20 + this.R() * 30; this.bank = this.z; this.facing += Math.PI; }
    }
    if (speed && this.state === 'alert') { this.x += Math.sin(this.facing) * speed * dt; this.z += Math.cos(this.facing) * speed * dt; }
    const g = heightAt(this.x, this.z);
    const inWater = g < WATER_Y - 0.25;
    const ty = inWater ? WATER_Y - 0.12 : g;
    this.y += (ty - this.y) * damp(dt, 4);
    this.root.position.set(this.x, this.y - (inWater ? 0.12 : 0), this.z);
    this.root.rotation.y = this.facing;
    this.jaw.rotation.x = this.gape * 0.7;
    const sw = Math.sin(this.t * (speed > 0.1 ? 3 : 0.6));
    this.tail.forEach((s, i) => (s.rotation.y = sw * (speed > 0.1 ? 0.35 : 0.08) * (i + 1) * 0.5));
    for (const l of this.legs) l.hip.rotation.y = speed > 0.1 && !inWater ? Math.sin(this.t * 6 + (l.sx * l.sz > 0 ? 0 : Math.PI)) * 0.5 : inWater ? l.sz * 0.6 : 0;
  }
}

// ---------------- tiger ----------------
class Tiger {
  constructor(home, R, kind = 'tiger') {
    this.kind = kind;
    const lion = kind === 'lion' || kind === 'lioness';
    const coat = lion ? mat('#c39a5e', 0.9) : furMat('#ffffff', { rough: 0.85, map: kind === 'leopard' ? leopardCoat() : tigerCoat() });
    const orange = lion ? mat('#c39a5e', 0.9) : mat('#d06a1e', 0.85), white = mat(lion ? '#e3cfa6' : '#efe8d8', 0.85), dark = mat('#16110d', 0.6), nose = mat(lion ? '#7a4a3a' : '#c88a7a', 0.6);
    const q = quadruped({ L: 1.15, r: 0.27, legH: 0.74, legR: 0.07, coat, belly: white, hoof: 'paw', sock: orange, deep: 1.1, neckLen: 0.28, neckTilt: 1.0, neckR: 0.17 });
    Object.assign(this, q);
    const h = this.head;
    part(ellipsoid(0.2, 0.18, 0.19), orange, h, 0, 0.02, 0.02);
    part(ellipsoid(0.13, 0.09, 0.12), white, h, 0, -0.07, 0.15);
    part(ellipsoid(0.05, 0.035, 0.03), nose, h, 0, -0.03, 0.26);
    for (const sx of [-1, 1]) {
      part(ellipsoid(0.08, 0.06, 0.05), white, h, sx * 0.09, -0.05, 0.17);
      part(ellipsoid(0.055, 0.06, 0.025), orange, h, sx * 0.13, 0.17, -0.04);
      part(ellipsoid(0.04, 0.045, 0.015), dark, h, sx * 0.13, 0.17, -0.065);
      if (!lion) for (let k = 0; k < 3; k++) part(ellipsoid(0.015, 0.006, 0.06), dark, h, sx * (0.17 + k * 0.005), 0.06 - k * 0.04, 0.06).rotation.z = sx * 0.3;
    }
    eyes(h, 0.08, 0.06, 0.16, 0.018);
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.11, 0.08);
    h.add(this.jaw);
    part(ellipsoid(0.09, 0.03, 0.11), white, this.jaw, 0, -0.01, 0.06);
    part(ellipsoid(0.07, 0.015, 0.08), mat('#8a2a2a', 0.5), this.jaw, 0, 0.015, 0.06);
    const tailMat = coat;
    part(taperTube([[0, 0, 0], [0, -0.25, -0.15], [0, -0.55, -0.2], [0, -0.75, -0.05]], 0.05, 0.035), tailMat, this.tail);
    part(new THREE.SphereGeometry(lion ? 0.07 : 0.045, 8, 6), lion ? mat('#4a2e18', 0.95) : dark, this.tail, 0, -0.77, -0.03);
    if (kind === 'lion') {
      // the mane: a big shaggy ruff round the head and down the neck and chest
      const mane = mat('#6b4322', 0.98), mane2 = mat('#8a5a2c', 0.98);
      part(ellipsoid(0.33, 0.34, 0.24), mane, h, 0, 0.0, -0.1);
      part(ellipsoid(0.28, 0.3, 0.2), mane2, h, 0, 0.06, -0.02);
      part(ellipsoid(0.26, 0.34, 0.3), mane, this.neck, 0, 0.12, 0.08);
      part(ellipsoid(0.2, 0.26, 0.2), mane2, this.body, 0, 0.0, 0.62);
    }
    consolidate(this.root);
    if (kind === 'leopard') this.root.scale.setScalar(0.72);
    if (kind === 'lion') this.root.scale.setScalar(1.08);
    if (kind === 'lioness') this.root.scale.setScalar(0.94);
    this.home = home; this.R = R;
    this.p = { x: home.x, z: home.z };
    this.y = heightAt(home.x, home.z);
    this.facing = 0; this.speed = 0; this.phase = 0; this.t = 0;
    this.state = 'prowl'; this.timer = 5; this.target = null; this.restB = 0; this.roar = 0;
  }
  update(dt, boy, ev) {
    this.t += dt;
    const bx = boy.x - this.p.x, bz = boy.z - this.p.z, bd = Math.hypot(bx, bz);
    let want = 0;
    this.timer -= dt;
    if (this.state !== 'charge' && this.state !== 'roar' && this.state !== 'leave') {
      if (bd < (this.kind === 'leopard' ? 24 : 32) && this.state !== 'watch') { this.state = 'watch'; this.timer = 4 + this.R() * 2; ev.growl?.(bd, this.kind === 'leopard' ? 'leopard' : 'tiger'); }
    }
    if (this.state === 'prowl') {
      if (!this.target || this.timer < 0) {
        const a = this.R() * 6.28, d = this.R() * this.home.r;
        this.target = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d };
        this.timer = 20;
        if (this.R() < (this.kind === 'lion' || this.kind === 'lioness' ? 0.65 : 0.3)) { this.state = 'rest'; this.timer = 15 + this.R() * (this.kind === 'tiger' || this.kind === 'leopard' ? 15 : 40); }
      }
      want = 1.3;
      if (Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z) < 1) this.timer = -1;
    } else if (this.state === 'rest') {
      if (this.timer < 0) this.state = 'prowl';
    } else if (this.state === 'watch') {
      this.target = { x: boy.x, z: boy.z };
      this.facing += wrap(Math.atan2(bx, bz) - this.facing) * damp(dt, 3);
      want = bd > 18 ? 0.8 : 0; // creeping closer, low to the ground
      if (bd < 13 && this.timer < 0) { this.state = 'charge'; this.timer = 1.4; if (this.kind === 'leopard') ev.growl?.(bd, 'leopard'); else ev.roar?.(bd); }
      if (bd > 40) { this.state = 'prowl'; this.timer = -1; }
    } else if (this.state === 'charge') {
      this.target = { x: boy.x, z: boy.z };
      want = this.kind === 'leopard' ? 10 : 8.5;
      if (bd < 2.2) { ev.snap?.(this.p.x, this.p.z, this.kind === 'lioness' ? 'lion' : this.kind); this.state = 'roar'; this.timer = 1.6; this.roar = 1; }
      else if (this.timer < 0) { this.state = 'roar'; this.timer = 1.6; this.roar = 1; if (this.kind === 'leopard') ev.growl?.(bd, 'leopard'); else ev.roar?.(bd); }
    } else if (this.state === 'roar') {
      this.facing += wrap(Math.atan2(bx, bz) - this.facing) * damp(dt, 6);
      if (this.timer < 0) { this.state = 'leave'; this.timer = 8; this.target = { x: this.home.x, z: this.home.z }; }
    } else if (this.state === 'leave') {
      want = 2.5;
      if (this.timer < 0) { this.state = 'prowl'; this.timer = -1; }
    }
    // keep to its own range in the hills
    if (Math.hypot(this.p.x - this.home.x, this.p.z - this.home.z) > this.home.r * 1.8 && this.state !== 'leave') { this.state = 'leave'; this.timer = 10; this.target = { x: this.home.x, z: this.home.z }; }
    this.speed += (want - this.speed) * damp(dt, this.state === 'charge' ? 5 : 3);
    if (this.speed > 0.05 && this.target) {
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z, d = Math.hypot(dx, dz) || 1;
      this.p.x += (dx / d) * this.speed * dt;
      this.p.z += (dz / d) * this.speed * dt;
      resolveCollisions(this.p, 0.5, undefined, true);
      this.facing += wrap(Math.atan2(dx, dz) - this.facing) * damp(dt, 5);
    }
    animateCat(this, dt, this.state === 'rest' ? 1 : 0, this.state === 'watch' ? 1 : 0, 0.74);
    this.roar += ((this.state === 'roar' ? 1 : 0) - this.roar) * damp(dt, 6);
    this.jaw.rotation.x = this.roar * 0.6 + (this.state === 'charge' ? 0.3 : 0);
    if (this.state === 'roar') this.neck.rotation.x = -0.25;
  }
}
// shared four-legged gait: walk/trot/gallop by speed, lying down, and a low stalking crouch
function animateCat(a, dt, rest, crouch, legH) {
  const gy = groundHeight(a.p.x, a.p.z);
  a.y += (gy - a.y) * damp(dt, 10);
  a.root.position.set(a.p.x, a.y, a.p.z);
  a.root.rotation.y = a.facing;
  a.restB += (rest - a.restB) * damp(dt, 1.5);
  a.crouchB = (a.crouchB ?? 0) + (crouch - (a.crouchB ?? 0)) * damp(dt, 3);
  const r = a.restB, c = a.crouchB;
  const gallop = Math.min(1, Math.max(0, (a.speed - 3) / 4));
  a.phase += a.speed * dt * (6.5 - gallop * 2.5) / Math.max(0.6, legH);
  const amp = Math.min(1, a.speed * 0.9) * (0.5 + gallop * 0.35);
  for (const l of a.legs) {
    const ph = a.phase + (gallop > 0.5 ? (l.front ? 0 : Math.PI * 0.8) : l.ph);
    l.hip.rotation.x = Math.sin(ph) * amp * (1 - r) + (l.front ? -1.4 : -1.25) * r + (l.front ? 0.2 : -0.3) * c * (1 - r);
    l.knee.rotation.x = Math.max(0, -Math.cos(ph)) * 0.9 * Math.min(1, a.speed) * (1 - r) + (l.front ? 0.1 : 2.4) * r + (l.front ? 0.4 : 0.6) * c * (1 - r);
  }
  a.body.position.y = legH * (1 - r) * (1 - c * 0.22) + 0.24 * r + Math.abs(Math.sin(a.phase)) * 0.03 * (1 - r);
  a.body.rotation.x = -gallop * Math.sin(a.phase * 2) * 0.05;
  a.neck.rotation.x = r * 0.35 + c * 0.35 + Math.sin(a.t * 0.7) * 0.04;
  a.tail.rotation.x = 0.3 + Math.sin(a.t * 1.2) * 0.2;
  a.tail.rotation.z = Math.sin(a.t * (c ? 3 : 0.9)) * (c ? 0.4 : 0.25);
  gaitPolish(a, dt, legH);
}

// ---------------- wolf pack ----------------
function hyenaCoat() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#a89068'; g.fillRect(0, 0, 256, 256);
  const R = rng(91); g.fillStyle = '#3a2c1e';
  for (let i = 0; i < 150; i++) { g.beginPath(); g.ellipse(R() * 256, R() * 256, 4 + R() * 5, 3 + R() * 4, R() * 3, 0, 7); g.fill(); }
  return tex(c);
}
class Wolf {
  constructor(home, R, leader = null, i = 0, kind = 'wolf') {
    this.kind = kind;
    const hy = kind === 'hyena';
    const coat = hy ? furMat('#ffffff', { rough: 0.95, map: hyenaCoat() }) : mat(['#7a746a', '#8a8378', '#5f5a52'][i % 3], 0.95), pale = mat(hy ? '#c4b08a' : '#d8d2c4', 0.95), dark = mat('#2a2622', 0.7);
    const q = quadruped({ L: 0.72, r: 0.17, legH: 0.6, legR: 0.035, coat, belly: pale, hoof: 'paw', sock: pale, deep: 1.15, neckLen: 0.2, neckTilt: 0.7, neckR: 0.09 });
    Object.assign(this, q);
    const h = this.head;
    part(ellipsoid(0.1, 0.09, 0.11), coat, h, 0, 0.02, 0);
    part(limbZ(0.06, 0.035, 0.17, 12), pale, h, 0, -0.03, 0.06);
    part(ellipsoid(0.025, 0.02, 0.02), dark, h, 0, -0.02, 0.235);
    for (const sx of [-1, 1]) { const e = hy ? part(ellipsoid(0.05, 0.06, 0.02), dark, h, sx * 0.07, 0.11, -0.03) : part(new THREE.ConeGeometry(0.045, 0.12, 8).scale(1, 1, 0.4), coat, h, sx * 0.055, 0.11, -0.03); e.rotation.z = -sx * 0.2; }
    if (hy) { part(ellipsoid(0.12, 0.11, 0.12), coat, h, 0, 0.02, -0.02); part(ellipsoid(0.04, 0.12, 0.2), dark, this.neck, 0, 0.12, 0.02); } // a broad head, and the bristly mane along the neck
    eyes(h, 0.045, 0.04, 0.08, 0.012);
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.06, 0.06);
    h.add(this.jaw);
    part(limbZ(0.04, 0.025, 0.15, 8).scale(1, 0.5, 1), pale, this.jaw);
    part(taperTube([[0, 0, 0], [0, -0.12, -0.12], [0, -0.3, -0.18], [0, -0.42, -0.14]], 0.06, 0.04), coat, this.tail);
    consolidate(this.root);
    this.home = home; this.R = R; this.leader = leader; this.i = i;
    this.p = { x: home.x + (R() - 0.5) * 6, z: home.z + (R() - 0.5) * 6 };
    this.y = heightAt(this.p.x, this.p.z);
    this.facing = R() * 6; this.speed = 0; this.phase = R() * 6; this.t = R() * 10;
    this.state = 'roam'; this.timer = 4; this.restB = 0; this.howl = 0; this.snapCool = 0;
  }
  update(dt, boy, ev, night) {
    this.t += dt;
    this.snapCool -= dt;
    const bx = boy.x - this.p.x, bz = boy.z - this.p.z, bd = Math.hypot(bx, bz);
    let want = 0;
    this.timer -= dt;
    if (bd < 16) {
      // circle the boy at a wary distance, growling; dart in if he comes too close
      if (this.state !== 'circle') { this.state = 'circle'; if (this.i === 0) { if (this.kind === 'hyena') ev.cackle?.(bd); else ev.growl?.(bd, 'wolf'); } }
      const a = Math.atan2(this.p.x - boy.x, this.p.z - boy.z) + dt * 0.5 + this.i * 0.002;
      const rr = bd < 3.5 && this.snapCool < 0 ? 0.8 : 7 + this.i;
      if (rr < 1 && bd < 2) { ev.snap?.(this.p.x, this.p.z, this.kind); this.snapCool = 4; }
      this.target = { x: boy.x + Math.sin(a + 0.3) * rr, z: boy.z + Math.cos(a + 0.3) * rr };
      want = rr < 1 ? 5 : 2.6;
    } else if (this.state === 'circle') { this.state = 'roam'; this.timer = 2; }
    if (this.state === 'roam') {
      if (this.leader) {
        const L = this.leader;
        const off = (this.i % 2 ? 1 : -1) * (1.5 + this.i);
        this.target = { x: L.p.x - Math.sin(L.facing) * 2 * this.i + Math.cos(L.facing) * off, z: L.p.z - Math.cos(L.facing) * 2 * this.i - Math.sin(L.facing) * off };
        const d = Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z);
        want = d > 4 ? 3 : d > 0.8 ? L.speed : 0;
      } else {
        if (!this.target || this.timer < 0) {
          const a = this.R() * 6.28, d = this.R() * this.home.r;
          this.target = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d };
          this.timer = 25;
          if (this.R() < 0.35) { this.state = 'sit'; this.timer = 10 + this.R() * 10; }
        }
        want = 2.0;
        if (Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z) < 1) this.timer = -1;
      }
    } else if (this.state === 'sit') {
      if (night && this.howl <= 0 && this.R() < dt * 0.15) { this.howl = 3; if (this.kind === 'hyena') ev.cackle?.(bd); else ev.howl?.(bd); }
      if (this.timer < 0) this.state = 'roam';
    }
    if (this.leader && this.leader.state === 'sit' && this.state === 'roam' && want === 0) { this.state = 'sit'; this.timer = this.leader.timer; }
    this.speed += (want - this.speed) * damp(dt, 4);
    if (this.speed > 0.05 && this.target) {
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z, d = Math.hypot(dx, dz) || 1;
      this.p.x += (dx / d) * this.speed * dt;
      this.p.z += (dz / d) * this.speed * dt;
      resolveCollisions(this.p, 0.3, undefined, true);
      this.facing += wrap((this.state === 'circle' && want < 3 ? Math.atan2(bx, bz) : Math.atan2(dx, dz)) - this.facing) * damp(dt, 5);
    }
    animateCat(this, dt, this.state === 'sit' ? 1 : 0, this.state === 'circle' ? 1 : 0, 0.6);
    this.howl -= dt;
    if (this.howl > 0) { this.neck.rotation.x = -1.0; this.jaw.rotation.x = 0.4; }
    else this.jaw.rotation.x = this.state === 'circle' ? 0.15 + Math.abs(Math.sin(this.t * 4)) * 0.15 : 0;
    // sitting wolves keep their front legs straight
    if (this.restB > 0.5) for (const l of this.legs) if (l.front) { l.hip.rotation.x = 0.1; l.knee.rotation.x = 0; }
  }
}

// ---------------- Asian elephants ----------------
class Elephant {
  constructor(home, R, scale = 1, leader = null, tusks = false) {
    const skin = mat('#6f6a66', 0.95), dark = mat('#4e4a47', 0.95), pink = mat('#8a6a62', 0.9), ivory = mat('#ece4d0', 0.4);
    const q = quadruped({ L: 2.1, r: 0.85, legH: 1.75, legR: 0.2, coat: skin, belly: dark, hoof: 'paw', sock: skin, deep: 1.1, wide: 0.95, neckLen: 0.3, neckTilt: 1.3, neckR: 0.55 });
    Object.assign(this, q);
    // domed back and the big head
    part(ellipsoid(0.7, 0.45, 0.9), skin, this.body, 0, 0.52, 0.15);
    const h = this.head;
    part(ellipsoid(0.55, 0.62, 0.55), skin, h, 0, 0.15, 0.15);
    part(ellipsoid(0.22, 0.22, 0.18), skin, h, -0.2, 0.55, 0.18);
    part(ellipsoid(0.22, 0.22, 0.18), skin, h, 0.2, 0.55, 0.18);
    eyes(h, 0.42, 0.18, 0.42, 0.035);
    // ears: big floppy fans that flap
    this.ears = [-1, 1].map((sx) => {
      const e = new THREE.Group();
      e.position.set(sx * 0.42, 0.3, 0.0);
      h.add(e);
      part(ellipsoid(0.05, 0.42, 0.34), skin, e, sx * 0.04, -0.12, -0.25);
      part(ellipsoid(0.03, 0.36, 0.28), pink, e, sx * 0.015, -0.12, -0.2);
      return e;
    });
    // trunk: a chain of tapering segments that sways and curls
    this.trunk = [];
    let parent = h, y0 = -0.2, z0 = 0.62;
    for (let i = 0; i < 7; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, y0, z0);
      parent.add(seg);
      const r0 = 0.2 - i * 0.022, r1 = 0.18 - i * 0.022, L = 0.26;
      part(limb(r0, r1, L, 10), i % 2 ? skin : dark, seg);
      this.trunk.push(seg);
      parent = seg; y0 = -L; z0 = 0;
    }
    if (tusks) for (const sx of [-1, 1]) part(taperTube([[0, 0, 0], [sx * 0.04, -0.3, 0.2], [sx * 0.08, -0.4, 0.45]], 0.06, 0.025), ivory, h, sx * 0.2, -0.15, 0.55);
    part(taperTube([[0, 0, 0], [0, -0.5, -0.1], [0, -0.9, -0.08]], 0.05, 0.03), skin, this.tail);
    part(ellipsoid(0.05, 0.12, 0.05), dark, this.tail, 0, -0.98, -0.08);
    consolidate(this.root);
    this.root.scale.setScalar(scale);
    this.scale = scale;
    this.home = home; this.R = R; this.leader = leader;
    this.p = { x: home.x + (R() - 0.5) * 12, z: home.z + (R() - 0.5) * 12 };
    this.y = heightAt(this.p.x, this.p.z);
    this.facing = R() * 6; this.speed = 0; this.phase = R() * 6; this.t = R() * 10;
    this.state = 'graze'; this.timer = 5 + R() * 10; this.restB = 0; this.target = null; this.charge = 0;
  }
  update(dt, boy, ev) {
    this.t += dt;
    this.timer -= dt;
    const bx = boy.x - this.p.x, bz = boy.z - this.p.z, bd = Math.hypot(bx, bz);
    let want = 0;
    if (!this.leader) {
      // the matriarch: trumpets at intruders and mock-charges if they come too close
      if (bd < 26 && this.state !== 'warn' && this.state !== 'charge') { this.state = 'warn'; this.timer = 3; ev.trumpet?.(bd); }
      if (this.state === 'warn') {
        this.facing += wrap(Math.atan2(bx, bz) - this.facing) * damp(dt, 2);
        if (bd < 11) { this.state = 'charge'; this.timer = 2; ev.trumpet?.(bd); }
        else if (bd > 32 && this.timer < 0) this.state = 'graze';
      } else if (this.state === 'charge') {
        this.target = { x: boy.x, z: boy.z }; want = 5;
        if (bd < 3.2 * this.scale) { ev.snap?.(this.p.x, this.p.z, 'elephant'); this.state = 'warn'; this.timer = 6; }
        if (this.timer < 0) { this.state = 'warn'; this.timer = 4; }
      } else if (this.state === 'graze') {
        if (this.timer < 0) { this.state = 'walk'; const a = this.R() * 6.28, d = this.R() * this.home.r; this.target = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d }; this.timer = 40; }
      } else if (this.state === 'walk') {
        want = 1.1;
        if (Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z) < 2 || this.timer < 0) { this.state = 'graze'; this.timer = 10 + this.R() * 20; }
      }
    } else {
      // the rest of the herd keeps close to her
      const L = this.leader;
      const off = this.scale < 0.6 ? 1.6 : 4;
      this.target = { x: L.p.x - Math.sin(L.facing) * off + Math.cos(L.facing) * (this.scale < 0.6 ? 2.2 : -3), z: L.p.z - Math.cos(L.facing) * off - Math.sin(L.facing) * (this.scale < 0.6 ? 2.2 : -3) };
      const d = Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z);
      want = d > 6 ? 2 : d > 1.5 ? 1 : 0;
      this.state = want ? 'walk' : 'graze';
    }
    this.speed += (want - this.speed) * damp(dt, 1.5);
    if (this.speed > 0.05 && this.target) {
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z, d = Math.hypot(dx, dz) || 1;
      this.p.x += (dx / d) * this.speed * dt;
      this.p.z += (dz / d) * this.speed * dt;
      resolveCollisions(this.p, 1.2 * this.scale, undefined, true);
      this.facing += wrap(Math.atan2(dx, dz) - this.facing) * damp(dt, 1.8);
    }
    animateCat(this, dt, 0, 0, 1.75);
    this.body.position.y = 1.75 + Math.abs(Math.sin(this.phase)) * 0.03;
    // trunk: hangs and sways while walking, curls up to the mouth while grazing, raised high when trumpeting
    const graze = this.state === 'graze' ? Math.max(0, Math.sin(this.t * 0.6)) : 0;
    const raise = this.state === 'warn' || this.state === 'charge' ? 1 : 0;
    this.trunk.forEach((sg, i) => {
      sg.rotation.x = Math.sin(this.t * 1.1 - i * 0.5) * 0.06 + graze * (i > 2 ? -0.45 : 0.1) - raise * (i < 2 ? 0.5 : 0.35);
      sg.rotation.z = Math.sin(this.t * 0.7 - i * 0.4) * 0.05 * (1 + this.speed);
    });
    this.neck.rotation.x = 0.1 - raise * 0.25 + graze * 0.1;
    this.ears.forEach((e, i) => (e.rotation.y = (i ? -1 : 1) * (0.25 + Math.sin(this.t * 1.6 + i) * 0.25 + raise * 0.8)));
    this.tail.rotation.z = Math.sin(this.t * 1.3) * 0.3;
  }
}


// ---------------- grazing herds: wild buffalo in the valley meadow, rhinos on the hills ----------------
// They graze and wander near home. Come too close and they snort and face you; the bull buffalo and the
// rhinos will make a short charge if you keep coming; the rest trot off.
class Grazer {
  constructor(home, R, kind, leader = null, scale = 1) {
    this.kind = kind; this.home = home; this.R = R; this.leader = leader; this.scale = scale;
    const rh = kind === 'rhino';
    const coat = mat(rh ? '#7c7570' : ['#26221f', '#2e2925', '#211d1b'][Math.floor(R() * 3)], 0.95);
    const dark = mat(rh ? '#5e5853' : '#151312', 0.9), horn = mat(rh ? '#4a443e' : '#3a342e', 0.5), pink = mat(rh ? '#8a7068' : '#3a2f2a', 0.8);
    const q = rh
      ? quadruped({ L: 2.0, r: 0.72, legH: 0.72, legR: 0.16, coat, belly: dark, hoof: 'paw', sock: coat, deep: 1.05, wide: 0.98, neckLen: 0.26, neckTilt: 1.55, neckR: 0.44 })
      : quadruped({ L: 1.55, r: 0.5, legH: 0.92, legR: 0.085, coat, belly: coat, hoof: '#141210', deep: 1.15, neckLen: 0.34, neckTilt: 1.2, neckR: 0.29 });
    Object.assign(this, q);
    const h = this.head;
    if (rh) {
      // the Indian rhino: folds of armour-like skin over shoulder and rump, a long head with one horn
      part(ellipsoid(0.8, 0.62, 0.5), coat, this.body, 0, 0.1, 0.55);
      part(ellipsoid(0.77, 0.64, 0.58), coat, this.body, 0, 0.1, -0.62);
      part(ellipsoid(0.82, 0.08, 0.06), dark, this.body, 0, 0.18, 0.08).rotation.z = Math.PI / 2;
      for (let k = 0; k < 18; k++) part(new THREE.SphereGeometry(0.035, 5, 4), dark, this.body, (R() - 0.5) * 1.2, -0.1 + R() * 0.5, (R() - 0.5) * 1.6); // the knobbly hide
      const hd = part(ellipsoid(0.24, 0.27, 0.5), coat, h, 0, -0.05, 0.25); hd.rotation.x = 0.35;
      part(ellipsoid(0.17, 0.15, 0.14), pink, h, 0, -0.2, 0.62);
      const hn = part(new THREE.ConeGeometry(0.1, 0.38, 10), horn, h, 0, 0.0, 0.66); hn.rotation.x = 0.25;
      for (const sx of [-1, 1]) { const e = part(new THREE.ConeGeometry(0.07, 0.18, 8), coat, h, sx * 0.14, 0.24, -0.12); e.rotation.z = -sx * 0.4; }
      eyes(h, 0.2, 0.06, 0.25, 0.02);
      part(taperTube([[0, 0, 0], [0, -0.25, -0.05], [0, -0.45, -0.02]], 0.05, 0.03), coat, this.tail);
    } else {
      // the wild water buffalo: a heavy dark body, a long face and great swept-back crescent horns
      part(ellipsoid(0.2, 0.22, 0.36), coat, h, 0, 0, 0.12);
      part(ellipsoid(0.16, 0.14, 0.13), pink, h, 0, -0.1, 0.4);
      for (const sx of [-1, 1]) {
        part(taperTube([[0, 0, 0], [sx * 0.32, 0.06, -0.08], [sx * 0.58, 0.18, -0.3], [sx * 0.6, 0.4, -0.48]], 0.075 * (scale > 1 ? 1.15 : 1), 0.02), horn, h, sx * 0.12, 0.17, 0.02);
        const e = part(ellipsoid(0.1, 0.05, 0.03), coat, h, sx * 0.21, 0.08, -0.02); e.rotation.z = sx * 0.4;
      }
      eyes(h, 0.15, 0.06, 0.24, 0.018);
      part(taperTube([[0, 0, 0], [0, -0.4, -0.06], [0, -0.7, -0.04]], 0.04, 0.02), coat, this.tail);
      part(ellipsoid(0.05, 0.1, 0.05), dark, this.tail, 0, -0.75, -0.04);
    }
    consolidate(this.root);
    this.root.scale.setScalar(scale);
    this.legH = rh ? 0.72 : 0.92;
    this.p = { x: home.x + (R() - 0.5) * 14, z: home.z + (R() - 0.5) * 14 };
    this.y = heightAt(this.p.x, this.p.z);
    this.facing = R() * 6; this.speed = 0; this.phase = R() * 6; this.t = R() * 10;
    this.state = 'graze'; this.timer = 4 + R() * 10; this.restB = 0; this.target = null; this.cool = 0;
  }
  update(dt, boy, ev) {
    this.t += dt; this.timer -= dt; this.cool -= dt;
    const bx = boy.x - this.p.x, bz = boy.z - this.p.z, bd = Math.hypot(bx, bz);
    const bold = this.kind === 'rhino' || !this.leader; // rhinos and the herd bull stand their ground
    let want = 0;
    if (this.state !== 'charge' && this.state !== 'flee' && bd < (bold ? 20 : 14)) {
      if (this.state !== 'warn') { this.state = 'warn'; this.timer = 3 + this.R() * 2; if (this.cool < 0) { ev.snort?.(bd); this.cool = 4; } }
    }
    if (this.state === 'warn') {
      this.facing += wrap(Math.atan2(bx, bz) - this.facing) * damp(dt, 2.5);
      if (!bold) { this.state = 'flee'; this.timer = 6; }
      else if (bd < 9 && this.timer < 0) { this.state = 'charge'; this.timer = 2.2; ev.snort?.(bd); }
      else if (bd > 26) { this.state = 'graze'; this.timer = 5; }
    } else if (this.state === 'charge') {
      this.target = { x: boy.x, z: boy.z }; want = this.kind === 'rhino' ? 6.5 : 6;
      if (bd < 2.4 * this.scale) { ev.snap?.(this.p.x, this.p.z, this.kind); this.state = 'flee'; this.timer = 4; }
      if (this.timer < 0) { this.state = 'flee'; this.timer = 4; }
    } else if (this.state === 'flee') {
      // trot off away from the boy, back toward home
      const ax = this.p.x - boy.x, az = this.p.z - boy.z, ad = Math.hypot(ax, az) || 1;
      this.target = { x: this.p.x + (ax / ad) * 10 + (this.home.x - this.p.x) * 0.2, z: this.p.z + (az / ad) * 10 + (this.home.z - this.p.z) * 0.2 };
      want = 3.2;
      if (this.timer < 0) { this.state = 'graze'; this.timer = 6; }
    } else if (this.state === 'graze') {
      if (this.leader && this.leader.state !== 'graze') { this.state = this.leader.state === 'walk' ? 'walk' : 'graze'; }
      if (this.timer < 0) {
        this.state = 'walk'; this.timer = 30;
        const L = this.leader;
        if (L) { const a = this.R() * 6.28; this.target = { x: L.p.x + Math.cos(a) * 6, z: L.p.z + Math.sin(a) * 6 }; }
        else { const a = this.R() * 6.28, d = this.R() * this.home.r; this.target = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d }; }
      }
    } else if (this.state === 'walk') {
      want = 0.9;
      if (!this.target || Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z) < 1.5 || this.timer < 0) { this.state = 'graze'; this.timer = 8 + this.R() * 18; }
    }
    if (Math.hypot(this.p.x - this.home.x, this.p.z - this.home.z) > this.home.r * 2 && this.state === 'graze') { this.state = 'walk'; this.target = { x: this.home.x, z: this.home.z }; this.timer = 40; }
    this.speed += (want - this.speed) * damp(dt, this.state === 'charge' ? 3 : 2);
    if (this.speed > 0.05 && this.target) {
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z, d = Math.hypot(dx, dz) || 1;
      this.p.x += (dx / d) * this.speed * dt; this.p.z += (dz / d) * this.speed * dt;
      resolveCollisions(this.p, 0.9 * this.scale, undefined, true);
      if (this.state !== 'warn') this.facing += wrap(Math.atan2(dx, dz) - this.facing) * damp(dt, 2.5);
    }
    animateCat(this, dt, 0, 0, this.legH);
    // grazing: head down to the grass now and then, a flick of the tail
    const graze = this.state === 'graze' ? Math.max(0, Math.sin(this.t * 0.5 + this.phase)) : 0;
    this.neck.rotation.x = graze * 0.9 + (this.state === 'warn' || this.state === 'charge' ? -0.15 : 0.05);
    this.tail.rotation.z = Math.sin(this.t * 1.7) * 0.35;
  }
}

// ---------------- a troop of langurs: grey with black faces and long tails ----------------
class Monkey {
  constructor(home, R, i, perch = null) {
    this.home = home; this.R = R; this.i = i; this.perch = perch;
    const coat = mat(i % 4 === 3 ? '#b49a74' : '#b9b2a4', 0.95), face = mat('#1a1715', 0.6), pale = mat('#e2ddd2', 0.95);
    const q = quadruped({ L: 0.36, r: 0.12, legH: 0.3, legR: 0.028, coat, belly: pale, hoof: 'paw', sock: face, deep: 1.05, neckLen: 0.07, neckTilt: 0.4, neckR: 0.06 });
    Object.assign(this, q);
    const h = this.head;
    part(ellipsoid(0.085, 0.085, 0.08), coat, h, 0, 0.03, 0);
    part(ellipsoid(0.06, 0.06, 0.04), face, h, 0, 0.01, 0.06);
    part(ellipsoid(0.1, 0.03, 0.06), pale, h, 0, 0.09, -0.01); // the pale brow fringe
    for (const sx of [-1, 1]) part(ellipsoid(0.02, 0.025, 0.01), face, h, sx * 0.08, 0.03, 0);
    eyes(h, 0.025, 0.035, 0.09, 0.008);
    // the long tail, held up in a loose curve
    part(taperTube([[0, 0, 0], [0, 0.15, -0.2], [0, 0.4, -0.35], [0, 0.6, -0.3], [0, 0.7, -0.15]], 0.02, 0.012), coat, this.tail);
    consolidate(this.root);
    this.root.scale.setScalar(i === 0 ? 1.15 : i % 3 === 2 ? 0.7 : 1);
    this.p = perch ? { x: perch.x, z: perch.z } : { x: home.x + (R() - 0.5) * 10, z: home.z + (R() - 0.5) * 10 };
    this.y = perch ? perch.y : heightAt(this.p.x, this.p.z);
    this.facing = R() * 6; this.speed = 0; this.phase = R() * 6; this.t = R() * 10;
    this.state = 'sit'; this.timer = R() * 6; this.restB = 1; this.target = null; this.cool = 0;
  }
  update(dt, boy, ev) {
    this.t += dt; this.timer -= dt; this.cool -= dt;
    const bx = boy.x - this.p.x, bz = boy.z - this.p.z, bd = Math.hypot(bx, bz);
    if (bd < 14 && this.cool < 0 && this.R() < dt * 0.6) { ev.chatter?.(bd); this.cool = 5; }
    if (this.perch) {
      // up in a tree: sitting on a branch, looking about, tail hanging down
      this.root.position.set(this.p.x, this.perch.y, this.p.z);
      this.root.rotation.y = this.facing + Math.sin(this.t * 0.3 + this.i) * 0.6;
      this.restB = 1;
      for (const l of this.legs) { l.hip.rotation.x = l.front ? -0.9 : -1.4; l.knee.rotation.x = l.front ? 0.3 : 2.2; }
      this.body.position.y = 0.14; this.body.rotation.x = -0.7;
      this.neck.rotation.x = 0.6 + Math.sin(this.t * 0.8) * 0.2;
      this.tail.rotation.x = 2.6 + Math.sin(this.t) * 0.2;
      return;
    }
    let want = 0;
    if (bd < 3 && this.cool < 1 && this.i === 1) { ev.snap?.(this.p.x, this.p.z, 'monkey'); this.cool = 8; this.state = 'run'; this.timer = 3; }
    if (this.state === 'sit') {
      if (this.timer < 0) { this.state = 'hop'; const a = this.R() * 6.28, d = this.R() * this.home.r; this.target = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d }; this.timer = 10; }
    } else if (this.state === 'hop') {
      want = 1.8;
      if (Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z) < 0.6 || this.timer < 0) { this.state = 'sit'; this.timer = 3 + this.R() * 10; }
    } else if (this.state === 'run') {
      const ax = this.p.x - boy.x, az = this.p.z - boy.z, ad = Math.hypot(ax, az) || 1;
      this.target = { x: this.p.x + (ax / ad) * 6, z: this.p.z + (az / ad) * 6 }; want = 4;
      if (this.timer < 0) { this.state = 'sit'; this.timer = 5; }
    }
    this.speed += (want - this.speed) * damp(dt, 5);
    if (this.speed > 0.05 && this.target) {
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z, d = Math.hypot(dx, dz) || 1;
      this.p.x += (dx / d) * this.speed * dt; this.p.z += (dz / d) * this.speed * dt;
      resolveCollisions(this.p, 0.15, undefined, true);
      this.facing += wrap(Math.atan2(dx, dz) - this.facing) * damp(dt, 8);
    }
    animateCat(this, dt, this.state === 'sit' ? 1 : 0, 0, 0.3);
    // hopping gait: a bound with each stride
    if (this.speed > 0.3) this.body.position.y += Math.abs(Math.sin(this.phase)) * 0.08;
    if (this.state === 'sit') { this.body.rotation.x = -0.6; this.neck.rotation.x = 0.5 + Math.sin(this.t * 0.9) * 0.25; for (const l of this.legs) if (l.front) { l.hip.rotation.x = -0.3; l.knee.rotation.x = 0.2; } }
    this.tail.rotation.x = (this.state === 'sit' ? 2.3 : 0.4) + Math.sin(this.t * 1.3) * 0.15;
  }
}

// ---------------- snakes: a cobra and two rat snakes slithering through the undergrowth ----------------
// The body is a chain of segments laid along the trail the head has left. Get close to the cobra and it
// rears up, spreads its hood and hisses.
class Snake {
  constructor(home, R, cobra) {
    this.home = home; this.R = R; this.cobra = cobra;
    const n = 30, len = cobra ? 2.0 : 1.7;
    this.n = n; this.gap = len / n;
    const c1 = cobra ? '#2b2822' : '#7a6630', c2 = cobra ? '#8a7a56' : '#4e4020';
    const m1 = new THREE.MeshStandardMaterial({ color: c1, roughness: 0.45 }), m2 = new THREE.MeshStandardMaterial({ color: c2, roughness: 0.45 });
    this.root = new THREE.Group();
    this.segs = [];
    for (let i = 0; i < n; i++) {
      const r = (cobra ? 0.045 : 0.038) * (i < 3 ? 0.85 + i * 0.05 : 1 - Math.max(0, (i - n * 0.55) / (n * 0.45)) * 0.8);
      const sg = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6).scale(1, 0.8, 1.6), (Math.floor(i / 2) % 3 === 0) ? m2 : m1);
      sg.castShadow = true; this.root.add(sg); this.segs.push(sg); sg.r = r;
    }
    // the head, with a flicking forked tongue; the cobra's hood (hidden until it rears)
    const head = this.segs[0];
    const hm = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8).scale(0.05, 0.032, 0.075), m1); hm.position.set(0, 0.005, 0.03); head.add(hm);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), new THREE.MeshStandardMaterial({ color: '#d8b020', roughness: 0.2 })); e.position.set(sx * 0.03, 0.02, 0.05); head.add(e); }
    this.tongue = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, 0.07), new THREE.MeshStandardMaterial({ color: '#b0202a' })); this.tongue.position.set(0, 0, 0.1); head.add(this.tongue);
    if (cobra) { this.hood = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).scale(0.13, 0.17, 0.025), m1); this.hood.position.set(0, -0.07, -0.02); this.hood.visible = false; this.segs[3].add(this.hood); }
    this.p = { x: home.x + (R() - 0.5) * 6, z: home.z + (R() - 0.5) * 6 };
    this.facing = R() * 6; this.t = R() * 10; this.speed = 0;
    this.trail = []; for (let i = 0; i < n * 3; i++) this.trail.push({ x: this.p.x - Math.sin(this.facing) * i * this.gap / 3, z: this.p.z - Math.cos(this.facing) * i * this.gap / 3 });
    this.state = 'rest'; this.timer = 4 + R() * 8; this.rear = 0; this.cool = 0; this.target = null;
  }
  update(dt, boy, ev) {
    this.t += dt; this.timer -= dt; this.cool -= dt;
    const bx = boy.x - this.p.x, bz = boy.z - this.p.z, bd = Math.hypot(bx, bz);
    let want = 0;
    if (this.cobra && bd < 6) {
      if (this.state !== 'rear') { this.state = 'rear'; ev.hiss?.(bd); this.cool = 2; }
      this.facing += wrap(Math.atan2(bx, bz) - this.facing) * damp(dt, 3);
      if (bd < 1.6 && this.cool < 0) { ev.snap?.(this.p.x, this.p.z, 'snake'); this.cool = 4; }
    } else if (this.state === 'rear') { this.state = 'rest'; this.timer = 4; }
    else if (!this.cobra && bd < 4) { this.state = 'go'; this.target = { x: this.p.x - bx * 3, z: this.p.z - bz * 3 }; this.timer = 5; } // a rat snake slips away
    if (this.state === 'rest' && this.timer < 0) { this.state = 'go'; const a = this.R() * 6.28, d = this.R() * this.home.r; this.target = { x: this.home.x + Math.cos(a) * d, z: this.home.z + Math.sin(a) * d }; this.timer = 25; }
    if (this.state === 'go') {
      want = this.cobra ? 0.45 : 0.6;
      if (Math.hypot(this.target.x - this.p.x, this.target.z - this.p.z) < 0.5 || this.timer < 0) { this.state = 'rest'; this.timer = 6 + this.R() * 14; }
    }
    this.speed += (want - this.speed) * damp(dt, 3);
    if (this.speed > 0.02 && this.target) {
      // the head weaves side to side as it goes
      const dx = this.target.x - this.p.x, dz = this.target.z - this.p.z;
      this.facing += wrap(Math.atan2(dx, dz) + Math.sin(this.t * 3.2) * 0.7 - this.facing) * damp(dt, 4);
      this.p.x += Math.sin(this.facing) * this.speed * dt; this.p.z += Math.cos(this.facing) * this.speed * dt;
      // lay down trail behind the head
      const last = this.trail[0];
      if (Math.hypot(this.p.x - last.x, this.p.z - last.z) > this.gap / 3) { this.trail.unshift({ x: this.p.x, z: this.p.z }); this.trail.length = this.n * 3; }
    }
    this.rear += ((this.state === 'rear' ? 1 : 0) - this.rear) * damp(dt, 4);
    if (this.hood) { this.hood.visible = this.rear > 0.3; this.hood.scale.set(0.3 + this.rear * 0.7, 1, 1); }
    // place the body along the trail; the cobra's front third lifts when it rears
    const lift = this.rear * 0.5;
    for (let i = 0; i < this.n; i++) {
      const s = this.segs[i];
      const a = i === 0 ? this.p : this.trail[Math.min(this.trail.length - 1, i * 3)], b = this.trail[Math.min(this.trail.length - 1, i * 3 + 3)];
      const up = i < 9 ? lift * Math.pow(1 - i / 9, 1.3) : 0;
      // reared: the raised part stands up straight above where it was coiled
      const ax = a.x, az = a.z;
      s.position.set(ax, groundHeight(ax, az) + s.r * 0.8 + up, az);
      s.rotation.y = i === 0 && this.rear > 0.3 ? this.facing : Math.atan2(a.x - b.x, a.z - b.z);
      s.rotation.x = up > 0.02 && i > 0 ? -1.0 * this.rear : 0;
    }
    this.tongue.visible = Math.sin(this.t * 7) > 0.2;
    this.tongue.scale.z = 0.5 + Math.abs(Math.sin(this.t * 7)) * 0.5;
  }
}

export function buildWildlife(scene) {
  const R = rng(31337);
  const crocs = [[460, 1], [372, -1], [420, 1], [-340, -1], [-395, 1], [-450, -1]].map(([z, sd]) => [Math.sign(z) * warpR(Math.abs(z)), sd]).map(([z, side]) => new Crocodile(z, side, R));
  const tiger = new Tiger({ ...WILD.tiger }, R);
  const wolfHome = { ...WILD.wolf };
  const leader = new Wolf(wolfHome, R, null, 0);
  const wolves = [leader, new Wolf(wolfHome, R, leader, 1), new Wolf(wolfHome, R, leader, 2), new Wolf(wolfHome, R, leader, 3)];
  const eHome = { ...WILD.elephant };
  const matriarch = new Elephant(eHome, R, 1.0, null, false);
  const elephants = [matriarch, new Elephant(eHome, R, 1.08, matriarch, true), new Elephant(eHome, R, 0.92, matriarch), new Elephant(eHome, R, 0.5, matriarch)];
  const leopards = WILD.leopards.map((h) => new Tiger({ ...h }, R, 'leopard'));
  // out by the ring line: the jungle's lions, hyenas, monkeys and snakes, buffalo in the valley, rhinos on the hills
  const J = JUNGLE_HOMES;
  const lions = [new Tiger({ ...J.lions }, R, 'lion'), new Tiger({ ...J.lions }, R, 'lioness'), new Tiger({ ...J.lions }, R, 'lioness')];
  for (const l of lions) { l.p.x += (R() - 0.5) * 12; l.p.z += (R() - 0.5) * 12; }
  const hyLead = new Wolf({ ...J.hyenas }, R, null, 0, 'hyena');
  const hyenas = [hyLead, new Wolf({ ...J.hyenas }, R, hyLead, 1, 'hyena'), new Wolf({ ...J.hyenas }, R, hyLead, 2, 'hyena')];
  const bull = new Grazer({ ...J.buffalo }, R, 'buffalo', null, 1.12);
  const buffalo = [bull, ...[0.95, 1, 0.9, 0.6].map((sc) => new Grazer({ ...J.buffalo }, R, 'buffalo', bull, sc))];
  const rhinos = [new Grazer({ ...J.rhinos }, R, 'rhino', null, 1), new Grazer({ ...J.rhinos }, R, 'rhino', null, 0.95), new Grazer({ ...J.rhinos }, R, 'rhino', null, 0.55)];
  // a few of the troop sit up in the trees nearest their patch
  const nearTrees = layout.trees.filter((t) => Math.hypot(t.x - J.monkeys.x, t.z - J.monkeys.z) < 30).slice(0, 3);
  const monkeys = [];
  for (let i = 0; i < 7; i++) {
    const t = i >= 4 ? nearTrees[i - 4] : null;
    monkeys.push(new Monkey({ ...J.monkeys }, R, i, t ? { x: t.x + 0.6, z: t.z + 0.3, y: heightAt(t.x, t.z) + 3.4 * t.s } : null));
  }
  const snakes = J.snakes.map((h, i) => new Snake({ ...h }, R, i === 0));
  const all = [...crocs, tiger, ...leopards, ...wolves, ...elephants, ...lions, ...hyenas, ...buffalo, ...rhinos, ...monkeys, ...snakes];
  for (const a of all) scene.add(a.root);
  let night = false;
  return {
    crocs, tiger, leopards, wolves, elephants, lions, hyenas, buffalo, rhinos, monkeys, snakes,
    setNight(v) { night = v; },
    update(dt, boy, ev) {
      for (const a of all) {
        const p = a.p ?? a;
        const far = Math.abs(p.x - boy.x) > 160 || Math.abs(p.z - boy.z) > 160;
        a.root.visible = !far;
        if (far && a !== leader && a !== matriarch && a !== hyLead && a !== bull) continue;
        a.update(dt, boy, ev, night);
      }
    },
    colliders() {
      return [...leopards.map((l) => ({ kind: 'c', x: l.p.x, z: l.p.z, r: 0.35 })), ...elephants.map((e) => ({ kind: 'c', x: e.p.x, z: e.p.z, r: 1.3 * e.scale })), ...crocs.map((c) => ({ kind: 'c', x: c.x, z: c.z, r: 0.5 })), { kind: 'c', x: tiger.p.x, z: tiger.p.z, r: 0.5 }, ...wolves.map((w) => ({ kind: 'c', x: w.p.x, z: w.p.z, r: 0.3 })),
        ...lions.map((l) => ({ kind: 'c', x: l.p.x, z: l.p.z, r: 0.5 })), ...[...buffalo, ...rhinos].map((g) => ({ kind: 'c', x: g.p.x, z: g.p.z, r: 0.8 * g.scale }))];
    },
    nearest(x, z) {
      let m = Infinity, kind = null;
      for (const c of crocs) { const d = Math.hypot(c.x - x, c.z - z); if (d < m) { m = d; kind = 'crocodile'; } }
      for (const w of [tiger, ...wolves]) { const d = Math.hypot(w.p.x - x, w.p.z - z); if (d < m) { m = d; kind = w === tiger ? 'tiger' : 'wolf'; } }
      return { d: m, kind };
    },
  };
}
