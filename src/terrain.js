// Terrain: a detailed inner mesh with a baked color map, a coarse outer ring of hills and mountains,
// and a grass data texture (height / density / crop type) for GPU grass.
import * as THREE from 'three';
import { fbm, noise2, smoothstep } from './noise.js';
import {
  INNER_HALF, OUTER_HALF, MID_HALF, DATA_HALF, WATER_Y, RIVER_HALF, heightAt, riverX, dirtMask, fieldType, isBund, trackDist, waterfallMask, fallsRock, roadX, GARDEN, desertMask, TRACKS, LID_W, tunnelMask, dipMask, jungleMask, tribDist, TRIB,
} from './world.js';
import { detailCanvas, toTexture } from './textures.js';
import { microBumpGLSL } from './realism.js';

const C = {
  g1: [78, 112, 46], g2: [108, 136, 58], dry: [158, 148, 88], dirt: [178, 134, 90], dirt2: [150, 108, 72],
  sand: [194, 174, 134], mud: [84, 78, 56], soil: [104, 104, 54], crop: [96, 116, 52], hill: [66, 94, 44],
  rock: [118, 112, 98], ballast: [122, 112, 100], rut: [128, 92, 62], forest: [46, 62, 30], leaf: [74, 70, 40], meadow: [92, 132, 52],
  desert: [214, 176, 122], desert2: [196, 150, 98], paddy: [74, 88, 62], cane: [92, 88, 58], sunsoil: [98, 110, 56], plough1: [92, 62, 40], plough2: [128, 92, 60],
};
const mix = (a, b, t, o) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

export function terrainColor(x, z, out) {
  const h = heightAt(x, z, false); // the hill as it looks from outside, even over a tunnel
  const dr = Math.abs(x - riverX(z));
  const d = Math.hypot(x, z);
  const n = fbm(x * 0.05, z * 0.05, 3) * 0.5 + 0.5;
  const c = [0, 0, 0];
  mix(C.g1, C.g2, n, c);
  const dry = smoothstep(0.15, 0.55, fbm(x * 0.012 + 40, z * 0.012, 3));
  mix(c, C.dry, dry * 0.5, c);
  mix(c, C.hill, smoothstep(140, 230, d) * 0.6, c);
  if (d > 380) mix(c, C.rock, smoothstep(0.1, 0.5, fbm(x * 0.01, z * 0.01, 3)) * smoothstep(380, 600, d) * 0.6, c);
  const ft = fieldType(x, z);
  if (ft) {
    const bund = isBund(x, z);
    if (ft === 1) mix(c, bund ? C.dirt2 : C.soil, 0.75, c);
    else if (ft === 2) mix(c, bund ? C.dirt2 : C.crop, 0.75, c);
    else if (ft === 3) mix(c, bund ? C.dirt2 : C.paddy, 0.85, c);
    else if (ft === 4) mix(c, bund ? C.dirt2 : C.cane, 0.8, c);
    else if (ft === 5) mix(c, bund ? C.dirt2 : C.sunsoil, 0.75, c);
    else if (ft === 6) {
      const furrow = Math.sin(z * Math.PI * 2 / 0.9) * 0.5 + 0.5;
      mix(c, mix(C.plough1, C.plough2, furrow, [0, 0, 0]), 0.92, c);
    }
  }
  const td = trackDist(x, z);
  if (td < 4.5) mix(c, C.ballast, (1 - smoothstep(2.6, 4.5, td)) * 0.85, c);
  const dm = dirtMask(x, z);
  if (dm > 0) mix(c, mix(C.dirt, C.dirt2, noise2(x * 0.5, z * 0.5) * 0.5 + 0.5, [0, 0, 0]), dm, c);
  // the main road: packed brown earth, a little darker in the two wheel ruts worn by carts and buses
  if (z > -700 && z < 840) {
    const dx = Math.abs(x - roadX(z)) + noise2(x * 0.7, z * 0.7) * 0.15;
    if (dx < 2.4) {
      const rut = Math.exp(-((dx - 0.95) ** 2) / 0.05) * (0.6 + 0.4 * noise2(x * 2, z * 0.4));
      mix(c, C.rut, rut * 0.45, c);
    }
  }
  mix(c, C.sand, (1 - smoothstep(RIVER_HALF + 1.5, RIVER_HALF + 5, dr)) * 0.9, c);
  { const td = tribDist(x, z); if (td < TRIB.half + 5) mix(c, C.sand, (1 - smoothstep(TRIB.half + 0.5, TRIB.half + 4.5, td)) * 0.85, c); } // the little river's sandy banks
  if (h < WATER_Y + 0.1 && dipMask(x, z) < 0.05) mix(c, C.mud, smoothstep(WATER_Y + 0.1, WATER_Y - 1.0, h), c);
  { const wm = waterfallMask(x, z); if (wm > 0) mix(c, C.mud, wm * 0.85, c); const fr = fallsRock(x, z); if (fr > 0) mix(c, C.rock, fr, c); }
  { const dm2 = desertMask(x, z); if (dm2 > 0) mix(c, mix(C.desert, C.desert2, noise2(x * 0.08, z * 0.08) * 0.5 + 0.5, [0, 0, 0]), dm2 * 0.9, c); }
  { const jm = jungleMask(x, z); if (jm > 0) mix(c, mix(C.forest, C.leaf, noise2(x * 0.15, z * 0.15) * 0.5 + 0.5, [0, 0, 0]), jm * 0.75, c); } // the jungle's dark leafy floor
  { const dp = dipMask(x, z); if (dp > 0.3) mix(c, C.meadow, (dp - 0.3) * 0.9, c); } // the lush meadow down in the valley
  const k = 0.92 + noise2(x * 0.9, z * 0.9) * 0.08;
  out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
}

