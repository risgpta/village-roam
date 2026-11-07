// Railway stations: Sonpur, a small country station in its valley beyond the western tunnel, and two little
// halts on the Noorpur–Mariapur line. Each has a raised platform (a step up along the back), yellow name
// boards at both ends, a tin shelter with benches, lamp posts; Sonpur also has its station house with the
// ticket window, a chai stall and a water tap. People wait on the platform with their bundles; when a train
// stands at the platform, passengers climb down from the coach doors and walk off home, and the waiting
// ones walk to the doors and board — up to 40 aboard a train.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Person } from './people.js';
import { colliders, surfaces, heightAt, groundHeight, TRACK_Y } from './world.js';

export const CAPACITY = 40;
const RAIL_TOP = TRACK_Y + 0.42;
const TOP = RAIL_TOP + 0.45; // platform surface
const EDGE = 1.75; // from the track centre to the platform edge
const MATS = new Map();
const mat = (c, r = 0.8, o = {}) => {
  const k = c + r + JSON.stringify(o);
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o }));
  return MATS.get(k);
};
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const DEVA = '"Tiro Devanagari Hindi", "Kohinoor Devanagari", "Noto Sans Devanagari", sans-serif';
// the classic yellow station board: Hindi above, English below, in black
function boardTex(hi, en) {
  return canvasTex(512, 200, (g, w, h) => {
    g.fillStyle = '#f2c418'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#141414'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold 74px ${DEVA}`; g.fillText(hi, w / 2, 70);
    g.font = 'bold 56px Arial, sans-serif'; g.fillText(en.toUpperCase(), w / 2, 150);
  });
}
const SKIN = ['#8a5a3c', '#7a4c33', '#6e4530', '#a06a48', '#5e3a28', '#93613f', '#7f5238', '#b07a52'];
const outfit = (i) => {
  const k = i % 5;
  if (k === 1 || k === 3) {
    const S = [['#d4a017', '#b3202c'], ['#3c6e47', '#2e8b57'], ['#7a2b6e', '#c2185b'], ['#1e6fa8', '#f2b705'], ['#e0612b', '#2e3fa8']][i % 5];
    return { dress: 'saree', k: 0.9 + (i % 3) * 0.02, top: S[0], bottom: S[1], veil: i % 2 === 0, skin: SKIN[(i + 3) % 8] };
  }
  if (k === 4 && i % 3 === 0) return { dress: 'shorts', k: 0.68, headScale: 1.22, top: ['#f4f4f0', '#e0612b', '#2e8b57'][i % 3], bottom: '#2a3a6a', skin: SKIN[(i + 5) % 8], sleeves: 'short' };
  return { dress: ['kurta', 'pants', 'dhoti'][i % 3], top: ['#f4f2ec', '#8fa6c4', '#e9dcc3', '#c9b27a', '#b9c7a5', '#d8a0a0'][i % 6], bottom: ['#f4f1e8', '#3a3a42', '#efece4'][i % 3], skin: SKIN[i % 8], mustache: i % 4 !== 3, sleeves: i % 2 ? 'short' : undefined, headwear: [undefined, 'cap', 'turban', 'topi'][i % 4], turban: ['#e07a1e', '#f2efe6', '#c0392b', '#ffffff'][i % 4] };
};
const CARRY = [null, 'bundle', 'potHead', null, 'bundle', null, null, 'hay'];

