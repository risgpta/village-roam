// The village airstrip and its little plane: a white high-wing two-seater with a saffron-and-green cheatline,
// a spinning propeller, moving ailerons, elevator, rudder and flaps, retractable gear, nav lights and strobes.
// Flight is a small arcade-sim: thrust, lift from the angle of attack (and a stall past it), drag, sideslip,
// gravity, ground roll with nose-wheel steering and brakes, and touchdown / crash checks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- geometry helpers ----------
// a loft of superelliptic cross-sections [z, halfW, halfH, yCentre] (z increasing); uv.x runs round from the
// top (0 top, .25 left side, .5 belly, .75 right side), uv.y along the length
function loft(secs, n = 32, e = 2.6) {
  const z0 = secs[0][0], z1 = secs[secs.length - 1][0];
  const pos = [], uv = [], idx = [];
  const S = (t) => Math.sign(t) * Math.pow(Math.abs(t), 2 / e);
  for (const [z, hw, hh, yc] of secs) for (let j = 0; j <= n; j++) {
    const th = (j / n) * Math.PI * 2;
    pos.push(hw * S(Math.sin(th)), yc + hh * S(Math.cos(th)), z);
    uv.push(j / n, (z - z0) / (z1 - z0));
  }
  for (let i = 0; i < secs.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * (n + 1) + j, b = a + n + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// an aerofoil (cambered NACA-ish section) of the given chord, LE at local z = zLE, extruded along +x over `span`
function foil(chord, span, thick = 0.13, camber = 0.03, zLE = 0, taper = 1) {
  const sh = new THREE.Shape();
  const N = 14, up = [], lo = [];
  for (let i = 0; i <= N; i++) {
    const t = Math.pow(i / N, 1.6);
    const yt = 5 * thick * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4) * chord;
    const yc = camber * chord * Math.sin(Math.PI * t);
    up.push([-(zLE - t * chord), yc + yt]); lo.push([-(zLE - t * chord), yc - yt]);
  }
  sh.moveTo(up[N][0], up[N][1]);
  for (let i = N - 1; i >= 0; i--) sh.lineTo(up[i][0], up[i][1]);
  for (let i = 1; i <= N; i++) sh.lineTo(lo[i][0], lo[i][1]);
  const g = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, steps: 1 });
  g.rotateY(Math.PI / 2); // shape X (= -z) → z, extrusion → +x
  if (taper !== 1) {
    // narrow the chord toward the tip, about the quarter-chord line
    const p = g.attributes.position, zq = zLE - chord * 0.25;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + (taper - 1) * clamp(p.getX(i) / span, 0, 1);
      p.setZ(i, zq + (p.getZ(i) - zq) * k); p.setY(i, p.getY(i) * (0.6 + 0.4 * k));
    }
    g.computeVertexNormals();
  }
  return g;
}
// a flat plate cut from a 2D outline in the (z, y) plane, thickness along x, centred on x = 0
function plate(pts, t = 0.07) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  g.rotateY(-Math.PI / 2); // shape X → z, extrusion → -x
  g.translate(t / 2, 0, 0);
  return g;
}
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- the fuselage livery: body colours, window cut-outs, the cheatline and the registration ----------
const SECS = [
  [-5.1, 0.05, 0.08, 1.7], [-4.7, 0.12, 0.2, 1.66], [-3.8, 0.22, 0.32, 1.58], [-2.8, 0.33, 0.45, 1.5], [-1.8, 0.47, 0.6, 1.41],
  [-1.0, 0.57, 0.72, 1.34], [-0.2, 0.61, 0.77, 1.3], [0.6, 0.61, 0.74, 1.27], [1.15, 0.58, 0.58, 1.14], [1.65, 0.55, 0.5, 1.07],
  [2.2, 0.47, 0.42, 1.05], [2.46, 0.35, 0.32, 1.05],
];
const FZ0 = SECS[0][0], FZ1 = SECS[SECS.length - 1][0];
const vOf = (z) => (z - FZ0) / (FZ1 - FZ0);
// window areas in (u, z): windscreen over the top, door and rear windows on both sides
const WINDOWS = [
  [-0.17, 0.17, 0.66, 1.2], // windscreen (u wraps round 0)
  [0.095, 0.225, -0.2, 0.6], [0.105, 0.215, -1.25, -0.32], // left: door, rear
  [0.775, 0.905, -0.2, 0.6], [0.785, 0.895, -1.25, -0.32], // right
];
function fuselageTextures() {
  const W = 1024, H = 1024;
  const px = (u, z) => [u * W, (1 - vOf(z)) * H];
  const rect = (g, u0, u1, z0, z1, r = 18) => {
    const [x0, y1] = px(u0, z0), [x1, y0] = px(u1, z1);
    g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, r); g.fill();
  };
  const windows = (g) => {
    for (const [u0, u1, z0, z1] of WINDOWS) {
      if (u0 < 0) { rect(g, 1 + u0, 1.02, z0, z1); rect(g, -0.02, u1, z0, z1); } else rect(g, u0, u1, z0, z1);
    }
  };
  const map = canvas(W, H, (g) => {
    g.fillStyle = '#f5f3ee'; g.fillRect(0, 0, W, H);
    // a soft grey belly
    g.fillStyle = '#dcdcd8'; g.fillRect(0.4 * W, 0, 0.2 * W, H);
    // the cheatline: saffron over green, along both sides from the cowling to the tail
    const [, yA] = px(0, 2.3), [, yB] = px(0, -4.9);
    for (const [u0, u1, c] of [[0.232, 0.258, '#f08a24'], [0.262, 0.282, '#178a4a'], [0.742, 0.768, '#f08a24'], [0.718, 0.738, '#178a4a']]) {
      g.fillStyle = c; g.fillRect(u0 * W, yA, (u1 - u0) * W, yB - yA);
    }
    // a navy nose cap band and the frames round the windows
    g.fillStyle = '#21304a'; g.fillRect(0, px(0, 2.46)[1], W, px(0, 2.3)[1] - px(0, 2.46)[1]);
    g.fillStyle = '#55565e';
    for (const [u0, u1, z0, z1] of WINDOWS) {
      const pad = 0.003, zp = 0.014;
      if (u0 < 0) { rect(g, 1 + u0 - pad, 1.02, z0 - zp, z1 + zp, 22); rect(g, -0.02, u1 + pad, z0 - zp, z1 + zp, 22); } else rect(g, u0 - pad, u1 + pad, z0 - zp, z1 + zp, 22);
    }
    // door seams
    g.strokeStyle = 'rgba(60,60,64,0.55)'; g.lineWidth = 2;
    for (const [u0, u1] of [[0.07, 0.31], [0.69, 0.93]]) { const [x0, y0] = px(u0, 0.66), [x1, y1] = px(u1, -0.24); g.strokeRect(x0, y0, x1 - x0, y1 - y0); }
    // the registration on both sides of the rear fuselage, reading nose-to-tail the right way round from outside
    g.fillStyle = '#21304a'; g.font = 'bold 100px Inter, Arial, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    const reg = 'VT-GAON', tw = g.measureText(reg).width;
    const [, yN] = px(0, -2.2), [, yT] = px(0, -3.9), len = yT - yN;
    for (const side of [1, -1]) {
      const uc = side > 0 ? 0.185 : 0.815;
      const sx = len / tw, sy = (0.085 * W) / 100;
      g.save();
      if (side > 0) g.setTransform(0, sx, sy, 0, uc * W, (yN + yT) / 2);
      else g.setTransform(0, -sx, -sy, 0, uc * W, (yN + yT) / 2);
      g.fillText(reg, 0, 0);
      g.restore();
    }
  });
  const holes = canvas(W, H, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#000'; windows(g); });
  const glass = canvas(W, H, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; windows(g); });
  holes.colorSpace = glass.colorSpace = THREE.NoColorSpace;
  return { map, holes, glass };
}
function panelTexture() {
  return canvas(512, 160, (g, w, h) => {
    g.fillStyle = '#26262a'; g.fillRect(0, 0, w, h);
    const dial = (x, y, r, label, needle) => {
      g.fillStyle = '#0e0e10'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.strokeStyle = '#8a8a90'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = '#e8e8e8'; g.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78); g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.stroke(); }
      g.strokeStyle = '#ffb347'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(needle) * r * 0.7, y + Math.sin(needle) * r * 0.7); g.stroke();
      g.fillStyle = '#bbb'; g.font = '12px Arial'; g.textAlign = 'center'; g.fillText(label, x, y + r * 0.45);
    };
    dial(60, 58, 36, 'AIRSPEED', -0.6); dial(150, 58, 36, '', 0);
    // attitude ball
    g.save(); g.beginPath(); g.arc(150, 58, 30, 0, 7); g.clip(); g.fillStyle = '#3a7ad8'; g.fillRect(110, 20, 80, 38); g.fillStyle = '#8a5a2a'; g.fillRect(110, 58, 80, 40); g.restore();
    dial(240, 58, 36, 'ALT', 2.2); dial(60, 128, 26, 'RPM', 0.4); dial(150, 128, 26, 'HDG', -1.2); dial(240, 128, 26, 'VSI', 3.1);
    g.fillStyle = '#121214'; g.fillRect(310, 30, 170, 60); g.fillStyle = '#5be37a'; g.font = '20px monospace'; g.fillText('121.5  GAON', 395, 68);
    for (let i = 0; i < 5; i++) { g.fillStyle = i === 2 ? '#d33' : '#999'; g.fillRect(320 + i * 32, 110, 20, 30); }
  });
}

