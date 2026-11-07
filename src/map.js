// The map: a north-up minimap in the corner (click to collapse) and a full map on Tab, both drawn from
// a painted picture of the whole area baked once at load, with places, rides and the boy marked on it.
import {
  heightAt, riverDist, fieldType, dirtMask, trackDist, layout, WATER_Y, RIVER_HALF, PLAY_RADIUS,
  WILD, STATION, TRACK3, SQUARE, TEA, GHAT, WF, FOOT, EH, NV, SCHOOL, GARDEN, MARKET, CRICKET, PUMP, TANK, CROSSING, HILLTOP, TRACKS, riverX, RBRIDGE, BRIDGES, desertMask, NP, MP, PEAK,
} from './world.js';

const E = 1500; // half extent of the map, metres
const N = 1700; // baked image size, px
const toU = (x) => ((x + E) / (2 * E)) * N;
const toV = (z) => ((z + E) / (2 * E)) * N; // north (-z) at the top

const FIELD_COL = [null, [214, 184, 52], [124, 156, 64], [96, 150, 128], [70, 112, 50], [218, 170, 40], [136, 94, 60]];

function bake() {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N);
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N) * 2 * E - E, z = (j / N) * 2 * E - E;
    H[j * N + i] = heightAt(x, z);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / N) * 2 * E - E, z = (j / N) * 2 * E - E;
    const h = H[j * N + i];
    let col;
    const d = Math.hypot(x, z);
    if ((riverDist(x, z) < RIVER_HALF - 0.5 && Math.abs(z) < 1000) || (layout.bv && Math.hypot(x - layout.bv.pond.x, z - layout.bv.pond.z) < layout.bv.pond.r)) col = [74, 140, 168];
    else {
      const hill = Math.min(1, Math.max(0, (h - 4) / 50));
      col = [128 - hill * 30, 160 - hill * 40, 92 - hill * 30];
      const ft = fieldType(x, z);
      if (ft) col = FIELD_COL[ft].slice();
      const dsm = desertMask(x, z);
      if (dsm > 0) col = col.map((c0, k) => c0 + ([222, 186, 130][k] - c0) * dsm);
      if (d < 820) {
        const dm = dirtMask(x, z);
        if (dm > 0.35) col = [196, 160, 112];
      }
      if (trackDist(x, z) < 2.2) col = [92, 86, 80];
      if (riverDist(x, z) < RIVER_HALF + 3) col = [214, 196, 150];
      // hill shading from the height slope, light from the north-west
      const hx = H[j * N + Math.min(N - 1, i + 1)] - H[j * N + Math.max(0, i - 1)];
      const hz = H[Math.min(N - 1, j + 1) * N + i] - H[Math.max(0, j - 1) * N + i];
      const sh = Math.max(0.6, Math.min(1.35, 1 - (hx + hz) * 0.18));
      col = col.map((v) => v * sh);
    }
    if (d > PLAY_RADIUS) col = col.map((v) => v * 0.55);
    const k = (j * N + i) * 4;
    img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // trees, houses
  g.fillStyle = 'rgba(40, 80, 36, 0.75)';
  for (const t of [...layout.trees, ...layout.palms]) { g.beginPath(); g.arc(toU(t.x), toV(t.z), 1.3 * (t.s ?? 1), 0, 7); g.fill(); }
  for (const h of layout.houses) {
    g.save(); g.translate(toU(h.x), toV(h.z)); g.rotate(-h.rot);
    g.fillStyle = h.type === 'round' ? '#a0603a' : '#8a3f24';
    if (h.type === 'round') { g.beginPath(); g.arc(0, 0, 2.2, 0, 7); g.fill(); } else g.fillRect(-3, -2.4, 6, 4.8);
    g.restore();
  }
  // railway lines with sleepers
  for (const T of TRACKS) {
    g.strokeStyle = '#3a3532'; g.lineWidth = 1.6; g.beginPath();
    for (const [a, b] of T.segs) for (let x = a; x <= b; x += 4) { const u = toU(x), v = toV(T.z(x)); if (x === a) g.moveTo(u, v); else g.lineTo(u, v); }
    g.stroke();
    g.setLineDash([1, 3]); g.strokeStyle = '#e6dccb'; g.lineWidth = 0.8; g.stroke(); g.setLineDash([]);
  }
  // play-area edge
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.setLineDash([6, 6]);
  g.beginPath(); g.arc(toU(0), toV(0), (PLAY_RADIUS / (2 * E)) * N, 0, 7); g.stroke(); g.setLineDash([]);
  return c;
}

