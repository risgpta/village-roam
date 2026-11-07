// A small black roadster bicycle the boy can ride: spoked wheels, steerable fork, turning cranks,
// and an IK pose that puts his feet on the pedals and hands on the handlebar.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ellipsoid, lathe } from './shapes.js';

const WR = 0.3; // wheel radius
export const BIKE = {
  WR,
  rear: new THREE.Vector3(0, WR, -0.3),
  front: new THREE.Vector3(0, WR, 0.64),
  bb: new THREE.Vector3(0, 0.27, 0.14), // crank axle
  crank: 0.11,
  saddle: new THREE.Vector3(0, 0.66, -0.06),
  bar: new THREE.Vector3(0, 0.84, 0.42), // hand grips (x = ±0.22)
  head: new THREE.Vector3(0, 0.58, 0.54),
};

function tube(a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// a spoked wheel: a rounded tyre with a knobbly tread, a box-section rim, 28 crossed spokes, hub flanges, a valve
function wheel(mats, fat = 1) {
  const g = new THREE.Group();
  const tr = 0.022 * fat;
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(WR - tr, tr, 10, 48).rotateY(Math.PI / 2), mats.rubber);
  const knobs = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    knobs.push(new THREE.BoxGeometry(tr * 1.5, 0.006, 0.012).translate(i % 2 ? tr * 0.35 : -tr * 0.35, WR - 0.002, 0).rotateX(a));
  }
  const tread = new THREE.Mesh(mergeGeometries(knobs), mats.rubber);
  const rimGeo = [];
  for (const sx of [-1, 1]) rimGeo.push(new THREE.TorusGeometry(WR - tr * 2 - 0.004, 0.006, 4, 40).rotateY(Math.PI / 2).translate(sx * 0.008, 0, 0));
  rimGeo.push(new THREE.CylinderGeometry(WR - tr * 2 - 0.008, WR - tr * 2 - 0.008, 0.016, 40, 1, true).rotateZ(Math.PI / 2));
  const rim = new THREE.Mesh(mergeGeometries(rimGeo.map((q) => q.index ? q.toNonIndexed() : q)), mats.chrome);
  const spokes = [];
  const n = 28, rr = WR - tr * 2 - 0.01;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const side = i % 2 ? 0.028 : -0.028;
    const off = (i % 4 < 2 ? 1 : -1) * 0.35; // crossed lacing: spokes leave the hub tangentially
    spokes.push(tube(V(side, Math.cos(a + off) * 0.025, Math.sin(a + off) * 0.025), V(side * 0.2, Math.cos(a) * rr, Math.sin(a) * rr), 0.0018));
  }
  spokes.push(new THREE.CylinderGeometry(0.014, 0.014, 0.075, 12).rotateZ(Math.PI / 2));
  for (const sx of [-1, 1]) spokes.push(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 16).rotateZ(Math.PI / 2).translate(sx * 0.028, 0, 0));
  spokes.push(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 5).translate(0, rr - 0.005, 0));
  const sp = new THREE.Mesh(mergeGeometries(spokes.map((q) => q.index ? q.toNonIndexed() : q)), mats.chrome);
  g.add(tyre, tread, rim, sp);
  for (const m of [tyre, tread, rim, sp]) m.castShadow = true;
  return g;
}

