// Shared rendering upgrades that lift every object at once rather than one model at a time:
//  - image-based lighting: a sky environment baked per time-of-day, so metal, water pots, paint and glass
//    reflect the sky and everything in shade is filled with sky-coloured light instead of a flat tint
//  - surface grain: flat-coloured plaster, wood, stone, tin and cloth get fine relief, mottling and uneven
//    roughness (triplanar, in the object's own space, so nothing needs UVs and nothing swims)
//  - micro-relief and back-lit translucency snippets used by the terrain, the leaves and the grass
import * as THREE from 'three';

// ---------------- sky environment ----------------
export function createEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSun: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunK: { value: 1 },
  };
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false, uniforms,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uGround, uSun, uSunDir; uniform float uSunK; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = mix(uHorizon, uZenith, pow(max(d.y, 0.0), 0.45));
        col = mix(col, uGround, smoothstep(0.02, -0.18, d.y));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSun * (pow(s, 6.0) * 0.35 + pow(s, 90.0) * 2.2) * uSunK * smoothstep(-0.12, 0.05, d.y);
        gl_FragColor = vec4(col, 1.0);
      }`,
  })));
  let target = null;
  return {
    // p: the time-of-day preset; sunDir: toward the sun (or the moon)
    update(p, sunDir) {
      uniforms.uZenith.value.set(p.sky).multiplyScalar(p.night ? 0.7 : 0.95);
      uniforms.uHorizon.value.set(p.fog).lerp(uniforms.uZenith.value, 0.25);
      uniforms.uGround.value.set(p.ground).multiplyScalar(0.8);
      uniforms.uSun.value.set(p.sun);
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uSunK.value = p.dark ? 0 : p.night ? 0.2 : Math.max(0.1, 1 - Math.max(0, p.clouds - 0.4) * 1.8);
      const next = pmrem.fromScene(envScene, 0, 0.1, 50);
      scene.environment = next.texture;
      scene.environmentIntensity = p.dark ? 0.12 : p.night ? 0.22 : 0.36 + Math.max(0, p.clouds - 0.5) * 0.14;
      target?.dispose();
      target = next;
    },
  };
}

// ---------------- surface grain ----------------
// One small tiling texture. R: fine grain (the relief), G: broad soft mottling (stains, uneven colour and wear).
let grainTex = null;
export function grainTexture() {
  if (grainTex) return grainTex;
  const N = 256, data = new Uint8Array(N * N * 4);
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // tiling value noise on an n × n lattice
  const lattice = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const sample = (a, n, u, v) => {
    const x = u * n, y = v * n, x0 = Math.floor(x), y0 = Math.floor(y);
    let fx = x - x0, fy = y - y0;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const at = (i, j) => a[((j % n + n) % n) * n + ((i % n + n) % n)];
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  const L = [6, 13, 28, 64, 128].map((n) => [lattice(n), n]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, s = (k) => sample(L[k][0], L[k][1], u, v);
    const fine = s(3) * 0.45 + s(4) * 0.35 + rnd() * 0.2;
    const broad = s(0) * 0.5 + s(1) * 0.32 + s(2) * 0.18;
    const o = (j * N + i) * 4;
    data[o] = fine * 255; data[o + 1] = broad * 255; data[o + 2] = 128; data[o + 3] = 255;
  }
  grainTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.magFilter = THREE.LinearFilter; grainTex.minFilter = THREE.LinearMipmapLinearFilter;
  grainTex.generateMipmaps = true; grainTex.anisotropy = 4;
  grainTex.needsUpdate = true;
  return grainTex;
}

// bump a view-space normal from a height that varies across the screen (the same maths three uses for bump maps)
export const microBumpGLSL = /* glsl */ `
vec3 microBump(vec3 n, vec3 viewPos, float h) {
  vec3 sx = dFdx(viewPos), sy = dFdy(viewPos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - g);
}
`;

const BASE_HOOK = THREE.Material.prototype.onBeforeCompile;
function grainMaterial(m) {
  const uGrain = { value: grainTexture() };
  m.onBeforeCompile = (s) => {
    s.uniforms.uGrain = uGrain;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrP;\nvarying vec3 vGrN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrP = position;\nvGrN = normal;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uGrain;\nvarying vec3 vGrP;\nvarying vec3 vGrN;\n${microBumpGLSL}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
        vec3 grW = abs(vGrN); grW = grW * grW + 1e-4; grW /= grW.x + grW.y + grW.z;
        vec3 grP = vGrP * 0.42;
        vec2 grV = texture2D(uGrain, grP.yz).rg * grW.x + texture2D(uGrain, grP.xz).rg * grW.y + texture2D(uGrain, grP.xy).rg * grW.z;
        float grNear = 1.0 - smoothstep(14.0, 42.0, length(vViewPosition));
        float grAmt = smoothstep(0.42, 0.8, roughness) * (1.0 - metalness * 0.5);
        diffuseColor.rgb *= 1.0 + ((grV.g - 0.5) * 0.3 + (grV.r - 0.5) * 0.16 * grNear) * grAmt;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (grV.g - 0.5) * 0.3 * grAmt, 0.05, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = microBump(normal, -vViewPosition, grV.r * 0.0045 * grAmt * grNear);');
  };
  m.customProgramCacheKey = () => 'grain';
  m.needsUpdate = true;
}

// Give every plain hard-surface material under `root` the grain. Left alone: anything already customised
// (fur, cloth that waves), glass and other see-through things, glossy paint and polished metal, and
// whatever `skip` says (people's skin and clothes, which want to stay clean).
export function addSurfaceGrain(root, skip = () => false) {
  const seen = new Set();
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || skip(o)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.transparent || m.roughness < 0.45) continue;
      if (m.onBeforeCompile !== BASE_HOOK || m.bumpMap || m.normalMap) continue;
      grainMaterial(m);
      n++;
    }
  });
  return n;
}

// Leaves and grass lit from behind: thin green things glow when you look through them toward the sun.
// Goes after <lights_fragment_end> in a Lambert material.
export const backlightGLSL = (k) => /* glsl */ `
#if NUM_DIR_LIGHTS > 0
{
  float blT = pow(max(dot(-normalize(vViewPosition), directionalLights[0].direction), 0.0), 3.0);
  reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color * vec3(1.05, 1.15, 0.55) * (blT * ${k.toFixed(3)} * RECIPROCAL_PI);
}
#endif
`;
