// A small two-seat helicopter on a helipad beside the airstrip: a bubble canopy, a slim tail boom with a
// tail rotor, skids, and a two-bladed main rotor that spins up when the boy climbs in. It flies like an easy
// arcade helicopter: R/F climb and sink (let go and it holds its height), W/S tilt the nose to fly forward
// and back, A/D turn, Z/X slide sideways; let go of everything and it slows to a hover.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export const HELI = { saddle: V(0, 0.86, 0), bar: V(0, 1.02, 0.36) };
const BX = -0.32; // the pilot sits in the right-hand seat; the body is shifted so his seat is at the origin
const ROTOR_Y = 2.75, ROTOR_R = 4.3;

export class Helicopter {
  constructor() {
    this.kind = 'heli';
    this.L = { saddle: HELI.saddle.clone(), bar: HELI.bar.clone() };
    this.root = new THREE.Group();
    const g = new THREE.Group(); g.position.x = BX; this.root.add(g); this.body = g;
    const add = (geo, m, x = 0, y = 0, z = 0, p = g, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; p.add(o); return o; };
    const livery = canvas(512, 256, (c, w, h) => {
      c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f08a24'; c.fillRect(0, h * 0.56, w, h * 0.07);
      c.fillStyle = '#178a4a'; c.fillRect(0, h * 0.64, w, h * 0.05);
      c.fillStyle = '#21304a'; c.fillRect(0, h * 0.86, w, h * 0.14);
    });
    const paint = new THREE.MeshStandardMaterial({ map: livery, roughness: 0.32, metalness: 0.15 });
    const white = std('#f4f2ec', { roughness: 0.32, metalness: 0.15 }), navy = std('#21304a', { roughness: 0.4 });
    const dark = std('#26262a', { roughness: 0.6 }), metal = std('#b8bcc2', { metalness: 0.85, roughness: 0.3 }), black = std('#141416', { roughness: 0.5 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#a8c8da', transparent: true, opacity: 0.28, roughness: 0.04, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    this.mats = { paint: white };
    // the cabin: a rounded lower tub, and the big glass bubble over the seats
    const tub = add(new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, Math.PI * 0.48, Math.PI * 0.52), paint, 0, 1.0, 0.15);
    tub.scale.set(0.82, 0.62, 1.15);
    const bubble = add(new THREE.SphereGeometry(1, 28, 18, -Math.PI / 2 - 1.25, 2.5, 0, Math.PI * 0.55), glass, 0, 1.0, 0.15, g, false);
    bubble.scale.set(0.8, 0.95, 1.12); bubble.renderOrder = 2;
    // the back of the cabin and the roof fairing over the engine
    add(new THREE.SphereGeometry(1, 22, 14, Math.PI / 2 + 0.6, Math.PI * 2 - 1.2, 0, Math.PI), white, 0, 1.15, -0.25).scale.set(0.78, 0.7, 0.62);
    add(new THREE.CapsuleGeometry(0.34, 0.9, 6, 14).rotateX(Math.PI / 2), white, 0, 1.95, -0.45);
    add(new THREE.CylinderGeometry(0.07, 0.09, 0.62, 10), metal, 0, 2.42, -0.1); // the mast
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 14), dark, 0, 2.7, -0.1);
    // the tail boom tapering back, the fin, the little stabiliser and the tail rotor
    add(new THREE.CylinderGeometry(0.07, 0.2, 4.4, 12).rotateX(Math.PI / 2), white, 0, 1.55, -2.85);
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 10).rotateX(Math.PI / 2), navy, 0, 1.55, -2.0);
    const finShape = new THREE.Shape([[0, 0], [-0.35, 0.95], [-0.62, 1.0], [-0.5, 0], [-0.45, -0.55], [-0.2, -0.5]].map(([z, y]) => new THREE.Vector2(z, y)));
    const fin = add(new THREE.ExtrudeGeometry(finShape, { depth: 0.05, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.025, 0, 0), navy, 0, 1.55, -4.85);
    void fin;
    add(new THREE.BoxGeometry(1.1, 0.04, 0.32), navy, 0, 1.5, -4.55);
    this.tailRotor = new THREE.Group(); this.tailRotor.position.set(0.12, 1.75, -5.05); g.add(this.tailRotor);
    for (const s of [1, -1]) add(new THREE.BoxGeometry(0.03, 0.62, 0.08), dark, 0, s * 0.31, 0, this.tailRotor);
    this.tailDisc = add(new THREE.CircleGeometry(0.62, 24).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#2a2a2a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 0.13, 1.75, -5.05, g, false);
    // skids on their curved struts
    for (const sx of [-1, 1]) {
      add(new THREE.CapsuleGeometry(0.045, 2.6, 4, 8).rotateX(Math.PI / 2), metal, sx * 0.9, 0.05, 0.05);
      const tip = add(new THREE.CylinderGeometry(0.045, 0.045, 0.4, 8).rotateX(Math.PI / 2 - 0.6), metal, sx * 0.9, 0.16, 1.48); void tip;
      for (const z of [0.75, -0.6]) { const st = add(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8), metal, sx * 0.72, 0.38, z); st.rotation.z = sx * 0.45; }
    }
    // the main rotor: two long blades, and a faint disc when it's spinning fast
    this.rotor = new THREE.Group(); this.rotor.position.set(0, ROTOR_Y, -0.1); g.add(this.rotor);
    const blade = new THREE.BoxGeometry(ROTOR_R, 0.035, 0.26).translate(ROTOR_R / 2 + 0.15, 0, 0);
    for (const r of [0, Math.PI]) { const b = add(blade, black, 0, 0, 0, this.rotor); b.rotation.y = r; }
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12), dark, 0, 0, 0, this.rotor);
    this.disc = add(new THREE.CircleGeometry(ROTOR_R + 0.15, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#202022', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 0, ROTOR_Y + 0.02, -0.1, g, false);
    // inside: two seats, a little panel, the cyclic stick between the pilot's knees, pedals
    for (const sx of [0.32, -0.32]) {
      add(new THREE.BoxGeometry(0.46, 0.1, 0.46), std('#3a3e52', { roughness: 0.75 }), sx, 0.8, -0.02);
      add(new THREE.BoxGeometry(0.46, 0.62, 0.1), std('#3a3e52', { roughness: 0.75 }), sx, 1.12, -0.32);
    }
    add(new THREE.BoxGeometry(0.9, 0.04, 1.4), dark, 0, 0.58, 0.2);
    const panel = add(new THREE.BoxGeometry(0.75, 0.24, 0.12), dark, 0, 1.12, 0.78); panel.rotation.x = -0.4;
    this.cyclic = new THREE.Group(); this.cyclic.position.set(0.32, 0.62, 0.28); g.add(this.cyclic);
    add(new THREE.CylinderGeometry(0.015, 0.02, 0.44, 6), black, 0, 0.22, 0, this.cyclic);
    add(new THREE.SphereGeometry(0.03, 8, 6), black, 0, 0.45, 0, this.cyclic);
    this.pedals = [];
    for (const s of [-1, 1]) this.pedals.push(add(new THREE.BoxGeometry(0.08, 0.12, 0.03), dark, 0.32 + s * 0.13, 0.66, 0.66));
    // registration on the boom, lights
    const reg = canvas(256, 64, (c, w, h) => { c.fillStyle = '#21304a'; c.font = 'bold 44px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('VT-HELI', w / 2, h / 2); });
    const regM = new THREE.MeshBasicMaterial({ map: reg, transparent: true });
    for (const s of [1, -1]) { const r = add(new THREE.PlaneGeometry(1.2, 0.3), regM, s * 0.165, 1.56, -3.0, g, false); r.rotation.y = s * Math.PI / 2; }
    const lamp = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.1 });
    this.navL = lamp('#ff2a20'); this.navR = lamp('#20ff5a'); this.beacon = lamp('#ff3020');
    const bulb = new THREE.SphereGeometry(0.05, 8, 6);
    add(bulb, this.navL, 0.62, 1.3, 0.1); add(bulb, this.navR, -0.62, 1.3, 0.1); add(bulb, this.beacon, 0, 2.32, -0.95); add(bulb, this.beacon, 0, 2.5, -4.75);
    this.exhaust = V(BX, 1.9, -1.0);
    this.rpm = 0; this.spin = 0; this.t = 0;
  }
  foot(side, out) { return out.set(side * 0.13, 0.68, 0.62); }
  update(dt, speed, steer, riding, night = 0) {
    if (riding) return;
    this.animate(dt, { collective: 0, pitch: 0, roll: 0, yaw: 0, night, engine: false });
  }
  animate(dt, s) {
    this.t += dt;
    const want = s.engine ? 1 : 0;
    this.rpm += (want - this.rpm) * (1 - Math.exp(-dt * (want > this.rpm ? 0.45 : 0.25)));
    this.spin += this.rpm * dt * 42;
    this.rotor.rotation.y = this.spin;
    this.tailRotor.rotation.x = this.spin * 4.5;
    const blur = clamp((this.rpm - 0.35) * 1.8, 0, 1);
    this.disc.material.opacity = blur * 0.16;
    this.tailDisc.material.opacity = blur * 0.2;
    // the blades droop at rest and lift as they come up to speed
    for (const b of this.rotor.children) if (b.geometry.type === 'BoxGeometry') b.rotation.z = (1 - this.rpm) * -0.05 + this.rpm * 0.02 * (1 + s.collective);
    this.cyclic.rotation.set(-s.pitch * 0.25, 0, -s.roll * 0.25);
    this.L.bar.set(-s.roll * 0.04, 1.02, 0.36 - s.pitch * 0.05);
    this.pedals[0].position.z = 0.66 + s.yaw * 0.04; this.pedals[1].position.z = 0.66 - s.yaw * 0.04;
    const k = s.engine ? (s.night ? 4 : 1.2) : 0.05;
    this.navL.emissiveIntensity = this.navR.emissiveIntensity = k;
    this.beacon.emissiveIntensity = s.engine ? 0.3 + Math.max(0, Math.sin(this.t * 6)) * (s.night ? 6 : 2.5) : 0.05;
  }
}

