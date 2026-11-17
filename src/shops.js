// Small village shops: a kirana (general store) or a paan-and-tea kiosk in each of the other villages. A
// painted shed with a tin roof sloping out over a wooden counter, shelves of packets, tins and jars behind,
// strings of shampoo and snack sachets hanging from the roof edge, a signboard, sacks of grain out front, and a
// bulb that comes on after dark. The shopkeeper sits behind the counter; now and then a customer comes by.
import * as THREE from 'three';
import { Person } from './people.js';
import { consolidate } from './animals.js';
import { heightAt, groundHeight, layout } from './world.js';
import { cullBeyond } from './perf.js';
import { rng } from './noise.js';

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
const SIGNS = [['किराना स्टोर', 'KIRANA STORE'], ['जनरल स्टोर', 'GENERAL STORE'], ['पान भंडार', 'PAAN BHANDAR'], ['चाय नाश्ता', 'CHAI NASHTA'], ['राशन दुकान', 'RATION SHOP']];
const WALLS = ['#3f8fb0', '#2e8b67', '#d4648a', '#e0b23a', '#8a6ac4', '#d8774a'];

function signTexture([hi, en], bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#fff6dc'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#fff6dc'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 50px "Tiro Devanagari Hindi", "Kohinoor Devanagari", sans-serif'; g.fillText(hi, 256, 52);
  g.font = '600 24px Inter, Arial, sans-serif'; g.fillText(en, 256, 100);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// a strip of sachets: little bright foil packets in a column, drawn once and shared
let sachetTex = null;
function sachets() {
  if (sachetTex) return sachetTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const cols = ['#e8382f', '#1e6fa8', '#f2c21a', '#2e8b57', '#e85fc8', '#f08a12', '#5a3ac4'];
  for (let x = 0; x < 4; x++) for (let y = 0; y < 8; y++) {
    g.fillStyle = cols[(x * 3 + y) % cols.length]; g.fillRect(x * 32 + 3, y * 32 + 2, 26, 28);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x * 32 + 7, y * 32 + 8, 18, 6);
  }
  sachetTex = new THREE.CanvasTexture(c); sachetTex.colorSpace = THREE.SRGBColorSpace;
  return sachetTex;
}