export class Bicycle {
  constructor() {
    const mats = {
      frame: new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.5, roughness: 0.35 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#1b1918', roughness: 0.9 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.9, roughness: 0.22 }),
      saddle: new THREE.MeshStandardMaterial({ color: '#4a2c1a', roughness: 0.6 }),
      gold: new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.7, roughness: 0.3 }),
    };
    this.mats = mats;
    const B = BIKE;
    this.root = new THREE.Group();
    this.frame = new THREE.Group();
    this.root.add(this.frame);
    const seatTop = V(0, 0.6, -0.1);
    const headBot = V(0, 0.5, 0.56), headTop = V(0, 0.64, 0.52);
    const parts = [
      tube(B.bb, seatTop, 0.016), tube(seatTop, headTop, 0.015), tube(B.bb, headBot, 0.018), tube(headBot, headTop, 0.022),
    ];
    for (const sx of [-0.045, 0.045]) {
      parts.push(tube(V(sx * 0.6, B.bb.y, B.bb.z), V(sx, B.rear.y, B.rear.z), 0.009));
      parts.push(tube(V(sx * 0.3, seatTop.y - 0.02, seatTop.z), V(sx, B.rear.y, B.rear.z), 0.008));
    }
    // rear carrier and mudguard stays
    parts.push(new THREE.BoxGeometry(0.14, 0.012, 0.32).translate(0, WR + 0.14, B.rear.z - 0.02));
    for (const sx of [-0.06, 0.06]) parts.push(tube(V(sx, WR + 0.14, B.rear.z - 0.16), V(sx * 0.8, B.rear.y, B.rear.z), 0.006));
    const frameMesh = new THREE.Mesh(mergeGeometries(parts), mats.frame);
    frameMesh.castShadow = true;
    this.frame.add(frameMesh);
    // gold pin-striping on the down tube, seat post, saddle with springs
    this.frame.add(new THREE.Mesh(tube(V(0, 0.33, 0.24), V(0, 0.44, 0.44), 0.019), mats.gold));
    this.frame.add(new THREE.Mesh(tube(seatTop, V(0, B.saddle.y - 0.03, B.saddle.z), 0.011), mats.chrome));
    const saddle = new THREE.Mesh(ellipsoid(0.07, 0.025, 0.12, 14, 8), mats.saddle);
    saddle.position.copy(B.saddle);
    saddle.castShadow = true;
    this.frame.add(saddle);
    // mudguards
    for (const [c, start] of [[B.rear, Math.PI * 0.35], [B.front, Math.PI * 0.1]]) {
      const mg = new THREE.Mesh(new THREE.TorusGeometry(WR + 0.03, 0.022, 4, 20, Math.PI * 0.75).scale(1, 1, 1), mats.frame);
      mg.rotation.y = Math.PI / 2;
      mg.rotation.x = 0;
      mg.rotation.z = start;
      mg.position.copy(c);
      mg.scale.set(1, 1, 0.35);
      this.frame.add(mg);
    }
    // wheels
    this.rearW = wheel(mats); this.rearW.position.copy(B.rear); this.frame.add(this.rearW);
    // steerable fork + handlebar + front wheel
    this.fork = new THREE.Group();
    this.fork.position.copy(headTop);
    this.frame.add(this.fork);
    this.forkTilt = Math.atan2(headTop.z - headBot.z, headTop.y - headBot.y);
    const fp = [];
    const fl = (p) => V(p.x - headTop.x, p.y - headTop.y, p.z - headTop.z);
    for (const sx of [-0.04, 0.04]) fp.push(tube(fl(V(sx * 0.5, headBot.y, headBot.z)), fl(V(sx, B.front.y, B.front.z)), 0.01));
    fp.push(tube(V(0, 0, 0), fl(V(0, B.bar.y, B.bar.z + 0.04)), 0.012));
    fp.push(tube(fl(V(-0.24, B.bar.y, B.bar.z)), fl(V(0.24, B.bar.y, B.bar.z)), 0.011));
    const forkMesh = new THREE.Mesh(mergeGeometries(fp), mats.chrome);
    forkMesh.castShadow = true;
    this.fork.add(forkMesh);
    for (const sx of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.09, 8).rotateZ(Math.PI / 2), mats.rubber);
      grip.position.copy(fl(V(sx * 0.21, B.bar.y, B.bar.z)));
      this.fork.add(grip);
    }
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.chrome);
    bell.position.copy(fl(V(0.13, B.bar.y + 0.015, B.bar.z)));
    this.fork.add(bell);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.05, 10).rotateX(Math.PI / 2), mats.chrome);
    lamp.position.copy(fl(V(0, B.head.y - 0.03, B.head.z + 0.06)));
    this.fork.add(lamp);
    this.frontW = wheel(mats);
    this.frontW.position.copy(fl(B.front));
    this.fork.add(this.frontW);
    // chainring, chain and cranks
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 4, 20).rotateY(Math.PI / 2), mats.chrome);
    ring.position.set(0.055, B.bb.y, B.bb.z);
    this.frame.add(ring);
    const chain = new THREE.Mesh(mergeGeometries([
      tube(V(0.055, B.bb.y + 0.075, B.bb.z), V(0.055, B.rear.y + 0.035, B.rear.z), 0.005),
      tube(V(0.055, B.bb.y - 0.075, B.bb.z), V(0.055, B.rear.y - 0.035, B.rear.z), 0.005),
    ]), mats.rubber);
    this.frame.add(chain);
    this.crankG = new THREE.Group();
    this.crankG.position.copy(B.bb);
    this.frame.add(this.crankG);
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.025, B.crank).translate(0, 0, (sx * B.crank) / 2), mats.chrome);
      arm.position.x = sx * 0.075;
      this.crankG.add(arm);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.018, 0.045), mats.rubber);
      pedal.position.set(sx * 0.11, 0, sx * B.crank);
      this.crankG.add(pedal);
    }
    // kickstand (down when parked)
    this.stand = new THREE.Mesh(tube(V(0.04, 0.27, -0.05), V(0.14, 0.0, -0.18), 0.008), mats.frame);
    this.frame.add(this.stand);
    this.crank = 0;
    this.roll = 0;
    this.L = BIKE;
    this.kind = 'bicycle';
  }
  foot(side, out) { return this.pedal(side, out); }
  // crank angle a: right pedal at (y = cos a * crank, z = sin a * crank) about the bottom bracket
  pedal(side, out) {
    const a = this.crank + (side > 0 ? 0 : Math.PI);
    return out.set(side * 0.11, BIKE.bb.y + Math.cos(a) * BIKE.crank, BIKE.bb.z + Math.sin(a) * BIKE.crank);
  }
  update(dt, speed, steer, riding) {
    const wheelTurn = (speed * dt) / WR;
    this.rearW.rotation.x += wheelTurn;
    this.frontW.rotation.x += wheelTurn;
    if (riding) this.crank += wheelTurn / 1.9;
    // crankG rotates so that the right crank arm (along +z at rotation 0) points at angle "crank"
    this.crankG.rotation.x = this.crank - Math.PI / 2;
    this.fork.quaternion.setFromAxisAngle(new THREE.Vector3(0, Math.cos(this.forkTilt), Math.sin(this.forkTilt)), riding ? steer : 0.35);
    this.stand.visible = !riding;
  }
}