// ---------- the flight model ----------
// Simple and forgiving: the rotor must come up to speed before it will lift; the collective (R/F) sets how
// fast it climbs or sinks and with nothing held it keeps its height; tilting forward or sideways moves it,
// and letting go levels it and slows it to a hover. Same events as the plane: lift-off, touchdown, crash.
const G = 9.81;
const _e = new THREE.Euler(), _v = new THREE.Vector3();
const SKIDS = [V(BX + 0.9, 0, 1.2), V(BX - 0.9, 0, 1.2), V(BX + 0.9, 0, -1.1), V(BX - 0.9, 0, -1.1)];
const DISC = [V(BX + ROTOR_R, ROTOR_Y, -0.1), V(BX - ROTOR_R, ROTOR_Y, -0.1), V(BX, ROTOR_Y, ROTOR_R - 0.1), V(BX, ROTOR_Y, -ROTOR_R - 0.1), V(BX, 1.75, -5.1)];
export class HeliFlight {
  constructor() {
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.q = new THREE.Quaternion();
    this.rate = new THREE.Vector3();
    this.reset(0, 0, 0, 0);
  }
  reset(x, y, z, heading) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.rate.set(0, 0, 0);
    this.heading = heading; this.tiltP = 0; this.tiltR = 0;
    this.q.setFromEuler(_e.set(0, heading, 0, 'YXZ'));
    this.ground = true; this.crashed = false; this.engine = false; this.rotorRpm = 0;
    this.throttle = 0; this.collective = 0; this.v = 0;
    this.gear = 1; this.gearDown = true; this.flaps = 0; this.belly = false; this.pushback = false;
    this.airspeed = 0; this.agl = 0; this.vs = 0; this.bank = 0; this.pitch = 0; this.alpha = 0; this.stall = false;
    this.airTime = 0; this.assist = true;
  }
  fwd(out = new THREE.Vector3()) { return out.set(0, 0, 1).applyQuaternion(this.q); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.q); }
  world(p, out = new THREE.Vector3()) { return out.copy(p).applyQuaternion(this.q).add(this.pos); }
  // inp: lift (+1 climb, −1 sink), fwd (+1 nose down / forward), side (+1 right), yaw (+1 turn right)
  update(dt, inp, env) {
    const ev = [];
    if (this.crashed) return ev;
    // the rotor spins up (about 6 s) and down
    this.rotorRpm += ((this.engine ? 1 : 0) - this.rotorRpm) * (1 - Math.exp(-dt * (this.engine ? 0.45 : 0.25)));
    const ready = this.rotorRpm > 0.88;
    // collective: the climb/sink rate asked for
    let vsT = !ready ? -2 : inp.lift > 0 ? 5 * inp.lift : inp.lift < 0 ? 3.5 * inp.lift : this.ground ? -0.5 : 0;
    if (this.assist && vsT < 0 && !this.ground) vsT = Math.max(vsT, -0.8 - this.agl * 0.4); // eases off for a soft touchdown
    this.collective += ((inp.lift > 0 ? 1 : inp.lift < 0 ? 0.15 : 0.5) * (ready ? 1 : this.rotorRpm * 0.5) - this.collective) * (1 - Math.exp(-dt * 3));
    this.throttle = this.collective;
    // tilt: forward/back and sideways, eased; flat on the ground
    const air = !this.ground;
    const tP = air ? -inp.fwd * 0.32 : 0, tR = air ? inp.side * 0.26 + inp.yaw * 0.12 * Math.min(1, this.airspeed / 15) : 0;
    this.tiltP += (tP - this.tiltP) * (1 - Math.exp(-dt * 2.6));
    this.tiltR += (tR - this.tiltR) * (1 - Math.exp(-dt * 2.6));
    if (air || ready) this.heading -= inp.yaw * (air ? 0.9 : 0.6) * dt;
    this.q.setFromEuler(_e.set(-this.tiltP, this.heading, this.tiltR, 'YXZ'));
    // forces
    const up = this.up(_v);
    const cosT = Math.max(0.5, up.y);
    const rho = Math.exp(-Math.max(0, this.pos.y) / 1800);
    let T = ready ? (G + (vsT - this.vel.y) * 2.2) / cosT : this.rotorRpm * G * 0.6;
    T = clamp(T, 0, 18) * Math.min(1, rho * 1.15);
    this.vel.x += up.x * T * dt; this.vel.z += up.z * T * dt;
    this.vel.y += (up.y * T - G) * dt;
    // drag; with the stick let go it slows itself to a hover
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const drag = 0.06 + hs * 0.012 + (this.assist && Math.abs(inp.fwd) + Math.abs(inp.side) < 0.05 ? 0.55 : 0);
    const k = Math.exp(-dt * drag);
    this.vel.x *= k; this.vel.z *= k;
    this.vel.y *= Math.exp(-dt * 0.3);
    if (this.ground) { this.vel.x *= Math.exp(-dt * 8); this.vel.z *= Math.exp(-dt * 8); }
    this.pos.addScaledVector(this.vel, dt);
    const gy = env.ground(this.pos.x, this.pos.z);
    this.agl = this.pos.y - gy;
    this.airspeed = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    this.v = Math.hypot(this.vel.x, this.vel.z);
    this.vs = this.vel.y; this.bank = this.tiltR; this.pitch = this.tiltP;
    // over water low down: down she goes
    if (env.wet(this.pos.x, this.pos.z) && this.pos.y < env.waterY + 0.3) { this.crash('water', ev); return ev; }
    // the rotor disc and the tail clipping the ground or anything tall
    for (let i = 0; i < DISC.length; i++) {
      const w = this.world(DISC[i], _v);
      const g2 = env.ground(w.x, w.z);
      if (w.y < g2 + 0.05 && air) { this.crash('rotor', ev); return ev; }
      if (this.agl < 10) { const p = { x: w.x, z: w.z }; if (env.hit(p, 0.4, w.y, w.y - g2)) { this.crash(air || this.v > 3 ? 'hit' : 'rotor', ev); return ev; } }
    }
    // on the skids
    if (this.pos.y <= gy) {
      const sink = -this.vel.y;
      this.pos.y = gy;
      if (air) {
        if (sink > 5 || Math.abs(this.tiltR) > 0.35 || Math.abs(this.tiltP) > 0.35 || this.v > 12) { this.crash(sink > 5 ? 'hard' : 'rotor', ev); return ev; }
        this.ground = true;
        ev.push({ type: 'touchdown', sink, speed: this.v, air: this.airTime });
      }
      this.vel.y = Math.max(0, this.vel.y);
    } else if (this.ground && this.agl > 0.15) {
      this.ground = false; this.airTime = 0;
      ev.push({ type: 'liftoff' });
    }
    if (!this.ground) this.airTime += dt;
    this.rate.set(0, 0, 0);
    return ev;
  }
  crash(why, ev) {
    this.crashed = true; this.engine = false; this.v = 0;
    ev.push({ type: 'crash', why, speed: this.vel.length() });
    this.vel.set(0, 0, 0);
  }
}