// one station (or halt) beside one track
function buildStation(scene, train, h, hooks) {
  const T = train.tk;
  const big = !!h.big;
  const L = h.L ?? (big ? 170 : 100), W = h.W ?? (big ? 6.5 : 4.2);
  const side = h.side;
  // the station's frame: u along the track (from the platform centre), v out from the track centre
  const sl0 = T.slope(h.x), cosA = 1 / Math.hypot(1, sl0);
  const frame = (u) => {
    const x = h.x + u * cosA, z = T.z(x), sl = T.slope(x), l = Math.hypot(1, sl);
    const tx = 1 / l, tz = sl / l;
    return { x, z, tx, tz, nx: -tz * side, nz: tx * side, rot: Math.atan2(tx, tz) };
  };
  const at = (u, v) => { const f = frame(u); return { x: f.x + f.nx * v, z: f.z + f.nz * v }; };
  const group = new THREE.Group();
  scene.add(group);
  const parts = { plat: [], edge: [], step: [] };
  const box = (list, w, hgt, d, x, y, z, rot) => list.push(new THREE.BoxGeometry(w, hgt, d).rotateY(rot).translate(x, y, z));
  let benches = [], lampMats = [];
  // (the junction's island platform is built once, by the Mariapur line's halt; the main line's shares it)
  if (!h.island) {
  // the platform, built in 5 m slabs that follow the curve of the line
  for (let u = -L / 2; u < L / 2; u += 5) {
    const um = u + 2.5, f = frame(um);
    const c = at(um, EDGE + W / 2);
    const back = at(um, EDGE + W + 1.0);
    const gB = heightAt(back.x, back.z), gF = Math.min(heightAt(c.x, c.z), TRACK_Y);
    const base = Math.min(gB, gF) - 0.3;
    box(parts.plat, W, TOP - base, 5.06, c.x, (TOP + base) / 2, c.z, f.rot);
    const e = at(um, EDGE + 0.25);
    box(parts.edge, 0.5, 0.03, 5.06, e.x, TOP + 0.015, e.z, f.rot);
    surfaces.push({ kind: 'b', x: c.x, z: c.z, rot: f.rot, hw: W / 2, hd: 2.55, top: TOP });
    // a step along the back so you can walk up from the ground
    const rise = TOP - gB;
    if (rise > 0.55) {
      const nSteps = Math.min(3, Math.ceil(rise / 0.55));
      for (let k = 1; k < nSteps + 0 + 1; k++) {
        if (k === nSteps) break;
        const top = gB + (rise * k) / nSteps;
        const sc = at(um, EDGE + W + 0.45 + (nSteps - 1 - k) * 0.9);
        box(parts.step, 0.9, top - base, 5.06, sc.x, (top + base) / 2, sc.z, f.rot);
        surfaces.push({ kind: 'b', x: sc.x, z: sc.z, rot: f.rot, hw: 0.45, hd: 2.55, top });
      }
    }
  }
  const mesh = (geos, m, shadow = true) => { const o = new THREE.Mesh(mergeGeometries(geos), m); o.castShadow = shadow; o.receiveShadow = true; group.add(o); return o; };
  mesh(parts.plat, mat('#a59e92', 0.95));
  mesh(parts.edge, mat('#f0d23a', 0.7), false);
  if (parts.step.length) mesh(parts.step, mat('#938b7f', 0.95));
  const add = (geo, m, x, y, z, ry = 0, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const placed = (u, v, y = TOP) => { const f = frame(u), p = at(u, v); const g = new THREE.Group(); g.position.set(p.x, y, p.z); g.rotation.y = f.rot; group.add(g); return g; };
  // in a placed group: local +z runs along the track, local +x points away from the track (side +1) — flip for side -1
  const sx = -side; // a placed group's local +x points toward the track for side +1, so flip: sx * (+x) is "away from the track"
  // name boards at both ends, readable from the platform and from a passing train
  const bt = new THREE.MeshStandardMaterial({ map: boardTex(h.hi, h.name), roughness: 0.6 });
  for (const u of [-L / 2 + 8, L / 2 - 8]) {
    const g = placed(u, EDGE + W - 1.2);
    for (const px of [-1.3, 1.3]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), mat('#2a2a2a', 0.6), 0, 1.3, px, 0, g);
    const b = add(new THREE.PlaneGeometry(3.2, 1.25), bt, 0, 2.5, 0, Math.PI / 2 * -sx, g);
    const b2 = add(new THREE.PlaneGeometry(3.2, 1.25), bt, 0, 2.5, 0, Math.PI / 2 * sx, g);
    b.position.x = -0.02 * sx; b2.position.x = 0.02 * sx;
    colliders.push({ kind: 'c', ...at(u, EDGE + W - 1.2), r: 0.3, height: TOP + 3 });
  }
  // the tin shelter: posts along the back, a roof sloping toward the track, benches beneath
  const SL = big ? 42 : 12;
  const roofM = mat('#8a2a22', 0.55, { side: THREE.DoubleSide }), postM = mat('#4a5560', 0.5, { metalness: 0.4 });
  for (let u = -SL / 2; u <= SL / 2 + 0.1; u += 6) {
    const p = at(u, EDGE + W - 0.6);
    add(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 8), postM, p.x, TOP + 1.7, p.z);
    colliders.push({ kind: 'c', ...p, r: 0.16, height: TOP + 3.5 });
  }
  {
    const f = frame(0), c = at(0, EDGE + W / 2 + 0.4);
    const roof = add(new THREE.BoxGeometry(W + 0.6, 0.06, SL + 1.5), roofM, c.x, TOP + 3.35, c.z, f.rot);
    roof.rotateZ(0.09 * side);
    const fascia = at(0, EDGE + 0.6);
    add(new THREE.BoxGeometry(0.06, 0.32, SL + 1.5), mat('#f2efe6', 0.6), fascia.x, TOP + 3.15, fascia.z, f.rot);
  }
  for (let u = -SL / 2 + 3; u < SL / 2 - 2; u += big ? 7 : 6) {
    const g = placed(u, EDGE + W - 1.4);
    add(new THREE.BoxGeometry(0.5, 0.06, 2.0), mat('#6a4a2c', 0.75), 0, 0.46, 0, 0, g);
    add(new THREE.BoxGeometry(0.06, 0.4, 2.0), mat('#6a4a2c', 0.75), 0.24 * sx, 0.72, 0, 0, g);
    for (const dz of [-0.85, 0.85]) add(new THREE.BoxGeometry(0.45, 0.46, 0.06), mat('#3a3a3a', 0.6), 0, 0.23, dz, 0, g);
    for (const dz of [-0.5, 0.5]) benches.push({ u: u + dz, v: EDGE + W - 1.45 });
  }
  // lamp posts
  for (let u = -L / 2 + 15; u < L / 2 - 10; u += big ? 24 : 30) {
    const p = at(u, EDGE + W - 0.5);
    add(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 6), postM, p.x, TOP + 2.1, p.z);
    const lm = new THREE.MeshStandardMaterial({ color: '#fff4d8', emissive: '#ffd890', emissiveIntensity: 0.1 });
    lampMats.push(lm);
    const q = at(u, EDGE + W - 1.1);
    add(new THREE.SphereGeometry(0.18, 10, 8), lm, q.x, TOP + 4.1, q.z);
    colliders.push({ kind: 'c', ...p, r: 0.12, height: TOP + 4 });
  }
  // Sonpur: the station house behind the platform, the chai stall and a water tap
  if (big) {
    const f = frame(6), hb = at(6, EDGE + W + 7.5);
    const gH = heightAt(hb.x, hb.z);
    const g = new THREE.Group(); g.position.set(hb.x, gH, hb.z); g.rotation.y = f.rot; group.add(g);
    const wall = mat('#e3c48a', 0.9), trim = mat('#7a2a1e', 0.7);
    // in g: x across (+ away from the track when side = 1), z along
    add(new THREE.BoxGeometry(6, 3.4, 16), wall, 0, 1.7, 0, 0, g);
    add(new THREE.BoxGeometry(6.04, 0.5, 16.04), trim, 0, 0.25, 0, 0, g);
    add(new THREE.BoxGeometry(6.04, 0.22, 16.04), trim, 0, 3.3, 0, 0, g);
    const roof = add(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4), mat('#9a3a26', 0.7), 0, 4.15, 0, 0, g);
    roof.scale.set(5.2, 1.7, 12.6);
    // the face toward the platform: doors, barred windows, the ticket window and the name over the door
    const face = -3.02 * sx;
    for (const dz of [-5.5, 0, 5.5]) {
      add(new THREE.BoxGeometry(0.06, 2.2, 1.3), mat('#3a5a48', 0.7), face, 1.1, dz, 0, g);
      add(new THREE.BoxGeometry(0.08, 0.12, 1.5), trim, face, 2.3, dz, 0, g);
    }
    for (const dz of [-2.8, 2.8]) add(new THREE.BoxGeometry(0.06, 1.0, 1.0), mat('#2a2a2a', 0.5), face, 1.8, dz, 0, g);
    const tw = add(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ map: canvasTex(256, 52, (x, w, hh) => { x.fillStyle = '#1d4f8a'; x.fillRect(0, 0, w, hh); x.fillStyle = '#fff'; x.font = `bold 26px ${DEVA}`; x.textAlign = 'center'; x.fillText('टिकट घर · TICKETS', w / 2, 35); }) }), face - 0.04 * sx, 2.65, 2.8, -Math.PI / 2 * sx, g);
    void tw;
    const nb = add(new THREE.PlaneGeometry(5, 0.9), bt, face - 0.04 * sx, 3.75, 0, -Math.PI / 2 * sx, g);
    void nb;
    colliders.push({ kind: 'b', x: hb.x, z: hb.z, rot: f.rot, hw: 3.1, hd: 8.1 });
    // chai stall on the platform
    const cg = placed(-30, EDGE + W - 2.0);
    add(new THREE.BoxGeometry(1.4, 1.0, 2.2), mat('#2e7a5a', 0.7), 0, 0.5, 0, 0, cg);
    add(new THREE.BoxGeometry(1.6, 0.06, 2.6), mat('#c8a050', 0.6), 0, 2.2, 0, 0, cg);
    for (const dz of [-1.1, 1.1]) add(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), postM, 0.6 * sx, 1.6, dz, 0, cg);
    add(new THREE.CylinderGeometry(0.16, 0.14, 0.3, 10), mat('#c0c4c8', 0.3, { metalness: 0.8 }), 0, 1.15, 0.5, 0, cg);
    colliders.push({ kind: 'b', ...at(-30, EDGE + W - 2.0), rot: frame(-30).rot, hw: 0.75, hd: 1.15, height: TOP + 2.3 });
    const chaiwala = new Person({ dress: 'kurta', top: '#f4f2ec', bottom: '#f4f1e8', skin: '#6e4530', mustache: true, headwear: 'topi' });
    chaiwala.root.position.set(0.95 * sx, 0, 0.2); chaiwala.root.rotation.y = -Math.PI / 2 * sx; cg.add(chaiwala.root);
    chaiwala.prop('kettle', true);
    h.chaiwala = chaiwala;
    // a water tap (pyau) on a little plinth
    const wg = placed(22, EDGE + W - 1.0);
    add(new THREE.BoxGeometry(0.8, 0.9, 1.6), mat('#b9b2a6', 0.9), 0, 0.45, 0, 0, wg);
    for (const dz of [-0.5, 0, 0.5]) add(new THREE.CylinderGeometry(0.03, 0.03, 0.25, 6).rotateZ(Math.PI / 2), mat('#c0c4c8', 0.3, { metalness: 0.8 }), -0.45 * sx, 0.8, dz, 0, wg);
    colliders.push({ kind: 'b', ...at(22, EDGE + W - 1.0), rot: frame(22).rot, hw: 0.4, hd: 0.8, height: TOP + 1 });
  }

  }
  // ---- the people ----
  const nPool = big ? 40 : h.W ? 18 : 12;
  const pool = [];
  for (let i = 0; i < nPool; i++) {
    const p = new Person(outfit(i + (big ? 0 : 50)));
    p.root.visible = false;
    group.add(p.root);
    const carry = CARRY[i % CARRY.length];
    if (carry) p.prop(carry, true);
    pool.push({ p, state: 'hidden', t: 0, u: 0, v: 0, x: 0, z: 0, tx: 0, tz: 0, seat: null, carry });
  }
  const yard = h.yard;
  const home = big ? hooks.sonpur ?? yard : hooks.villageFor?.(h) ?? yard;
  const spot = () => ({ u: (Math.random() - 0.5) * (L - 30), v: EDGE + 1.0 + Math.random() * (W - 2.4) });
  const setAt = (q, u, v) => { const p = at(u, v); q.x = p.x; q.z = p.z; };
  const goTo = (q, x, z) => { q.tx = x; q.tz = z; };
  // start with some waiting
  let freeSeats = benches.slice();
  const wait = (q) => {
    q.state = 'wait'; q.p.root.visible = true;
    const sp = spot();
    q.seat = null;
    if (freeSeats.length && Math.random() < 0.45) { q.seat = freeSeats.splice(Math.floor(Math.random() * freeSeats.length), 1)[0]; sp.u = q.seat.u; sp.v = q.seat.v; }
    setAt(q, sp.u, sp.v); goTo(q, q.x, q.z);
    { const f = frame(sp.u); q.face = Math.atan2(-f.nx, -f.nz); } // facing the track, ready for the train
    q.p.root.rotation.y = q.face;
  };
  const startWaiting = big ? 22 : 5;
  pool.slice(0, startWaiting).forEach(wait);
  let respawn = 6;
  const serve = { train: null, t: 0, alight: 0, boardSide: 1, doors: [] };
  const st = {
    h, train, group, pool, lampMats,
    near: false,
    waiting: () => pool.filter((q) => q.state === 'wait').length,
    update(dt, player, night) {
      const dP = Math.hypot(player.x - yard.x, player.z - yard.z);
      this.near = dP < 260;
      group.visible = dP < 700;
      for (const m of lampMats) m.emissiveIntensity = night ? 3.5 : 0.1;
      const tr = train;
      const standing = tr.at === h && tr.v === 0 && (tr.mode === 'dwell' || tr.mode === 'driven');
      // a train has come in: work out which side its doors open, how many get off
      if (standing && serve.train !== tr) {
        serve.train = tr; serve.t = 0;
        const c = at(0, EDGE + W / 2);
        const dl = tr.doors(1), dr = tr.doors(-1);
        const dist = (ds) => (ds.length ? Math.hypot(ds[0].x - c.x, ds[0].z - c.z) : 1e9);
        serve.boardSide = dist(dl) < dist(dr) ? 1 : -1;
        serve.alight = Math.min(tr.aboard, Math.round(tr.aboard * (0.3 + Math.random() * 0.35)), pool.filter((q) => q.state === 'hidden').length);
        serve.alightAcc = 0;
        hooks.onArrive?.(st, serve.alight);
      }
      if (!standing && serve.train) {
        // it's pulling out: anyone still walking to a door turns back
        for (const q of pool) if (q.state === 'board') wait(q);
        serve.train = null;
      }
      if (standing) {
        serve.t += dt;
        serve.doors = tr.doors(serve.boardSide);
        // passengers climb down, one after another
        if (serve.alight > 0 && serve.t > 1.5) {
          serve.alightAcc += dt * 2.2;
          while (serve.alightAcc > 1 && serve.alight > 0) {
            serve.alightAcc -= 1;
            const q = pool.find((o) => o.state === 'hidden');
            if (!q || !serve.doors.length) { serve.alight = 0; break; }
            const d = serve.doors[Math.floor(Math.random() * serve.doors.length)];
            q.x = d.x; q.z = d.z; q.state = 'alight'; q.t = 0; q.p.root.visible = true;
            tr.aboard = Math.max(0, tr.aboard - 1); serve.alight--;
            // step onto the platform, then head for the back and home
            const out = at(0, EDGE + W + 2);
            q.tx = d.x + (out.x - d.x) * 0.12; q.tz = d.z + (out.z - d.z) * 0.12;
            q.leg = 0;
          }
        }
        // far from the boy, nobody needs to see them walk: the waiting ones just get on
        if (!this.near && serve.alight <= 0 && serve.t > 3) {
          for (const q of pool) if (q.state === 'wait' && tr.aboard < CAPACITY) { q.state = 'hidden'; q.p.root.visible = false; tr.aboard++; if (q.seat) { freeSeats.push(q.seat); q.seat = null; } }
        }
        // then the waiting people walk to the doors and get in, until it's full
        if (serve.alight <= 0 && serve.t > 3) {
          for (const q of pool) {
            if (q.state !== 'wait' || tr.aboard + pool.filter((o) => o.state === 'board').length >= CAPACITY) continue;
            if (Math.random() > dt * 1.4) continue;
            let best = null, bd = 1e9;
            for (const d of serve.doors) { const dd = Math.hypot(d.x - q.x, d.z - q.z); if (dd < bd) { bd = dd; best = d; } }
            if (!best) continue;
            if (q.seat) { freeSeats.push(q.seat); q.seat = null; }
            q.state = 'board'; q.door = best; goTo(q, best.x, best.z);
          }
        }
      }
      // more people turn up over time
      respawn -= dt;
      if (respawn <= 0) {
        respawn = big ? 4 + Math.random() * 6 : 12 + Math.random() * 14;
        if (this.waiting() < (big ? 26 : 7)) { const q = pool.find((o) => o.state === 'hidden'); if (q && !standing) wait(q); }
      }
      // move everyone
      const vis = dP < 330;
      for (const q of pool) q.p.root.visible = vis && q.state !== 'hidden';
      if (!this.near) { for (const q of pool) if (q.state === 'alight' || q.state === 'leave') { q.state = 'hidden'; q.p.root.visible = false; } return; }
      for (const q of pool) {
        if (q.state === 'hidden') continue;
        const dx = q.tx - q.x, dz = q.tz - q.z, d = Math.hypot(dx, dz);
        const sp = q.state === 'wait' ? 0 : 1.25;
        let moving = false;
        if (d > 0.08 && sp > 0) {
          const k = Math.min(1, (sp * dt) / d);
          q.x += dx * k; q.z += dz * k; moving = true;
          q.face = Math.atan2(dx, dz);
        } else if (q.state === 'board') {
          // in through the door
          q.state = 'hidden'; q.p.root.visible = false; tr.aboard = Math.min(CAPACITY, tr.aboard + 1);
          if (q.seat) { freeSeats.push(q.seat); q.seat = null; }
          continue;
        } else if (q.state === 'alight') {
          q.leg++;
          if (q.leg === 1) { const o = at((Math.random() - 0.5) * 30, EDGE + W + 2.5); goTo(q, o.x, o.z); }
          else { q.state = 'leave'; goTo(q, home.x + (Math.random() - 0.5) * 16, home.z + (Math.random() - 0.5) * 16); }
        } else if (q.state === 'leave') { q.state = 'hidden'; q.p.root.visible = false; continue; }
        if (q.state === 'board' && q.door) {
          // doors move with the train; keep aiming at the one picked
          let best = q.door, bd = 1e9;
          for (const dd of serve.doors) { const e = Math.hypot(dd.x - q.door.x, dd.z - q.door.z); if (e < bd) { bd = e; best = dd; } }
          q.door = best; goTo(q, best.x, best.z);
        }
        const y = (q.state === 'alight' && q.leg === 0) || q.state === 'board' ? TOP : groundHeight(q.x, q.z, TOP + 0.3);
        q.p.root.position.set(q.x, y, q.z);
        q.p.root.rotation.y += Math.atan2(Math.sin(q.face - q.p.root.rotation.y), Math.cos(q.face - q.p.root.rotation.y)) * Math.min(1, dt * 6);
        q.p.update(dt, moving ? sp : 0, moving ? 'walk' : q.seat ? 'sit' : 'idle');
      }
      if (h.chaiwala) h.chaiwala.update(dt, 0, 'pour');
    },
  };
  // the person rigs live in world space, not in the station group's frame
  for (const q of pool) { group.remove(q.p.root); scene.add(q.p.root); }
  return st;
}

export function buildStations(scene, railway, hooks = {}) {
  const stations = [];
  for (const tr of railway.trains) {
    tr.aboard = 12 + Math.floor(Math.random() * 14);
    for (const h of tr.halts) stations.push(buildStation(scene, tr, h, hooks));
  }
  return {
    stations,
    update(dt, player, night) { for (const s of stations) s.update(dt, player, night); },
    // the station a train is standing at, if any
    of(h) { return stations.find((s) => s.h.name === h.name); },
  };
}
