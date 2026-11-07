// A building site just outside the main village: two new pucca houses going up. The first has its brick
// walls nearly done, RCC columns with steel bars sticking out of the top and bamboo scaffolding down one
// side; the second is still a plinth, a few courses of brick and bare steel cages for its columns.
// The labourers are at work all day: the mistri lays the front wall brick by brick (it really grows), a man
// carries stacks of bricks on his head from the pile, a woman brings mortar in an iron tasla on hers, one
// mixes mortar with a phawda, one plasters the side wall from the scaffold, and the thekedar walks about
// with his register. At night the site is quiet.
import * as THREE from 'three';
import { Person } from './people.js';
import { colliders, surfaces, groundHeight, heightAt, localToWorld } from './world.js';

const mat = (c, r = 0.85, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o });
const BR = { L: 0.23, H: 0.085, D: 0.105 }; // brick pitch along the wall, course height, wall thickness
const ss = (x) => x * x * (3 - 2 * x);
const damp = (dt, r) => 1 - Math.exp(-dt * r);

// bricks: a merged brick + recessed mortar bed, vertex-coloured; three shades so the walls look fired by hand
function brickGeo(shade) {
  const b = new THREE.BoxGeometry(0.218, 0.074, BR.D);
  const m = new THREE.BoxGeometry(0.232, BR.H, BR.D - 0.02);
  const paint = (g, c) => {
    const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  };
  paint(b, shade); paint(m, '#9a948a');
  const g = new THREE.BufferGeometry();
  // merge by hand (keeps this file free of extra imports)
  const parts = [b, m].map((x) => x.toNonIndexed());
  for (const k of ['position', 'normal', 'color']) {
    const arr = []; for (const p of parts) arr.push(...p.attributes[k].array);
    g.setAttribute(k, new THREE.Float32BufferAttribute(arr, 3));
  }
  return g;
}

