// Gaon ka mela: the village fair on the open ground a little way out of the village. A marigold-hung gate
// with its painted banner, bunting and strings of bulbs criss-crossing overhead, and inside: a giant wheel,
// a merry-go-round of painted horses, a big swinging boat, wooden swings for the little ones, and rows of
// stalls: hot jalebis frying in a kadhai, trays of laddoos and barfi, glass bangles, toys and masks and
// pinwheels, pani puri, chai, a balloon-shooting game, cotton candy and ice gola. A balloon-seller walks
// about with his bunch, families wander from stall to stall with the kids holding balloons, and the
// loudspeaker plays on. At night the bulbs light up and the wheel's lights chase round.
import * as THREE from 'three';
import { Person } from './people.js';
import { colliders, groundHeight, heightAt, localToWorld } from './world.js';

const damp = (dt, r) => 1 - Math.exp(-dt * r);
const ss = (x) => x * x * (3 - 2 * x);
const MATS = new Map();
const mat = (c, r = 0.7, o = {}) => {
  const k = c + '|' + r + '|' + (o.side ?? '') + '|' + (o.metalness ?? '') + '|' + (o.emissive ?? '') + '|' + (o.emissiveIntensity ?? '') + '|' + (o.transparent ? o.opacity : '');
  if (!MATS.has(k)) MATS.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o }));
  return MATS.get(k);
};
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const stripeTex = (cols, n = 8) => canvasTex(256, 64, (x, w, h) => { for (let i = 0; i < n; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect((i * w) / n, 0, w / n + 1, h); } });
const DEVA = '"Tiro Devanagari Hindi", "Kohinoor Devanagari", "Noto Sans Devanagari", sans-serif';
function signTex(hi, en, bg, fg, w = 512, h = 160) {
  return canvasTex(w, h, (x) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = fg; x.lineWidth = 7; x.strokeRect(9, 9, w - 18, h - 18);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold ${Math.round(h * 0.4)}px ${DEVA}`; x.fillText(hi, w / 2, en ? h * 0.42 : h / 2);
    if (en) { x.font = `bold ${Math.round(h * 0.18)}px sans-serif`; x.fillText(en, w / 2, h * 0.8); }
  });
}
function bannerTex() {
  return canvasTex(1024, 180, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffb01f'); g.addColorStop(1, '#f27a12');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // a zig-zag border in red and green
    for (let i = 0; i < w; i += 24) for (const [y, s] of [[0, 1], [h, -1]]) {
      x.fillStyle = (i / 24) % 2 ? '#c0172a' : '#1d7a3a';
      x.beginPath(); x.moveTo(i, y); x.lineTo(i + 12, y + s * 18); x.lineTo(i + 24, y); x.fill();
    }
    x.fillStyle = '#9b0d1c'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold 86px ${DEVA}`; x.fillText('गाँव का मेला', w / 2, 82);
    x.font = 'bold 30px sans-serif'; x.fillText('✦  GAON KA MELA  ·  स्वागत है  ✦', w / 2, 146);
    for (const sx of [70, w - 70]) { x.fillStyle = '#ffe680'; x.beginPath(); x.arc(sx, 82, 40, 0, 7); x.fill(); x.fillStyle = '#c0172a'; x.font = `bold 50px ${DEVA}`; x.fillText('ॐ', sx, 86); }
  });
}
// toy masks: lion, monkey, rakshas, clown
function maskTex(kind) {
  return canvasTex(128, 128, (x) => {
    const base = { lion: '#f2a21a', monkey: '#7a4a2a', rakshas: '#2e9a4a', clown: '#f4f2ec' }[kind];
    if (kind === 'lion') { x.fillStyle = '#b8560e'; for (let a = 0; a < 16; a++) { x.beginPath(); x.arc(64 + Math.cos(a * 0.39) * 46, 64 + Math.sin(a * 0.39) * 46, 16, 0, 7); x.fill(); } }
    if (kind === 'rakshas') { x.fillStyle = '#f4f2ec'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(64 + s * 22, 30); x.lineTo(64 + s * 42, 2); x.lineTo(64 + s * 34, 34); x.fill(); } }
    x.fillStyle = base; x.beginPath(); x.arc(64, 66, 44, 0, 7); x.fill();
    if (kind === 'monkey') { x.fillStyle = '#e8c49a'; x.beginPath(); x.ellipse(64, 78, 30, 24, 0, 0, 7); x.fill(); }
    x.fillStyle = '#fff'; for (const s of [-1, 1]) { x.beginPath(); x.arc(64 + s * 16, 56, 9, 0, 7); x.fill(); }
    x.fillStyle = '#111'; for (const s of [-1, 1]) { x.beginPath(); x.arc(64 + s * 16, 57, 4.5, 0, 7); x.fill(); }
    x.strokeStyle = '#111'; x.lineWidth = 4;
    if (kind === 'clown') { x.fillStyle = '#e8202a'; x.beginPath(); x.arc(64, 72, 9, 0, 7); x.fill(); x.strokeStyle = '#e8202a'; }
    x.beginPath(); x.arc(64, 80, 16, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
    if (kind === 'rakshas') { x.fillStyle = '#fff'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(64 + s * 10, 92); x.lineTo(64 + s * 6, 104); x.lineTo(64 + s * 2, 92); x.fill(); } }
  });
}

const BULB_COLS = ['#ff3b2f', '#ffd21a', '#3bd14a', '#3b8bff', '#ff5fd2', '#ffffff'];
const BALLOON_COLS = ['#e8202a', '#f2c21a', '#1e8fe0', '#2eb84a', '#e85fc8', '#f27a12', '#8a3ad8', '#f4f2ec'];
const SKIN = ['#7a4c33', '#6e4530', '#86573b', '#80523a', '#5f3a26', '#8a5a3c', '#6a4230', '#83553a'];

