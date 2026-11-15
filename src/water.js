// Flowing river: a ribbon along the river curve with a procedural normal-mapped water shader.
import * as THREE from 'three';
import { WATER_Y, RIVER_HALF, riverX, heightAt, WF, fallsMeander, fallsFloor, PLAY_RADIUS, TRIB, tribLevel } from './world.js';
import { boulder } from './shapes.js';
import { fbm, noise2 } from './noise.js';
import { Puffs } from './particles.js';
const layoutWF = () => WF;
const G = 9.81;
// how far (x, z) is from the stream that runs from the plunge pool down the gorge to the river
export function streamDist(x, z) {
  const u = WF.x - x;
  if (u < 4 || u > WF.Lr + 2) return Infinity;
  return Math.abs(z - (WF.z + fallsMeander(u)));
}

export function buildRiver() {
  // the river runs right across the land, out to the hills beyond the edge of the country
  const zMax = PLAY_RADIUS + 450, zMin = -zMax, segs = Math.round((zMax - zMin) / 1.33), across = 10, half = RIVER_HALF + 2.5;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const z = zMin + ((zMax - zMin) * i) / segs;
    const cx = riverX(z);
    for (let j = 0; j <= across; j++) {
      const u = j / across;
      pos.push(cx + (u * 2 - 1) * half, WATER_Y, z);
      uv.push(u, z);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j, b = a + across + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uRain: { value: 0 },
        uNight: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color('#ffe2b0') },
        uSky: { value: new THREE.Color('#8fb3d6') },
        uHorizon: { value: new THREE.Color('#e8d6b8') },
        uDeep: { value: new THREE.Color('#1d5650') },
        uShallow: { value: new THREE.Color('#5d8a6a') },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform float uRain, uNight;
      uniform vec3 uSunDir, uSunColor, uSky, uHorizon, uDeep, uShallow;
      varying vec3 vWorld;
      varying vec2 vUv;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
      }
      float waves(vec2 p) {
        float t = uTime;
        float h = vnoise(p * vec2(0.55, 0.35) - vec2(0.0, t * 0.55)) * 0.5;
        h += vnoise(p * vec2(1.3, 0.9) - vec2(t * 0.1, t * 1.1) + 3.7) * 0.28;
        h += vnoise(p * vec2(3.1, 2.3) - vec2(-t * 0.2, t * 1.8) + 9.1) * 0.14;
        h += vnoise(p * vec2(7.0, 5.0) - vec2(0.0, t * 2.6) + 1.3) * 0.07;
        h += uRain * (vnoise(p * 9.0 + vec2(t * 3.1, -t * 2.3)) * 0.12 + vnoise(p * 17.0 - vec2(t * 4.0, t * 1.7)) * 0.08);
        return h;
      }
      void main() {
        vec2 p = vWorld.xz;
        float e = 0.06;
        float hc = waves(p);
        float hx = waves(p + vec2(e, 0.0));
        float hz = waves(p + vec2(0.0, e));
        vec3 N = normalize(vec3((hc - hx) / e * 0.35, 1.0, (hc - hz) / e * 0.35));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 Rf = reflect(-V, N);
        vec3 refl = mix(uHorizon, uSky, smoothstep(-0.05, 0.25, Rf.y));
        float edge = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float depth = smoothstep(0.12, 0.7, edge);
        vec3 body = mix(uShallow, uDeep, depth);
        float streak = vnoise(vec2(p.x * 1.6, p.y * 0.12 - uTime * 0.9));
        body *= 0.9 + streak * 0.2;
        vec3 col = mix(body, refl, fres * 0.55);
        float sd = max(dot(Rf, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 350.0) * 6.0 + pow(sd, 40.0) * 0.25);
        float foam = (1.0 - smoothstep(0.12, 0.2, edge)) * smoothstep(0.45, 0.8, vnoise(p * 2.0 + vec2(0.0, -uTime * 0.8)));
        col = mix(col, vec3(0.9, 0.9, 0.85), foam * 0.35);
        float alpha = mix(0.3, 0.8, smoothstep(0.08, 0.4, edge));
        col *= 1.0 - uRain * 0.25;
        col = mix(col, col * vec3(0.35, 0.42, 0.6), uNight);
        gl_FragColor = vec4(col, alpha);
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  // the little river: a narrower ribbon along its course, stepping down with its water level, same water
  {
    const P = TRIB.path, q = {}, w = TRIB.half + 1.2, n = Math.ceil(P.L / 2), acr = 6, tp = [], tu = [], ti = [];
    for (let i = 0; i <= n; i++) {
      const s = (P.L * i) / n; P.at(s, q);
      const y = tribLevel(s);
      // across the river toward its right bank, so the triangles face up (wound the same way as the big river's)
      for (let j = 0; j <= acr; j++) { const u = j / acr, o = (u * 2 - 1) * w; tp.push(q.x + q.tz * o, y, q.z - q.tx * o); tu.push(u, s); }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < acr; j++) { const a = i * (acr + 1) + j, b = a + acr + 1; ti.push(a, b, a + 1, a + 1, b, b + 1); }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(tu, 2));
    tg.setIndex(ti);
    tg.computeVertexNormals();
    const tm = new THREE.Mesh(tg, mat);
    tm.renderOrder = 2; // its levels are absolute; as a child it rises and falls with the river through the seasons
    mesh.add(tm);
  }
  return mesh;
}

