// The map: a north-up minimap in the corner (click to collapse) and a full map on Tab, both drawn from
// a painted picture of the whole area baked once at load, with places, rides and the boy marked on it.
import {
  heightAt, riverDist, fieldType, dirtMask, trackDist, layout, WATER_Y, RIVER_HALF, PLAY_RADIUS,
  WILD, STATION, TRACK3, NEW_VILLAGES, SQUARE, TEA, GHAT, WF, FOOT, EH, NV, SCHOOL, GARDEN, MARKET, CRICKET, PUMP, TANK, CROSSING, HILLTOP, TRACKS, JUNGLE_HOMES, RING_SIGHTS, tribDist, TRIB, riverX, RBRIDGE, BRIDGES, desertMask, NP, MP, PEAK,
} from './world.js';

const E = 2960; // half extent of the map, metres (out past the edge of the land)
const N = 2560; // baked image size, px (must match BAKE.map in bakers.js)
const toU = (x) => ((x + E) / (2 * E)) * N;
const toV = (z) => ((z + E) / (2 * E)) * N; // north (-z) at the top

const FIELD_COL = [null, [214, 184, 52], [124, 156, 64], [96, 150, 128], [70, 112, 50], [218, 170, 40], [136, 94, 60]];

// the painted picture of the whole area: the ground (baked in workers, see bakers.js), then trees, houses
// and the railway drawn over it
function bake(pixels) {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.putImageData(new ImageData(pixels, N, N), 0, 0);
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
    const q = {};
    for (const [a, b] of T.segs) for (let t = a; t <= b + 0.1; t += 5) { T.path.at(Math.min(t, b), q); const u = toU(q.x), v = toV(q.z); if (t === a) g.moveTo(u, v); else g.lineTo(u, v); }
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
    ['Tiger country', WILD.tiger, '🐅', 1], ['Wolf hills', WILD.wolf, '🐺', 1], ['Elephant forest', WILD.elephant, '🐘', 1], ...WILD.leopards.map((l) => ['Leopard rocks', l, '🐆', 1]), ...WILD.deer.map((d) => ['Deer meadow', d, '🦌', 0]), ...[...new Map(TRACKS.flatMap((T) => T.halts.filter((h) => !h.noStation && !h.island).map((h) => [h.name, [h.big ? `${h.name} station` : h.name, h.yard ?? h, '🚉', h.big || h.W ? 1 : 0]]))).values()], ...NEW_VILLAGES.map((v) => [v.name, v, v.icon ?? '🌾', 1]), ...(layout.tribGhat ? [['Choti Nadi ghat', layout.tribGhat, '🏞', 0]] : []), ['Pahadi Gaon', L.pg, '🏔', 1], ['Jungle', JUNGLE_HOMES.monkeys, '🦁', 1], ['Rhino hills', JUNGLE_HOMES.rhinos, '🦏', 1], ['Viaduct', RING_SIGHTS.dip, '🌉', 0], ['Ring tunnel', RING_SIGHTS.hill, '⛰', 0],
    ['Noorpur', NP, '🕌', 1], ['Kabristan', NP.kab, '⚱', 0], ['Mariapur', MP, '⛪', 1], ['Cemetery', MP.cem, '✝', 0], ['Shikhar summit', PEAK, '🗻', 1],
    ...(L.busStops || []).map((b) => ['', b, '🚏', 0]),
    ['Crocodiles', { x: riverX(380) + 18, z: 380 }, '🐊', 1], ['Crocodiles', { x: riverX(-400) + 18, z: -400 }, '🐊', 1],
    ['Mustard', { x: -77, z: -5 }, '', 0], ['Wheat', { x: 37, z: -56 }, '', 0], ['Rice paddies', { x: 140, z: -56 }, '', 0],
    ['Sugarcane', { x: -175, z: -30 }, '', 0], ['Sunflowers', { x: -93, z: 95 }, '', 0], ['Tractor field', { x: -47, z: -182 }, '🚜', 0],
  ];
  return P.filter((p) => p[1]).map(([name, o, icon, big]) => ({ name, x: o.x, z: o.z, icon, big }));
}
const RIDE_ICON = { bicycle: '🚲', moped: '🏍', scooter: '🛵', auto: '🛺', car: '🚗', boat: '🛶', minibus: '🚌', erick: '🛺', bus: '🚌', jeep: '🚙', plane: '✈️', heli: '🚁' };

