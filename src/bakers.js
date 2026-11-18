// The big one-off bakes, written so they can run in pieces: each function fills a band of rows [j0, j1) and
// returns it as a plain array buffer. Web Workers run them in parallel at load (see bakepool.js); they also
// run on the main thread as a fallback. Every worker builds the same world (the layout is seeded), so the
// bands join up seamlessly.
import { smoothstep, fbm } from './noise.js';
import {
  INNER_HALF, DATA_HALF, RIVER_HALF, PLAY_RADIUS, heightAt, riverX, riverDist, dirtMask, fieldType, isBund, trackDist, waterfallMask, fallsRock, GARDEN,
  desertMask, tunnelMask, jungleMask, tribDist, TRIB, layout,
} from './world.js';
import { terrainColor } from './terrain.js';

export const BAKE = {
  height: { N: 1969, half: INNER_HALF }, // terrain mesh heights: a grid of N × N vertices (1.83 m apart)
  color: { N: 3072, half: INNER_HALF }, // the terrain's colour map (1.17 m a pixel)
  grass: { N: 2048, half: DATA_HALF }, // grass height / density / crop type (1.76 m a texel)
  map: { N: 2560, half: 2960 }, // the painted area map
};

// float32 → float16 bits (as THREE.DataUtils.toHalfFloat, without needing three here)
const _f = new Float32Array(1), _i = new Uint32Array(_f.buffer);
function toHalf(v) {
  _f[0] = v;
  const x = _i[0], sign = (x >> 16) & 0x8000, e = ((x >> 23) & 0xff) - 112, m = x & 0x7fffff;
  if (e <= 0) return sign; // tiny: zero
  if (e >= 31) return sign | 0x7c00; // huge: infinity
  return sign | (e << 10) | (m >> 13);
}

function heightRows(j0, j1) {
  const { N, half } = BAKE.height, step = (half * 2) / (N - 1), out = new Float32Array((j1 - j0) * N);
  for (let j = j0; j < j1; j++) for (let i = 0; i < N; i++) out[(j - j0) * N + i] = heightAt(-half + i * step, -half + j * step);
  return out.buffer;
}

function colorRows(j0, j1) {
  const { N, half } = BAKE.color, out = new Uint8ClampedArray((j1 - j0) * N * 4), col = [0, 0, 0];
  for (let j = j0; j < j1; j++) {
    const z = -half + ((j + 0.5) / N) * half * 2;
    for (let i = 0; i < N; i++) {
      terrainColor(-half + ((i + 0.5) / N) * half * 2, z, col);
      const k = ((j - j0) * N + i) * 4;
      out[k] = col[0]; out[k + 1] = col[1]; out[k + 2] = col[2]; out[k + 3] = 255;
    }
  }
  return out.buffer;
}

// RGBA half-float: r = height, g = grass density, b = type (0 grass, 0.5 wheat, 1 mustard)
function grassRows(j0, j1) {
  const { N, half } = BAKE.grass, data = new Uint16Array((j1 - j0) * N * 4), one = toHalf(1);
  for (let j = j0; j < j1; j++) {
    const z = -half + ((j + 0.5) / N) * half * 2;
    for (let i = 0; i < N; i++) {
      const x = -half + ((i + 0.5) / N) * half * 2;
      const h = heightAt(x, z);
      const dr = Math.abs(x - riverX(z));
      let dens = 1 - dirtMask(x, z) * 1.15;
      dens *= smoothstep(RIVER_HALF + 1.5, RIVER_HALF + 4.5, dr);
      if (dens > 0) dens *= smoothstep(TRIB.half + 0.5, TRIB.half + 3.5, tribDist(x, z));
      if (dens > 0) dens *= smoothstep(3.0, 5.0, trackDist(x, z));
      if (dens > 0 && tunnelMask(x, z)) dens = 0;
      if (dens > 0) { const jm = jungleMask(x, z); if (jm > 0) dens *= 1 - jm * 0.7; } // under the jungle canopy the grass grows thin
      if (dens > 0) dens *= (1 - waterfallMask(x, z)) * (1 - fallsRock(x, z));
      if (Math.abs(x - GARDEN.x) < GARDEN.hw && Math.abs(z - GARDEN.z) < GARDEN.hd) dens *= 0.08;
      if (dens > 0) { const dm2 = desertMask(x, z); if (dm2 > 0) dens *= 1 - dm2 * 0.85; }
      let type = 0;
      const ft = fieldType(x, z);
      if (ft && !isBund(x, z)) {
        if (ft === 1) type = 1;
        else if (ft === 2) type = 0.5;
        else if (ft === 3) { type = 0.5; dens *= 0.75; } // rice shoots poking out of the water
        else if (ft === 4) dens *= 0.12;
        else if (ft === 5) dens *= 0.3;
        else if (ft === 6) dens = 0;
      } else if (ft) dens *= 0.5;
      else if (dens > 0) dens *= 0.5 + 0.5 * smoothstep(-0.35, 0.25, fbm(x * 0.07, z * 0.07, 2));
      const k = ((j - j0) * N + i) * 4;
      data[k] = toHalf(h);
      data[k + 1] = toHalf(Math.max(0, Math.min(1, dens)));
      data[k + 2] = toHalf(type);
      data[k + 3] = one;
    }
  }
  return data.buffer;
}

