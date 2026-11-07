// World definition: terrain height, river, railway, paths, and the deterministic village layout.
import { fbm, noise2, rng, smoothstep, lerp } from './noise.js';

export const INNER_HALF = 1120; // detailed terrain half-size (m)
export const OUTER_HALF = 3200; // far hills / mountains
export const MID_HALF = 1640; // a mid-detail ring round the inner terrain
export const DATA_HALF = 1120; // grass data texture half-size (m)
export const WATER_Y = -0.4;
// the season can lower the river (summer): physics and swimmers use WATER_Y + WATER.off
export const WATER = { off: 0 };
export const RIVER_HALF = 10;
export const SQUARE = { x: -2, z: 2, r: 12 };
export const PLAY_RADIUS = 1480;
export const TRACK_Y = 1.3;

export const riverX = (z) => 72 + 22 * Math.sin(z * 0.011) + 8 * Math.sin(z * 0.027 + 1.3);
export const riverSlope = (z) => 22 * 0.011 * Math.cos(z * 0.011) + 8 * 0.027 * Math.cos(z * 0.027 + 1.3);
export const roadX = (z) => -2 + 5 * Math.sin(z * 0.018);
export const pathZ = (x) => 3 + 4 * Math.sin(x * 0.05 + 0.5);
export const riverDist = (x, z) => Math.abs(x - riverX(z));
// The world was spread out: the home village stays as it was, but everything beyond ~240 m now sits further
// away, so there's more open country between villages. warp() maps the old positions to the new ones.
const W_R0 = 240, W_K = 1.55;
export const warpR = (r) => (r <= W_R0 ? r : W_R0 + (r - W_R0) * W_K);
export function warp(x, z) { const r = Math.hypot(x, z); if (r <= W_R0) return { x, z }; const f = warpR(r) / r; return { x: x * f, z: z * f }; }
export const trackZ = (x) => -118 + 12 * Math.sin(x * 0.006 + 0.4);
export const trackSlope = (x) => 12 * 0.006 * Math.cos(x * 0.006 + 0.4);
// a second line: runs alongside the first (7 m south) past the village, then curves away south into its own tunnels
const ss01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const off2 = (x) => 7.5 + 62 * ss01(110, 470, x) + 34 * ss01(110, 470, -x);
export const trackZ2 = (x) => trackZ(x) - off2(x);
export const trackSlope2 = (x) => (trackZ2(x + 0.5) - trackZ2(x - 0.5));

export const EH = { x: riverX(80) + 45, z: 80 }; // east hamlet across the river
export const HILLTOP = { x: roadX(-warpR(470)), z: -warpR(470) };
// Chhota Gaon: a smaller village up the road to the north-west, with a post office and a little hospital
export const NV = { x: -172, z: 178 };
// the school by the road north of the village, facing the road (front = -x)
export const SCHOOL = { x: 50, z: 118, rot: -Math.PI / 2 };
// a walled flower garden west of the road
export const GARDEN = { x: -40, z: 84, hw: 9, hd: 7 };
// fields: [type, x0, x1, z0, z1]   1 mustard, 2 wheat, 3 rice paddy, 4 sugarcane, 5 sunflower, 6 ploughed (tractor)
export const FIELDS = [
  [1, -112, -42, -58, 48], [2, 20, 54, -88, -24], [3, 110, 170, -90, -22], [4, -210, -140, -70, 10],
  [5, -125, -62, 66, 124], [6, -78, -16, -215, -150],
];
export const PADDY_Y = 0.55;
// the weekly haat: two rows of stalls facing a lane that runs east off the road
export const MARKET = { x: 24, z: 88, x0: 8, x1: 38 };
MARKET.stalls = [];
for (const [i, x] of [13, 18.5, 24, 29.5, 35].entries()) {
  MARKET.stalls.push({ x, z: MARKET.z + 4.2, rot: Math.PI, i: i * 2 }, { x: x + 1.5, z: MARKET.z - 4.2, rot: 0, i: i * 2 + 1 });
}
// Marudhar: a Rajasthani desert village east of the river, reached by a road over a new bridge
export const RV = warp(305, 150);
export const RBRIDGE = { z: 150 };
RBRIDGE.x = riverX(RBRIDGE.z);
RBRIDGE.rot = Math.atan(riverSlope(RBRIDGE.z));
export const desertMask = (x, z) => 1 - smoothstep(55, 95, Math.hypot(x - RV.x, z - RV.z));
// two more bridges, and two more villages across the river: Banglagram (Bengal) and Thennoor (Tamil Nadu)
const mkBridge = (z) => ({ z, x: riverX(z), rot: Math.atan(riverSlope(z)) });
export const BRIDGES = [RBRIDGE, mkBridge(-215), mkBridge(298)];
export const BV = warp(235, -238); // Bengal
export const TV = warp(205, 345); // Tamil
BV.pond = { x: BV.x + 2, z: BV.z + 22, r: 9 };
export const MH = { ...warp(-480, -60) }; MH.z += 40; // Maharashtra (moved a little north, clear of the station valley)
export const PG = warp(-40, 560); // Pahadi Gaon: a hill village of stone and slate
export const ROCKY = [[-40, -690, 75], [-330, -300, 60], [180, 455, 70], [-420, 255, 50], [430, -150, 60], [-90, 650, 55], [470, 420, 55], [-560, -260, 60]].map(([x, z, r]) => { const p = warp(x, z); return [p.x, p.z, r * 1.2]; });
export const NE = warp(235, -530); // the North-East (Assam)
export const NP = warp(640, -20); // Noorpur: a Muslim village with a masjid and a kabristan
export const MP = warp(-330, 585); // Mariapur: a Christian village with a church and a cemetery
export const PEAK = warp(-40, -690); // Shikhar: the highest mountain around, a shrine on its summit
// the wild places, spread out with the rest
export const WILD = {
  tiger: { ...warp(-300, -335), r: 30, area: 70 }, wolf: { ...warp(345, 300), r: 35, area: 75 }, elephant: { ...warp(-425, 140), r: 40, area: 85 },
  leopards: [{ ...warp(180, 455), r: 35, area: 45 }, { ...warp(430, -150), r: 35, area: 45 }],
  deer: [warp(-200, -470), warp(360, 420)],
};
// the railway station in its own valley beyond the western tunnel, and the Noorpur–Mariapur line's halts
export const STATION = { x: -770, z: 0, name: 'Sonpur', hi: 'सोनपुर' };
NE.tea = { x0: NE.x - 70, x1: NE.x - 22, z0: NE.z - 40, z1: NE.z + 30 };
// a hand pump (chapakal) on a little concrete apron, and the overhead water tank
export const PUMP = { x: 8, z: 47, rot: -0.4 };
export const TANK = { x: -30, z: -66 };
// an open patch where the village kids play cricket
export const CRICKET = { x: -24, z: 48, rot: 0.3 };
// the little chai stall by the road, facing the road (local +z points west, toward the road)
export const TEA = { z: -20, rot: -Math.PI / 2 };
TEA.x = roadX(TEA.z) + 5.8;
// a small boulder waterfall on the west bank, south of the ghat; pool drains east into the river
export const WF = { z: -10 };
WF.x = riverX(WF.z) - RIVER_HALF - 8.5;
WF.lipX = WF.x - 2.7;
export function waterfallMask(x, z) {
  const dp = Math.hypot(x - WF.x, z - WF.z);
  let m = 1 - smoothstep(2.6, 3.6, dp); // pool
  const dr = Math.hypot((x - (WF.lipX - 2.8)) * 0.8, z - WF.z);
  m = Math.max(m, 1 - smoothstep(4.2, 6.2, dr)); // rocks
  const rx = riverX(z) - RIVER_HALF;
  if (x > WF.x && x < rx + 1) m = Math.max(m, 1 - smoothstep(0.6, 1.4, Math.abs(z - WF.z))); // outflow stream
  return m;
}
export const FOOT = { z: 56 };
FOOT.x = riverX(FOOT.z);
FOOT.rot = Math.atan(riverSlope(FOOT.z));

const rotPt = (o, lx, lz) => {
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
};
export const localToWorld = rotPt;

