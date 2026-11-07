// The little boy: the same smooth human rig as the villagers (child proportions) with procedural
// walk / run / idle animation, and weather gear — an umbrella in the rain, a lantern after dark.
import * as THREE from 'three';
import { buildHuman } from './people.js';
import { Gear } from './gear.js';
import { poseRider } from './bicycle.js';
import { poseRower } from './vehicles.js';

export class Boy {
  constructor() {
    const rig = buildHuman({ k: 0.72, headScale: 1.24, dress: 'shorts', top: '#e9a23b', bottom: '#3f5a7a', skin: '#8a5a3c', sleeves: 'short' });
    Object.assign(this, rig);
    this.gear = new Gear(this);
    this.gearB = 0;
    this.phase = 0;
    this.blend = 0;
    this.t = 0;
    this.lastStepSign = 1;
    this.onStep = null;
  }

  setGear(mode) { if (mode !== this.gear.mode) this.gear.set(mode); }

  // swimming: b = 0 treading water upright, 1 a forward front crawl with a flutter kick
  swim(dt, speed, b) {
    this.t += dt;
    this.swimPh = (this.swimPh || 0) + dt * (1.6 + speed * 1.4);
    const ph = this.swimPh;
    const th = 0.25 + b * 1.12;
    this.body.rotation.x = th;
    this.body.position.set(0, 0, -this.hipY * Math.sin(th) * 0.45);
    this.torso.rotation.set(0, Math.sin(ph) * 0.25 * b, 0);
    this.torso.scale.set(1, 1, 1);
    this.head.rotation.x = -th * 0.8;
    this.head.rotation.y = Math.sin(ph) * 0.35 * b + (1 - b) * Math.sin(this.t * 0.5) * 0.4;
    this.legs.forEach((l, i) => {
      const kick = Math.sin(ph * 3 + i * Math.PI);
      l.hip.rotation.set(kick * 0.35 * b + (1 - b) * Math.sin(this.t * 2 + i * Math.PI) * 0.3, 0, (i ? 1 : -1) * 0.05);
      l.knee.rotation.x = 0.15 + Math.max(0, kick) * 0.4 * b + (1 - b) * 0.5;
    });
    this.arms.forEach((a, i) => {
      // freestyle: each arm circles over, opposite the other; treading water sculls side to side
      const c = ph + i * Math.PI;
      const crawl = -((c % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      a.shoulder.rotation.x = crawl * b + (1 - b) * (-0.9 + Math.sin(this.t * 3 + i) * 0.2);
      a.shoulder.rotation.z = (i ? 1 : -1) * (0.15 + (1 - b) * (0.5 + Math.sin(this.t * 3 + i * Math.PI) * 0.35));
      a.elbow.rotation.x = -0.25 - Math.max(0, Math.sin(c)) * 0.6 * b - (1 - b) * 0.6;
    });
    this.blend = 0;
  }

  // rowing the boat: seated on the thwart, hands on the oar grips
  row(dt, boat) {
    this.t += dt;
    poseRower(this, boat);
    this.torso.scale.set(1, 1, 1);
    this.head.rotation.set(-0.1, Math.sin(this.t * 0.4) * 0.35, 0);
    this.blend = 0;
    const want = this.gear.mode !== 'none' ? 1 : 0;
    this.gearB += (want - this.gearB) * (1 - Math.exp(-dt * 6));
    if (this.gear.mode === 'lantern') { this.gear.update(dt); }
  }

  // riding the bicycle: feet on the pedals, hands on the bars, a look around now and then
  ride(dt, bike, speed) {
    this.t += dt;
    this.body.rotation.x = 0;
    poseRider(this, bike, 0.3 + Math.min(1, speed / 8) * 0.12);
    this.torso.scale.set(1, 1, 1);
    this.head.rotation.y = Math.sin(this.t * 0.4) * 0.25 * (speed < 1 ? 1 : 0.3);
    this.head.rotation.x = -0.18;
    this.blend = 0;
    const want = this.gear.mode !== 'none' ? 1 : 0;
    this.gearB += (want - this.gearB) * (1 - Math.exp(-dt * 6));
    if (this.gear.mode !== 'none') {
      this.gear.pose(this.gearB);
      this.gear.update(dt);
    }
  }

  update(dt, speed, airborne = false, vy = 0) {
    this.t += dt;
    this.air = (this.air || 0) + ((airborne ? 1 : 0) - (this.air || 0)) * (1 - Math.exp(-dt * 14));
    const air = this.air;
    const moving = speed > 0.15 ? 1 : 0;
    this.blend += (moving - this.blend) * (1 - Math.exp(-dt * 8));
    const b = this.blend;
    const run = THREE.MathUtils.clamp((speed - 2.2) / 1.8, 0, 1);
    this.phase += speed * dt * (5.4 - run * 1.2);
    const amp = 0.5 + run * 0.4;

    this.legs.forEach((l, i) => {
      const ph = this.phase + i * Math.PI;
      l.hip.rotation.x = Math.sin(ph) * amp * b;
      l.knee.rotation.x = b * (0.08 + Math.max(0, -Math.cos(ph)) * (0.85 + run * 0.6));
      const tuck = i === 0 ? -0.75 : 0.25;
      l.hip.rotation.x += (tuck - l.hip.rotation.x) * air;
      l.knee.rotation.x += ((i === 0 ? 1.2 : 0.7) - l.knee.rotation.x) * air;
    });
    this.arms.forEach((a, i) => {
      const ph = this.phase + i * Math.PI;
      a.shoulder.rotation.x = -Math.sin(ph) * (0.45 + run * 0.4) * b;
      a.elbow.rotation.x = -0.12 - (0.2 + run * 0.9) * b;
      a.shoulder.rotation.x += ((vy > 0 ? -1.6 : -0.9) - a.shoulder.rotation.x) * air;
      a.shoulder.rotation.z = (i ? 1 : -1) * (0.1 + air * 0.35);
    });

    const bob = Math.abs(Math.cos(this.phase)) * (0.03 + run * 0.03) * b;
    const breathe = Math.sin(this.t * 2.2) * 0.006 * (1 - b);
    this.body.position.y = bob - 0.015 * b;
    this.body.position.z = 0;
    this.body.rotation.x = 0;
    for (const l of this.legs) l.hip.rotation.z = 0;
    this.torso.rotation.x = run * 0.18 * b + 0.03 * b;
    this.torso.scale.set(1 + breathe, 1 + breathe, 1 + breathe);
    this.torso.rotation.y = Math.sin(this.phase) * 0.08 * b;
    const look = (1 - b) * (Math.sin(this.t * 0.45) * 0.45 + Math.sin(this.t * 0.17) * 0.25);
    this.head.rotation.y = look;
    this.head.rotation.x = (1 - b) * Math.sin(this.t * 0.3) * 0.06;

    // namaste: hands folded at the chest, a little bow of the head
    this.greetT = Math.max(0, (this.greetT ?? 0) - dt);
    const gB = Math.min(1, this.greetT * 3) * (1 - air);
    if (gB > 0) this.arms.forEach((a, i) => {
      a.shoulder.rotation.x += (-0.8 - a.shoulder.rotation.x) * gB;
      a.shoulder.rotation.z += ((i ? -0.42 : 0.42) - a.shoulder.rotation.z) * gB;
      a.elbow.rotation.x += (-1.5 - a.elbow.rotation.x) * gB;
    });
    if (gB > 0) this.head.rotation.x += 0.25 * gB;
    const want = this.gear.mode !== 'none' ? 1 - air * 0.6 : 0;
    this.gearB += (want - this.gearB) * (1 - Math.exp(-dt * 6));
    if (this.gear.mode !== 'none') {
      this.gear.pose(this.gearB);
      this.gear.update(dt);
    }

    const sign = Math.sign(Math.sin(this.phase));
    if (b > 0.5 && air < 0.2 && sign !== this.lastStepSign) {
      this.lastStepSign = sign;
      if (this.onStep) this.onStep(run);
    }
  }
}
