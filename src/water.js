// Flowing river: a ribbon along the river curve with a procedural normal-mapped water shader.
import * as THREE from 'three';
import { WATER_Y, RIVER_HALF, riverX, heightAt, WF, fallsMeander, fallsFloor } from './world.js';
import { boulder } from './shapes.js';
import { Puffs } from './particles.js';
const layoutWF = () => WF;

export function buildRiver() {
  const segs = 1500, across = 10, zMin = -1000, zMax = 1000, half = RIVER_HALF + 2.5;
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
function waterMat(fragBody, extra = {}) {
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
  // the cliff: tiers of big weathered rocks along the face, darker and wet near the falls; the notch the
  // water pours through is left open
  let seed = 1;
  const rock = (u, v, y, r, sx, wet, detail = 2) => {
    const g = boulder(r, seed++ * 3.7, { moss: wet ? 0.9 : 0.55, base: wet ? '#857b6c' : '#9a8e7a', mossCol: '#4f6033', detail });
    const m = new THREE.Mesh(g, wet ? wetMat : rockMat);
    m.position.set(wx(u), y, W.z + v);
    m.scale.set(sx, 1, 1);
    m.rotation.set(seed * 0.7, seed * 1.3, seed * 0.4);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  };
  for (let v = -28; v <= 28; v += 4.6) {
    const av = Math.abs(v);
    for (let y = 1.5; y < W.lipY + 1; y += 4.2) {
      const jit = Math.sin(v * 1.7 + y) * 0.6;
      if (av < 3.6) { rock(-6.2, v + jit * 0.5, y, 2.6, 0.7, true, 2); continue; } // behind the curtain
      const u = -3.2 + (y / W.lipY) * -0.9 + jit; // the face leans back a little toward the top
      rock(u, v + jit, y + jit, 2.6 + Math.abs(jit) * 1.6 + (av < 12 ? 0 : 0.8), 0.62, av < 9, 2);
    }
    // the rim along the top edge
    if (av > 3.2) rock(-4.6, v, W.lipY - 0.2, 1.6 + (av % 3) * 0.3, 0.9, av < 7, 1);
  }
  // boulders tumbled at the foot, round the pool, and along the gorge
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

  // the pool
  const yP = W.yPool;
  const impact = new THREE.Vector2(wx(2.6), W.z);
  const poolMat = waterMat(/* glsl */ `
    vec2 d = vWorld.xz - uImpact;
    float r = length(d);
    float rip = sin(r * 6.0 - uTime * 6.0) * 0.5 + 0.5;
    float n = vnoise(vWorld.xz * 1.6 + uTime * 0.5) * 0.6 + vnoise(vWorld.xz * 4.0 - uTime * 0.9) * 0.4;
    vec3 deep = vec3(0.06, 0.2, 0.2), shallow = vec3(0.24, 0.4, 0.34);
    float edge = smoothstep(8.5, 4.5, length(vWorld.xz - vec2(${wx(5).toFixed(3)}, ${W.z.toFixed(3)})));
    vec3 col = mix(shallow, deep, edge);
    col = mix(col, uSky, 0.22 + 0.15 * n);
    float foam = smoothstep(4.5, 0.0, r) * (0.55 + 0.45 * n) + smoothstep(0.8, 1.0, rip * n) * smoothstep(7.0, 1.5, r) * 0.6;
    col = mix(col, vec3(0.93, 0.96, 0.96), clamp(foam, 0.0, 1.0) * 0.9);
    col += uSun * pow(n, 6.0) * 0.4;
    outC = vec4(col, mix(0.6, 0.92, edge) + foam * 0.08);
  `);
  poolMat.uniforms.uImpact.value.copy(impact);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(8.8, 48).rotateX(-Math.PI / 2), poolMat);
  pool.position.set(wx(5), yP, W.z);
  pool.renderOrder = 2;
  group.add(pool);

  // a stream ribbon along a path; y(u) gives the water level
  const ribbon = (u0, u1, n, center, half, yAt, flip) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = u0 + (u1 - u0) * t, v = center(u), w = half(u, t), y = yAt(u, v);
      pos.push(wx(u), y, W.z + v - w, wx(u), y, W.z + v + w);
      const along = flip ? (u1 - u) : u;
      uv.push(along, 0, along, 1);
    }
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  };
  const streamMat = waterMat(/* glsl */ `
    float n = vnoise(vec2(vUv.x * 0.5 - uTime * 2.4, vUv.y * 4.0)) * 0.6 + vnoise(vec2(vUv.x * 1.6 - uTime * 3.6, vUv.y * 9.0)) * 0.4;
    float side = 1.0 - abs(vUv.y * 2.0 - 1.0);
    vec3 col = mix(vec3(0.26, 0.4, 0.32), vec3(0.08, 0.24, 0.23), smoothstep(0.1, 0.8, side));
    col = mix(col, uSky * 0.6, 0.12 * n);
    col = mix(col, vec3(0.85, 0.9, 0.88), smoothstep(0.7, 0.95, n) * 0.55);
    col += uSun * pow(n, 8.0) * 0.5;
    outC = vec4(col, smoothstep(0.0, 0.35, side + (n - 0.5) * 0.2) * 0.85);
  `);
  // down the gorge to the river (it leaves the pool through the gap in the rocks)
  {
    const g = ribbon(7.5, W.Lr + 8, 70, (u) => fallsMeander(u), (u, t) => (1.5 + t * 1.1) * (0.85 + 0.2 * Math.sin(u * 0.5)),
      (u) => Math.max(WATER_Y + 0.03, Math.min(yP - 0.02, fallsFloor(u) - 0.5)), false);
    const m = new THREE.Mesh(g, streamMat); m.renderOrder = 2; group.add(m);
  }
  // across the shelf to the edge, a little faster as it nears the drop
  let lipWater = W.lipY - 0.7;
  {
    let last = Infinity;
    const level = (u) => { const y = Math.min(last, heightAt(wx(u), W.z) + 0.45); last = y; return y; };
    const g = ribbon(-78, -4.4, 50, () => 0, (u) => 1.5 + Math.max(0, -u - 60) * 0.05, level, false);
    lipWater = last;
    const m = new THREE.Mesh(g, streamMat); m.renderOrder = 2; group.add(m);
  }

  // the falls: three layered curtains leaving the lip, arcing out and plunging into the pool
  const sheetMat = waterMat(/* glsl */ `
    float u = vUv.x, v = 1.0 - vUv.y;
    float n = vnoise(vec2(u * 12.0, v * 9.0 - uTime * 5.5)) * 0.55 + vnoise(vec2(u * 28.0, v * 18.0 - uTime * 8.0)) * 0.3 + vnoise(vec2(u * 55.0, v * 5.0 - uTime * 9.0)) * 0.15;
    float side = 1.0 - abs(u * 2.0 - 1.0);
    float body = smoothstep(0.0, 0.3, side + (n - 0.5) * 0.5);
    vec3 col = mix(vec3(0.55, 0.68, 0.68), vec3(0.96, 0.98, 0.98), smoothstep(0.3, 0.75, n) * 0.85 + v * 0.3);
    col = mix(col, uSky, 0.1);
    float a = body * (0.5 + n * 0.5) * smoothstep(0.0, 0.03, v);
    outC = vec4(col, clamp(a, 0.0, 0.95));
  `);
  const H = lipWater - yP;
  for (const [off, wscale, lag] of [[0, 1, 0], [0.35, 0.82, 0.15], [-0.25, 0.6, 0.3]]) {
    const geo = new THREE.PlaneGeometry(1, 1, 10, 60);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const uu = p.getX(i) + 0.5, vv = 0.5 - p.getY(i); // vv: 0 at the lip, 1 at the pool
      const y = lipWater - vv * H;
      const u = -4.4 + off + 1.6 * Math.sqrt(vv) + 4.6 * vv * vv + lag + Math.sin(uu * 7 + vv * 9) * 0.06;
      const v = (uu - 0.5) * (5.2 + vv * 2.6) * wscale;
      p.setXYZ(i, wx(u), y, W.z + v);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, sheetMat);
    m.renderOrder = 3; m.frustumCulled = false;
    group.add(m);
  }

  // mist billowing off the pool, and a fine spray drifting down the gorge
  const mist = new Puffs({ max: 260, color: '#f2f6f6', opacity: 0.35, buoyancy: 0.9, drag: 1.0 });
  group.add(mist.mesh);
  let acc = 0;
  const mats = [poolMat, sheetMat, streamMat];
  return {
    group,
    pos: { x: impact.x, z: impact.y },
    setTheme({ night, rain, sky, sun }) {
      for (const m of mats) {
        m.uniforms.uNight.value = night ? 0.8 : 0;
        m.uniforms.uRain.value = rain ? 1 : 0;
        m.uniforms.uSky.value.set(sky).multiplyScalar(night ? 0.4 : 0.85);
        m.uniforms.uSun.value.set(sun);
      }
      mist.material.uniforms.uColor.value.set(night ? '#56607a' : '#f2f6f6');
      mist.material.uniforms.uDark.value.copy(mist.material.uniforms.uColor.value);
    },
    update(t, dt, near) {
      for (const m of mats) m.uniforms.uTime.value = t;
      if (near) {
        acc += dt * 40;
        while (acc > 1) {
          acc -= 1;
          const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 2.4;
          mist.emit(impact.x + (Math.random() - 0.5) * 2.5, yP + 0.2, impact.y + (Math.random() - 0.5) * 5,
            Math.cos(a) * sp - 0.8, 0.6 + Math.random() * 1.6, Math.sin(a) * sp, 2.5 + Math.random() * 1.5, 1.2, 4.5 + Math.random() * 2, 0.85);
        }
      }
      mist.update(dt);
    },
  };
}
