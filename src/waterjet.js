// Water in flight: a hose jet, a hand pump's gush. Every drop is a little body of its own — thrown out with a
// speed and a direction, pulled down by gravity, slowed by the air — drawn as a soft glinting point. Where one
// lands it splashes (a few drops bounce up, a puff of spray) and the ground darkens wet, then dries in the sun.
// What it lands on is reported back (onHit) so a fire can be put out by it.
import * as THREE from 'three';
import { Puffs } from './particles.js';

const G = 9.8;

export class WaterJet {
  constructor(scene, { max = 3500, size = 0.1, color = '#dff1ff', puddles = 140 } = {}) {
    this.max = max;
    this.n = 0;
    this.dropSize = size;
    // x y z vx vy vz life ground size kind(0 jet, 1 bounce)
    this.d = new Float32Array(max * 10);
    this.age = 0;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.sz = new Float32Array(max);
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.szAttr = new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aSize', this.szAttr);
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(color) }, uScale: { value: 400 }, uLight: { value: 1 } }]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        attribute float aSize; uniform float uScale;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = max(1.5, aSize * uScale / -mvPosition.z);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform vec3 uColor; uniform float uLight;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r = length(c);
          if (r > 0.5) discard;
          // a clear bead: dim at the rim, a bright glint up toward the light
          float a = smoothstep(0.5, 0.2, r) * 0.72;
          float glint = smoothstep(0.18, 0.0, length(c - vec2(-0.12, -0.14)));
          gl_FragColor = vec4(uColor * uLight * (0.75 + 0.5 * glint), a + glint * 0.3);
          #include <fog_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
    // the spray thrown up where it lands
    this.spray = new Puffs({ max: 260, color: '#f2f7fa', dark: '#ffffff', opacity: 0.32, buoyancy: 0.15, drag: 2.2 });
    scene.add(this.spray.mesh);
    // wet ground: dark soft patches that grow while the water falls and shrink as they dry
    const tex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    this.wetMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.25, transparent: true, opacity: 0.42, alphaMap: tex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), puddles);
    this.wetMesh.count = 0; this.wetMesh.frustumCulled = false; this.wetMesh.receiveShadow = true; this.wetMesh.renderOrder = 1;
    scene.add(this.wetMesh);
    this.wet = []; // { x, y, z, k }
    this.wetCells = new Map();
    this._m = new THREE.Matrix4();
  }

  // throw `count` drops from (ox, oy, oz) along (dx, dy, dz) at `speed` m/s, spread by `spread` (radians-ish)
  emit(ox, oy, oz, dx, dy, dz, speed, count, spread = 0.03, ground = oy - 1, size = 1) {
    const l = Math.hypot(dx, dy, dz) || 1;
    for (let i = 0; i < count; i++) {
      if (this.n >= this.max) return;
      const k = this.n++ * 10, s = speed * (0.93 + Math.random() * 0.14);
      const jx = (Math.random() - 0.5) * 2 * spread, jy = (Math.random() - 0.5) * 2 * spread, jz = (Math.random() - 0.5) * 2 * spread;
      const d = this.d, t = Math.random() * 0.016; // (spread along the frame, not in clumps)
      d[k + 3] = (dx / l + jx) * s; d[k + 4] = (dy / l + jy) * s; d[k + 5] = (dz / l + jz) * s;
      d[k] = ox + d[k + 3] * t; d[k + 1] = oy + d[k + 4] * t; d[k + 2] = oz + d[k + 5] * t;
      d[k + 6] = 0; d[k + 7] = ground; d[k + 8] = size * (0.7 + Math.random() * 0.6); d[k + 9] = 0;
    }
  }

  // groundAt(x, z): the height of what it lands on; onHit(x, y, z): told of each jet drop that lands;
  // solid(x, y, z): true if a drop in flight has run into something (a haystack, say) — it splashes there
  update(dt, groundAt, onHit, light = 1, solid = null) {
    const d = this.d, drag = Math.exp(-dt * 0.35);
    this.age++;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const k = i * 10;
      let x = d[k], y = d[k + 1], z = d[k + 2], vx = d[k + 3], vy = d[k + 4], vz = d[k + 5];
      const life = (d[k + 6] += dt), bounce = d[k + 9];
      vy -= G * dt; vx *= drag; vy *= drag; vz *= drag;
      x += vx * dt; y += vy * dt; z += vz * dt;
      // the ground under it: looked up again every few frames, and every frame once it's close
      let g = d[k + 7];
      if (y < g + 1.5 || (this.age + i) % 6 === 0) g = d[k + 7] = groundAt(x, z);
      const struck = !bounce && solid && y > g && (this.age + i) % 2 === 0 && solid(x, y, z);
      if (struck) g = y;
      if (y <= g || life > 6) {
        if (y <= g && !bounce) {
          onHit?.(x, g, z);
          // a few drops bounce up, a little spray, and the ground gets wetter
          if (Math.random() < 0.35 && this.n < this.max) {
            const j = this.n++ * 10, a = Math.random() * 6.283, sp = 0.6 + Math.random() * 1.4;
            d[j] = x; d[j + 1] = g + 0.02; d[j + 2] = z; d[j + 3] = Math.cos(a) * sp + vx * 0.15; d[j + 4] = 1 + Math.random() * 1.6; d[j + 5] = Math.sin(a) * sp + vz * 0.15;
            d[j + 6] = 0; d[j + 7] = g; d[j + 8] = 0.45; d[j + 9] = 1;
          }
          if (Math.random() < 0.06) this.spray.emit(x, g + 0.1, z, vx * 0.08, 0.5 + Math.random() * 0.5, vz * 0.08, 0.9 + Math.random() * 0.6, 0.25, 0.9, 0.7, 1);
          if (!struck) this.wetAt(x, g, z); // (a drop caught by something on the way leaves no wet ground)
        }
        continue; // gone
      }
      // keep it (packed down over the dead ones)
      const o = w * 10;
      d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz; d[o + 6] = life; d[o + 7] = g; d[o + 8] = d[k + 8]; d[o + 9] = bounce;
      this.pos[w * 3] = x; this.pos[w * 3 + 1] = y; this.pos[w * 3 + 2] = z; this.sz[w] = this.dropSize * d[o + 8];
      w++;
    }
    // (the bounce drops made this frame were appended and handled in the same pass)
    this.n = w;
    this.points.geometry.setDrawRange(0, w);
    this.posAttr.needsUpdate = true; this.szAttr.needsUpdate = true;
    this.posAttr.addUpdateRange?.(0, w * 3); this.szAttr.addUpdateRange?.(0, w);
    this.material.uniforms.uScale.value = window.innerHeight * 0.9;
    this.material.uniforms.uLight.value = light;
    this.spray.update(dt);
    // drying
    let changed = false;
    for (let i = 0; i < this.wet.length; i++) {
      const p = this.wet[i];
      if (p.k > 0) { p.k -= dt / 45; changed = true; if (p.k < 0) p.k = 0; }
      const s = Math.sqrt(Math.max(0, Math.min(1, p.k))) * p.r;
      this._m.makeScale(s || 1e-4, 1, s || 1e-4).setPosition(p.x, p.y + 0.03, p.z);
      this.wetMesh.setMatrixAt(i, this._m);
    }
    this.wetMesh.count = this.wet.length;
    if (changed) this.wetMesh.instanceMatrix.needsUpdate = true;
  }

  wetAt(x, y, z) {
    const key = Math.round(x / 0.9) * 7919 + Math.round(z / 0.9);
    let p = this.wetCells.get(key);
    if (!p) {
      if (this.wet.length >= this.wetMesh.instanceMatrix.count) {
        // the driest patch makes way
        let best = 0; for (let i = 1; i < this.wet.length; i++) if (this.wet[i].k < this.wet[best].k) best = i;
        p = this.wet[best]; this.wetCells.delete(p.key);
      } else { p = {}; this.wet.push(p); }
      Object.assign(p, { key, x: Math.round(x / 0.9) * 0.9, y, z: Math.round(z / 0.9) * 0.9, k: 0, r: 0.75 + Math.random() * 0.35 });
      this.wetCells.set(key, p);
    }
    p.k = Math.min(1.6, p.k + 0.012);
  }

  get active() { return this.n > 0; }
}
