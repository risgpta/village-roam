// Night sky with a full moon and stars, a drifting cloud layer, and gentle rain.
import * as THREE from 'three';

export function buildNightSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uMoonDir: { value: new THREE.Vector3(0.3, 0.6, -0.7).normalize() },
      uTime: { value: 0 },
      uCloud: { value: 0 },
      uMoon: { value: 1 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoonDir; uniform float uTime; uniform float uCloud; uniform float uMoon;
      varying vec3 vDir;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir);
        float up = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(vec3(0.075, 0.1, 0.17), vec3(0.012, 0.02, 0.05), pow(up, 0.5));
        col = mix(col * 0.28, col, uMoon); // no moon: a much darker sky
        float dark = 1.0 - uMoon;
        // stars
        vec3 c = floor(d * 380.0);
        float s = h(c);
        float star = step(0.9965 - dark * 0.0035, s) * smoothstep(0.02, 0.25, d.y);
        float tw = 0.6 + 0.4 * sin(uTime * (1.0 + s * 3.0) + s * 50.0);
        col += vec3(0.9, 0.92, 1.0) * star * tw * (0.6 + 2.0 * fract(s * 91.0)) * (1.0 - uCloud);
        // milky band
        float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.2, 1.0))) * 3.0, 2.0)) * smoothstep(0.0, 0.4, d.y);
        col += vec3(0.05, 0.055, 0.07) * band * (1.0 - uCloud) * (1.0 + dark * 1.6);
        // moon
        float md = dot(d, uMoonDir);
        float disc = smoothstep(0.99955, 0.99965, md);
        vec3 lp = d - uMoonDir;
        float maria = 0.85 + 0.15 * sin(lp.x * 900.0) * sin(lp.y * 700.0 + 1.3);
        col = mix(col, vec3(3.2, 3.1, 2.8) * maria, disc * uMoon);
        col += vec3(0.35, 0.4, 0.55) * pow(max(md, 0.0), 400.0) * 0.8 * uMoon;
        col += vec3(0.08, 0.1, 0.16) * pow(max(md, 0.0), 12.0) * uMoon;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(3200, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

export function buildClouds() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uCover: { value: 0.3 },
      uSpeed: { value: 1 },
      uLit: { value: new THREE.Color('#fff6e8') },
      uShade: { value: new THREE.Color('#9aa3b0') },
      uOpacity: { value: 0.9 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uCover, uSpeed, uOpacity; uniform vec3 uLit, uShade, uSunDir;
      varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      void main(){
        vec2 wind = vec2(0.87, 0.49) * uTime * 6.0 * uSpeed;
        vec2 p = (vW.xz + wind) * 0.0016;
        float f = fbm(p);
        float c = smoothstep(1.0 - uCover - 0.12, 1.0 - uCover + 0.28, f);
        float f2 = fbm(p + uSunDir.xz * 0.04);
        float shade = clamp((f2 - f) * 4.0 + 0.6, 0.0, 1.0);
        vec3 col = mix(uShade, uLit, shade);
        float dist = length(vW.xz - cameraPosition.xz);
        float fade = 1.0 - smoothstep(1100.0, 2400.0, dist);
        gl_FragColor = vec4(col, c * fade * uOpacity);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200).rotateX(Math.PI / 2), mat);
  m.position.y = 280;
  m.frustumCulled = false;
  m.renderOrder = 1;
  return m;
}

export function buildRain() {
  const N = 7000;
  const pos = new Float32Array(N * 2 * 3), end = new Float32Array(N * 2), seed = new Float32Array(N * 2 * 3);
  for (let i = 0; i < N; i++) {
    const x = (Math.random() - 0.5) * 60, y = Math.random() * 24, z = (Math.random() - 0.5) * 60;
    for (let k = 0; k < 2; k++) {
      pos.set([x, y, z], (i * 2 + k) * 3);
      end[i * 2 + k] = k;
      seed.set([Math.random(), Math.random(), Math.random()], (i * 2 + k) * 3);
    }
  }
  for (let i = 0; i < N; i++) seed.set(seed.slice(i * 6, i * 6 + 3), i * 6 + 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uColor: { value: new THREE.Color('#c9d2db') } },
    vertexShader: /* glsl */ `
      attribute float aEnd; attribute vec3 aSeed;
      uniform float uTime, uAmount; uniform vec3 uCenter;
      varying float vA;
      void main(){
        float speed = 11.0 + aSeed.x * 4.0;
        float y = mod(position.y - uTime * speed, 24.0);
        vec3 p = vec3(position.x, y, position.z);
        p.xz += vec2(0.87, 0.49) * (24.0 - y) * 0.12;
        vec3 rel;
        rel.xz = mod(p.xz - uCenter.xz + 30.0, 60.0) - 30.0;
        rel.y = p.y - 6.0;
        vec3 w = uCenter + rel;
        w -= aEnd * vec3(0.87 * 0.12, -1.0, 0.49 * 0.12) * -0.55;
        vA = step(aSeed.y, uAmount) * (1.0 - smoothstep(14.0, 30.0, length(rel.xz))) * (0.25 + aSeed.z * 0.35);
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uColor, vA); }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  return lines;
}