// a smooth line through knots (x ascending): cubic Hermite with Catmull-Rom slopes
function knotLine(K) {
  const m = K.map((k, i) => { const a = K[Math.max(0, i - 1)], b = K[Math.min(K.length - 1, i + 1)]; return (b[1] - a[1]) / (b[0] - a[0]); });
  const f = (x) => {
    if (x <= K[0][0]) return K[0][1] + (x - K[0][0]) * m[0];
    const n = K.length - 1;
    if (x >= K[n][0]) return K[n][1] + (x - K[n][0]) * m[n];
    let i = 0; while (x > K[i + 1][0]) i++;
    const h = K[i + 1][0] - K[i][0], t = (x - K[i][0]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * K[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * K[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
  return f;
}
// The station railway: two lines that meet at Noorpur Junction. The main line runs from Sonpur (its western
// terminus, in the valley past the village) through the village and over the river to the junction; the
// Mariapur line runs from the junction round the west of Noorpur, across the plain and the river to Mariapur.
// Both run in the open the whole way — the hills along them are lowered into wide valleys — and end at
// buffer stops beyond their last platforms.
export const XJ = 900; // Noorpur Junction
const K3 = knotLine([[-1150, 760], [-760, 750], [-447, 735], [-250, 610], [0, 535], [200, 385], [450, 232], [620, 118], [740, -30], [820, -100], [1000, -106]]);
// near the junction the Mariapur line runs alongside the main line, 12 m north of it
export const trackZ3 = (x) => { const k = ss01(770, 850, x); return K3(x) * (1 - k) + (trackZ(x) + 12) * k; };
export const trackSlope3 = (x) => trackZ3(x + 0.5) - trackZ3(x - 0.5);
export const LINE_MAIN = [-770 - 100, XJ + 90], LINE_3 = [-447 - 70, XJ + 90];
// how much a point is inside the open valley either station line runs along
function lineFlat(x, z, zf, [a, b], steep) {
  if (x < a - 80 || x > b + 80) return 0;
  const cx = Math.max(a, Math.min(b, x));
  let dz = Math.abs(z - zf(cx));
  if (steep) { const sl = zf(cx + 1) - zf(cx); dz /= Math.sqrt(1 + sl * sl); }
  return 1 - smoothstep(36, 78, Math.hypot(x - cx, dz));
}

// ---------- height ----------
// distance to the station valley's spine: a stretch of the main line between two x's
function segD(x, z, xa, xb) {
  const cx = Math.max(Math.min(xa, xb), Math.min(Math.max(xa, xb), x));
  return Math.hypot(x - cx, z - trackZ(cx));
}
function rawHeight(x, z) {
  const d = Math.hypot(x, z);
  let h = fbm(x * 0.006, z * 0.006, 4) * 4 + fbm(x * 0.03 + 7, z * 0.03 - 3, 2) * 0.6;
  const hill = smoothstep(400, 720, d);
  h += hill * (0.55 + 0.45 * fbm(x * 0.009 + 11, z * 0.009 + 5, 3)) * 55;
  h += smoothstep(1520, 2250, d) * (0.6 + 0.4 * fbm(x * 0.0025 + 3, z * 0.0025, 3)) * 160;
  // the big mountain: a broad cone with craggy flanks
  { const dp2 = (x - PEAK.x) ** 2 + (z - PEAK.z) ** 2; h += Math.exp(-dp2 / (2 * 105 * 105)) * (140 + fbm(x * 0.02, z * 0.02, 3) * 10 * Math.min(1, Math.sqrt(dp2) / 40)); }
  const flat = Math.max(1 - smoothstep(160, 360, d), 1 - smoothstep(25, 55, Math.hypot(x - EH.x, z - EH.z)), 1 - smoothstep(35, 70, Math.hypot(x - NV.x, z - NV.z)), 1 - smoothstep(55, 105, Math.hypot(x - RV.x, z - RV.z)),
    1 - smoothstep(60, 110, Math.hypot(x - BV.x, z - BV.z)), 1 - smoothstep(60, 110, Math.hypot(x - TV.x, z - TV.z)),
    1 - smoothstep(65, 120, Math.hypot(x - MH.x, z - MH.z)), (1 - smoothstep(30, 70, Math.hypot(x - NE.x, z - NE.z))) * 0.9,
    (1 - smoothstep(35, 75, Math.hypot(x - PG.x, z - PG.z))) * 0.92);
  // the station valley beyond the western tunnel
  // Noorpur and Mariapur sit in broad, low valleys now rather than up on the hills
  const valley = Math.max(1 - smoothstep(90, 260, Math.hypot(x - NP.x, z - NP.z)), 1 - smoothstep(90, 260, Math.hypot(x - MP.x, z - MP.z)));
  const sv = 1 - smoothstep(60, 125, segD(x, z, -610, -880));
  const cor = Math.max(lineFlat(x, z, trackZ, LINE_MAIN, false), lineFlat(x, z, trackZ3, LINE_3, true));
  h = lerp(h, 0.35 + fbm(x * 0.03, z * 0.03, 2) * 0.35, Math.max(flat * 0.85, valley * 0.97, sv * 0.98, cor * 0.97));
  // a wooded ridge over the old Mail line west of the village: its train still vanishes into a tunnel there
  h += 30 * Math.exp(-(((x + 525) / 34) ** 2)) * (1 - smoothstep(12, 26, Math.abs(z - trackZ2(x))));
  return h;
}
const HILLTOP_H = rawHeight(HILLTOP.x, HILLTOP.z);
HILLTOP.y = HILLTOP_H;
export function baseHeight(x, z) {
  let h = rawHeight(x, z);
  const dt = Math.hypot(x - HILLTOP.x, z - HILLTOP.z);
  if (dt < 14) h = lerp(HILLTOP_H, h, smoothstep(6, 14, dt));
  const dp = Math.hypot(x - PEAK.x, z - PEAK.z);
  if (dp < 20) h = lerp(PEAK_H, h, smoothstep(11, 20, dp));
  return h;
}
const PEAK_H = rawHeight(PEAK.x, PEAK.z) + 0.5;
PEAK.y = PEAK_H;

// ---------- the stone stairway up the mountain ----------
// It starts at the old hilltop shrine and climbs in switchbacks to the summit. The terrain is carved to the
// stair's slope; the steps themselves are solid stone blocks whose tops are the walking surface.
export const STAIRS = (() => {
  const ux = PEAK.x - HILLTOP.x, uz = PEAK.z - HILLTOP.z, ul = Math.hypot(ux, uz);
  const dx = ux / ul, dz = uz / ul, px = -dz, pz = dx;
  const a = { x: HILLTOP.x + dx * 11, z: HILLTOP.z + dz * 11 }, b = { x: PEAK.x - dx * 12, z: PEAK.z - dz * 12 };
  const pts = [a];
  const n = 6;
  for (let i = 1; i < n; i++) {
    const t = i / n, side = i % 2 ? 1 : -1;
    pts.push({ x: a.x + (b.x - a.x) * t + px * side * 20, z: a.z + (b.z - a.z) * t + pz * side * 20 });
  }
  pts.push(b);
  const segs = [];
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const A = pts[i], B = pts[i + 1], l = Math.hypot(B.x - A.x, B.z - A.z);
    segs.push({ ax: A.x, az: A.z, bx: B.x, bz: B.z, l, s0: L, dx: (B.x - A.x) / l, dz: (B.z - A.z) / l });
    L += l;
  }
  const h0 = HILLTOP_H, h1 = PEAK_H;
  const N = Math.round((h1 - h0) / 0.19);
  const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
  return { pts, segs, L, h0, h1, N, rise: (h1 - h0) / N, run: L / N, W: 1.6, x0: Math.min(...xs) - 9, x1: Math.max(...xs) + 9, z0: Math.min(...zs) - 9, z1: Math.max(...zs) + 9 };
})();
const _st = { s: 0, d: 0 };
// nearest point on the stair line: s = distance along it, d = sideways distance
export function stairAt(x, z) {
  const S = STAIRS;
  if (x < S.x0 || x > S.x1 || z < S.z0 || z > S.z1) return null;
  let best = Infinity;
  for (const g of S.segs) {
    const t = Math.max(0, Math.min(g.l, (x - g.ax) * g.dx + (z - g.az) * g.dz));
    const qx = g.ax + g.dx * t, qz = g.az + g.dz * t;
    const d = Math.hypot(x - qx, z - qz);
    if (d < best) { best = d; _st.s = g.s0 + t; }
  }
  _st.d = best;
  return best < 9 ? _st : null;
}
export const stairLine = (s) => STAIRS.h0 + (STAIRS.h1 - STAIRS.h0) * Math.max(0, Math.min(1, s / STAIRS.L));
export const stepTop = (s) => STAIRS.h0 + STAIRS.rise * Math.min(STAIRS.N, Math.floor(Math.max(0, s) / STAIRS.run) + 1);

// Railway: walk along each line and find its open stretches; where the ground rises above the line it
// goes into a tunnel, and comes out again wherever the land drops (a valley beyond a hill)
function makeTrack(z, slope, forced = null, centralOnly = false) {
  const lim = TRACK_Y + 8, X = INNER_HALF - 30;
  const raw = [];
  if (forced) raw.push([...forced]);
  else {
  let a = null;
  for (let x = -X; x <= X; x += 0.5) {
    const o = baseHeight(x, z(x)) <= lim;
    if (o && a === null) a = x;
    else if (!o && a !== null) { raw.push([a, x - 0.5]); a = null; }
  }
  if (a !== null) raw.push([a, X]);
  }
  // little humps are cut through rather than tunnelled; slivers of open ground between tunnels are dropped
  const segs = [];
  for (const g of raw) { const last = segs[segs.length - 1]; if (last && g[0] - last[1] < 14) last[1] = g[1]; else segs.push([...g]); }
  let S = segs.filter((g) => g[1] - g[0] > 30);
  if (centralOnly) S = S.filter((g) => g[0] < 0 && g[1] > 0);
  // river crossing
  let xr = 40;
  for (let i = 0; i < 8; i++) xr = riverX(z(xr));
  const xW = S[0][0], xE = S[S.length - 1][1];
  return { segs: S, xW, xE, xr, zr: z(xr), z, slope, open: (x, m = 0) => x > xW - m && x < xE + m && S.some((g) => x > g[0] - m && x < g[1] + m) };
}
export const TRACK = makeTrack(trackZ, trackSlope, LINE_MAIN);
export const TRACK2 = makeTrack(trackZ2, trackSlope2, null, true);
export const TRACK3 = makeTrack(trackZ3, trackSlope3, LINE_3);
TRACK.termini = TRACK3.termini = true;
export const TRACKS = [TRACK, TRACK2, TRACK3];
STATION.z = trackZ(STATION.x);
// halts on the new line, on the village side of the track
// Noorpur Junction: one island platform between the two lines, built with the Mariapur line's halt
TRACK3.halts = [{ x: XJ, name: 'Noorpur Junction', hi: 'नूरपुर जंक्शन', side: -1, W: 8.5, L: 150 }, { x: -447, name: 'Mariapur', hi: 'मरियापुर', side: 1, L: 110 }];
TRACK.halts = [{ x: STATION.x, name: STATION.name, hi: STATION.hi, side: 1, big: true, L: 170 }, { x: XJ, name: 'Noorpur Junction', hi: 'नूरपुर जंक्शन', side: 1, W: 8.5, L: 150, island: true }];
TRACK2.halts = [];
// where the new line crosses the main road north of the village
export const CROSSING3 = (() => {
  let z = 535;
  for (let i = 0; i < 12; i++) z = trackZ3(roadX(z));
  return { x: roadX(z), z };
})();
// level crossing of the village road
export const CROSSING = (() => {
  let z = -118;
  for (let i = 0; i < 8; i++) z = trackZ(roadX(z));
  return { x: roadX(z), z };
})();

function trackDist1(T, x, z) {
  if (!T.open(x, 1)) return Infinity;
  return Math.abs(z - T.z(x)) / Math.sqrt(1 + T.slope(x) ** 2);
}
export function trackDist(x, z) {
  return Math.min(trackDist1(TRACK, x, z), trackDist1(TRACK2, x, z), trackDist1(TRACK3, x, z));
}

export function heightAt(x, z) {
  let h = baseHeight(x, z);
  for (const T of TRACKS) {
    const dz = Math.abs(z - T.z(x));
    if (dz < 34 && T.open(x)) {
      const fill = TRACK_Y - Math.max(0, dz - 3.5) * 0.55;
      const cut = TRACK_Y + Math.max(0, dz - 4) * 0.8;
      if (h < fill) h = fill;
      else if (h > cut) h = cut;
    }
  }
  { const st = stairAt(x, z); if (st) h = lerp(h, stairLine(st.s) - 0.15, 1 - smoothstep(2.2, 8.5, st.d)); }
  const dr = Math.abs(x - riverX(z));
  if (dr < RIVER_HALF) {
    const q = dr / RIVER_HALF;
    return WATER_Y - 0.15 - 1.9 * (1 - q * q);
  }
  const target = WATER_Y - 0.15 + (dr - RIVER_HALF) * 0.22;
  const hill = smoothstep(400, 720, Math.hypot(x, z));
  const w = 1 - smoothstep(RIVER_HALF, RIVER_HALF + 14 + hill * 30, dr);
  h = lerp(h, target, w);
  // Banglagram's pond
  { const dp = Math.hypot(x - BV.pond.x, z - BV.pond.z); if (dp < 10.5) h -= 1.4 * (1 - smoothstep(6, 10.5, dp)); }
  // the stepwell's pit in Marudhar's square
  if (Math.abs(x - RV.x) < 4.1 && Math.abs(z - RV.z) < 4.1) h -= 3.6;
  // rice paddies are levelled terraces, with raised bunds between the plots
  if (x > 108 && x < 172 && z > -92 && z < -20) {
    const e = Math.min(x - 108, 172 - x, z + 92, -20 - z);
    const lvl = PADDY_Y + (isBund(x, z) || e < 2 ? 0.28 : 0);
    h = lerp(h, lvl, smoothstep(0, 2, e));
  }
  return h;
}

// ---------- fields ----------
export function fieldType(x, z) {
  for (const f of FIELDS) if (x > f[1] && x < f[2] && z > f[3] && z < f[4]) return f[0];
  return 0;
}
export const FIELD_NAMES = ['', 'Mustard fields', 'Wheat fields', 'Rice paddies', 'Sugarcane', 'Sunflower field', 'Ploughed field'];
export function isBund(x, z) {
  const a = ((x % 17) + 17) % 17, b = ((z % 17) + 17) % 17;
  return a < 0.9 || b < 0.9;
}

// ---------- dirt (paths, lanes, square, yards) ----------
export const dirtCircles = [];
export const lanes = []; // {ax,az,bx,bz,w}
function segDist(x, z, s) {
  const vx = s.bx - s.ax, vz = s.bz - s.az;
  const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - s.ax - vx * t, z - s.az - vz * t);
}
export const laneDist = (x, z) => lanes.reduce((m, s) => Math.min(m, segDist(x, z, s)), Infinity);

// spatial buckets so baking the big terrain stays quick
let dirtGrid = null;
const DG = 16;
function buildDirtGrid() {
  dirtGrid = new Map();
  const put = (k, kind, o) => { let b = dirtGrid.get(k); if (!b) dirtGrid.set(k, (b = { c: [], l: [] })); b[kind].push(o); };
  for (const c of dirtCircles) {
    for (let i = Math.floor((c.x - c.r - 2) / DG); i <= Math.floor((c.x + c.r + 2) / DG); i++)
      for (let k = Math.floor((c.z - c.r - 2) / DG); k <= Math.floor((c.z + c.r + 2) / DG); k++) put(i + ',' + k, 'c', c);
  }
  for (const s of lanes) {
    for (let i = Math.floor((Math.min(s.ax, s.bx) - 5) / DG); i <= Math.floor((Math.max(s.ax, s.bx) + 5) / DG); i++)
      for (let k = Math.floor((Math.min(s.az, s.bz) - 5) / DG); k <= Math.floor((Math.max(s.az, s.bz) + 5) / DG); k++) put(i + ',' + k, 'l', s);
  }
}
const EMPTY = { c: [], l: [] };
export function dirtMask(x, z) {
  const j = noise2(x * 0.35, z * 0.35) * 0.5;
  let m = 0;
  const cell = dirtGrid ? dirtGrid.get(Math.floor(x / DG) + ',' + Math.floor(z / DG)) || EMPTY : { c: dirtCircles, l: lanes };
  if (z > -615 && z < 712 && Math.abs(x) < 200) {
    const d = Math.abs(x - roadX(z)) + j;
    m = Math.max(m, 1 - smoothstep(1.8, 3.0, d));
  }
  if (x > roadX(z) && x < GHAT.x + 1.5) {
    const d = Math.abs(z - pathZ(x)) + j;
    m = Math.max(m, 1 - smoothstep(1.0, 1.9, d));
  }
  for (const s of cell.l) {
    if (x < Math.min(s.ax, s.bx) - 4 || x > Math.max(s.ax, s.bx) + 4 || z < Math.min(s.az, s.bz) - 4 || z > Math.max(s.az, s.bz) + 4) continue;
    m = Math.max(m, 1 - smoothstep(s.w * 0.6, s.w, segDist(x, z, s) + j));
  }
  {
    const d = Math.hypot(x - SQUARE.x, z - SQUARE.z) + j * 2;
    m = Math.max(m, 1 - smoothstep(SQUARE.r - 3, SQUARE.r, d));
  }
  for (let i = 0; i < cell.c.length; i++) {
    const c = cell.c[i];
    const dx = x - c.x, dz = z - c.z;
    if (dx > c.r + 1 || dx < -c.r - 1 || dz > c.r + 1 || dz < -c.r - 1) continue;
    const d = Math.sqrt(dx * dx + dz * dz) + j * 1.5;
    m = Math.max(m, (1 - smoothstep(c.r * 0.55, c.r, d)) * c.s);
  }
  return m;
}

// ---------- collisions & walkable surfaces ----------
export const colliders = []; // {kind:'c',x,z,r} | {kind:'b',x,z,rot,hw,hd}
export const surfaces = []; // same shapes + top (+ optional reach: only usable from above)

function toLocal(px, pz, o) {
  const dx = px - o.x, dz = pz - o.z;
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  return [dx * c - dz * s, dx * s + dz * c];
}

export function archTop(B, lx) {
  const t = Math.max(0, Math.min(1, (lx + B.L / 2) / B.L));
  return B.h0 + (B.h1 - B.h0) * t + Math.sin(t * Math.PI) * B.rise + 0.05;
}
// fromY: current feet height. Bridges only count when you are already up near their deck.
export function groundHeight(x, z, fromY) {
  let h = heightAt(x, z);
  { const st = stairAt(x, z); if (st && st.d < STAIRS.W) h = Math.max(h, stepTop(st.s)); }
  for (const s of surfaces) {
    if (s.kind === 'arch') {
      const [lx, lz] = toLocal(x, z, s);
      if (Math.abs(lx) < s.hw && Math.abs(lz) < s.hd) {
        const top = archTop(s.B, lx);
        // in the water (swimming / rowing underneath) the deck doesn't count
        if (fromY !== undefined && fromY < WATER_Y + 0.6 && top > fromY + 1.0) continue;
        h = Math.max(h, top);
      }
      continue;
    }
    if (s.bridge && fromY !== undefined && fromY < s.top - 0.7) continue;
    if (s.kind === 'c') {
      const dx = x - s.x, dz = z - s.z;
      if (dx * dx + dz * dz < s.r * s.r) h = Math.max(h, s.top);
    } else {
      const [lx, lz] = toLocal(x, z, s);
      if (Math.abs(lx) < s.hw && Math.abs(lz) < s.hd) h = Math.max(h, s.top);
    }
  }
  return h;
}

export function pushOut(p, radius, o) {
  if (o.kind === 'c') {
    const dx = p.x - o.x, dz = p.z - o.z;
    const rr = o.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      p.x = o.x + (dx / d) * rr;
      p.z = o.z + (dz / d) * rr;
      return true;
    }
    return false;
  }
  let [lx, lz] = toLocal(p.x, p.z, o);
  const ex = o.hw + radius, ez = o.hd + radius;
  if (Math.abs(lx) < ex && Math.abs(lz) < ez) {
    const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
    if (px < pz) lx = Math.sign(lx || 1) * ex;
    else lz = Math.sign(lz || 1) * ez;
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    p.x = o.x + lx * c + lz * s;
    p.z = o.z - lx * s + lz * c;
    return true;
  }
  return false;
}
export function resolveCollisions(p, radius, y, npc = false) {
  for (const o of colliders) {
    if (y !== undefined && o.height !== undefined && y > o.height) continue;
    if (npc && o.npcPass) continue;
    if (y !== undefined && o.minY !== undefined && y < o.minY) continue;
    pushOut(p, radius, o);
  }
}

// ---------- layout ----------
const occupied = [];
const occupy = (x, z, r) => occupied.push({ x, z, r });
function isFree(x, z, r) {
  for (const o of occupied) {
    const dx = x - o.x, dz = z - o.z, rr = r + o.r;
    if (dx * dx + dz * dz < rr * rr) return false;
  }
  return true;
}

let gx = riverX(5) - RIVER_HALF - 3;
let gz = pathZ(gx);
gx = riverX(gz) - RIVER_HALF - 3;
gz = pathZ(gx);
export const GHAT = { x: gx, z: gz, rot: Math.atan(riverSlope(gz)) };

export const layout = {
  houses: [], trees: [], palms: [], bushes: [], rocks: [], haystacks: [], cows: [],
  pots: [], charpais: [], tulsis: [], woodpiles: [], banyan: null, temple: null, well: null, cart: null,
  nv: NV, school: SCHOOL, garden: GARDEN, postOffice: null, hospital: null,
  ghat: GHAT, foot: FOOT, hilltop: HILLTOP, crossing: CROSSING,
};

(function generate() {
  const R = rng(20251103);
  const addLane = (ax, az, bx, bz, w = 1.7) => {
    lanes.push({ ax, az, bx, bz, w });
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 4);
    for (let i = 0; i <= n; i++) occupy(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, w + 0.5);
  };

  // lanes
  addLane(roadX(5) - 2, 5, -44, 5); // west to the mustard fields
  addLane(roadX(-30) + 2, -30, 19, -30); // east to the wheat field
  const fW = rotPt(FOOT, -(RIVER_HALF + 6), 0), fE = rotPt(FOOT, RIVER_HALF + 6, 0);
  FOOT.w = fW; FOOT.e = fE;
  addLane(roadX(FOOT.z) + 2, FOOT.z, fW.x, fW.z); // to the footbridge
  addLane(fE.x, fE.z, EH.x - 6, EH.z - 4); // footbridge to the east hamlet
  addLane(WF.x + 2.5, pathZ(WF.x + 2.5), WF.x + 3.8, WF.z + 3.2, 1.4); // ghat path down to the waterfall pool
  // country roads beyond the villages
  const road = (pts, w = 2.6) => { for (let i = 0; i < pts.length - 1; i++) addLane(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w); };
  // west: from the main road past the sugarcane and round to Chhota Gaon
  road([[roadX(-62) - 2, -62], [-60, -64], [-130, -80], [-222, -60], [-238, 10], [-232, 95], [-206, 160], [NV.x - 14, NV.z - 2]]);
  // east: out of the village, over the new road bridge and on to Marudhar
  const rbW = rotPt(RBRIDGE, -(RIVER_HALF + 8), 0), rbE = rotPt(RBRIDGE, RIVER_HALF + 8, 0);
  RBRIDGE.w = rbW; RBRIDGE.e = rbE;
  road([[roadX(150) + 2, 150], [40, 152], [rbW.x, rbW.z]]);
  road([[rbE.x, rbE.z], [150, 158], [210, 145], [292, 167], [RV.x - 16, RV.z]]);
  // south-east: down past the crossing, over the south bridge to Banglagram
  for (const B of BRIDGES.slice(1)) { B.w = rotPt(B, -(RIVER_HALF + 8), 0); B.e = rotPt(B, RIVER_HALF + 8, 0); }
  const [, B2, B3] = BRIDGES;
  road([[roadX(-150) + 2, -150], [20, -175], [B2.w.x, B2.w.z]]);
  road([[B2.e.x, B2.e.z], [130, -228], [206, -267], [BV.x - 16, BV.z]]);
  // north-east: up the main road, over the north bridge to Thennoor
  road([[roadX(250) + 2, 250], [33, 310], [B3.w.x, B3.w.z]]);
  road([[B3.e.x, B3.e.z], [138, 357], [198, 408], [TV.x - 16, TV.z]]);
  // Paar gaon (across the footbridge) gets a proper road up to the eastern road
  road([[EH.x + 4, EH.z + 8], [142, 120], [150, 156]], 2.2);
  // north up the main road and the switchback into the hills to Pahadi Gaon
  road([[roadX(warpR(540)), warpR(540)], [-18, 724], [PG.x + 14, PG.z]]);
  // west: on from the country road out to the Maharashtrian village
  road([[-238, 10], [-333, 0], [-457, -36], [-551, -69], [MH.x + 16, MH.z]]);
  // up past Banglagram into the North-East hills
  road([[BV.x + 4, BV.z - 14], [306, -392], [304, -536], [NE.x, NE.z + 16]]);
  // and a river-side track joining the three villages across the river
  road([[BV.x + 14, BV.z + 6], [303, -168], [RV.x - 6, RV.z - 16]], 2.0);
  road([[RV.x - 6, RV.z + 16], [310, 310], [TV.x + 28, TV.z + 8], [TV.x + 12, TV.z]], 2.0);
  // south-west: a track from the crossing toward the tiger hills (with a warning on the map)
  road([[CROSSING.x - 6, CROSSING.z - 10], [-90, -170], [-189, -278], [-283, -361]], 2.2);
  // east past Marudhar over the hills to Noorpur
  road([[RV.x + 14, RV.z + 10], [494, 158], [599, 115], [705, 39], [NP.x - 18, NP.z]]);
  // north-west from the main road to Mariapur
  road([[roadX(warpR(470)) - 2, warpR(470)], [-155, 647], [-305, 723], [MP.x + 18, MP.z]]);
  // the old hilltop shrine, and on up the stone steps (kept clear of trees)
  for (let i = 0; i < STAIRS.pts.length - 1; i++) addLane(STAIRS.pts[i].x, STAIRS.pts[i].z, STAIRS.pts[i + 1].x, STAIRS.pts[i + 1].z, 2.4);
  dirtCircles.push({ x: PEAK.x, z: PEAK.z, r: 13, s: 0.85 });
  occupy(PEAK.x, PEAK.z, 14);
  // north-east: Marudhar's camel track toward the wolf hills
  road([[RV.x + 14, RV.z + 10], [400, 255], [422, 326]], 2.2);

  // track corridor and crossing kept clear
  for (const T of TRACKS) for (const [a, b] of T.segs) for (let x = a; x < b; x += 3) occupy(x, T.z(x), 7);
  occupy(CROSSING.x, CROSSING.z, 9);
  occupy(CROSSING3.x, CROSSING3.z, 9);

  // Landmarks
  const banyan = { x: -15, z: -9 };
  layout.banyan = banyan;
  occupy(banyan.x, banyan.z, 13);
  dirtCircles.push({ x: banyan.x, z: banyan.z, r: 11, s: 0.85 });
  banyan.y = heightAt(banyan.x, banyan.z);
  surfaces.push({ kind: 'c', x: banyan.x, z: banyan.z, r: 5.0, top: banyan.y + 0.55 });
  colliders.push({ kind: 'c', x: banyan.x, z: banyan.z, r: 1.9 });
  banyan.pillars = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6 + R() * 0.4, d = 7.5 + R() * 3;
    const p = { x: banyan.x + Math.cos(a) * d, z: banyan.z + Math.sin(a) * d };
    banyan.pillars.push(p);
    colliders.push({ kind: 'c', ...p, r: 0.4 });
  }

  const temple = { x: -22, z: 23 };
  temple.rot = Math.atan2(SQUARE.x - temple.x, SQUARE.z - temple.z);
  layout.temple = temple;
  occupy(temple.x, temple.z, 8);
  dirtCircles.push({ x: temple.x, z: temple.z, r: 8.5, s: 0.9 });
  {
    const base = heightAt(temple.x, temple.z);
    temple.y = base;
    surfaces.push({ kind: 'b', x: temple.x, z: temple.z, rot: temple.rot, hw: 3.5, hd: 3.5, top: base + 0.25 });
    surfaces.push({ kind: 'b', x: temple.x, z: temple.z, rot: temple.rot, hw: 3.1, hd: 3.1, top: base + 0.5 });
    surfaces.push({ kind: 'b', x: temple.x, z: temple.z, rot: temple.rot, hw: 2.7, hd: 2.7, top: base + 0.75 });
    colliders.push({ kind: 'b', x: temple.x, z: temple.z, rot: temple.rot, hw: 1.65, hd: 1.65 });
  }

  // Tea stall: kiosk walls, counter, awning poles and the customers' bench
  {
    const T = TEA;
    layout.tea = T;
    occupy(T.x, T.z, 5);
    occupy(...Object.values(rotPt(T, 0, 2.6)), 2.5);
    dirtCircles.push({ ...rotPt(T, 0, 1.2), r: 5, s: 0.95 });
    const box = (lx, lz, hw, hd, extra = {}) => colliders.push({ kind: 'b', ...rotPt(T, lx, lz), rot: T.rot, hw, hd, ...extra });
    box(0, -1.2, 1.4, 0.08);
    box(-1.32, -0.2, 0.08, 1.05);
    box(1.32, -0.2, 0.08, 1.05);
    box(0, 0.75, 1.4, 0.22);
    box(0, 2.55, 1.0, 0.18, { npcPass: true });
    for (const sx of [-1, 1]) colliders.push({ kind: 'c', ...rotPt(T, sx * 1.5, 3.4), r: 0.08 });
  }
  // Waterfall: boulders + pool, kept clear of trees
  {
    layout.waterfall = WF;
    WF.y = heightAt(WF.x, WF.z);
    occupy(WF.x, WF.z, 4);
    occupy(WF.lipX - 2.5, WF.z, 6);
    colliders.push({ kind: 'c', x: WF.x, z: WF.z, r: 2.75 });
    colliders.push({ kind: 'c', x: WF.lipX - 2.4, z: WF.z, r: 3.1 });
    for (const dz of [-1, 1]) colliders.push({ kind: 'c', x: WF.lipX - 1.0, z: WF.z + dz * 3.3, r: 1.6 });
  }

  // ----- Chhota Gaon: lane from the road, a dusty square, post office & hospital facing it -----
  {
    addLane(roadX(NV.z) - 2, NV.z, NV.x + 12, NV.z, 2.2);
    dirtCircles.push({ x: NV.x, z: NV.z, r: 14, s: 0.95 });
    occupy(NV.x, NV.z, 11);
    const face = (o) => Math.atan2(NV.x - o.x, NV.z - o.z);
    const po = { x: NV.x + 6, z: NV.z - 17 }; po.rot = face(po);
    const hp = { x: NV.x - 9, z: NV.z + 16 }; hp.rot = face(hp);
    layout.postOffice = po; layout.hospital = hp;
    for (const [b, hw, hd] of [[po, 3.2, 2.6], [hp, 5.2, 3.2]]) {
      occupy(b.x, b.z, Math.max(hw, hd) + 3);
      dirtCircles.push({ ...rotPt(b, 0, hd + 2.5), r: 4.5, s: 0.9 });
      colliders.push({ kind: 'b', x: b.x, z: b.z, rot: b.rot, hw, hd });
      surfaces.push({ kind: 'b', ...rotPt(b, 0, hd + 0.9), rot: b.rot, hw: hw + 0.2, hd: 1.0, top: heightAt(b.x, b.z) + 0.3 });
    }
    // red pillar post box in front of the post office
    po.box = rotPt(po, 2.4, 4.6);
    colliders.push({ kind: 'c', ...po.box, r: 0.3 });
    hp.bench = rotPt(hp, -2.5, 4.4);
    colliders.push({ kind: 'b', ...hp.bench, rot: hp.rot, hw: 0.95, hd: 0.2, npcPass: true });
  }
  // ----- school with a playground between it and the road -----
  {
    const S = SCHOOL;
    addLane(roadX(S.z) + 2, S.z, S.x - 12, S.z, 2.0);
    occupy(S.x, S.z, 9);
    occupy(S.x - 9, S.z, 9);
    dirtCircles.push({ x: S.x - 9, z: S.z, r: 10, s: 1 });
    dirtCircles.push({ x: S.x - 1, z: S.z, r: 7, s: 0.9 });
    colliders.push({ kind: 'b', x: S.x + 1, z: S.z, rot: S.rot, hw: 7, hd: 3 });
    surfaces.push({ kind: 'b', ...rotPt(S, 0, 3.9), rot: S.rot, hw: 7.2, hd: 1.0, top: heightAt(S.x, S.z) + 0.35 });
    S.flag = rotPt(S, 5.5, 8);
    colliders.push({ kind: 'c', ...S.flag, r: 0.25 });
  }
  // ----- flower garden: low fence with a gate facing the road -----
  {
    const G = GARDEN;
    addLane(roadX(G.z) - 2, G.z, G.x + G.hw + 1, G.z, 1.6);
    occupy(G.x, G.z, Math.hypot(G.hw, G.hd) + 1);
    dirtCircles.push({ x: G.x, z: G.z, r: 4, s: 0.7 });
    const fence = (x, z, hw, hd) => colliders.push({ kind: 'b', x, z, rot: 0, hw, hd, height: heightAt(G.x, G.z) + 0.9 });
    fence(G.x, G.z - G.hd, G.hw, 0.06); fence(G.x, G.z + G.hd, G.hw, 0.06); fence(G.x - G.hw, G.z, 0.06, G.hd);
    fence(G.x + G.hw, G.z - G.hd / 2 - 0.75, 0.06, G.hd / 2 - 0.75); fence(G.x + G.hw, G.z + G.hd / 2 + 0.75, 0.06, G.hd / 2 - 0.75);
  }
  // ----- the market -----
  {
    const M = MARKET;
    addLane(roadX(M.z) + 2, M.z, M.x1 + 2, M.z, 2.4);
    for (let x = M.x0; x <= M.x1; x += 5) dirtCircles.push({ x, z: M.z, r: 7.5, s: 0.95 });
    for (const st of M.stalls) {
      occupy(st.x, st.z, 3.2);
      colliders.push({ kind: 'b', ...rotPt(st, 0, -0.1), rot: st.rot, hw: 1.15, hd: 0.45 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) colliders.push({ kind: 'c', ...rotPt(st, sx * 1.3, sz * 0.9 - 0.2), r: 0.06 });
    }
  }
  // ----- cricket pitch -----
  {
    const C = CRICKET;
    occupy(C.x, C.z, 12);
    dirtCircles.push({ x: C.x, z: C.z, r: 11, s: 0.55 });
    for (let t = -10; t <= 10; t += 2.5) dirtCircles.push({ ...rotPt(C, 0, t), r: 1.6, s: 0.9 });
  }
  occupy(PUMP.x, PUMP.z, 3);
  dirtCircles.push({ x: PUMP.x, z: PUMP.z, r: 3.5, s: 0.9 });
  surfaces.push({ kind: 'b', x: PUMP.x, z: PUMP.z, rot: PUMP.rot, hw: 1.1, hd: 1.1, top: heightAt(PUMP.x, PUMP.z) + 0.12 });
  colliders.push({ kind: 'c', ...rotPt(PUMP, 0, -0.35), r: 0.18 });
  layout.pump = PUMP;
  occupy(TANK.x, TANK.z, 6);
  dirtCircles.push({ x: TANK.x, z: TANK.z, r: 5, s: 0.7 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) colliders.push({ kind: 'c', ...rotPt({ ...TANK, rot: 0.3 }, sx * 2.1, sz * 2.1), r: 0.3 });
  layout.tank = TANK;
  layout.auto = { x: roadX(80) + 4.2, z: 80, rot: 0.2 };
  layout.boat = { ...rotPt(GHAT, 8.6, -5.5), rot: GHAT.rot + 0.4 };
  // ----- donkeys' grazing patch by the river, the moped's parking spot -----
  layout.donkeys = { x: riverX(140) - 22, z: 140, r: 9 };
  layout.moped = { x: roadX(21) - 2.6, z: 21 };
  // ----- the tractor's field and a farmhouse shed at its corner -----
  {
    const f = FIELDS.find((q) => q[0] === 6);
    layout.tractorField = { x0: f[1], x1: f[2], z0: f[3], z1: f[4] };
  }

  const well = { x: 10, z: -11 };
  layout.well = well;
  occupy(well.x, well.z, 3);
  dirtCircles.push({ x: well.x, z: well.z, r: 4.5, s: 0.9 });
  colliders.push({ kind: 'c', x: well.x, z: well.z, r: 1.45 });
  layout.pots.push({ x: well.x + 1.9, z: well.z + 0.6, s: 1 }, { x: well.x + 2.2, z: well.z - 0.2, s: 0.8 });

  // Hilltop shrine
  occupy(HILLTOP.x, HILLTOP.z, 9);
  dirtCircles.push({ x: HILLTOP.x, z: HILLTOP.z, r: 7, s: 0.8 });
  colliders.push({ kind: 'b', x: HILLTOP.x + 3, z: HILLTOP.z - 2, rot: 0, hw: 0.9, hd: 0.9 });

  // Ghat steps (walkable)
  {
    const g = GHAT;
    const n = 6, depth = 0.9;
    const top0 = heightAt(g.x, g.z) + 0.15;
    const bottom = WATER_Y - 0.25;
    g.top0 = top0;
    g.steps = [];
    const L = rotPt(g, -1.5, 0);
    surfaces.push({ kind: 'b', x: L.x, z: L.z, rot: g.rot, hw: 1.5, hd: 4.5, top: top0 });
    g.steps.push({ lx: -1.5, hw: 1.5, top: top0 });
    for (let i = 0; i < n; i++) {
      const lx = i * depth + depth / 2;
      const top = top0 - ((i + 1) * (top0 - bottom)) / n;
      const P = rotPt(g, lx, 0);
      surfaces.push({ kind: 'b', x: P.x, z: P.z, rot: g.rot, hw: depth / 2, hd: 4, top });
      g.steps.push({ lx, hw: depth / 2, top });
    }
    occupy(g.x, g.z, 6);
    dirtCircles.push({ x: g.x - 2, z: g.z, r: 4, s: 0.8 });
  }

  // Footbridge and railway bridge decks (walkable from above)
  FOOT.top = WATER_Y + 1.15;
  surfaces.push({ kind: 'b', x: FOOT.x, z: FOOT.z, rot: FOOT.rot, hw: RIVER_HALF + 6, hd: 1.05, top: FOOT.top, bridge: true });
  for (const sz of [-1, 1]) colliders.push({ kind: 'b', ...rotPt(FOOT, 0, sz * 1.15), rot: FOOT.rot, hw: RIVER_HALF + 4, hd: 0.08, height: FOOT.top + 1.2 });
  occupy(fW.x, fW.z, 4); occupy(fE.x, fE.z, 4);
  {
    const rot = -Math.atan(trackSlope(TRACK.xr));
    TRACK.rot = rot;
    surfaces.push({ kind: 'b', x: TRACK.xr, z: TRACK.zr, rot, hw: RIVER_HALF + 9, hd: 2.4, top: TRACK_Y + 0.32, bridge: true });
    // the road bridge: a concrete deck with parapets, wide enough for the car and the auto
    // road bridges: a smooth arched deck that ramps down to meet the banks at both ends
    for (const B of BRIDGES) {
      B.L = (RIVER_HALF + 13) * 2;
      const e0 = rotPt(B, -B.L / 2, 0), e1 = rotPt(B, B.L / 2, 0);
      B.h0 = heightAt(e0.x, e0.z); B.h1 = heightAt(e1.x, e1.z);
      B.rise = Math.max(0.5, WATER_Y + 1.7 - (B.h0 + B.h1) / 2);
      B.top = archTop(B, 0);
      surfaces.push({ kind: 'arch', x: B.x, z: B.z, rot: B.rot, hw: B.L / 2, hd: 2.7, B });
      // parapets: they only stop things up on the deck, not a swimmer or a boat passing underneath
      for (const sz of [-1, 1]) colliders.push({ kind: 'b', ...rotPt(B, 0, sz * 2.85), rot: B.rot, hw: B.L / 2 - 1.5, hd: 0.15, height: B.top + 1.2, minY: WATER_Y + 0.6 });
    }
    for (const T of [TRACK2, TRACK3]) {
      T.rot = -Math.atan(T.slope(T.xr));
      surfaces.push({ kind: 'b', x: T.xr, z: T.zr, rot: T.rot, hw: RIVER_HALF + 9, hd: 2.4, top: TRACK_Y + 0.32, bridge: true });
    }
  }

  // Houses along the road
  const addHouse = (x, z, rot, type, side = 0) => {
    const h = { type, x, z, rot, seed: Math.floor(R() * 1e9), side };
    layout.houses.push(h);
    occupy(x, z, 6);
    dirtCircles.push({ x, z, r: 6.5, s: 1 });
    dirtCircles.push({ x: x + Math.sin(rot) * 5.5, z: z + Math.cos(rot) * 5.5, r: 5.5, s: 0.85 });
    return h;
  };
  const okSpot = (x, z) => !fieldType(x, z) && trackDist(x, z) > 16 && laneDist(x, z) > 6 && riverDist(x, z) > RIVER_HALF + 12;
  for (const side of [-1, 1]) {
    for (let z = -100; z <= 160; z += 14 + R() * 5) {
      const type = R() < 0.62 ? 'rect' : 'round';
      const x = roadX(z) + side * (10.5 + R() * 3.5);
      if (Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r + 6) continue;
      if (side > 0 && Math.abs(z - pathZ(x)) < 8) continue;
      if (!okSpot(x, z) || !isFree(x, z, 6)) continue;
      addHouse(x, z, (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (R() - 0.5) * 0.15, type, side);
    }
  }
  for (const side of [-1, 1]) {
    for (let z = -90; z <= 150; z += 16 + R() * 8) {
      if (R() < 0.3) continue;
      const x = roadX(z) + side * (26 + R() * 6);
      if (Math.abs(z - pathZ(x)) < 8 || !okSpot(x, z) || !isFree(x, z, 6)) continue;
      addHouse(x, z, (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (R() - 0.5) * 0.15, R() < 0.7 ? 'round' : 'rect', side);
    }
  }
  // A building site just outside the main village (two new pucca houses going up), and an open meadow
  // where the kids fly their kites. Both pick the flattest free patch near the village.
  {
    const flat = (x, z, r) => { let lo = 1e9, hi = -1e9; for (let a = 0; a < 8; a++) for (const d of [r * 0.5, r]) { const h = heightAt(x + Math.cos(a) * d, z + Math.sin(a) * d); lo = Math.min(lo, h); hi = Math.max(hi, h); } return hi - lo; };
    const find = (r, dmin, dmax, near, avoid) => {
      let best = null, bs = 1e9;
      for (let z = -80; z <= 150; z += 4) for (const side of [-1, 1]) for (let d = dmin; d <= dmax; d += 4) {
        const x = roadX(z) + side * d;
        if (!okSpot(x, z) || !isFree(x, z, r) || Math.abs(z - pathZ(x)) < r) continue;
        if (Math.hypot(x - CRICKET.x, z - CRICKET.z) < 20 + r || Math.hypot(x - GARDEN.x, z - GARDEN.z) < 14 + r) continue;
        if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 45) continue;
        const f = flat(x, z, r);
        if (f > 1.2) continue;
        const sc = Math.hypot(x - near.x, z - near.z) + f * 25;
        if (sc < bs) { bs = sc; best = { x, z, side }; }
      }
      return best;
    };
    const b = find(12, 34, 60, { x: 0, z: 40 });
    if (b) {
      layout.build = { x: b.x, z: b.z, rot: b.side > 0 ? -Math.PI / 2 : Math.PI / 2 };
      occupy(b.x, b.z, 13);
      dirtCircles.push({ x: b.x, z: b.z, r: 12, s: 1 });
    }
    const k = find(10, 30, 80, { x: 0, z: -20 }, b);
    if (k) { layout.kites = { x: k.x, z: k.z }; occupy(k.x, k.z, 10); }
    // the gaon ka mela: a big open ground a little way out of the village, its gate facing the road and a
    // parking lot of autos and bikes in front. Every point of the ground must be clear of fields and houses.
    {
      const R0 = 24;
      const clear = (x, z) => {
        for (let a = 0; a < 12; a++) for (const d of [0, R0 * 0.5, R0]) {
          const px = x + Math.cos(a * 0.5236) * d, pz = z + Math.sin(a * 0.5236) * d;
          if (fieldType(px, pz) || trackDist(px, pz) < 10 || riverDist(px, pz) < RIVER_HALF + 8 || laneDist(px, pz) < 2.5) return false;
          if (Math.abs(px - roadX(pz)) < 9) return false;
        }
        return true;
      };
      let best = null, bs = 1e9;
      for (let z = -100; z <= 190; z += 4) for (const side of [-1, 1]) for (let d = 36; d <= 120; d += 4) {
        const x = roadX(z) + side * d;
        if (!clear(x, z) || !isFree(x, z, R0 + 2)) continue;
        if (Math.hypot(x - CRICKET.x, z - CRICKET.z) < 22 + R0 || Math.hypot(x - GARDEN.x, z - GARDEN.z) < 14 + R0 || Math.hypot(x - SCHOOL.x, z - SCHOOL.z) < 14 + R0) continue;
        if (b && Math.hypot(x - b.x, z - b.z) < R0 + 18) continue;
        if (k && Math.hypot(x - k.x, z - k.z) < R0 + 14) continue;
        const f = flat(x, z, R0);
        if (f > 3) continue;
        const sc = Math.abs(Math.hypot(x - SQUARE.x, z - SQUARE.z) - 75) + f * 18 + d * 0.15;
        if (sc < bs) { bs = sc; best = { x, z, side }; }
      }
      if (best) {
        // the gate (local +z) faces back toward the road
        const rot = Math.atan2(roadX(best.z) - best.x, 0);
        layout.mela = { x: best.x, z: best.z, rot, r: R0 };
        occupy(best.x, best.z, R0 + 2);
        dirtCircles.push({ x: best.x, z: best.z, r: R0 + 2, s: 0.9 });
        // the parking in front of the gate, toward the road
        const pk = rotPt(layout.mela, 0, R0 + 6);
        occupy(pk.x, pk.z, 7);
        dirtCircles.push({ x: pk.x, z: pk.z, r: 7, s: 0.8 });
      }
    }
    // the village airstrip: a long, flat grass strip out past the mela, with a little hangar and the plane.
    // Every metre of it (and a margin either side) must be clear of fields, lanes, the river and the road.
    {
      const L = 230, HW = 9;
      const near = layout.mela ?? SQUARE;
      let best = null, bs = 1e9;
      // a memo of 5 m cells: is this bit of ground usable?
      const memo = new Map();
      const ok = (x, z) => {
        const k = Math.round(x / 5) * 4096 + Math.round(z / 5);
        let v = memo.get(k);
        if (v === undefined) {
          const X = Math.round(x / 5) * 5, Z = Math.round(z / 5) * 5;
          v = !fieldType(X, Z) && trackDist(X, Z) > 12 && riverDist(X, Z) > RIVER_HALF + 10 && laneDist(X, Z) > 3 && Math.abs(X - roadX(Z)) > 10 && isFree(X, Z, 3);
          memo.set(k, v);
        }
        return v;
      };
      for (let cz = -300; cz <= 420; cz += 8) for (let cx = -420; cx <= 420; cx += 8) {
        const dn = Math.hypot(cx - near.x, cz - near.z);
        if (dn < 70 || dn > 330) continue;
        for (let ai = 0; ai < 12; ai++) {
          const rot = (ai / 12) * Math.PI;
          const fx = Math.sin(rot), fz = Math.cos(rot), sx = Math.cos(rot), sz = -Math.sin(rot);
          let good = true, lo = 1e9, hi = -1e9, sum = 0, n = 0;
          for (let t = -L / 2; t <= L / 2 && good; t += 20) if (!ok(cx + fx * t, cz + fz * t)) good = false; // cheap reject
          for (let t = -L / 2; t <= L / 2 && good; t += 10) for (const w of [-HW, 0, HW]) {
            const x = cx + fx * t + sx * w, z = cz + fz * t + sz * w;
            if (!ok(x, z)) { good = false; break; }
            const h = heightAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); sum += h; n++;
          }
          if (!good || hi - lo > 4) continue;
          const sc = (hi - lo) * 40 + Math.abs(dn - 120) * 0.5;
          if (sc < bs) { bs = sc; best = { x: cx, z: cz, rot, len: L, hw: HW, y: sum / n, flat: hi - lo }; }
        }
      }
      if (best) {
        layout.airstrip = best;
        const fx = Math.sin(best.rot), fz = Math.cos(best.rot);
        for (let t = -L / 2; t <= L / 2; t += 8) occupy(best.x + fx * t, best.z + fz * t, HW + 4);
        // a worn earth strip down the middle, where the wheels run
        for (let t = -L / 2; t <= L / 2; t += 5) dirtCircles.push({ x: best.x + fx * t, z: best.z + fz * t, r: 4.2, s: 0.55 });
        // the hangar beside the near end, its open front toward the strip
        // pick a side and spot near the near end where the shed sits on open ground, not in a crop
        let hs = -1, ht = 24;
        const ts = []; for (let t = 20; t <= L - 20; t += 8) ts.push(t); ts.sort((p, q) => Math.min(p, L - p) - Math.min(q, L - q)); // nearest an end first
        search: for (const t of ts) for (const side of [-1, 1]) {
          const c = rotPt(best, side * (HW + 11), -L / 2 + t);
          let okH = true;
          for (let a = 0; a < 10 && okH; a++) for (const d of [0, 5, 10]) {
            const x = c.x + Math.cos(a * 0.628) * d, z = c.z + Math.sin(a * 0.628) * d;
            if (fieldType(x, z) || trackDist(x, z) < 8 || laneDist(x, z) < 2 || riverDist(x, z) < RIVER_HALF + 4 || Math.abs(x - roadX(z)) < 6) { okH = false; break; }
          }
          if (okH) { hs = side; ht = t; break search; }
        }
        const hg = rotPt(best, hs * (HW + 11), -L / 2 + ht);
        layout.airstrip.hangar = { ...hg, rot: best.rot - hs * Math.PI / 2 };
        layout.airstrip.home = ht > L / 2 ? 1 : -1; // the plane parks at the end nearest the hangar
        occupy(hg.x, hg.z, 11);
        dirtCircles.push({ x: hg.x, z: hg.z, r: 9, s: 0.75 });
        for (let t = 0; t < 12; t += 3) dirtCircles.push({ ...rotPt(best, hs * (HW + 11 - 4 - t), -L / 2 + ht), r: 3.5, s: 0.6 });
        // walls of the hangar: back and both sides (front open)
        const H = layout.airstrip.hangar, hx = 7.5, hz = 6;
        for (const [lx, lz, hw, hd] of [[0, -hz, hx, 0.25], [-hx, 0, 0.25, hz], [hx, 0, 0.25, hz]]) {
          const q = rotPt(H, lx, lz);
          colliders.push({ kind: 'b', x: q.x, z: q.z, rot: H.rot, hw, hd, height: heightAt(q.x, q.z) + 5.5 });
        }
        // the helipad: across the strip from the hangar, near the end where the plane parks
        {
          const end = layout.airstrip.home, side = -hs;
          let pad = null;
          for (const along of [L / 2 - 30, L / 2 - 50, L / 2 - 70, L / 2 - 14]) for (const out of [HW + 13, HW + 18, HW + 24]) {
            const q = rotPt(best, side * out, end * along);
            if (fieldType(q.x, q.z) || !isFree(q.x, q.z, 8) || laneDist(q.x, q.z) < 9 || riverDist(q.x, q.z) < RIVER_HALF + 10) continue;
            pad = q; break;
          }
          if (!pad) pad = rotPt(best, side * (HW + 13), end * (L / 2 - 30));
          layout.airstrip.pad = { ...pad, rot: best.rot };
          occupy(pad.x, pad.z, 9);
          surfaces.push({ kind: 'c', x: pad.x, z: pad.z, r: 7.1, top: heightAt(pad.x, pad.z) + 0.15 });
        }
        // the windsock at the far end
        layout.airstrip.sock = rotPt(best, HW + 4, -layout.airstrip.home * (L / 2 - 20));
        colliders.push({ kind: 'c', ...layout.airstrip.sock, r: 0.15, height: heightAt(layout.airstrip.sock.x, layout.airstrip.sock.z) + 7 });
      }
    }
  }
  // the charagah: the village's common grazing ground, a big open meadow with a bamboo pen at the edge nearest
  // the village. Herders bring their sheep, goats and cows out here to graze through the day.
  {
    const RP = 62;
    const clearAt = (x, z) => !fieldType(x, z) && trackDist(x, z) > 22 && riverDist(x, z) > RIVER_HALF + 18 && laneDist(x, z) > 5 && Math.abs(x - roadX(z)) > 14;
    let best = null, bs = 1e9;
    for (let a = 0; a < 48; a++) for (let d = 210; d <= 470; d += 15) {
      const x = Math.cos((a / 48) * Math.PI * 2) * d, z = Math.sin((a / 48) * Math.PI * 2) * d;
      if (!isFree(x, z, RP)) continue;
      let ok = true, lo = 1e9, hi = -1e9;
      for (let i = 0; i < 12 && ok; i++) for (const rr of [0, RP * 0.55, RP]) {
        const px = x + Math.cos(i * 0.5236) * rr, pz = z + Math.sin(i * 0.5236) * rr;
        if (!clearAt(px, pz)) { ok = false; break; }
        const hh = heightAt(px, pz); lo = Math.min(lo, hh); hi = Math.max(hi, hh);
      }
      if (!ok || hi - lo > 6) continue;
      const sc = (hi - lo) * 12 + Math.abs(d - 300) * 0.3;
      if (sc < bs) { bs = sc; best = { x, z }; }
    }
    if (best) {
      const P = { ...best, r: RP };
      // the pen sits on the side toward the village
      const dl = Math.hypot(P.x, P.z);
      P.pen = { x: P.x - (P.x / dl) * (RP + 4), z: P.z - (P.z / dl) * (RP + 4) };
      P.pen.rot = Math.atan2(P.x - P.pen.x, P.z - P.pen.z); // the gate faces the meadow
      layout.pasture = P;
      occupy(P.x, P.z, RP * 0.82);
      occupy(P.pen.x, P.pen.z, 9);
      dirtCircles.push({ x: P.pen.x, z: P.pen.z, r: 8, s: 0.85 });
      // a bamboo fence round the pen, open on the meadow side
      const n = 22, pr = 7;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        const mid = (a0 + a1) / 2;
        // local angle 0 = toward the meadow (the gate)
        if (Math.abs(Math.atan2(Math.sin(mid), Math.cos(mid))) < 0.45) continue;
        const lx = Math.sin(mid) * pr, lz = Math.cos(mid) * pr;
        const q = rotPt(P.pen, lx, lz);
        colliders.push({ kind: 'b', x: q.x, z: q.z, rot: P.pen.rot + mid + Math.PI / 2, hw: 1.1, hd: 0.1, height: heightAt(q.x, q.z) + 1.3, npcPass: true });
      }
    }
  }
  // East hamlet: a ring of homes around a little courtyard
  dirtCircles.push({ x: EH.x, z: EH.z, r: 13, s: 0.9 });
  occupy(EH.x, EH.z, 9);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const d = 16 + R() * 3;
    const x = EH.x + Math.cos(a) * d, z = EH.z + Math.sin(a) * d;
    if (!okSpot(x, z) || !isFree(x, z, 5.5)) continue;
    addHouse(x, z, Math.atan2(EH.x - x, EH.z - z), R() < 0.55 ? 'round' : 'rect');
  }

  // Marudhar: two rings of flat-roofed sandstone and Jodhpur-blue houses round the stepwell square
  {
    layout.rv = RV;
    dirtCircles.push({ x: RV.x, z: RV.z, r: 13, s: 1 });
    occupy(RV.x, RV.z, 10);
    // the baoli (stepwell) in the middle, a chhatri beside it
    colliders.push({ kind: 'b', x: RV.x, z: RV.z, rot: 0, hw: 4.2, hd: 4.2 });
    RV.chhatri = { x: RV.x + 9, z: RV.z - 7 };
    colliders.push({ kind: 'c', ...RV.chhatri, r: 1.9 });
    occupy(RV.chhatri.x, RV.chhatri.z, 3);
    for (const [ring, n, r0] of [[0, 9, 18], [1, 13, 31]]) for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.2;
      const x = RV.x + Math.cos(a) * (r0 + R() * 2), z = RV.z + Math.sin(a) * (r0 + R() * 2);
      if (Math.abs(z - RV.z) < 4 && x < RV.x) continue; // the road in
      if (!isFree(x, z, 5)) continue;
      const h = addHouse(x, z, Math.atan2(RV.x - x, RV.z - z), 'raj');
      h.blue = R() < 0.45; h.storeys = R() < 0.35 ? 2 : 1;
    }
    // prickly-pear clumps and khejri trees on the sand around it
    layout.cacti = [];
    for (let i = 0; i < 70; i++) {
      const a = R() * Math.PI * 2, d = 38 + R() * 45;
      const x = RV.x + Math.cos(a) * d, z = RV.z + Math.sin(a) * d;
      if (dirtMask(x, z) > 0.2 || !isFree(x, z, 1.2)) continue;
      layout.cacti.push({ x, z, s: 0.7 + R() * 0.7, rot: R() * 6 });
      occupy(x, z, 1);
      colliders.push({ kind: 'c', x, z, r: 0.3 });
    }
    occupy(RV.x, RV.z, 60); // keep the leafy village trees off the sand
  }

  // Banglagram: curved-roof mud huts round a courtyard and the pond, a terracotta temple, banana groves
  {
    layout.bv = BV;
    dirtCircles.push({ x: BV.x, z: BV.z, r: 12, s: 0.95 });
    occupy(BV.x, BV.z, 9);
    occupy(BV.pond.x, BV.pond.z, 12);
    colliders.push({ kind: 'c', x: BV.pond.x, z: BV.pond.z, r: 8.6, npcPass: true });
    BV.temple = { x: BV.x - 14, z: BV.z - 8 }; BV.temple.rot = Math.atan2(BV.x - BV.temple.x, BV.z - BV.temple.z);
    occupy(BV.temple.x, BV.temple.z, 6);
    colliders.push({ kind: 'b', ...BV.temple, hw: 2.6, hd: 2.6 });
    dirtCircles.push({ x: BV.temple.x, z: BV.temple.z, r: 6, s: 0.9 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const r0 = 20 + (i % 2) * 9 + R() * 2;
      const x = BV.x + Math.cos(a) * r0, z = BV.z + Math.sin(a) * r0;
      if (Math.abs(z - BV.z) < 4 && x < BV.x) continue;
      if (!isFree(x, z, 5)) continue;
      addHouse(x, z, Math.atan2(BV.x - x, BV.z - z), 'bengal');
    }
    layout.bananas = [];
    for (let i = 0; i < 60; i++) {
      const a = R() * Math.PI * 2, d = 10 + R() * 50;
      const x = BV.x + Math.cos(a) * d, z = BV.z + Math.sin(a) * d;
      if (!isFree(x, z, 1.5) || dirtMask(x, z) > 0.3) continue;
      layout.bananas.push({ x, z, s: 0.8 + R() * 0.5, rot: R() * 6 });
      occupy(x, z, 1.2);
      colliders.push({ kind: 'c', x, z, r: 0.25 });
    }
    for (let i = 0; i < 30; i++) {
      const a = R() * Math.PI * 2, d = 25 + R() * 40;
      const x = BV.x + Math.cos(a) * d, z = BV.z + Math.sin(a) * d;
      if (!isFree(x, z, 2)) continue;
      layout.palms.push({ x, z, s: 0.8 + R() * 0.35, rot: R() * 6.28, v: Math.floor(R() * 3) });
      occupy(x, z, 1.5);
      colliders.push({ kind: 'c', x, z, r: 0.35 });
    }
  }
  // Thennoor: tiled-roof houses with thinnai verandahs along two streets, a gopuram temple, Ayyanar horses
  {
    layout.tv = TV;
    dirtCircles.push({ x: TV.x, z: TV.z, r: 12, s: 0.95 });
    occupy(TV.x, TV.z, 9);
    TV.temple = { x: TV.x + 20, z: TV.z, rot: -Math.PI / 2 };
    occupy(TV.temple.x, TV.temple.z, 9);
    colliders.push({ kind: 'b', x: TV.temple.x + 1, z: TV.temple.z, rot: 0, hw: 3.2, hd: 3.2 });
    dirtCircles.push({ x: TV.temple.x - 3, z: TV.temple.z, r: 8, s: 0.95 });
    TV.horses = [{ x: TV.x - 4, z: TV.z - 24, rot: 0 }, { x: TV.x + 4, z: TV.z - 24, rot: 0 }];
    for (const hh of TV.horses) { occupy(hh.x, hh.z, 3); colliders.push({ kind: 'c', ...hh, r: 1.3 }); }
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
      // two facing rows: an agraharam-style street running east-west through the village
      const x = TV.x - 22 + i * 8.5, z = TV.z + side * 11;
      if (!isFree(x, z, 4.2)) continue;
      addHouse(x, z, side > 0 ? Math.PI : 0, 'tamil');
    }
    for (let x = TV.x - 26; x <= TV.x + 24; x += 4) dirtCircles.push({ x, z: TV.z, r: 4.5, s: 0.9 });
    for (let i = 0; i < 45; i++) {
      const a = R() * Math.PI * 2, d = 22 + R() * 45;
      const x = TV.x + Math.cos(a) * d, z = TV.z + Math.sin(a) * d;
      if (!isFree(x, z, 2)) continue;
      layout.palms.push({ x, z, s: 0.85 + R() * 0.35, rot: R() * 6.28, v: Math.floor(R() * 3) });
      occupy(x, z, 1.5);
      colliders.push({ kind: 'c', x, z, r: 0.35 });
    }
  }

  // Maharashtra: basalt-and-tile houses round a lane, a wada with a courtyard, a Vitthal temple and its deepmala
  {
    layout.mh = MH;
    dirtCircles.push({ x: MH.x, z: MH.z, r: 13, s: 0.95 });
    occupy(MH.x, MH.z, 9);
    MH.temple = { x: MH.x - 18, z: MH.z, rot: Math.PI / 2 };
    MH.deepmala = { x: MH.x - 10, z: MH.z };
    occupy(MH.temple.x, MH.temple.z, 8); occupy(MH.deepmala.x, MH.deepmala.z, 3);
    colliders.push({ kind: 'b', x: MH.temple.x, z: MH.temple.z, rot: 0, hw: 3, hd: 3 });
    colliders.push({ kind: 'c', ...MH.deepmala, r: 1.0 });
    dirtCircles.push({ x: MH.temple.x + 4, z: MH.temple.z, r: 8, s: 0.95 });
    MH.wada = { x: MH.x + 6, z: MH.z + 22, rot: Math.PI };
    occupy(MH.wada.x, MH.wada.z, 9);
    for (const [lx, lz, hw, hd] of [[0, -4.4, 6, 0.4], [-5.6, 0, 0.4, 4.4], [5.6, 0, 0.4, 4.4], [3.5, 4.4, 2.5, 0.4], [-3.5, 4.4, 2.5, 0.4]]) colliders.push({ kind: 'b', ...rotPt(MH.wada, lx, lz), rot: MH.wada.rot, hw, hd });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.3;
      const r0 = 20 + (i % 2) * 8 + R() * 2;
      const x = MH.x + Math.cos(a) * r0, z = MH.z + Math.sin(a) * r0;
      if (Math.abs(z - MH.z) < 4 && x > MH.x) continue;
      if (!isFree(x, z, 5)) continue;
      addHouse(x, z, Math.atan2(MH.x - x, MH.z - z), 'maha');
    }
  }
  // North-East: bamboo stilt houses on the slope, bamboo groves, and a terraced tea garden
  {
    layout.ne = NE;
    dirtCircles.push({ x: NE.x, z: NE.z, r: 11, s: 0.9 });
    occupy(NE.x, NE.z, 8);
    occupy((NE.tea.x0 + NE.tea.x1) / 2, (NE.tea.z0 + NE.tea.z1) / 2, 40);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.5;
      const r0 = 17 + (i % 2) * 8 + R() * 2;
      const x = NE.x + Math.cos(a) * r0, z = NE.z + Math.sin(a) * r0;
      if (Math.abs(x - NE.x) < 4 && z > NE.z) continue;
      if (!isFree(x, z, 4.5)) continue;
      addHouse(x, z, Math.atan2(NE.x - x, NE.z - z), 'ne');
    }
    layout.bamboo = [];
    for (let i = 0; i < 24; i++) {
      const a = R() * Math.PI * 2, d = 32 + R() * 30;
      const x = NE.x + Math.cos(a) * d, z = NE.z + Math.sin(a) * d;
      if (!isFree(x, z, 2.5) || dirtMask(x, z) > 0.2) continue;
      layout.bamboo.push({ x, z, s: 0.8 + R() * 0.5, rot: R() * 6 });
      occupy(x, z, 2.5);
      colliders.push({ kind: 'c', x, z, r: 0.65 });
    }
  }

  // Pahadi Gaon: two-storey stone-and-timber houses with slate roofs, a pagoda temple, apple trees
  {
    layout.pg = PG;
    dirtCircles.push({ x: PG.x, z: PG.z, r: 12, s: 0.9 });
    occupy(PG.x, PG.z, 9);
    PG.temple = { x: PG.x - 16, z: PG.z + 10 };
    occupy(PG.temple.x, PG.temple.z, 7);
    colliders.push({ kind: 'b', ...PG.temple, rot: 0, hw: 2.6, hd: 2.6 });
    dirtCircles.push({ x: PG.temple.x, z: PG.temple.z, r: 6, s: 0.9 });
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + 0.1;
      const r0 = 17 + (i % 2) * 9 + R() * 2;
      const x = PG.x + Math.cos(a) * r0, z = PG.z + Math.sin(a) * r0;
      if (Math.abs(z - PG.z) < 4 && x > PG.x) continue;
      if (!isFree(x, z, 5)) continue;
      addHouse(x, z, Math.atan2(PG.x - x, PG.z - z), 'pahadi');
    }
    layout.apples = [];
    for (let i = 0; i < 40; i++) {
      const a = R() * Math.PI * 2, d = 34 + R() * 30;
      const x = PG.x + Math.cos(a) * d, z = PG.z + Math.sin(a) * d;
      if (!isFree(x, z, 2.5) || dirtMask(x, z) > 0.2) continue;
      layout.apples.push({ x, z, s: 0.8 + R() * 0.3, rot: R() * 6 });
      occupy(x, z, 2.2);
      colliders.push({ kind: 'c', x, z, r: 0.2 });
    }
  }
  // Noorpur: whitewashed flat-roofed homes round a chowk, a masjid with dome and minarets, the kabristan
  {
    layout.np = NP;
    dirtCircles.push({ x: NP.x, z: NP.z, r: 13, s: 0.95 });
    occupy(NP.x, NP.z, 9);
    NP.masjid = { x: NP.x + 2, z: NP.z - 25, rot: 0 };
    occupy(NP.masjid.x, NP.masjid.z, 13);
    dirtCircles.push({ x: NP.masjid.x, z: NP.masjid.z + 7, r: 9, s: 0.9 });
    colliders.push({ kind: 'b', x: NP.masjid.x, z: NP.masjid.z - 3, rot: 0, hw: 6.2, hd: 4.2 });
    for (const sx of [-1, 1]) colliders.push({ kind: 'c', x: NP.masjid.x + sx * 6.6, z: NP.masjid.z + 1.6, r: 0.9 });
    colliders.push({ kind: 'b', x: NP.masjid.x, z: NP.masjid.z + 6, rot: 0, hw: 1.6, hd: 1.0 }); // wazu tank
    for (const sx of [-1, 1]) colliders.push({ kind: 'b', x: NP.masjid.x + sx * 4.4, z: NP.masjid.z + 9.8, rot: 0, hw: 2.6, hd: 0.15 });
    surfaces.push({ kind: 'b', x: NP.masjid.x, z: NP.masjid.z + 1, rot: 0, hw: 7, hd: 9, top: heightAt(NP.masjid.x, NP.masjid.z) + 0.4 });
    // the kabristan: a walled graveyard under neem trees, a gate on the chowk side
    NP.kab = { x: NP.x + 34, z: NP.z - 22, rot: 0, hw: 11, hd: 8 };
    occupy(NP.kab.x, NP.kab.z, 15);
    const K = NP.kab;
    colliders.push({ kind: 'b', x: K.x, z: K.z - K.hd, rot: 0, hw: K.hw, hd: 0.2 });
    colliders.push({ kind: 'b', x: K.x - K.hw, z: K.z, rot: 0, hw: 0.2, hd: K.hd });
    colliders.push({ kind: 'b', x: K.x + K.hw, z: K.z, rot: 0, hw: 0.2, hd: K.hd });
    colliders.push({ kind: 'b', x: K.x - K.hw / 2 - 1, z: K.z + K.hd, rot: 0, hw: K.hw / 2 - 1, hd: 0.2 });
    colliders.push({ kind: 'b', x: K.x + K.hw / 2 + 1, z: K.z + K.hd, rot: 0, hw: K.hw / 2 - 1, hd: 0.2 });
    K.graves = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) if (R() < 0.85) K.graves.push({ x: K.x - 8.5 + i * 3.3 + (R() - 0.5) * 0.4, z: K.z - 5.5 + j * 3.4, rot: (R() - 0.5) * 0.1, s: 0.8 + R() * 0.35, v: Math.floor(R() * 3) });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const r0 = 21 + (i % 2) * 8 + R() * 2;
      const x = NP.x + Math.cos(a) * r0, z = NP.z + Math.sin(a) * r0;
      if (Math.abs(z - NP.z) < 5 && x < NP.x) continue;
      if (!isFree(x, z, 5)) continue;
      addHouse(x, z, Math.atan2(NP.x - x, NP.z - z), 'noor');
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.05;
      const r0 = 37 + R() * 5;
      const x = NP.x + Math.cos(a) * r0, z = NP.z + Math.sin(a) * r0;
      if (Math.abs(z - NP.z) < 6 && x < NP.x) continue;
      if (!isFree(x, z, 5)) continue;
      addHouse(x, z, Math.atan2(NP.x - x, NP.z - z), 'noor');
    }
  }
  // Mariapur: pastel tiled-roof cottages, a whitewashed church with a bell tower, a cross in the square, a cemetery
  {
    layout.mp = MP;
    dirtCircles.push({ x: MP.x, z: MP.z, r: 13, s: 0.95 });
    occupy(MP.x, MP.z, 9);
    MP.church = { x: MP.x - 2, z: MP.z + 26, rot: Math.PI };
    occupy(MP.church.x, MP.church.z, 13);
    dirtCircles.push({ x: MP.church.x, z: MP.church.z - 11, r: 8, s: 0.9 });
    colliders.push({ kind: 'b', x: MP.church.x, z: MP.church.z + 1, rot: 0, hw: 4.6, hd: 9 });
    colliders.push({ kind: 'c', x: MP.x, z: MP.z, r: 1.1 }); // the cross on its pedestal
    surfaces.push({ kind: 'b', x: MP.church.x, z: MP.church.z - 0.8, rot: 0, hw: 4.8, hd: 9.5, top: heightAt(MP.church.x, MP.church.z) + 0.5 });
    MP.cem = { x: MP.x - 32, z: MP.z + 18, rot: 0, hw: 10, hd: 8 };
    occupy(MP.cem.x, MP.cem.z, 14);
    const C = MP.cem;
    colliders.push({ kind: 'b', x: C.x, z: C.z + C.hd, rot: 0, hw: C.hw, hd: 0.2 });
    colliders.push({ kind: 'b', x: C.x - C.hw, z: C.z, rot: 0, hw: 0.2, hd: C.hd });
    colliders.push({ kind: 'b', x: C.x + C.hw, z: C.z - C.hd / 2 - 1, rot: 0, hw: 0.2, hd: C.hd / 2 - 1 });
    colliders.push({ kind: 'b', x: C.x + C.hw, z: C.z + C.hd / 2 + 1, rot: 0, hw: 0.2, hd: C.hd / 2 - 1 });
    colliders.push({ kind: 'b', x: C.x, z: C.z - C.hd, rot: 0, hw: C.hw, hd: 0.2 });
    C.graves = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) if (R() < 0.85) C.graves.push({ x: C.x - 7 + i * 3.6 + (R() - 0.5) * 0.3, z: C.z - 6 + j * 2.5, rot: Math.PI / 2 + (R() - 0.5) * 0.08, s: 0.85 + R() * 0.3, v: Math.floor(R() * 3) });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.1;
      const r0 = 20 + (i % 2) * 8 + R() * 2;
      const x = MP.x + Math.cos(a) * r0, z = MP.z + Math.sin(a) * r0;
      if (Math.abs(z - MP.z) < 5 && x > MP.x) continue;
      if (!isFree(x, z, 5)) continue;
      addHouse(x, z, Math.atan2(MP.x - x, MP.z - z), 'goan');
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.05;
      const r0 = 37 + R() * 5;
      const x = MP.x + Math.cos(a) * r0, z = MP.z + Math.sin(a) * r0;
      if (Math.abs(z - MP.z) < 6 && x > MP.x) continue;
      if (!isFree(x, z, 5)) continue;
      addHouse(x, z, Math.atan2(MP.x - x, MP.z - z), 'goan');
    }
  }
  // stations: keep each platform and station yard clear; Sonpur gets a little hamlet and a lane to Vitthalwadi
  for (const T of TRACKS) for (const h of T.halts) {
    const sl = T.slope(h.x), tl = Math.hypot(1, sl), tx = 1 / tl, tz = sl / tl, nx = -tz * h.side, nz = tx * h.side;
    const len = (h.L ?? 110) + 10;
    for (let u = -len / 2; u <= len / 2; u += 6) {
      const x = h.x + u * tx, z = T.z(x);
      occupy(x + nx * 7, z + nz * 7, 6);
      if (h.big) occupy(x + nx * 18, z + nz * 18, 8);
    }
    const yo = h.W ? 1.75 + h.W / 2 : h.big ? 21 : 13;
    h.yard = { x: h.x + nx * yo, z: T.z(h.x) + nz * yo };
    if (!h.W) dirtCircles.push({ ...h.yard, r: h.big ? 12 : 7, s: 0.8 });
  }
  {
    const h = TRACK.halts[0], Y = h.yard;
    layout.station = { ...STATION, yard: Y };
    // a lane from the station yard to Vitthalwadi
    road([[Y.x, Y.z + 8], [Y.x + 40, Y.z + 40], [MH.x - 30, MH.z - 10], [MH.x - 14, MH.z]], 2.4);
    // a ring of homes north-west of the station
    const HC = { x: Y.x - 40, z: Y.z + 55 };
    layout.sonpur = HC;
    dirtCircles.push({ x: HC.x, z: HC.z, r: 11, s: 0.9 });
    occupy(HC.x, HC.z, 8);
    road([[Y.x, Y.z + 8], [HC.x + 8, HC.z - 6]], 2.0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4, d = 17 + R() * 3;
      const x = HC.x + Math.cos(a) * d, z = HC.z + Math.sin(a) * d;
      if (!isFree(x, z, 5.5)) continue;
      addHouse(x, z, Math.atan2(HC.x - x, HC.z - z), R() < 0.5 ? 'round' : 'rect');
    }
  }
  // bus stops: a shelter beside the road at each village
  layout.busStops = [];
  {
    const stops = [
      ['गाँव', 'Gaon', roadX(70), 70, 0], ['छोटा गाँव', 'Chhota Gaon', -196, 168, 0.75], ['मारुधर', 'Marudhar', 254, 158, Math.PI / 2],
      ['बांग्लाग्राम', 'Banglagram', 228, -270, Math.PI / 2], ['तेन्नूर', 'Thennoor', 214, 413, 1.37], ['विट्ठलवाड़ी', 'Vitthalwadi', -570, -72, 1.36],
      ['पहाड़ी गाँव', 'Pahadi Gaon', roadX(warpR(525)), warpR(525), 0], ['नूरपुर', 'Noorpur', 798, -8, 1.98], ['मरियापुर', 'Mariapur', -390, 773, -1.4], ['बाँस पहाड़ी', 'Bamboo Hill', 308, -611, 0],
    ];
    for (const [hi, en, x0, z0, dir] of stops) {
      // dir: the road's heading (0 = along +z); try either side of it for a free spot
      const nx = Math.cos(dir), nz = -Math.sin(dir);
      for (const side of [1, -1, 1.4, -1.4]) {
        const x = x0 + nx * 4.2 * side, z = z0 + nz * 4.2 * side;
        if (!isFree(x, z, 2.2)) continue;
        const rot = Math.atan2(x0 - x, z0 - z); // the shelter faces the road
        layout.busStops.push({ hi, en, x, z, rot, road: { x: x0, z: z0 } });
        occupy(x, z, 2.6);
        colliders.push({ kind: 'b', ...rotPt({ x, z, rot }, 0, -0.8), rot, hw: 1.4, hd: 0.12 });
        break;
      }
    }
  }
  // rocky hills: clusters of big weathered boulders and crags on the slopes
  layout.crags = [];
  for (const [cx, cz, cr] of ROCKY) for (let i = 0; i < 26; i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * cr;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const sz = 1.6 + R() * R() * 6.5;
    if (!isFree(x, z, sz * 0.6) || dirtMask(x, z) > 0.1 || riverDist(x, z) < RIVER_HALF + 6) continue;
    layout.crags.push({ x, z, s: sz, rot: R() * 6, v: Math.floor(R() * 3) });
    occupy(x, z, sz * 0.7);
    colliders.push({ kind: 'c', x, z, r: sz * 0.72 });
  }
  for (let i = 0; i < 900 && layout.crags.length < 440; i++) {
    const a = R() * Math.PI * 2, d = 440 + R() * 960;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const sz = 1.2 + R() * 3;
    if (!isFree(x, z, sz) || dirtMask(x, z) > 0.1 || riverDist(x, z) < RIVER_HALF + 6) continue;
    layout.crags.push({ x, z, s: sz, rot: R() * 6, v: Math.floor(R() * 3) });
    occupy(x, z, sz * 0.7);
    colliders.push({ kind: 'c', x, z, r: sz * 0.72 });
  }

  // Chhota Gaon homes ring the square, leaving room for the post office, hospital and the lane in
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.15;
    const d = 18 + R() * 3;
    const x = NV.x + Math.cos(a) * d, z = NV.z + Math.sin(a) * d;
    if (Math.abs(z - NV.z) < 5 && x > NV.x) continue; // the lane
    if (!isFree(x, z, 5.5)) continue;
    addHouse(x, z, Math.atan2(NV.x - x, NV.z - z), R() < 0.5 ? 'round' : 'rect');
  }

  // Yard details per house
  for (const h of layout.houses) {
    const at = (f, r) => rotPt(h, r, f);
    if (R() < 0.45 && h.type !== 'noor' && h.type !== 'goan') layout.tulsis.push({ ...at(5.2, (R() - 0.5) * 2), rot: h.rot });
    if (R() < 0.4) layout.charpais.push({ ...at(5.0, 2.5 + R()), rot: h.rot + Math.PI / 2 + (R() - 0.5) * 0.4 });
    if (R() < 0.7) layout.pots.push({ ...at(3.6, -1.6 - R() * 0.6), s: 0.8 + R() * 0.4 });
    if (layout.woodpiles.length < 2 && h.type === 'rect' && h.side < 0) {
      const p = at(2, 5.2);
      if (isFree(p.x, p.z, 1.5)) {
        layout.woodpiles.push({ ...p, rot: h.rot, house: h });
        colliders.push({ kind: 'c', ...p, r: 0.8 });
        occupy(p.x, p.z, 1.5);
      }
    }
    if (R() < 0.35) {
      const p = at(-6, (R() - 0.5) * 4);
      if (isFree(p.x, p.z, 2)) {
        layout.haystacks.push({ ...p, s: 0.8 + R() * 0.4 });
        occupy(p.x, p.z, 2);
        colliders.push({ kind: 'c', x: p.x, z: p.z, r: 1.6 });
      }
    }
  }

  for (const [x, z] of [[-38, -20], [-37, 15], [-39, 35], [17, -40], [16, -60], [-120, 0]]) {
    if (!isFree(x, z, 2.5)) continue;
    layout.haystacks.push({ x, z, s: 1 + R() * 0.3, field: true });
    occupy(x, z, 2.5);
    colliders.push({ kind: 'c', x, z, r: 1.8 });
  }

  for (const [x, z] of [[24, 14], [31, 21], [21, 31], [-32, -28], [-30, 66], [42, -8], [EH.x - 10, EH.z + 26]]) {
    if (!isFree(x, z, 2.5) || dirtMask(x, z) > 0.4) continue;
    layout.cows.push({ x, z, rot: R() * Math.PI * 2, color: R() < 0.6 ? '#ece6da' : '#b98e64', phase: R() * 10 });
    occupy(x, z, 2.5);
    colliders.push({ kind: 'c', x, z, r: 1.1 });
  }

  for (const [x, z] of [[7, 38], [8, -36], [-11, 44]]) {
    if (isFree(x, z, 3)) {
      layout.cart = { x, z, rot: 0.3 + R() };
      occupy(x, z, 3);
      colliders.push({ kind: 'b', x, z, rot: layout.cart.rot, hw: 1.1, hd: 1.4 });
      break;
    }
  }

  for (let i = 0; i < 420; i++) {
    const z = (R() * 2 - 1) * 760;
    const side = R() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (RIVER_HALF - 1 + R() * 4);
    if (Math.abs(z - layout.donkeys.z) < 12 && side < 0) continue;
    if (Math.hypot(x - GHAT.x, z - GHAT.z) < 7 || Math.abs(z - FOOT.z) < 5 || trackDist(x, z) < 8) continue;
    layout.rocks.push({ x, z, s: 0.3 + R() * 0.9, rot: R() * 6.28 });
  }

  const treeOk = (x, z, r) => !fieldType(x, z) && trackDist(x, z) > 8 && dirtMask(x, z) < 0.2 && isFree(x, z, r);
  for (let z = -900; z < 900; z += 6 + R() * 11) {
    const side = R() < 0.5 ? -1 : 1;
    const x = riverX(z) + side * (RIVER_HALF + 3 + R() * 9);
    if (Math.hypot(x, z) > 950 || !treeOk(x, z, 2.5)) continue;
    layout.palms.push({ x, z, s: 0.85 + R() * 0.35, rot: R() * 6.28, v: Math.floor(R() * 3) });
    occupy(x, z, 1.5);
    colliders.push({ kind: 'c', x, z, r: 0.35 });
  }
  for (let i = 0; i < 160 && layout.palms.length < 480; i++) {
    const h = layout.houses[Math.floor(R() * layout.houses.length)];
    const a = R() * Math.PI * 2, d = 7 + R() * 5;
    const x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
    if (!treeOk(x, z, 2) || riverDist(x, z) < RIVER_HALF + 3) continue;
    layout.palms.push({ x, z, s: 0.85 + R() * 0.35, rot: R() * 6.28, v: Math.floor(R() * 3) });
    occupy(x, z, 1.5);
    colliders.push({ kind: 'c', x, z, r: 0.35 });
  }

  // Broadleaf trees — village groves, hillsides and far slopes
  for (let i = 0; i < 200000 && layout.trees.length < 6400; i++) {
    const far = R() < 0.25;
    const rad = far ? 1480 + R() * 560 : Math.sqrt(R()) * 1480;
    const a = R() * Math.PI * 2;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    if (rad < 12) continue;
    const grove = noise2(x * 0.02 + 3, z * 0.02 - 7) * 0.5 + 0.5;
    if (R() > grove * 1.4 - 0.15) continue;
    if (riverDist(x, z) < RIVER_HALF + 5 || !treeOk(x, z, far ? 5 : 3.5)) continue;
    const s = 0.85 + R() * 0.6;
    layout.trees.push({ x, z, s, rot: R() * 6.28, v: Math.floor(R() * 3) });
    occupy(x, z, 2.5);
    colliders.push({ kind: 'c', x, z, r: 0.35 * s });
  }
  for (const [dx, dz] of [[-9, -6], [8, -6], [-9, 5]]) { layout.trees.push({ x: NP.kab.x + dx, z: NP.kab.z + dz, s: 1.2, rot: dx, v: 1 }); colliders.push({ kind: 'c', x: NP.kab.x + dx, z: NP.kab.z + dz, r: 0.4 }); }
  for (const [dx, dz] of [[-8, -6.5], [-8, 6.5]]) { layout.trees.push({ x: MP.cem.x + dx, z: MP.cem.z + dz, s: 1.1, rot: dz, v: 2 }); colliders.push({ kind: 'c', x: MP.cem.x + dx, z: MP.cem.z + dz, r: 0.4 }); }
  // a lone tree beside the hilltop shrine
  layout.trees.push({ x: HILLTOP.x - 6, z: HILLTOP.z + 3, s: 1.5, rot: 1, v: 0 });
  colliders.push({ kind: 'c', x: HILLTOP.x - 6, z: HILLTOP.z + 3, r: 0.5 });

  for (let i = 0; i < 90000 && layout.bushes.length < 5600; i++) {
    const x = (R() * 2 - 1) * 1480, z = (R() * 2 - 1) * 1480;
    if (Math.hypot(x, z) > 1480) continue;
    if (fieldType(x, z) && !isBund(x, z)) continue;
    if (riverDist(x, z) < RIVER_HALF + 2 || trackDist(x, z) < 6 || dirtMask(x, z) > 0.15 || !isFree(x, z, 1.2)) continue;
    layout.bushes.push({ x, z, s: 0.6 + R() * 0.7, rot: R() * 6.28, v: Math.floor(R() * 3) });
    occupy(x, z, 0.8);
  }
  buildDirtGrid();
})();

