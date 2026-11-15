// The village's water buffaloes. Through the day most of them wallow in the river a little way below the ghat —
// only the back, the head and the swept-back horns above the water, an ear flicking, now and then a snort
// and a slow roll that sends ripples out — while a few graze on the bank. Toward dark they wade out and stand
// on the bank for the night.
import * as THREE from 'three';
import { quadruped, eyes, consolidate } from './animals.js';
import { ellipsoid, taperTube, furMat } from './shapes.js';
import { groundHeight, riverX, RIVER_HALF, WATER_Y, WATER, layout } from './world.js';
import { rng } from './noise.js';

function part(geo, m, parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.castShadow = true;
  parent.add(o);
  return o;
}
// the domestic buffalo: slate-black and heavy, a long face with a broad wet muzzle, horns curling back and in
export function makeBuffalo(R, scale = 1) {
  const coat = furMat(['#2b2826', '#33302d', '#252220'][Math.floor(R() * 3)], { rough: 0.9, short: true, sheen: 0.25 });
  const dark = furMat('#171514', { rough: 0.9, short: true }), horn = new THREE.MeshStandardMaterial({ color: '#4a443c', roughness: 0.45 });
  const muzzle = new THREE.MeshStandardMaterial({ color: '#3d3330', roughness: 0.35 });
  const q = quadruped({ L: 1.5, r: 0.5, legH: 0.86, legR: 0.085, coat, belly: coat, hoof: '#141210', deep: 1.2, neckLen: 0.34, neckTilt: 1.15, neckR: 0.28 });
  const h = q.head;
  part(ellipsoid(0.2, 0.21, 0.36), coat, h, 0, 0, 0.12);
  part(ellipsoid(0.16, 0.13, 0.13), muzzle, h, 0, -0.1, 0.41);
  for (const sx of [-1, 1]) {
    part(taperTube([[0, 0, 0], [sx * 0.26, 0.03, -0.1], [sx * 0.42, 0.1, -0.32], [sx * 0.34, 0.2, -0.52], [sx * 0.2, 0.27, -0.58]], 0.07, 0.018), horn, h, sx * 0.12, 0.17, 0.02);
    const e = part(ellipsoid(0.11, 0.05, 0.03), coat, h, sx * 0.22, 0.07, -0.03); e.rotation.z = sx * 0.4;
    part(new THREE.SphereGeometry(0.016, 8, 6), dark, h, sx * 0.05, -0.1, 0.53); // nostrils
  }
  eyes(h, 0.15, 0.06, 0.24, 0.018);
  part(taperTube([[0, 0, 0], [0, -0.4, -0.06], [0, -0.72, -0.04]], 0.04, 0.02), coat, q.tail);
  part(ellipsoid(0.05, 0.1, 0.05), dark, q.tail, 0, -0.78, -0.04);
  consolidate(q.root);
  q.root.scale.setScalar(scale);
  return q;
}

