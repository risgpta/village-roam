// The inside of a third-class coach, for riding as a passenger at a window seat: cream walls over a green
// dado, a row of open windows with horizontal bars, wooden slatted benches facing each other in bays, luggage
// racks, ceiling fans turning and tube lights. Fellow passengers sit about — chatting, dozing, looking out.
// There's only ever one, moved into whichever coach you board (the coaches themselves are solid boxes).
// Coach-local coordinates: length along z (16 m), width along x (2.9 m), floor at y = 1.6.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Person } from './people.js';

export const FLOOR = 1.6, WIN_Y0 = 2.45, WIN_Y1 = 3.35, CEIL = 3.95, WALL_X = 1.38;
export const WINDOWS = [-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6];
const WIN_W = 0.96, HALF_L = 7.8;

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

const RIDERS = [
  { dress: 'kurta', top: '#e9dcc3', bottom: '#f4f1e8', headwear: 'topi', beard: true, skin: '#8a5a3c', act: 'sit' },
  { dress: 'saree', top: '#c4241c', bottom: '#f2b705', veil: true, skin: '#a06a48', act: 'sit' },
  { dress: 'pants', top: '#8fa6c4', bottom: '#3a3a42', sleeves: 'short', skin: '#7a4c33', act: 'sip' },
  { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', headwear: 'turban', turban: '#e07a1e', mustache: true, skin: '#6e4530', act: 'sit' },
  { dress: 'saree', top: '#2e8b57', bottom: '#7a2b6e', veil: true, skin: '#93613f', act: 'sit' },
  { dress: 'shorts', k: 0.7, headScale: 1.2, top: '#e0612b', bottom: '#2a3a6a', sleeves: 'short', skin: '#8a5a3c', act: 'sit' },
  { dress: 'kurta', top: '#f4f2ec', bottom: '#f4f1e8', headwear: 'turban', turban: '#c4241c', mustache: true, skin: '#7a4c33', act: 'sit' },
];

export function buildCoachInside() {
  const g = new THREE.Group();
  g.name = 'coach-inside';
  const M = {
    upper: std('#e6e0cc', { roughness: 0.85 }), dado: std('#4f7a62', { roughness: 0.6 }), floor: std('#57524b', { roughness: 0.95 }),
    ceil: std('#efece2', { roughness: 0.9 }), wood: std('#7a5434', { roughness: 0.7 }), woodDk: std('#5a3b22', { roughness: 0.75 }),
    steel: std('#9aa1a8', { metalness: 0.7, roughness: 0.35 }), dark: std('#2a2c2e', { metalness: 0.4, roughness: 0.5 }),
    tube: new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff6e0', emissiveIntensity: 1.2 }),
    sill: std('#c9c1a8', { roughness: 0.7 }),
  };
  const parts = { upper: [], dado: [], wood: [], woodDk: [], steel: [], dark: [], sill: [], tube: [] };
  // ---- the side walls, with a window opening every 1.5 m
  for (const sx of [-1, 1]) {
    const x = sx * (WALL_X + 0.03);
    parts.dado.push(box(0.06, WIN_Y0 - FLOOR, HALF_L * 2, x, (FLOOR + WIN_Y0) / 2, 0));
    parts.upper.push(box(0.06, CEIL - WIN_Y1, HALF_L * 2, x, (WIN_Y1 + CEIL) / 2, 0));
    // piers between the windows
    const edges = [-HALF_L, ...WINDOWS.flatMap((z) => [z - WIN_W / 2, z + WIN_W / 2]), HALF_L];
    for (let i = 0; i < edges.length; i += 2) {
      const z0 = edges[i], z1 = edges[i + 1];
      if (z1 - z0 > 0.01) parts.upper.push(box(0.06, WIN_Y1 - WIN_Y0, z1 - z0, x, (WIN_Y0 + WIN_Y1) / 2, (z0 + z1) / 2));
    }
    for (const z of WINDOWS) {
      // a sill to lean an elbow on, a frame round the opening
      parts.sill.push(box(0.16, 0.04, WIN_W + 0.08, sx * (WALL_X - 0.05), WIN_Y0 + 0.02, z));
      parts.woodDk.push(box(0.04, 0.05, WIN_W + 0.08, sx * (WALL_X - 0.0), WIN_Y1 - 0.02, z));
      for (const e of [-1, 1]) parts.woodDk.push(box(0.04, WIN_Y1 - WIN_Y0, 0.05, sx * WALL_X, (WIN_Y0 + WIN_Y1) / 2, z + e * (WIN_W / 2 + 0.01)));
      // the bars: four across, and the raised shutter's channel above
      for (let k = 1; k <= 4; k++) parts.steel.push(new THREE.CylinderGeometry(0.0075, 0.0075, WIN_W, 6).rotateX(Math.PI / 2).translate(sx * (WALL_X + 0.035), WIN_Y0 + (k / 5) * (WIN_Y1 - WIN_Y0), z));
      parts.dark.push(box(0.05, 0.1, WIN_W, sx * (WALL_X + 0.03), WIN_Y1 + 0.07, z));
    }
    // luggage rack along the wall
    parts.steel.push(new THREE.CylinderGeometry(0.014, 0.014, HALF_L * 2 - 0.6, 6).rotateX(Math.PI / 2).translate(sx * (WALL_X - 0.42), CEIL - 0.42, 0));
    parts.steel.push(new THREE.CylinderGeometry(0.014, 0.014, HALF_L * 2 - 0.6, 6).rotateX(Math.PI / 2).translate(sx * (WALL_X - 0.12), CEIL - 0.42, 0));
    for (let z = -7; z <= 7; z += 1.5) parts.steel.push(box(0.32, 0.02, 0.02, sx * (WALL_X - 0.27), CEIL - 0.42, z));
  }
  // ---- the ends (with the vestibule doors) and floor and ceiling
  for (const sz of [-1, 1]) {
    parts.upper.push(box(WALL_X * 2, CEIL - FLOOR, 0.06, 0, (FLOOR + CEIL) / 2, sz * HALF_L));
    parts.woodDk.push(box(0.8, 1.9, 0.02, 0, FLOOR + 0.95, sz * (HALF_L - 0.04)));
  }
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.12, HALF_L * 2).rotateX(-Math.PI / 2).translate(0, FLOOR, 0), M.floor));
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(WALL_X * 2 + 0.12, HALF_L * 2).rotateX(Math.PI / 2).translate(0, CEIL, 0), M.ceil));
  // ---- benches: facing pairs in each bay, slatted seats and backs, on both sides of the aisle
  const SEAT = FLOOR + 0.45;
  for (const sx of [-1, 1]) {
    const xc = sx * (WALL_X - 0.47);
    for (const zw of WINDOWS) {
      for (const face of [-1, 1]) {
        const zb = zw + face * 0.72; // backrest sits between windows, seat in front of it
        if (Math.abs(zb) > HALF_L - 0.3) continue;
        for (let s = 0; s < 4; s++) parts.wood.push(box(0.9, 0.035, 0.09, xc, SEAT, zb - face * (0.08 + s * 0.11)));
        for (let s = 0; s < 4; s++) parts.wood.push(box(0.9, 0.08, 0.03, xc, SEAT + 0.14 + s * 0.13, zb));
        parts.woodDk.push(box(0.04, 0.45, 0.42, sx * 0.47, FLOOR + 0.22, zb - face * 0.22)); // the aisle-end panel
        parts.dark.push(box(0.9, 0.04, 0.05, xc, FLOOR + 0.1, zb - face * 0.42));
      }
    }
  }
  // ---- fans and tube lights
  const fans = [];
  for (const z of [-5.25, -1.75, 1.75, 5.25]) {
    parts.dark.push(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6).translate(0, CEIL - 0.11, z));
    const fan = new THREE.Group();
    fan.position.set(0, CEIL - 0.24, z);
    const blades = [new THREE.CylinderGeometry(0.07, 0.07, 0.07, 10)];
    for (let i = 0; i < 3; i++) blades.push(box(0.42, 0.008, 0.08, 0.26, 0, 0).rotateY((i / 3) * Math.PI * 2));
    fan.add(new THREE.Mesh(mergeGeometries(blades.map((b) => b.index ? b.toNonIndexed() : b)), M.dark));
    // the cage round it
    fan.add(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.008, 4, 28).rotateX(Math.PI / 2), M.steel));
    g.add(fan);
    fans.push(fan);
  }
  for (const z of [-3.5, 0, 3.5]) for (const sx of [-1, 1]) {
    parts.tube.push(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8).rotateX(Math.PI / 2).translate(sx * 0.55, CEIL - 0.04, z));
  }
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const geo = mergeGeometries(list.map((b) => (b.index ? b.toNonIndexed() : b)));
    const m = new THREE.Mesh(geo, M[k]);
    g.add(m);
  }
  // nothing in here throws a shadow or sits in one: it's lit evenly, like a coach with its windows open
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  const lamp = new THREE.PointLight('#fff1d6', 2.2, 9, 1.6);
  lamp.position.set(0, CEIL - 0.3, 0);
  g.add(lamp);

  // ---- fellow passengers on the benches
  const folk = [];
  const seats = [];
  for (const sx of [-1, 1]) for (const zw of WINDOWS) for (const face of [-1, 1]) {
    const zb = zw + face * 0.72;
    if (Math.abs(zb) > HALF_L - 0.3) continue;
    for (const lane of [0, 1]) seats.push({ x: sx * (WALL_X - 0.25 - lane * 0.45), z: zb - face * 0.25, rot: face > 0 ? Math.PI : 0, sx, zw });
  }
  RIDERS.forEach((o, i) => {
    const p = new Person({ ...o });
    p.seatH = SEAT - FLOOR + 0.02;
    p.root.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
    g.add(p.root);
    folk.push({ p, act: o.act, seat: null });
  });

  return {
    group: g, fans, folk, seats,
    // put the passengers on seats, leaving the bay the boy sits in for him (and maybe one across from him)
    seat(boyZ, boySx) {
      const free = seats.filter((s) => !(s.sx === boySx && Math.abs(s.zw - boyZ) < 0.1 && s.x * boySx > WALL_X - 0.4));
      const pick = [...free].sort(() => Math.random() - 0.5);
      folk.forEach((f, i) => {
        const s = pick[i];
        f.seat = s;
        f.p.root.position.set(s.x, FLOOR, s.z);
        f.p.root.rotation.set(0, s.rot, 0);
      });
    },
    update(dt, speed) {
      for (const f of fans) f.children[0].rotation.y += dt * 14;
      for (const f of folk) f.p.update(dt, 0, f.act);
    },
  };
}
