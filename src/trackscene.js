// The country the trains run through, made worth looking at from a window seat — while staying a quiet
// village landscape:
//  - groves of different trees along the lines: tall pale eucalyptus in rows, dark domed mango orchards,
//    gulmohar in scarlet flower, palmyra palms, banana clumps and bamboo
//  - little trackside hamlets: a couple of round huts and a mud house, a haystack, a charpai with someone
//    sitting on it, a woodpile — and a dog who races the trains, barking, then trots home
//  - peacocks strutting near the line, calling when a train goes past
//  - a pair of tame elephants with their mahout, ambling about a clearing near the track
import * as THREE from 'three';
import { CANAL, canalDist, NEW_VILLAGES, TRACK, TRACK3, TRACK5, RING, TRACK_Y, heightAt, groundHeight, riverDist, RIVER_HALF, CROSSING, CROSSING3, jungleMask, fieldType, dirtMask, trackDist, tunnelMask, isFree, colliders, PLAY_RADIUS } from './world.js';
import { rng, fbm } from './noise.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyFoliageWind } from './wind.js';
import { roundHut, rectHouse, haystack, charpai, woodpile, bananaPlant, bambooClump } from './props.js';
import { Dog, Peacock, consolidate } from './animals.js';
import { Elephant } from './wildlife.js';
import { Person } from './people.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });

// ---- tree kinds: each a few merged parts, one material per part
function blob(r, x, y, z, sy = 1, detail = 1, R) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g); // shared corners, so the lumps are lit smoothly rather than in facets
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + (R() - 0.5) * 0.28; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * sy, p.getZ(i) * k); }
  g.computeVertexNormals();
  return g.translate(x, y, z);
}
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