// ---------------- the little waterfall ----------------
const NOISE = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
  }
`;
function waterMat(fragBody, extra = {}, decl = '') {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 }, uNight: { value: 0 }, uRain: { value: 0 },
        uSky: { value: new THREE.Color('#9fbad0') }, uSun: { value: new THREE.Color('#fff0d0') },
        uImpact: { value: new THREE.Vector2() },
        ...extra,
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uNight, uRain;
      uniform vec3 uSky, uSun;
      uniform vec2 uImpact;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${decl}
      ${NOISE}
      void main() {
        vec4 outC;
        ${fragBody}
        outC.rgb = mix(outC.rgb, outC.rgb * vec3(0.3, 0.38, 0.55), uNight);
        gl_FragColor = outC;
        #include <fog_fragment>
      }
    `,
  });
}

export function buildWaterfall() {
  const W = layoutWF();
  const wx = (u) => W.x - u; // u: downstream distance → world x
  const group = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const wetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, color: '#b4b0a8' });
  let seed = 1;
  const rock = (u, v, y, r, sx, wet, detail = 2) => {
    const g = boulder(r, seed++ * 3.7, { moss: wet ? 0.9 : 0.55, base: wet ? '#857b6c' : '#9a8e7a', mossCol: '#4f6033', detail });
    const m = new THREE.Mesh(g, wet ? wetMat : rockMat);
    m.position.set(wx(u), y, W.z + v);
    m.scale.set(sx, 1, 1);
    m.rotation.set(seed * 0.7, seed * 1.3, seed * 0.4);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const yP = W.yPool;

  // ---------------- the cliff ----------------
  // One continuous rock face in front of the terrain's drop: bedded in horizontal strata with ledges sticking
  // out, cracks running down, the rim at the top, and an undercut recess behind the falls where the spray
  // has eaten the rock away. Behind and below the falls the rock is dark and wet, with moss where the spray
  // never stops; further out it is dry, pale sandstone.
  {
    const yb = yP - 3, yt = W.lipY + 0.5, NV = 84, NY = 72;
    const pos = [], col = [], idx = [];
    const c = new THREE.Color(), dry = new THREE.Color('#9a8b74'), dry2 = new THREE.Color('#7d6f5d'), wet = new THREE.Color('#4a453e'), moss = new THREE.Color('#4a5a2c'), stain = new THREE.Color('#5d5448');
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NV; i++) {
      const v = -36 + (72 * i) / NV, av = Math.abs(v);
      const notch = 1 - sm(4.5, 8.5, av); // the stretch the water falls down
      let y = yb + ((yt - yb) * j) / NY;
      if (j === NY) y = yt - notch * 1.7; // in the notch the rim sits under the water at the brink
      const hn = (y - yb) / (yt - yb);
      // the face, just in front of the terrain's own slope, curving forward at the ends to wrap round the pool
      let u = -1.0 - 3.4 * hn + 0.9 + 4.5 * Math.pow(av / 36, 2.2);
      // strata: beds of rock a couple of metres thick, each with a jutting ledge at its top, wavering a little
      const bed = (y + noise2(v * 0.08, 3.1) * 0.9) / 2.3, f = bed - Math.floor(bed);
      const ledge = sm(0.72, 0.9, f) * (1 - sm(0.93, 1.0, f));
      const rough = fbm(v * 0.22, y * 0.22, 3) * 0.5 + 0.5, crack = Math.pow(Math.abs(noise2(v * 0.35, 7.7)), 0.35);
      u += ledge * 0.55 + rough * 0.8 - (1 - crack) * 0.35;
      // the undercut behind the falls, deepest near the pool
      u -= notch * (2.4 - hn * 0.9);
      pos.push(wx(u), y, W.z + v);
      // colour: dry rock out at the sides, bedding bands, dark wet rock and moss around the falls and low down
      c.copy(dry).lerp(dry2, sm(0.3, 0.7, rough) * 0.7 + (f < 0.5 ? 0.15 : 0));
      const wetK = Math.max(1 - sm(6, 16, av), (1 - sm(0, 0.35, hn)) * (1 - sm(14, 30, av)));
      c.lerp(wet, wetK * 0.85);
      c.lerp(moss, wetK * (1 - sm(0.05, 0.5, hn)) * sm(0.45, 0.7, rough) * 0.8);
      c.lerp(stain, ledge * 0.3 + (1 - crack) * 0.3);
      if (j === NY) c.lerp(dry2, 0.4);
      col.push(c.r, c.g, c.b);
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NV; i++) { const a = j * (NV + 1) + i, b = a + NV + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); // THREE.Color already holds linear values
    g.setIndex(idx);
    g.computeVertexNormals();
    const cliff = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide }));
    cliff.castShadow = cliff.receiveShadow = true;
    group.add(cliff);
    // a few big blocks fallen at the foot of the face, out to the sides of the pool
    for (const [u, v, r] of [[3.5, -12.5, 2.2], [4.2, 13.5, 2.0], [6.5, -16, 1.5], [7, 17, 1.7], [2.5, 20, 2.4], [2.8, -20.5, 2.6]]) rock(u, v, Math.min(heightAt(wx(u), W.z + v), yP + 1.2) + r * 0.25, r, 1.1, Math.abs(v) < 15, 2);
  }
  // boulders round the pool, and along the gorge
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5) continue; // the outlet, downstream (+u)
    const r = 0.5 + ((i * 7) % 5) * 0.22, u = 5 + Math.cos(a) * 8.6, v = Math.sin(a) * 8.6;
    rock(u, v, heightAt(wx(u), W.z + v) + r * 0.2, r, 1, i % 3 === 0, 1);
  }
  for (let u = 14; u < W.Lr - 4; u += 7) for (const sd of [-1, 1]) {
    const v = fallsMeander(u) + sd * (3.4 + Math.sin(u) * 0.6), r = 0.5 + Math.abs(Math.sin(u * 1.3 + sd)) * 0.9;
    rock(u, v, heightAt(wx(u), W.z + v) + r * 0.15, r, 1, false, 1);
  }

  const streamMats = [];
  // ---------------- the falling water ----------------
  // The stream reaches the brink at about 3 m/s and leaves it as a projectile: it keeps that speed outward
  // while gravity pulls it down, so the curtain arcs away from the rock and lands about nine metres out.
  // The surface texture is tied to each parcel of water (to the time since it left the brink), so the streaks
  // ride down with the water, speeding up and stretching as it falls. Near the brink it is a smooth, glassy
  // sheet; as it falls it takes in air and turns white, splits into fingers, and at the bottom shreds into
  // drops and spray.
  const lipU = -4.4, V0 = 3.1;
  // the water level across the shelf, and so the height at the brink
  let lipWater = W.lipY - 0.7;
  {
    let last = Infinity;
    for (let k = 0; k <= 50; k++) { const u = -78 + (k / 50) * (lipU + 78); last = Math.min(last, heightAt(wx(u), W.z) + 0.45); }
    lipWater = last;
  }
  const H = lipWater - yP, TF = Math.sqrt((2 * H) / G), impactU = lipU + V0 * TF;
  const halfW = (tn) => 2.5 + 1.5 * Math.pow(tn, 1.3); // the curtain spreads as it falls
  const impact = new THREE.Vector2(wx(impactU), W.z);
  const sheetMat = waterMat(/* glsl */ `
    float a = vUv.x * 2.0 - 1.0, tau = vUv.y, tn = tau / uTF;
    float q = tau - uTime; // the parcel of water this pixel belongs to
    float fing = vnoise(vec2(a * 6.0 + uSeed, q * 1.3)) * 0.65 + vnoise(vec2(a * 13.0 - uSeed, q * 2.6)) * 0.35;
    float strk = vnoise(vec2(a * 42.0 + uSeed * 3.0, q * 7.0)) * 0.6 + vnoise(vec2(a * 90.0, q * 15.0)) * 0.4;
    float air = smoothstep(0.0, 0.32, tn);
    // the sheet tears open as it falls: gaps between fingers at first, then between the streaks
    float th = mix(-0.2, 0.62, smoothstep(0.12, 1.0, tn));
    float body = smoothstep(th, th + 0.18, fing * 0.62 + strk * 0.38);
    float edge = 1.0 - smoothstep(0.68, 1.0, abs(a) + (fing - 0.5) * 0.35 * (0.3 + tn));
    vec3 glassy = mix(vec3(0.16, 0.3, 0.3), uSky * 0.95, 0.45 + 0.2 * strk);
    vec3 white = vec3(0.92, 0.95, 0.96) * (0.82 + 0.25 * strk);
    vec3 col = mix(glassy, white, clamp(air * (0.55 + 0.6 * strk), 0.0, 1.0));
    col += uSun * pow(strk, 7.0) * 0.5 * (1.0 - air * 0.6);
    float alpha = body * edge * mix(0.8, 0.92, air) * smoothstep(0.0, 0.03, tau) * (1.0 - smoothstep(0.93, 1.0, tn) * 0.8);
    outC = vec4(col, clamp(alpha * uLayer, 0.0, 0.96));
  `, { uTF: { value: TF }, uSeed: { value: 0 }, uLayer: { value: 1 } }, 'uniform float uTF, uSeed, uLayer;');
  // three layers: the main sheet, a thinner one just in front, and one behind against the rock
  const sheetMats = [];
  for (const [du, wk, sd, layer] of [[0, 1, 0, 1], [0.32, 0.86, 17.3, 0.75], [-0.35, 0.92, 41.7, 0.6]]) {
    const NA = 28, NS = 90, pos = [], uv = [], idx = [];
    for (let j = 0; j <= NS; j++) {
      const d = H * Math.pow(j / NS, 1.15), tau = Math.sqrt((2 * d) / G), tn = tau / TF; // rows spaced evenly by depth
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * 2 - 1, w = halfW(tn) * wk;
        // the middle of the sheet bulges a touch further out (it carries more water, so more momentum)
        const u = lipU + du + V0 * tau * (1 + 0.06 * (1 - a * a)) + Math.sin(a * 5 + tau * 2 + sd) * 0.08 * tn;
        pos.push(wx(u), lipWater - d, W.z + a * w);
        uv.push(i / NA, tau);
      }
    }
    for (let j = 0; j < NS; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + NA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = sheetMat.clone();
    m.uniforms.uSeed.value = sd; m.uniforms.uLayer.value = layer;
    sheetMats.push(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 3; mesh.frustumCulled = false;
    group.add(mesh);
  }

  // ---------------- drops and splashes, on ballistic paths ----------------
  // Points worked out on the GPU from a launch position and velocity: p = p0 + v0·t + ½·g·t². 'fall' are drops
  // that peel off the curtain's edges and fall beside it; 'splash' are flung up where the water hits the pool
  // and drop back in.
  const dropMat = (mode) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 1 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 aSeed;
      uniform float uTime, uScale;
      varying float vA;
      void main() {
        vec3 p; float life;
        ${mode === 'fall' ? `
        float P = ${(TF * 1.02).toFixed(3)};
        float t = mod(uTime + aSeed.x * P, P);
        float side = aSeed.y < 0.5 ? -1.0 : 1.0;
        float a = side * (0.55 + 0.45 * pow(aSeed.z, 0.6));
        float tn = t / ${TF.toFixed(3)};
        float w = 2.5 + 1.5 * pow(tn, 1.3);
        p = vec3(${wx(lipU).toFixed(3)} - ${V0.toFixed(3)} * t * (0.85 + 0.3 * aSeed.w), ${lipWater.toFixed(3)} - 0.5 * ${G} * t * t, ${W.z.toFixed(3)} + a * w + side * aSeed.w * 0.9 * t);
        life = smoothstep(0.0, 0.08, tn) * (1.0 - smoothstep(0.9, 1.0, tn));` : `
        float P = 1.9;
        float t = mod(uTime + aSeed.x * P, P);
        float ang = aSeed.y * 6.2832, vh = 0.8 + 3.2 * aSeed.z, vy = 2.0 + 6.5 * aSeed.w * aSeed.w;
        vec2 o = vec2(cos(ang), sin(ang));
        vec2 base = vec2(${impact.x.toFixed(3)}, ${impact.y.toFixed(3)}) + vec2(o.x * 1.2, o.y * 3.2) * aSeed.z;
        float y = ${(yP + 0.05).toFixed(3)} + vy * t - 0.5 * ${G} * t * t;
        p = vec3(base.x + o.x * vh * t, y, base.y + o.y * vh * t);
        life = step(${(yP - 0.02).toFixed(3)}, y) * (1.0 - smoothstep(0.6, 1.0, t / P));`}
        vA = life;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = life > 0.0 ? uScale * ${mode === 'fall' ? '55.0' : '70.0'} * (0.6 + aSeed.z * 0.8) / max(1.0, -mvPosition.z) : 0.0;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uNight;
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        vec3 col = mix(vec3(0.93, 0.96, 0.97), vec3(0.32, 0.38, 0.5), uNight);
        gl_FragColor = vec4(col, vA * smoothstep(0.5, 0.15, d) * 0.85);
        #include <fog_fragment>
      }`,
  });
  const drops = [];
  for (const [mode, n] of [['fall', 900], ['splash', 1400]]) {
    const g = new THREE.BufferGeometry(), sd = new Float32Array(n * 4);
    for (let i = 0; i < sd.length; i++) sd[i] = Math.random();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(sd, 4));
    const pts = new THREE.Points(g, dropMat(mode));
    pts.frustumCulled = false; pts.renderOrder = 4;
    group.add(pts);
    drops.push(pts);
  }

  // ---------------- the pool ----------------
  const poolMat = waterMat(/* glsl */ `
    vec2 d = vWorld.xz - uImpact;
    float r = length(d * vec2(1.6, 0.8));
    float rip = sin(r * 5.0 - uTime * 7.0) * 0.5 + 0.5;
    float n = vnoise(vWorld.xz * 1.6 + uTime * 0.5) * 0.6 + vnoise(vWorld.xz * 4.0 - uTime * 0.9) * 0.4;
    float boil = vnoise(vWorld.xz * 2.2 + vec2(uTime * 1.3, -uTime * 0.7)) * vnoise(vWorld.xz * 5.0 - uTime * 2.1);
    vec3 deep = vec3(0.05, 0.17, 0.17), shallow = vec3(0.22, 0.38, 0.32);
    float edge = smoothstep(8.5, 4.5, length(vWorld.xz - vec2(${wx(5).toFixed(3)}, ${W.z.toFixed(3)})));
    vec3 col = mix(shallow, deep, edge);
    col = mix(col, uSky, 0.22 + 0.15 * n);
    // where the falls land the water boils white; the foam spreads out in rings and drifts toward the outlet
    float foam = smoothstep(5.0, 0.0, r) * (0.65 + 0.35 * n) + smoothstep(0.55, 0.9, rip * n + boil) * smoothstep(8.0, 2.0, r) * 0.7;
    foam += smoothstep(0.6, 0.85, vnoise(vec2(vWorld.x * 0.9 + uTime * 0.6, vWorld.z * 2.5))) * smoothstep(9.0, 3.0, r) * 0.35;
    col = mix(col, vec3(0.93, 0.96, 0.96), clamp(foam, 0.0, 1.0) * 0.92);
    col += uSun * pow(n, 6.0) * 0.4;
    outC = vec4(col, mix(0.65, 0.94, edge) + foam * 0.06);
  `);
  poolMat.uniforms.uImpact.value.copy(impact);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(8.8, 56).rotateX(-Math.PI / 2), poolMat);
  pool.position.set(wx(5), yP, W.z);
  pool.renderOrder = 2;
  group.add(pool);

  // ---------------- the stream ----------------
  // a ribbon of water along a path; uv.x = distance along it (m), uv.y = across (0–1)
  const ribbon = (u0, u1, n, center, half, yAt) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = u0 + (u1 - u0) * t, v = center(u), w = half(u, t), y = yAt(u, v);
      pos.push(wx(u), y, W.z + v - w, wx(u), y, W.z + v + w);
      uv.push(u, 0, u, 1);
    }
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  };
  // Running water down the gorge: fast and white with rapids just below the pool, broken by standing waves
  // over the rocks in its bed, calmer and clearer lower down, foam lines drifting along its edges.
  const streamMat = waterMat(/* glsl */ `
    float u = vUv.x, side = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float sp = uSpeed * mix(1.8, 1.0, smoothstep(10.0, 40.0, u));
    float n = vnoise(vec2(u * 0.6 - uTime * sp, vUv.y * 4.0)) * 0.55 + vnoise(vec2(u * 1.9 - uTime * sp * 1.4, vUv.y * 9.0)) * 0.3 + vnoise(vec2(u * 4.5 - uTime * sp * 1.8, vUv.y * 16.0)) * 0.15;
    // standing waves: white chevrons that stay put while the water runs through them
    float rocks = smoothstep(0.62, 0.8, vnoise(vec2(u * 0.35, vUv.y * 3.0 + 7.0)));
    float stand = rocks * (0.5 + 0.5 * sin(u * 9.0 - abs(vUv.y - 0.5) * 14.0)) * (0.6 + 0.4 * n);
    float rapids = 1.0 - smoothstep(9.0, 26.0, u);
    float whiteK = clamp(smoothstep(0.62, 0.85, n) * 0.6 + stand * 0.9 + rapids * smoothstep(0.35, 0.7, n) * 0.85 + (1.0 - smoothstep(0.0, 0.22, side)) * smoothstep(0.5, 0.75, n) * 0.6, 0.0, 1.0);
    vec3 col = mix(vec3(0.24, 0.37, 0.3), vec3(0.06, 0.2, 0.2), smoothstep(0.1, 0.8, side));
    col = mix(col, uSky * 0.65, 0.15 + 0.1 * n);
    col = mix(col, vec3(0.9, 0.94, 0.94), whiteK);
    col += uSun * pow(n, 8.0) * 0.5;
    outC = vec4(col, smoothstep(0.0, 0.3, side + (n - 0.5) * 0.25) * mix(0.82, 0.95, whiteK));
  `, { uSpeed: { value: 1.6 } }, 'uniform float uSpeed;');
  const streamLevel = (u) => Math.max(WATER_Y + 0.08, Math.min(yP - 0.02, fallsFloor(u) - 0.55));
  // down the gorge from the pool's outlet to the river bank, widening a little as it goes
  const endU = W.Lr + 0.5;
  {
    const g = ribbon(7.5, endU, 90, (u) => fallsMeander(u), (u, t) => (1.5 + t * 1.3) * (0.85 + 0.2 * Math.sin(u * 0.5)), streamLevel);
    const m = new THREE.Mesh(g, streamMat); m.renderOrder = 2; group.add(m);
  }
  // white water where it pours out of the pool and drops into the gorge
  for (let k = 0; k < 7; k++) {
    const u = 9 + k * 2.2, v = fallsMeander(u) + (k % 2 ? 1 : -1) * (0.4 + (k % 3) * 0.3);
    rock(u, v, streamLevel(u) - 0.25, 0.35 + (k % 3) * 0.12, 1.2, true, 1);
  }
  // across the shelf to the brink, speeding up as it nears the drop
  {
    let last = Infinity;
    const level = (u) => { const y = Math.min(last, heightAt(wx(u), W.z) + 0.45); last = y; return y; };
    const shelfMat = streamMat.clone();
    shelfMat.uniforms.uSpeed.value = 2.4;
    const g = ribbon(-78, lipU, 50, () => 0, (u) => 1.5 + Math.max(0, -u - 60) * 0.05 + Math.max(0, u + 14) * 0.07, level);
    const m = new THREE.Mesh(g, shelfMat); m.renderOrder = 2; group.add(m);
    streamMats.push(shelfMat);
  }

  // ---------------- where it meets the river ----------------
  // The stream runs out over the sand into the river. When the river is low (summer, autumn) it spills over the
  // lip of its own bed in a little fall; whatever the level, a fan of foam spreads out on the river and is
  // carried off downstream.
  const mouth = { x: wx(endU), z: W.z + fallsMeander(endU) };
  const endLevel = streamLevel(endU);
  const spillMat = sheetMat.clone();
  spillMat.uniforms.uTF.value = 0.45; spillMat.uniforms.uSeed.value = 5.5; spillMat.uniforms.uLayer.value = 0.9;
  const spillGeo = new THREE.BufferGeometry();
  {
    const NA = 14, NS = 16, idx = [];
    spillGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((NA + 1) * (NS + 1) * 3), 3));
    const uv = [];
    for (let j = 0; j <= NS; j++) for (let i = 0; i <= NA; i++) uv.push(i / NA, 0);
    spillGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    for (let j = 0; j < NS; j++) for (let i = 0; i < NA; i++) { const a = j * (NA + 1) + i, b = a + NA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    spillGeo.setIndex(idx);
    spillGeo.userData = { NA, NS };
  }
  const spill = new THREE.Mesh(spillGeo, spillMat);
  spill.renderOrder = 3; spill.frustumCulled = false;
  group.add(spill);
  const confMat = waterMat(/* glsl */ `
    vec2 d = vWorld.xz - uImpact;
    float r = length(d * vec2(1.0, 0.55)); // stretched downstream, the way the river carries it
    float n = vnoise(vec2(vWorld.x * 1.3, vWorld.z * 0.7 - uTime * 0.9)) * 0.6 + vnoise(vec2(vWorld.x * 3.0, vWorld.z * 1.6 - uTime * 1.4)) * 0.4;
    float foam = smoothstep(0.42, 0.75, n) * (1.0 - smoothstep(1.5, 9.0, r));
    float churn = (1.0 - smoothstep(0.0, 2.5, length(d))) * (0.6 + 0.4 * n);
    outC = vec4(vec3(0.92, 0.95, 0.95), clamp(foam * 0.75 + churn * 0.7, 0.0, 0.85));
  `);
  confMat.uniforms.uImpact.value.set(mouth.x - 2.2, mouth.z + 1.5);
  const conf = new THREE.Mesh(new THREE.PlaneGeometry(14, 22).rotateX(-Math.PI / 2), confMat);
  conf.position.set(mouth.x - 4, WATER_Y + 0.025, mouth.z + 6);
  conf.renderOrder = 3;
  group.add(conf);
  const setRiverLevel = (ry) => {
    conf.position.y = ry + 0.025;
    const drop = endLevel - ry;
    spill.visible = drop > 0.12;
    if (!spill.visible) return;
    // a short projectile arc over the lip of the bed, out toward the river (−x) and down to its surface
    const { NA, NS } = spillGeo.userData, p = spillGeo.attributes.position, uv = spillGeo.attributes.uv;
    const tf = Math.sqrt((2 * drop) / G), v0 = 1.6;
    spillMat.uniforms.uTF.value = tf;
    for (let j = 0; j <= NS; j++) {
      const t = (j / NS) * tf;
      for (let i = 0; i <= NA; i++) {
        const a = (i / NA) * 2 - 1, k = j * (NA + 1) + i;
        p.setXYZ(k, mouth.x - v0 * t, endLevel - 0.5 * G * t * t, mouth.z + a * (2.3 + t * 0.8));
        uv.setXY(k, i / NA, t);
      }
    }
    p.needsUpdate = true; uv.needsUpdate = true;
    spillGeo.computeBoundingSphere();
  };
  setRiverLevel(WATER_Y);

  // mist billowing up off the pool and drifting down the gorge, and spray from the splashes
  const mist = new Puffs({ max: 420, color: '#f2f6f6', opacity: 0.32, buoyancy: 0.75, drag: 0.9 });
  group.add(mist.mesh);
  let acc = 0, accM = 0;
  const mats = [poolMat, streamMat, confMat, spillMat, ...sheetMats];
  return {
    group,
    pos: { x: impact.x, z: impact.y },
    impact: { x: impact.x, y: yP, z: impact.y },
    setRiverLevel,
    setTheme({ night, rain, sky, sun }) {
      for (const m of [...mats, ...streamMats]) {
        m.uniforms.uNight.value = night ? 0.8 : 0;
        m.uniforms.uRain.value = rain ? 1 : 0;
        m.uniforms.uSky.value.set(sky).multiplyScalar(night ? 0.4 : 0.85);
        m.uniforms.uSun.value.set(sun);
      }
      for (const d of drops) d.material.uniforms.uNight.value = night ? 0.8 : 0;
      mist.material.uniforms.uColor.value.set(night ? '#56607a' : '#f2f6f6');
      mist.material.uniforms.uDark.value.copy(mist.material.uniforms.uColor.value);
    },
    update(t, dt, near) {
      for (const m of [...mats, ...streamMats]) m.uniforms.uTime.value = t;
      for (const d of drops) { d.material.uniforms.uTime.value = t; d.visible = near; }
      if (near) {
        // the cloud of spray where the falls hit, rising and rolling out over the pool
        acc += dt * 55;
        while (acc > 1) {
          acc -= 1;
          const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3.2;
          mist.emit(impact.x + (Math.random() - 0.5) * 3, yP + 0.3, impact.y + (Math.random() - 0.5) * 6,
            Math.cos(a) * sp - 0.9, 0.8 + Math.random() * 2.2, Math.sin(a) * sp, 3.2 + Math.random() * 2.2, 1.4, 5 + Math.random() * 2.5, 0.85);
        }
        // a little spray at the river mouth too
        accM += dt * 6;
        while (accM > 1) { accM -= 1; mist.emit(mouth.x - 1 - Math.random() * 2, conf.position.y + 0.1, mouth.z + (Math.random() - 0.5) * 3, -0.4, 0.3 + Math.random() * 0.4, 0.5, 1.2, 0.5, 2.5, 0.6); }
      }
      mist.update(dt);
    },
  };
}