const FIELD_COL = [null, [214, 184, 52], [124, 156, 64], [96, 150, 128], [70, 112, 50], [218, 170, 40], [136, 94, 60]];
// the area map's ground: water, fields, desert, dirt, rails and sand, shaded by the slope (light from the
// north-west). Heights are worked out one row either side of the band, for the shading.
function mapRows(j0, j1) {
  const { N, half: E } = BAKE.map, out = new Uint8ClampedArray((j1 - j0) * N * 4);
  const r0 = Math.max(0, j0 - 1), r1 = Math.min(N, j1 + 1), H = new Float32Array((r1 - r0) * N);
  for (let j = r0; j < r1; j++) for (let i = 0; i < N; i++) H[(j - r0) * N + i] = heightAt((i / N) * 2 * E - E, (j / N) * 2 * E - E);
  const h = (i, j) => H[(Math.min(r1 - 1, Math.max(r0, j)) - r0) * N + Math.min(N - 1, Math.max(0, i))];
  const pond = layout.bv?.pond;
  for (let j = j0; j < j1; j++) for (let i = 0; i < N; i++) {
    const x = (i / N) * 2 * E - E, z = (j / N) * 2 * E - E, d = Math.hypot(x, z);
    let r, g, b;
    if (riverDist(x, z) < RIVER_HALF - 0.5 || tribDist(x, z) < TRIB.half - 0.3 || (pond && Math.hypot(x - pond.x, z - pond.z) < pond.r)) { r = 74; g = 140; b = 168; }
    else {
      const hill = Math.min(1, Math.max(0, (h(i, j) - 4) / 50));
      r = 128 - hill * 30; g = 160 - hill * 40; b = 92 - hill * 30;
      const ft = fieldType(x, z);
      if (ft) [r, g, b] = FIELD_COL[ft];
      const dsm = desertMask(x, z);
      if (dsm > 0) { r += (222 - r) * dsm; g += (186 - g) * dsm; b += (130 - b) * dsm; }
      if (d < PLAY_RADIUS && dirtMask(x, z) > 0.35) { r = 196; g = 160; b = 112; }
      if (trackDist(x, z) < 2.2) { r = 92; g = 86; b = 80; }
      if (riverDist(x, z) < RIVER_HALF + 3) { r = 214; g = 196; b = 150; }
      const sh = Math.max(0.6, Math.min(1.35, 1 - ((h(i + 1, j) - h(i - 1, j)) + (h(i, j + 1) - h(i, j - 1))) * 0.18));
      r *= sh; g *= sh; b *= sh;
    }
    if (d > PLAY_RADIUS) { r *= 0.55; g *= 0.55; b *= 0.55; }
    const k = ((j - j0) * N + i) * 4;
    out[k] = r; out[k + 1] = g; out[k + 2] = b; out[k + 3] = 255;
  }
  return out.buffer;
}

const KINDS = { height: heightRows, color: colorRows, grass: grassRows, map: mapRows };
export function bakeRows(kind, j0, j1) { return KINDS[kind](j0, j1); }
