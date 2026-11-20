// The working village: the police at their three thanas (a sentry at the gate with his lathi, the munshi on the
// verandah bench, a constable pacing the drive), farmers out in the fields round every village (hoeing,
// cutting, watering, carrying hay), and the dhobis at three ghats — beating clothes on a stone slab at the
// water's edge, with lines of washing drying in the sun beside them. Everyone here works by day; after dark
// the fields and the ghats are empty and only the sentry stays at each thana.
import * as THREE from 'three';
import { layout, heightAt, groundHeight, fieldType, isFree, colliders, riverX, RIVER_HALF, GHAT, CANAL, NEW_VILLAGES, SQUARE, NV, EH, RV, BV, TV, MH, NE, PG, NP, MP, WATER_Y } from './world.js';
import { Person } from './people.js';
import { consolidate } from './animals.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
const rotPt = (o, lx, lz) => { const c = Math.cos(o.rot), s = Math.sin(o.rot); return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c }; };
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
let seed = 77;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------------- the thana ----------------
function thana(B) {
  const g = new THREE.Group();
  const y0 = heightAt(B.x, B.z);
  g.position.set(B.x, y0, B.z); g.rotation.y = B.rot;
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  const ochre = std('#d8b46a', { roughness: 0.9 }), red = std('#8e3a26'), white = std('#ece6d8', { roughness: 0.9 }), dark = std('#2a1d14'), wood = std('#5a3a22', { roughness: 0.8 });
  // the building: a plinth, ochre walls with a red dado band, a flat roof with a parapet
  add(new THREE.BoxGeometry(10.8, 1.2, 7.2), red, 0, 0, -3.2);
  add(new THREE.BoxGeometry(10.4, 3.4, 6.6), ochre, 0, 2.3, -3.4);
  add(new THREE.BoxGeometry(10.46, 0.5, 6.66), red, 0, 0.85, -3.4);
  add(new THREE.BoxGeometry(11.0, 0.25, 7.2), white, 0, 4.1, -3.2);
  for (const [w, d, x, z] of [[11, 0.2, 0, -6.7], [11, 0.2, 0, 0.3], [0.2, 7, -5.4, -3.2], [0.2, 7, 5.4, -3.2]]) add(new THREE.BoxGeometry(w, 0.6, d), white, x, 4.5, z);
  // the verandah: a floor, four white pillars, its own roof
  add(new THREE.BoxGeometry(10.4, 0.5, 2.2), red, 0, 0.35, 1.0);
  for (const x of [-4.6, -1.6, 1.6, 4.6]) add(new THREE.CylinderGeometry(0.16, 0.18, 3.3, 10), white, x, 2.25, 1.9);
  add(new THREE.BoxGeometry(10.8, 0.2, 2.6), white, 0, 3.95, 1.0);
  // door, barred windows, a notice board
  add(new THREE.BoxGeometry(1.5, 2.4, 0.08), wood, 0, 1.8, -0.06);
  for (const x of [-3.4, -1.8, 1.8, 3.4]) {
    add(new THREE.BoxGeometry(1.0, 1.2, 0.06), dark, x, 2.3, -0.06);
    for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(0.03, 1.2, 0.05), std('#5a5a5a', { metalness: 0.5 }), x - 0.36 + k * 0.24, 2.3, -0.02);
  }
  add(new THREE.BoxGeometry(1.1, 0.8, 0.04), std('#3a5a3a'), -4.6, 1.8, -0.04);
  // the blue name board over the verandah
  const sign = new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(1024, 192, (c, w, h) => {
    c.fillStyle = '#1d3f8f'; c.fillRect(0, 0, w, h); c.strokeStyle = '#f2f2ee'; c.lineWidth = 8; c.strokeRect(8, 8, w - 16, h - 16);
    c.fillStyle = '#f2f2ee'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 64px "Noto Sans Devanagari", Arial'; c.fillText(`पुलिस थाना ${B.hi}`, w / 2, h * 0.36);
    c.font = 'bold 50px Arial'; c.fillText(`POLICE STATION · ${B.name.toUpperCase()}`, w / 2, h * 0.74);
  }) });
  add(new THREE.PlaneGeometry(6.4, 1.2), sign, 0, 4.75, 2.32);
  // the wireless mast on the roof
  add(new THREE.CylinderGeometry(0.04, 0.06, 6, 6), std('#7a7f84', { metalness: 0.6 }), 4.0, 7.2, -5.6);
  for (const y of [8.6, 9.4]) add(new THREE.BoxGeometry(1.2, 0.04, 0.04), std('#7a7f84', { metalness: 0.6 }), 4.0, y, -5.6);
  // the verandah bench
  add(new THREE.BoxGeometry(1.8, 0.08, 0.45), wood, 2.9, 1.03, 0.4);
  for (const sx of [-0.8, 0.8]) add(new THREE.BoxGeometry(0.08, 0.45, 0.4), wood, 2.9 + sx, 0.8, 0.4);
  // the compound wall: whitewashed, a red band along the top, two gate pillars and the iron gate swung open
  const wallM = std('#efe9dc', { roughness: 0.95 });
  const wall = (x, z, w, d) => { add(new THREE.BoxGeometry(w, 1.4, d), wallM, x, 0.5, z); add(new THREE.BoxGeometry(w + 0.04, 0.14, d + 0.04), red, x, 1.25, z); };
  wall(0, -8, 18.4, 0.3); wall(-9, 0, 0.3, 16.3); wall(9, 0, 0.3, 16.3); wall(-5.75, 8, 6.5, 0.3); wall(5.75, 8, 6.5, 0.3);
  for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(0.6, 2.0, 0.6), wallM, sx * 2.5, 0.8, 8); add(new THREE.BoxGeometry(0.7, 0.15, 0.7), red, sx * 2.5, 1.85, 8); }
  for (const sx of [-1, 1]) { const gt = add(new THREE.BoxGeometry(2.1, 1.3, 0.05), std('#2a2c2e', { metalness: 0.6, roughness: 0.45 }), sx * 2.2, 0.9, 9.0, sx * 1.2); gt.position.x = sx * (2.5 - 0.3); }
  // the flag on its white pole
  add(new THREE.CylinderGeometry(0.05, 0.07, 7.5, 8), white, -6, 3.75, 5.5);
  add(new THREE.CylinderGeometry(0.5, 0.7, 0.4, 12), white, -6, 0.2, 5.5);
  const flagTex = canvasTex(192, 128, (c, w, h) => {
    c.fillStyle = '#ff9933'; c.fillRect(0, 0, w, h / 3); c.fillStyle = '#ffffff'; c.fillRect(0, h / 3, w, h / 3); c.fillStyle = '#138808'; c.fillRect(0, (2 * h) / 3, w, h / 3);
    c.strokeStyle = '#000080'; c.lineWidth = 2; c.beginPath(); c.arc(w / 2, h / 2, h / 7, 0, 7); c.stroke();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; c.beginPath(); c.moveTo(w / 2, h / 2); c.lineTo(w / 2 + Math.cos(a) * (h / 7), h / 2 + Math.sin(a) * (h / 7)); c.stroke(); }
  });
  const flagGeo = new THREE.PlaneGeometry(1.5, 1.0, 12, 4).translate(0.75, 0, 0);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(-6, 6.9, 5.5); flag.userData.keep = true; g.add(flag);
  const base = flagGeo.attributes.position.array.slice();
  // potted plants either side of the door
  for (const sx of [-1, 1]) { add(new THREE.CylinderGeometry(0.25, 0.2, 0.4, 10), std('#a0522d'), sx * 1.2, 0.8, 0.6); add(new THREE.SphereGeometry(0.35, 10, 8), std('#3f7a3a'), sx * 1.2, 1.2, 0.6); }
  consolidate(g);
  return { g, flag, base, y0 };
}