// places worth naming, with an emoji marker; big = shown on the minimap too
function places() {
  const L = layout;
  const P = [
    ['Gaon', SQUARE, '🏡', 1], ['Temple', L.temple, '🛕', 1], ['Well', L.well, '◍', 0], ['Chai stall', TEA, '☕', 1], ['Banyan', L.banyan, '🌳', 0],
    ['Ghat', GHAT, '⛰', 0], ['Waterfall', { x: WF.lipX, z: WF.z }, '💧', 1], ['Footbridge', FOOT, '⌇', 0], ['Paar gaon', EH, '🏘', 1],
    ['Chhota Gaon', NV, '🏘', 1], ['Post office', L.postOffice, '✉', 1], ['Hospital', L.hospital, '✚', 1],
    ['School', SCHOOL, '🏫', 1], ['Flower garden', GARDEN, '🌸', 1], ['Market', MARKET, '🛒', 1], ['Cricket', CRICKET, '🏏', 1],
    ['Hand pump', PUMP, '⛲', 0], ['Water tank', TANK, '◉', 0], ['Railway crossing', CROSSING, '🚧', 1], ['Hilltop shrine', HILLTOP, '⛩', 1],
    ['Donkeys', L.donkeys, '🫏', 0], ['Gaon ka mela', L.mela, '🎡', 1], ['Building site', L.build, '🧱', 0], ['Kite meadow', L.kites, '🪁', 0], ['Airstrip', L.airstrip, '🛩', 1], ['Charagah (herds)', L.pasture, '🐑', 1],
    ['Marudhar', L.rv, '🐪', 1], ...BRIDGES.map((b) => ['Road bridge', b, '🌉', 0]),
    ['Banglagram', L.bv, '🪷', 1], ['Thennoor', L.tv, '🛕', 1], ['Pond', L.bv?.pond, '', 0],
    ['Vitthalwadi', L.mh, '🪔', 1], ['Bamboo hill', L.ne, '🎋', 1], ['Tea garden', L.ne && { x: (L.ne.tea.x0 + L.ne.tea.x1) / 2, z: (L.ne.tea.z0 + L.ne.tea.z1) / 2 }, '🍃', 0],
    ['Tiger country', WILD.tiger, '🐅', 1], ['Wolf hills', WILD.wolf, '🐺', 1], ['Elephant forest', WILD.elephant, '🐘', 1], ...WILD.leopards.map((l) => ['Leopard rocks', l, '🐆', 1]), ...WILD.deer.map((d) => ['Deer meadow', d, '🦌', 0]), ['Sonpur station', STATION, '🚉', 1], ['Noorpur Junction', { x: TRACK3.halts[0].x, z: TRACK3.z(TRACK3.halts[0].x) }, '🚉', 1], ['Mariapur halt', { x: TRACK3.halts[1].x, z: TRACK3.z(TRACK3.halts[1].x) }, '🚉', 0], ['Pahadi Gaon', L.pg, '🏔', 1],
    ['Noorpur', NP, '🕌', 1], ['Kabristan', NP.kab, '⚱', 0], ['Mariapur', MP, '⛪', 1], ['Cemetery', MP.cem, '✝', 0], ['Shikhar summit', PEAK, '🗻', 1],
    ...(L.busStops || []).map((b) => ['', b, '🚏', 0]),
    ['Crocodiles', { x: riverX(380) + 18, z: 380 }, '🐊', 1], ['Crocodiles', { x: riverX(-400) + 18, z: -400 }, '🐊', 1],
    ['Mustard', { x: -77, z: -5 }, '', 0], ['Wheat', { x: 37, z: -56 }, '', 0], ['Rice paddies', { x: 140, z: -56 }, '', 0],
    ['Sugarcane', { x: -175, z: -30 }, '', 0], ['Sunflowers', { x: -93, z: 95 }, '', 0], ['Tractor field', { x: -47, z: -182 }, '🚜', 0],
  ];
  return P.filter((p) => p[1]).map(([name, o, icon, big]) => ({ name, x: o.x, z: o.z, icon, big }));
}
const RIDE_ICON = { bicycle: '🚲', moped: '🏍', scooter: '🛵', auto: '🛺', car: '🚗', boat: '🛶', minibus: '🚌', erick: '🛺', bus: '🚌', jeep: '🚙', plane: '✈️', heli: '🚁' };