// ---------- the plane ----------
export const PLANE = { saddle: V(0, 0.9, 0.02), bar: V(0, 1.24, 0.47) };
const BODY_X = -0.3; // the pilot sits in the left seat; the body is shifted so his seat is at the origin
const MAIN_Z = -0.4, NOSE_Z = 1.95, WHEELBASE = NOSE_Z - MAIN_Z;

export class Plane {
  constructor() {
    this.kind = 'plane';
    this.L = { saddle: PLANE.saddle.clone(), bar: PLANE.bar.clone() };
    this.root = new THREE.Group();
    const g = new THREE.Group();
    g.position.x = BODY_X;
    this.root.add(g);
    this.body = g;
    const add = (geo, m, x = 0, y = 0, z = 0, p = g, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; p.add(o); return o; };
    const tex = fuselageTextures();
    const white = std('#f5f3ee', { roughness: 0.35, metalness: 0.1 });
    const saffron = std('#f08a24', { roughness: 0.4 }), green = std('#178a4a', { roughness: 0.4 }), navy = std('#21304a', { roughness: 0.4 });
    const dark = std('#2a2a2e', { roughness: 0.6 }), metal = std('#b8bcc2', { metalness: 0.85, roughness: 0.3 }), rubber = std('#161616', { roughness: 0.9 });
    const interior = std('#5a5048', { roughness: 0.85 }), seat = std('#3a3e52', { roughness: 0.75 });
    this.mats = { paint: white };

    // fuselage shell with see-through windows
    const fGeo = loft(SECS);
    const skin = new THREE.MeshStandardMaterial({ map: tex.map, alphaMap: tex.holes, alphaTest: 0.5, roughness: 0.35, metalness: 0.1 });
    add(fGeo, skin);
    // the cabin lining, seen from inside, with the same window openings
    const lining = new THREE.MeshStandardMaterial({ color: '#c9bfae', alphaMap: tex.holes, alphaTest: 0.5, roughness: 0.9, side: THREE.BackSide });
    add(fGeo, lining, 0, 0, 0, g, false);
    const glassM = new THREE.MeshPhysicalMaterial({ color: '#a8c8da', alphaMap: tex.glass, transparent: true, opacity: 0.32, roughness: 0.04, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const glassMesh = add(fGeo, glassM, 0, 0, 0, g, false);
    glassMesh.renderOrder = 2;
    // the spinner and the propeller
    const spin = add(new THREE.LatheGeometry([[0.27, 0], [0.24, 0.1], [0.17, 0.24], [0.08, 0.36], [0.001, 0.42]].map(([r, y]) => new THREE.Vector2(r, y)), 20).rotateX(Math.PI / 2), navy, 0, 1.05, 2.44);
    void spin;
    const prop = new THREE.Group(); prop.position.set(0, 1.05, 2.6); g.add(prop);
    const blade = new THREE.BoxGeometry(0.13, 0.86, 0.035, 1, 6, 1);
    { const p = blade.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), tw = 0.5 - (y + 0.43) * 0.45, x = p.getX(i), z = p.getZ(i); p.setX(i, x * Math.cos(tw) - z * Math.sin(tw)); p.setZ(i, x * Math.sin(tw) + z * Math.cos(tw)); p.setX(i, p.getX(i) * (1 - (y + 0.43) * 0.35)); } blade.computeVertexNormals(); }
    const propM = std('#202022', { roughness: 0.45 }), tipM = std('#f2c018', { roughness: 0.4 });
    for (const s of [1, -1]) {
      const b = add(blade, propM, 0, s * 0.52, 0, prop); b.rotation.z = s > 0 ? 0 : Math.PI;
      add(new THREE.BoxGeometry(0.1, 0.1, 0.04), tipM, 0, s * 0.91, 0, prop);
    }
    this.prop = prop;
    this.disc = add(new THREE.CircleGeometry(0.98, 40), new THREE.MeshBasicMaterial({ color: '#2a2a2a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 0, 1.05, 2.62, g, false);
    // cowling: intakes, exhaust stub
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.11, 12, 8).scale(1, 0.5, 0.25), dark, s * 0.22, 0.86, 2.36);
    add(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8).rotateX(Math.PI / 2), metal, 0.25, 0.68, 1.75);
    this.exhaust = V(BODY_X + 0.25, 0.66, 1.6);

    // wings: fixed part plus flap and aileron on hinges, for each side (the right one mirrored)
    const WY = 2.06, CH = 1.12, ZLE = 0.55, SPAN = 5.15, ZH = ZLE - CH;
    const wingGeo = foil(CH, SPAN, 0.14, 0.035, ZLE, 0.88);
    const flapGeo = foil(0.34, 2.25, 0.1, 0.02, 0, 1), ailGeo = foil(0.33, 1.95, 0.09, 0.01, 0, 0.92);
    this.flaps = []; this.ailerons = [];
    for (const side of [1, -1]) {
      const w = new THREE.Group(); w.position.set(0, WY, 0); w.scale.x = side; w.rotation.z = 0.03 * side; g.add(w);
      add(wingGeo, white, 0.02, 0, 0, w);
      const fl = new THREE.Group(); fl.position.set(0.62, 0.0, ZH - 0.01); w.add(fl); add(flapGeo, white, 0, 0, 0, fl); this.flaps.push(fl);
      const al = new THREE.Group(); al.position.set(2.98, 0.0, ZH + 0.03); w.add(al); add(ailGeo, white, 0, 0, 0, al); this.ailerons.push(al);
      // saffron tips, nav light
      add(new THREE.SphereGeometry(0.5, 14, 8).scale(0.12, 0.14, 1).translate(0, 0, -0.3), saffron, SPAN * 0.98 + 0.02, 0.02, 0.32, w);
      // wing struts down to the fuselage
      const a = V(0.5 * side, 0.82, -0.12), b = V(2.7 * side, WY - 0.02, -0.05);
      const len = a.distanceTo(b);
      const st = add(new THREE.CylinderGeometry(0.04, 0.04, len, 8).scale(1, 1, 2.2), metal, 0, 0, 0);
      st.position.copy(a).add(b).multiplyScalar(0.5);
      st.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    }
    // the tailplane: stabiliser + elevator, the fin + rudder
    const TY = 1.68;
    const stabGeo = foil(0.62, 1.8, 0.09, 0, -4.12, 0.75), elevGeo = foil(0.36, 1.8, 0.07, 0, 0, 0.78);
    this.elevator = [];
    for (const side of [1, -1]) {
      const t = new THREE.Group(); t.position.set(0, TY, 0); t.scale.x = side; g.add(t);
      add(stabGeo, white, 0.1, 0, 0, t);
      const el = new THREE.Group(); el.position.set(0.1, 0, -4.74); t.add(el); add(elevGeo, white, 0, 0, 0, el); this.elevator.push(el);
    }
    const finM = new THREE.MeshStandardMaterial({ roughness: 0.4, map: canvas(256, 256, (c, w, h) => {
      c.fillStyle = '#f5f3ee'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#f08a24'; c.fillRect(0, 0, w, h * 0.22);
      c.fillStyle = '#178a4a'; c.fillRect(0, h * 0.34, w, h * 0.12);
      c.fillStyle = '#21304a'; c.fillRect(0, h * 0.78, w, h * 0.06);
    }) });
    finM.map.repeat.set(1 / 2.3, 1 / 1.55); finM.map.offset.set(5.6 / 2.3, -1.62 / 1.55);
    add(plate([[-3.2, 1.72], [-4.05, 1.98], [-4.78, 3.08], [-5.04, 3.1], [-5.04, 1.7]], 0.08), finM);
    this.rudder = new THREE.Group(); this.rudder.position.set(0, 0, -5.04); g.add(this.rudder);
    const rud = add(plate([[0, 1.62], [0, 3.08], [-0.18, 3.06], [-0.42, 1.78], [-0.3, 1.62]], 0.06), finM, 0, 0, 0, this.rudder);
    void rud;

    // landing gear: two spring legs and a nose leg, each on a pivot so it can fold up
    this.wheels = [];
    this.legs = [];
    const wheel = (r, w) => {
      const o = new THREE.Group();
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, r * 0.3, 10, 22).rotateY(Math.PI / 2), rubber); tyre.castShadow = true; o.add(tyre);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w, 14).rotateZ(Math.PI / 2), metal); o.add(hub);
      return o;
    };
    for (const side of [1, -1]) {
      const pv = new THREE.Group(); pv.position.set(side * 0.5, 0.62, MAIN_Z); g.add(pv);
      const leg = add(new THREE.BoxGeometry(0.85, 0.05, 0.14), metal, side * 0.4, -0.17, 0, pv); leg.rotation.z = -side * 0.41;
      const wh = wheel(0.27, 0.15); wh.position.set(side * 0.8, -0.35, 0); pv.add(wh);
      this.wheels.push(wh); this.legs.push({ pv, side, nose: false });
    }
    {
      const pv = new THREE.Group(); pv.position.set(0, 0.62, NOSE_Z - 0.08); g.add(pv);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 8), metal, 0, -0.18, 0.04, pv);
      const fork = add(new THREE.BoxGeometry(0.16, 0.08, 0.06), metal, 0, -0.36, 0.08, pv); void fork;
      const wh = wheel(0.22, 0.12); wh.position.set(0, -0.4, 0.08); pv.add(wh);
      this.wheels.push(wh); this.legs.push({ pv, side: 0, nose: true }); this.noseLeg = pv;
    }

    // lights: red port (left, +x), green starboard, white tail, flashing strobes and a red beacon
    const lamp = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.2, roughness: 0.3 });
    this.navL = lamp('#ff2a20'); this.navR = lamp('#20ff5a'); this.tailL = lamp('#ffffff'); this.strobe = lamp('#ffffff'); this.beacon = lamp('#ff3020');
    this.landing = lamp('#fff2c8');
    const bulb = new THREE.SphereGeometry(0.06, 8, 6);
    add(bulb, this.navL, SPAN + 0.03, WY + 0.07, 0.1); add(bulb, this.navR, -SPAN - 0.03, WY + 0.07, 0.1);
    add(bulb, this.strobe, SPAN + 0.03, WY + 0.07, -0.25).scale.setScalar(0.7); add(bulb, this.strobe, -SPAN - 0.03, WY + 0.07, -0.25).scale.setScalar(0.7);
    add(bulb, this.tailL, 0, 1.7, -5.12);
    add(bulb, this.beacon, 0, 3.12, -4.92);
    add(bulb, this.beacon, 0, 0.53, -1.2);
    add(new THREE.CircleGeometry(0.09, 14), this.landing, BODY_X + 2.1, WY + 0.07, 0.548);

    // cabin: floor, two seats, panel with dials, the yoke, rudder pedals; a passenger seat left empty
    add(new THREE.BoxGeometry(1.05, 0.04, 2.1), interior, 0, 0.6, -0.15);
    for (const sx of [0.3, -0.3]) {
      add(new THREE.BoxGeometry(0.44, 0.1, 0.46), seat, sx, 0.84, 0.02);
      add(new THREE.BoxGeometry(0.44, 0.62, 0.1), seat, sx, 1.16, -0.3).rotation.x = -0.12;
      add(new THREE.BoxGeometry(0.4, 0.22, 0.42), interior, sx, 0.72, 0.02);
    }
    add(new THREE.BoxGeometry(1.02, 0.36, 0.5), seat, 0, 0.84, -0.86);
    const panel = add(new THREE.BoxGeometry(1.1, 0.3, 0.08), new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: 0.7 }), 0, 1.28, 0.8);
    const ptex = panelTexture();
    panel.material = [dark, dark, dark, dark, dark, new THREE.MeshStandardMaterial({ map: ptex, emissiveMap: ptex, roughness: 0.6, emissive: '#ffffff', emissiveIntensity: 0.0 })];
    this.panelMat = panel.material[5];
    panel.rotation.x = 0.15;
    add(new THREE.BoxGeometry(1.1, 0.06, 0.3), dark, 0, 1.45, 0.88);
    this.yoke = new THREE.Group(); this.yoke.position.set(0.3, 1.24, 0.47); g.add(this.yoke);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8).rotateX(Math.PI / 2), dark, 0, 0, 0.16, this.yoke);
    const yk = add(new THREE.TorusGeometry(0.12, 0.018, 6, 16, Math.PI), dark, 0, 0, 0, this.yoke); yk.rotation.z = Math.PI;
    add(new THREE.BoxGeometry(0.26, 0.03, 0.03), dark, 0, 0, 0, this.yoke);
    this.yokeR = new THREE.Group(); this.yokeR.position.set(-0.3, 1.24, 0.47); g.add(this.yokeR);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8).rotateX(Math.PI / 2), dark, 0, 0, 0.16, this.yokeR);
    add(new THREE.BoxGeometry(0.26, 0.03, 0.03), dark, 0, 0, 0, this.yokeR);
    this.pedals = [];
    for (const s of [-1, 1]) this.pedals.push(add(new THREE.BoxGeometry(0.08, 0.14, 0.03), dark, 0.3 + s * 0.13, 0.7, 0.74));
    // throttle knob in the middle of the panel
    this.knob = add(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8).rotateX(Math.PI / 2), std('#111'), 0, 1.16, 0.7);
    this.rpm = 0;
    this.gearT = 1;
    this.t = 0;
  }
  foot(side, out) { return out.set(side * 0.13, 0.7, 0.68); }
  // the generic per-frame call every vehicle gets (while parked, or ridden)
  update(dt, speed, steer, riding, night = 0) {
    if (riding) return; // flying is animated by animate()
    this.animate(dt, { throttle: 0, pitch: 0, roll: 0, yaw: 0, flaps: 0, gear: 1, night, speed: 0, engine: false });
  }
  // s: throttle 0..1, pitch/roll/yaw inputs −1..1, flaps 0..2, gear 0 (up)..1 (down), night 0/1, speed m/s, engine on
  animate(dt, s) {
    this.t += dt;
    const want = s.engine ? 0.18 + s.throttle * 0.82 : 0;
    this.rpm += (want - this.rpm) * (1 - Math.exp(-dt * (want > this.rpm ? 1.5 : 0.7)));
    this.prop.rotation.z += this.rpm * dt * 160;
    const blur = clamp((this.rpm - 0.25) * 1.6, 0, 1);
    this.disc.material.opacity = blur * 0.22;
    this.prop.visible = blur < 0.95;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      this.ailerons[i].rotation.x = side * s.roll * 0.35;
      this.flaps[i].rotation.x = -s.flaps * 0.28;
      this.elevator[i].rotation.x = s.pitch * 0.4;
    }
    this.rudder.rotation.y = s.yaw * 0.4;
    // the yoke pulls back and turns, the pedals push
    this.yoke.position.z = 0.47 - s.pitch * 0.07; this.yokeR.position.z = this.yoke.position.z;
    this.yoke.rotation.z = -s.roll * 0.6; this.yokeR.rotation.z = this.yoke.rotation.z;
    this.L.bar.set(0, 1.24, this.yoke.position.z);
    this.pedals[0].position.z = 0.74 + s.yaw * 0.04; this.pedals[1].position.z = 0.74 - s.yaw * 0.04;
    this.knob.position.z = 0.7 - s.throttle * 0.06;
    // the gear folds: mains swing up to the sides, the nose leg back under the cowling
    this.gearT = s.gear;
    const up = 1 - s.gear;
    for (const l of this.legs) {
      if (l.nose) l.pv.rotation.x = up * 1.45;
      else l.pv.rotation.z = l.side * up * 1.35;
    }
    for (const w of this.wheels) w.rotation.x += (s.speed * dt) / 0.25;
    this.noseLeg.rotation.y = s.gear > 0.9 ? -s.yaw * 0.3 : 0;
    // lights
    const on = s.engine;
    const k = on ? (s.night ? 4 : 1.2) : 0.05;
    this.navL.emissiveIntensity = this.navR.emissiveIntensity = this.tailL.emissiveIntensity = k;
    const ph = this.t % 1.2;
    this.strobe.emissiveIntensity = on && (ph < 0.05 || (ph > 0.15 && ph < 0.2)) ? 12 : 0.05;
    this.beacon.emissiveIntensity = on ? 0.3 + Math.max(0, Math.sin(this.t * 6)) * (s.night ? 6 : 2.5) : 0.05;
    this.landing.emissiveIntensity = on ? (s.night ? 6 : 1) : 0.05;
    this.panelMat.emissiveIntensity = on && s.night ? 0.12 : 0;
  }
}