export function buildWorkers(scene, hooks = {}) {
  const thanas = [], all = [];
  const police = (o = {}) => new Person({ dress: 'pants', top: '#bfa26a', bottom: '#a88c58', headwear: 'cap', turban: '#3a3a5a', mustache: true, skin: ['#6e4530', '#7a4c33', '#83553a'][Math.floor(rnd() * 3)], sleeves: 'short', ...o });
  for (const B of layout.police ?? []) {
    const T = thana(B);
    scene.add(T.g);
    const at = (lx, lz) => rotPt(B, lx, lz);
    // the sentry at the gate; the munshi on the verandah bench; a constable pacing the drive
    const sentry = police(); sentry.prop('stick', true); scene.add(sentry.root);
    const munshi = police({ headwear: undefined, top: '#c8ac74' }); munshi.seatH = 0.48 + 0.6; scene.add(munshi.root);
    const walker = police(); walker.prop('stick', true); scene.add(walker.root);
    const gate = at(1.6, 9.2), bench = at(2.9, 0.4), d0 = at(0, 9.5), d1 = { x: B.road.x, z: B.road.z };
    thanas.push({ B, T, sentry, munshi, walker, gate, bench, d0, d1, s: 0, dir: 1 });
    all.push(sentry, munshi, walker);
  }
  // ---- farmers in the fields round every village ----
  const villages = [SQUARE, NV, EH, RV, BV, TV, MH, NE, PG, NP, MP, layout.sonpur, ...NEW_VILLAGES].filter(Boolean);
  const farmers = [];
  villages.forEach((V, vi) => {
    const n = 4 + (vi % 2);
    for (let i = 0; i < n; i++) {
      // a spot in a field near the village, or else on open ground at its edge
      let p = null;
      for (let k = 0; k < 80 && !p; k++) {
        const a = rnd() * Math.PI * 2, d = 45 + rnd() * 120, x = V.x + Math.cos(a) * d, z = V.z + Math.sin(a) * d;
        if (fieldType(x, z) && isFree(x, z, 1.2)) p = { x, z, field: true };
      }
      for (let k = 0; k < 60 && !p; k++) {
        const a = rnd() * Math.PI * 2, d = 50 + rnd() * 30, x = V.x + Math.cos(a) * d, z = V.z + Math.sin(a) * d;
        if (isFree(x, z, 1.5)) p = { x, z, field: false };
      }
      if (!p) continue;
      const fem = (i + vi) % 3 === 1;
      const job = ['hoe', 'cut', 'water', 'hay', 'hoe'][(i + vi) % 5];
      const o = fem ? { dress: 'saree', k: 0.92, top: ['#c4241c', '#2e8b57', '#d4a017', '#7a2b6e'][i % 4], bottom: ['#f2b705', '#c2185b', '#2e3fa8', '#e0612b'][i % 4], veil: true, skin: ['#80523a', '#86573b', '#6a4230'][i % 3] }
        : { dress: 'dhoti', top: ['#efe8d6', '#dfe6ea', '#b9c7a5', '#e9dcc3'][i % 4], bottom: '#f4f1e8', headwear: 'turban', turban: ['#f2efe6', '#e07a1e', '#c0392b', '#ffffff'][(i + vi) % 4], mustache: true, skin: ['#6e4530', '#7a4c33', '#5f3a26'][i % 3], sleeves: 'short' };
      const f = new Person(o);
      f.noHit = true;
      if (job === 'hoe') f.prop('hoe', true);
      if (job === 'water') f.prop('can', true);
      if (job === 'cut') f.poseHook = (P, t) => { const c = Math.sin(t * 3.2); P.torsoX = 0.95; P.hip0 = P.hip1 = -0.35; P.knee0 = P.knee1 = 0.5; P.bodyY = -0.08; P.sh1 = -1.2 + c * 0.35; P.shz1 = c * 0.4; P.el1 = -0.3; P.sh0 = -1.0; P.el0 = -0.9; P.headX = -0.35; P.headY = 0; };
      scene.add(f.root);
      const rot = rnd() * Math.PI * 2;
      // the hay-carrier goes to and fro between two spots 25 m apart
      const b = { x: p.x + Math.cos(rot) * 25, z: p.z + Math.sin(rot) * 25 };
      farmers.push({ p: f, job, home: p, a: p, b, x: p.x, z: p.z, face: rot, leg: 0, t: rnd() * 20 });
      all.push(f);
    }
  });
  // ---- the dhobis at their ghats ----
  const dhobis = [];
  const ghatSites = [];
  { const z = GHAT.z + 16, x = riverX(z) - RIVER_HALF - 0.6; ghatSites.push({ x, z, face: Math.PI / 2, back: { x: x - 9, z } }); }
  if (layout.tribGhat) { const G = layout.tribGhat; ghatSites.push({ x: G.x + Math.sin(G.rot) * 0.5 + Math.cos(G.rot) * 6, z: G.z + Math.cos(G.rot) * 0.5 - Math.sin(G.rot) * 6, face: G.rot, back: { x: G.x - Math.sin(G.rot) * 9, z: G.z - Math.cos(G.rot) * 9 } }); }
  {
    const th = 0.44, r = CANAL.Rc(th) + CANAL.half + 1.3;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    ghatSites.push({ x, z, face: Math.atan2(-Math.cos(th), -Math.sin(th)), back: { x: Math.cos(th) * (r + 9), z: Math.sin(th) * (r + 9) } });
  }
  const slabM = std('#8a8478', { roughness: 0.95 });
  const CLOTH = ['#c4241c', '#f2b705', '#1e6fa8', '#2e8b57', '#f4f1e8', '#e85fc8', '#7a2b6e', '#ffffff', '#e0612b'];
  for (const S of ghatSites) {
    const y = groundHeight(S.x, S.z);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.8), slabM);
    const sx = S.x + Math.sin(S.face) * 0.9, sz = S.z + Math.cos(S.face) * 0.9;
    slab.position.set(sx, Math.max(WATER_Y + 0.1, groundHeight(sx, sz)) + 0.1, sz); slab.rotation.set(-0.25, S.face, 0); slab.castShadow = slab.receiveShadow = true;
    scene.add(slab);
    // the washing lines: bamboo poles with saris, dhotis and shirts pegged out
    const lines = new THREE.Group();
    lines.position.set(S.back.x, groundHeight(S.back.x, S.back.z), S.back.z); lines.rotation.y = S.face + Math.PI / 2;
    scene.add(lines);
    const pole = std('#b89a5a', { roughness: 0.8 });
    const cloths = [];
    for (const lz of [-1.4, 1.4]) {
      for (const lx of [-4.5, 4.5]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), pole); pl.position.set(lx, 1.1, lz); pl.castShadow = true; lines.add(pl); colliders.push({ kind: 'c', ...rotPt({ x: S.back.x, z: S.back.z, rot: S.face + Math.PI / 2 }, lx, lz), r: 0.1 }); }
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 9, 4).rotateZ(Math.PI / 2), std('#d8d0b8')); rope.position.set(0, 2.1, lz); lines.add(rope);
      for (let i = 0; i < 6; i++) {
        const w = 0.8 + rnd() * 0.7, h = 0.9 + rnd() * 0.6;
        const c = new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(0, -h / 2, 0), new THREE.MeshStandardMaterial({ color: CLOTH[(i * 3 + (lz > 0 ? 1 : 0)) % CLOTH.length], side: THREE.DoubleSide, roughness: 0.9 }));
        c.position.set(-3.6 + i * 1.45, 2.08, lz); c.castShadow = true; lines.add(c); cloths.push(c);
      }
    }
    const d = new Person({ dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', headwear: 'turban', turban: '#ffffff', mustache: true, skin: '#6a4230', sleeves: 'short' });
    d.noHit = true; d.prop('clothes', true);
    // the swing: the wet cloth raised high over the shoulder and brought down hard on the slab
    d.poseHook = (P, t) => {
      const c = (t * 0.9) % 1, up = c < 0.6 ? Math.sin((c / 0.6) * Math.PI * 0.5) : 1 - (c - 0.6) / 0.12;
      const k = Math.max(0, Math.min(1, up));
      P.sh0 = P.sh1 = -0.6 - k * 2.5; P.el0 = P.el1 = -0.3; P.shz0 = 0.2; P.shz1 = -0.2;
      P.torsoX = 0.55 - k * 0.5; P.hip0 = -0.2; P.hip1 = 0.15; P.knee0 = P.knee1 = 0.2; P.headX = -0.2; P.headY = 0;
    };
    d.poseRate = 20;
    scene.add(d.root);
    d.root.position.set(S.x, y, S.z); d.root.rotation.y = S.face;
    dhobis.push({ p: d, S, lines, cloths, slab, lastHit: 0 });
    all.push(d);
  }
  let night = false;
  return {
    setNight(v) { night = v; },
    update(dt, player, t) {
      // ---- the thanas ----
      for (const Th of thanas) {
        const dP = Math.abs(player.x - Th.B.x) + Math.abs(player.z - Th.B.z);
        Th.T.g.visible = dP < 800;
        // the flag ripples
        if (dP < 260) {
          const pos = Th.T.flag.geometry.attributes.position, b = Th.T.base;
          for (let i = 0; i < pos.count; i++) { const x = b[i * 3]; pos.setZ(i, Math.sin(x * 3.2 - t * 5) * 0.12 * x); }
          pos.needsUpdate = true;
        }
        const vis = dP < 300;
        Th.sentry.root.visible = vis; Th.munshi.root.visible = vis && !night; Th.walker.root.visible = vis && !night;
        if (!vis) continue;
        const y = (p) => groundHeight(p.x, p.z);
        Th.sentry.root.position.set(Th.gate.x, y(Th.gate), Th.gate.z); Th.sentry.root.rotation.y = Th.B.rot;
        Th.sentry.update(dt, 0, 'idle');
        if (!night) {
          Th.munshi.root.position.set(Th.bench.x, Th.T.y0, Th.bench.z); Th.munshi.root.rotation.y = Th.B.rot;
          Th.munshi.update(dt, 0, 'sit');
          // the constable walks down the drive to the road and back, looking about
          const L = Math.hypot(Th.d1.x - Th.d0.x, Th.d1.z - Th.d0.z) || 1;
          Th.s += Th.dir * dt * 1.0;
          if (Th.s > L) { Th.s = L; Th.dir = -1; } else if (Th.s < 0) { Th.s = 0; Th.dir = 1; }
          const k = Th.s / L, wx = Th.d0.x + (Th.d1.x - Th.d0.x) * k, wz = Th.d0.z + (Th.d1.z - Th.d0.z) * k;
          Th.walker.root.position.set(wx, groundHeight(wx, wz), wz);
          Th.walker.root.rotation.y = Math.atan2((Th.d1.x - Th.d0.x) * Th.dir, (Th.d1.z - Th.d0.z) * Th.dir);
          Th.walker.update(dt, 1.0, 'walk');
        }
      }
      // ---- the farmers ----
      for (const F of farmers) {
        const near = Math.abs(player.x - F.x) + Math.abs(player.z - F.z) < 260;
        F.p.root.visible = near && !night;
        if (!near || night) continue;
        let sp = 0;
        if (F.job === 'hay') {
          const T = F.leg ? F.a : F.b, dx = T.x - F.x, dz = T.z - F.z, d = Math.hypot(dx, dz);
          if (d < 0.3) { F.leg = 1 - F.leg; F.wait = 4; }
          if ((F.wait = Math.max(0, (F.wait ?? 0) - dt)) === 0 && d >= 0.3) { sp = 1.0; F.x += (dx / d) * sp * dt; F.z += (dz / d) * sp * dt; F.face = Math.atan2(dx, dz); }
          F.p.prop('hay', F.leg === 0);
        }
        F.p.root.position.set(F.x, groundHeight(F.x, F.z), F.z);
        F.p.root.rotation.y = F.face;
        F.p.update(dt, sp, F.job === 'hay' ? (F.leg === 0 ? 'carry' : sp ? 'walk' : 'idle') : F.job === 'hoe' ? 'hoe' : F.job === 'water' ? 'water' : 'idle');
      }
      // ---- the dhobis ----
      for (const D of dhobis) {
        const dP = Math.abs(player.x - D.S.x) + Math.abs(player.z - D.S.z);
        D.lines.visible = dP < 500;
        D.p.root.visible = dP < 260 && !night;
        if (dP < 140) for (const c of D.cloths) c.rotation.x = Math.sin(t * 1.3 + c.position.x) * 0.12;
        if (!D.p.root.visible) continue;
        D.p.update(dt, 0, 'idle');
        // thwack!
        const c = (D.p.t * 0.9) % 1;
        if (c > 0.68 && D.lastHit < 0.68 && dP < 60) hooks.onThwack?.(dP);
        D.lastHit = c;
      }
    },
  };
}