export function regionName(x, z) {
  if (layout.pasture && Math.hypot(x - layout.pasture.x, z - layout.pasture.z) < layout.pasture.r + 6) return 'The charagah — village grazing ground';
  if (layout.pasture && Math.hypot(x - layout.pasture.pen.x, z - layout.pasture.pen.z) < 10) return 'The cattle pen';
  for (const T of TRACKS) for (const h of T.halts) if (h.yard && Math.hypot(x - h.yard.x, z - h.yard.z) < (h.big ? 70 : 40)) return h.big ? `${h.name} railway station` : h.W ? h.name : `${h.name} halt`;
  if (layout.sonpur && Math.hypot(x - layout.sonpur.x, z - layout.sonpur.z) < 35) return 'Sonpur — the station hamlet';
  const A = layout.airstrip;
  if (A) {
    const dx = x - A.x, dz = z - A.z, c = Math.cos(A.rot), sn = Math.sin(A.rot);
    if (Math.abs(dx * c - dz * sn) < A.hw + 26 && Math.abs(dx * sn + dz * c) < A.len / 2 + 12) return 'Gaon airstrip — the flying club';
  }
  if (Math.hypot(x - WILD.tiger.x, z - WILD.tiger.z) < WILD.tiger.area) return 'Tiger country — the wild hills';
  if (WILD.leopards.some((l) => Math.hypot(x - l.x, z - l.z) < l.area)) return 'Leopard rocks';
  if (Math.hypot(x - WILD.wolf.x, z - WILD.wolf.z) < WILD.wolf.area) return 'Wolf hills';
  if (Math.hypot(x - WILD.elephant.x, z - WILD.elephant.z) < WILD.elephant.area) return 'Elephant forest';
  if (Math.abs(z) > 430 && riverDist(x, z) < RIVER_HALF + 25) return 'Crocodile banks — keep clear of the water';
  if (Math.hypot(x - HILLTOP.x, z - HILLTOP.z) < 22) return 'Hilltop shrine — the steps begin here';
  if (Math.hypot(x - PEAK.x, z - PEAK.z) < 26) return 'Shikhar — the summit shrine, highest point around';
  { const st = stairAt(x, z); if (st && st.d < 6) return `The stone stairway — step ${Math.min(STAIRS.N, Math.floor(st.s / STAIRS.run) + 1)} of ${STAIRS.N}`; }
  if (Math.hypot(x - PEAK.x, z - PEAK.z) < 140) return 'Shikhar parvat — the great mountain';
  if (NP.kab && Math.abs(x - NP.kab.x) < NP.kab.hw + 1 && Math.abs(z - NP.kab.z) < NP.kab.hd + 1) return 'Kabristan — the Noorpur graveyard';
  if (NP.masjid && Math.hypot(x - NP.masjid.x, z - NP.masjid.z) < 13) return 'Noorpur Masjid';
  if (Math.hypot(x - NP.x, z - NP.z) < 60) return 'Noorpur — a Muslim village';
  if (MP.cem && Math.abs(x - MP.cem.x) < MP.cem.hw + 1 && Math.abs(z - MP.cem.z) < MP.cem.hd + 1) return 'The Mariapur cemetery';
  if (MP.church && Math.hypot(x - MP.church.x, z - MP.church.z) < 13) return "St. Mary's Church";
  if (Math.hypot(x - MP.x, z - MP.z) < 60) return 'Mariapur — a Christian village';
  for (const b of layout.busStops) if (Math.hypot(x - b.x, z - b.z) < 5) return `Bus stop — ${b.en}`;
  if (trackDist(x, z) < 9) return Math.hypot(x - CROSSING.x, z - CROSSING.z) < 14 ? 'Railway crossing' : 'The railway line';
  if (Math.hypot(x - WF.x + 2, z - WF.z) < 11) return 'The little waterfall';
  if (Math.hypot(x - TEA.x + 1.5, z - TEA.z) < 6) return 'Chai stall';
  if (layout.postOffice && Math.hypot(x - layout.postOffice.x, z - layout.postOffice.z) < 8) return 'Daakghar — the post office';
  if (layout.hospital && Math.hypot(x - layout.hospital.x, z - layout.hospital.z) < 9) return 'The village hospital';
  if (Math.hypot(x - NV.x, z - NV.z) < 30) return 'Chhota Gaon';
  if (Math.hypot(x - SCHOOL.x + 5, z - SCHOOL.z) < 16) return 'Village school';
  if (Math.abs(x - GARDEN.x) < GARDEN.hw + 1 && Math.abs(z - GARDEN.z) < GARDEN.hd + 1) return 'The flower garden';
  if (Math.hypot(x - layout.donkeys.x, z - layout.donkeys.z) < 14) return 'Donkey meadow';
  if (Math.hypot(x - RV.x, z - RV.z) < 60) return 'Marudhar — a Rajasthani village';
  if (Math.hypot(x - BV.x, z - BV.z) < 60) return 'Banglagram — a Bengali village';
  if (Math.hypot(x - MH.x, z - MH.z) < 60) return 'Vitthalwadi — a Maharashtrian village';
  if (Math.hypot(x - PG.x, z - PG.z) < 60) return 'Pahadi Gaon — the hill village';
  for (const [cx, cz, cr] of ROCKY) if (Math.hypot(x - cx, z - cz) < cr) return 'Rocky hills';
  if (x > NE.tea.x0 && x < NE.tea.x1 && z > NE.tea.z0 && z < NE.tea.z1) return 'The tea garden';
  if (Math.hypot(x - NE.x, z - NE.z) < 60) return 'Bamboo hill — a village of the North-East';
  if (Math.hypot(x - TV.x, z - TV.z) < 60) return 'Thennoor — a Tamil village';
  for (const B of BRIDGES.slice(1)) if (Math.hypot(x - B.x, z - B.z) < RIVER_HALF + 8) return 'The road bridge';
  if (Math.hypot(x - RBRIDGE.x, z - RBRIDGE.z) < RIVER_HALF + 8) return 'The road bridge';
  if (x > MARKET.x0 - 3 && x < MARKET.x1 + 3 && Math.abs(z - MARKET.z) < 8) return 'Haat — the village market';
  if (Math.hypot(x - CRICKET.x, z - CRICKET.z) < 12) return 'The cricket ground';
  if (Math.hypot(x - PUMP.x, z - PUMP.z) < 5) return 'The hand pump';
  if (Math.hypot(x - TANK.x, z - TANK.z) < 8) return 'Under the water tank';
  if (Math.hypot(x - FOOT.x, z - FOOT.z) < RIVER_HALF + 6) return 'The footbridge';
  if (riverDist(x, z) < RIVER_HALF + 9) return Math.hypot(x - GHAT.x, z - GHAT.z) < 12 ? 'The ghat' : 'Riverbank';
  if (Math.hypot(x - EH.x, z - EH.z) < 30) return 'Paar gaon — across the river';
  if (Math.hypot(x - layout.temple.x, z - layout.temple.z) < 11) return 'Village temple';
  if (Math.hypot(x - layout.banyan.x, z - layout.banyan.z) < 14) return 'Under the old banyan';
  if (Math.hypot(x - layout.well.x, z - layout.well.z) < 7) return 'The village well';
  if (Math.hypot(x - SQUARE.x, z - SQUARE.z) < SQUARE.r + 2) return 'Chaupal — village square';
  const f = fieldType(x, z);
  if (f) return FIELD_NAMES[f];
  if (heightAt(x, z) > 12) return 'The hills';
  return Math.hypot(x, z) > 160 ? 'Open countryside' : 'Village lanes';
}
