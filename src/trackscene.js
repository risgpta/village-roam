// The country the trains run through, made worth looking at from a window seat — while staying a quiet
// village landscape:
//  - groves of different trees along the lines: tall pale eucalyptus in rows, dark domed mango orchards,
//    gulmohar in scarlet flower, palmyra palms, banana clumps and bamboo
//  - little trackside hamlets: a couple of round huts and a mud house, a haystack, a charpai with someone
//    sitting on it, a woodpile — and a dog who races the trains, barking, then trots home
//  - peacocks strutting near the line, calling when a train goes past
//  - a pair of tame elephants with their mahout, ambling about a clearing near the track
import * as THREE from 'three';
import { layout, CANAL, canalDist, NEW_VILLAGES, TRACK, TRACK3, TRACK5, RING, TRACK_Y, heightAt, groundHeight, riverDist, RIVER_HALF, CROSSING, CROSSING3, jungleMask, fieldType, dirtMask, trackDist, tunnelMask, isFree, colliders, PLAY_RADIUS } from './world.js';
import { rng, fbm } from './noise.js';
import { treeKit, plantForest } from './vegetation.js';
import { roundHut, rectHouse, haystack, charpai, woodpile, bananaPlant, temple } from './props.js';
import { Dog, Peacock, consolidate } from './animals.js';
import { Elephant } from './wildlife.js';
import { Person } from './people.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });

// ---- tree kinds: each a few merged parts, one material per part
const merge = (list) => {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of geos) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
};

// banana clumps, from the village's own maker, instanced in cells
function bananaKind() {
  const R = rng(4242);
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) { const b = bananaPlant(R); b.position.set((R() - 0.5) * 2.4, 0, (R() - 0.5) * 2.4); b.scale.setScalar(0.8 + R() * 0.5); g.add(b); }
  g.updateMatrixWorld(true);
  const by = new Map();
  g.traverse((o) => { if (o.isMesh) { const k = o.material; if (!by.has(k)) by.set(k, []); by.get(k).push(o.geometry.clone().applyMatrix4(o.matrixWorld)); } });
  return [...by].map(([mat, list]) => ({ geo: merge(list), mat }));
}