// ---------------- riding pose ----------------
const _t = new THREE.Vector3();
export function ik2(dy, dz, L1, L2) {
  const d = Math.min(Math.hypot(dy, dz), L1 + L2 - 1e-3);
  const phi = Math.atan2(dz, -dy); // angle forward from straight down
  const a = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const b = Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  return { phi, a, bend: Math.PI - b };
}

// Pose a human rig (from buildHuman) on the bike. Positions are in the rig root's space.
export function poseRider(rig, bike, lean = 0.32) {
  const k = rig.k;
  const L1 = 0.43 * k, L2 = 0.42 * k + 0.03 * k;
  const hipY = rig.hipY;
  const B = bike.L;
  rig.body.position.y = B.saddle.y + 0.04 - hipY;
  rig.body.position.z = B.saddle.z + 0.02;
  rig.legs.forEach((l, i) => {
    const side = i === 0 ? -1 : 1;
    bike.foot(side, _t);
    const hy = rig.body.position.y + hipY, hz = rig.body.position.z;
    const s = ik2(_t.y - hy, _t.z - hz, L1, L2);
    l.hip.rotation.x = -(s.phi + s.a);
    l.knee.rotation.x = s.bend;
    l.hip.rotation.z = -side * 0.06;
  });
  rig.torso.rotation.x = lean;
  rig.torso.rotation.y = 0;
  // shoulders → grips
  const shY = rig.body.position.y + hipY + Math.cos(lean) * 0.505 * k;
  const shZ = rig.body.position.z + Math.sin(lean) * 0.505 * k;
  const A1 = 0.3 * k, A2 = 0.32 * k;
  rig.arms.forEach((a, i) => {
    const side = i === 0 ? -1 : 1;
    const s = ik2(B.bar.y - shY, B.bar.z - shZ, A1, A2);
    a.shoulder.rotation.x = -(s.phi - s.a) - lean;
    a.shoulder.rotation.z = side * 0.12;
    a.elbow.rotation.x = -s.bend;
  });
}

