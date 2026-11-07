// Ambient life: circling birds and drifting pollen / dust motes that catch the light.
import * as THREE from 'three';

// A small flock (5–6 birds) in loose V formation crossing the sky every 30 seconds.
export class Flocks {
  constructor(scene) {
    const mat = new THREE.MeshBasicMaterial({ color: '#2b2622', side: THREE.DoubleSide, fog: true });
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.14, 0, 0, 0.16, 0.85, 0.05, -0.1], 3));
    const bodyGeo = new THREE.ConeGeometry(0.08, 0.5, 5).rotateX(Math.PI / 2);
    this.birds = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, mat));
      const wl = new THREE.Mesh(wingGeo, mat), wr = new THREE.Mesh(wingGeo, mat);
      wr.scale.x = -1;
      g.add(wl, wr);
      g.visible = false;
      scene.add(g);
      const row = Math.ceil(i / 2), side = i === 0 ? 0 : i % 2 ? -1 : 1;
      this.birds.push({ g, wl, wr, back: row * 2.4, side: side * row * 2.2, ph: Math.random() * 6, dh: (Math.random() - 0.5) * 0.8 });
    }
    this.next = 6;
    this.active = null;
    this.enabled = true;
  }
  update(t, dt, center) {
    if (t > this.next && this.enabled) {
      this.next = t + 30;
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const off = (Math.random() - 0.5) * 70;
      this.active = {
        start: t, dir, side,
        origin: new THREE.Vector3(center.x, center.y + 28 + Math.random() * 14, center.z).addScaledVector(dir, -230).addScaledVector(side, off),
        count: 5 + (Math.random() < 0.5 ? 1 : 0),
      };
    }
    const A = this.active;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      if (!A || i >= A.count || t - A.start > 36) { b.g.visible = false; continue; }
      b.g.visible = true;
      const s = (t - A.start) * 13;
      const p = A.origin.clone().addScaledVector(A.dir, s - b.back).addScaledVector(A.side, b.side + Math.sin(t * 0.7 + b.ph) * 0.4);
      p.y += b.dh + Math.sin(t * 0.9 + b.ph) * 0.5;
      b.g.position.copy(p);
      b.g.rotation.set(0, Math.atan2(A.dir.x, A.dir.z), 0);
      const glide = Math.sin(t * 0.45 + b.ph) > 0.55 ? 0.15 : 1;
      const flap = Math.sin(t * 9 + b.ph * 3) * 0.75 * glide + 0.1;
      b.wl.rotation.z = flap;
      b.wr.rotation.z = -flap;
    }
  }
}