// live trains: the chain of coaches in the train's own colours, an engine badge, and on the big map a label
// with its name, speed and where it's standing or heading
function drawTrain(g, t, toPx, s, label) {
  const pts = t.cars.map((c) => toPx(c.x, c.z));
  if (!pts.length) return;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(20,16,12,0.85)'; g.lineWidth = s * 2 + 3;
  g.beginPath(); pts.forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v))); g.stroke();
  g.strokeStyle = t.color; g.lineWidth = s * 2;
  g.beginPath(); pts.forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v))); g.stroke();
  // the engine at the front
  const [hu, hv] = toPx(t.head.x, t.head.z), r = s + 5;
  g.fillStyle = t.driven ? '#ffb22e' : '#fff6e0'; g.strokeStyle = t.color; g.lineWidth = 2.5;
  g.beginPath(); g.arc(hu, hv, r, 0, 7); g.fill(); g.stroke();
  g.font = `${Math.round(r * 1.25)}px system-ui, "Apple Color Emoji", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('🚂', hu, hv + 0.5);
  if (!label) return;
  const line1 = t.name.split(' — ')[0], line2 = t.at ? `at ${t.at}` : `${Math.round(Math.abs(t.v) * 3.6)} km/h${t.next ? ' → ' + t.next : ''}`;
  g.font = '600 11px Inter, sans-serif';
  const w = Math.max(g.measureText(line1).width, g.measureText(line2).width) + 12;
  // the label sits to the right of the engine, or to the left when that would run off the map
  const bx = hu + r + 4 + w > g.canvas.width - 4 ? hu - r - 4 - w : hu + r + 4, by = Math.max(4, hv - 15);
  g.fillStyle = 'rgba(20,16,12,0.78)'; g.beginPath(); g.roundRect ? g.roundRect(bx, by, w, 30, 6) : g.rect(bx, by, w, 30); g.fill();
  g.fillStyle = t.color; g.fillRect(bx, by + 4, 3, 22);
  g.textAlign = 'left'; g.fillStyle = '#fff6e0'; g.fillText(line1, bx + 8, by + 9);
  g.font = '500 10px Inter, sans-serif'; g.fillStyle = 'rgba(255,246,224,0.8)'; g.fillText(line2, bx + 8, by + 22);
}

export class MapUI {
  // pixels: a promise of the baked ground; the map fills in when it arrives (the game doesn't wait for it)
  constructor(pixels) {
    this.img = null;
    Promise.resolve(pixels).then((px) => { this.img = bake(px); });
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
    // the big map's view: how far in it's zoomed (1 = the whole land fits) and the world point at its middle
    this.view = { zoom: 1, cx: 0, cz: 0 };
    this.player = { x: 0, z: 0 };
    this.initPanZoom();
  }
  // ---- zoom and drag on the big map ----
  // canvas pixels per metre at the current zoom
  pxPerM() { return (this.big.width / (2 * E)) * this.view.zoom; }
  // keep the view on the land: at zoom z you can move the middle up to E·(1 − 1/z) from the centre
  clampView() {
    const V = this.view, lim = E * (1 - 1 / V.zoom);
    V.cx = Math.max(-lim, Math.min(lim, V.cx)); V.cz = Math.max(-lim, Math.min(lim, V.cz));
  }
  // where a mouse or touch event falls, in canvas pixels
  canvasPt(e) { const r = this.big.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * this.big.width, y: ((e.clientY - r.top) / r.height) * this.big.height }; }
  // zoom by a factor, keeping the world point under (px, py) where it is
  zoomAt(f, px = this.big.width / 2, py = this.big.height / 2) {
    const V = this.view, W = this.big.width, k0 = this.pxPerM();
    const wx = V.cx + (px - W / 2) / k0, wz = V.cz + (py - W / 2) / k0;
    V.zoom = Math.max(1, Math.min(10, V.zoom * f)); // (past 10× the painted map gets blocky)
    const k1 = this.pxPerM();
    V.cx = wx - (px - W / 2) / k1; V.cz = wz - (py - W / 2) / k1;
    this.clampView();
    this.redraw();
  }
  initPanZoom() {
    const c = this.big, pts = new Map();
    let last = null, pinch = null;
    c.addEventListener('wheel', (e) => {
      e.preventDefault(); e.stopPropagation(); // the map's, not the game camera's
      const p = this.canvasPt(e);
      this.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y); // (a trackpad pinch arrives as ctrl+wheel)
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      c.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, this.canvasPt(e));
      if (pts.size === 1) last = this.canvasPt(e);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
      c.classList.add('dragging');
    });
    c.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = this.canvasPt(e);
      pts.set(e.pointerId, p);
      if (pts.size >= 2 && pinch) {
        // two fingers: zoom about the point between them
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.d > 0) this.zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch.d = d;
        return;
      }
      if (!last) return;
      const k = this.pxPerM();
      this.view.cx -= (p.x - last.x) / k; this.view.cz -= (p.y - last.y) / k;
      last = p;
      this.clampView();
      this.redraw();
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      last = pts.size === 1 ? [...pts.values()][0] : null;
      if (!pts.size) c.classList.remove('dragging');
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('dblclick', (e) => { const p = this.canvasPt(e); this.zoomAt(2, p.x, p.y); });
    c.addEventListener('click', (e) => e.stopPropagation());
    const btn = (id, f) => document.getElementById(id).addEventListener('click', (e) => { e.stopPropagation(); f(); });
    btn('bm-in', () => this.zoomAt(1.6));
    btn('bm-out', () => this.zoomAt(1 / 1.6));
    btn('bm-me', () => { this.view.zoom = Math.max(this.view.zoom, 4); this.view.cx = this.player.x; this.view.cz = this.player.z; this.clampView(); this.redraw(); });
    btn('bm-all', () => { this.view.zoom = 1; this.view.cx = 0; this.view.cz = 0; this.redraw(); });
  }
  // draw again straight away (while dragging), from the last thing the game told us
  redraw() { if (this.open && this.last) this.drawBig(...this.last); }
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
  update(player, yaw, rides, trains = []) {
    this.player.x = player.x; this.player.z = player.z;
    if (++this.frame % 2) return;
    this.trains = trains;
    this.last = [player, yaw, rides];
    if (!this.collapsed) this.drawMini(player, yaw, rides);
    if (this.open) this.drawBig(player, yaw, rides);
  }
  drawMini(player, yaw, rides) {
    if (!this.img) return;
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
    for (const t of this.trains ?? []) {
      if (t.driven) continue; // that's the boy's own train: his arrow is on it
      const [u, v] = px(t.head.x, t.head.z);
      if (Math.hypot(u - R, v - R) > R + 60) continue;
      drawTrain(g, t, px, 2.2, false);
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
    if (!this.img) return;
    const c = this.big, g = c.getContext('2d');
    const W = c.width, V = this.view, k = this.pxPerM();
    // world (x, z) → canvas pixels in the current view
    const P = (x, z) => [W / 2 + (x - V.cx) * k, W / 2 + (z - V.cz) * k];
    const inView = (u, v, m = 40) => u > -m && u < W + m && v > -m && v < W + m;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#2a3322'; g.fillRect(0, 0, W, W);
    g.save();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const b = (N / (2 * E)); // baked px per metre
    g.translate(W / 2, W / 2); g.scale(k / b, k / b); g.translate(-toU(V.cx), -toV(V.cz));
    g.drawImage(this.img, 0, 0);
    g.restore();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // zoomed out, only the main places carry names; zoomed in, all of them do
    const showSmall = V.zoom >= 2.2;
    for (const p of this.places) {
      const [u, v] = P(p.x, p.z);
      if (!inView(u, v)) continue;
      if (!p.big && !showSmall && !p.icon) continue;
      if (p.icon) { g.font = `${p.big ? 18 : 14}px system-ui, "Apple Color Emoji", sans-serif`; g.fillText(p.icon, u, v); }
      if (!p.name || (!p.big && !showSmall)) continue;
      g.font = `${p.big ? 600 : 500} ${p.icon ? 11 : 12}px Inter, sans-serif`;
      g.lineWidth = 3; g.strokeStyle = 'rgba(20,16,12,0.75)';
      const ty = p.icon ? v + 15 : v;
      g.strokeText(p.name, u, ty);
      g.fillStyle = p.icon ? '#fff6e0' : 'rgba(255,246,224,0.8)';
      g.fillText(p.name, u, ty);
    }
    for (const r of rides) {
      if (r.ridden) continue;
      const [u, v] = P(r.x, r.z);
      if (!inView(u, v)) continue;
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(u, v, 10, 0, 7); g.fill();
      g.font = '13px system-ui, "Apple Color Emoji", sans-serif'; g.fillText(RIDE_ICON[r.name] ?? '•', u, v + 0.5);
    }
    // the trains, live
    for (const t of this.trains ?? []) drawTrain(g, t, P, 2.5 * Math.min(2, Math.sqrt(V.zoom)), true);
    // the boy, pulsing (or an arrow on the edge pointing to him when he is out of view)
    const [u, v] = P(player.x, player.z);
    if (inView(u, v, 0)) {
      const pulse = 10 + Math.sin(performance.now() * 0.006) * 3;
      g.strokeStyle = 'rgba(255,178,46,0.8)'; g.lineWidth = 2;
      g.beginPath(); g.arc(u, v, pulse + 6, 0, 7); g.stroke();
      this.arrow(g, u, v, player.facing, yaw, 11);
    } else {
      const a = Math.atan2(v - W / 2, u - W / 2), r = W / 2 - 22;
      const eu = W / 2 + Math.cos(a) * r, ev = W / 2 + Math.sin(a) * r;
      g.save(); g.translate(eu, ev); g.rotate(a);
      g.fillStyle = '#ffb22e'; g.strokeStyle = '#2a1d0c'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(12, 0); g.lineTo(-6, -8); g.lineTo(-6, 8); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    // compass + a scale bar that picks a round length for the zoom
    g.fillStyle = 'rgba(20,16,12,0.6)'; g.beginPath(); g.arc(W - 34, 34, 20, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 14px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('N', W - 34, 26);
    g.beginPath(); g.moveTo(W - 34, 30); g.lineTo(W - 39, 44); g.lineTo(W - 29, 44); g.closePath(); g.fill();
    const len = [10, 20, 50, 100, 200, 500, 1000].find((m) => m * k >= 70) ?? 1000, bar = len * k;
    g.fillStyle = 'rgba(20,16,12,0.6)'; g.fillRect(18, W - 36, bar + 24, 22);
    g.fillStyle = '#fff'; g.fillRect(30, W - 22, bar, 3);
    g.font = '11px Inter, sans-serif'; g.textAlign = 'left'; g.fillText(len >= 1000 ? `${len / 1000} km` : `${len} m`, 30, W - 29);
    // the zoom level, small, by the compass
    if (V.zoom > 1.01) { g.textAlign = 'right'; g.fillStyle = 'rgba(255,246,224,0.75)'; g.fillText(`${V.zoom.toFixed(1)}×`, W - 60, 34); }

  }
}