// ---------------- the moped ----------------
// A cheap, rough little two-stroke moped: faded red tank, cracked black seat, rusty carrier,
// a round headlamp, spoked wheels and a smoky exhaust.
const MR = 0.27;
export const MOPED = {
  rear: V(0, MR, -0.46), front: V(0, MR, 0.62),
  saddle: V(0, 0.7, -0.2), bar: V(0, 0.92, 0.4), peg: V(0.15, 0.3, 0.06),
  exhaust: V(0.16, 0.24, -0.72),
};
export class Moped {
  constructor() {
    const mats = {
      paint: new THREE.MeshStandardMaterial({ color: '#9c3126', roughness: 0.55, metalness: 0.25 }),
      rust: new THREE.MeshStandardMaterial({ color: '#6a3a22', roughness: 0.95 }),
      frame: new THREE.MeshStandardMaterial({ color: '#1e1c1b', roughness: 0.5, metalness: 0.4 }),
      engine: new THREE.MeshStandardMaterial({ color: '#7a7c7e', roughness: 0.6, metalness: 0.5 }),
      chrome: new THREE.MeshStandardMaterial({ color: '#b9bdc0', metalness: 0.85, roughness: 0.28 }),
      rubber: new THREE.MeshStandardMaterial({ color: '#1b1918', roughness: 0.9 }),
      seat: new THREE.MeshStandardMaterial({ color: '#211d1b', roughness: 0.75 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffe6aa', emissiveIntensity: 0.3 }),
    };
    this.mats = mats;
    const M = MOPED;
    this.L = MOPED;
    this.kind = 'moped';
    this.root = new THREE.Group();
    this.frame = new THREE.Group();
    this.root.add(this.frame);
    const add = (geo, m, p = this.frame) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; p.add(o); return o; };
    const headTop = V(0, 0.82, 0.5), headBot = V(0, 0.6, 0.56);
    add(mergeGeometries([
      tube(headBot, V(0, 0.34, 0.12), 0.026), tube(V(0, 0.34, 0.12), V(0, 0.36, -0.2), 0.024), tube(V(0, 0.36, -0.2), V(0, 0.62, -0.32), 0.022),
      tube(headTop, V(0, 0.64, -0.06), 0.022), tube(headBot, headTop, 0.03),
      tube(V(0.07, 0.36, -0.2), V(0.07, M.rear.y, M.rear.z), 0.014), tube(V(-0.07, 0.36, -0.2), V(-0.07, M.rear.y, M.rear.z), 0.014),
    ]), mats.frame);
    // rear shocks
    for (const sx of [-0.08, 0.08]) {
      add(tube(V(sx, M.rear.y + 0.02, M.rear.z), V(sx, 0.64, -0.36), 0.016), mats.chrome);
      const spring = add(new THREE.TorusGeometry(0.022, 0.006, 4, 10), mats.chrome);
      spring.position.set(sx, 0.5, -0.41); spring.rotation.x = Math.PI / 2 - 0.4; spring.scale.z = 3;
    }
    // tank, seat, side panels, carrier
    const tank = add(ellipsoid(0.13, 0.1, 0.26, 16, 10), mats.paint);
    tank.position.set(0, 0.74, 0.18); tank.rotation.x = -0.18;
    const spot = add(ellipsoid(0.05, 0.03, 0.06, 8, 6), mats.rust);
    spot.position.set(0.11, 0.73, 0.25);
    add(lathe([[0.0, 0], [0.035, 0], [0.035, 0.03], [0, 0.035]], 10), mats.chrome).position.set(0, 0.83, 0.2);
    const seat = add(ellipsoid(0.11, 0.045, 0.24, 14, 8), mats.seat);
    seat.position.copy(M.saddle); seat.position.y -= 0.02;
    const panel = add(ellipsoid(0.12, 0.13, 0.16, 12, 8), mats.paint);
    panel.position.set(0, 0.5, -0.24);
    add(new THREE.BoxGeometry(0.2, 0.015, 0.34), mats.rust).position.set(0, 0.68, -0.58);
    for (const sx of [-0.09, 0.09]) add(tube(V(sx, 0.68, -0.72), V(sx * 0.9, M.rear.y + 0.05, M.rear.z - 0.05), 0.008), mats.rust);
    // engine, cylinder fins, exhaust
    add(new THREE.BoxGeometry(0.2, 0.2, 0.3), mats.engine).position.set(0, 0.28, -0.05);
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.17, 0.012, 0.16), mats.engine).position.set(0, 0.38 + i * 0.022, 0.07);
    add(mergeGeometries([tube(V(0.06, 0.3, 0.08), V(0.14, 0.22, -0.1), 0.02), tube(V(0.14, 0.22, -0.1), V(0.16, 0.24, -0.45), 0.022)]), mats.chrome);
    const muffler = add(new THREE.CylinderGeometry(0.045, 0.04, 0.32, 10).rotateX(Math.PI / 2), mats.rust);
    muffler.position.set(0.16, 0.24, -0.58);
    // pedals/foot pegs
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.08, 0.02, 0.05), mats.rubber).position.set(sx * M.peg.x, M.peg.y, M.peg.z);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6).rotateZ(Math.PI / 2), mats.frame).position.set(0, M.peg.y, M.peg.z);
    // mudguards
    for (const [c, rz] of [[M.rear, Math.PI * 0.4], [M.front, Math.PI * 0.05]]) {
      const mg = add(new THREE.TorusGeometry(MR + 0.04, 0.03, 4, 18, Math.PI * 0.8), mats.paint);
      mg.rotation.set(0, Math.PI / 2, rz); mg.position.copy(c); mg.scale.set(1, 1, 0.4);
    }
    this.rearW = wheel(mats, 1.9); this.rearW.scale.setScalar(MR / WR); this.rearW.position.copy(M.rear); this.frame.add(this.rearW);
    // fork, handlebar, headlamp
    this.fork = new THREE.Group();
    this.fork.position.copy(headTop);
    this.frame.add(this.fork);
    this.forkTilt = Math.atan2(headTop.z - headBot.z, headTop.y - headBot.y);
    const fl = (p) => V(p.x - headTop.x, p.y - headTop.y, p.z - headTop.z);
    add(mergeGeometries([
      ...[-0.05, 0.05].map((sx) => tube(fl(V(sx, headBot.y, headBot.z)), fl(V(sx, M.front.y, M.front.z)), 0.016)),
      tube(V(0, 0, 0), fl(V(0, M.bar.y, M.bar.z + 0.04)), 0.016),
      tube(fl(V(-0.3, M.bar.y + 0.02, M.bar.z - 0.02)), fl(V(0.3, M.bar.y + 0.02, M.bar.z - 0.02)), 0.012),
    ]), mats.chrome, this.fork);
    for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8).rotateZ(Math.PI / 2), mats.rubber, this.fork).position.copy(fl(V(sx * 0.26, M.bar.y + 0.02, M.bar.z - 0.02)));
    const lampShell = add(new THREE.SphereGeometry(0.075, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), mats.chrome, this.fork);
    lampShell.position.copy(fl(V(0, 0.76, 0.62)));
    const lens = add(new THREE.CircleGeometry(0.068, 14), mats.lamp, this.fork);
    lens.position.copy(fl(V(0, 0.76, 0.62)));
    this.frontW = wheel(mats, 1.9); this.frontW.scale.setScalar(MR / WR); this.frontW.position.copy(fl(M.front)); this.fork.add(this.frontW);
    this.stand = add(tube(V(0.05, 0.3, -0.15), V(0.16, 0.0, -0.25), 0.012), mats.frame);
    this.exhaust = new THREE.Vector3(0.16, 0.24, -0.76);
  }
  foot(side, out) { return out.set(side * MOPED.peg.x, MOPED.peg.y + 0.03, MOPED.peg.z); }
  update(dt, speed, steer, riding, night = 0) {
    const turn = (speed * dt) / MR;
    this.rearW.rotation.x += turn;
    this.frontW.rotation.x += turn;
    this.fork.quaternion.setFromAxisAngle(new THREE.Vector3(0, Math.cos(this.forkTilt), Math.sin(this.forkTilt)), riding ? steer : 0.4);
    this.stand.visible = !riding;
    this.mats.lamp.emissiveIntensity = riding ? 0.6 + night * 3 : 0.1;
  }
}