// ---------- flight model ----------
const G = 9.81;
const KL = 0.0171, KD = 0.0171; // lift & drag per (m/s)² per unit coefficient, as accelerations
const CL0 = 0.3, CLA = 5.0, A_STALL = 0.27, INCID = 0.035;
const CD0 = 0.033, K_IND = 0.2;
const THRUST = 5.0;
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Euler();
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
// points that touch the ground: wheels (gear down) or belly and spinner (gear up); wingtips and tail for strikes
const WHEELS = [V(BODY_X + 0.8, 0, MAIN_Z), V(BODY_X - 0.8, 0, MAIN_Z), V(BODY_X, 0, NOSE_Z)];
const BELLY = [V(BODY_X, 0.56, -1.6), V(BODY_X, 0.56, 0.4), V(BODY_X, 0.7, 2.2)];
const TIPS = [V(BODY_X + 5.2, 2.15, 0), V(BODY_X - 5.2, 2.15, 0), V(BODY_X, 1.55, -5.0), V(BODY_X, 0.08, 2.62)];

export class Flight {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.rate = new THREE.Vector3(); // body rates: x pitch (nose up +), y yaw (nose left +), z roll (right wing down +)
    this.reset(0, 0, 0, 0);
  }
  reset(x, y, z, heading) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.rate.set(0, 0, 0);
    this.heading = heading; this.th = 0; this.v = 0;
    this.q.setFromEuler(_e.set(0, heading, 0, 'YXZ'));
    this.ground = true; this.belly = false; this.crashed = false;
    this.throttle = 0; this.flaps = 0; this.gearDown = true; this.gear = 1; this.engine = false;
    this.alpha = 0; this.stall = false; this.airspeed = 0; this.agl = 0; this.vs = 0; this.bank = 0; this.pitch = 0;
    this.airTime = 0;
    if (this.assist === undefined) this.assist = true; // kid-friendly: bank limit, auto-level, holds height in turns
  }
  fwd(out = new THREE.Vector3()) { return out.set(0, 0, 1).applyQuaternion(this.q); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.q); }
  // world position of a point given in the plane's frame
  world(p, out = new THREE.Vector3()) { return out.copy(p).applyQuaternion(this.q).add(this.pos); }

  // inp: pitch (nose up +), roll (right +), yaw (right +), brake 0/1. env: ground(x,z), wet(x,z), waterY, hit(x,z,y,r)
  update(dt, inp, env) {
    const ev = [];
    if (this.crashed) return ev;
    this.gear += ((this.gearDown ? 1 : 0) - this.gear) * (1 - Math.exp(-dt * 1.6));
    const rho = Math.exp(-Math.max(0, this.pos.y) / 1600);
    const thrustA = this.engine ? this.throttle * THRUST * (1 - Math.min(0.85, this.airspeed / 105)) * Math.pow(rho, 0.7) : 0;
    const gearD = this.gear * 0.009, flapD = this.flaps * 0.006;
    const clOf = (a) => {
      const c0 = CL0 + this.flaps * 0.22, as = A_STALL - this.flaps * 0.02;
      if (a > as) return Math.max(0.5, (c0 + CLA * as) * (1 - (a - as) * 2.2));
      if (a < -0.25) return Math.min(-0.3, (c0 - CLA * 0.25) * (1 + (a + 0.25) * 2));
      return c0 + CLA * a;
    };

    if (this.ground) {
      // ---- rolling on the wheels (or sliding on the belly) ----
      const h = this.heading, fx = Math.sin(h), fz = Math.cos(h);
      const gy = env.ground(this.pos.x, this.pos.z);
      const gn = env.ground(this.pos.x + fx * WHEELBASE, this.pos.z + fz * WHEELBASE);
      const slope = Math.atan2(gn - gy, WHEELBASE);
      const v = this.v;
      const e = clamp((v - 4) / 20, 0, 1.15);
      // rotate for take-off: the nose comes up once there's enough air over the elevator
      if (!this.belly && inp.pitch > 0.1 && v > 12) this.th = Math.min(this.assist ? 0.14 : 0.2, this.th + inp.pitch * dt * 0.3 * e);
      else if (this.assist && !this.belly && v > 15 && this.throttle > 0.4 && inp.pitch > -0.1) this.th = Math.min(Math.max(this.th, 0.15), this.th + dt * 0.2); // a trimmed plane flies itself off
      else this.th = Math.max(0, this.th - dt * (this.belly ? 2 : 0.4));
      const alpha = this.th + INCID;
      const cl = clOf(alpha);
      const lift = KL * rho * v * v * cl;
      const drag = KD * rho * v * v * (CD0 + gearD + flapD + K_IND * cl * cl);
      const load = Math.max(0, G - lift);
      const mu = this.belly ? 0.55 : 0.035 + (inp.brake ? 0.45 : 0);
      let a = thrustA - drag - G * Math.sin(slope);
      const fr = mu * load;
      let nv = v + a * dt;
      nv = nv > 0 ? Math.max(0, nv - fr * dt) : Math.min(0, nv + fr * dt);
      if (!this.engine || this.throttle < 0.05) nv = Math.max(-0.5, nv); // a little roll back on a slope, no more
      // engine at idle and the yoke held back while stopped: the ground crew push the plane back
      if (!this.belly && inp.pushback && this.throttle < 0.02 && nv < 1) { nv = Math.max(-1.6, nv - dt * 2.5); this.pushback = true; } else this.pushback = false;
      this.v = nv;
      // nose-wheel steering, and the rudder once there's airflow
      if (!this.belly && this.gear > 0.9) {
        const ang = clamp(inp.roll + inp.yaw, -1, 1) * 0.55 / (1 + Math.abs(nv) * 0.07);
        this.heading -= (nv / WHEELBASE) * Math.tan(ang) * dt + inp.yaw * 0.25 * e * dt;
      }
      const nx = this.pos.x + Math.sin(this.heading) * nv * dt, nz = this.pos.z + Math.cos(this.heading) * nv * dt;
      const ny = env.ground(nx, nz);
      let hit = false;
      if (Math.abs(nv) > 0.05) {
        const c = Math.cos(this.heading), sn = Math.sin(this.heading);
        for (const [lx, lz, r, y] of [[BODY_X, 0.3, 0.9, 1], [BODY_X, 2.4, 0.4, 1], [BODY_X, -4.6, 0.4, 1.6], [BODY_X + 5, 0, 0.3, 2.1], [BODY_X - 5, 0, 0.3, 2.1]]) {
          const p = { x: nx + lx * c + lz * sn, z: nz - lx * sn + lz * c };
          if (env.hit(p, r, ny + y)) { hit = true; break; }
        }
      }
      if (hit) {
        if (Math.abs(nv) > 11) { this.crash('hit', ev); return ev; }
        this.v = 0; ev.push({ type: 'bump' });
      } else { this.pos.x = nx; this.pos.z = nz; }
      this.pos.y = env.ground(this.pos.x, this.pos.z) - (1 - this.gear) * 0.56;
      if (env.wet(this.pos.x, this.pos.z) && this.pos.y < env.waterY - 0.3) { this.crash('water', ev); return ev; }
      this.q.setFromEuler(_e.set(-(slope + this.th), this.heading, 0, 'YXZ'));
      this.vel.set(Math.sin(this.heading) * nv, 0, Math.cos(this.heading) * nv);
      this.rate.set(0, 0, 0);
      this.airspeed = Math.abs(nv); this.alpha = alpha; this.stall = false; this.agl = 0; this.vs = 0; this.bank = 0; this.pitch = slope + this.th;
      // airborne once the wings carry the weight
      this.settle = Math.max(0, (this.settle ?? 0) - dt);
      if (lift > G * Math.cos(slope) && !this.belly && this.settle <= 0) {
        this.ground = false; this.airTime = 0;
        this.vel.y = 0.6;
        this.pos.y += 0.05;
        ev.push({ type: 'liftoff' });
      }
      return ev;
    }

    // ---- flying ----
    this.airTime += dt;
    _qi.copy(this.q).invert();
    const vb = _v.copy(this.vel).applyQuaternion(_qi);
    const Vp2 = vb.y * vb.y + vb.z * vb.z, V2 = Vp2 + vb.x * vb.x, Vsp = Math.sqrt(V2);
    const alpha = Math.atan2(-vb.y, Math.max(0.1, vb.z)) + INCID;
    const beta = Math.atan2(vb.x, Math.max(0.5, Math.abs(vb.z)));
    const cl = clOf(alpha);
    this.alpha = alpha;
    this.stall = alpha > A_STALL - this.flaps * 0.02 - 0.03 && Vsp > 3;
    // forces (as accelerations), in body axes then to world
    const acc = _w.set(0, 0, 0);
    const L = KL * rho * Vp2 * cl;
    const ld = Math.sqrt(Vp2) || 1;
    acc.y += (vb.z / ld) * L; acc.z += (-vb.y / ld) * L; // lift, square to the airflow
    const D = KD * rho * V2 * (CD0 + gearD + flapD + K_IND * cl * cl + (this.stall ? 0.08 : 0));
    if (Vsp > 0.01) acc.addScaledVector(vb, -D / Vsp);
    acc.z += thrustA;
    acc.x += -vb.x * (0.6 + 0.04 * Vsp); // the fuselage resists slipping sideways
    acc.applyQuaternion(this.q);
    acc.y -= G;
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);
    // rotation: the controls set rates, with weathervane stability and a gentle roll back to level
    const e = clamp((Vsp - 4) / 24, 0, 1.15);
    const F = this.fwd(), U = this.up(), R = _w.set(-1, 0, 0).applyQuaternion(this.q);
    this.bank = Math.atan2(-R.y, U.y);
    this.pitch = Math.asin(clamp(F.y, -1, 1));
    // with the assist on, the trim angle grows in a bank so a turn holds its height, the bank stops near 60°,
    // the wings come back level when you let go, and the climb/dive swing is damped out
    const ab = Math.min(Math.abs(this.bank), 0.9);
    let aTrim = this.assist ? ((CL0 + CLA * 0.06) / Math.cos(ab) - CL0) / CLA : 0.06;
    if (this.assist && this.airTime < 3) aTrim = Math.max(aTrim, 0.13); // hold the climb-out just after lift-off
    let rollT = inp.roll * (this.assist ? 1.15 : 1.8) * e;
    if (this.assist && Math.sign(inp.roll) === Math.sign(this.bank)) rollT *= clamp((0.8 - Math.abs(this.bank)) / 0.25, 0, 1);
    if (Math.abs(inp.roll) < 0.05 && (this.assist || Math.abs(this.bank) < 0.5)) rollT -= this.bank * (this.assist ? 0.8 : 0.3) * e;
    const pull = this.assist && inp.pitch > 0 ? inp.pitch * clamp((A_STALL - this.flaps * 0.02 - 0.07 - alpha) / 0.08, 0, 1) : inp.pitch;
    const rt = {
      x: pull * 0.95 * e - (alpha - aTrim) * 2.0 * e - (this.stall ? (this.assist ? 1.2 : 0.5) : 0) - (this.assist && Math.abs(inp.pitch) < 0.05 ? this.vel.y * 0.035 * e * (this.vel.y > 0 ? 1 : clamp((Vsp - 24) / 8, 0, 1)) : 0)
        + (this.assist && this.agl < 12 && this.vel.y < -1 ? clamp(-this.vel.y - 1, 0, 5) * 0.22 * e * (1 - this.agl / 12) : 0), // auto-flare
      y: beta * 2.4 * e - inp.yaw * 0.55 * e,
      z: rollT,
    };
    const k = 1 - Math.exp(-dt * 5);
    this.rate.x += (rt.x - this.rate.x) * k; this.rate.y += (rt.y - this.rate.y) * k; this.rate.z += (rt.z - this.rate.z) * k;
    this.q.multiply(_q.setFromAxisAngle(AX, -this.rate.x * dt));
    this.q.multiply(_q.setFromAxisAngle(AY, this.rate.y * dt));
    this.q.multiply(_q.setFromAxisAngle(AZ, this.rate.z * dt));
    this.q.normalize();
    this.airspeed = Vsp; this.vs = this.vel.y;
    this.heading = Math.atan2(F.x, F.z);
    const gHere = env.ground(this.pos.x, this.pos.z);
    this.agl = this.pos.y - gHere;

    // ---- touching the ground: a landing, a belly slide, or a crash ----
    const pts = this.gear > 0.6 ? WHEELS : BELLY;
    let low = 0, lowP = null;
    for (const c of [...pts, ...TIPS]) {
      const w = this.world(c, _v);
      const gy = env.ground(w.x, w.z);
      const pen = gy - w.y;
      if (env.wet(w.x, w.z) && w.y < env.waterY && this.agl < 3) { this.crash('water', ev); return ev; }
      if (pen > low) { low = pen; lowP = c; }
    }
    if (lowP) {
      const sink = -this.vel.y;
      const wing = lowP === TIPS[0] || lowP === TIPS[1];
      const tail = lowP === TIPS[2] && sink > 3, prop = lowP === TIPS[3] && (this.gear < 0.6 || sink > 2.5);
      if (wing || tail || prop || sink > 5.2 || Math.abs(this.bank) > 0.38 || (this.pitch < -0.14 && Vsp > 12)) { this.crash(wing ? 'wing' : tail ? 'tail' : sink > 5.2 ? 'hard' : prop || this.pitch < -0.14 ? 'nose' : 'wing', ev); return ev; }
      if (this.gear < 0.6 && sink > 3.6) { this.crash('hard', ev); return ev; }
      // settle onto the ground
      const hspd = Math.hypot(this.vel.x, this.vel.z);
      this.heading = Math.atan2(F.x, F.z);
      this.v = hspd * Math.max(0, Math.cos(Math.atan2(this.vel.x, this.vel.z) - this.heading));
      const gy0 = env.ground(this.pos.x, this.pos.z), gn = env.ground(this.pos.x + Math.sin(this.heading) * WHEELBASE, this.pos.z + Math.cos(this.heading) * WHEELBASE);
      this.th = clamp(this.pitch - Math.atan2(gn - gy0, WHEELBASE), 0, 0.2);
      this.ground = true;
      this.settle = this.v > 8 && this.airTime > 2.5 ? 2 : 0; // stay down after touching down, no bouncing straight back up
      this.belly = this.gear < 0.6;
      this.rate.set(0, 0, 0);
      ev.push({ type: this.belly ? 'belly' : 'touchdown', sink, speed: hspd, air: this.airTime });
      return ev;
    }
    // ---- flying into things: trees, houses, the hangar ----
    if (this.agl < 9) {
      for (const c of [V(BODY_X, 1.2, 1.5), V(BODY_X + 4.5, 2.1, 0), V(BODY_X - 4.5, 2.1, 0), V(BODY_X, 1.3, -1.5)]) {
        const w = this.world(c, _v);
        const p = { x: w.x, z: w.z };
        if (env.hit(p, 0.5, w.y, w.y - env.ground(w.x, w.z))) { this.crash('hit', ev); return ev; }
      }
    }
    return ev;
  }
  crash(why, ev) {
    this.crashed = true;
    this.engine = false;
    this.v = 0;
    ev.push({ type: 'crash', why, speed: this.vel.length() });
    this.vel.set(0, 0, 0);
  }
}

