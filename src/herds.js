// The charagah's herds: a shepherd with his flock of sheep, a goatherd girl with her goats and kids, and a
// cowherd with his cows and a calf. Each herder leads the animals out of the bamboo pen to a patch of the
// meadow, stands leaning on a stick while they graze, moves them on to fresh grass, and in the evening
// brings them back to the pen. The animals trail the herder in a loose bunch when moving, and wander and
// graze about him when he stops. The herders call out to their animals now and then.
import * as THREE from 'three';
import { Person } from './people.js';
import { Goat } from './animals.js';
import { groundHeight, heightAt, resolveCollisions } from './world.js';
import { rng } from './noise.js';

const damp = (dt, r) => 1 - Math.exp(-dt * r);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const HERDS = [
  { kind: 'sheep', n: 12, young: 3, coats: [['#ece6d6', '#2a2420'], ['#f2ede2', '#3a302a'], ['#e2d9c4', '#1e1a18'], ['#d8cdb4', '#efe9dc']],
    herder: { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', headwear: 'turban', turban: '#d8322b', mustache: true, skin: '#6e4530', vest: '#5a3a26' },
    calls: [['हुर्र्र… चल!', 'Hurrr… chal!'], ['ऐ… इधर आ!', 'Ae… idhar aa!'], ['चलो चलो!', 'Chalo chalo!']], spots: [[0.35, 0.3], [-0.2, 0.45], [0.1, -0.1]], wait: 0 },
  { kind: 'goat', n: 8, young: 2, coats: [['#1d1a19', '#2a2524'], ['#5a3a26', '#e8e0d2'], ['#efe9dd', '#d9cdb8'], ['#7a5236', '#2a1f1a'], ['#2a2422', '#e9e2d6']],
    herder: { dress: 'saree', k: 0.74, headScale: 1.18, top: '#f2b705', bottom: '#c2185b', pallu: false, braids: true, veil: false, skin: '#8a5a3c' },
    calls: [['बकरियों, चलो!', 'Bakriyon, chalo!'], ['हट… हट!', 'Hat… hat!'], ['मुन्नी, इधर!', 'Munni, idhar!']], spots: [[-0.45, -0.15], [-0.1, -0.5], [-0.5, 0.25]], wait: 60 },
  { kind: 'cow', n: 5, young: 1, coats: [['#ece6da'], ['#b98e64'], ['#f2ede4'], ['#8a6a4a'], ['#d8cfc0']],
    herder: { dress: 'kurta', top: '#e9dcc3', bottom: '#f4f1e8', headwear: 'cap', turban: '#f2efe6', mustache: true, skin: '#5e3a28' },
    calls: [['हो… हो… गैया!', 'Ho… ho… gaiya!'], ['चल लाली!', 'Chal Laali!']], spots: [[0.5, -0.35], [0.2, -0.55], [0.55, 0.05]], wait: 120 },
];

export function buildHerds(scene, P, hooks = {}) {
  if (!P) return null;
  const R = rng(77123);
  const at = (fx, fz) => ({ x: P.x + fx * P.r, z: P.z + fz * P.r });
  const herds = [];
  const allAnimals = [];
  // the pen: a ring of bamboo posts and rails, open toward the meadow, a stone trough and a haystack inside
  {
    const pen = P.pen, pr = 7, n = 22;
    const bam = new THREE.MeshStandardMaterial({ color: '#b89a5a', roughness: 0.75 }), bamD = new THREE.MeshStandardMaterial({ color: '#8a6e3a', roughness: 0.8 });
    const posts = [], rails = [];
    const pt = (a) => ({ x: pen.x + Math.sin(pen.rot + a) * pr, z: pen.z + Math.cos(pen.rot + a) * pr });
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, mid = (a0 + a1) / 2;
      if (Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid))) < 0.45) continue;
      const A = pt(a0), B = pt(a1);
      posts.push(A, B);
      for (const h of [0.45, 0.95]) rails.push({ A, B, h });
    }
    const pg = new THREE.CylinderGeometry(0.05, 0.06, 1.4, 6);
    for (const q of posts) { const m = new THREE.Mesh(pg, bamD); m.position.set(q.x, heightAt(q.x, q.z) + 0.6, q.z); m.castShadow = true; scene.add(m); }
    for (const { A, B, h } of rails) {
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L, 6).rotateZ(Math.PI / 2), bam);
      const y = (heightAt(A.x, A.z) + heightAt(B.x, B.z)) / 2 + h;
      m.position.set((A.x + B.x) / 2, y, (A.z + B.z) / 2);
      m.rotation.y = Math.atan2(B.x - A.x, B.z - A.z) - Math.PI / 2;
      m.castShadow = true; scene.add(m);
    }
    const back = { x: pen.x - Math.sin(pen.rot) * 4.5, z: pen.z - Math.cos(pen.rot) * 4.5 };
    const trough = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.7), new THREE.MeshStandardMaterial({ color: '#8f877b', roughness: 0.95 }));
    trough.position.set(back.x + Math.cos(pen.rot) * 2, heightAt(back.x, back.z) + 0.22, back.z - Math.sin(pen.rot) * 2);
    trough.rotation.y = pen.rot + Math.PI / 2; trough.castShadow = true; scene.add(trough);
    const water = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 0.5), new THREE.MeshStandardMaterial({ color: '#4a6a6a', roughness: 0.1, metalness: 0.3 }));
    water.position.copy(trough.position).add(new THREE.Vector3(0, 0.2, 0)); water.rotation.y = trough.rotation.y; scene.add(water);
    const hay = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.2, 12), new THREE.MeshStandardMaterial({ color: '#c9a95e', roughness: 1 }));
    hay.position.set(back.x - Math.cos(pen.rot) * 2.5, heightAt(back.x, back.z) + 1.0, back.z + Math.sin(pen.rot) * 2.5); hay.castShadow = true; scene.add(hay);
  }
  for (const H of HERDS) {
    const herder = new Person(H.herder);
    herder.prop('stick', true);
    scene.add(herder.root);
    const pen = { x: P.pen.x + (R() - 0.5) * 3, z: P.pen.z + (R() - 0.5) * 3 };
    const lead = { x: pen.x, z: pen.z, facing: P.pen.rot, moving: false, home: { ...pen, r: 4 } };
    const animals = [];
    for (let i = 0; i < H.n; i++) {
      const coat = H.coats[i % H.coats.length];
      const scale = H.kind === 'cow' ? 0.95 + R() * 0.1 : 0.92 + R() * 0.16;
      const a = new Goat(coat, scale, lead.home, R, null, H.kind);
      a.leader = lead;
      a.slot = { b: R() * (H.kind === 'cow' ? 6 : 4), s: (R() - 0.5) * (H.kind === 'cow' ? 5 : 4) };
      animals.push(a);
    }
    for (let i = 0; i < H.young; i++) {
      const m = animals[i];
      const y = new Goat(H.coats[(i + 1) % H.coats.length], H.kind === 'cow' ? 0.6 : 0.55, lead.home, R, m, H.kind);
      animals.push(y);
    }
    for (const a of animals) { scene.add(a.root); allAnimals.push(a); }
    herds.push({ H, herder, lead, animals, pen, state: 'pen', timer: 20 + H.wait, spot: 0, target: null, callT: 8 + R() * 10, soundT: 4 + R() * 6 });
  }
  let night = false;
  const tmp = { x: 0, z: 0 };
  return {
    herds,
    setNight(v) { night = v; },
    // things a vehicle can knock over
    hittables() { const o = []; for (const h of herds) if (h.herder.root.visible) o.push({ x: h.lead.x, z: h.lead.z, person: h.herder }); return o; },
    colliders() {
      const o = [];
      for (const h of herds) {
        if (!h.herder.root.visible) continue;
        if (!(h.herder.fallT > 0)) o.push({ kind: 'c', x: h.lead.x, z: h.lead.z, r: 0.3 });
        for (const a of h.animals) o.push({ kind: 'c', x: a.p.x, z: a.p.z, r: a.cr * a.scale * 0.8 });
      }
      return o;
    },
    update(dt, player) {
      const dP = Math.hypot(player.x - P.x, player.z - P.z);
      const vis = dP < 420;
      for (const h of herds) {
        h.herder.root.visible = vis;
        for (const a of h.animals) a.root.visible = vis;
      }
      if (dP > 300) return; // too far to matter: everyone waits where they are
      for (const h of herds) {
        const L = h.lead, man = h.herder;
        // knocked over: lie there, then get up
        if (man.fallT > 0) { L.moving = false; man.update(dt, 0, 'idle'); for (const a of h.animals) { a.night = false; a.update(dt, player); } continue; }
        // the day: out of the pen → graze at one patch → move on to the next → … → home before dark
        h.timer -= dt;
        if (!h.target && h.timer <= 0) {
          if (night) h.target = h.state === 'pen' ? null : { ...h.pen, next: 'pen' };
          else if (h.state === 'pen' || h.state === 'graze') {
            const order = h.H.spots;
            if (h.state === 'graze' && h.spot >= order.length) { h.target = { ...h.pen, next: 'pen' }; h.spot = 0; }
            else { const [fx, fz] = order[h.spot % order.length]; h.target = { ...at(fx, fz), next: 'graze' }; h.spot++; }
          }
          if (!h.target) h.timer = 10;
        }
        let speed = 0;
        if (h.target) {
          const dx = h.target.x - L.x, dz = h.target.z - L.z, d = Math.hypot(dx, dz);
          // don't race ahead of the slow ones
          let lag = 0;
          for (const a of h.animals) lag = Math.max(lag, Math.hypot(a.p.x - L.x, a.p.z - L.z));
          speed = lag > 14 ? 0.35 : 0.95;
          if (d < 0.8) {
            h.state = h.target.next;
            h.target = null;
            h.timer = h.state === 'pen' ? 50 + R() * 40 : 70 + R() * 60;
            L.home = { x: L.x, z: L.z, r: h.state === 'pen' ? 4 : h.H.kind === 'cow' ? 13 : 10 };
            speed = 0;
          } else {
            L.x += (dx / d) * speed * dt; L.z += (dz / d) * speed * dt;
            const p = { x: L.x, z: L.z }; resolveCollisions(p, 0.3, undefined, true); L.x = p.x; L.z = p.z;
            L.facing += wrapA(Math.atan2(dx, dz) - L.facing) * damp(dt, 4);
          }
        } else if (h.state === 'graze') {
          // watching the herd: turn now and then toward the middle of it
          let cx = 0, cz = 0;
          for (const a of h.animals) { cx += a.p.x; cz += a.p.z; }
          cx /= h.animals.length; cz /= h.animals.length;
          if (Math.hypot(cx - L.x, cz - L.z) > 1) L.facing += wrapA(Math.atan2(cx - L.x, cz - L.z) - L.facing) * damp(dt, 0.6);
        }
        L.moving = speed > 0;
        man.root.position.set(L.x, groundHeight(L.x, L.z), L.z);
        man.root.rotation.y = L.facing;
        man.update(dt, speed, speed > 0 ? 'walk' : 'lean');
        const resting = night && h.state === 'pen' && !h.target;
        for (const a of h.animals) { a.night = resting; a.update(dt, player); }
        // calls, bleats, moos and the cowbells
        const dH = Math.hypot(player.x - L.x, player.z - L.z);
        h.callT -= dt;
        if (h.callT <= 0) {
          h.callT = (L.moving ? 10 : 25) + R() * 15;
          if (dH < 45 && !night) { const [hi, ro] = h.H.calls[Math.floor(R() * h.H.calls.length)]; hooks.say?.(hi, ro, dH, h.H.herder.dress === 'saree' ? 1.6 : 0.85); }
        }
        h.soundT -= dt;
        if (h.soundT <= 0) {
          h.soundT = 3 + R() * 6;
          const a = h.animals[Math.floor(R() * h.animals.length)];
          const dA = Math.hypot(player.x - a.p.x, player.z - a.p.z);
          if (dA < 60) {
            const v = Math.max(0, 1 - dA / 60);
            if (h.H.kind === 'cow') { if (R() < 0.4) hooks.moo?.(v); else hooks.cowbell?.(v); }
            else hooks.bleat?.(v * (h.H.kind === 'sheep' ? 0.8 : 1));
          }
        }
        void tmp; void heightAt;
      }
    },
  };
}