export function buildMotes() {
  const N = 900, S = 70;
  const pos = new Float32Array(N * 3), rnd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * S;
    pos[i * 3 + 1] = Math.random() * 14;
    pos[i * 3 + 2] = (Math.random() - 0.5) * S;
    rnd[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color('#fff0c8') },
      uScale: { value: 1 },
      uIntensity: { value: 1 },
      uDensity: { value: 1 },
      uHeight: { value: 14 },
      uSpeed: { value: 1 },
      uSize: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aRand;
      uniform float uTime, uScale, uDensity, uHeight, uSpeed, uSize;
      uniform vec3 uCenter;
      varying float vA;
      void main() {
        vec3 p = position;
        p.xz += vec2(0.87, 0.49) * uTime * (0.6 + aRand * 1.4) * uSpeed;
        p += vec3(sin(uTime * 0.7 + aRand * 40.0) * 0.8, sin(uTime * 0.9 + aRand * 17.0) * 0.5, cos(uTime * 0.6 + aRand * 23.0) * 0.8);
        vec3 rel;
        rel.xz = mod(p.xz - uCenter.xz + 35.0, 70.0) - 35.0;
        rel.y = mod(p.y, uHeight) - 1.0;
        vec3 w = vec3(uCenter.x + rel.x, uCenter.y + rel.y, uCenter.z + rel.z);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = length(rel.xz);
        vA = (1.0 - smoothstep(20.0, 34.0, d)) * (0.55 + 0.45 * sin(uTime * 2.0 + aRand * 60.0)) * smoothstep(1.5, 4.0, -mv.z) * step(aRand, uDensity);
        gl_PointSize = (2.0 + aRand * 3.0) * uScale * uSize * 30.0 / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * uIntensity, a * vA * 0.7);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ---------------- birds round the boy: crows and sparrows ----------------
// A few house crows and a little flock of sparrows that live near wherever the boy is: they hop and peck on
// the ground, take off when he comes too close (or just because) and flutter low to another spot nearby,
// cawing and cheeping. If he walks off and leaves them behind, they fly in again from a little way off.
export class GroundBirds {
  constructor(scene, ground, isWet) {
    this.ground = ground;
    this.isWet = isWet;
    const black = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.55 });
    const grey = new THREE.MeshStandardMaterial({ color: '#4a4c52', roughness: 0.6 });
    const brown = new THREE.MeshStandardMaterial({ color: '#7a5434', roughness: 0.8 });
    const buff = new THREE.MeshStandardMaterial({ color: '#c8b498', roughness: 0.85 });
    const beakM = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.5 });
    const S = (r, sx, sy, sz) => new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz);
    const wingGeo = (len, w) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, w * 0.6, 0, 0, -w * 0.5, len, 0, -w * 0.15, 0, 0, w * 0.6, len, 0, -w * 0.15, len * 0.7, 0, w * 0.3], 3));
      g.computeVertexNormals();
      return g;
    };
    const make = (crow) => {
      const s = crow ? 1 : 0.38;
      const g = new THREE.Group();
      const body = new THREE.Mesh(S(0.1, 0.9, 0.85, 1.6), crow ? black : brown);
      body.position.y = 0.12 * s / s * (crow ? 1 : 1);
      g.add(body);
      if (!crow) { const b2 = new THREE.Mesh(S(0.085, 0.95, 0.8, 1.3), buff); b2.position.set(0, 0.1, 0.01); g.add(b2); }
      const head = new THREE.Group(); head.position.set(0, 0.2, 0.13); g.add(head);
      head.add(new THREE.Mesh(S(0.06, 1, 1, 1.1), crow ? black : brown));
      if (crow) { const nape = new THREE.Mesh(S(0.058, 1.05, 0.9, 1), grey); nape.position.set(0, 0.0, -0.025); head.add(nape); }
      const beak = new THREE.Mesh(new THREE.ConeGeometry(crow ? 0.022 : 0.026, crow ? 0.09 : 0.05, 6).rotateX(Math.PI / 2), beakM); beak.position.set(0, -0.005, 0.08); head.add(beak);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.16), crow ? black : brown); tail.position.set(0, 0.13, -0.2); tail.rotation.x = 0.35; g.add(tail);
      const wg = wingGeo(crow ? 0.36 : 0.3, crow ? 0.18 : 0.15);
      const wm = new THREE.MeshStandardMaterial({ color: crow ? '#141416' : '#6a4a2e', roughness: 0.6, side: THREE.DoubleSide });
      const wl = new THREE.Mesh(wg, wm), wr = new THREE.Mesh(wg, wm);
      wl.position.set(0.05, 0.16, 0.0); wr.position.set(-0.05, 0.16, 0.0); wr.scale.x = -1;
      g.add(wl, wr);
      for (const sx of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 4), beakM); leg.position.set(sx * 0.03, 0.035, 0.02); g.add(leg); }
      g.scale.setScalar(s);
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.visible = false;
      scene.add(g);
      return { g, head, wl, wr, crow, s, p: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), state: 'off', t: 0, dur: 1, hop: 0, peck: 0, facing: 0, flock: null };
    };
    this.crows = Array.from({ length: 5 }, () => make(true));
    this.sparrows = Array.from({ length: 12 }, () => make(false));
    this.all = [...this.crows, ...this.sparrows];
    this.enabled = true;
    this.cawT = 3; this.chirpT = 2;
    this.onCaw = null; this.onChirp = null;
    this._d = new THREE.Vector3();
  }
  // a spot on open ground near (x, z), not in water
  spot(cx, cz, rMin, rMax, awayX = 0, awayZ = 0) {
    for (let i = 0; i < 10; i++) {
      let a = Math.random() * Math.PI * 2;
      if (awayX || awayZ) a = Math.atan2(awayX, awayZ) + (Math.random() - 0.5) * 1.6;
      const d = rMin + Math.random() * (rMax - rMin);
      const x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d;
      if (this.isWet(x, z)) continue;
      return new THREE.Vector3(x, this.ground(x, z), z);
    }
    return null;
  }
  fly(b, to, low = true) {
    b.from.copy(b.p); b.to.copy(to);
    b.state = 'fly'; b.t = 0;
    const d = b.from.distanceTo(to);
    b.dur = Math.max(0.8, d / (b.crow ? 7 : 6.5));
    b.arc = (low ? 1.2 : 4) + d * (b.crow ? 0.12 : 0.08);
    b.facing = Math.atan2(to.x - b.p.x, to.z - b.p.z);
  }
  update(dt, player, night) {
    const on = this.enabled && !night && player.y - this.ground(player.x, player.z) < 25;
    // sparrows move as one little flock; crows go about on their own
    for (const b of this.all) {
      if (!on) { b.g.visible = false; b.state = 'off'; continue; }
      const dx = b.p.x - player.x, dz = b.p.z - player.z, d = Math.hypot(dx, dz);
      if (b.state === 'off' || d > 75) {
        // fly in from a little way off to somewhere near the boy
        const land = this.spot(player.x, player.z, b.crow ? 12 : 8, b.crow ? 32 : 22);
        if (!land) continue;
        if (!b.crow && this.flockSpot && this.flockSpot.distanceTo(new THREE.Vector3(player.x, this.flockSpot.y, player.z)) < 40) land.copy(this.flockSpot).add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 0, (Math.random() - 0.5) * 2.5));
        else if (!b.crow) this.flockSpot = land.clone();
        b.p.set(land.x + (Math.random() - 0.5) * 60, land.y + 12 + Math.random() * 8, land.z + (Math.random() - 0.5) * 60);
        this.fly(b, land, false);
        b.g.visible = true;
      }
      if (b.state === 'ground') {
        b.t += dt;
        // take off if the boy comes close, or now and then for no reason
        const scare = b.crow ? 5.5 : 3.8;
        if (d < scare || Math.random() < dt * (b.crow ? 0.04 : 0.025)) {
          const to = this.spot(b.p.x, b.p.z, b.crow ? 10 : 6, b.crow ? 25 : 16, d < scare ? dx : 0, d < scare ? dz : 0);
          if (to) {
            if (!b.crow) {
              // the whole flock goes together
              this.flockSpot = to.clone();
              for (const o of this.sparrows) if (o.state === 'ground') this.fly(o, to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 0, (Math.random() - 0.5) * 2.5)));
              if (d < 20) this.onChirp?.(1 - d / 25);
            } else { this.fly(b, to); if (d < 30 && Math.random() < 0.6) this.onCaw?.(1 - d / 40); }
          }
        }
        // hop, peck, look about
        b.hop -= dt;
        let hy = 0;
        if (b.hop < 0) { b.hop = (b.crow ? 1.2 : 0.5) + Math.random() * (b.crow ? 2.5 : 1.4); b.facing += (Math.random() - 0.5) * 1.6; b.hopT = 0.18; }
        if (b.hopT > 0) {
          b.hopT -= dt;
          const step = (b.crow ? 0.6 : 0.9) * dt * b.s * 3;
          b.p.x += Math.sin(b.facing) * step; b.p.z += Math.cos(b.facing) * step;
          hy = Math.sin((1 - b.hopT / 0.18) * Math.PI) * 0.06 * (b.crow ? 1.5 : 1);
        }
        b.p.y = this.ground(b.p.x, b.p.z);
        b.peck = Math.max(0, Math.sin(b.t * (b.crow ? 2.2 : 5) + b.s * 9)) ** 6;
        b.head.rotation.x = b.peck * 1.1;
        b.wl.rotation.set(0, Math.PI / 2 - 0.1, 0.25); b.wr.rotation.set(0, -Math.PI / 2 + 0.1, -0.25); // folded along the back
        b.g.position.set(b.p.x, b.p.y + hy, b.p.z);
        b.g.rotation.set(0, b.facing, 0);
      } else if (b.state === 'fly') {
        b.t += dt;
        const k = Math.min(1, b.t / b.dur), e = k * k * (3 - 2 * k);
        b.p.lerpVectors(b.from, b.to, e);
        b.p.y += Math.sin(k * Math.PI) * b.arc;
        b.g.position.copy(b.p);
        b.g.rotation.set(-Math.cos(k * Math.PI) * 0.35, b.facing, 0);
        // fast wingbeats for the sparrows, slower rowing beats for the crows, a glide in the middle
        const glide = b.crow && k > 0.3 && k < 0.7 ? 0.25 : 1;
        const f = Math.sin(b.t * (b.crow ? 14 : 30)) * 0.9 * glide + 0.1;
        b.wl.rotation.set(0, 0, f); b.wr.rotation.set(0, 0, -f);
        b.head.rotation.x = 0;
        if (k >= 1) { b.state = 'ground'; b.t = Math.random() * 10; b.hop = 0.5; }
      }
    }
    if (!on) return;
    // the chatter
    this.cawT -= dt; this.chirpT -= dt;
    if (this.cawT < 0) {
      this.cawT = 5 + Math.random() * 9;
      let best = Infinity; for (const c of this.crows) if (c.g.visible) best = Math.min(best, Math.hypot(c.p.x - player.x, c.p.z - player.z));
      if (best < 45) this.onCaw?.(1 - best / 50);
    }
    if (this.chirpT < 0) {
      this.chirpT = 1.5 + Math.random() * 3.5;
      let best = Infinity; for (const c of this.sparrows) if (c.g.visible) best = Math.min(best, Math.hypot(c.p.x - player.x, c.p.z - player.z));
      if (best < 30) this.onChirp?.(1 - best / 34);
    }
  }
}