export function buildTrackScenery(scene, railway, hooks = {}) {
  const R = rng(7319);
  const group = new THREE.Group();
  group.name = 'track-scenery';
  scene.add(group);
  const yards = [];
  for (const T of [TRACK, TRACK3, RING, TRACK5]) for (const h of T.halts ?? []) if (h.yard) yards.push(h.yard);
  const nearYard = (x, z, r) => yards.some((y) => Math.hypot(y.x - x, y.z - z) < r);
  const nearCrossing = (x, z) => Math.hypot(x - CROSSING.x, z - CROSSING.z) < 50 || Math.hypot(x - CROSSING3.x, z - CROSSING3.z) < 50;
  const clearLand = (x, z, r) => Math.hypot(x, z) < PLAY_RADIUS - 60 && riverDist(x, z) > RIVER_HALF + 6 + r && trackDist(x, z) > 7 + r && !tunnelMask(x, z) && jungleMask(x, z) === 0
    && dirtMask(x, z) < 0.3 && isFree(x, z, r) && !nearYard(x, z, 90) && !nearCrossing(x, z);

  // ---- groves: walk every line, both sides; the kind of tree changes from place to place in patches. Only the
  // country's few real kinds: big leafy broadleaf (neem, mango), coconut palms, eucalyptus, banana clumps.
  const place = { euc: [], broad: [], palm: [], banana: [] };
  const RAD = { euc: 2, broad: 4.5, palm: 2.5, banana: 2.5 };
  const q = {};
  for (const T of [TRACK, TRACK3, RING, TRACK5]) {
    const P = T.path;
    for (let s = 20; s < P.L - 20; s += 6.5) {
      if (!T.openS(s, 20)) continue;
      P.at(s, q);
      for (const sd of [-1, 1]) {
        const patch = fbm(q.x * 0.006 + sd * 3.1, q.z * 0.006, 2);
        if (patch < -0.12 || R() > 0.55) continue;
        const kind = patch > 0.26 ? 'broad' : patch > 0.12 ? 'euc' : patch > 0.0 ? 'palm' : R() < 0.4 ? 'banana' : 'broad';
        // eucalyptus planted in a neat row close to the line; the rest scattered further back
        const off = kind === 'euc' ? 13 + R() * 3 : 12 + R() * 42;
        const x = q.x - q.tz * sd * off + (R() - 0.5) * 3, z = q.z + q.tx * sd * off + (R() - 0.5) * 3;
        const r = RAD[kind];
        if (fieldType(x, z) && kind !== 'euc' && kind !== 'palm') continue; // (eucalyptus and palms line the field edges)
        if (!clearLand(x, z, r)) continue;
        if (place[kind].some((p) => Math.abs(p.x - x) + Math.abs(p.z - z) < r * 2)) continue;
        place[kind].push({ x, z, y: groundHeight(x, z) - 0.1, s: kind === 'broad' ? 0.95 + R() * 0.45 : 0.85 + R() * 0.3, a: R() * 6.28, v: Math.floor(R() * 3) });
      }
    }
  }
  // the canal: eucalyptus in long rows down both banks, as on every canal in the north, with gaps here and
  // there, and none by the villages or the causeways
  {
    const P = CANAL.path;
    for (let s2 = 6; s2 < P.L - 6; s2 += 8 + R() * 2) {
      if (CANAL.crossings.some((cs) => Math.abs(s2 - cs) < 16)) continue;
      P.at(s2, q);
      for (const sd of [-1, 1]) {
        if (R() < 0.12) continue;
        const off = CANAL.half + 8.4 + R() * 0.8;
        const x = q.x + q.tz * sd * off, z = q.z - q.tx * sd * off;
        if (NEW_VILLAGES.some((v) => v.canal && Math.hypot(v.x - x, v.z - z) < 70)) continue;
        if (dirtMask(x, z) > 0.3 || !isFree(x, z, 1.5) || canalDist(x, z) < CANAL.half + 7.5) continue;
        place.euc.push({ x, z, y: groundHeight(x, z) - 0.1, s: 0.9 + R() * 0.25, a: R() * 6.28, v: Math.floor(R() * 3) });
      }
    }
    // low whitewashed concrete parapets along each causeway
    const wall = std('#d9d4c8', { roughness: 0.9 }), band = std('#2a2a2a', { roughness: 0.8 });
    for (const cs of CANAL.crossings) {
      P.at(cs, q);
      const y = CANAL.level + 0.85, len = CANAL.half * 2 + 3.4, nx = q.tz, nz = -q.tx;
      for (const e of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(q.x + q.tx * e * 2.1, y, q.z + q.tz * e * 2.1);
        g.rotation.y = Math.atan2(nx, nz);
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.62, len), wall); w.position.y = 0.31; w.castShadow = w.receiveShadow = true; g.add(w);
        for (const k of [-1, 0, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.5), band); b.position.set(0, 0.5, k * len * 0.33); g.add(b); }
        group.add(g);
        for (let k = -2; k <= 2; k++) colliders.push({ kind: 'c', x: g.position.x + nx * k * (len / 5), z: g.position.z + nz * k * (len / 5), r: 0.2 });
      }
    }
  }
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  // the trees: batched with the rest of the country's forests (drawn in full near by, lighter far off, not at
  // all in the haze)
  let nTrees = 0;
  for (const kind of ['broad', 'palm', 'euc']) {
    const items = place[kind].map((p) => ({ x: p.x, z: p.z, s: p.s, rot: p.a, v: p.v }));
    nTrees += items.length;
    for (const m of plantForest(kind, items, 0.15)) group.add(m);
    for (const p of items) colliders.push({ kind: 'c', x: p.x, z: p.z, r: kind === 'broad' ? 0.45 : 0.3 });
  }
  // the banana clumps, in cells of 500 m, so those out of view or lost in the haze aren't drawn
  const bananaK = bananaKind();
  const CELL = 500, cells = new Map();
  for (const [kind, list] of Object.entries({ banana: place.banana })) {
    nTrees += list.length;
    for (const p of list) {
      const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
      if (!cells.has(key)) cells.set(key, { kind: {}, x: (Math.floor(p.x / CELL) + 0.5) * CELL, z: (Math.floor(p.z / CELL) + 0.5) * CELL, g: new THREE.Group() });
      (cells.get(key).kind[kind] ??= []).push(p);
      colliders.push({ kind: 'c', x: p.x, z: p.z, r: 0.8 });
    }
  }
  for (const c of cells.values()) {
    for (const [, list] of Object.entries(c.kind)) for (const { geo, mat } of bananaK) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, i) => { qt.setFromAxisAngle(up, p.a); sc.setScalar(p.s); ps.set(p.x, p.y, p.z); im.setMatrixAt(i, m4.compose(ps, qt, sc)); });
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      c.g.add(im);
    }
    group.add(c.g);
  }

  // ---- trackside hamlets
  const hamlets = [];
  const dogs = [], sitters = [];
  const DOG_COATS = [['#c8a070', '#efe2c8'], ['#3a2a20', '#a88060'], ['#e9dcc4', '#ffffff'], ['#8a5a32', '#d8b890']];
  for (const T of [TRACK, TRACK3, RING, TRACK5]) {
    const P = T.path;
    for (let s = 150 + R() * 200; s < P.L - 150; s += 420 + R() * 300) {
      if (!T.openS(s, 40)) continue;
      P.at(s, q);
      const sd = R() < 0.5 ? 1 : -1, off = 30 + R() * 10;
      const cx = q.x - q.tz * sd * off, cz = q.z + q.tx * sd * off;
      if (!clearLand(cx, cz, 14) || fieldType(cx, cz)) continue;
      // flat enough for a yard
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28, h = heightAt(cx + Math.cos(a) * 11, cz + Math.sin(a) * 11); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (hi - lo > 2.2) continue;
      const face = Math.atan2(q.x - cx, q.z - cz); // the huts look toward the line
      const g = new THREE.Group();
      g.position.set(cx, groundHeight(cx, cz), cz);
      g.rotation.y = face;
      const put = (o, lx, lz, rot = 0) => { o.position.set(lx, groundHeight(cx + lx * Math.cos(face) + lz * Math.sin(face), cz - lx * Math.sin(face) + lz * Math.cos(face)) - g.position.y, lz); o.rotation.y = rot; g.add(o); return o; };
      const h1 = roundHut(R), h2 = roundHut(R), h3 = rectHouse(R);
      put(h1.g, -6, -3, 0.3); put(h2.g, 5.5, -4, -0.4); put(h3.g, 0, -10, 0);
      put(haystack(R), 10, 3, 0); put(charpai(), -2, 3.5, 0.4); put(woodpile(R), -9, 2, 0.6);
      consolidate(g);
      group.add(g);
      const toW = (lx, lz) => ({ x: cx + lx * Math.cos(face) + lz * Math.sin(face), z: cz - lx * Math.sin(face) + lz * Math.cos(face) });
      for (const [lx, lz, r] of [[-6, -3, h1.r + 0.3], [5.5, -4, h2.r + 0.3], [0, -10, 3.6], [10, 3, 1.8]]) colliders.push({ kind: 'c', ...toW(lx, lz), r });
      // someone resting on the charpai
      const who = new Person(R() < 0.5 ? { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', headwear: 'turban', turban: ['#e07a1e', '#c4241c', '#f2f0ea'][Math.floor(R() * 3)], mustache: true, skin: '#7a4c33' }
        : { dress: 'saree', top: ['#c4241c', '#2e8b57', '#1e6fa8'][Math.floor(R() * 3)], bottom: '#f2b705', veil: true, skin: '#93613f' });
      who.seatH = 0.43;
      const cp = toW(-2, 3.5);
      who.root.position.set(cp.x, groundHeight(cp.x, cp.z), cp.z);
      who.root.rotation.y = face + 0.4 + Math.PI / 2;
      scene.add(who.root);
      sitters.push(who);
      // the hamlet's dog
      const coat = DOG_COATS[hamlets.length % DOG_COATS.length];
      const home = toW(1, 6);
      const d = new Dog(coat[0], coat[1], false, home, { x: home.x, z: home.z });
      d.T = T; d.chaseT = 0; d.coolT = 0;
      scene.add(d.root);
      dogs.push(d);
      hamlets.push({ x: cx, z: cz, g });
    }
  }

  // ---- peacocks in twos and threes near the line
  const peacocks = [];
  for (const T of [TRACK, TRACK3, RING, TRACK5]) {
    const P = T.path;
    for (let s = 300 + R() * 300; s < P.L - 100; s += 700 + R() * 500) {
      P.at(s, q);
      const sd = R() < 0.5 ? 1 : -1, off = 16 + R() * 14;
      const x = q.x - q.tz * sd * off, z = q.z + q.tx * sd * off;
      if (!clearLand(x, z, 4)) continue;
      const n = 2 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const pc = new Peacock({ x, z, r: 8 }, R);
        pc.onCall = (dd) => hooks.peacock?.(dd);
        scene.add(pc.root);
        peacocks.push(pc);
      }
    }
  }

  // ---- the tame elephants and their mahout, in a clearing by the line
  const elephants = [];
  {
    const T = RING, P = T.path;
    for (let tries = 0; tries < 40 && !elephants.length; tries++) {
      P.at(P.L * (0.15 + R() * 0.7), q);
      const sd = R() < 0.5 ? 1 : -1, off = 34 + R() * 14;
      const x = q.x - q.tz * sd * off, z = q.z + q.tx * sd * off;
      if (!clearLand(x, z, 16) || fieldType(x, z)) continue;
      const home = { x, z, r: 14 };
      const mom = new Elephant(home, R, 1.0, null, false);
      const calf = new Elephant(home, R, 0.55, mom, false);
      // painted forehead and a red cloth with a gold border over her back
      const cloth = std('#b3202a', { roughness: 0.6 }), gold = std('#e0b040', { metalness: 0.5, roughness: 0.4 });
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.5, 18, 1, true, -1.25, 2.5).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), cloth);
      drape.material.side = THREE.DoubleSide;
      drape.position.set(0, 0.3, 0.1); mom.body.add(drape);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 4, 24, 2.5).rotateZ(-1.25 + Math.PI / 2).rotateY(Math.PI / 2), gold);
      for (const tz of [-0.74, 0.86]) { const t = trim.clone(); t.position.set(0, 0.3, tz); mom.body.add(t); }
      const paint = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), std('#e8d070', { emissive: '#3a2a00' }));
      paint.position.set(0, 0.32, 0.69); mom.head.add(paint);
      // the mahout sitting astride her neck, a stick in hand
      const mahout = new Person({ dress: 'dhoti', top: '#e9e2cf', bottom: '#f4f1e8', headwear: 'turban', turban: '#e07a1e', mustache: true, skin: '#6e4530', carry: 'stick' });
      mahout.prop?.('stick', true);
      mahout.seatH = 0;
      mahout.root.position.set(0, 1.05, 0.95);
      mom.body.add(mahout.root);
      mom.mahout = mahout;
      for (const e of [mom, calf]) { scene.add(e.root); elephants.push(e); }
    }
  }

  // ---- Naharpur's shrine: a small whitewashed temple with a saffron flag, a great shade tree beside it, oil
  // lamps on the step, the pujari sitting by the door and villagers come to pray
  const shrineFolk = [];
  let shrine = null;
  if (layout.naharShrine) {
    const S = layout.naharShrine;
    const t = temple();
    t.scale.setScalar(0.85);
    t.position.set(S.x, groundHeight(S.x, S.z) + 0.1, S.z);
    t.rotation.y = S.rot;
    consolidate(t);
    group.add(t);
    // the tree: a broad peepal-like dome on a thick trunk
    const tg = new THREE.Group();
    tg.position.set(S.tree.x, groundHeight(S.tree.x, S.tree.z) - 0.1, S.tree.z);
    tg.scale.setScalar(1.7);
    { const K = treeKit(), t0 = K.T[1].t; for (const [geo, mat] of [[t0.trunk, K.trunkMat], [t0.leaves, K.leafMat]]) { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; tg.add(m); } }
    // a red thread tied round the trunk, as at every shrine tree
    const thread = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.025, 6, 20).rotateX(Math.PI / 2), std('#c4241c'));
    thread.position.y = 1.1; tg.add(thread);
    group.add(tg);
    // little clay diyas along the front step
    const diyaM = new THREE.MeshStandardMaterial({ color: '#ffb84a', emissive: '#ff9a20', emissiveIntensity: 1.2 });
    const fx = Math.sin(S.rot), fz = Math.cos(S.rot);
    for (let i = -2; i <= 2; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), diyaM);
      const x = S.x + fx * 3.3 + Math.cos(S.rot) * i * 0.45, z = S.z + fz * 3.3 - Math.sin(S.rot) * i * 0.45;
      d.position.set(x, groundHeight(x, z) + 0.75, z); group.add(d);
    }
    const mk = (o, lx, lz, face, act) => {
      const p = new Person(o);
      const x = S.x + fx * lz + Math.cos(S.rot) * lx, z = S.z + fz * lz - Math.sin(S.rot) * lx;
      p.root.position.set(x, groundHeight(x, z), z); p.root.rotation.y = face;
      scene.add(p.root);
      shrineFolk.push({ p, act });
      return p;
    };
    const pujari = mk({ dress: 'dhoti', top: '#f08a24', bottom: '#f6e6c8', skin: '#7a4c33', beard: true, mustache: true, hair: '#dcd6cc', sleeves: 'short' }, 1.6, 3.6, S.rot, 'sit');
    pujari.seatH = 0.0;
    mk({ dress: 'saree', top: '#c4241c', bottom: '#f2b705', veil: true, skin: '#86573b' }, -0.4, 5.6, S.rot + Math.PI, 'pray');
    mk({ dress: 'saree', top: '#2e8b57', bottom: '#7a2b6e', veil: true, skin: '#80523a' }, 0.6, 5.9, S.rot + Math.PI, 'pray');
    mk({ dress: 'kurta', top: '#f4f2ec', bottom: '#f4f1e8', headwear: 'turban', turban: '#e07a1e', mustache: true, skin: '#6e4530' }, -1.8, 6.4, S.rot + Math.PI, 'pray');
    shrine = { ...S, front: { x: S.x + fx * 4.5, z: S.z + fz * 4.5 } };
  }

  // the nearest moving train car to a point
  const trainNear = (x, z) => {
    let best = Infinity, bx = 0, bz = 0, v = 0, tr = null;
    for (const t of railway.trains) {
      if (Math.abs(t.v) < 2) continue;
      for (const b of t.boxes) { const d = Math.abs(b.x - x) + Math.abs(b.z - z); if (d < best) { best = d; bx = b.x; bz = b.z; v = t.v; tr = t; } }
    }
    return { d: best, x: bx, z: bz, v, tr };
  };
  const FAR = { x: 1e6, z: 1e6, facing: 0, speed: 0 }; // the tame elephants pay no mind to anyone
  let callCool = 0;
  return {
    group, dogs, peacocks, elephants, hamlets, shrine, trees: nTrees,
    update(dt, player, night, haze = 900) {
      callCool -= dt;
      for (const c of cells.values()) c.g.visible = Math.hypot(c.x - player.x, c.z - player.z) < haze + 360;
      for (const d of dogs) {
        const pd = Math.abs(d.p.x - player.x) + Math.abs(d.p.z - player.z);
        d.root.visible = pd < 420;
        if (pd > 380) continue;
        d.coolT -= dt;
        const tn = trainNear(d.p.x, d.p.z);
        // a train coming by: off after it, alongside the line, barking — for a few seconds, then home
        if (tn.d < 60 && d.coolT <= 0 && d.chaseT <= 0 && !night) { d.chaseT = 5 + Math.random() * 3; d.coolT = 25; }
        if (d.chaseT > 0) {
          d.chaseT -= dt;
          const n = d.T.path.near(d.p.x, d.p.z);
          if (n) {
            const pq = d.T.path.at(n.s + Math.sign(tn.v || 1) * 10), side = Math.sign((d.p.x - pq.x) * -pq.tz + (d.p.z - pq.z) * pq.tx) || 1;
            d.target = { x: pq.x - pq.tz * side * 6.5, z: pq.z + pq.tx * side * 6.5 };
          }
          d.state = 'wander'; d.rush = 6.5; d.stuck = 0;
          if (d.barkCool <= 0 && d.barkT <= 0) { d.bark(); d.barkCool = 0.9 + Math.random() * 0.8; hooks.bark?.(Math.hypot(d.p.x - player.x, d.p.z - player.z)); }
          if (d.chaseT <= 0) { d.rush = 0; d.target = { x: d.home.x, z: d.home.z }; d.state = 'wander'; }
        } else d.rush = 0;
        d.update(dt, player);
      }
      for (const s of sitters) {
        const pd = Math.abs(s.root.position.x - player.x) + Math.abs(s.root.position.z - player.z);
        s.root.visible = pd < 380;
        if (pd < 300) s.update(dt, 0, night ? 'sit' : 'sit');
      }
      for (const pc of peacocks) {
        const pd = Math.abs(pc.root.position.x - player.x) + Math.abs(pc.root.position.z - player.z);
        pc.root.visible = pd < 300;
        if (pd > 280) continue;
        pc.night = night;
        const tn = trainNear(pc.root.position.x, pc.root.position.z);
        if (tn.d < 70 && callCool <= 0 && !night) { callCool = 8; hooks.peacock?.(Math.hypot(pc.root.position.x - player.x, pc.root.position.z - player.z)); }
        pc.update(dt, player);
      }
      for (const f of shrineFolk) {
        const pd = Math.abs(f.p.root.position.x - player.x) + Math.abs(f.p.root.position.z - player.z);
        f.p.root.visible = pd < 360;
        if (pd < 260) f.p.update(dt, 0, night && f.act === 'pray' ? 'idle' : f.act);
      }
      for (const e of elephants) {
        const pd = Math.abs(e.p.x - player.x) + Math.abs(e.p.z - player.z);
        e.root.visible = pd < 600;
        if (pd > 520) continue;
        if (e.bless > 0) {
          // turn to the boy and stand still, trunk raised high over him
          e.bless -= dt;
          e.state = 'graze'; e.timer = 5; e.target = null;
          const want = Math.atan2(player.x - e.p.x, player.z - e.p.z);
          e.facing += Math.atan2(Math.sin(want - e.facing), Math.cos(want - e.facing)) * (1 - Math.exp(-dt * 2.5));
        }
        e.update(dt, FAR, {});
        if (e.bless > 0) {
          const up = Math.min(1, e.bless * 1.5, (3.2 - e.bless) * 2);
          e.trunk.forEach((sg, i) => { sg.rotation.x = -up * (i < 3 ? 0.55 : 0.4) + Math.sin(e.t * 3 - i) * 0.05 * up; });
          e.ears.forEach((ear, i) => (ear.rotation.y = (i ? -1 : 1) * (0.4 + Math.sin(e.t * 5 + i) * 0.35)));
        }
        if (e.mahout) e.mahout.update(dt, 0, 'sit');
      }
    },
    // the elephants' bodies, for the player and vehicles to bump into
    bodies() { return elephants.map((e) => ({ kind: 'c', x: e.p.x, z: e.p.z, r: 1.3 * e.scale })); },
  };
}