function treeKinds() {
  const R = rng(4242);
  const bark = std('#5a4334'), pale = std('#d6cfc0', { roughness: 0.7 }), palmBark = std('#4c4641');
  const leafEuc = applyFoliageWind(lam('#7d9a6c'), { height: 14, amp: 0.45, flutter: 0.05, leafy: 1.4 });
  const leafMango = applyFoliageWind(lam('#2c5527'), { height: 7, amp: 0.25, flutter: 0.03, leafy: 1.2 });
  const leafGul = applyFoliageWind(lam('#4e7a30'), { height: 6, amp: 0.3, flutter: 0.04, leafy: 1.4 });
  const bloom = applyFoliageWind(lam('#e3401f', { emissive: '#3a0a02' }), { height: 6, amp: 0.3, flutter: 0.05 });
  const frond = applyFoliageWind(lam('#557a35', { side: THREE.DoubleSide }), { height: 12, amp: 0.8, flutter: 0.08 });
  const dry = std('#7a6a4a', { side: THREE.DoubleSide });
  const kinds = {};
  // eucalyptus: a tall, straight, pale trunk and a thin, high, grey-green crown
  {
    const trunk = [new THREE.CylinderGeometry(0.12, 0.24, 14, 7).translate(0, 7, 0)];
    for (const [y, a] of [[8, 0.6], [10, 2.4], [11.5, 4.2]]) trunk.push(new THREE.CylinderGeometry(0.04, 0.08, 2.4, 5).rotateZ(0.7).rotateY(a).translate(Math.cos(a) * 0.6, y, -Math.sin(a) * 0.6));
    const leaf = [];
    for (let i = 0; i < 7; i++) { const a = R() * 6.28, r = 0.4 + R() * 1.2; leaf.push(blob(0.9 + R() * 0.6, Math.cos(a) * r, 9.5 + R() * 5, Math.sin(a) * r, 1.5, 1, R)); }
    kinds.euc = [{ geo: merge(trunk), mat: pale }, { geo: merge(leaf), mat: leafEuc }];
  }
  // mango: a short, stout trunk and a dense dark dome
  {
    const trunk = [new THREE.CylinderGeometry(0.28, 0.42, 3.2, 8).translate(0, 1.6, 0)];
    for (const a of [0.4, 2.5, 4.4]) trunk.push(new THREE.CylinderGeometry(0.1, 0.18, 2.6, 6).rotateZ(0.65).rotateY(a).translate(Math.cos(a) * 0.7, 3.6, -Math.sin(a) * 0.7));
    const leaf = [blob(2.6, 0, 5.6, 0, 0.85, 1, R)];
    for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28 + R(), r = 2.1 + R() * 0.8; leaf.push(blob(1.6 + R() * 0.6, Math.cos(a) * r, 4.4 + R() * 1.8, Math.sin(a) * r, 0.85, 1, R)); }
    kinds.mango = [{ geo: merge(trunk), mat: bark }, { geo: merge(leaf), mat: leafMango }];
  }
  // gulmohar: a spreading umbrella of feathery green, blazing with scarlet flowers on top
  {
    const trunk = [new THREE.CylinderGeometry(0.2, 0.32, 3.4, 7).translate(0, 1.7, 0)];
    for (const a of [0, 2.1, 4.2]) trunk.push(new THREE.CylinderGeometry(0.07, 0.14, 3.2, 5).rotateZ(1.0).rotateY(a).translate(Math.cos(a) * 1.2, 4.0, -Math.sin(a) * 1.2));
    const leaf = [], fl = [];
    for (let i = 0; i < 11; i++) { const a = R() * 6.28, r = R() * 3.6; leaf.push(blob(1.3 + R() * 0.5, Math.cos(a) * r, 4.9 + R() * 0.7, Math.sin(a) * r, 0.5, 1, R)); }
    for (let i = 0; i < 16; i++) { const a = R() * 6.28, r = R() * 3.8; fl.push(blob(0.55 + R() * 0.35, Math.cos(a) * r, 5.5 + R() * 0.6, Math.sin(a) * r, 0.55, 0, R)); }
    kinds.gul = [{ geo: merge(trunk), mat: bark }, { geo: merge(leaf), mat: leafGul }, { geo: merge(fl), mat: bloom }];
  }
  // palmyra palm: a tall, dark, straight trunk and a ball of stiff fan leaves, a skirt of dead ones below
  {
    const trunk = [new THREE.CylinderGeometry(0.2, 0.3, 12.5, 8).translate(0, 6.25, 0), new THREE.CylinderGeometry(0.32, 0.22, 1.2, 8).translate(0, 12.6, 0)];
    const fan = [], dead = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.28 + R() * 0.3, up = 0.2 + R() * 0.9;
      const f = new THREE.CircleGeometry(1.25, 10, -1.2, 2.4).rotateZ(Math.PI / 2).rotateX(-up).translate(0, 0, 1.4).rotateY(a).translate(0, 13.1, 0);
      fan.push(f);
      fan.push(new THREE.CylinderGeometry(0.025, 0.04, 1.4, 4).rotateX(Math.PI / 2 - up * 0.5).translate(0, 0, 0.7).rotateY(a).translate(0, 13.1, 0));
    }
    for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28; dead.push(new THREE.CircleGeometry(0.9, 8, -1, 2).rotateZ(-Math.PI / 2).rotateX(1.2).translate(0, 0, 0.6).rotateY(a).translate(0, 12.0, 0)); }
    kinds.palmyra = [{ geo: merge(trunk), mat: palmBark }, { geo: merge(fan), mat: frond }, { geo: merge(dead), mat: dry }];
  }
  // banana clumps and bamboo, from the village's own makers
  const fromGroup = (g) => {
    g.updateMatrixWorld(true);
    const by = new Map();
    g.traverse((o) => { if (o.isMesh) { const k = o.material; if (!by.has(k)) by.set(k, []); by.get(k).push(o.geometry.clone().applyMatrix4(o.matrixWorld)); } });
    return [...by].map(([mat, list]) => ({ geo: merge(list), mat }));
  };
  const banana = new THREE.Group();
  for (let i = 0; i < 4; i++) { const b = bananaPlant(R); b.position.set((R() - 0.5) * 2.4, 0, (R() - 0.5) * 2.4); b.scale.setScalar(0.8 + R() * 0.5); banana.add(b); }
  kinds.banana = fromGroup(banana);
  kinds.bamboo = fromGroup(bambooClump(R));
  return kinds;
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

  // ---- groves: walk every line, both sides; the kind of tree changes from place to place in patches
  const kinds = treeKinds();
  const place = { euc: [], mango: [], gul: [], palmyra: [], banana: [], bamboo: [] };
  const RAD = { euc: 2, mango: 4.5, gul: 4, palmyra: 2.5, banana: 2.5, bamboo: 2.2 };
  const q = {};
  for (const T of [TRACK, TRACK3, RING, TRACK5]) {
    const P = T.path;
    for (let s = 20; s < P.L - 20; s += 6.5) {
      if (!T.openS(s, 20)) continue;
      P.at(s, q);
      for (const sd of [-1, 1]) {
        const patch = fbm(q.x * 0.006 + sd * 3.1, q.z * 0.006, 2);
        if (patch < -0.12 || R() > 0.55) continue;
        const kind = patch > 0.42 ? 'gul' : patch > 0.26 ? 'mango' : patch > 0.12 ? 'euc' : patch > 0.0 ? 'palmyra' : R() < 0.5 ? 'banana' : 'bamboo';
        // eucalyptus planted in a neat row close to the line; the rest scattered further back
        const off = kind === 'euc' ? 13 + R() * 3 : 12 + R() * 42;
        const x = q.x - q.tz * sd * off + (R() - 0.5) * 3, z = q.z + q.tx * sd * off + (R() - 0.5) * 3;
        const r = RAD[kind];
        if (fieldType(x, z) && kind !== 'euc' && kind !== 'palmyra') continue; // (eucalyptus and palms line the field edges)
        if (!clearLand(x, z, r)) continue;
        if (place[kind].some((p) => Math.abs(p.x - x) + Math.abs(p.z - z) < r * 2)) continue;
        place[kind].push({ x, z, y: groundHeight(x, z) - 0.1, s: 0.8 + R() * 0.45, a: R() * 6.28 });
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
        place.euc.push({ x, z, y: groundHeight(x, z) - 0.1, s: 0.85 + R() * 0.35, a: R() * 6.28 });
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
  // in cells of 500 m, so groves out of view or lost in the haze aren't drawn
  let nTrees = 0;
  const CELL = 500, cells = new Map();
  for (const [kind, list] of Object.entries(place)) {
    nTrees += list.length;
    for (const p of list) {
      const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL);
      if (!cells.has(key)) cells.set(key, { kind: {}, x: (Math.floor(p.x / CELL) + 0.5) * CELL, z: (Math.floor(p.z / CELL) + 0.5) * CELL, g: new THREE.Group() });
      (cells.get(key).kind[kind] ??= []).push(p);
      colliders.push({ kind: 'c', x: p.x, z: p.z, r: kind === 'mango' ? 0.45 : kind === 'bamboo' || kind === 'banana' ? 0.8 : 0.3 });
    }
  }
  for (const c of cells.values()) {
    for (const [kind, list] of Object.entries(c.kind)) for (const { geo, mat } of kinds[kind]) {
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
    group, dogs, peacocks, elephants, hamlets, trees: nTrees,
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
