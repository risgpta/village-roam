// Terrain: a detailed inner mesh with a baked color map, a coarse outer ring of hills and mountains,
// and a grass data texture (height / density / crop type) for GPU grass.
import * as THREE from 'three';
import { fbm, noise2, smoothstep } from './noise.js';
import {
  INNER_HALF, OUTER_HALF, MID_HALF, DATA_HALF, WATER_Y, RIVER_HALF, heightAt, riverX, dirtMask, fieldType, isBund, trackDist, waterfallMask, fallsRock, roadX, GARDEN, desertMask,
} from './world.js';
import { detailCanvas, toTexture } from './textures.js';

const C = {
  g1: [78, 112, 46], g2: [108, 136, 58], dry: [158, 148, 88], dirt: [178, 134, 90], dirt2: [150, 108, 72],
  sand: [194, 174, 134], mud: [84, 78, 56], soil: [104, 104, 54], crop: [96, 116, 52], hill: [66, 94, 44],
  rock: [118, 112, 98], ballast: [122, 112, 100], rut: [128, 92, 62],
  desert: [214, 176, 122], desert2: [196, 150, 98], paddy: [74, 88, 62], cane: [92, 88, 58], sunsoil: [98, 110, 56], plough1: [92, 62, 40], plough2: [128, 92, 60],
};
const mix = (a, b, t, o) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

export function terrainColor(x, z, out) {
  const h = heightAt(x, z);
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
  if (h < WATER_Y + 0.1) mix(c, C.mud, smoothstep(WATER_Y + 0.1, WATER_Y - 1.0, h), c);
  { const wm = waterfallMask(x, z); if (wm > 0) mix(c, C.mud, wm * 0.85, c); const fr = fallsRock(x, z); if (fr > 0) mix(c, C.rock, fr, c); }
  { const dm2 = desertMask(x, z); if (dm2 > 0) mix(c, mix(C.desert, C.desert2, noise2(x * 0.08, z * 0.08) * 0.5 + 0.5, [0, 0, 0]), dm2 * 0.9, c); }
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
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nvarying vec2 vWXZ;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float dt1 = texture2D(uDetail, vWXZ * 0.28).r;
         float dt2 = texture2D(uDetail, vWXZ * 0.038).r;
         diffuseColor.rgb *= (0.55 + dt1 * 0.9) * (0.75 + dt2 * 0.5);`
      );
  };
  mat.customProgramCacheKey = () => 'terrain-detail-' + (params.map ? 'map' : 'vc');
  return mat;
}

// big static meshes: once the GPU has them, the JavaScript copies are just dead weight
function freeAfterUpload(geo) {
  const drop = function () { this.array = new this.array.constructor(0); };
  for (const a of Object.values(geo.attributes)) a.onUpload(drop);
  if (geo.index) geo.index.onUpload(drop);
}
export function buildTerrain() {
  const group = new THREE.Group();
  // --- inner: baked color map ---
  const N = 3072;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  const col = [0, 0, 0];
  for (let py = 0; py < N; py++) {
    const z = -INNER_HALF + ((py + 0.5) / N) * INNER_HALF * 2;
    for (let px = 0; px < N; px++) {
      const x = -INNER_HALF + ((px + 0.5) / N) * INNER_HALF * 2;
      terrainColor(x, z, col);
      const i = (py * N + px) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const map = toTexture(cv);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = 16;

  const geo = new THREE.PlaneGeometry(INNER_HALF * 2, INNER_HALF * 2, 1440, 1440);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  freeAfterUpload(geo);
  const inner = new THREE.Mesh(geo, detailMaterial({ map }));
  inner.receiveShadow = true;
  group.add(inner);

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
  return group;
}

// RGBA half-float: r = height, g = grass density, b = type (0 grass, 0.5 wheat, 1 mustard)
export function buildGrassData() {
  const N = 2560;
  const data = new Uint16Array(N * N * 4);
  const toH = THREE.DataUtils.toHalfFloat;
  for (let py = 0; py < N; py++) {
    const z = -DATA_HALF + ((py + 0.5) / N) * DATA_HALF * 2;
    for (let px = 0; px < N; px++) {
      const x = -DATA_HALF + ((px + 0.5) / N) * DATA_HALF * 2;
      const h = heightAt(x, z);
      const dr = Math.abs(x - riverX(z));
      let dens = 1 - dirtMask(x, z) * 1.15;
      dens *= smoothstep(RIVER_HALF + 1.5, RIVER_HALF + 4.5, dr);
      dens *= smoothstep(3.0, 5.0, trackDist(x, z));
      dens *= (1 - waterfallMask(x, z)) * (1 - fallsRock(x, z));
      if (Math.abs(x - GARDEN.x) < GARDEN.hw && Math.abs(z - GARDEN.z) < GARDEN.hd) dens *= 0.08;
      { const dm2 = desertMask(x, z); if (dm2 > 0) dens *= 1 - dm2 * 0.85; }
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
      else dens *= 0.5 + 0.5 * smoothstep(-0.35, 0.25, fbm(x * 0.07, z * 0.07, 2));
      const i = (py * N + px) * 4;
      data[i] = toH(h);
      data[i + 1] = toH(Math.max(0, Math.min(1, dens)));
      data[i + 2] = toH(type);
      data[i + 3] = toH(1);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  // nothing reads it back on the CPU: let the 50 MB array go once it's uploaded
  tex.onUpdate = () => { tex.image = { data: null, width: N, height: N }; tex.onUpdate = null; };
  return tex;
}