// ---------- the airstrip: edge markers, threshold bars, centreline, windsock, hangar, drums and a sign ----------
export function buildAirstrip(scene, A, groundHeight) {
  const group = new THREE.Group();
  scene.add(group);
  const c = Math.cos(A.rot), s = Math.sin(A.rot);
  const at = (lx, lz) => ({ x: A.x + lx * c + lz * s, z: A.z - lx * s + lz * c });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const yawQ = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), A.rot);
  const inst = (geo, mat, list, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([lx, lz, y = 0, sx = 1, sy = 1, sz = 1, ry = 0], i) => {
      const w = at(lx, lz);
      p.set(w.x, groundHeight(w.x, w.z) + y, w.z);
      q.copy(yawQ).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), ry));
      m.setMatrixAt(i, m4.compose(p, q, sc.set(sx, sy, sz)));
    });
    m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
    return m;
  };
  const lime = std('#f4f1e8', { roughness: 0.9 });
  const L = A.len, HW = A.hw;
  // whitewashed half-buried tyres along both edges, every 15 m
  const tyres = [];
  for (let t = -L / 2; t <= L / 2 + 0.1; t += 15) for (const sx of [-1, 1]) tyres.push([sx * (HW - 1), t, 0.12]);
  inst(new THREE.TorusGeometry(0.34, 0.13, 8, 16).rotateX(Math.PI / 2), lime, tyres);
  // threshold bars and the centreline dashes, painted in lime on the earth
  const bars = [];
  for (const end of [-1, 1]) for (let i = -3; i <= 3; i++) if (i) bars.push([i * 1.2, end * (L / 2 - 6), 0.02, 0.6, 1, 7]);
  for (let t = -L / 2 + 22; t <= L / 2 - 22; t += 16) bars.push([0, t, 0.02, 0.35, 1, 6]);
  inst(new THREE.BoxGeometry(1, 0.04, 1), lime, bars, false);
  // the windsock: a striped pole with a cone that swings round with the breeze
  const sock = new THREE.Group();
  const sp = A.sock;
  sock.position.set(sp.x, groundHeight(sp.x, sp.z), sp.z);
  group.add(sock);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 6.2, 8), std('#c8c8c8', { metalness: 0.6, roughness: 0.4 }));
  pole.position.y = 3.1; pole.castShadow = true; sock.add(pole);
  const swivel = new THREE.Group(); swivel.position.y = 6.0; sock.add(swivel);
  const sockTex = canvas(32, 128, (g, w, h) => { for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ff5a1a'; g.fillRect(0, (i * h) / 5, w, h / 5 + 1); } });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.32, 2.2, 14, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -1.2), new THREE.MeshStandardMaterial({ map: sockTex, side: THREE.DoubleSide, roughness: 0.8 }));
  cone.castShadow = true;
  swivel.add(cone);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.025, 6, 16), std('#999', { metalness: 0.7 }));
  swivel.add(ring);
  // the hangar: a corrugated-iron shed with a curved roof and an open front
  const H = A.hangar;
  const hg = new THREE.Group();
  hg.position.set(H.x, groundHeight(H.x, H.z), H.z);
  hg.rotation.y = H.rot;
  group.add(hg);
  const corr = canvas(256, 64, (g, w, h) => { for (let i = 0; i < 32; i++) { const k = 150 + Math.sin(i * 0.8) * 40; g.fillStyle = `rgb(${k},${k + 8},${k + 14})`; g.fillRect((i * w) / 32, 0, w / 32 + 1, h); } g.fillStyle = 'rgba(140,80,40,0.25)'; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 10, 2 + Math.random() * 18); });
  corr.wrapS = corr.wrapT = THREE.RepeatWrapping; corr.repeat.set(6, 1);
  const iron = new THREE.MeshStandardMaterial({ map: corr, metalness: 0.55, roughness: 0.55, side: THREE.DoubleSide });
  const hx = 7.5, hz = 6, hh = 3.6;
  const wall = (w, h, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), iron); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; hg.add(m); return m; };
  wall(hx * 2, hh, 0, hh / 2, -hz, 0);
  wall(hz * 2, hh, -hx, hh / 2, 0, Math.PI / 2);
  wall(hz * 2, hh, hx, hh / 2, 0, Math.PI / 2);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(hx, hx, hz * 2 + 0.4, 24, 1, true, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), iron);
  roof.scale.set(1, 0.32, 1);
  roof.position.y = hh;
  roof.castShadow = roof.receiveShadow = true;
  hg.add(roof);
  // gable ends of the arch over the back
  const archShape = new THREE.Shape();
  archShape.moveTo(-hx, 0); for (let i = 0; i <= 20; i++) { const a = Math.PI - (i / 20) * Math.PI; archShape.lineTo(Math.cos(a) * hx, Math.sin(a) * hx * 0.32); }
  const gable = new THREE.Mesh(new THREE.ShapeGeometry(archShape), iron);
  gable.position.set(0, hh, -hz); hg.add(gable);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2, hz * 2).rotateX(-Math.PI / 2), std('#7a756c', { roughness: 0.95 }));
  floor.position.y = 0.03; floor.receiveShadow = true; hg.add(floor);
  // the sign over the front
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.1), new THREE.MeshStandardMaterial({ map: canvas(700, 110, (g, w, h) => {
    g.fillStyle = '#1d4f8a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f2c018'; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 44px "Noto Sans Devanagari", Arial'; g.fillText('गाँव हवाई पट्टी', w / 2, 52);
    g.font = 'bold 26px Arial'; g.fillStyle = '#f2c018'; g.fillText('GAON AIRSTRIP · FLYING CLUB', w / 2, 92);
  }), roughness: 0.6 }));
  sign.position.set(0, hh + 0.75, hz + 0.05); hg.add(sign);
  // drums, a tyre stack, a work bench and cones
  const drumM = std('#2a5ab0', { metalness: 0.4, roughness: 0.5 }), drumR = std('#b03a2a', { metalness: 0.4, roughness: 0.5 });
  for (const [x, z, m] of [[-6.2, -4.8, drumM], [-5.4, -4.9, drumM], [-5.8, -4.1, drumR], [6.4, 4.4, drumM]]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), m); d.position.set(x, 0.45, z); d.castShadow = true; hg.add(d);
  }
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.12, 8, 14).rotateX(Math.PI / 2), std('#1a1a1a', { roughness: 0.9 })); t.position.set(6, 0.12 + i * 0.24, -4.6); t.castShadow = true; hg.add(t); }
  const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.7), std('#7a5434')); bench.position.set(2, 0.9, -5.4); bench.castShadow = true; hg.add(bench);
  for (const x of [0.95, 3.05]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.6), std('#5a3c24')); l.position.set(x, 0.45, -5.4); hg.add(l); }
  const coneM = std('#ff6a1a', { roughness: 0.6 });
  for (const [lx, lz] of [[-HW + 1, -L / 2 + 2], [HW - 1, -L / 2 + 2], [-HW + 1, L / 2 - 2], [HW - 1, L / 2 - 2]]) {
    const w = at(lx, lz);
    const k = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12), coneM); k.position.set(w.x, groundHeight(w.x, w.z) + 0.3, w.z); k.castShadow = true; group.add(k);
  }
  let t = 0;
  return {
    group,
    update(dt, wind = 0.5) {
      t += dt;
      swivel.rotation.y = 0.9 + Math.sin(t * 0.13) * 0.6 + Math.sin(t * 0.37) * 0.2;
      const lift = clamp(0.25 + wind * 0.6 + Math.sin(t * 1.7) * 0.06, 0.15, 1);
      cone.rotation.x = -(1 - lift) * 1.1;
      cone.scale.set(1, 1, 0.8 + lift * 0.2);
    },
  };
}