let bulbMat = null;
function buildShop(S, R) {
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  const wallC = WALLS[Math.floor(R() * WALLS.length)];
  const wall = std(wallC), trim = std('#f2efe6'), wood = std('#7a5232'), dark = std('#3e2b1d'), tin = std('#8d9399', { metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide });
  const W = 3.4, D = 2.6, H = 2.5;
  // plinth, back and side walls, a lime-washed band along the bottom
  add(new THREE.BoxGeometry(W + 0.3, 0.25, D + 0.9), std('#a99278'), 0, 0.12, 0.25);
  add(new THREE.BoxGeometry(W, H, 0.14), wall, 0, 0.25 + H / 2, -D / 2);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.14, H, D), wall, sx * W / 2, 0.25 + H / 2, 0);
  for (const [x, z, w, d] of [[0, -D / 2 + 0.08, W, 0.02], [-W / 2 + 0.08, 0, 0.02, D], [W / 2 - 0.08, 0, 0.02, D]]) add(new THREE.BoxGeometry(w, 0.35, d), trim, x, 0.42, z);
  // the tin roof, sloping down toward the front and out over the counter on two poles
  const roof = add(new THREE.BoxGeometry(W + 0.5, 0.04, D + 1.3), tin, 0, 0.25 + H + 0.18, 0.5);
  roof.rotation.x = 0.12;
  for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.03, 0.035, D + 1.3), tin, -W / 2 - 0.2 + i * ((W + 0.4) / 8), 0.25 + H + 0.2, 0.5).rotation.x = 0.12;
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.05, 0.05, H - 0.15, 8), wood, sx * (W / 2 + 0.1), 0.25 + (H - 0.15) / 2, D / 2 + 0.95);
  // the counter: a wooden front with a top board, a weighing scale and glass jars of sweets on it
  add(new THREE.BoxGeometry(W - 0.2, 1.0, 0.5), wood, 0, 0.25 + 0.5, D / 2 - 0.1);
  add(new THREE.BoxGeometry(W, 0.06, 0.62), dark, 0, 0.25 + 1.03, D / 2 - 0.1);
  const brass = std('#c8a04a', { metalness: 0.7, roughness: 0.3 });
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), brass, 0.9, 0.25 + 1.27, D / 2 - 0.1);
  add(new THREE.BoxGeometry(0.5, 0.015, 0.015), brass, 0.9, 0.25 + 1.47, D / 2 - 0.1);
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.1, 0.07, 0.02, 12), brass, 0.9 + sx * 0.24, 0.25 + 1.22, D / 2 - 0.1);
  const glass = std('#d8e6e2', { roughness: 0.1, transparent: true, opacity: 0.4 });
  const sweets = ['#f2c21a', '#e8382f', '#2e8b57', '#f08a12'];
  for (let i = 0; i < 4; i++) {
    const x = -1.25 + i * 0.32;
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.24, 12), std(sweets[i]), x, 0.25 + 1.16, D / 2 - 0.08);
    add(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 12), glass, x, 0.25 + 1.21, D / 2 - 0.08);
    add(new THREE.CylinderGeometry(0.135, 0.135, 0.04, 12), std('#c4241c'), x, 0.25 + 1.38, D / 2 - 0.08);
  }
  // shelves on the back wall, lined with packets, tins and bottles
  const PK = ['#e8382f', '#1e6fa8', '#f2c21a', '#2e8b57', '#f6f2e8', '#e85fc8', '#f08a12', '#8a5a32'].map((c) => std(c, { roughness: 0.6 }));
  for (let sh = 0; sh < 4; sh++) {
    const y = 0.25 + 0.75 + sh * 0.42;
    add(new THREE.BoxGeometry(W - 0.3, 0.04, 0.4), wood, 0, y, -D / 2 + 0.28);
    for (let x = -W / 2 + 0.3; x < W / 2 - 0.3; ) {
      const w = 0.1 + R() * 0.16, h = 0.12 + R() * 0.2, kind = R();
      const m = PK[Math.floor(R() * PK.length)];
      if (kind < 0.25) add(new THREE.CylinderGeometry(w * 0.45, w * 0.45, h, 10), m, x + w / 2, y + 0.02 + h / 2, -D / 2 + 0.25);
      else add(new THREE.BoxGeometry(w, h, 0.14 + R() * 0.1), m, x + w / 2, y + 0.02 + h / 2, -D / 2 + 0.26);
      x += w + 0.02;
    }
  }
  // grain sacks on the floor in front of the counter, a big tin of oil
  const sack = std('#d9c69a', { roughness: 1 });
  for (const [x, z] of [[-1.3, D / 2 + 0.45], [-0.75, D / 2 + 0.5], [1.4, D / 2 + 0.45]]) {
    add(new THREE.CylinderGeometry(0.24, 0.27, 0.55, 12), sack, x, 0.25 + 0.27, z);
    add(new THREE.SphereGeometry(0.24, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), std('#e2c87a', { roughness: 1 }), x, 0.25 + 0.54, z);
  }
  add(new THREE.BoxGeometry(0.3, 0.42, 0.3), std('#c8ccd0', { metalness: 0.6, roughness: 0.4 }), 0.85, 0.25 + 0.21, D / 2 + 0.5);
  // strings of sachets hanging from the roof edge
  const sm = new THREE.MeshStandardMaterial({ map: sachets(), roughness: 0.4, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) { const strip = add(new THREE.PlaneGeometry(0.16, 1.0), sm, -1.4 + i * 0.56, 0.25 + H - 0.45, D / 2 + 0.75); strip.castShadow = false; }
  // the signboard along the top of the front, and the stool the shopkeeper sits on
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.62), new THREE.MeshStandardMaterial({ map: signTexture(SIGNS[S.i % 2 === 0 ? Math.floor(R() * SIGNS.length) : (Math.floor(R() * 2) + 3)], ['#1e3f7a', '#8a1e1a', '#1e5a3a', '#4a2a6a'][Math.floor(R() * 4)]), roughness: 0.6 }));
  sign.position.set(0, 0.25 + H + 0.62, D / 2 + 1.27); sign.rotation.x = -0.06;
  g.add(sign);
  add(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 10), wood, 0, 0.25 + 0.22, -0.15);
  // the bulb under the roof
  bulbMat ??= new THREE.MeshStandardMaterial({ color: '#fff6e0', emissive: '#ffd58a', emissiveIntensity: 0.05 });
  const bulb = add(new THREE.SphereGeometry(0.07, 10, 8), bulbMat, 0, 0.25 + H - 0.05, D / 2 + 0.4); bulb.castShadow = false;
  add(new THREE.CylinderGeometry(0.005, 0.005, 0.3, 4), dark, 0, 0.25 + H + 0.1, D / 2 + 0.4);
  consolidate(g);
  return g;
}

