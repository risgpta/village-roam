// Billboarded soft puffs (train smoke, chai steam, waterfall mist). CPU-simulated, GPU-drawn in one call.
import * as THREE from 'three';

export class Puffs {
  constructor({ max = 200, color = '#ffffff', dark = null, opacity = 1, additive = false, buoyancy = 0, drag = 0.6 } = {}) {
    this.max = max;
    this.buoyancy = buoyancy;
    this.drag = drag;
    this.wind = new THREE.Vector3(0, 0, 0);
    this.list = [];
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    this.aPos = new Float32Array(max * 3);
    this.aData = new Float32Array(max * 4); // size, alpha, seed, shade
    this.posAttr = new THREE.InstancedBufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.dataAttr = new THREE.InstancedBufferAttribute(this.aData, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.posAttr);
    geo.setAttribute('iData', this.dataAttr);
    geo.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uColor: { value: new THREE.Color(color) },
          uDark: { value: new THREE.Color(dark ?? color) },
          uOpacity: { value: opacity },
        },
      ]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        attribute vec3 iPos;
        attribute vec4 iData;
        varying vec2 vUv;
        varying vec2 vData;
        varying float vSeed;
        void main() {
          vUv = uv;
          vData = iData.yw;
          vSeed = iData.z;
          float a = iData.z * 6.2831;
          vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
          vec4 mvPosition = viewMatrix * vec4(iPos, 1.0);
          mvPosition.xy += q * iData.x;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uColor, uDark;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec2 vData;
        varying float vSeed;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
        }
        void main() {
          vec2 p = vUv - 0.5;
          float d = length(p) * 2.0;
          float n = vn(vUv * 4.0 + vSeed * 31.0) * 0.6 + vn(vUv * 9.0 - vSeed * 17.0) * 0.4;
          float a = smoothstep(1.0, 0.25, d + (n - 0.5) * 0.55);
          if (a < 0.01) discard;
          float lit = 0.78 + 0.32 * (vUv.y - 0.5) + n * 0.12;
          vec3 col = mix(uDark, uColor, vData.y) * lit;
          gl_FragColor = vec4(col, a * vData.x * uOpacity);
          #include <fog_fragment>
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  // life (s), size from s0 to s1, peak alpha, shade from sh0 (dark) to 1 (light)
  emit(x, y, z, vx, vy, vz, life, s0, s1, alpha = 1, sh0 = 1) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, age: 0, life, s0, s1, alpha, sh0, seed: Math.random() });
  }

  update(dt) {
    const L = this.list;
    let w = 0;
    const drag = Math.exp(-dt * this.drag);
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vx = (p.vx - this.wind.x) * drag + this.wind.x;
      p.vz = (p.vz - this.wind.z) * drag + this.wind.z;
      p.vy = p.vy * drag + this.buoyancy * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      L[w++] = p;
    }
    L.length = w;
    for (let i = 0; i < w; i++) {
      const p = L[i];
      const t = p.age / p.life;
      const ease = 1 - (1 - t) * (1 - t);
      this.aPos[i * 3] = p.x; this.aPos[i * 3 + 1] = p.y; this.aPos[i * 3 + 2] = p.z;
      this.aData[i * 4] = p.s0 + (p.s1 - p.s0) * ease;
      this.aData[i * 4 + 1] = p.alpha * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.4);
      this.aData[i * 4 + 2] = p.seed + t * 0.08;
      this.aData[i * 4 + 3] = p.sh0 + (1 - p.sh0) * Math.min(1, t * 2.5);
    }
    this.mesh.geometry.instanceCount = w;
    this.posAttr.needsUpdate = true;
    this.dataAttr.needsUpdate = true;
  }
}