export function buildBuffaloes(scene, hooks = {}) {
  const R = rng(4242), G = layout.ghat;
  const WY = () => WATER_Y + WATER.off;
  const list = [];
  // a quiet stretch of the river 25–60 m below the ghat; the village is on the west bank
  const z0 = G.z - 26;
  const mk = (i, bathes) => {
    const scale = i === 0 ? 1.08 : i > 5 ? 0.62 : 0.9 + R() * 0.14; // a big bull, the cows, and a calf or two
    const q = makeBuffalo(R, scale);
    const z = z0 - i * 4.6 - R() * 2;
    const bank = { x: riverX(z) - RIVER_HALF - 3.5 - R() * 5, z: z + (R() - 0.5) * 3 };
    const water = { x: riverX(z) - RIVER_HALF * (0.05 + R() * 0.5), z };
    const b = { q, scale, bathes, bank, water, p: { ...(bathes ? water : bank) }, facing: R() * 6.28, t: R() * 20, phase: R() * 6, walk: 0, roll: 5 + R() * 20, snort: 4 + R() * 30, dip: 0 };
    scene.add(q.root);
    list.push(b);
  };
  for (let i = 0; i < 8; i++) mk(i, i < 5 || i === 7);
  let night = false;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  return {
    list,
    setNight(n) { night = n; },
    colliders() { return list.filter((b) => !b.inWater).map((b) => ({ kind: 'c', x: b.p.x, z: b.p.z, r: 0.75 * b.scale })); },
    update(dt, player, time) {
      const near = Math.abs(player.x - list[0].water.x) + Math.abs(player.z - (z0 - 18)) < 260;
      for (const b of list) {
        b.q.root.visible = near;
        if (!near) continue;
        b.t += dt;
        // where it wants to be: in the water by day, on the bank at night
        const goal = b.bathes && !night ? b.water : b.bank;
        const dx = goal.x - b.p.x, dz = goal.z - b.p.z, d = Math.hypot(dx, dz);
        const moving = d > 0.4;
        b.walk += ((moving ? 1 : 0) - b.walk) * (1 - Math.exp(-dt * 3));
        if (moving) {
          const sp = 0.75 * b.scale;
          b.p.x += (dx / d) * sp * dt; b.p.z += (dz / d) * sp * dt;
          b.facing += wrap(Math.atan2(dx, dz) - b.facing) * (1 - Math.exp(-dt * 2));
          b.phase += dt * 3.2;
        }
        // standing depth: the legs on the river bed where it is shallow, afloat (wallowing) where it is deep
        const ground = groundHeight(b.p.x, b.p.z), wy = WY();
        const sink = 1.02 * b.scale; // how much of it goes under when it settles
        const y = Math.max(ground, wy - sink);
        b.inWater = ground < wy - 0.25;
        const deep = THREE.MathUtils.clamp((wy - ground) / sink, 0, 1);
        // a slow roll onto one side and back, and the head going under for a moment
        b.roll -= dt;
        if (b.roll < 0) b.roll = 14 + Math.random() * 30;
        const rolling = b.inWater && !moving && b.roll < 4 ? Math.sin((b.roll / 4) * Math.PI) : 0;
        const r = b.q.root;
        r.position.set(b.p.x, y + (b.inWater ? Math.sin(b.t * 0.9) * 0.025 : 0) - rolling * 0.12, b.p.z);
        r.rotation.set(0, b.facing, rolling * 0.35 * (b.phase > 3 ? 1 : -1));
        // legs: a plodding walk; folded out of the way when afloat
        b.q.legs.forEach((l) => {
          const ph = b.phase + l.ph + (l.front ? 0 : Math.PI * 0.5);
          l.hip.rotation.x = Math.sin(ph) * 0.3 * b.walk + (l.front ? 0.03 : -0.03);
          if (l.knee) l.knee.rotation.x = Math.max(0, -Math.cos(ph)) * 0.35 * b.walk * (l.front ? 1 : -1);
        });
        // the head: held just clear of the water when wallowing, down to graze on the bank, up when walking
        const graze = Math.pow(Math.sin(b.t * 0.3 + b.phase) * 0.5 + 0.5, 2);
        const headWant = b.inWater ? -0.5 * deep + rolling * 0.5 : moving ? 0.1 : 0.1 + graze * 1.25;
        b.q.neck.rotation.x += (headWant - b.q.neck.rotation.x) * (1 - Math.exp(-dt * 2));
        b.q.neck.rotation.y = Math.sin(b.t * 0.21 + b.phase) * 0.3;
        b.q.tail.rotation.z = Math.sin(b.t * 2.3 + b.phase) * (b.inWater ? 0.15 : 0.45);
        b.q.tail.rotation.x = 0.15 + Math.sin(b.t * 1.2) * 0.1;
        const dist = Math.hypot(player.x - b.p.x, player.z - b.p.z);
        // ripples when it rolls or wades; a low grunt now and then
        if (b.inWater && (rolling > 0.5 || moving) && Math.random() < dt * 5) hooks.ripple?.(b.p.x + (Math.random() - 0.5) * 1.4 * b.scale, wy, b.p.z + (Math.random() - 0.5) * 1.4 * b.scale, dist);
        b.snort -= dt;
        if (b.snort < 0) { b.snort = 18 + Math.random() * 40; if (dist < 60) hooks.grunt?.(Math.max(0, 1 - dist / 60), b.scale < 0.7); }
      }
      void time;
    },
  };
}