export class MapUI {
  constructor() {
    this.img = bake();
    this.places = places();
    this.mini = document.getElementById('mm-canvas');
    this.big = document.getElementById('bm-canvas');
    this.wrap = document.getElementById('minimap');
    this.overlay = document.getElementById('bigmap');
    this.collapsed = false;
    this.open = false;
    this.frame = 0;
    document.getElementById('mm-toggle').addEventListener('click', (e) => { e.stopPropagation(); this.toggleCollapse(); });
    this.mini.addEventListener('click', (e) => { e.stopPropagation(); this.toggleBig(); });
    document.getElementById('bm-close').addEventListener('click', (e) => { e.stopPropagation(); this.toggleBig(false); });
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.toggleBig(false); });
  }
  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.wrap.classList.toggle('collapsed', this.collapsed);
  }
  toggleBig(v = !this.open) {
    this.open = v;
    this.overlay.classList.toggle('show', v);
    if (v && document.pointerLockElement) document.exitPointerLock();
  }
  // draws the boy's arrow (with a soft view cone toward where the camera looks)
  arrow(g, u, v, facing, yaw, s) {
    g.save();
    g.translate(u, v);
    g.rotate(Math.PI - (yaw + Math.PI));
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, s * 4.5);
    grd.addColorStop(0, 'rgba(255,240,200,0.45)'); grd.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s * 4.5, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); g.closePath(); g.fill();
    g.restore();
    g.save();
    g.translate(u, v);
    g.rotate(Math.PI - facing);
    g.fillStyle = '#ffb22e'; g.strokeStyle = '#2a1d0c'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.7, s * 0.8); g.lineTo(0, s * 0.35); g.lineTo(-s * 0.7, s * 0.8); g.closePath();
    g.fill(); g.stroke();
    g.restore();
  }
  update(player, yaw, rides) {
    if (++this.frame % 2) return;
    if (!this.collapsed) this.drawMini(player, yaw, rides);
    if (this.open) this.drawBig(player, yaw, rides);
  }
  drawMini(player, yaw, rides) {
    const c = this.mini, g = c.getContext('2d');
    const W = c.width, R = W / 2;
    const span = 150; // metres from centre to edge
    const scale = (W / 2) / ((span / (2 * E)) * N); // canvas px per baked px
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(R, R, R - 2, 0, 7); g.clip();
    g.fillStyle = '#3a4a2e'; g.fillRect(0, 0, W, W);
    const u0 = toU(player.x), v0 = toV(player.z);
    g.translate(R, R); g.scale(scale, scale); g.translate(-u0, -v0);
    g.drawImage(this.img, 0, 0);
    g.restore();
    g.save();
    g.beginPath(); g.arc(R, R, R - 2, 0, 7); g.clip();
    const px = (wx, wz) => [R + (toU(wx) - u0) * scale, R + (toV(wz) - v0) * scale];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of this.places) {
      if (!p.icon) continue;
      const [u, v] = px(p.x, p.z);
      if (Math.hypot(u - R, v - R) > R - 8) continue;
      g.font = '13px system-ui, "Apple Color Emoji", sans-serif';
      g.fillText(p.icon, u, v);
    }
    for (const r of rides) {
      if (r.ridden) continue;
      const [u, v] = px(r.x, r.z);
      if (Math.hypot(u - R, v - R) > R - 8) continue;
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(u, v, 8, 0, 7); g.fill();
      g.font = '11px system-ui, "Apple Color Emoji", sans-serif'; g.fillText(RIDE_ICON[r.name], u, v + 0.5);
    }
    this.arrow(g, R, R, player.facing, yaw, 8);
    g.restore();
    // rim and compass
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    g.beginPath(); g.arc(R, R, R - 2, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 11px Inter, sans-serif'; g.textAlign = 'center';
    g.fillText('N', R, 11);
  }
  drawBig(player, yaw, rides) {
    const c = this.big, g = c.getContext('2d');
    const W = c.width, s = W / N;
    g.clearRect(0, 0, W, W);
    g.drawImage(this.img, 0, 0, W, W);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of this.places) {
      const u = toU(p.x) * s, v = toV(p.z) * s;
      if (p.icon) { g.font = `${p.big ? 18 : 14}px system-ui, "Apple Color Emoji", sans-serif`; g.fillText(p.icon, u, v); }
      g.font = `${p.big ? 600 : 500} ${p.icon ? 11 : 12}px Inter, sans-serif`;
      g.lineWidth = 3; g.strokeStyle = 'rgba(20,16,12,0.75)';
      const ty = p.icon ? v + 15 : v;
      g.strokeText(p.name, u, ty);
      g.fillStyle = p.icon ? '#fff6e0' : 'rgba(255,246,224,0.8)';
      g.fillText(p.name, u, ty);
    }
    for (const r of rides) {
      if (r.ridden) continue;
      const u = toU(r.x) * s, v = toV(r.z) * s;
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(u, v, 10, 0, 7); g.fill();
      g.font = '13px system-ui, "Apple Color Emoji", sans-serif'; g.fillText(RIDE_ICON[r.name], u, v + 0.5);
    }
    // the boy, pulsing
    const u = toU(player.x) * s, v = toV(player.z) * s;
    const pulse = 10 + Math.sin(performance.now() * 0.006) * 3;
    g.strokeStyle = 'rgba(255,178,46,0.8)'; g.lineWidth = 2;
    g.beginPath(); g.arc(u, v, pulse + 6, 0, 7); g.stroke();
    this.arrow(g, u, v, player.facing, yaw, 11);
    // compass + scale bar
    g.fillStyle = 'rgba(20,16,12,0.6)'; g.beginPath(); g.arc(W - 34, 34, 20, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 14px Inter, sans-serif'; g.fillText('N', W - 34, 26);
    g.beginPath(); g.moveTo(W - 34, 30); g.lineTo(W - 39, 44); g.lineTo(W - 29, 44); g.closePath(); g.fill();
    const m100 = (100 / (2 * E)) * W;
    g.fillStyle = 'rgba(20,16,12,0.6)'; g.fillRect(18, W - 36, m100 + 24, 22);
    g.fillStyle = '#fff'; g.fillRect(30, W - 22, m100, 3);
    g.font = '11px Inter, sans-serif'; g.textAlign = 'left'; g.fillText('100 m', 30, W - 29);
  }
}