// ---------- the helipad: a concrete circle with the big yellow H ----------
export function buildHelipad(scene, pad, groundHeight) {
  const tex = canvas(512, 512, (c, w, h) => {
    c.fillStyle = '#9c968c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#f2c418'; c.lineWidth = 26; c.beginPath(); c.arc(w / 2, h / 2, w * 0.4, 0, 7); c.stroke();
    c.fillStyle = '#f4f1e8'; c.font = 'bold 280px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', w / 2, h / 2 + 12);
    c.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 400; i++) c.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  });
  const g = new THREE.Group();
  const y = groundHeight(pad.x, pad.z);
  g.position.set(pad.x, y, pad.z);
  g.rotation.y = pad.rot;
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.2, 0.3, 40), [new THREE.MeshStandardMaterial({ color: '#8a847a', roughness: 0.95 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#8a847a' })]);
  slab.position.y = 0.0; slab.receiveShadow = true; g.add(slab);
  // little edge lights round the rim
  const lm = new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffcc40', emissiveIntensity: 0.2 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const l = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), lm); l.position.set(Math.cos(a) * 6.8, 0.2, Math.sin(a) * 6.8); g.add(l); }
  scene.add(g);
  return { setNight(n) { lm.emissiveIntensity = n ? 3 : 0.2; }, top: y + 0.15 };
}
