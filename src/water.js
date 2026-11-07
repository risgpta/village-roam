// Flowing river: a ribbon along the river curve with a procedural normal-mapped water shader.
import * as THREE from 'three';
import { WATER_Y, RIVER_HALF, riverX, heightAt, WF } from './world.js';
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
  const WFp = layoutWF();
  const { x: px, z: pz, lipX, y: y0 } = WFp;
  const group = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  const wetMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, color: '#9a9a9a' });
  const top = y0 + 4.3;
  const rocks = [
    // base layer
    [lipX - 2.4, 0, 2.1, 0.6, 1], [lipX - 1.0, 2.6, 1.7, 0.7, 0], [lipX - 1.0, -2.6, 1.75, 0.7, 0],
    [lipX - 4.0, 2.3, 2.0, 0.9, 0], [lipX - 4.0, -2.3, 1.9, 0.8, 0], [lipX - 0.9, 4.3, 1.1, 0.4, 0], [lipX - 1.1, -4.3, 1.2, 0.4, 0],
    [lipX - 5.6, 0, 1.8, 0.8, 0],
    // middle
    [lipX - 1.9, 0, 1.55, 2.4, 1], [lipX - 1.7, 1.7, 1.3, 2.2, 0], [lipX - 1.7, -1.8, 1.35, 2.1, 0], [lipX - 3.6, 0.6, 1.6, 2.9, 0],
    [lipX - 0.95, 0, 0.8, 3.4, 1],
    // top: two boulders flank the notch, one behind
    [lipX - 0.9, 1.35, 0.95, 4.0, 0], [lipX - 0.9, -1.35, 1.0, 3.95, 0], [lipX - 2.4, 0.1, 1.2, 4.1, 0], [lipX - 3.8, -0.8, 1.0, 4.4, 0],
  ];
  rocks.forEach(([x, dz, r, y, wet], i) => {
    const g = boulder(r, i * 3.7 + 1, { moss: 0.8, base: wet ? '#8a7f6e' : '#b0a28a', detail: 3 });
    const m = new THREE.Mesh(g, wet ? wetMat : rockMat);
    m.position.set(x, (y < 1 ? heightAt(x, pz + dz) - 0.25 * r : y0 + y - 0.3) + (y < 1 ? r * 0.55 : 0), pz + dz);
    m.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  });
  // stones round the pool, leaving a gap where it spills into the stream
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (Math.abs(a) < 0.35 || Math.abs(a - Math.PI * 2) < 0.35) continue; // outflow (+x)
    if (Math.abs(a - Math.PI) < 0.9) continue; // under the falls
    const r = 0.35 + ((i * 7) % 5) * 0.06;
    const x = px + Math.cos(a) * 2.75, z = pz + Math.sin(a) * 2.75;
    const m = new THREE.Mesh(boulder(r, i + 40, { moss: 0.4, detail: 1 }), rockMat);
    m.position.set(x, heightAt(x, z) + r * 0.25, z);
    m.rotation.set(i, i * 2.1, 0);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // pool surface: above the highest bit of ground under it
  let wy = -Infinity;
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) if (i * i + j * j <= 9) wy = Math.max(wy, heightAt(px + i * 0.85, pz + j * 0.85));
  wy += 0.07;
  const impact = new THREE.Vector2(lipX + 0.7, pz);
  const poolMat = waterMat(/* glsl */ `
    vec2 d = vWorld.xz - uImpact;
    float r = length(d);
    float rip = sin(r * 9.0 - uTime * 7.0) * 0.5 + 0.5;
    float n = vnoise(vWorld.xz * 2.2 + uTime * 0.4) * 0.6 + vnoise(vWorld.xz * 5.0 - uTime * 0.7) * 0.4;
    vec3 deep = vec3(0.1, 0.26, 0.24), shallow = vec3(0.28, 0.42, 0.36);
    float edge = smoothstep(2.75, 1.6, length(vWorld.xz - vec2(${px.toFixed(3)}, ${pz.toFixed(3)})));
    vec3 col = mix(shallow, deep, edge);
    col = mix(col, uSky, 0.25 + 0.15 * n);
    float foam = smoothstep(1.6, 0.0, r) * (0.5 + 0.5 * n) + smoothstep(0.85, 1.0, rip * n) * smoothstep(2.4, 0.5, r) * 0.6;
    col = mix(col, vec3(0.92, 0.95, 0.95), clamp(foam, 0.0, 1.0) * 0.85);
    col += uSun * pow(n, 6.0) * 0.4;
    outC = vec4(col, mix(0.55, 0.9, edge) + foam * 0.1);
  `);
  poolMat.uniforms.uImpact.value.copy(impact);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.8, 40).rotateX(-Math.PI / 2), poolMat);
  pool.position.set(px, wy, pz);
  pool.renderOrder = 2;
  group.add(pool);

  // outflow stream down the bank to the river
  {
    const x0 = px + 2.2, x1 = riverX(pz) - RIVER_HALF + 2.5;
    const n = 24, half = 0.6;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = pz + Math.sin(t * 5) * 0.25;
      const y = Math.max(WATER_Y + 0.03, Math.min(wy, heightAt(x, z) + 0.05));
      const w = half * (1 + t * 0.6) * (0.8 + 0.25 * Math.sin(t * 17 + 1) + 0.1 * Math.sin(t * 41));
      pos.push(x, y, z - w, x, y, z + w);
      uv.push(t * (x1 - x0), 0, t * (x1 - x0), 1);
    }
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = waterMat(/* glsl */ `
      float n = vnoise(vec2(vUv.x * 2.0 - uTime * 2.2, vUv.y * 4.0)) * 0.6 + vnoise(vec2(vUv.x * 6.0 - uTime * 3.5, vUv.y * 9.0)) * 0.4;
      float side = 1.0 - abs(vUv.y * 2.0 - 1.0);
      vec3 col = mix(vec3(0.26, 0.4, 0.32), vec3(0.09, 0.25, 0.24), smoothstep(0.1, 0.8, side));
      col = mix(col, uSky * 0.6, 0.12 * n);
      col = mix(col, vec3(0.82, 0.88, 0.86), smoothstep(0.72, 0.95, n) * 0.5);
      col += uSun * pow(n, 8.0) * 0.5;
      outC = vec4(col, smoothstep(0.0, 0.45, side + (n - 0.5) * 0.2) * 0.82);
    `);
    const s = new THREE.Mesh(g, m);
    s.renderOrder = 2;
    group.add(s);
    group.userData.stream = m;
  }

  // the falling sheet: leaves the lip, arcs out and drops into the pool
  const sheetMat = waterMat(/* glsl */ `
    float u = vUv.x, v = 1.0 - vUv.y;
    float n = vnoise(vec2(u * 14.0, v * 3.0 - uTime * 3.2)) * 0.55 + vnoise(vec2(u * 31.0, v * 7.0 - uTime * 5.0)) * 0.3 + vnoise(vec2(u * 60.0, v * 2.0 - uTime * 6.0)) * 0.15;
    float side = 1.0 - abs(u * 2.0 - 1.0);
    float body = smoothstep(0.0, 0.35, side + (n - 0.5) * 0.4);
    vec3 col = mix(vec3(0.52, 0.66, 0.66), vec3(0.95, 0.97, 0.97), smoothstep(0.35, 0.8, n) * 0.85 + v * 0.25);
    col = mix(col, uSky, 0.12);
    float a = body * (0.55 + n * 0.45) * smoothstep(0.0, 0.05, v);
    outC = vec4(col, clamp(a, 0.0, 0.95));
  `);
  const sheets = [];
  for (const [off, wscale] of [[0, 1], [0.12, 0.8]]) {
    const geo = new THREE.PlaneGeometry(1, 1, 8, 28);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = 0.5 - p.getY(i); // v: 0 at the lip, 1 at the pool
      const y = top - v * (top - wy);
      const x = lipX + 0.08 + off + 0.62 * Math.sqrt(v) + Math.sin(u * 9 + v * 3) * 0.03;
      const z = pz + (u - 0.5) * (1.0 + v * 0.7) * wscale;
      p.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, sheetMat);
    m.renderOrder = 3;
    m.frustumCulled = false;
    group.add(m);
    sheets.push(m);
  }

  const mist = new Puffs({ max: 90, color: '#f2f6f6', opacity: 0.32, buoyancy: 0.6, drag: 1.2 });
  group.add(mist.mesh);
  let acc = 0;
  const mats = [poolMat, sheetMat, group.userData.stream];
  return {
    group,
    pos: { x: lipX + 0.7, z: pz },
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
        acc += dt * 22;
        while (acc > 1) {
          acc -= 1;
          const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 1.2;
          mist.emit(impact.x + (Math.random() - 0.3) * 0.6, wy + 0.1, impact.y + (Math.random() - 0.5) * 1.2,
            Math.cos(a) * sp + 0.3, 0.3 + Math.random() * 0.8, Math.sin(a) * sp, 1.4 + Math.random(), 0.5, 1.9 + Math.random(), 0.9);
        }
      }
      mist.update(dt);
    },
  };
}