function brickTexture() {
  // the end faces of stacked bricks, for the big piles
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#6e3a28'; x.fillRect(0, 0, 256, 256);
  for (let r = 0; r < 16; r++) for (let i = 0; i < 8; i++) {
    const l = 38 + Math.random() * 14;
    x.fillStyle = `hsl(${10 + Math.random() * 10}, ${45 + Math.random() * 15}%, ${l * 0.85}%)`;
    x.fillRect(i * 32 + 1, r * 16 + 1, 30, 14);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function signTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const x = c.getContext('2d');
  x.fillStyle = '#f2c21a'; x.fillRect(0, 0, 512, 192);
  x.strokeStyle = '#1a1a1a'; x.lineWidth = 10; x.strokeRect(6, 6, 500, 180);
  x.fillStyle = '#1a1a1a'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 50px "Tiro Devanagari Hindi", "Kohinoor Devanagari", sans-serif';
  x.fillText('निर्माण कार्य जारी है', 256, 70);
  x.font = 'bold 32px sans-serif';
  x.fillText('WORK IN PROGRESS', 256, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildConstruction(scene, site, hooks = {}) {
  if (!site) return { update() {}, setWeather() {}, workers: [] };
  const G = new THREE.Group();
  const Y = heightAt(site.x, site.z);
  G.position.set(site.x, Y, site.z);
  G.rotation.y = site.rot;
  scene.add(G);
  const W = (lx, lz) => localToWorld(site, lx, lz);
  const gyL = (lx, lz) => { const p = W(lx, lz); return groundHeight(p.x, p.z) - Y; }; // ground height in site space
  const add = (geo, m, x, y, z, p = G) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; };
  const box = (lx, lz, hw, hd, top, extra = {}) => { const p = W(lx, lz); const c = { kind: 'b', x: p.x, z: p.z, rot: site.rot, hw, hd, height: Y + top, ...extra }; colliders.push(c); return c; };
  const circ = (lx, lz, r, top) => { const p = W(lx, lz); colliders.push({ kind: 'c', x: p.x, z: p.z, r, height: Y + top }); };

  const M = {
    concrete: mat('#a9a69e', 0.9), plinth: mat('#8f8b82', 0.95), steel: mat('#5a4a40', 0.5, { metalness: 0.6 }),
    bamboo: mat('#b89a5a', 0.7), bambooDark: mat('#8a6e3a', 0.75), wood: mat('#7a5232', 0.8), plank: mat('#9a7a52', 0.85),
    sand: mat('#d8bf8a', 1), gravel: mat('#8a8780', 1), mortar: mat('#8e8a84', 1), wet: mat('#6e6b66', 0.6),
    tarp: mat('#2a64b8', 0.8, { side: THREE.DoubleSide }), bag: mat('#e8e2d4', 0.9), bagPrint: mat('#3a6ab8', 0.8),
    drum: mat('#2a6ad0', 0.5), iron: mat('#3a3836', 0.6, { metalness: 0.5 }), plaster: mat('#b8b4ac', 0.95),
    pile: new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9 }), cloth: mat('#c0392b', 0.9),
  };

  // ---------------- the two plinths ----------------
  const A = { x0: -4.5, x1: 2.5, z0: -5.75, z1: -0.25, top: 0.45 };
  const B = { x0: 4.3, x1: 8.8, z0: -6.2, z1: -1.8, top: 0.38 };
  for (const P of [A, B]) {
    const cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2, hw = (P.x1 - P.x0) / 2 + 0.3, hd = (P.z1 - P.z0) / 2 + 0.3;
    add(new THREE.BoxGeometry(hw * 2, P.top + 1.2, hd * 2), M.plinth, cx, P.top / 2 - 0.6, cz);
    const p = W(cx, cz);
    surfaces.push({ kind: 'b', x: p.x, z: p.z, rot: site.rot, hw, hd, top: Y + P.top });
  }

  // ---------------- brickwork ----------------
  const shades = ['#a8452c', '#9a3c26', '#b4583a'];
  const lists = shades.map(() => ({ stat: [], act: [] }));
  const activeList = []; // ordered, for the growing wall
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), UPY = new THREE.Vector3(0, 1, 0);
  let rr = 1;
  const rnd = () => { rr = (rr * 16807) % 2147483647; return rr / 2147483647; };
  // a wall along x (dir 'x') or z from (ax, az), length L, courses c0..c1 on a plinth top y0
  function wall({ ax, az, dir, L, y0, c0 = 0, c1, open = [], rack = null, active = false }) {
    const out = [];
    for (let c = c0; c < c1; c++) {
      const off = (c % 2) * BR.L / 2;
      let lim0 = 0, lim1 = L;
      if (rack) [lim0, lim1] = rack(c, L);
      const row = [];
      for (let s = -off; s < L; s += BR.L) {
        const a = Math.max(lim0, s), b = Math.min(lim1, s + BR.L);
        if (b - a < 0.06) continue;
        if (open.some((o) => c >= o.c0 && c < o.c1 && b > o.s0 + 0.01 && a < o.s1 - 0.01)) continue;
        const mid = (a + b) / 2, len = b - a;
        const x = dir === 'x' ? ax + mid : ax, z = dir === 'x' ? az : az + mid;
        row.push({ x, y: y0 + c * BR.H + BR.H / 2, z, rot: dir === 'x' ? 0 : Math.PI / 2, sx: len / BR.L, s: mid, c });
      }
      if (active && c % 2) row.reverse(); // the mistri works back and forth
      out.push(...row);
    }
    for (const b of out) {
      const k = Math.floor(rnd() * 3);
      if (active) { b.k = k; activeList.push(b); lists[k].act.push(b); } else lists[k].stat.push(b);
    }
    return out;
  }
  const yA = A.top, yB = B.top;
  const LA = A.x1 - A.x0, DA = A.z1 - A.z0;
  // house A: back wall full height with a window, the left wall racked back toward the front, the right
  // wall high (the plasterer's), front wall: a door, the right part done, the left part being laid now
  wall({ ax: A.x0, az: A.z0, dir: 'x', L: LA, y0: yA, c1: 28, open: [{ s0: 2.6, s1: 3.7, c0: 11, c1: 23 }] });
  wall({ ax: A.x0, az: A.z0, dir: 'z', L: DA, y0: yA, c1: 28, rack: (c, L) => [0, c < 15 ? L : L - (c - 14) * BR.L] });
  wall({ ax: A.x1, az: A.z0, dir: 'z', L: DA, y0: yA, c1: 24 });
  const DOOR = { x0: -0.6, x1: 0.4 };
  wall({ ax: DOOR.x1, az: A.z1, dir: 'x', L: A.x1 - DOOR.x1, y0: yA, c1: 16, open: [{ s0: 0.5, s1: 1.5, c0: 10, c1: 99 }] });
  const ACT0 = 8, ACT1 = 22;
  wall({ ax: A.x0, az: A.z1, dir: 'x', L: DOOR.x0 - A.x0, y0: yA, c1: ACT0 });
  wall({ ax: A.x0, az: A.z1, dir: 'x', L: DOOR.x0 - A.x0, y0: yA, c0: ACT0, c1: ACT1, active: true });
  // house B: the first five courses all round, a gap for the door
  const LB = B.x1 - B.x0, DB = B.z1 - B.z0;
  wall({ ax: B.x0, az: B.z0, dir: 'x', L: LB, y0: yB, c1: 6 });
  wall({ ax: B.x0, az: B.z1, dir: 'x', L: LB, y0: yB, c1: 5, open: [{ s0: 1.7, s1: 2.7, c0: 0, c1: 99 }] });
  wall({ ax: B.x0, az: B.z0, dir: 'z', L: DB, y0: yB, c1: 5 });
  wall({ ax: B.x1, az: B.z0, dir: 'z', L: DB, y0: yB, c1: 4 });

  const meshes = lists.map((l, i) => {
    const n = l.stat.length + l.act.length;
    const m = new THREE.InstancedMesh(brickGeo(shades[i]), mat('#ffffff', 0.92, { vertexColors: true }), n);
    m.castShadow = true; m.receiveShadow = true;
    [...l.stat, ...l.act].forEach((b, j) => {
      _q.setFromAxisAngle(UPY, b.rot + (rnd() - 0.5) * 0.02);
      _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.sx, 1, 1));
      m.setMatrixAt(j, _m);
    });
    m.count = l.stat.length;
    G.add(m);
    return m;
  });
  let built = 0;
  const setBuilt = (n) => {
    built = Math.max(0, Math.min(activeList.length, n));
    const per = [0, 0, 0];
    for (let i = 0; i < built; i++) per[activeList[i].k]++;
    meshes.forEach((m, i) => { m.count = lists[i].stat.length + per[i]; });
    const top = built ? activeList[built - 1].c + 1 : ACT0;
    actCol.height = Y + yA + top * BR.H;
  };
  // wall colliders (house A has a door gap in the front)
  const t = BR.D / 2;
  box((A.x0 + A.x1) / 2, A.z0, LA / 2 + t, t, yA + 28 * BR.H);
  box(A.x0, (A.z0 + A.z1) / 2, t, DA / 2 + t, yA + 28 * BR.H);
  box(A.x1, (A.z0 + A.z1) / 2, t, DA / 2 + t, yA + 24 * BR.H);
  box((DOOR.x1 + A.x1) / 2, A.z1, (A.x1 - DOOR.x1) / 2, t, yA + 16 * BR.H);
  const actCol = box((A.x0 + DOOR.x0) / 2, A.z1, (DOOR.x0 - A.x0) / 2, t, yA + ACT0 * BR.H);
  box((B.x0 + B.x1) / 2, B.z0, LB / 2 + t, t, yB + 6 * BR.H);
  box(B.x0 + 0.85, B.z1, 0.85, t, yB + 5 * BR.H); box(B.x1 - 0.9, B.z1, 0.9, t, yB + 5 * BR.H);
  box(B.x0, (B.z0 + B.z1) / 2, t, DB / 2 + t, yB + 5 * BR.H);
  box(B.x1, (B.z0 + B.z1) / 2, t, DB / 2 + t, yB + 4 * BR.H);

  // door frame (chaukhat) set in the gap, a concrete lintel over the window
  add(new THREE.BoxGeometry(0.08, 2.1, 0.12), M.wood, DOOR.x0 + 0.04, yA + 1.05, A.z1);
  add(new THREE.BoxGeometry(0.08, 2.1, 0.12), M.wood, DOOR.x1 - 0.04, yA + 1.05, A.z1);
  add(new THREE.BoxGeometry(DOOR.x1 - DOOR.x0, 0.08, 0.12), M.wood, (DOOR.x0 + DOOR.x1) / 2, yA + 2.1, A.z1);
  add(new THREE.BoxGeometry(1.5, 0.12, 0.14), M.concrete, A.x0 + 3.15, yA + 23 * BR.H + 0.06, A.z0);

  // RCC columns at A's corners with the bars sticking up out of the top; bare steel cages at B
  const rebar = new THREE.CylinderGeometry(0.008, 0.008, 1, 5);
  const column = (x, z, y0, h) => {
    add(new THREE.BoxGeometry(0.25, h, 0.25), M.concrete, x, y0 + h / 2, z);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const r = add(rebar, M.steel, x + dx * 0.08, y0 + h + 0.38, z + dz * 0.08);
      r.scale.y = 0.8; r.rotation.set(dz * 0.06, 0, -dx * 0.06);
    }
  };
  for (const [x, z] of [[A.x0, A.z0], [A.x1, A.z0], [A.x0, A.z1], [A.x1, A.z1]]) { column(x, z, yA, 2.65); box(x, z, 0.14, 0.14, yA + 2.65); }
  const cage = (x, z, y0, h) => {
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const r = add(rebar, M.steel, x + dx * 0.09, y0 + h / 2, z + dz * 0.09); r.scale.y = h; }
    const ring = new THREE.TorusGeometry(0.125, 0.005, 4, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4);
    for (let y = 0.15; y < h; y += 0.18) add(ring, M.steel, x, y0 + y, z);
    // a bamboo prop holding it straight
    const p = add(new THREE.CylinderGeometry(0.03, 0.035, h * 1.05, 6), M.bambooDark, x + 0.5, y0 + h / 2 - 0.1, z);
    p.rotation.z = 0.35;
  };
  for (const [x, z] of [[B.x0, B.z0], [B.x1, B.z0], [B.x0, B.z1], [B.x1, B.z1], [(B.x0 + B.x1) / 2, B.z0]]) { cage(x, z, yB, 3.0); circ(x, z, 0.16, yB + 3); }

  // bamboo scaffolding down A's right side, with a plank deck for the plasterer and a ladder
  const SC = { x: A.x1 + 0.75, deck: 1.15 };
  const pole = new THREE.CylinderGeometry(0.035, 0.04, 1, 7);
  const lash = mat('#5a4030', 1);
  for (const z of [-5.4, -3.0, -0.6]) {
    for (const x of [A.x1 + 0.25, SC.x]) { const g0 = gyL(x, z); const o = add(pole, M.bamboo, x, g0 + 1.85, z); o.scale.y = 3.7; circ(x, z, 0.06, 4); }
    for (const y of [SC.deck - 0.05, 2.3]) { const o = add(pole, M.bamboo, (A.x1 + 0.25 + SC.x) / 2, y, z); o.scale.y = 0.75; o.rotation.z = Math.PI / 2; add(new THREE.SphereGeometry(0.05, 5, 4), lash, SC.x, y, z); }
  }
  for (const x of [A.x1 + 0.25, SC.x]) for (const y of [SC.deck - 0.05, 2.3, 3.4]) { const o = add(pole, M.bamboo, x, y, -3.0); o.scale.y = 5.2; o.rotation.x = Math.PI / 2; }
  for (let i = 0; i < 2; i++) add(new THREE.BoxGeometry(0.24, 0.04, 4.9), M.plank, A.x1 + 0.37 + i * 0.26, SC.deck, -3.0);
  {
    const lad = new THREE.Group(); lad.position.set(SC.x + 0.55, 0, -0.15); lad.rotation.z = 0.28; G.add(lad);
    for (const sx of [-0.2, 0.2]) add(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), M.bambooDark, 0, 1.1, sx, lad);
    for (let y = 0.2; y < 2.1; y += 0.3) add(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 5).rotateX(Math.PI / 2), M.bambooDark, 0, y, 0, lad);
  }
  // fresh plaster spreading along A's right wall — it grows while he works
  const plasterGeo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0);
  const plaster = add(plasterGeo, M.plaster, 0, 0, 0);
  plaster.rotation.y = Math.PI / 2;
  plaster.position.set(A.x1 + BR.D / 2 + 0.008, yA + 1.35, -0.6);
  plaster.scale.set(0.4, 1.3, 1);
  plaster.castShadow = false;
  const PL = { z0: -0.6, z1: -5.5 };

  // ---------------- the materials yard ----------------
  // brick stacks: one full, one half used and stepped
  add(new THREE.BoxGeometry(2.3, 1.15, 1.1), M.pile, -7.2, gyL(-7.2, 3.8) + 0.575, 3.8);
  add(new THREE.BoxGeometry(2.3, 0.55, 1.1), M.pile, -7.2, gyL(-7.2, 6.3) + 0.275, 6.3);
  add(new THREE.BoxGeometry(1.1, 0.35, 1.1), M.pile, -7.8, gyL(-7.8, 6.3) + 0.72, 6.3);
  box(-7.2, 3.8, 1.15, 0.55, 1.15); box(-7.2, 6.3, 1.15, 0.55, 0.9);
  // the mistri's loose bricks along the foot of the wall he is laying
  const looseGeo = new THREE.BoxGeometry(0.22, 0.075, 0.105);
  const looseM = mat('#a8452c', 0.9);
  for (let i = 0; i < 9; i++) { const o = add(looseGeo, looseM, -4.1 + i * 0.42, gyL(-4.1 + i * 0.42, 0.95) + 0.04 + (i % 3 === 0 ? 0.075 : 0), 0.95 + (i % 2) * 0.12); o.rotation.y = (i * 1.7) % 0.6; }
  // sand and gravel heaps, the mortar bed, cement bags on a pallet, a water drum, pans, a wheelbarrow
  const heap = (x, z, r, h, m) => { const o = add(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(r, h, r * 0.9), m, x, gyL(x, z) - 0.02, z); circ(x, z, r * 0.6, h * 0.8); return o; };
  heap(4.8, 3.0, 1.9, 1.0, M.sand);
  heap(7.8, 4.4, 1.35, 0.7, M.gravel);
  const MIX = { x: 1.5, z: 4.2 };
  add(new THREE.CylinderGeometry(1.15, 1.25, 0.06, 20), M.wet, MIX.x, gyL(MIX.x, MIX.z) + 0.02, MIX.z);
  heap(MIX.x + 0.15, MIX.z + 0.1, 0.65, 0.3, M.mortar);
  add(new THREE.BoxGeometry(1.3, 0.12, 0.9), M.wood, -2.8, gyL(-2.8, 6.3) + 0.06, 6.3);
  const bagGeo = new THREE.BoxGeometry(0.6, 0.15, 0.4).toNonIndexed();
  for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) for (let j = 0; j < (r === 2 ? 1 : 2); j++) {
    const o = add(bagGeo, M.bag, -3.12 + i * 0.64, gyL(-2.8, 6.3) + 0.2 + r * 0.155, 6.1 + j * 0.42);
    o.rotation.y = (r % 2) * 0.05;
    add(new THREE.PlaneGeometry(0.3, 0.1), M.bagPrint, 0, 0.076, 0, o).rotation.x = -Math.PI / 2;
  }
  box(-2.8, 6.3, 0.68, 0.48, 0.65);
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 16), M.drum, 3.4, gyL(3.4, 6.2) + 0.44, 6.2); circ(3.4, 6.2, 0.32, 0.9);
  add(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 16), mat('#3a5a6a', 0.2, { metalness: 0.3 }), 3.4, gyL(3.4, 6.2) + 0.87, 6.2);
  const taslaGeo = new THREE.SphereGeometry(0.26, 14, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2.6);
  for (const [x, z] of [[0.4, 5.2], [2.7, 3.3]]) add(taslaGeo, M.iron, x, gyL(x, z) + 0.13, z);
  {
    const wb = new THREE.Group(); wb.position.set(-5.0, gyL(-5.0, 8.0), 8.0); wb.rotation.y = 0.6; G.add(wb);
    add(new THREE.BoxGeometry(0.6, 0.28, 0.75).translate(0, 0.45, 0), mat('#c8a020', 0.5, { metalness: 0.4 }), 0, 0, 0, wb);
    const w = add(new THREE.TorusGeometry(0.16, 0.05, 6, 14).rotateY(Math.PI / 2), M.iron, 0, 0.18, 0.5, wb);
    w.castShadow = true;
    for (const sx of [-0.25, 0.25]) add(new THREE.CylinderGeometry(0.02, 0.02, 1.4).rotateX(Math.PI / 2 - 0.2), M.iron, sx, 0.4, -0.2, wb);
    box(-5.0, 8.0, 0.5, 0.6, 0.7);
  }
  // steel bars lying in a bundle, shuttering planks
  for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(0.008, 0.008, 6).rotateZ(Math.PI / 2), M.steel, 6.5, gyL(6.5, 7.3) + 0.02 + (i % 3) * 0.017, 7.2 + Math.floor(i / 3) * 0.02 + (i % 3) * 0.02);
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(2.4, 0.03, 0.25), M.plank, 9.0, gyL(9, 0.8) + 0.02 + i * 0.032, 0.8 + (i % 2) * 0.04);
  // the labourers' tarpaulin shelter, a charpai, a chulha of three bricks with a pot
  {
    const T = { x: -8.6, z: -4.2 };
    const tp = new THREE.Group(); tp.position.set(T.x, gyL(T.x, T.z), T.z); tp.rotation.y = 0.2; G.add(tp);
    for (const [x, z, h] of [[-1.4, -1.1, 1.9], [1.4, -1.1, 1.9], [-1.4, 1.1, 1.2], [1.4, 1.1, 1.2]]) add(new THREE.CylinderGeometry(0.035, 0.04, h, 6), M.bambooDark, x, h / 2, z, tp);
    const tarp = add(new THREE.PlaneGeometry(3.1, 2.5, 6, 4), M.tarp, 0, 1.55, 0, tp);
    tarp.rotation.x = -Math.PI / 2 + 0.29;
    const tpos = tarp.geometry.attributes.position;
    for (let i = 0; i < tpos.count; i++) tpos.setZ(i, -Math.abs(Math.sin(tpos.getX(i) * 1.1)) * 0.06 + Math.cos(tpos.getY(i) * 1.3) * 0.03);
    tarp.geometry.computeVertexNormals();
    add(new THREE.PlaneGeometry(3.1, 1.6), M.tarp, 0, 1.0, -1.12, tp);
    add(new THREE.BoxGeometry(1.8, 0.08, 0.8), mat('#c9b48a', 1), -0.3, 0.42, 0.1, tp);
    for (const [x, z] of [[-1.15, -0.32], [0.55, -0.32], [-1.15, 0.5], [0.55, 0.5]]) add(new THREE.CylinderGeometry(0.035, 0.03, 0.42, 6), M.wood, x, 0.21, z, tp);
    add(new THREE.SphereGeometry(0.22, 10, 6).scale(1.4, 0.5, 1), M.cloth, -0.8, 0.52, 0.1, tp);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; add(looseGeo, looseM, 1.0 + Math.cos(a) * 0.14, 0.06, 1.6 + Math.sin(a) * 0.14, tp).rotation.set(0, a, Math.PI / 2); }
    add(new THREE.SphereGeometry(0.13, 10, 8), mat('#2a2826', 0.4, { metalness: 0.4 }), 1.0, 0.24, 1.6, tp);
    const tw = W(T.x, T.z); colliders.push({ kind: 'b', x: tw.x, z: tw.z, rot: site.rot + 0.2, hw: 1.45, hd: 1.15, height: Y + 2, npcPass: true });
  }
  // a signboard at the roadside edge of the plot
  {
    const sx = 0, sz = 10.8, g0 = gyL(sx, sz);
    for (const x of [-0.75, 0.75]) add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), M.wood, sx + x, g0 + 0.8, sz);
    const sg = add(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6, side: THREE.DoubleSide }), sx, g0 + 1.3, sz + 0.03);
    sg.castShadow = false;
    box(sx, sz, 0.8, 0.06, 1.6);
  }

  // ---------------- the labourers ----------------
  const SKIN = ['#6e4530', '#5f3a26', '#7d4f33', '#83553a', '#6a4028', '#5a3624'];
  const mk = (o, lx, lz, face) => {
    const p = new Person(o);
    p.root.position.set(lx, gyL(lx, lz), lz);
    p.root.rotation.y = face;
    G.add(p.root);
    return p;
  };
  // a cloth head-pad (indhoni) with a stack of bricks on it; the woman's iron tasla with mortar
  const headLoad = (p, kind) => {
    const g = new THREE.Group(); g.position.y = 0.13; p.head.add(g);
    add(new THREE.TorusGeometry(0.08, 0.03, 6, 12).rotateX(Math.PI / 2), M.cloth, 0, 0, 0, g);
    if (kind === 'bricks') {
      const load = new THREE.Group(); g.add(load);
      for (let i = 0; i < 8; i++) add(looseGeo, looseM, 0, 0.05 + Math.floor(i / 2) * 0.077, (i % 2 - 0.5) * 0.112, load).rotation.y = Math.PI / 2;
      return load;
    }
    add(taslaGeo, M.iron, 0, 0.11, 0, g).rotation.x = Math.PI;
    const fill = add(new THREE.SphereGeometry(0.22, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), M.mortar, 0, 0.1, 0, g);
    return fill;
  };
  const tool = (p, hand, geo, m, y, rx = 0) => { const o = add(geo, m, 0, y, 0.02, p.arms[hand].hand); o.rotation.x = rx; return o; };

  // 1. the mistri at the front wall, with a trowel
  const mason = mk({ dress: 'pants', top: '#d8d0bc', bottom: '#5a5248', skin: SKIN[0], mustache: true, sleeves: 'short', headwear: 'cap', turban: '#e8e0cc' }, -3.6, 0.42, Math.PI);
  const trowel = new THREE.Group();
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.11, 6), M.wood, 0, -0.05, 0, trowel);
  add(new THREE.BoxGeometry(0.1, 0.006, 0.16).translate(0, 0, 0.06), mat('#9aa0a4', 0.3, { metalness: 0.8 }), 0, -0.11, 0.02, trowel);
  mason.arms[1].hand.add(trowel);
  const brickInHand = add(looseGeo, looseM, 0, -0.08, 0.04, mason.arms[0].hand);
  // 2. the brick carrier
  const carrier = mk({ dress: 'dhoti', top: '#e9e2cf', bottom: '#d8d0bc', skin: SKIN[1], mustache: true, sleeves: 'short', headwear: 'turban', turban: '#f2efe6' }, -5.8, 3.8, 0);
  const bricksOnHead = headLoad(carrier, 'bricks');
  // 3. the woman with the mortar pan
  const woman = mk({ dress: 'saree', top: '#c2185b', bottom: '#7a2b6e', skin: SKIN[2], veil: true, k: 0.92 }, 1.0, 3.1, Math.PI);
  const mortarOnHead = headLoad(woman, 'tasla');
  // 4. the mortar mixer with a phawda
  const mixer = mk({ dress: 'pants', top: '#8fa6c4', bottom: '#4a4a52', skin: SKIN[3], sleeves: 'short', mustache: false }, MIX.x + 0.75, MIX.z + 1.0, Math.PI + 0.6);
  mixer.prop('hoe', true);
  // 5. the plasterer up on the scaffold deck
  const plasterer = mk({ dress: 'pants', top: '#b9c7a5', bottom: '#5b5246', skin: SKIN[4], sleeves: 'short', headwear: 'cap', turban: '#b9c7a5', mustache: true }, A.x1 + 0.5, -1.0, -Math.PI / 2);
  plasterer.root.position.y = SC.deck + 0.02;
  const ptrowel = trowel.clone(); plasterer.arms[1].hand.add(ptrowel);
  const hawk = add(new THREE.BoxGeometry(0.22, 0.01, 0.22), M.wood, 0, -0.1, 0.06, plasterer.arms[0].hand);
  add(new THREE.SphereGeometry(0.06, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.plaster, 0, 0.005, 0, hawk);
  // 6. the thekedar in white with his register
  const boss = mk({ dress: 'kurta', top: '#f4f2ec', bottom: '#f4f2ec', skin: SKIN[5], mustache: true, k: 1.03 }, -1.5, 8.5, Math.PI);
  add(new THREE.BoxGeometry(0.16, 0.22, 0.02), mat('#7a2a2a', 0.7), 0, -0.1, 0.05, boss.arms[0].hand);
  const workers = [mason, carrier, woman, mixer, plasterer, boss];

  // ----- jobs -----
  const S = {
    mason: { t: 0, x: -3.6, z: 0.42, phase: 0 },
    carrier: { s: 'load', t: 0, x: -5.75, z: 3.8 },
    woman: { s: 'fill', t: 0, x: 1.0, z: 3.1 },
    mixT: 0,
    plaster: { z: -0.6, t: 0 },
    boss: { i: 0, x: -1.5, z: 8.5, wait: 2 },
  };
  setBuilt(Math.floor(activeList.length * 0.25));
  const walkTo = (p, st, x, z, v, dt) => {
    const dx = x - st.x, dz = z - st.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { p.update(dt, 0, 'idle'); return true; }
    const k = Math.min(1, (v * dt) / d);
    st.x += dx * k; st.z += dz * k;
    p.root.position.set(st.x, gyL(st.x, st.z), st.z);
    p.root.rotation.y = Math.atan2(dx, dz);
    p.update(dt, v, 'walk');
    return false;
  };
  const faceTo = (p, a, dt) => { const d = Math.atan2(Math.sin(a - p.root.rotation.y), Math.cos(a - p.root.rotation.y)); p.root.rotation.y += d * damp(dt, 6); };

  // poses
  let mPose = { bend: 0, reach: 0, tap: 0 };
  mason.poseHook = (P) => {
    const { bend, reach, tap } = mPose;
    P.torsoX = 0.15 + bend * 0.75; P.hip0 = P.hip1 = -bend * 0.35; P.knee0 = P.knee1 = bend * 0.45; P.bodyY = -bend * 0.08;
    P.sh0 = -0.4 - bend * 0.7 - reach * 1.2; P.el0 = -0.3 - reach * 0.3; P.shz0 = 0.1;
    P.sh1 = -0.9 - reach * 0.5 - tap * 0.35; P.el1 = -0.9 + tap * 0.3; P.shz1 = -0.15;
    P.headX = 0.35 + bend * 0.2; P.headY = 0;
  };
  mason.poseRate = 10;
  let cPose = { bend: 0, carry: 1 };
  carrier.poseHook = (P) => {
    if (cPose.carry > 0.5) { P.sh1 = -2.75; P.el1 = -0.5; P.shz1 = -0.2; }
    if (cPose.bend > 0) { P.torsoX = cPose.bend * 1.0; P.sh0 = P.sh1 = -1.2 * cPose.bend - 0.3; P.el0 = P.el1 = -0.3; P.knee0 = P.knee1 = cPose.bend * 0.5; P.hip0 = P.hip1 = -cPose.bend * 0.4; P.bodyY = -cPose.bend * 0.1; }
  };
  let wPose = { bend: 0 };
  woman.poseHook = (P) => {
    if (wPose.bend > 0) { P.torsoX = wPose.bend * 0.9; P.sh0 = P.sh1 = -1.0 * wPose.bend - 0.4; P.knee0 = P.knee1 = wPose.bend * 0.6; P.hip0 = P.hip1 = -wPose.bend * 0.5; P.bodyY = -wPose.bend * 0.12; }
    else { P.sh1 = -2.8; P.el1 = -0.45; P.shz1 = -0.2; }
  };
  let mixA = 0;
  mixer.poseHook = (P) => {
    // the phawda goes up over the shoulder and chops down into the mortar, then drags it back
    const up = Math.max(0, Math.sin(mixA)), down = Math.max(0, -Math.sin(mixA));
    P.sh0 = P.sh1 = -0.9 - up * 1.4 + down * 0.3; P.el0 = P.el1 = -0.6 - up * 0.5;
    P.shz0 = 0.15; P.shz1 = -0.15;
    P.torsoX = 0.35 + down * 0.45 - up * 0.1; P.knee0 = P.knee1 = 0.25; P.hip0 = -0.3; P.hip1 = 0.05; P.headX = 0.3; P.headY = 0;
  };
  mixer.poseRate = 12;
  let plA = 0;
  plasterer.poseHook = (P) => {
    P.sh1 = -1.5 - Math.sin(plA) * 0.45; P.shz1 = -0.2 + Math.cos(plA) * 0.35; P.el1 = -0.45;
    P.sh0 = -1.0; P.el0 = -1.2; P.shz0 = 0.3; P.torsoX = 0.05; P.headX = -0.1; P.headY = 0.15;
  };
  boss.poseHook = (P, t) => { P.sh0 = -0.9; P.el0 = -1.1; P.shz0 = 0.2; if (S.boss.wait > 0) { P.sh1 = -0.3 + Math.sin(t * 2) * 0.1; P.el1 = -0.6; P.headX = 0.25; } };

  let mode = 'day', lastShout = -99, clock = 0;
  const BOSS_PTS = [[-1.5, 8.5], [3.0, 8.6], [-0.4, 2.3], [3.0, 8.6]];
  const P_ = new THREE.Vector3();
  return {
    workers,
    group: G,
    get built() { return built; },
    setBuilt,
    setWeather(w) { mode = w.night ? 'night' : w.rain ? 'rain' : 'day'; },
    update(dt, player) {
      clock += dt;
      const d = Math.hypot(player.x - site.x, player.z - site.z);
      const show = mode !== 'night';
      for (const p of workers) p.root.visible = show;
      // the half-built wall starts over (a new house!) only when nobody is watching
      if (built >= activeList.length && d > 90) { setBuilt(0); plaster.scale.x = 0.4; S.plaster.z = PL.z0; }
      if (!show || d > 140) return;
      const vol = Math.max(0, 1 - d / 45);
      // --- mistri: pick up a brick, butter it, set it on the wall, tap it home with the trowel
      {
        const M_ = S.mason;
        const next = activeList[Math.min(built, activeList.length - 1)];
        const want = Math.max(A.x0 + 0.35, Math.min(DOOR.x0 - 0.3, next.x));
        if (built < activeList.length && Math.abs(want - M_.x) > 0.5) {
          mPose = { bend: 0, reach: 0, tap: 0 };
          walkTo(mason, M_, want, 0.42, 0.9, dt);
          M_.z = 0.42;
        } else {
          faceTo(mason, Math.PI, dt);
          mason.root.position.set(M_.x, gyL(M_.x, 0.42), 0.42);
          M_.t += dt;
          const T = M_.t % 4.2;
          const hY = next.c - ACT0;
          if (T < 1.0) { mPose = { bend: ss(Math.min(1, T / 0.5)), reach: 0, tap: 0 }; brickInHand.visible = T > 0.5; }
          else if (T < 2.0) { const k = ss((T - 1.0)); mPose = { bend: (1 - k) * 0.6 + Math.max(0, 0.3 - hY * 0.04) * k, reach: k * (0.6 + hY * 0.05), tap: 0 }; brickInHand.visible = true; }
          else if (T < 2.2) { brickInHand.visible = false; if (M_.phase === 0 && built < activeList.length) { setBuilt(built + 1); M_.phase = 1; } }
          else if (T < 3.4) { const tp = Math.max(0, Math.sin((T - 2.2) * 16)); mPose = { bend: 0.15, reach: 0.6 + hY * 0.05, tap: tp }; if (tp > 0.97 && clock - (M_.lastTap || 0) > 0.25) { M_.lastTap = clock; hooks.tink?.(vol); } }
          else { mPose = { bend: 0, reach: 0, tap: 0 }; M_.phase = 0; }
          mason.update(dt, 0, 'idle');
        }
      }
      // --- brick carrier: load eight bricks at the stack, walk them over, set them down, back again
      {
        const C = S.carrier;
        C.t += dt;
        if (C.s === 'load') { cPose = { bend: ss(Math.min(1, C.t / 0.6)) * (C.t < 2.4 ? 1 : 0), carry: 0 }; faceTo(carrier, -Math.PI / 2, dt); carrier.update(dt, 0, 'idle'); bricksOnHead.visible = C.t > 1.8; if (C.t > 2.8) { C.s = 'go'; C.t = 0; } }
        else if (C.s === 'go') { cPose = { bend: 0, carry: 1 }; if (walkTo(carrier, C, -2.4, 1.55, 1.0, dt)) { C.s = 'drop'; C.t = 0; } }
        else if (C.s === 'drop') { cPose = { bend: ss(Math.min(1, C.t / 0.7)) * (C.t < 2.0 ? 1 : 0), carry: C.t < 0.8 ? 1 : 0 }; faceTo(carrier, Math.PI, dt); carrier.update(dt, 0, 'idle'); if (C.t > 1.0) bricksOnHead.visible = false; if (C.t > 2.4) { C.s = 'back'; C.t = 0; } }
        else if (walkTo(carrier, C, -5.75, 3.8, 1.25, dt)) { C.s = 'load'; C.t = 0; }
      }
      // --- the woman: fill the tasla at the mortar bed, carry it to the mistri, tip it out, go back
      {
        const Wm = S.woman;
        Wm.t += dt;
        if (Wm.s === 'fill') { wPose.bend = Wm.t < 2.4 ? ss(Math.min(1, Wm.t / 0.6)) : 0; mortarOnHead.visible = Wm.t > 2.0; faceTo(woman, Math.atan2(MIX.x - Wm.x, MIX.z - Wm.z), dt); woman.update(dt, 0, 'idle'); if (Wm.t > 3.0) { Wm.s = 'go'; Wm.t = 0; } }
        else if (Wm.s === 'go') { wPose.bend = 0; if (walkTo(woman, Wm, -1.4, 1.3, 0.9, dt)) { Wm.s = 'tip'; Wm.t = 0; } }
        else if (Wm.s === 'tip') { wPose.bend = Wm.t < 1.8 ? ss(Math.min(1, Wm.t / 0.6)) : 0; if (Wm.t > 1.0) mortarOnHead.visible = false; faceTo(woman, Math.PI * 0.85, dt); woman.update(dt, 0, 'idle'); if (Wm.t > 2.3) { Wm.s = 'back'; Wm.t = 0; } }
        else { wPose.bend = 0; if (walkTo(woman, Wm, 1.0, 3.1, 1.0, dt)) { Wm.s = 'fill'; Wm.t = 0; } }
      }
      // --- mortar mixer
      {
        const prev = Math.sin(mixA);
        mixA += dt * 3.2;
        if (prev > -0.95 && Math.sin(mixA) <= -0.95) hooks.thud?.(vol * 0.8);
        mixer.update(dt, 0, 'idle');
      }
      // --- plasterer: sweeps the trowel across the wall; the fresh patch creeps along behind him
      {
        const Pl = S.plaster;
        plA += dt * 4.5;
        if (Pl.z > PL.z1 + 0.6) Pl.z -= dt * 0.012;
        plaster.scale.x = Math.max(0.4, PL.z0 - Pl.z + 0.4);
        plasterer.root.position.set(A.x1 + 0.5, SC.deck + 0.02, Math.max(-5.3, Pl.z - 0.35));
        plasterer.root.rotation.y = -Math.PI / 2;
        plasterer.update(dt, 0, 'idle');
      }
      // --- thekedar: walks the plot, stops to watch and write
      {
        const Bs = S.boss;
        if (Bs.wait > 0) { Bs.wait -= dt; boss.update(dt, 0, 'idle'); faceTo(boss, Math.atan2(-2 - Bs.x, -2 - Bs.z), dt); }
        else {
          const [tx, tz] = BOSS_PTS[Bs.i];
          if (walkTo(boss, Bs, tx, tz, 0.8, dt)) { Bs.i = (Bs.i + 1) % BOSS_PTS.length; Bs.wait = 4 + Math.random() * 5; }
        }
        // the boy wanders in among the bricks: shooed out
        P_.set(player.x, 0, player.z);
        G.worldToLocal(P_.setY(Y));
        if (Math.abs(P_.x) < 9 && P_.z > -7 && P_.z < 9 && clock - lastShout > 25) {
          lastShout = clock;
          hooks.say?.(...(Math.random() < 0.5 ? ['अरे बेटा, ध्यान से! यहाँ काम चल रहा है', 'Arey beta, dhyaan se! Yahan kaam chal raha hai'] : ['ईंटों से दूर रहना, चोट लग जाएगी', 'Inton se door rehna, chot lag jaayegi']));
        }
      }
    },
  };
}
