// GPU grass: ~110k instanced blades in a tile that wraps around the player.
// Positions, height and density come from a baked data texture; wind bends every blade.
import * as THREE from 'three';
import { windGLSL, windUniforms } from './wind.js';
import { DATA_HALF } from './world.js';

const TILE = 80;
const COUNT = 170000;

function bladeGeometry() {
  const rows = [0, 0.3, 0.55, 0.8];
  const pos = [], uv = [], idx = [];
  rows.forEach((t) => {
    const w = 0.038 * (1 - t * 0.8);
    const z = t * t * 0.15;
    pos.push(-w, t, z, w, t, z);
    uv.push(0, t, 1, t);
  });
  pos.push(0, 1, 0.15);
  uv.push(0.5, 1);
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const l = (rows.length - 1) * 2;
  idx.push(l, l + 1, l + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export function buildGrass(dataTex) {
  const blade = bladeGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = blade.index;
  geo.setAttribute('position', blade.attributes.position);
  geo.setAttribute('uv', blade.attributes.uv);
  geo.setAttribute('normal', blade.attributes.normal);
  const off = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    off[i * 4] = (Math.random() - 0.5) * TILE;
    off[i * 4 + 1] = (Math.random() - 0.5) * TILE;
    off[i * 4 + 2] = Math.random() * Math.PI * 2;
    off[i * 4 + 3] = Math.random();
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 4));
  geo.instanceCount = COUNT;

  const uniforms = {
    uCenter: { value: new THREE.Vector2() },
    uTile: { value: TILE },
    uData: { value: dataTex },
    uDataHalf: { value: DATA_HALF },
    uBase: { value: new THREE.Color('#2f4a19') },
    uTip: { value: new THREE.Color('#9cbc52') },
    uDry: { value: new THREE.Color('#c9b46a') },
    uMustard: { value: new THREE.Color('#f5c518') },
    uCrop: { value: new THREE.Color('#a9b85a') },
    uCropOn: { value: 1 },
    uFlowers: { value: 0.025 },
    uStubble: { value: new THREE.Color('#b89a5a') },
  };

  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.uniforms.uTime = windUniforms.uTime;
    s.uniforms.uWind = windUniforms.uWind;
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        ${windGLSL}
        attribute vec4 aOffset;
        uniform vec2 uCenter; uniform float uTile; uniform sampler2D uData; uniform float uDataHalf;
        uniform vec3 uBase, uTip, uDry, uMustard, uCrop, uStubble;
        uniform float uCropOn, uFlowers;
        varying vec3 vGrassCol;`
      )
      .replace(
        '#include <beginnormal_vertex>',
        `vec3 objectNormal = normalize(vec3(sin(aOffset.z) * 0.2, 1.0, cos(aOffset.z) * 0.2));`
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec2 gb = aOffset.xy;
        vec2 gp = gb + uTile * floor((uCenter - gb) / uTile + 0.5);
        vec4 gd = texture2D(uData, gp / (2.0 * uDataHalf) + 0.5);
        float gdist = length(gp - uCenter);
        float gfade = 1.0 - smoothstep(uTile * 0.3, uTile * 0.49, gdist);
        float rnd = aOffset.w;
        float keep = step(rnd, gd.g);
        float isMustard = step(0.75, gd.b);
        float isCrop = step(0.25, gd.b) * (1.0 - isMustard);
        float r2 = fract(rnd * 91.7 + aOffset.z);
        float hgt = 0.26 + r2 * 0.34;
        hgt = mix(hgt, 0.95 + r2 * 0.45, isMustard);
        hgt = mix(hgt, 0.7 + r2 * 0.3, isCrop);
        // harvested fields (autumn/winter): short stubble instead of standing crops
        hgt *= 1.0 - (1.0 - uCropOn) * 0.78 * (isMustard + isCrop);
        float wid = 1.0 + isMustard * 0.7 + isCrop * 0.2;
        hgt *= keep * gfade;
        vec3 lp = position;
        lp.x *= wid; lp.y *= hgt; lp.z *= hgt;
        float ca = cos(aOffset.z), sa = sin(aOffset.z);
        vec3 transformed = vec3(gp.x, gd.r - 0.03, gp.y) + vec3(ca * lp.x + sa * lp.z, lp.y, -sa * lp.x + ca * lp.z);
        float bend = position.y * position.y;
        vec2 wv = windAt(gp) * (0.6 + isMustard * 0.25);
        transformed.xz += wv * bend * hgt;
        transformed.y -= dot(wv, wv) * bend * hgt * 0.4;
        float t = position.y;
        vec3 tip = mix(uTip, uDry, smoothstep(0.6, 1.0, fract(rnd * 13.1)) * 0.7);
        tip = mix(tip, uCrop, isCrop);
        vGrassCol = mix(uBase, tip, smoothstep(0.0, 1.0, t));
        vGrassCol = mix(vGrassCol, uMustard, isMustard * smoothstep(0.5, 0.78, t) * step(0.12, r2) * uCropOn);
        vGrassCol = mix(vGrassCol, uStubble, (1.0 - uCropOn) * (isMustard + isCrop));
        float fl = step(1.0 - uFlowers, fract(rnd * 57.3)) * (1.0 - isMustard) * (1.0 - isCrop);
        vec3 flower = mix(vec3(0.95, 0.92, 0.85), vec3(0.75, 0.35, 0.65), step(0.5, fract(rnd * 7.7)));
        vGrassCol = mix(vGrassCol, flower, fl * smoothstep(0.8, 0.95, t));
        vGrassCol *= 0.92 + length(wv) * t * 0.35;
        `
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vGrassCol;')
      .replace(
        '#include <normal_fragment_begin>',
        'float faceDirection = 1.0;\nvec3 normal = normalize(vNormal);\nvec3 nonPerturbedNormal = normal;'
      );
  };
  mat.customProgramCacheKey = () => 'grass';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.userData.setCenter = (x, z) => uniforms.uCenter.value.set(x, z);
  mesh.userData.uniforms = uniforms;
  return mesh;
}