function detailMaterial(params) {
  const detail = toTexture(detailCanvas(), { srgb: false });
  const mat = new THREE.MeshLambertMaterial(params);
  mat.onBeforeCompile = (s) => {
    s.uniforms.uDetail = { value: detail };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWXZ;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uDetail;\nvarying vec2 vWXZ;\n${microBumpGLSL}`)
      // the ground has real relief up close: clods, grit and pebbles catch the low sun
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
         float gNear = 1.0 - smoothstep(20.0, 60.0, length(vViewPosition));
         float gH = texture2D(uDetail, vWXZ * 0.28).r * 0.6 + texture2D(uDetail, vWXZ * 0.61).r * 0.4;
         normal = microBump(normal, -vViewPosition, gH * 0.02 * gNear);`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float dt1 = texture2D(uDetail, vWXZ * 0.28).r;
         float dt2 = texture2D(uDetail, vWXZ * 0.038).r;
         diffuseColor.rgb *= (0.55 + dt1 * 0.9) * (0.75 + dt2 * 0.5);`
      );
  };
  mat.customProgramCacheKey = () => 'terrain-detail2-' + (params.map ? 'map' : 'vc');
  return mat;
}

// big static meshes: once the GPU has them, the JavaScript copies are just dead weight
function freeAfterUpload(geo) {
  const drop = function () { this.array = new this.array.constructor(0); };
  for (const a of Object.values(geo.attributes)) a.onUpload(drop);
  if (geo.index) geo.index.onUpload(drop);
}
// heights: the terrain grid (BAKE.height), colors: the colour map's pixels (BAKE.color) — both baked in workers
export function buildTerrain(heights, colors) {
  const group = new THREE.Group();
  const col = [0, 0, 0];
  // --- inner: the baked colour map ---
  const CN = Math.round(Math.sqrt(colors.length / 4));
  const map = new THREE.DataTexture(colors, CN, CN, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true;
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 16;
  map.needsUpdate = true;
  map.onUpdate = () => { map.image = { data: null, width: CN, height: CN }; map.onUpdate = null; }; // the GPU has it now

  // The inner land is cut into square tiles that share one colour map: tiles out of view are skipped, and
  // far tiles draw every third vertex (same vertices, a lighter index list).
  const W = Math.round(Math.sqrt(heights.length)), GRID = W - 1, TILES = 16, TN = GRID / TILES, STEP = (INNER_HALF * 2) / GRID, COARSE = 3;
  const hgt = heights;
  const H = (i, j) => hgt[Math.min(GRID, Math.max(0, j)) * W + Math.min(GRID, Math.max(0, i))];
  const indexFor = (st) => {
    const idx = [], w = TN + 1;
    for (let j = 0; j < TN; j += st) for (let i = 0; i < TN; i += st) {
      const p0 = j * w + i, p1 = p0 + st, p2 = p0 + st * w, p3 = p2 + st;
      idx.push(p0, p2, p1, p1, p2, p3);
    }
    return new THREE.BufferAttribute(new Uint16Array(idx), 1);
  };
  const fineIdx = indexFor(1), coarseIdx = indexFor(COARSE);
  const mat = detailMaterial({ map });
  const tiles = [];
  for (let tj = 0; tj < TILES; tj++) for (let ti = 0; ti < TILES; ti++) {
    const w = TN + 1, P = new Float32Array(w * w * 3), Nn = new Float32Array(w * w * 3), U = new Float32Array(w * w * 2);
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      const gi = ti * TN + i, gj = tj * TN + j, o = j * w + i;
      P[o * 3] = -INNER_HALF + gi * STEP; P[o * 3 + 1] = H(gi, gj); P[o * 3 + 2] = -INNER_HALF + gj * STEP;
      // the normal from the heights either side, so neighbouring tiles agree along their shared edge
      const nx = H(gi - 1, gj) - H(gi + 1, gj), nz = H(gi, gj - 1) - H(gi, gj + 1), ny = 2 * STEP, l = Math.hypot(nx, ny, nz);
      Nn[o * 3] = nx / l; Nn[o * 3 + 1] = ny / l; Nn[o * 3 + 2] = nz / l;
      U[o * 2] = gi / GRID; U[o * 2 + 1] = gj / GRID;
    }
    const attrs = { position: new THREE.BufferAttribute(P, 3), normal: new THREE.BufferAttribute(Nn, 3), uv: new THREE.BufferAttribute(U, 2) };
    const make = (index) => {
      const tg = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(attrs)) tg.setAttribute(k, a);
      tg.setIndex(index);
      tg.computeBoundingSphere();
      const m = new THREE.Mesh(tg, mat);
      m.receiveShadow = true;
      group.add(m);
      return m;
    };
    const fine = make(fineIdx), coarse = make(coarseIdx);
    for (const at of Object.values(attrs)) at.onUpload(function () { this.array = new Float32Array(0); });
    coarse.visible = false;
    tiles.push({ fine, coarse, c: fine.geometry.boundingSphere.center, r: fine.geometry.boundingSphere.radius });
  }
  for (const a of [fineIdx, coarseIdx]) a.onUpload(function () { this.array = new Uint16Array(0); });
  group.userData.update = (camPos) => {
    for (const t of tiles) {
      const near = camPos.distanceTo(t.c) - t.r < 420;
      t.fine.visible = near; t.coarse.visible = !near;
    }
  };

  // --- rings round it: mid-detail out to the edge of the walkable land, then coarse far hills & mountains ---
  const ring = (half, S, hole, dy) => {
    const n = Math.round((half * 2) / S);
    const verts = [], cols = [], idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = -half + i * S, z = -half + j * S;
      verts.push(x, heightAt(x, z) + dy, z);
      terrainColor(x, z, col);
      const c = new THREE.Color(col[0] / 255, col[1] / 255, col[2] / 255).convertSRGBToLinear();
      cols.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x0 = -half + i * S, z0 = -half + j * S;
      if (x0 >= -hole && x0 + S <= hole && z0 >= -hole && z0 + S <= hole) continue;
      const a = j * (n + 1) + i, b = a + n + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    og.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    og.setIndex(idx);
    og.computeVertexNormals();
    og.computeBoundingSphere();
    freeAfterUpload(og);
    const m = new THREE.Mesh(og, detailMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    group.add(m);
  };
  ring(MID_HALF, 6, INNER_HALF, -0.03);
  ring(OUTER_HALF, 24, MID_HALF - 24, -0.2);
  // over each tunnel, a strip of hillside laid back across the hollowed-out bore
  for (const T of TRACKS) for (const [a, b] of T.tunnels) {
    const P = T.path, q = {}, verts = [], cols = [], idx = [];
    const nS = Math.max(2, Math.ceil((b - a) / 2)), lat = [];
    for (let v = -LID_W; v <= LID_W + 1e-6; v += 1.25) lat.push(v);
    const nL = lat.length;
    for (let i = 0; i <= nS; i++) {
      P.at(a + ((b - a) * i) / nS, q);
      for (const v of lat) {
        const x = q.x - q.tz * v, z = q.z + q.tx * v;
        // the edges sink a touch into the ground so there's no seam; the middle sits just over the carved hill
        verts.push(x, heightAt(x, z, false) + 0.12 - (Math.abs(v) > LID_W - 0.6 ? 0.25 : 0), z);
        terrainColor(x, z, col);
        const c = new THREE.Color(col[0] / 255, col[1] / 255, col[2] / 255).convertSRGBToLinear();
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < nS; i++) for (let j = 0; j < nL - 1; j++) { const k = i * nL + j; idx.push(k, k + 1, k + nL, k + 1, k + nL + 1, k + nL); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    lg.setIndex(idx);
    lg.computeVertexNormals();
    // make sure the normals point up whichever way the strip was wound
    if (lg.attributes.normal.getY(0) < 0) { lg.setIndex(idx.map((_, n2) => idx[n2 - (n2 % 3) + [0, 2, 1][n2 % 3]])); lg.computeVertexNormals(); }
    lg.computeBoundingSphere();
    const m = new THREE.Mesh(lg, detailMaterial({ vertexColors: true }));
    m.castShadow = true; m.receiveShadow = true;
    m.userData.tunnelLid = true;
    group.add(m);
  }
  return group;
}

// the grass data texture (RGBA half-float: height, density, crop type), from the rows baked in workers
export function buildGrassData(data) {
  const N = Math.round(Math.sqrt(data.length / 4));
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  // nothing reads it back on the CPU: let the 50 MB array go once it's uploaded
  tex.onUpdate = () => { tex.image = { data: null, width: N, height: N }; tex.onUpdate = null; };
  return tex;
}