export function buildMela(scene, site, hooks = {}) {
  if (!site) return { update() {}, setWeather() {}, distTo: () => 999, people: [], parking: [] };
  const G = new THREE.Group();
  const Y = heightAt(site.x, site.z);
  G.position.set(site.x, Y, site.z);
  G.rotation.y = site.rot;
  scene.add(G);
  const W = (lx, lz) => localToWorld(site, lx, lz);
  const gyL = (lx, lz) => { const p = W(lx, lz); return groundHeight(p.x, p.z) - Y; };
  const add = (geo, m, x = 0, y = 0, z = 0, p = G, shadow = false) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; p.add(o); return o;
  };
  const box = (lx, lz, hw, hd, rot = 0, top = 3) => { const p = W(lx, lz); colliders.push({ kind: 'b', x: p.x, z: p.z, rot: site.rot + rot, hw, hd, height: Y + top }); };
  const circ = (lx, lz, r, top = 3) => { const p = W(lx, lz); colliders.push({ kind: 'c', x: p.x, z: p.z, r, height: Y + top }); };
  const UPV = new THREE.Vector3(0, 1, 0);
  const beam = (a, b, r, m, p = G, shadow = true, seg = 6) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const o = add(new THREE.CylinderGeometry(r, r, L, seg), m, 0, 0, 0, p, shadow);
    o.position.copy(a).addScaledVector(d, 0.5);
    o.quaternion.setFromUnitVectors(UPV, d.normalize());
    return o;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const M = {
    bamboo: mat('#b89a5a', 0.75), wood: mat('#8a5a32', 0.8), darkWood: mat('#5a3a22', 0.8), steel: mat('#9aa2a8', 0.35, { metalness: 0.7 }),
    red: mat('#c8202a', 0.5), yellow: mat('#f2c21a', 0.5), blue: mat('#2a64c8', 0.5), green: mat('#2e9a4a', 0.5), white: mat('#f4f2ec', 0.6),
    pink: mat('#e85fa0', 0.5), orange: mat('#f27a12', 0.5), gold: mat('#d8a832', 0.35, { metalness: 0.6 }), rope: mat('#e8e0c8', 0.9),
    cloth: mat('#e8dcc0', 0.9, { side: THREE.DoubleSide }), black: mat('#1a1a1a', 0.6), clay: mat('#a8603a', 0.9), silver: mat('#d4d8dc', 0.25, { metalness: 0.9 }),
  };
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const bulbGeo = new THREE.SphereGeometry(0.045, 6, 4);
  const allBulbs = [];
  // many small things of one shape → one instanced mesh, coloured per instance
  const instanced = (geo, m, items, parent = G) => {
    const im = new THREE.InstancedMesh(geo, m, items.length);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), mm = new THREE.Matrix4(), c = new THREE.Color();
    items.forEach((it, i) => {
      e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0); q.setFromEuler(e);
      s.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
      im.setMatrixAt(i, mm.compose(V(it.x, it.y, it.z), q, s));
      if (it.c) im.setColorAt(i, c.set(it.c));
    });
    im.frustumCulled = false;
    parent.add(im);
    return im;
  };

  // ---------------- the bamboo fence round the ground, and the gate ----------------
  const FR = 23;
  {
    const posts = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2, x = Math.sin(a) * FR, z = Math.cos(a) * FR;
      if (z > 0 && Math.abs(x) < 4.6) { posts.push(null); continue; }
      posts.push({ x, z });
      add(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 5), M.bamboo, x, gyL(x, z) + 0.6, z);
    }
    for (let i = 0; i < 48; i++) {
      const a = posts[i], b = posts[(i + 1) % 48];
      if (!a || !b) continue;
      for (const h of [0.45, 1.0]) beam(V(a.x, gyL(a.x, a.z) + h, a.z), V(b.x, gyL(b.x, b.z) + h, b.z), 0.03, M.bamboo, G, false, 4);
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      box(mx, mz, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.1, 0.12, Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2, 1.6);
    }
  }
  const GZ = Math.sqrt(FR * FR - 4.4 * 4.4);
  const marigolds = [];
  {
    const pil = new THREE.MeshStandardMaterial({ map: stripeTex(['#c8202a', '#f2c21a'], 10), roughness: 0.6 });
    for (const sx of [-1, 1]) {
      const x = sx * 4.4, y0 = gyL(x, GZ);
      add(new THREE.BoxGeometry(0.75, 5.4, 0.75), pil, x, y0 + 2.7, GZ, G, true);
      add(new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.gold, x, y0 + 5.4, GZ);
      add(new THREE.ConeGeometry(0.08, 0.5, 6), M.gold, x, y0 + 6.1, GZ);
      // a saffron flag on each pillar
      const fl = add(new THREE.PlaneGeometry(0.7, 0.45), mat('#ff8a1a', 0.8, { side: THREE.DoubleSide }), x + 0.35, y0 + 6.5, GZ);
      fl.userData.flag = true;
      add(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 5), M.darkWood, x, y0 + 6.2, GZ);
      circ(x, GZ, 0.55, 6);
    }
    const yb = gyL(0, GZ) + 4.6;
    const bt = bannerTex();
    for (const s of [1, -1]) { const p = add(new THREE.PlaneGeometry(8.1, 1.45), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.7 }), 0, yb, GZ + s * 0.06); if (s < 0) p.rotation.y = Math.PI; }
    add(new THREE.BoxGeometry(8.2, 1.5, 0.1), M.darkWood, 0, yb, GZ);
    // marigold garlands: swags across the gate and strands hanging from the banner
    const sw = (x0, x1, y, sag, z) => { const n = Math.ceil((x1 - x0) / 0.085); for (let i = 0; i <= n; i++) { const t = i / n; marigolds.push({ x: x0 + (x1 - x0) * t, y: y - sag * 4 * t * (1 - t), z, c: i % 9 < 6 ? '#ff8c1a' : '#ffc21a', s: 1 }); } };
    for (const z of [GZ + 0.12, GZ - 0.12]) { sw(-4.0, 4.0, yb - 0.78, 0.55, z); sw(-4.0, 0, yb - 0.78, 0.35, z); sw(0, 4.0, yb - 0.78, 0.35, z); }
    for (let x = -3.6; x <= 3.61; x += 0.8) for (let k = 0; k < 10; k++) marigolds.push({ x, y: yb - 0.8 - k * 0.085, z: GZ + 0.13, c: k % 3 ? '#ff8c1a' : '#ffc21a', s: 1 });
    for (const sx of [-1, 1]) for (let k = 0; k < 50; k++) marigolds.push({ x: sx * 4.4 + Math.sin(k * 0.7) * 0.41, y: gyL(0, GZ) + 0.4 + k * 0.1, z: GZ + Math.cos(k * 0.7) * 0.41, c: k % 2 ? '#ff8c1a' : '#ffc21a', s: 1.1 });
  }

  // ---------------- poles with bunting and bulbs strung between them ----------------
  const flagItems = [], bulbItems = [];
  {
    const poles = [[-8.8, 14], [8.8, 14], [-8.8, 0], [8.8, 0], [-8.8, -14], [8.8, -14]];
    const top = (x, z) => V(x, gyL(x, z) + 6.0, z);
    for (const [x, z] of poles) { add(new THREE.CylinderGeometry(0.06, 0.08, 6.2, 6), M.bamboo, x, gyL(x, z) + 3.1, z, G, true); circ(x, z, 0.15, 7); }
    const gl = V(-4.4, gyL(-4.4, GZ) + 5.3, GZ), gr = V(4.4, gyL(4.4, GZ) + 5.3, GZ);
    const lines = [
      [top(-8.8, 14), top(8.8, 14)], [top(-8.8, 0), top(8.8, 0)], [top(-8.8, -14), top(8.8, -14)],
      [top(-8.8, 14), top(8.8, 0)], [top(8.8, 14), top(-8.8, 0)], [top(-8.8, 0), top(8.8, -14)], [top(8.8, 0), top(-8.8, -14)],
      [gl, top(-8.8, 14)], [gr, top(8.8, 14)], [gl, top(8.8, 14)], [gr, top(-8.8, 14)],
      [top(-8.8, 14), top(-8.8, 0)], [top(8.8, 14), top(8.8, 0)], [top(-8.8, 0), top(-8.8, -14)], [top(8.8, 0), top(8.8, -14)],
    ];
    const FLAG = ['#e8202a', '#f2c21a', '#2eb84a', '#1e8fe0', '#e85fc8', '#f27a12', '#f4f2ec'];
    let fi = 0, bi = 0;
    for (const [a, b] of lines) {
      const L = a.distanceTo(b), sag = 0.12 * L * 0.5, ry = -Math.atan2(b.z - a.z, b.x - a.x);
      const P = (t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t);
      const cord = [];
      for (let i = 0; i <= 16; i++) cord.push(P(i / 16));
      for (let i = 0; i < 16; i++) beam(cord[i], cord[i + 1], 0.008, M.rope, G, false, 3);
      const nf = Math.floor(L / 0.42);
      for (let i = 1; i < nf; i++) { const p = P(i / nf); flagItems.push({ x: p.x, y: p.y, z: p.z, ry, c: FLAG[fi++ % FLAG.length] }); }
      const nb = Math.floor(L / 0.9);
      for (let i = 1; i < nb; i++) { const p = P((i + 0.5) / nb); bulbItems.push({ x: p.x, y: p.y - 0.06, z: p.z, c: BULB_COLS[bi++ % BULB_COLS.length] }); }
    }
  }
  // pennants: little triangles hanging from the cords, fluttering in a vertex shader
  const flagUni = { uTime: { value: 0 } };
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.15, 0, 0, 0.15, 0, 0, 0, -0.3, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = flagUni.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3][0] * 1.7 + instanceMatrix[3][2] * 2.3;
        #else
        float ph = 0.0;
        #endif
        transformed.z += sin(uTime * 5.0 + ph) * (-position.y) * 0.5;`);
    };
    instanced(g, m, flagItems);
  }
  allBulbs.push(instanced(bulbGeo, bulbMat, bulbItems));

  // ---------------- stalls ----------------
  const stall = (lx, lz, rot, { w = 3.2, d = 2.2, cols, sign, back = '#f2e6c8', cloth = '#c0392b' }) => {
    const g = new THREE.Group(); g.position.set(lx, gyL(lx, lz), lz); g.rotation.y = rot; G.add(g);
    const hF = 2.45, hB = 2.85;
    for (const [sx, sz, h] of [[-1, 1, hF], [1, 1, hF], [-1, -1, hB], [1, -1, hB]]) add(new THREE.CylinderGeometry(0.045, 0.05, h, 6), M.bamboo, sx * w / 2, h / 2, sz * d / 2, g, true);
    const stripes = new THREE.MeshStandardMaterial({ map: stripeTex(cols, 10), roughness: 0.85, side: THREE.DoubleSide });
    const can = add(new THREE.PlaneGeometry(w + 0.4, Math.hypot(d + 0.5, hB - hF)), stripes, 0, (hF + hB) / 2 + 0.03, 0, g, true);
    can.rotation.x = -Math.PI / 2 + Math.atan2(hB - hF, d + 0.5);
    add(new THREE.PlaneGeometry(w + 0.4, 0.34), stripes, 0, hF - 0.12, d / 2 + 0.25, g);
    add(new THREE.BoxGeometry(w, 0.88, 0.7), mat(cloth, 0.9), 0, 0.44, d / 2 - 0.35, g, true);
    add(new THREE.BoxGeometry(w + 0.06, 0.04, 0.76), M.wood, 0, 0.9, d / 2 - 0.35, g);
    add(new THREE.PlaneGeometry(w, hB), mat(back, 0.9, { side: THREE.DoubleSide }), 0, hB / 2, -d / 2, g);
    for (const sx of [-1, 1]) add(new THREE.PlaneGeometry(d, 1.2), mat(back, 0.9, { side: THREE.DoubleSide }), sx * w / 2, hB - 0.6, 0, g).rotation.y = Math.PI / 2;
    if (sign) add(new THREE.PlaneGeometry(2.1, 0.62), new THREE.MeshStandardMaterial({ map: signTex(sign[0], sign[1], sign[2] ?? '#fff3c4', sign[3] ?? '#b0121e'), roughness: 0.7 }), 0, hF + 0.36, d / 2 + 0.27, g);
    // a string of bulbs along the front edge
    const front = [];
    for (let i = 0; i <= 8; i++) front.push({ x: -w / 2 + (w * i) / 8, y: hF - 0.32, z: d / 2 + 0.27, c: BULB_COLS[i % BULB_COLS.length] });
    allBulbs.push(instanced(bulbGeo, bulbMat, front, g));
    box(lx, lz, w / 2 + 0.1, d / 2 + 0.15, rot, 3.2);
    return { g, top: 0.92, cz: d / 2 - 0.35 };
  };
  const cart = (lx, lz, rot, color, umbrella) => {
    const g = new THREE.Group(); g.position.set(lx, gyL(lx, lz), lz); g.rotation.y = rot; G.add(g);
    add(new THREE.BoxGeometry(1.6, 0.55, 0.85), mat(color, 0.55), 0, 0.72, 0, g, true);
    add(new THREE.BoxGeometry(1.66, 0.04, 0.9), M.wood, 0, 1.01, 0, g);
    for (const sx of [-1, 1]) {
      const w = add(new THREE.TorusGeometry(0.36, 0.035, 6, 20), M.black, sx * 0.5, 0.4, 0.46, g); void w;
      add(new THREE.TorusGeometry(0.36, 0.035, 6, 20), M.black, sx * 0.5, 0.4, -0.46, g);
    }
    beam(V(-0.8, 0.85, -0.3), V(-1.3, 0.95, -0.3), 0.025, M.steel, g, false);
    beam(V(-0.8, 0.85, 0.3), V(-1.3, 0.95, 0.3), 0.025, M.steel, g, false);
    if (umbrella) {
      add(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 5), M.steel, 0.6, 1.8, -0.3, g);
      const u = add(new THREE.ConeGeometry(1.2, 0.45, 10, 1, true), new THREE.MeshStandardMaterial({ map: stripeTex(umbrella, 10), roughness: 0.8, side: THREE.DoubleSide }), 0.6, 2.7, -0.3, g, true);
      void u;
    }
    box(lx, lz, 1.0, 0.6, rot, 2.5);
    return { g, top: 1.03 };
  };
  const people = [], vendors = [];
  const mkP = (o, parent, x, y, z, ry = 0) => {
    const p = new Person(o);
    p.root.position.set(x, y, z); p.root.rotation.y = ry;
    parent.add(p.root);
    people.push(p);
    return p;
  };
  const man = (i, o = {}) => ({ dress: ['kurta', 'pants', 'dhoti'][i % 3], top: ['#f4f2ec', '#8fa6c4', '#e9dcc3', '#c9b27a', '#b9c7a5', '#d8a0a0'][i % 6], bottom: ['#f4f1e8', '#3a3a42', '#efece4'][i % 3], skin: SKIN[i % 8], mustache: i % 4 !== 3, sleeves: i % 2 ? 'short' : undefined, headwear: [undefined, 'cap', 'turban', 'topi'][i % 4], turban: ['#e07a1e', '#f2efe6', '#c0392b', '#ffffff'][i % 4], ...o });
  const woman = (i, o = {}) => { const S = [['#d4a017', '#b3202c'], ['#3c6e47', '#2e8b57'], ['#7a2b6e', '#c2185b'], ['#1e6fa8', '#f2b705'], ['#e0612b', '#2e3fa8'], ['#c4241c', '#f6f2e8']][i % 6]; return { dress: 'saree', k: 0.9 + (i % 3) * 0.02, top: S[0], bottom: S[1], veil: i % 3 === 0, skin: SKIN[(i + 3) % 8], ...o }; };
  const boy = (i, o = {}) => ({ dress: 'shorts', k: 0.66 + (i % 3) * 0.04, headScale: 1.22, top: ['#f4f4f0', '#e0612b', '#2e8b57', '#f2c21a', '#1e6fa8'][i % 5], bottom: ['#2a3a6a', '#3a3a42', '#5b5246'][i % 3], skin: SKIN[(i + 5) % 8], sleeves: 'short', ...o });
  const girl = (i, o = {}) => ({ dress: 'saree', k: 0.66 + (i % 3) * 0.04, headScale: 1.2, top: ['#f2b705', '#e85fc8', '#f4f4f0', '#2eb84a'][i % 4], bottom: ['#c2185b', '#7a2b6e', '#1e6fa8', '#e0612b'][i % 4], pallu: false, braids: true, veil: false, skin: SKIN[(i + 2) % 8], ...o });
  const vendor = (o, st, action = 'idle', props = []) => {
    const p = mkP(o, st.g, 0, 0, -0.15, 0);
    for (const k of props) p.prop(k, true);
    vendors.push({ p, action, g: st.g });
    return p;
  };

  // --- left row (fronts face the lane): jalebi, mithai, bangles
  const jal = stall(-6.5, 15, Math.PI / 2, { cols: ['#c8202a', '#f2e6c8'], sign: ['गरम जलेबी', 'GARAM JALEBI'], cloth: '#b8322b' });
  const fire = { m: mat('#ff7a1a', 0.6, { emissive: '#ff5a0a', emissiveIntensity: 1.6 }) };
  {
    const g = jal.g, cz = jal.cz, t = jal.top;
    add(new THREE.CylinderGeometry(0.36, 0.42, 0.3, 14), M.clay, -0.75, t + 0.15, cz, g);
    fire.mesh = add(new THREE.SphereGeometry(0.16, 8, 6), fire.m, -0.75, t + 0.2, cz + 0.33, g);
    add(new THREE.LatheGeometry([[0.05, 0], [0.3, 0.04], [0.42, 0.14], [0.45, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 18), mat('#2a2826', 0.4, { metalness: 0.7 }), -0.75, t + 0.3, cz, g);
    add(new THREE.CircleGeometry(0.4, 18).rotateX(-Math.PI / 2), mat('#a8781a', 0.15), -0.75, t + 0.47, cz, g);
    // a jalebi: a spiral of fried batter
    const pts = []; for (let i = 0; i <= 40; i++) { const a = i * 0.42, r = 0.012 + i * 0.0012; pts.push(V(Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const jg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0085, 5);
    const jm = mat('#f08a1a', 0.35, { emissive: '#7a3a00', emissiveIntensity: 0.25 });
    const fry = []; for (let i = 0; i < 4; i++) fry.push({ x: -0.88 + (i % 2) * 0.24, y: t + 0.48, z: cz - 0.1 + Math.floor(i / 2) * 0.2, ry: i, c: '#d8a040' });
    instanced(jg, jm, fry, g);
    const pile = []; for (let i = 0; i < 34; i++) { const a = i * 2.39, r = Math.sqrt(i / 34) * 0.32; pile.push({ x: 0.55 + Math.cos(a) * r, y: t + 0.05 + (0.34 - r) * 0.45, z: cz + Math.sin(a) * r * 0.7, rx: (Math.random() - 0.5) * 0.6, ry: a, rz: (Math.random() - 0.5) * 0.6, c: '#ffffff' }); }
    add(new THREE.CylinderGeometry(0.4, 0.36, 0.04, 18), M.silver, 0.55, t + 0.02, cz, g);
    instanced(jg, jm, pile, g);
    add(new THREE.CylinderGeometry(0.2, 0.18, 0.12, 14), M.silver, 1.25, t + 0.06, cz, g); // rabri
    add(new THREE.CircleGeometry(0.18, 14).rotateX(-Math.PI / 2), mat('#f2e2b8', 0.6), 1.25, t + 0.12, cz, g);
  }
  const jalebiWala = vendor(man(0, { dress: 'pants', top: '#f4f2ec', bottom: '#4a4a52' }), jal, 'stir', ['ladle']);
  jalebiWala.root.position.x = -0.75;

  const mit = stall(-6.5, 10, Math.PI / 2, { cols: ['#f2c21a', '#e85fa0'], sign: ['मिठाई', 'MITHAI · SWEETS'], cloth: '#e8b020', back: '#fff3d8' });
  {
    const g = mit.g, cz = mit.cz, t = mit.top;
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(3.0, 0.16, 0.24), M.wood, 0, t + 0.08 + i * 0.16, cz - 0.24 + i * 0.0, g).position.z = cz + 0.2 - i * 0.24;
    const sw = [], ladd = new THREE.SphereGeometry(0.034, 8, 6), barfi = new THREE.BoxGeometry(0.07, 0.03, 0.07);
    const bf = [];
    const tray = (x, z, y) => add(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 16), M.silver, x, y, z, g);
    const pyramid = (x, z, y, c) => { tray(x, z, y); for (let l = 0; l < 3; l++) { const n = 3 - l; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sw.push({ x: x + (i - (n - 1) / 2) * 0.07, y: y + 0.045 + l * 0.058, z: z + (j - (n - 1) / 2) * 0.07, c }); } };
    const slab = (x, z, y, c) => { tray(x, z, y); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) bf.push({ x: x + (i - 1.5) * 0.075, y: y + 0.025, z: z + (j - 1.5) * 0.075, c }); };
    pyramid(-1.15, cz + 0.2, t + 0.17, '#f2a01a'); pyramid(-0.55, cz + 0.2, t + 0.17, '#f7c84a'); slab(0.05, cz + 0.2, t + 0.17, '#f4f0e4'); slab(0.65, cz + 0.2, t + 0.17, '#9ad06a');
    pyramid(1.2, cz + 0.2, t + 0.17, '#5a2a12'); // gulab jamun
    slab(-0.85, cz - 0.04, t + 0.33, '#f2d6a0'); pyramid(-0.25, cz - 0.04, t + 0.33, '#f08ab0'); slab(0.4, cz - 0.04, t + 0.33, '#c8905a'); pyramid(1.0, cz - 0.04, t + 0.33, '#ffd84a');
    slab(-0.5, cz - 0.28, t + 0.49, '#e8e0f0'); pyramid(0.2, cz - 0.28, t + 0.49, '#f2a01a'); slab(0.85, cz - 0.28, t + 0.49, '#f4c0c0');
    instanced(ladd, mat('#ffffff', 0.55), sw, g);
    instanced(barfi, mat('#ffffff', 0.6), bf, g);
    // a hanging scale and boxes of sweets
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.22, 0.08, 0.16), mat(['#e8202a', '#f2c21a', '#e85fc8'][i % 3], 0.6), -1.3 + i * 0.12, t + 0.04 + (i % 2) * 0.08, cz - 0.42, g);
  }
  const mithaiWala = vendor(man(1, { dress: 'kurta', top: '#f2e6c8', headwear: 'topi', turban: '#f4f2ec' }), mit);

  const chu = stall(-6.5, 5, Math.PI / 2, { cols: ['#8a3ad8', '#f2c21a'], sign: ['चूड़ियाँ', 'CHOODIYAN · BANGLES'], cloth: '#7a2b6e', back: '#f8e8f0' });
  {
    const g = chu.g, cz = chu.cz, t = chu.top, items = [];
    const BC = ['#e8202a', '#2eb84a', '#1e8fe0', '#f2c21a', '#e85fc8', '#8a3ad8', '#f27a12', '#d8a832', '#f4f2ec', '#1a1a1a'];
    for (let r = 0; r < 7; r++) {
      const x = -1.25 + r * 0.42;
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 5), M.darkWood, x, t + 0.3, cz, g);
      for (let k = 0; k < 24; k++) items.push({ x, y: t + 0.04 + k * 0.022, z: cz, rx: Math.PI / 2, c: BC[(r * 3 + Math.floor(k / 4)) % BC.length] });
    }
    // more on strings along the back cloth
    for (let r = 0; r < 6; r++) for (let k = 0; k < 14; k++) items.push({ x: -1.2 + r * 0.48, y: 2.4 - k * 0.1, z: -1.05, c: BC[(r + k) % BC.length], rx: 0.1 });
    instanced(new THREE.TorusGeometry(0.042, 0.006, 5, 16), mat('#ffffff', 0.15, { metalness: 0.5 }), items, g);
    add(new THREE.PlaneGeometry(0.3, 0.42), M.silver, 1.35, t + 0.3, cz - 0.1, g).rotation.y = -0.4; // a mirror
  }
  const chudiWali = vendor(woman(2, { veil: true }), chu, 'idle');

  // --- right row: toys, chai, pani puri
  const toy = stall(6.5, 15, -Math.PI / 2, { cols: ['#1e8fe0', '#f4f2ec'], sign: ['खिलौने', 'KHILAUNE · TOYS'], cloth: '#2a64c8', back: '#e8f0f8' });
  const pinwheels = [];
  const pinwheel = (parent, x, y, z, s = 1) => {
    const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p);
    for (let i = 0; i < 4; i++) {
      const b = add(new THREE.CircleGeometry(0.09 * s, 3, 0, 1.2), mat(BALLOON_COLS[(i + pinwheels.length) % 8], 0.6, { side: THREE.DoubleSide }), 0, 0, 0, p);
      b.rotation.z = (i * Math.PI) / 2;
    }
    pinwheels.push(p);
    return p;
  };
  {
    const g = toy.g, cz = toy.cz, t = toy.top;
    const kinds = ['lion', 'monkey', 'rakshas', 'clown'];
    const mt = Object.fromEntries(kinds.map((k) => [k, new THREE.MeshStandardMaterial({ map: maskTex(k), roughness: 0.6, transparent: true, alphaTest: 0.5 })]));
    for (let i = 0; i < 7; i++) add(new THREE.PlaneGeometry(0.32, 0.32), mt[kinds[i % 4]], -1.35 + i * 0.45, 2.0, 1.12, g);
    add(new THREE.CylinderGeometry(0.012, 0.012, 3.2, 4).rotateZ(Math.PI / 2), M.darkWood, 0, 2.18, 1.12, g);
    // a bundle of pinwheels on a pole, flutes in a pot, balls and little drums
    add(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 5), M.bamboo, 1.3, t + 0.8, cz, g);
    for (let i = 0; i < 9; i++) { const a = i * 0.7; pinwheel(g, 1.3 + Math.cos(a) * 0.16, t + 1.0 + (i % 3) * 0.22, cz + Math.sin(a) * 0.16 + 0.05, 1); }
    add(new THREE.CylinderGeometry(0.12, 0.09, 0.22, 10), M.clay, -1.1, t + 0.11, cz, g);
    for (let i = 0; i < 8; i++) add(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), mat(['#d8b060', '#c8202a', '#2e9a4a'][i % 3], 0.5), -1.1 + Math.cos(i) * 0.05, t + 0.35, cz + Math.sin(i) * 0.05, g).rotation.z = Math.cos(i * 2) * 0.12;
    const balls = []; for (let i = 0; i < 14; i++) balls.push({ x: -0.4 + (i % 5) * 0.14, y: t + 0.07 + Math.floor(i / 5) * 0.1, z: cz + ((i * 7) % 3 - 1) * 0.12, c: BALLOON_COLS[i % 8] });
    instanced(new THREE.SphereGeometry(0.065, 10, 8), mat('#ffffff', 0.4), balls, g);
    for (let i = 0; i < 3; i++) { const d = new THREE.Group(); d.position.set(0.4 + i * 0.25, t + 0.1, cz); g.add(d); add(new THREE.CylinderGeometry(0.07, 0.02, 0.09, 10), M.red, 0, 0.045, 0, d); add(new THREE.CylinderGeometry(0.02, 0.07, 0.09, 10), M.red, 0, -0.045, 0, d); d.rotation.z = Math.PI / 2; }
  }
  const toyWala = vendor(man(3, { dress: 'pants', top: '#c9b27a' }), toy);
  { const pw = pinwheel(toyWala.arms[1].hand, 0, -0.32, 0.08, 1.2); pw.rotation.x = -Math.PI / 2; add(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 4), M.bamboo, 0, -0.15, 0.04, toyWala.arms[1].hand); }

  const chai = stall(6.5, 10, -Math.PI / 2, { cols: ['#2e9a4a', '#f2e6c8'], sign: ['चाय · पकोड़े', 'CHAI · PAKODE'], cloth: '#3c6e47' });
  {
    const g = chai.g, cz = chai.cz, t = chai.top;
    add(new THREE.CylinderGeometry(0.2, 0.22, 0.22, 12), mat('#3a3836', 0.5, { metalness: 0.6 }), -0.9, t + 0.11, cz, g);
    add(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 14), M.silver, -0.9, t + 0.32, cz, g);
    add(new THREE.LatheGeometry([[0.05, 0], [0.3, 0.04], [0.38, 0.15]].map(([x, y]) => new THREE.Vector2(x, y)), 16), mat('#2a2826', 0.4, { metalness: 0.7 }), 0.2, t + 0.02, cz, g);
    const pk = []; for (let i = 0; i < 26; i++) { const a = i * 2.39, r = Math.sqrt(i / 26) * 0.26; pk.push({ x: 0.2 + Math.cos(a) * r, y: t + 0.12 + (0.26 - r) * 0.2, z: cz + Math.sin(a) * r, s: 0.8 + Math.random() * 0.4, c: '#c8801a' }); }
    instanced(new THREE.IcosahedronGeometry(0.05, 0), mat('#ffffff', 0.7), pk, g);
    const cups = []; for (let i = 0; i < 10; i++) cups.push({ x: 0.9 + (i % 5) * 0.09, y: t + 0.04, z: cz - 0.1 + Math.floor(i / 5) * 0.1, c: '#a8603a' });
    instanced(new THREE.CylinderGeometry(0.03, 0.024, 0.07, 8), mat('#ffffff', 0.85), cups, g);
  }
  const chaiWala = vendor(man(4, { dress: 'pants', top: '#e9dcc3', headwear: 'cap' }), chai, 'pour', ['kettle', 'cupL']);

  const gol = cart(6.2, 5, -Math.PI / 2, '#f2c21a', ['#e8202a', '#f2c21a']);
  {
    const g = gol.g, t = gol.top;
    add(new THREE.BoxGeometry(1.0, 0.45, 0.6), mat('#dff0f4', 0.05, { transparent: true, opacity: 0.35 }), -0.15, t + 0.23, 0, g);
    const pu = []; for (let i = 0; i < 60; i++) { const a = i * 2.39, r = Math.sqrt(i / 60) * 0.26; pu.push({ x: -0.15 + Math.cos(a) * r * 1.5, y: t + 0.04 + (0.26 - r) * 0.7, z: Math.sin(a) * r, s: 1, sy: 0.7, c: '#e8b45a' }); }
    instanced(new THREE.SphereGeometry(0.04, 8, 6), mat('#ffffff', 0.7), pu, g);
    add(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 14), M.clay, 0.55, t + 0.15, -0.1, g);
    add(new THREE.CircleGeometry(0.15, 14).rotateX(-Math.PI / 2), mat('#5a8a2a', 0.1), 0.55, t + 0.3, -0.1, g);
    add(new THREE.CylinderGeometry(0.12, 0.1, 0.16, 12), M.silver, 0.55, t + 0.08, 0.22, g);
    add(new THREE.PlaneGeometry(1.4, 0.4), new THREE.MeshStandardMaterial({ map: signTex('पानी पूरी', 'PANI PURI', '#fff3c4', '#1d6a2a'), roughness: 0.7 }), 0, 0.72, 0.432, g);
  }
  const puriWala = vendor(man(5, { dress: 'pants', top: '#f4f2ec', bottom: '#5b5246' }), { g: gol.g });
  puriWala.root.position.set(0, 0, -0.8);
  let puriA = 0;
  puriWala.poseHook = (P) => { const d = Math.max(0, Math.sin(puriA)); P.sh1 = -0.9 - d * 0.5; P.el1 = -0.9 + d * 0.4; P.sh0 = -0.8; P.el0 = -1.0; P.shz0 = 0.15; P.torsoX = 0.12 + d * 0.12; P.headX = 0.3; };

  // --- back row: balloon shooting, cotton candy, ice gola
  const sho = stall(-5, -19, 0, { w: 3.4, cols: ['#1a3a8a', '#f2c21a'], sign: ['निशानेबाज़ी', '3 SHOTS ₹10', '#1a1a3a', '#ffd21a'], cloth: '#1a3a8a', back: '#14204a' });
  const popped = [];
  let shootBoard;
  {
    const g = sho.g, cz = sho.cz, t = sho.top;
    add(new THREE.PlaneGeometry(3.0, 1.5), mat('#1e2a6a', 0.9), 0, 1.75, -1.0, g);
    const bl = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 10; c++) bl.push({ x: -1.3 + c * 0.29, y: 1.15 + r * 0.29, z: -0.95, s: 1, sy: 1.2, c: BALLOON_COLS[(r * 3 + c) % 8] });
    shootBoard = { im: instanced(new THREE.SphereGeometry(0.11, 10, 8), mat('#ffffff', 0.25), bl, g), items: bl };
    const gun = new THREE.Group(); gun.position.set(-0.6, t + 0.04, cz); g.add(gun);
    add(new THREE.BoxGeometry(0.06, 0.08, 0.45), M.darkWood, 0, 0.04, 0.1, gun); add(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6).rotateX(Math.PI / 2), M.black, 0, 0.07, -0.3, gun);
    gun.rotation.y = 0.3;
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.2, 0.2, 0.2), mat(['#e8202a', '#f2c21a', '#2eb84a'][i], 0.6), 0.6 + i * 0.25, t + 0.1, cz - 0.15, g); // prizes
  }
  const shootWala = vendor(man(6, { dress: 'pants', top: '#d8a0a0', headwear: 'cap', turban: '#1a1a1a' }), sho);
  shootWala.root.position.x = 1.0;

  const can = cart(1.2, -18.6, 0, '#e85fa0', ['#e85fa0', '#f4f2ec']);
  let candyDrum;
  {
    const g = can.g, t = can.top;
    candyDrum = add(new THREE.CylinderGeometry(0.32, 0.28, 0.26, 16, 1, true), M.silver, -0.2, t + 0.13, 0, g);
    add(new THREE.CircleGeometry(0.28, 16).rotateX(-Math.PI / 2), M.silver, -0.2, t + 0.02, 0, g);
    add(new THREE.SphereGeometry(0.22, 12, 8), mat('#ffb0d8', 1), -0.2, t + 0.18, 0, g).scale.set(1, 0.4, 1);
    add(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5), M.bamboo, 0.5, t + 0.65, 0, g);
    for (let i = 0; i < 10; i++) {
      const a = i * 0.63, y = t + 0.9 + (i % 4) * 0.13;
      const fl = add(new THREE.SphereGeometry(0.13, 10, 8), mat(i % 3 ? '#ffa8d0' : '#f4f2ff', 1), 0.5 + Math.cos(a) * 0.2, y + 0.18, Math.sin(a) * 0.2, g);
      fl.scale.set(1, 1.25, 1);
      beam(V(0.5, y - 0.05, 0), fl.position, 0.006, M.white, g, false, 3);
    }
    add(new THREE.PlaneGeometry(1.4, 0.4), new THREE.MeshStandardMaterial({ map: signTex('बुढ़िया के बाल', 'COTTON CANDY', '#ffe0f0', '#b0125e'), roughness: 0.7 }), 0, 0.72, 0.432, g);
  }
  const candyWala = vendor(man(7, { dress: 'kurta', top: '#b9c7a5' }), { g: can.g }, 'stir');
  candyWala.root.position.set(-0.2, 0, -0.75);

  const gla = cart(5.8, -18.6, 0, '#2a8ad0', ['#1e8fe0', '#f4f2ec']);
  {
    const g = gla.g, t = gla.top;
    add(new THREE.BoxGeometry(0.4, 0.3, 0.32), mat('#e8f6ff', 0.05, { transparent: true, opacity: 0.6 }), -0.4, t + 0.15, 0, g);
    const bt = []; for (let i = 0; i < 8; i++) bt.push({ x: 0.15 + (i % 4) * 0.13, y: t + 0.14, z: -0.15 + Math.floor(i / 4) * 0.3, c: ['#e8202a', '#2eb84a', '#f27a12', '#1e8fe0', '#e85fc8', '#f2c21a', '#8a3ad8', '#c8202a'][i] });
    instanced(new THREE.CylinderGeometry(0.035, 0.04, 0.28, 8), mat('#ffffff', 0.1, { transparent: true, opacity: 0.85 }), bt, g);
    const go = []; for (let i = 0; i < 4; i++) go.push({ x: -0.75 + i * 0.12, y: t + 0.12, z: 0.25, c: ['#e8202a', '#f27a12', '#2eb84a', '#1e8fe0'][i] });
    instanced(new THREE.SphereGeometry(0.06, 8, 6), mat('#ffffff', 0.3), go, g);
    add(new THREE.PlaneGeometry(1.4, 0.4), new THREE.MeshStandardMaterial({ map: signTex('बर्फ का गोला', 'ICE GOLA', '#e0f4ff', '#0a4a9a'), roughness: 0.7 }), 0, 0.72, 0.432, g);
  }
  const golaWala = vendor(man(8, { dress: 'pants', top: '#8fa6c4', headwear: 'cap', turban: '#f2efe6' }), { g: gla.g }, 'stir');
  golaWala.root.position.set(-0.4, 0, -0.75);

  // ---------------- the giant wheel ----------------
  const FW = { x: -15, z: -6, hub: 8.0, R: 6.2 };
  const wheel = new THREE.Group();
  const gondolas = [];
  {
    const y0 = gyL(FW.x, FW.z);
    wheel.position.set(FW.x, y0 + FW.hub, FW.z); G.add(wheel);
    const rimM = M.red, spokeM = M.white;
    for (const sx of [-0.75, 0.75]) {
      add(new THREE.TorusGeometry(FW.R, 0.07, 6, 64).rotateY(Math.PI / 2), rimM, sx, 0, 0, wheel, true);
      add(new THREE.TorusGeometry(FW.R * 0.55, 0.05, 6, 48).rotateY(Math.PI / 2), M.yellow, sx, 0, 0, wheel, true);
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; beam(V(sx, 0, 0), V(sx, Math.sin(a) * FW.R, Math.cos(a) * FW.R), 0.03, spokeM, wheel, true, 4); }
    }
    add(new THREE.CylinderGeometry(0.4, 0.4, 1.9, 14).rotateZ(Math.PI / 2), M.yellow, 0, 0, 0, wheel, true);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; beam(V(-0.8, Math.sin(a) * FW.R, Math.cos(a) * FW.R), V(0.8, Math.sin(a) * FW.R, Math.cos(a) * FW.R), 0.04, M.steel, wheel, false); }
    // the A-frame legs, cross bracing, the boarding platform and a little ticket booth
    for (const sx of [-1.3, 1.3]) {
      for (const sz of [-4.4, 4.4]) beam(V(FW.x + sx, y0, FW.z + sz), V(FW.x + sx * 0.75, y0 + FW.hub, FW.z), 0.11, M.blue, G, true);
      beam(V(FW.x + sx, y0 + 2.5, FW.z - 3.0), V(FW.x + sx, y0 + 2.5, FW.z + 3.0), 0.05, M.blue, G, false);
      beam(V(FW.x + sx, y0 + 2.5, FW.z - 3.0), V(FW.x + sx * 0.9, y0 + 5.5, FW.z + 1.5), 0.04, M.blue, G, false);
      beam(V(FW.x + sx, y0 + 2.5, FW.z + 3.0), V(FW.x + sx * 0.9, y0 + 5.5, FW.z - 1.5), 0.04, M.blue, G, false);
    }
    add(new THREE.BoxGeometry(3.2, 0.5, 2.4), M.wood, FW.x, y0 + 0.25, FW.z, G, true);
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.9, 0.16, 0.3), M.wood, FW.x + 2.0, y0 + 0.08 + i * 0.0, FW.z + 0.8 - i * 0.3).position.y = y0 + 0.1 + (2 - i) * 0.0;
    add(new THREE.BoxGeometry(1.1, 1.9, 1.1), mat('#f2c21a', 0.7), FW.x + 2.6, y0 + 0.95, FW.z - 3.4, G, true);
    add(new THREE.PlaneGeometry(1.0, 0.36), new THREE.MeshStandardMaterial({ map: signTex('झूला ₹20', 'GIANT WHEEL', '#e8202a', '#fff3c4', 512, 180), roughness: 0.7 }), FW.x + 2.6, y0 + 2.05, FW.z - 2.84);
    box(FW.x, FW.z, 1.75, 4.7, 0, 30);
    box(FW.x + 2.6, FW.z - 3.4, 0.6, 0.6, 0, 3);
    // bulbs along the rims and spokes
    const wb = [];
    for (const sx of [-0.82, 0.82]) {
      for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2; wb.push({ x: sx, y: Math.sin(a) * FW.R, z: Math.cos(a) * FW.R, c: BULB_COLS[k % 6] }); }
      for (let k = 0; k < 16; k++) for (let j = 1; j <= 5; j++) { const a = (k / 16) * Math.PI * 2, r = (j / 6) * FW.R; wb.push({ x: sx, y: Math.sin(a) * r, z: Math.cos(a) * r, c: BULB_COLS[(k + j) % 6] }); }
    }
    wheel.bulbs = instanced(bulbGeo, bulbMat, wb, wheel);
    wheel.bulbItems = wb;
    allBulbs.push(wheel.bulbs);
    // gondolas: open cabins that hang level as the wheel turns
    const GC = [M.red, M.blue, M.yellow, M.green, M.pink, M.orange, M.blue, M.red];
    for (let k = 0; k < 8; k++) {
      const g = new THREE.Group(); G.add(g);
      const cab = new THREE.Group(); cab.position.y = -1.3; g.add(cab);
      for (const sx of [-0.45, 0.45]) beam(V(sx * 0.5, 1.3, 0), V(sx, 0.95, 0), 0.025, M.steel, cab, false, 4);
      add(new THREE.BoxGeometry(1.2, 0.06, 1.0), GC[k], 0, 0, 0, cab, true);
      add(new THREE.BoxGeometry(0.42, 0.06, 0.95), M.wood, -0.2, 0.38, 0, cab);
      add(new THREE.BoxGeometry(0.06, 0.5, 0.95), GC[k], -0.48, 0.62, 0, cab);
      for (const sz of [-0.5, 0.5]) add(new THREE.BoxGeometry(1.2, 0.36, 0.04), GC[k], 0, 0.2, sz, cab);
      add(new THREE.BoxGeometry(0.04, 0.3, 1.0), GC[k], 0.6, 0.17, 0, cab);
      add(new THREE.ConeGeometry(0.8, 0.35, 4, 1, true).rotateY(Math.PI / 4), mat(GC[k] === M.yellow ? '#c8202a' : '#f2c21a', 0.6, { side: THREE.DoubleSide }), 0, 1.15, 0, cab, true);
      for (const [sx, sz] of [[-0.55, -0.45], [0.55, -0.45], [-0.55, 0.45], [0.55, 0.45]]) add(new THREE.CylinderGeometry(0.018, 0.018, 1.0, 4), M.steel, sx, 0.5, sz, cab);
      gondolas.push({ g, cab, a: (k / 8) * Math.PI * 2, riders: [] });
    }
  }
  // ---------------- the merry-go-round ----------------
  const CR = { x: 15, z: -5, R: 3.4 };
  const caro = new THREE.Group();
  const horses = [];
  {
    const y0 = gyL(CR.x, CR.z);
    add(new THREE.CylinderGeometry(4.9, 5.0, 0.4, 32), new THREE.MeshStandardMaterial({ map: stripeTex(['#c8202a', '#d8a832'], 24), roughness: 0.5 }), CR.x, y0 + 0.2, CR.z, G, true);
    caro.position.set(CR.x, y0 + 0.4, CR.z); G.add(caro);
    add(new THREE.CylinderGeometry(4.6, 4.6, 0.06, 32), M.wood, 0, 0.03, 0, caro);
    add(new THREE.CylinderGeometry(0.55, 0.6, 3.6, 16), new THREE.MeshStandardMaterial({ map: stripeTex(['#f2c21a', '#e85fa0', '#2e9a4a', '#1e8fe0'], 16), roughness: 0.4 }), 0, 1.8, 0, caro, true);
    add(new THREE.ConeGeometry(5.1, 1.5, 24, 1, true), new THREE.MeshStandardMaterial({ map: stripeTex(['#c8202a', '#f4f2ec', '#f2c21a', '#f4f2ec'], 24), roughness: 0.7, side: THREE.DoubleSide }), 0, 4.35, 0, caro, true);
    add(new THREE.CylinderGeometry(5.1, 5.1, 0.45, 32, 1, true), new THREE.MeshStandardMaterial({ map: stripeTex(['#1e8fe0', '#f2c21a'], 32), roughness: 0.6, side: THREE.DoubleSide }), 0, 3.4, 0, caro);
    add(new THREE.SphereGeometry(0.3, 12, 8), M.gold, 0, 5.2, 0, caro);
    add(new THREE.ConeGeometry(0.07, 0.6, 6), M.gold, 0, 5.7, 0, caro);
    const cb = []; for (let k = 0; k < 56; k++) { const a = (k / 56) * Math.PI * 2; cb.push({ x: Math.sin(a) * 5.14, y: 3.2, z: Math.cos(a) * 5.14, c: BULB_COLS[k % 6] }); }
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; cb.push({ x: Math.sin(a) * 2.6, y: 3.62 + 0.0, z: Math.cos(a) * 2.6, c: BULB_COLS[(k + 2) % 6] }); }
    allBulbs.push(instanced(bulbGeo, bulbMat, cb, caro));
    const HC = ['#f4f2ec', '#3a2a1e', '#e8d8b8', '#8a5a32', '#f4f2ec', '#1a1a1a', '#d8c8a8', '#a06a3a'];
    const SADDLE = [M.red, M.blue, M.green, M.pink];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      add(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 6), M.gold, Math.sin(a) * CR.R, 1.6, Math.cos(a) * CR.R, caro);
      const h = new THREE.Group(); h.position.set(Math.sin(a) * CR.R, 1.0, Math.cos(a) * CR.R); h.rotation.y = a + Math.PI / 2; caro.add(h);
      const hm = mat(HC[k], 0.4);
      add(new THREE.SphereGeometry(0.22, 12, 8).scale(0.85, 1, 2.3), hm, 0, 0, 0, h, true);
      const neck = add(new THREE.CylinderGeometry(0.1, 0.14, 0.55, 8), hm, 0, 0.26, 0.42, h); neck.rotation.x = 0.6;
      add(new THREE.BoxGeometry(0.15, 0.17, 0.36), hm, 0, 0.5, 0.66, h).rotation.x = 0.5;
      for (const sx of [-0.04, 0.04]) add(new THREE.ConeGeometry(0.03, 0.09, 4), hm, sx, 0.62, 0.52, h);
      add(new THREE.BoxGeometry(0.04, 0.32, 0.28), M.black, 0, 0.44, 0.38, h).rotation.x = 0.6; // mane
      for (const [sx, sz, rx] of [[-0.1, 0.32, -0.7], [0.1, 0.32, -0.3], [-0.1, -0.32, 0.6], [0.1, -0.32, 0.3]]) { const l = add(new THREE.CylinderGeometry(0.035, 0.025, 0.5, 5).translate(0, -0.25, 0), hm, sx, -0.08, sz, h); l.rotation.x = rx; }
      add(new THREE.ConeGeometry(0.06, 0.4, 5).rotateX(-2.4), M.black, 0, 0.02, -0.55, h);
      add(new THREE.BoxGeometry(0.4, 0.05, 0.36), SADDLE[k % 4], 0, 0.21, -0.02, h);
      add(new THREE.BoxGeometry(0.42, 0.16, 0.06), M.gold, 0, 0.12, -0.02, h);
      horses.push({ h, a, ph: k * 0.9, rider: null });
    }
    // a low railing with a gap to get on
    for (let k = 0; k < 28; k++) {
      const a0 = (k / 28) * Math.PI * 2, a1 = ((k + 1) / 28) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a0 + Math.PI / 2), Math.cos(a0 + Math.PI / 2))) < 0.3) continue;
      const p0 = V(CR.x + Math.sin(a0) * 5.6, y0 + 0.75, CR.z + Math.cos(a0) * 5.6), p1 = V(CR.x + Math.sin(a1) * 5.6, y0 + 0.75, CR.z + Math.cos(a1) * 5.6);
      beam(p0, p1, 0.03, M.gold, G, false, 4);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.75, 4), M.gold, p0.x, y0 + 0.37, p0.z);
    }
    circ(CR.x, CR.z, 5.1, 30);
  }
  // ---------------- the swinging boat ----------------
  const BS = { x: -15, z: 12, pivot: 6.4 };
  const boat = new THREE.Group();
  const boatRiders = [];
  {
    const y0 = gyL(BS.x, BS.z);
    for (const sx of [-1.6, 1.6]) {
      for (const sz of [-3.6, 3.6]) beam(V(BS.x + sx, y0, BS.z + sz), V(BS.x + sx, y0 + BS.pivot + 0.2, BS.z), 0.12, M.green, G, true);
      beam(V(BS.x + sx, y0 + 1.6, BS.z - 2.7), V(BS.x + sx, y0 + 1.6, BS.z + 2.7), 0.06, M.green, G, false);
    }
    add(new THREE.CylinderGeometry(0.14, 0.14, 3.6, 10).rotateZ(Math.PI / 2), M.steel, BS.x, y0 + BS.pivot, BS.z, G, true);
    boat.position.set(BS.x, y0 + BS.pivot, BS.z); G.add(boat);
    for (const sx of [-1.2, 1.2]) for (const sz of [-1.0, 1.0]) beam(V(sx, 0, 0), V(sx, -5.0, sz * 1.1), 0.06, M.yellow, boat, true);
    // the hull: a crescent profile extruded across
    const sh = new THREE.Shape();
    sh.moveTo(-3.4, 1.7); sh.quadraticCurveTo(-2.6, -0.1, 0, -0.1); sh.quadraticCurveTo(2.6, -0.1, 3.4, 1.7);
    sh.lineTo(3.2, 1.75); sh.quadraticCurveTo(2.2, 0.62, 0, 0.62); sh.quadraticCurveTo(-2.2, 0.62, -3.2, 1.75); sh.closePath();
    const hg = new THREE.ExtrudeGeometry(sh, { depth: 1.8, bevelEnabled: false, curveSegments: 12 });
    hg.translate(0, 0, -0.9); hg.rotateY(-Math.PI / 2);
    const hull = new THREE.Group(); hull.position.y = -5.5; boat.add(hull);
    add(hg, M.red, 0, 0, 0, hull, true);
    for (const sx of [-0.92, 0.92]) {
      const side = add(new THREE.PlaneGeometry(5.4, 0.42), new THREE.MeshStandardMaterial({ map: signTex('~ नाव ~', 'SWING BOAT', '#f2c21a', '#9b0d1c', 512, 128), roughness: 0.6, side: THREE.DoubleSide }), sx, 0.42, 0, hull);
      side.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    add(new THREE.BoxGeometry(1.78, 0.05, 4.2), M.wood, 0, 0.1, 0, hull);
    for (const z of [-2.0, -0.9, 0.9, 2.0]) add(new THREE.BoxGeometry(1.7, 0.08, 0.32), M.wood, 0, 0.45, z, hull);
    for (const z of [-2.35, 2.35]) add(new THREE.BoxGeometry(1.7, 0.6, 0.06), M.yellow, 0, 0.7, z, hull);
    const bb = []; for (let k = 0; k < 30; k++) { const u = -3.3 + (k / 29) * 6.6; const v = 1.7 - (1.8 * (1 - Math.abs(u) / 3.4)) * 0.98 + 0.06; for (const sx of [-0.93, 0.93]) bb.push({ x: sx, y: Math.max(0.65, v), z: u, c: BULB_COLS[k % 6] }); }
    allBulbs.push(instanced(bulbGeo, bulbMat, bb, hull));
    boat.hull = hull;
    box(BS.x, BS.z, 2.1, 4.0, 0, 30);
  }
  // ---------------- swings for the little ones ----------------
  const SW = { x: 15, z: 12 };
  const swings = [];
  {
    const y0 = gyL(SW.x, SW.z);
    for (const sx of [-1.7, 1.7]) for (const sz of [-1.1, 1.1]) beam(V(SW.x + sx, y0, SW.z + sz), V(SW.x + sx, y0 + 2.9, SW.z), 0.07, M.darkWood, G, true);
    beam(V(SW.x - 1.8, y0 + 2.9, SW.z), V(SW.x + 1.8, y0 + 2.9, SW.z), 0.08, M.darkWood, G, true);
    for (const sx of [-0.75, 0.75]) {
      const g = new THREE.Group(); g.position.set(SW.x + sx, y0 + 2.88, SW.z); G.add(g);
      for (const ox of [-0.24, 0.24]) add(new THREE.CylinderGeometry(0.012, 0.012, 2.3, 4).translate(0, -1.15, 0), M.rope, ox, 0, 0, g);
      add(new THREE.BoxGeometry(0.6, 0.05, 0.26), M.wood, 0, -2.3, 0, g, true);
      swings.push({ g, kid: null });
    }
    box(SW.x, SW.z, 1.85, 1.3, 0, 3);
  }
  instanced(new THREE.SphereGeometry(0.055, 6, 5), mat('#ffffff', 0.9), marigolds);

  // ---------------- riders on everything ----------------
  {
    let i = 0;
    const seat = (p, seatH) => { p.seatH = seatH; return p; };
    // the giant wheel: a mother with her daughter, and a boy on his own
    const g0 = gondolas[0], g4 = gondolas[4];
    g0.riders.push(seat(mkP(woman(4), g0.cab, -0.25, 0.03, -0.24, Math.PI / 2), 0.38), seat(mkP(girl(1), g0.cab, -0.25, 0.03, 0.24, Math.PI / 2), 0.38));
    g4.riders.push(seat(mkP(boy(2), g4.cab, -0.25, 0.03, 0, Math.PI / 2), 0.38));
    // the merry-go-round: three little riders
    for (const k of [0, 3, 5]) { const kid = mkP(i++ % 2 ? girl(i) : boy(i), horses[k].h, 0, 0.17, -0.03, 0); kid.seatH = 0; horses[k].rider = kid; }
    // the swinging boat: two kids at each end and a father
    for (const [o, x, z] of [[boy(3), -0.4, 2.0], [girl(2), 0.4, 2.0], [man(9, { dress: 'pants', top: '#e0612b' }), -0.4, -2.0], [boy(4), 0.4, -2.0]]) {
      const p = mkP(o, boat.hull, x, 0.13, z, z > 0 ? Math.PI : 0); p.seatH = 0.38; boatRiders.push(p);
    }
    // the swings
    swings[0].kid = mkP(girl(3), swings[0].g, 0, -2.28, 0, 0); swings[0].kid.seatH = 0;
    swings[1].kid = mkP(boy(1), swings[1].g, 0, -2.28, 0, 0); swings[1].kid.seatH = 0;
  }
  const operators = [];
  operators.push(mkP(man(10, { dress: 'pants', top: '#3a3a42', bottom: '#2a2a32', headwear: 'cap', turban: '#c0392b' }), G, FW.x + 2.2, gyL(FW.x + 2.2, FW.z - 2.4), FW.z - 2.4, -Math.PI / 2));
  operators.push(mkP(man(11, { dress: 'pants', top: '#f4f2ec', bottom: '#3a3a42' }), G, CR.x - 5.4, gyL(CR.x - 5.4, CR.z - 2.8), CR.z - 2.8, Math.PI / 2 - 0.4));
  operators.push(mkP(woman(5, { veil: true }), G, SW.x - 0.1, gyL(SW.x, SW.z - 2.7), SW.z - 2.7, 0)); // a mother watching her two on the swings
  // customers standing at the pani puri cart and the shooting game
  const customers = [];
  customers.push(mkP(woman(1), G, 4.25, gyL(4.25, 4.7), 4.7, -Math.PI / 2), mkP(girl(0), G, 4.15, gyL(4.15, 5.45), 5.45, -Math.PI / 2));
  const shooter = mkP(boy(0, { k: 0.85, headScale: 1.1, top: '#1e6fa8', bottom: '#2a2a32' }), G, -5.6, gyL(-5.6, -16.9), -16.9, Math.PI);
  customers.push(shooter);
  for (const c of customers.slice(0, 2)) { add(new THREE.CylinderGeometry(0.07, 0.05, 0.04, 10), mat('#5a8a3a', 0.8), 0, -0.07, 0.04, c.arms[0].hand); }
  shooter.poseHook = (P) => { P.sh0 = -1.45; P.el0 = -0.2; P.shz0 = -0.2; P.sh1 = -1.25; P.el1 = -0.9; P.shz1 = -0.3; P.headX = 0.08; P.torsoX = 0.15; P.headY = 0.1; };
  { const gun = new THREE.Group(); shooter.arms[0].hand.add(gun); add(new THREE.BoxGeometry(0.05, 0.07, 0.4), M.darkWood, 0, -0.05, 0.12, gun); add(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 5).rotateX(Math.PI / 2), M.black, 0, -0.03, 0.45, gun); gun.rotation.x = Math.PI / 2; }

  // ---------------- balloons, held up on their strings ----------------
  const floaters = [];
  const balloonGeo = new THREE.SphereGeometry(0.15, 12, 10).scale(1, 1.22, 1);
  const knotGeo = new THREE.ConeGeometry(0.025, 0.05, 5).rotateX(Math.PI);
  const handBalloon = (p, color, side = 0) => {
    const g = new THREE.Group(); p.arms[side].hand.add(g);
    add(new THREE.CylinderGeometry(0.003, 0.003, 0.85, 3).translate(0, 0.42, 0), M.white, 0, 0, 0, g);
    add(balloonGeo, mat(color, 0.25), 0, 1.02, 0, g, true);
    add(knotGeo, mat(color, 0.4), 0, 0.84, 0, g);
    floaters.push({ g, ph: Math.random() * 6, amp: 0.18 });
    return g;
  };
  const bunch = (p) => {
    const g = new THREE.Group(); p.arms[1].hand.add(g);
    const pos = [];
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39, r = 0.12 + (i % 4) * 0.07, y = 1.35 + (i % 5) * 0.12;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      add(balloonGeo, mat(BALLOON_COLS[i % 8], 0.25), x, y, z, g, i % 3 === 0);
      pos.push(0, 0, 0, x, y - 0.18, z);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#f4f0e6', transparent: true, opacity: 0.7 })));
    add(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5), M.bamboo, 0, 0.1, 0, g);
    floaters.push({ g, ph: 0, amp: 0.08 });
  };

  // ---------------- families wandering from stall to stall ----------------
  // places to stop (x, z, facing) and the point on the central lane to reach them from
  const SPOTS = [
    [-4.2, 15, -Math.PI / 2, -2.2, 15], [-4.2, 10, -Math.PI / 2, -2.2, 10], [-4.2, 5, -Math.PI / 2, -2.2, 5],
    [4.2, 15, Math.PI / 2, 2.2, 15], [4.2, 10, Math.PI / 2, 2.2, 10],
    [1.2, -16.9, Math.PI, 1.2, -15.6], [5.8, -16.9, Math.PI, 2.2, -15.6], [-3.6, -16.9, Math.PI, -2.2, -15.6],
    [-10.4, -5, -Math.PI / 2, -2.2, -5], [9.4, -4, Math.PI / 2, 2.2, -4], [-11.5, 2.2, -0.35, -2.2, 2.2], [11.0, 2.4, 0.3, 2.2, 2.4],
    [0.6, 18.5, Math.PI, 0.6, 18.5], [-0.8, 8, 0.4, -0.8, 8], [0.8, -8, -2.6, 0.8, -8],
  ].map(([x, z, f, ax, az]) => ({ x, z, f, ax, az, busy: false }));
  const families = [];
  const family = (members, start) => {
    const sp = SPOTS[start]; sp.busy = true;
    const L = members[0];
    const fam = { L, spot: sp, route: [], wait: 3 + Math.random() * 6, x: sp.x, z: sp.z, h: sp.f, speed: 0.95 + Math.random() * 0.15, f: [] };
    L.p.root.position.set(sp.x, gyL(sp.x, sp.z), sp.z);
    members.slice(1).forEach((m, i) => {
      const o = m.off ?? [(i % 2 ? 0.55 : -0.55), -0.5 - Math.floor(i / 2) * 0.5];
      const f = { p: m.p, ox: o[0], oz: o[1], x: sp.x + o[0], z: sp.z + o[1], h: sp.f };
      m.p.root.position.set(f.x, gyL(f.x, f.z), f.z);
      fam.f.push(f);
    });
    families.push(fam);
  };
  const P0 = (o) => ({ p: mkP(o, G, 0, 0, 0) });
  {
    const dad = P0(man(12, { dress: 'kurta', top: '#f2e6c8' })), mom = P0(woman(0)), son = P0(boy(0)), dau = P0(girl(2));
    handBalloon(son.p, '#e8202a');
    { const cc = new THREE.Group(); dau.p.arms[0].hand.add(cc); add(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), M.bamboo, 0, -0.08, 0.05, cc); add(new THREE.SphereGeometry(0.11, 10, 8), mat('#ffa8d0', 1), 0, -0.25, 0.05, cc); }
    mom.off = [0.6, 0.0]; son.off = [-0.45, -0.6]; dau.off = [0.5, -0.65];
    family([dad, mom, son, dau], 0);
    const nani = P0(woman(5, { hair: '#dcd6cc', top: '#f4f2ec', bottom: '#f4f2ec', veil: true })), ma = P0(woman(3)), lil = P0(girl(1, { k: 0.6 }));
    handBalloon(lil.p, '#1e8fe0'); handBalloon(ma.p, '#f2c21a', 1);
    ma.off = [0.6, 0.1]; lil.off = [0.3, -0.55];
    family([nani, ma, lil], 9);
    const papa = P0(man(13, { dress: 'pants', top: '#8fa6c4', bottom: '#2a2a32', headwear: undefined })), b1 = P0(boy(3)), b2 = P0(boy(4, { k: 0.62 }));
    { const pw = pinwheel(b1.p.arms[0].hand, 0, -0.3, 0.06, 1.1); pw.rotation.x = -Math.PI / 2; add(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4), M.bamboo, 0, -0.14, 0.03, b1.p.arms[0].hand); }
    handBalloon(b2.p, '#2eb84a');
    b1.off = [-0.5, -0.5]; b2.off = [0.5, -0.5];
    family([papa, b1, b2], 6);
    const t1 = P0(man(14, { dress: 'pants', top: '#e0612b', bottom: '#2a3a6a', k: 0.92, mustache: false, headwear: undefined })), t2 = P0(man(15, { dress: 'pants', top: '#f4f2ec', bottom: '#3a3a42', k: 0.9, mustache: false, headwear: 'cap', turban: '#1a1a1a' }));
    t2.off = [0.65, 0.1];
    family([t1, t2], 11);
  }
  // the balloon-seller, walking up and down the lane with his bunch
  const bw = { p: mkP(man(16, { dress: 'kurta', top: '#d8d0bc', headwear: 'turban', turban: '#e8202a' }), G, 0, 0, 0), pts: [[-0.9, 19], [1.0, 9], [-1.0, -1], [1.0, -12], [-1.0, -1], [1.0, 9]], i: 0, x: -0.9, z: 19, h: Math.PI, wait: 2 };
  bunch(bw.p);
  bw.p.poseHook = (P) => { P.sh1 = -2.4; P.el1 = -0.3; P.shz1 = -0.1; };
  bw.p.root.position.set(bw.x, gyL(bw.x, bw.z), bw.z);

  // ---------------- what the mela says ----------------
  const CALLS = [
    [jalebiWala, 'गरम गरम जलेबी!', 'Garam garam jalebi!'], [mithaiWala, 'ताज़े लड्डू, ताज़ी बर्फ़ी!', 'Taaze laddoo, taazi barfi!'],
    [chudiWali, 'चूड़ियाँ ले लो, रंग बिरंगी चूड़ियाँ!', 'Choodiyan le lo, rang birangi choodiyan!'], [toyWala, 'खिलौने ले लो, बच्चों के खिलौने!', 'Khilaune le lo!'],
    [chaiWala, 'चाय! गरम चाय, गरम पकोड़े!', 'Chai! Garam pakode!'], [puriWala, 'चटपटी पानी पूरी!', 'Chatpati paani puri!'],
    [shootWala, 'दस रुपये में तीन निशाने!', 'Das rupaye mein teen nishaane!'], [candyWala, 'बुढ़िया के बाल!', 'Budhiya ke baal!'],
    [golaWala, 'बर्फ़ का गोला, ठंडा ठंडा!', 'Barf ka gola, thanda thanda!'], [bw.p, 'गुब्बारे ले लो, गुब्बारे!', 'Gubbaare le lo!'],
    [operators[0], 'आओ आओ, झूला झूलो!', 'Aao aao, jhoola jhoolo!'],
  ];

  // ---------------- state & update ----------------
  let mode = 'day', clock = 0, callT = 4, screamT = 0, chaseT = 0, chase = 0, popT = 3;
  let wheelA = 0, wheelV = 0.2, caroA = 0, caroV = 0.55, boatT = 0, boatAmp = 0, swingT = 0;
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3();
  const walk = (p, st, tx, tz, v, dt) => {
    const dx = tx - st.x, dz = tz - st.z, d = Math.hypot(dx, dz);
    if (d < 0.1) return true;
    const k = Math.min(1, (v * dt) / d);
    st.x += dx * k; st.z += dz * k;
    const want = Math.atan2(dx, dz);
    st.h += Math.atan2(Math.sin(want - st.h), Math.cos(want - st.h)) * damp(dt, 8);
    return false;
  };
  const place = (p, st) => { p.root.position.set(st.x, gyL(st.x, st.z), st.z); p.root.rotation.y = st.h; };
  return {
    group: G,
    people,
    get wheel() { return wheel; },
    distTo(x, z) { return Math.max(0, Math.hypot(x - site.x, z - site.z) - 18); },
    setWeather(w) {
      mode = w.night ? 'night' : w.rain ? 'rain' : 'day';
      bulbMat.color.setScalar(w.night ? 2.6 : 0.95);
      fire.m.emissiveIntensity = w.night ? 3 : 1.6;
      for (const f of families) for (const p of [f.L.p, ...f.f.map((q) => q.p)]) p.setGear(w.rain ? 'umbrella' : 'none');
      bw.p.setGear('none');
    },
    update(dt, player) {
      clock += dt;
      const d = Math.hypot(player.x - site.x, player.z - site.z);
      G.visible = d < 330;
      if (!G.visible) return;
      flagUni.uTime.value = clock;
      const rain = mode === 'rain', night = mode === 'night';
      // ----- rides (they keep turning even from a distance: the giant wheel is a landmark)
      wheelV += ((rain ? 0 : 0.2) - wheelV) * damp(dt, 0.4);
      wheelA += wheelV * dt;
      wheel.rotation.x = wheelA;
      for (const gd of gondolas) {
        const a = gd.a + wheelA;
        gd.g.position.set(FW.x, wheel.position.y + Math.sin(a) * FW.R, FW.z + Math.cos(a) * FW.R);
        gd.g.rotation.x = Math.sin(clock * 1.3 + gd.a) * 0.06 * (wheelV / 0.2);
      }
      caroV += ((rain ? 0 : 0.55) - caroV) * damp(dt, 0.5);
      caroA += caroV * dt;
      caro.rotation.y = caroA;
      for (const h of horses) h.h.position.y = 1.0 + Math.sin(caroA * 2.5 + h.ph) * 0.22 * (caroV / 0.55);
      // the boat swings up over ~12 s, holds, slows, rests and starts again
      boatT = (boatT + dt) % 46;
      const want = rain ? 0 : boatT < 12 ? (boatT / 12) * 0.95 : boatT < 32 ? 0.95 : boatT < 40 ? 0.95 * (1 - (boatT - 32) / 8) : 0;
      boatAmp += (want - boatAmp) * damp(dt, 2);
      const ba = Math.sin(clock * (Math.PI * 2 / 4.6)) * boatAmp;
      boat.rotation.x = ba;
      swingT += dt;
      if (d > 140) return;
      // ----- people
      const near = d < 75;
      const every = near ? 1 : 3, frame = Math.floor(clock * 60);
      const up = (p, i, sp, act) => { if (near || (frame + i) % every === 0) p.update(near ? dt : dt * every, sp, act); };
      vendors.forEach((v, i) => up(v.p, i, 0, v.action));
      puriA += dt * 2.2;
      // riders: on the wheel arms up now and then, on the boat arms up when it swings high
      for (const gd of gondolas) for (const p of gd.riders) up(p, 3, 0, 'sit');
      for (const h of horses) if (h.rider) { h.rider.poseHook ??= (P) => { P.sh0 = P.sh1 = -1.3; P.el0 = P.el1 = -0.5; P.shz0 = 0.1; P.shz1 = -0.1; P.hip0 = P.hip1 = -1.3; P.knee0 = P.knee1 = 1.2; }; up(h.rider, 5, 0, 'sit'); }
      const high = Math.abs(ba) > 0.6;
      for (const p of boatRiders) { p.poseHook ??= (P) => { if (p.userData?.high) { P.sh0 = P.sh1 = -2.8; P.el0 = P.el1 = -0.2; P.shz0 = 0.3; P.shz1 = -0.3; } else { P.sh0 = P.sh1 = -1.0; P.el0 = P.el1 = -0.4; } }; p.userData = { high }; p.poseRate = 6; up(p, 7, 0, 'sit'); }
      screamT -= dt;
      if (high && boatAmp > 0.8 && screamT < 0 && Math.abs(Math.cos(clock * (Math.PI * 2 / 4.6))) < 0.15 && d < 60) {
        screamT = 5 + Math.random() * 4;
        hooks.say?.(...(Math.random() < 0.5 ? ['ऊऊऊ!', 'Oooo!'] : ['वाह! और ऊँचा!', 'Waah! Aur ooncha!']), d, 1.9);
      }
      for (const s of swings) {
        const k = s.kid;
        if (!k) continue;
        s.g.rotation.x = -Math.sin(k.t * 2.2) * 0.5;
        up(k, 9, 0, 'swing');
      }
      operators.forEach((p, i) => up(p, 11 + i, 0, 'idle'));
      customers.forEach((p, i) => up(p, 13 + i, 0, 'idle'));
      // families: walk the lane to a free spot, stop a while, move on; the others follow the leader
      families.forEach((fam, fi) => {
        const L = fam.L.p;
        let speed = 0;
        if (fam.wait > 0) {
          fam.wait -= dt;
          fam.h += Math.atan2(Math.sin(fam.spot.f - fam.h), Math.cos(fam.spot.f - fam.h)) * damp(dt, 3);
          if (fam.wait <= 0) {
            const free = SPOTS.filter((s) => !s.busy);
            const nx = free[Math.floor(Math.random() * free.length)];
            fam.spot.busy = false; nx.busy = true;
            fam.route = [[fam.spot.ax, fam.spot.az], [nx.ax, nx.az], [nx.x, nx.z]];
            fam.spot = nx;
          }
        } else if (fam.route.length) {
          speed = fam.speed;
          if (walk(L, fam, fam.route[0][0], fam.route[0][1], speed, dt)) fam.route.shift();
        } else fam.wait = 6 + Math.random() * 10;
        place(L, fam);
        up(L, 20 + fi, speed, 'walk');
        const c = Math.cos(fam.h), s = Math.sin(fam.h);
        fam.f.forEach((f, j) => {
          const tx = fam.x + f.ox * c + f.oz * s, tz = fam.z - f.ox * s + f.oz * c;
          const dd = Math.hypot(tx - f.x, tz - f.z);
          let sp = 0;
          if (dd > 0.12) { sp = Math.min(1.9, dd * 2.2); walk(f.p, f, tx, tz, sp, dt); }
          else f.h += Math.atan2(Math.sin(fam.h - f.h), Math.cos(fam.h - f.h)) * damp(dt, 3);
          place(f.p, f);
          up(f.p, 25 + fi * 4 + j, sp, 'walk');
        });
      });
      // the balloon-seller
      {
        let sp = 0;
        if (bw.wait > 0) bw.wait -= dt;
        else { sp = 0.6; if (walk(bw.p, bw, bw.pts[bw.i][0], bw.pts[bw.i][1], sp, dt)) { bw.i = (bw.i + 1) % bw.pts.length; bw.wait = 4 + Math.random() * 6; } }
        place(bw.p, bw);
        up(bw.p, 40, sp, 'walk');
      }
      // ----- the little moving things
      pinwheels.forEach((p, i) => { p.rotation.z -= dt * (6 + Math.sin(clock + i) * 2); });
      candyDrum.rotation.y += dt * 9;
      fire.m.emissiveIntensity = (night ? 3 : 1.6) * (0.8 + Math.sin(clock * 13) * 0.12 + Math.sin(clock * 7.3) * 0.1);
      // balloons float upright on their strings and bob
      for (const f of floaters) {
        f.g.parent.getWorldQuaternion(_q).invert();
        _e.set(Math.sin(clock * 1.3 + f.ph) * f.amp, 0, Math.cos(clock * 1.1 + f.ph) * f.amp);
        f.g.quaternion.copy(_q).multiply(_q2.setFromEuler(_e));
      }
      // the shooting game: now and then a balloon on the board goes pop
      popT -= dt;
      if (popT < 0) {
        popT = 2.5 + Math.random() * 4;
        const i = Math.floor(Math.random() * shootBoard.items.length);
        if (!popped.find((q) => q.i === i)) {
          popped.push({ i, t: 5 });
          const it = shootBoard.items[i];
          shootBoard.im.setMatrixAt(i, _m.makeScale(0, 0, 0).setPosition(it.x, it.y, it.z)); shootBoard.im.instanceMatrix.needsUpdate = true;
          if (d < 30) hooks.pop?.(Math.max(0, 1 - d / 30));
        }
      }
      for (const q of popped) {
        q.t -= dt;
        if (q.t < 0) { const it = shootBoard.items[q.i]; shootBoard.im.setMatrixAt(q.i, _m.makeScale(1, 1.2, 1).setPosition(it.x, it.y, it.z)); shootBoard.im.instanceMatrix.needsUpdate = true; }
      }
      for (let i = popped.length - 1; i >= 0; i--) if (popped[i].t < 0) popped.splice(i, 1);
      // at night the wheel's bulbs chase round
      if (night) {
        chaseT -= dt;
        if (chaseT < 0) {
          chaseT = 0.22; chase++;
          wheel.bulbItems.forEach((it, i) => wheel.bulbs.setColorAt(i, _c.set(BULB_COLS[(i + chase) % 6])));
          wheel.bulbs.instanceColor.needsUpdate = true;
        }
      }
      // ----- the vendors calling out, the nearest more often
      callT -= dt;
      if (callT < 0 && d < 45) {
        callT = 4 + Math.random() * 4;
        let best = null, bd = 1e9;
        for (const c of CALLS) {
          c[0].root.getWorldPosition(_v);
          const dd = Math.hypot(_v.x - player.x, _v.z - player.z) * (0.6 + Math.random() * 0.8);
          if (dd < bd) { bd = dd; best = c; }
        }
        if (best) { best[0].root.getWorldPosition(_v); hooks.say?.(best[1], best[2], Math.hypot(_v.x - player.x, _v.z - player.z), 0.85 + Math.random() * 0.4); }
      }
    },
  };
}