export function buildShops(scene) {
  const R = rng(7331), shops = [];
  for (const S of layout.shops ?? []) {
    const g = buildShop(S, R);
    g.position.set(S.x, heightAt(S.x, S.z) - 0.05, S.z);
    g.rotation.y = S.rot;
    scene.add(g);
    cullBeyond(g, 420);
    // the shopkeeper on his stool behind the counter, and a customer who comes and goes
    const keeper = new Person(R() < 0.6
      ? { dress: 'kurta', top: ['#f4f2ec', '#e9dcc3', '#c9d8e8'][Math.floor(R() * 3)], bottom: '#f4f1e8', skin: '#7a4c33', mustache: true, headwear: R() < 0.4 ? 'cap' : undefined, turban: '#f2efe6' }
      : { dress: 'saree', top: '#2e8b57', bottom: '#f2b705', veil: false, skin: '#80523a' });
    keeper.noHit = true; keeper.seatH = 0.5;
    scene.add(keeper.root);
    const cust = new Person(R() < 0.5
      ? { dress: 'saree', k: 0.92, top: ['#c4241c', '#7a2b6e', '#1e6fa8'][Math.floor(R() * 3)], bottom: '#f2b705', veil: true, skin: '#86573b' }
      : { dress: 'dhoti', top: '#dfe6ea', bottom: '#f4f1e8', skin: '#6e4530', headwear: 'turban', turban: '#e07a1e', mustache: true });
    scene.add(cust.root);
    const fx = Math.sin(S.rot), fz = Math.cos(S.rot);
    const front = { x: S.x + fx * 2.25, z: S.z + fz * 2.25 }, away = { x: S.x + fx * 14 + fz * 6, z: S.z + fz * 14 - fx * 6 };
    shops.push({ S, keeper, cust, front, away, t: R() * 40, state: 'away', cx: away.x, cz: away.z, face: 0 });
  }
  let night = false;
  return {
    shops,
    setNight(n) { night = n; if (bulbMat) bulbMat.emissiveIntensity = n ? 3.2 : 0.05; },
    update(dt, player) {
      for (const s of shops) {
        const d = Math.hypot(player.x - s.S.x, player.z - s.S.z), vis = d < 160;
        s.keeper.root.visible = vis; s.cust.root.visible = vis && !(night && s.state === 'away');
        if (!vis) continue;
        // the keeper: sitting just behind the counter, facing out, looking about
        const kx = s.S.x - Math.sin(s.S.rot) * 0.15, kz = s.S.z - Math.cos(s.S.rot) * 0.15;
        s.keeper.root.position.set(kx, heightAt(s.S.x, s.S.z) + 0.2, kz);
        s.keeper.root.rotation.y = s.S.rot;
        s.keeper.update(dt, 0, 'sit');
        // the customer: walks up, stands at the counter a while, walks off again
        s.t -= dt;
        const goal = s.state === 'come' || s.state === 'buy' ? s.front : s.away;
        const dx = goal.x - s.cx, dz = goal.z - s.cz, dd = Math.hypot(dx, dz);
        let speed = 0;
        if (dd > 0.2) { speed = 1.1; const k = Math.min(1, (speed * dt) / dd); s.cx += dx * k; s.cz += dz * k; s.face = Math.atan2(dx, dz); }
        else if (s.state === 'come') { s.state = 'buy'; s.t = 8 + Math.random() * 8; s.face = s.S.rot + Math.PI; }
        if (s.state === 'buy' && s.t <= 0) s.state = 'leave';
        if (s.state === 'leave' && dd <= 0.2) { s.state = 'away'; s.t = 20 + Math.random() * 40; }
        if (s.state === 'away' && s.t <= 0 && !night) s.state = 'come';
        s.cust.root.position.set(s.cx, groundHeight(s.cx, s.cz), s.cz);
        s.cust.root.rotation.y = s.face;
        s.cust.update(dt, speed, 'idle');
      }
    },
  };
}
