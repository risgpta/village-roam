// Villagers going about their chores, and two village dogs. All procedural rigs and animation.
import * as THREE from 'three';
import {
  layout, roadX, pathZ, groundHeight, heightAt, resolveCollisions, localToWorld, SQUARE, FOOT, EH, GHAT, TEA, MARKET, CRICKET, NV, BRIDGES, RV, BV, TV, MH, NE, PG, riverX, RIVER_HALF, WATER_Y, WATER, SHRINE_ROAD, HILLTOP, squareCrossings
} from './world.js';
import { Moped } from './bicycle.js';
import { Scooter, VillageBus, Jeep, TrafficCar, RowBoat, poseRower, PoliceJeep } from './vehicles.js';
import { Bicycle, poseRider } from './bicycle.js';
import { makeCow } from './animals.js';
import { lathe, limb, limbZ, ellipsoid, muscle, folds, fixSeam } from './shapes.js';
import { Dog, consolidate } from './animals.js';
import { Gear } from './gear.js';
import { wheelRig, groundPose, settleWheels } from './suspension.js';

// A material is shared by everyone who looks the same (nothing changes a person's materials once they're made):
// a few hundred instead of ~15,000, far less memory, and the renderer draws one person after another without
// switching between them
const MATS = new Map();
const hex = (c) => (typeof c === 'string' ? c.toLowerCase() : '#' + new THREE.Color(c).getHexString());
function sharedMat(tag, Kind, p) {
  const key = tag + JSON.stringify(p);
  let m = MATS.get(key);
  if (!m) MATS.set(key, (m = new Kind(p)));
  return m;
}
const mat = (c, r = 0.85) => sharedMat('std', THREE.MeshStandardMaterial, { color: hex(c), roughness: r });
function part(geo, m, parent, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  parent.add(o);
  return o;
}
const cyl = (a, b, h, s = 10) => new THREE.CylinderGeometry(a, b, h, s);
const ss = (x) => x * x * (3 - 2 * x);
const _fallAxis = new THREE.Vector3();
const damp = (dt, r) => 1 - Math.exp(-dt * r);
// a vehicle in the traffic on its wheels: posed to the ground under all of them (see suspension.js), the body
// easing over the slope and every tyre on the earth. false if it has no rig (two-wheelers, carts).
const _tp = { y: 0, pitch: 0, roll: 0 };
function onWheels(t, x, z, yaw, dt) {
  if (t.rig === undefined) t.rig = t.veh?.wheels ? wheelRig(t.holder, t.veh.wheels) : null;
  const rig = t.rig;
  if (!rig) return false;
  groundPose(rig, x, z, yaw, (gx, gz) => groundHeight(gx, gz), _tp);
  // (just back in view, or never placed: straight there)
  if (t.wy === undefined || Math.abs(t.wy - _tp.y) > 2) { t.wy = _tp.y; t.pitch = _tp.pitch; t.roll = _tp.roll; }
  t.wy += (_tp.y - t.wy) * damp(dt, 10);
  t.pitch = (t.pitch ?? 0) + (_tp.pitch - (t.pitch ?? 0)) * damp(dt, 6);
  t.roll = (t.roll ?? 0) + (_tp.roll - (t.roll ?? 0)) * damp(dt, 6);
  t.wy += settleWheels(rig, t.wy, t.pitch, t.roll);
  t.holder.position.set(x, t.wy, z);
  t.holder.rotation.set(t.pitch, yaw, t.roll, 'YXZ');
  return true;
}

// ---------------- human rig ----------------
// Built in unit (k = 1) space from smooth tapered capsules and lathed shapes; the body group is scaled by k.
// A sculpted head, shared by everyone (one for men, a finer one for women and children). From a sphere: a
// fuller back of the skull, a sloping forehead and brow ridge, eye sockets, cheekbones, a jaw that narrows to
// a rounded chin, and a slightly flattened face.
const HEADS = new Map();
function headGeo(fine) {
  if (HEADS.has(fine)) return HEADS.get(fine);
  const g = new THREE.SphereGeometry(1, 64, 48);
  const p = g.attributes.position;
  const bump = (x, y, z, cx, cy, cz, r) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) / r);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let X = x * 0.092, Y = y * 0.116 + 0.008, Z = z * 0.102;
    // the jaw: below the cheekbones the face narrows toward the chin
    const low = Math.min(1, Math.max(0, (-y - 0.12) / 0.85));
    const lowS = low * low * (3 - 2 * low);
    // (only a little: a real jaw stays broad down to its angle below the ear, then turns in to the chin)
    X *= 1 - (fine ? 0.2 : 0.1) * lowS;
    const axJ = Math.abs(x);
    X += Math.sign(x) * (fine ? 0.0025 : 0.0065) * bump(axJ, y, z, 0.72, -0.56, 0.05, 0.06); // the angle of the jaw
    // a chin with some shape to it: forward at the front, and flat underneath rather than coming to a point
    Z += (fine ? 0.004 : 0.007) * bump(axJ, y, z, 0.0, -0.84, 0.5, 0.04);
    { const cu = Math.max(0, -0.72 - y); Y += cu * cu * (z > 0 ? 0.22 : 0.3); }
    // fuller cheeks on the finer (women's and children's) head
    if (fine) { const ck = bump(axJ, y, z, 0.5, -0.42, 0.7, 0.05); X += Math.sign(x) * 0.004 * ck; Z += 0.003 * ck; }
    // the chin comes forward a little; the throat side goes back
    if (z > 0) Z += 0.014 * lowS * z * (fine ? 0.7 : 1);
    else Z *= 1 - 0.18 * lowS;
    // the forehead slopes back above the brow; the back of the skull is fuller
    if (z > 0 && y > 0.32) Z *= 1 - 0.07 * (y - 0.32);
    if (z < 0 && y > -0.2) { Z *= 1.08; Y += 0.004 * Math.max(0, -z); }
    // the crown is highest a little behind the middle, and the skull narrows a touch toward the top
    if (y > 0.5) { Y += 0.004 * (y - 0.5) * (1 - z * 0.6); X *= 1 - 0.05 * (y - 0.5); }
    // brow ridge, eye sockets, cheekbones
    const ax = Math.abs(x);
    Z += 0.0045 * bump(ax, y, z, 0.32, 0.27, 0.9, 0.03) * (fine ? 0.5 : 1);
    Z -= 0.0075 * bump(ax, y, z, 0.36, 0.08, 0.92, 0.014);
    const cb = bump(ax, y, z, 0.62, -0.14, 0.72, 0.03);
    X += Math.sign(x) * 0.005 * cb; Z += 0.004 * cb;
    // the temples go in a touch
    X -= Math.sign(x) * 0.004 * bump(ax, y, z, 0.85, 0.3, 0.35, 0.04);
    // the front of the face is flatter than a ball
    if (z > 0.55) Z -= (z - 0.55) * 0.012;
    if (z > 0.45) {
      const fz = Math.min(1, (z - 0.45) / 0.3);
      // the nose grows out of the face: a narrow bridge between the eyes, widening and rising to the tip, then
      // tucking back under to the lip
      const ny = Math.min(1, Math.max(0, (0.12 - y) / 0.44)); // 0 between the eyes → 1 at the tip
      const under = Math.max(0, Math.min(1, (y + 0.34) / 0.08));
      const wN = 0.075 + ny * 0.07;
      Z += (0.002 + 0.0155 * ny * ny) * under * Math.exp(-((x / wN) ** 2)) * fz * (fine ? 0.85 : 1);
      // the wings of the nose either side of the tip
      Z += 0.0045 * bump(ax, y, z, 0.12, -0.31, 0.93, 0.004) * fz;
      // the groove from the nose to the lip, and the lips standing out a little from the teeth behind them
      Z += 0.0042 * bump(ax, y, z, 0.0, -0.53, 0.9, 0.012) * fz;
      Z -= 0.0012 * Math.exp(-((x / 0.035) ** 2)) * bump(ax, y, z, 0.0, -0.43, 0.9, 0.004);
      // the hollow under the lower lip, and the cheeks fuller beside the nose
      Z -= 0.002 * bump(ax, y, z, 0.0, -0.66, 0.85, 0.004);
      Z += 0.003 * bump(ax, y, z, 0.3, -0.28, 0.85, 0.015) * (fine ? 1.3 : 1);
    }
    p.setXYZ(i, X, Y, Z);
  }
  g.computeVertexNormals(); fixSeam(g);
  HEADS.set(fine, g);
  return g;
}

// Hair, modelled as hair: a shell over the skull with a real hairline — across the forehead, down past the
// temples into sideburns, round behind the ears and down to the nape — some body to it, locks and a parting.
// style: 'man' short with a side parting; 'kid' a thick uneven fringe; 'woman' centre-parted and drawn back.
const HAIRS = new Map();
function hairGeo(style) {
  if (HAIRS.has(style)) return HAIRS.get(style);
  const g = new THREE.SphereGeometry(1, 44, 30);
  const p = g.attributes.position;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const S = { man: { yf: 0.6, ys: 0.16, yb: -0.44, jag: 0.02, vol: 0.05, burn: 0.3 }, kid: { yf: 0.44, ys: 0.14, yb: -0.4, jag: 0.06, vol: 0.085, burn: 0.12 }, woman: { yf: 0.6, ys: -0.02, yb: -0.52, jag: 0.012, vol: 0.05, burn: 0.1 } }[style];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const az = Math.atan2(x, z), a = Math.abs(az);
    // where the hair stops, going round the head from the forehead to the nape
    let line = S.yf + (S.ys - S.yf) * sm(0.75, 1.3, a) + (S.yb - S.ys) * sm(1.75, 2.5, a);
    line -= S.burn * Math.exp(-((a - 1.22) ** 2) / 0.012); // sideburns in front of the ears
    line += S.jag * (Math.sin(az * 13 + 1) + 0.6 * Math.sin(az * 29)) * (1 - sm(1.2, 2.2, a) * 0.6); // uneven ends
    if (style === 'woman') line += 0.07 * Math.exp(-(az * az) / 0.02); // a little peak where the parting starts
    const on = sm(line - 0.05, line + 0.03, y);
    // body: thicker on top, with locks running back from the front
    let s = 1.045 + S.vol * Math.max(0, y) + 0.012 * Math.sin(az * 9 + y * 6) * Math.max(0, y + 0.2);
    if (style === 'man') s -= 0.022 * Math.exp(-((x - 0.3) ** 2) / 0.004) * sm(-0.3, 0.2, z) * sm(0.45, 0.7, y); // the parting
    if (style === 'woman') s -= 0.02 * Math.exp(-(x * x) / 0.0025) * sm(-0.4, 0.1, z) * sm(0.4, 0.7, y);
    if (style === 'kid') s += 0.02 * sm(0.3, 0.8, z) * sm(0.3, 0.6, y); // the fringe stands off the forehead
    // below the hairline the shell is drawn inside the head, out of sight
    const k = 0.86 + (s - 0.86) * on;
    p.setXYZ(i, x * 0.092 * k, y * 0.116 * k + 0.008, z * 0.102 * (z < 0 ? 1.08 : 1) * k);
  }
  g.computeVertexNormals(); fixSeam(g);
  HAIRS.set(style, g);
  return g;
}
let hairTex = null;
const HAIR_MATS = new Map();
function hairMaterial(color) {
  if (HAIR_MATS.has(color)) return HAIR_MATS.get(color);
  if (!hairTex) {
    // fine strands running from the crown down
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, 256, 256);
    let seed = 7;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const v = R();
      x.strokeStyle = v < 0.5 ? `rgba(255,255,255,${0.1 + R() * 0.3})` : `rgba(0,0,0,${0.15 + R() * 0.35})`;
      x.lineWidth = 0.5 + R() * 1.2;
      const px = R() * 256, py = R() * 256, len = 30 + R() * 90;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - 0.5) * 5, py + len); x.stroke();
    }
    hairTex = new THREE.CanvasTexture(c);
    hairTex.wrapS = hairTex.wrapT = THREE.RepeatWrapping; hairTex.repeat.set(5, 1.6); hairTex.anisotropy = 4;
  }
  const col = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({ color: col.clone().multiplyScalar(1.5).lerp(new THREE.Color('#ffffff'), 0.04), map: hairTex, bumpMap: hairTex, bumpScale: 0.6, roughness: 0.42, sheen: 0.5, sheenRoughness: 0.4, sheenColor: col.clone().lerp(new THREE.Color('#c8b49a'), 0.5) });
  HAIR_MATS.set(color, m);
  return m;
}

// The shirt's body: not a tube but a torso — the waist drawn in, the chest fuller at the front, the back flatter
// with a hint of the shoulder blades, and the shoulders sloping down from the neck.
function shapeTorso(g, fem = false) {
  const p = g.attributes.position;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z) || 1, cz = z / r;
    // waist in, chest and shoulders out (sideways)
    const wide = 1 - 0.07 * (1 - sm(0.0, 0.2, y)) + 0.06 * sm(0.28, 0.44, y) * (1 - sm(0.47, 0.55, y));
    x *= wide;
    // the chest at the front, the flatter back with the shoulder blades
    // (cz² rather than 1 − |x|: the same shape without a ridge running down the middle of the chest)
    if (cz > 0) z += (fem ? 0.012 : 0.02) * cz * Math.exp(-((y - 0.36) ** 2) / 0.006) * (0.6 + 0.4 * cz * cz);
    else z *= 1 - 0.06 * sm(0.2, 0.4, y) * -cz + 0.0;
    if (cz < 0) z -= 0.008 * Math.exp(-((y - 0.4) ** 2) / 0.004) * Math.exp(-((Math.abs(x) - 0.08) ** 2) / 0.002);
    // the shoulders slope down from the neck
    if (y > 0.44) y -= 0.05 * sm(0.04, 0.17, Math.abs(x)) * sm(0.44, 0.52, y);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return fixSeam(g);
}
// A strip of cloth laid over a body: pts are [angle round the body (0 = front), height] pairs; radius(y) gives
// the body's radius there; depth squashes front-to-back, as the body is. Used for the saree's pallu.
function drape(pts, radius, width, depth = 0.7, lift = 0.014) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([a, y]) => new THREE.Vector3(a, y, 0)));
  const n = 40, pos = [], idx = [];
  const at = (u) => { const q = curve.getPoint(u), r = radius(q.y) + lift; return new THREE.Vector3(Math.sin(q.x) * r, q.y, Math.cos(q.x) * r * depth); };
  for (let i = 0; i <= n; i++) {
    const u = i / n, P = at(u), T = at(Math.min(1, u + 0.01)).sub(at(Math.max(0, u - 0.01))).normalize();
    const N = new THREE.Vector3(P.x, 0, P.z / depth).normalize();
    const W = new THREE.Vector3().crossVectors(T, N).normalize().multiplyScalar(width / 2);
    // a few soft folds across the width
    for (let j = 0; j <= 4; j++) { const v = j / 4 - 0.5, f = 0.006 * Math.sin(j * 2.4 + i * 0.5); pos.push(P.x + W.x * v * 2 + N.x * f, P.y + W.y * v * 2, P.z + W.z * v * 2 + N.z * f); }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) { const a = i * 5 + j, b = a + 5; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a sleeve: like a limb, but its top is a shallow cap that tucks into the shoulder rather than a round ball
// standing up above it (which made every shirt look puff-sleeved)
// (rounded enough to read as the round of a shoulder, not a flat-topped block, and fuller at the top the way
// a sleeve sits over the deltoid, narrowing toward the elbow)
function sleeve(r0, r1, len, segs = 20) {
  const pts = [], rt = r0 * 1.08;
  for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2); pts.push([Math.cos(a) * r1, -len + Math.sin(a) * r1]); }
  pts.push([(rt + r1) / 2, -len * 0.45]);
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * (Math.PI / 2); pts.push([Math.max(0.0005, Math.cos(a) * rt), Math.sin(a) * rt * 0.8 + 0.006]); } // (high enough to cover the round top of the arm inside)
  return lathe(pts, segs);
}

export function buildHuman(o) {
  const k = o.k ?? 1, hs = o.headScale ?? 1;
  const skinC = o.skin ?? '#8a5a3c';
  // skin: soft, with a warm glow at glancing angles rather than a plastic highlight
  const skin = sharedMat('skin', THREE.MeshPhysicalMaterial, { color: hex(skinC), roughness: 0.58, sheen: 0.45, sheenRoughness: 0.5, sheenColor: '#' + new THREE.Color(skinC).lerp(new THREE.Color('#ff9c78'), 0.55).getHexString() });
  const lip = mat('#' + new THREE.Color(skinC).lerp(new THREE.Color('#a4524c'), 0.42).multiplyScalar(0.92).getHexString(), 0.42);
  const top = mat(o.top ?? '#efe9dc', 0.9);
  const topDS = sharedMat('std', THREE.MeshStandardMaterial, { color: hex(o.top ?? '#efe9dc'), roughness: 0.9, side: THREE.DoubleSide });
  const bottom = mat(o.bottom ?? '#eeeae0', 0.9);
  const bottomDS = sharedMat('std', THREE.MeshStandardMaterial, { color: hex(o.bottom ?? '#eeeae0'), roughness: 0.85, side: THREE.DoubleSide });
  const sandal = mat('#3b2a1e', 0.8);
  const dark = mat('#17110d', 0.35);
  const white = mat('#efe9df', 0.3);
  const hairCol = mat(o.hair ?? '#17110d', 0.55);
  const dress = o.dress ?? 'pants';
  const saree = dress === 'saree';
  const thigh = 0.43, shin = 0.42, hipY = 0.9;

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(k);
  root.add(body);

  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.088, hipY, 0);
    body.add(hip);
    if (dress === 'dhoti') part(limb(0.102, 0.088, thigh), bottom, hip);
    // (in a sari the legs are wrapped in its cloth from the hip to the ankle: whether she walks, squats or sits,
    // it's the fabric that shows, never bare legs)
    else if (saree) part(limb(0.098, 0.084, thigh), bottom, hip);
    else if (dress === 'shorts') { part(limb(0.094, 0.086, thigh * 0.48), bottom, hip); part(muscle(0.064, 0.05, thigh, [[0.4, 0.12, 0.3, 1], [0.86, -0.08, 0.14, 0]]), skin, hip); }
    else part(limb(0.088, 0.07, thigh), bottom, hip);
    const knee = new THREE.Group();
    knee.position.y = -thigh;
    hip.add(knee);
    // the shin: a knee, the swell of the calf behind, and a slim ankle
    if (dress === 'dhoti') { part(limb(0.084, 0.074, shin * 0.42), bottom, knee); part(muscle(0.05, 0.03, shin, [[0.08, 0.06, 0.12, 0], [0.3, 0.3, 0.2, -1], [0.3, 0.06, 0.25, 0], [0.88, -0.1, 0.1, 0]]), skin, knee); }
    else if (saree) { part(limb(0.082, 0.07, shin * 0.93), bottom, knee); part(limb(0.034, 0.03, shin), skin, knee); }
    else if (dress === 'shorts') part(muscle(0.05, 0.03, shin, [[0.08, 0.06, 0.12, 0], [0.3, 0.3, 0.2, -1], [0.3, 0.06, 0.25, 0], [0.88, -0.1, 0.1, 0]]), skin, knee);
    else { part(limb(0.07, 0.062, shin * 0.92), bottom, knee); part(limb(0.042, 0.036, shin), skin, knee); }
    part(ellipsoid(0.04, 0.028, 0.098, 12, 8), skin, knee, 0, -shin - 0.004, 0.045);
    part(ellipsoid(0.048, 0.011, 0.115, 12, 6), sandal, knee, 0, -shin - 0.03, 0.045);
    return { hip, knee };
  });

  let skirt = null;
  if (saree) {
    const g = lathe([[0.27, 0.03], [0.278, 0.07], [0.252, 0.3], [0.208, 0.6], [0.168, 0.84], [0.15, 0.96], [0.136, 1.02]], 28);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, z);
      const front = Math.max(0, Math.cos(a)) ** 2 * (1 - Math.min(1, y / 0.9));
      const f = 1 + 0.06 * Math.sin(a * 22) * front;
      p.setXYZ(i, x * f, y, z * f * 0.84);
    }
    g.computeVertexNormals();
    fixSeam(g);
    skirt = part(g, bottomDS, body);
    skirt.userData.keep = true;
  } else {
    // seat of the dhoti / trousers covering the tops of the legs
    part(lathe([[0, 0.76], [0.12, 0.775], [0.165, 0.84], [0.17, 0.95]], 18).scale(1, 1, 0.74), bottom, body);
  }

  const torso = new THREE.Group();
  torso.position.y = hipY;
  body.add(torso);
  if (saree) {
    part(lathe([[0, 0.0], [0.13, 0.01], [0.126, 0.12], [0.14, 0.25]], 18).scale(1, 1, 0.7), o.pallu === false ? top : skin, torso);
    part(lathe([[0.136, 0.22], [0.158, 0.3], [0.17, 0.38], [0.166, 0.45], [0.14, 0.51], [0.075, 0.555], [0, 0.565]], 18).scale(1, 1, 0.7), top, torso);
    const band = (start, len) => {
      const m = part(new THREE.CylinderGeometry(0.186, 0.19, 0.6, 20, 1, true, start, len).scale(1, 1, 0.76), bottomDS, torso, 0, 0.32, 0);
      m.rotation.z = 0.55;
      return m;
    };
    void band;
    if (o.pallu !== false) {
      // the pallu: from the right hip, diagonally up across the chest, over the left shoulder, and down the back
      const rad = (y) => (y < 0.12 ? 0.15 : y < 0.22 ? 0.15 - (y - 0.12) * 0.1 : y < 0.42 ? 0.14 + (y - 0.22) * 0.15 : y < 0.5 ? 0.17 - (y - 0.42) * 0.3 : 0.146 - (y - 0.5) * 0.9);
      part(drape([[0.75, 0.02], [0.35, 0.18], [-0.15, 0.33], [-0.55, 0.45], [-1.05, 0.52], [-1.9, 0.5], [-2.5, 0.38], [-2.75, 0.15], [-2.8, -0.12]], rad, 0.2), bottomDS, torso);
    }
  } else {
    const kurta = dress === 'kurta' ? 0.46 : dress === 'dhoti' ? 0.3 : dress === 'shorts' ? 0.2 : 0.1;
    // the shirt over the chest and back: broad at the shoulders and chest, gathered at the waist with a few folds
    part(folds(shapeTorso(lathe([[0, -0.06], [0.13, -0.05], [0.15, 0.03], [0.152, 0.13], [0.168, 0.28], [0.18, 0.4], [0.178, 0.47], [0.15, 0.52], [0.085, 0.56], [0, 0.575]], 40)), 0.022, 7, 0.32, 0.0).scale(1, 1, 0.7), top, torso);
    part(folds(lathe([[0.21, -kurta], [0.19, -kurta * 0.5], [0.165, -0.03], [0.157, 0.04]], 40), 0.06, 9, 0.04, -kurta).scale(1, 1, 0.72), topDS, torso); // the hem falls in soft folds
    if (o.vest) part(lathe([[0.163, 0.12], [0.172, 0.3], [0.182, 0.42], [0.176, 0.48], [0.12, 0.535]], 20).scale(1, 1, 0.7), mat(o.vest, 0.9), torso);
  }
  part(muscle(0.048, 0.056, 0.12, [[0.85, 0.12, 0.25, 0]], { flat: 0.92 }), skin, torso, 0, 0.645, 0);

  const head = new THREE.Group();
  head.position.y = 0.72;
  head.scale.setScalar(hs);
  torso.add(head);
  // the head: one sculpted shape (cranium, brow, cheekbones, a tapering jaw and a chin), then the features
  part(headGeo(saree || (o.k ?? 1) < 0.8), skin, head);
  const lidM = mat('#' + new THREE.Color(skinC).multiplyScalar(0.86).getHexString(), 0.6);
  const sclera = mat('#ece6da', 0.25), iris = mat(o.eyes ?? '#3a2414', 0.3), pupil = mat('#060403', 0.2);
  const shine = sharedMat('std', THREE.MeshStandardMaterial, { color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.1 });
  const fem = saree;
  for (const s of [-1, 1]) {
    // eyes set into their sockets: the white, a brown iris, the pupil and a glint; lids over and under
    const ex = s * 0.036, ey = 0.014, ez = 0.084;
    part(new THREE.SphereGeometry(0.0128, 14, 10), sclera, head, ex, ey, ez);
    part(ellipsoid(0.0078, 0.0078, 0.0024, 14, 8), dark, head, ex, ey + 0.0004, ez + 0.0114);
    part(ellipsoid(0.0068, 0.0068, 0.0026, 14, 8), iris, head, ex, ey + 0.0004, ez + 0.0119);
    part(ellipsoid(0.0031, 0.0031, 0.0016, 10, 6), pupil, head, ex, ey + 0.0004, ez + 0.0137);
    part(new THREE.SphereGeometry(0.0013, 6, 5), shine, head, ex + 0.0024, ey + 0.003, ez + 0.0144);
    const upper = part(ellipsoid(0.0156, 0.0068, 0.0126, 14, 8), skin, head, ex, ey + 0.0142, ez + 0.0002);
    upper.rotation.x = -0.12;
    part(ellipsoid(0.0152, 0.0012, 0.0112, 12, 4), dark, head, ex, ey + 0.0092, ez + 0.0044).rotation.z = -s * 0.06; // the lash line
    part(ellipsoid(0.0146, 0.0036, 0.0108, 12, 6), skin, head, ex, ey - 0.0124, ez + 0.0004);
    part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(ex - s * 0.013, ey + 0.0175, ez - 0.004), new THREE.Vector3(ex, ey + 0.0215, ez + 0.0035), new THREE.Vector3(ex + s * 0.014, ey + 0.016, ez - 0.004)]), 8, 0.0009, 4, false), lidM, head); // the crease of the lid
    // brows: an arch of hair over each eye, finer for the women
    const bw = fem ? 0.0024 : 0.0036;
    const brow = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.016, 0.034, 0.097), new THREE.Vector3(s * 0.034, 0.041, 0.095), new THREE.Vector3(s * 0.054, 0.036, 0.083)]);
    part(new THREE.TubeGeometry(brow, 8, bw, 5, false), hairCol, head);
    // ears: the outer rim and the dark bowl inside
    const ear = part(ellipsoid(0.011, 0.027, 0.019, 12, 8), skin, head, s * 0.094, 0.0, -0.008);
    ear.rotation.y = s * 0.35;
    part(ellipsoid(0.005, 0.016, 0.011, 8, 6), lidM, head, s * 0.1, -0.001, -0.004).rotation.y = s * 0.35;
    // the sides of the nose and the nostrils
    part(ellipsoid(0.0052, 0.0048, 0.0052, 10, 6), skin, head, s * 0.0092, -0.034, 0.0985);
    part(ellipsoid(0.0024, 0.0013, 0.0022, 6, 4), dark, head, s * 0.0052, -0.0402, 0.1026);
  }
  // the nose: a bridge running down from between the brows to a rounded tip
  part(ellipsoid(0.0082, 0.0074, 0.007, 12, 10), skin, head, 0, -0.031, 0.1045);
  // lips: a shaped upper lip, a fuller lower one, the line of the mouth between
  const lipC = fem ? mat('#' + new THREE.Color(skinC).lerp(new THREE.Color('#9a3438'), 0.45).multiplyScalar(0.85).getHexString(), 0.45) : lip;
  part(ellipsoid(0.021, 0.0052, 0.0085, 12, 6), lipC, head, 0, -0.0535, 0.0935);
  part(ellipsoid(0.0185, 0.0066, 0.0092, 12, 6), lipC, head, 0, -0.0615, 0.0915);
  part(ellipsoid(0.0185, 0.0009, 0.0036, 10, 4), dark, head, 0, -0.0575, 0.0985);
  for (const sx of [-1, 1]) part(ellipsoid(0.0034, 0.001, 0.002, 6, 4), dark, head, sx * 0.0195, -0.0566, 0.0925).rotation.z = sx * 0.5;
  if (o.beard) {
    // a full beard along the jaw and chin
    const bm = o.hair && o.hair !== '#17110d' ? hairCol : dark;
    part(ellipsoid(0.07, 0.05, 0.06, 16, 10), bm, head, 0, -0.07, 0.055);
    for (const s of [-1, 1]) part(ellipsoid(0.02, 0.045, 0.05, 10, 8), bm, head, s * 0.07, -0.035, 0.035);
  }
  if (o.mustache) part(ellipsoid(0.037, 0.009, 0.013, 10, 6), o.hair && o.hair !== '#17110d' ? hairCol : dark, head, 0, -0.042, 0.096);
  const cap = (r, phi) => new THREE.SphereGeometry(r, 22, 12, 0, Math.PI * 2, 0, phi);
  if (o.headwear === 'turban') {
    const tm = mat(o.turban, 0.85);
    part(new THREE.TorusGeometry(0.094, 0.042, 10, 26).rotateX(Math.PI / 2), tm, head, 0, 0.068, -0.004);
    const t2 = part(new THREE.TorusGeometry(0.084, 0.034, 10, 24).rotateX(Math.PI / 2), tm, head, 0, 0.11, -0.008);
    t2.rotation.x = 0.18;
    part(cap(0.1, Math.PI / 2).scale(1, 0.72, 1.02), tm, head, 0, 0.08, -0.005);
    part(ellipsoid(0.03, 0.05, 0.02), tm, head, 0.02, 0.03, -0.12).rotation.z = 0.3;
  } else if (o.headwear === 'cap') {
    part(cap(1, Math.PI / 2).scale(0.1, 0.06, 0.118), mat(o.turban ?? '#f2efe6'), head, 0, 0.075, 0);
    part(new THREE.CylinderGeometry(0.101, 0.103, 0.025, 20).scale(1, 1, 1.17), mat(o.turban ?? '#f2efe6'), head, 0, 0.075, 0);
  } else if (o.headwear === 'topi') {
    // a white crocheted prayer cap
    part(cap(1, Math.PI / 2).scale(0.104, 0.055, 0.112), mat(o.turban ?? '#f4f2ec', 0.95), head, 0, 0.07, -0.005);
    part(ellipsoid(0.024, 0.006, 0.02), hairCol, head, 0, 0.03, -0.1);
  } else if (!saree) {
    part(hairGeo((o.k ?? 1) < 0.8 ? 'kid' : 'man'), hairMaterial(o.hair ?? '#17110d'), head);
  }
  if (saree) {
    part(hairGeo('woman'), hairMaterial(o.hair ?? '#17110d'), head);
    if (o.braids) for (const sx of [-1, 1]) part(limb(0.03, 0.018, 0.2, 8), hairCol, head, sx * 0.07, -0.04, -0.07);
    else part(new THREE.SphereGeometry(0.048, 12, 10), hairCol, head, 0, -0.02, -0.105);
    if (o.hijab) {
      // a headscarf wrapped round the head, under the chin, and falling over the shoulders
      const hm = mat(o.hijab, 0.9), hds = sharedMat('std', THREE.MeshStandardMaterial, { color: hex(o.hijab), roughness: 0.9, side: THREE.DoubleSide });
      part(cap(0.122, Math.PI * 0.62), hds, head, 0, 0.012, -0.012).rotation.x = -0.35;
      part(new THREE.TorusGeometry(0.095, 0.03, 8, 22).rotateX(Math.PI / 2).scale(1, 1, 1.05), hm, head, 0, -0.08, -0.005).rotation.x = -0.35;
      part(ellipsoid(0.2, 0.09, 0.15), hm, head, 0, -0.17, -0.02);
    } else if (o.veil) {
      part(cap(0.124, Math.PI * 0.6), bottomDS, head, 0, 0.012, -0.022).rotation.x = -0.72;
      part(ellipsoid(0.115, 0.15, 0.02), bottomDS, head, 0, -0.11, -0.1).rotation.x = 0.25;
    }
    if (!o.braids) part(new THREE.SphereGeometry(0.008, 6, 4), mat('#c41e1e', 0.4), head, 0, 0.047, 0.101);
  }

  const arms = [-1, 1].map((s) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.178, 0.49, 0);
    torso.add(shoulder);
    const longSleeve = !saree && o.sleeves !== 'short';
    // the round of the shoulder, so the arm grows out of the body instead of meeting it at a seam
    part(ellipsoid(0.046, 0.05, 0.048, 16, 12), top, shoulder, -s * 0.03, -0.045, 0);
    const upper = (r0, r1) => muscle(r0, r1, 0.29, [[0.15, 0.12, 0.18, 0], [0.5, 0.16, 0.22, 1], [0.55, 0.1, 0.22, -1]], { flat: 0.9 });
    if (saree) { part(sleeve(0.05, 0.047, 0.1), top, shoulder); part(upper(0.044, 0.035), skin, shoulder); }
    else if (!longSleeve) { part(sleeve(0.052, 0.052, 0.14), top, shoulder); part(upper(0.046, 0.037), skin, shoulder); }
    else part(sleeve(0.052, 0.045, 0.3), top, shoulder);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    shoulder.add(elbow);
    part(longSleeve ? limb(0.043, 0.033, 0.26) : muscle(0.04, 0.026, 0.26, [[0.22, 0.2, 0.22, 0], [0.92, -0.08, 0.08, 0]], { flat: 0.84 }), longSleeve ? top : skin, elbow);
    if (longSleeve) part(limb(0.034, 0.032, 0.03, 10), skin, elbow, 0, -0.255, 0);
    const hand = new THREE.Group();
    hand.position.y = -0.28;
    elbow.add(hand);
    // the palm, four fingers held together and curled a little, and the thumb
    part(ellipsoid(0.017, 0.036, 0.03, 12, 10), skin, hand, 0, -0.03, 0.004);
    for (let f = 0; f < 4; f++) {
      const fz = 0.02 - f * 0.0128, len = [0.044, 0.05, 0.047, 0.038][f];
      const fg = part(limb(0.0068, 0.0058, len, 6), skin, hand, 0.002, -0.06, fz + 0.004);
      fg.rotation.z = s * 0.25; fg.rotation.x = (f - 1.5) * 0.06;
    }
    part(limb(0.0085, 0.007, 0.034, 6), skin, hand, -s * 0.012, -0.03, 0.03).rotation.set(0.5, 0, s * 0.5);
    if (saree) for (const y of [-0.215, -0.235]) part(new THREE.TorusGeometry(0.036, 0.006, 4, 12).rotateX(Math.PI / 2), mat(y < -0.22 ? '#c42a3a' : '#d9a63a', 0.3), elbow, 0, y, 0);
    return { shoulder, elbow, hand };
  });

  consolidate(root);
  return { root, body, torso, head, legs, arms, hipY: hipY * k, k, skirt };
}

// every person in the world, for collisions
export const ALL_PEOPLE = [];
// ---------------- props ----------------
const PM = {
  wood: mat('#6a4a30'), woodDark: mat('#3e2b1d'), metal: mat('#7d8288', 0.4), straw: mat('#c9a95e', 1),
  clay: mat('#a6512e', 0.8), cloth: mat('#d9d1c0'), alu: new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.8, roughness: 0.3 }),
  chai: mat('#b07a4a', 0.3),
};
function matka(s = 1) {
  const prof = [[0, 0], [0.12, 0.01], [0.2, 0.08], [0.24, 0.2], [0.22, 0.32], [0.14, 0.4], [0.1, 0.43], [0.115, 0.47], [0.1, 0.48]].map(([x, y]) => [x * s, y * s]);
  const m = new THREE.Mesh(lathe(prof, 18), PM.clay);
  m.castShadow = true;
  return m;
}
const kulhad = (g, y) => {
  part(lathe([[0.0, 0], [0.024, 0.0], [0.032, 0.045], [0.034, 0.07]], 12), PM.clay, g, 0, y, 0.02);
  part(new THREE.CircleGeometry(0.03, 12).rotateX(-Math.PI / 2), PM.chai, g, 0, y + 0.058, 0.02);
};
function makeProp(kind) {
  const g = new THREE.Group();
  if (kind === 'hoe') {
    part(cyl(0.02, 0.022, 1.3, 8), PM.wood, g, 0, -0.5, 0);
    part(new THREE.BoxGeometry(0.2, 0.03, 0.22), PM.metal, g, 0, -1.13, 0.09);
  } else if (kind === 'axe') {
    part(cyl(0.02, 0.022, 0.85, 8), PM.wood, g, 0, -0.32, 0);
    part(new THREE.BoxGeometry(0.03, 0.14, 0.2), PM.metal, g, 0, -0.68, 0.08);
  } else if (kind === 'broom') {
    part(cyl(0.025, 0.08, 0.6, 10), PM.straw, g, 0, -0.32, 0);
  } else if (kind === 'stick') {
    part(cyl(0.018, 0.022, 1.7, 6), PM.woodDark, g, 0, -0.25, 0.05);
  } else if (kind === 'pot') {
    const m = matka(0.7);
    m.position.y = -0.36;
    g.add(m);
  } else if (kind === 'potHead') {
    const m = matka(0.85);
    m.position.y = 0.11;
    g.add(m);
  } else if (kind === 'hay') {
    part(new THREE.SphereGeometry(0.45, 12, 8).scale(1.1, 0.45, 0.7), PM.straw, g, 0, 0.18, 0);
  } else if (kind === 'bundle') {
    part(new THREE.SphereGeometry(0.22, 12, 8).scale(1, 0.6, 1), PM.cloth, g, 0, 0.12, 0);
  } else if (kind === 'clothes') {
    part(new THREE.BoxGeometry(0.35, 0.03, 0.25), mat('#b8322b'), g, 0, -0.06, 0.05);
  } else if (kind === 'kettle') {
    // held by the handle, hangs upright; spout forward
    part(lathe([[0.0, 0], [0.085, 0.0], [0.1, 0.05], [0.092, 0.12], [0.05, 0.16], [0.025, 0.17]], 16), PM.alu, g, 0, -0.26, 0);
    part(limbZ(0.018, 0.01, 0.13, 8), PM.alu, g, 0, -0.2, 0.07).rotation.x = -0.7;
    part(new THREE.TorusGeometry(0.06, 0.008, 5, 12, Math.PI), PM.woodDark, g, 0, -0.1, 0).rotation.y = Math.PI / 2;
    g.userData.upright = 0;
  } else if (kind === 'cup' || kind === 'cupL') {
    kulhad(g, -0.07);
    g.userData.upright = 0;
  } else if (kind === 'can') {
    const green = mat('#3f7a4a', 0.5);
    part(lathe([[0, 0], [0.09, 0], [0.1, 0.05], [0.09, 0.2], [0.0, 0.21]], 14), green, g, 0, -0.32, 0.04);
    part(limbZ(0.015, 0.01, 0.25, 6), green, g, 0, -0.22, 0.12).rotation.x = -0.6;
    part(new THREE.TorusGeometry(0.07, 0.01, 5, 12, Math.PI), green, g, 0, -0.12, 0.04).rotation.y = Math.PI / 2;
    g.userData.upright = 0;
  } else if (kind === 'rod') {
    // a long bamboo rod held out over the water, its line hanging down to a float
    const rodG = new THREE.Group();
    rodG.rotation.x = -1.0;
    g.add(rodG);
    part(cyl(0.012, 0.02, 3.2, 6).translate(0, -1.5, 0), mat('#b89a5a', 0.6), rodG, 0, 0, 0.1);
    const line = part(cyl(0.003, 0.003, 2.6, 3).translate(0, -1.3, 0), mat('#e8e4d8', 0.5), rodG, 0, -3.05, 0.1);
    line.rotation.x = 1.0;
    part(new THREE.SphereGeometry(0.03, 6, 4), mat('#d8402a', 0.5), line, 0, -2.6, 0);
    g.userData.upright = 0;
  } else if (kind === 'ladle') {
    part(cyl(0.008, 0.008, 0.45, 5), PM.alu, g, 0, -0.2, 0.02);
    part(new THREE.SphereGeometry(0.035, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), PM.alu, g, 0, -0.42, 0.02);
  }
  return g;
}
const LEFT_PROPS = new Set(['cupL']);

// ---------------- animated person ----------------
const SKIRT_TOP = 1.02; // the top of the sari's skirt, at the waist (in the body's own units)
const POSE_KEYS = ['hip0', 'hip1', 'knee0', 'knee1', 'sh0', 'sh1', 'shz0', 'shz1', 'el0', 'el1', 'torsoX', 'torsoY', 'headX', 'headY', 'bodyY'];
const _pose = Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));

// where the camera is (set each frame by the game): people far from it animate at a lower rate
export const EYE = { x: 0, z: 0 };
export class Person {
  constructor(opts) {
    Object.assign(this, buildHuman(opts));
    ALL_PEOPLE.push(this);
    this.female = opts.dress === 'saree';
    this.phase = 0;
    this.walkB = 0;
    this.t = Math.random() * 20;
    this.cur = Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));
    this.props = {};
    this.seatH = 0.55;
    this.gear = new Gear(this);
    this.gearB = 0;
    this.lift = 0;
  }
  prop(kind, on) {
    if (on && !this.props[kind]) {
      const p = makeProp(kind);
      (kind === 'potHead' || kind === 'hay' || kind === 'bundle' ? this.head : this.arms[LEFT_PROPS.has(kind) ? 0 : 1].hand).add(p);
      this.props[kind] = p;
    }
    if (this.props[kind]) this.props[kind].visible = on;
  }
  showOnly(kinds) {
    for (const k of Object.keys(this.props)) if (!kinds.includes(k)) this.props[k].visible = false;
    for (const k of kinds) this.prop(k, true);
  }
  setGear(mode) {
    if (mode !== this.gear.mode) this.gear.set(mode);
  }

  // knocked over (hit by something): tip over away from the hit, lie there a few seconds, get back up
  knockDown(dx, dz, power = 1) {
    if (this.fallT > 0) return false;
    const l = Math.hypot(dx, dz) || 1;
    this.fallT = 0.001;
    this.fallA = Math.atan2(dx / l, dz / l);
    this.fallSlide = { x: (dx / l) * (0.8 + Math.min(1.5, power) * 1.6), z: (dz / l) * (0.8 + Math.min(1.5, power) * 1.6) };
    this.fallPos = this.root.position.clone();
    return true;
  }
  fallStep(dt) {
    this.fallT += dt;
    const t = this.fallT, DOWN = 0.38, LIE = 3.2, UP = 1.2;
    let f;
    if (t < DOWN) f = ss(t / DOWN);
    else if (t < DOWN + LIE) f = 1;
    else if (t < DOWN + LIE + UP) f = 1 - ss((t - DOWN - LIE) / UP);
    else { this.fallT = 0; this.body.quaternion.identity(); this.body.position.y = 0; return; }
    // stays where it fell, whatever its owner tries to do with it meanwhile
    if (t < DOWN + 0.35) { const k = 1 - t / (DOWN + 0.35); this.fallPos.x += this.fallSlide.x * k * dt; this.fallPos.z += this.fallSlide.z * k * dt; }
    this.root.position.x = this.fallPos.x; this.root.position.z = this.fallPos.z;
    const a = this.fallA - this.root.rotation.y;
    this.body.quaternion.setFromAxisAngle(_fallAxis.set(Math.cos(a), 0, -Math.sin(a)), f * 1.42);
    this.body.position.y = f * 0.11 * this.k;
    // arms flung out, legs bent, the head lolling; a little struggle as they get up
    const wob = t > DOWN + LIE - 0.6 ? Math.sin(t * 9) * 0.15 : 0;
    this.arms.forEach((A, i) => { const sd = i ? 1 : -1; A.shoulder.rotation.set(-0.9 * f + wob, 0, sd * 1.1 * f); A.elbow.rotation.set(-0.5 * f, 0, 0); });
    this.legs.forEach((Lg, i) => { Lg.hip.rotation.set(-0.25 * f - (i ? 0.3 : 0) * f, 0, (i ? 0.12 : -0.12) * f); Lg.knee.rotation.set(0.5 * f + (i ? 0.4 : 0) * f, 0, 0); });
    this.head.rotation.set(-0.35 * f, 0.4 * f, 0);
  }
  // step aside by (dx, dz) metres for `hold` seconds, then walk back (the owner keeps setting the root's
  // position; the offset rides on top of it). They really walk it: turning toward where they're stepping, at a
  // brisk walk with their legs going, easing to a stop, waiting, then strolling back. A second honk while
  // they're at it just keeps them out of the way a little longer — they carry on from where they are.
  dodge(dx, dz, hold = 3.5) {
    const d = this.dodgeV;
    if (d) { d.tx = dx; d.tz = dz; d.hold = Math.max(hold, d.phase === 'hold' ? d.hold - d.t : 0); d.t = 0; d.phase = 'go'; return; }
    this.dodgeV = { tx: dx, tz: dz, ox: 0, oz: 0, vx: 0, vz: 0, hold, t: 0, phase: 'go', turn: 0 };
  }
  update(dt, speed, action) {
    // far away, the pose needn't change every frame: every 2nd frame past 90 m, every 4th past 180 m (with the
    // time saved up, so they don't slow down)
    if (!(this.fallT > 0) && !this.dodgeV) {
      const e = this.root.matrixWorld.elements, dx = e[12] - EYE.x, dz = e[14] - EYE.z, d2 = dx * dx + dz * dz;
      const every = d2 > 32400 ? 4 : d2 > 8100 ? 2 : 1;
      if (every > 1) {
        this._acc = (this._acc ?? 0) + dt;
        this._n = ((this._n ?? 0) + 1) % every;
        if (this._n) return;
        dt = this._acc;
      }
      this._acc = 0;
    }
    if (this.dodgeV && this.root.parent?.isScene) {
      const d = this.dodgeV, back = d.phase === 'back';
      const ex = (back ? 0 : d.tx) - d.ox, ez = (back ? 0 : d.tz) - d.oz, dist = Math.hypot(ex, ez);
      // a brisk walk out of the way, an easy stroll back, slowing down over the last half metre
      const sp = dist > 1e-3 ? Math.min(back ? 1.0 : 1.45, dist * 2.4) : 0;
      const a = 1 - Math.exp(-dt * 7);
      d.vx += ((dist > 1e-3 ? (ex / dist) * sp : 0) - d.vx) * a; d.vz += ((dist > 1e-3 ? (ez / dist) * sp : 0) - d.vz) * a;
      d.ox += d.vx * dt; d.oz += d.vz * dt;
      const v = Math.hypot(d.vx, d.vz);
      if (d.phase === 'go' && dist < 0.06 && v < 0.2) { d.phase = 'hold'; d.t = 0; }
      else if (d.phase === 'hold') { d.t += dt; if (d.t > d.hold) d.phase = 'back'; }
      this.root.position.x += d.ox; this.root.position.z += d.oz;
      speed = Math.max(speed, v);
      // face the way they're walking; standing aside, turn back to how they were
      const want = v > 0.3 ? Math.atan2(d.vx, d.vz) - this.root.rotation.y : 0;
      const dw = Math.atan2(Math.sin(want - d.turn), Math.cos(want - d.turn));
      d.turn += dw * (1 - Math.exp(-dt * (v > 0.3 ? 9 : 4)));
      if (!(this.fallT > 0)) this.body.rotation.y = d.turn;
      if (back && dist < 0.03 && v < 0.05 && Math.abs(d.turn) < 0.05) { this.dodgeV = null; if (!(this.fallT > 0)) this.body.rotation.y = 0; }
    }
    if (this.fallT > 0) { this.fallStep(dt); return; }
    this.t += dt;
    const t = this.t;
    const P = _pose; // (one, reused: this runs for hundreds of people every frame)
    for (let i = 0; i < POSE_KEYS.length; i++) P[POSE_KEYS[i]] = 0;
    // at rest the arms hang relaxed: a little out from the body, a little forward, the elbows soft
    P.shz0 = -0.11; P.shz1 = 0.11; P.el0 = P.el1 = -0.22; P.sh0 = P.sh1 = -0.04;
    this.walkB += ((speed > 0.1 ? 1 : 0) - this.walkB) * damp(dt, 6);
    const b = this.walkB;
    this.phase += (speed * dt * (this.female ? 5.8 : 5.0)) / this.k;
    const amp = this.female ? 0.3 : 0.42;
    const gait = (this.gait ??= 0.85 + Math.random() * 0.3); // everyone walks a little differently
    for (let i = 0; i < 2; i++) {
      const ph = this.phase + i * Math.PI;
      P['hip' + i] = Math.sin(ph) * amp * gait * b;
      P['knee' + i] = b * (0.06 + Math.max(0, -Math.cos(ph)) * 0.7);
      // the arm swings from the shoulder and bends a little at the elbow as it comes forward
      P['sh' + i] = -Math.sin(ph) * 0.32 * gait * b;
      P['el' + i] = -0.12 - Math.max(0, Math.sin(ph)) * 0.3 * b;
    }
    P.bodyY = Math.abs(Math.cos(this.phase)) * 0.025 * b;
    P.torsoY = Math.sin(this.phase) * 0.085 * b;
    P.torsoX = 0.035 * b;
    const idle = 1 - b;
    P.headY = idle * (Math.sin(t * 0.37) * 0.35 + Math.sin(t * 0.13) * 0.2);

    const A = idle;
    const cyc = (rate) => {
      const c = (t * rate) % 1;
      return c < 0.65 ? ss(c / 0.65) : c < 0.75 ? 1 - (c - 0.65) / 0.1 : 0;
    };
    let lift = 0;
    switch (action) {
      case 'carry':
        P.sh1 = -2.95; P.el1 = -0.35; P.shz1 = -0.15;
        break;
      case 'hoe': {
        const r = cyc(0.55);
        P.sh0 = P.sh1 = -0.45 - r * 2.0; P.el0 = P.el1 = -0.45 + r * 0.25;
        P.shz0 = 0.2; P.shz1 = -0.2;
        P.torsoX = 0.5 - r * 0.35; P.hip0 = -0.25; P.hip1 = 0.2; P.knee0 = 0.25; P.knee1 = 0.15; P.headX = -0.15; P.headY = 0;
        break;
      }
      case 'chop': {
        const r = cyc(0.6);
        P.sh0 = P.sh1 = -0.6 - r * 2.4; P.el0 = P.el1 = -0.3; P.shz0 = 0.25; P.shz1 = -0.25;
        P.torsoX = 0.35 - r * 0.35; P.hip0 = -0.2; P.hip1 = 0.15; P.knee0 = P.knee1 = 0.15; P.headY = 0;
        break;
      }
      case 'sweep': {
        const w = Math.sin(t * 2.6);
        P.torsoX = 1.0; P.sh1 = -1.0; P.shz1 = w * 0.5; P.el1 = -0.15;
        P.sh0 = -0.7; P.el0 = -1.1; P.hip0 = P.hip1 = -0.2; P.knee0 = P.knee1 = 0.4; P.bodyY = -0.06; P.headX = -0.4; P.headY = 0;
        break;
      }
      case 'draw': {
        const a = Math.sin(t * 2.4);
        P.torsoX = 0.25; P.sh0 = -1.7 + a * 0.6; P.sh1 = -1.7 - a * 0.6; P.el0 = P.el1 = -0.5; P.headY = 0; P.headX = 0.15;
        break;
      }
      case 'wash': {
        const r = cyc(0.75);
        P.hip0 = P.hip1 = -1.9; P.knee0 = P.knee1 = 2.5; P.bodyY = -(this.hipY - 0.24 * this.k);
        P.torsoX = 0.75; P.sh0 = P.sh1 = -0.5 - r * 1.3; P.el0 = P.el1 = -0.6; P.headX = -0.2; P.headY = 0;
        break;
      }
      case 'sit':
      case 'sip':
        P.hip0 = P.hip1 = -1.5; P.knee0 = P.knee1 = 1.5; P.bodyY = this.seatH + 0.06 - this.hipY;
        P.sh0 = P.sh1 = -0.55; P.el0 = P.el1 = -0.75; P.torsoX = 0.08;
        if (action === 'sip') {
          // bring the kulhad to the lips every few seconds
          const c = (t * 0.16 + this.k * 3) % 1;
          lift = c < 0.12 ? ss(c / 0.12) : c < 0.32 ? 1 : c < 0.44 ? 1 - ss((c - 0.32) / 0.12) : 0;
          P.sh1 = -0.6 - lift * 0.55; P.el1 = -0.8 - lift * 1.45; P.shz1 = 0.04 - lift * 0.32; P.headX = -lift * 0.12;
          P.headY *= 1 - lift;
        }
        break;
      case 'pour': {
        // the long pour: kettle raised high, cup held low
        const c = (t * 0.32) % 1;
        lift = c < 0.25 ? ss(c / 0.25) : c < 0.6 ? 1 : c < 0.8 ? 1 - ss((c - 0.6) / 0.2) : 0;
        P.sh1 = -0.9 - lift * 1.1; P.el1 = -0.9 + lift * 0.55; P.shz1 = -0.1;
        P.sh0 = -0.75; P.el0 = -0.75; P.shz0 = 0.1; P.torsoX = 0.08; P.headX = 0.25 - lift * 0.15; P.headY = 0;
        break;
      }
      case 'stir': {
        const w = t * 3.1;
        P.torsoX = 0.18; P.sh1 = -0.95 + Math.sin(w) * 0.12; P.shz1 = -0.15 + Math.cos(w) * 0.18; P.el1 = -0.55;
        P.sh0 = -0.5; P.el0 = -0.9; P.headX = 0.3; P.headY = -0.25;
        break;
      }
      case 'drive':
        P.hip0 = P.hip1 = -1.35; P.knee0 = P.knee1 = 1.25; P.bodyY = this.seatH + 0.06 - this.hipY;
        P.sh0 = P.sh1 = -1.05; P.el0 = P.el1 = -0.55; P.shz0 = 0.15; P.shz1 = -0.15; P.torsoX = 0.05;
        P.headY = Math.sin(t * 0.3) * 0.4;
        break;
      case 'swing':
        P.hip0 = P.hip1 = -1.4 - Math.sin(t * 2.2) * 0.3; P.knee0 = P.knee1 = 1.1 + Math.sin(t * 2.2) * 0.5; P.bodyY = this.seatH + 0.06 - this.hipY;
        P.sh0 = P.sh1 = -2.5; P.el0 = P.el1 = -0.25; P.torsoX = -0.1 - Math.sin(t * 2.2) * 0.12; P.headX = -0.1;
        break;
      case 'water':
        P.sh1 = -0.75; P.el1 = -0.25; P.torsoX = 0.2; P.headX = 0.35; P.headY = 0; P.sh0 = -0.3; P.el0 = -0.4;
        break;
      case 'play':
        // jumping about, arms flung up now and then
        P.bodyY += Math.max(0, Math.sin(t * 7)) * 0.12; P.sh0 = -1.2 - Math.sin(t * 3) * 0.9; P.sh1 = -1.2 + Math.sin(t * 3) * 0.9; P.knee0 = P.knee1 = Math.max(0, -Math.sin(t * 7)) * 0.5;
        break;
      case 'pump': {
        const w = Math.sin(t * 2.4);
        P.sh1 = -1.0 - w * 0.35; P.el1 = -0.35 + w * 0.15; P.sh0 = -0.9 - w * 0.3; P.el0 = -0.4; P.shz0 = 0.3;
        P.torsoX = 0.3 + w * 0.12; P.hip0 = -0.15; P.knee0 = P.knee1 = 0.15; P.headX = 0.1; P.headY = 0;
        this.pumpW = w;
        break;
      }
      case 'fish': {
        // sitting on the bank, rod held out; every so often a twitch, a strike and a pull
        P.hip0 = P.hip1 = -1.45; P.knee0 = P.knee1 = 1.6; P.bodyY = this.seatH + 0.06 - this.hipY;
        const c = (t * 0.07 + this.k) % 1;
        const strike = c > 0.9 ? Math.sin((c - 0.9) * 10 * Math.PI) : 0;
        P.sh1 = -1.05 - strike * 0.6; P.el1 = -0.35; P.sh0 = -0.9 - strike * 0.5; P.el0 = -0.5; P.shz0 = 0.25; P.torsoX = 0.15 - strike * 0.2;
        P.headX = 0.25; P.headY = 0;
        break;
      }
      case 'keeper':
        P.hip0 = P.hip1 = -1.6; P.knee0 = P.knee1 = 2.2; P.bodyY = -(this.hipY - 0.38 * this.k);
        P.torsoX = 0.55; P.sh0 = P.sh1 = -0.9; P.el0 = P.el1 = -0.6; P.headX = -0.4; P.headY = 0;
        break;
      case 'pray':
        P.sh0 = P.sh1 = -0.8; P.shz0 = 0.42; P.shz1 = -0.42; P.el0 = P.el1 = -1.5; P.headX = 0.2; P.headY = 0;
        break;
      case 'lean':
        P.sh1 = -0.35; P.el1 = -0.55;
        break;
      default:
        P.bodyY += Math.sin(t * 1.9) * 0.004 * A;
    }
    this.lift = lift;
    if (this.poseHook) this.poseHook(P, t);
    const f = damp(dt, this.poseRate ?? 7);
    for (const k of POSE_KEYS) this.cur[k] += (P[k] - this.cur[k]) * f;
    const c = this.cur;
    this.legs[0].hip.rotation.x = c.hip0; this.legs[1].hip.rotation.x = c.hip1;
    this.legs[0].knee.rotation.x = c.knee0; this.legs[1].knee.rotation.x = c.knee1;
    this.arms[0].shoulder.rotation.x = c.sh0; this.arms[1].shoulder.rotation.x = c.sh1;
    this.arms[0].shoulder.rotation.z = c.shz0; this.arms[1].shoulder.rotation.z = c.shz1;
    this.arms[0].elbow.rotation.x = c.el0; this.arms[1].elbow.rotation.x = c.el1;
    this.torso.rotation.x = c.torsoX; this.torso.rotation.y = c.torsoY;
    // the head stays facing where they are going while the shoulders turn under it
    this.head.rotation.x = c.headX; this.head.rotation.y = c.headY - c.torsoY * 0.7;
    this.body.position.y = c.bodyY;
    // weight shifting from foot to foot, and breathing when standing still
    const sway = Math.sin(this.phase) * b;
    this.torso.rotation.z = sway * 0.03;
    this.head.rotation.z = -sway * 0.02;
    this.body.position.x = sway * 0.012 * this.k;
    const br = 1 + Math.sin(t * 1.7 + this.k * 9) * 0.007 * (1 - b);
    this.torso.scale.set(br, 1, br);
    if (this.skirt) {
      // sitting, squatting or crouching, the sari is gathered up round the hips (its top stays at the waist) and
      // the cloth-wrapped legs come forward out of it; standing or walking it falls to the ankles
      const bend = Math.min(1, Math.max(0, (-Math.min(c.hip0, c.hip1) - 0.45) / 0.9));
      const sy = 1 - 0.78 * bend;
      this.skirt.visible = true;
      this.skirt.scale.set(1 - 0.26 * bend, sy, 1 - 0.08 * bend);
      this.skirt.position.y = SKIRT_TOP * (1 - sy);
      this.skirt.rotation.x = c.hip0 * 0.1 * (1 - bend);
    }
    // hand-held things that should hang or stand upright regardless of the arm
    for (const [kind, p] of Object.entries(this.props)) {
      if (!p.visible || p.userData.upright === undefined) continue;
      const side = LEFT_PROPS.has(kind) ? 0 : 1;
      let tilt = 0;
      if (kind === 'kettle') tilt = lift * 0.9;
      if (kind === 'cup') tilt = lift * 0.7;
      if (kind === 'can') tilt = 0.5 + Math.sin(this.t * 1.3) * 0.15;
      if (kind === 'rod') tilt = 0;
      p.rotation.x = -(c['sh' + side] + c['el' + side] + c.torsoX) + tilt;
    }
    // umbrella / lantern in the left hand
    const want = this.gear.mode !== 'none' ? 1 : 0;
    this.gearB += (want - this.gearB) * damp(dt, 5);
    if (this.gear.mode !== 'none') {
      this.gear.pose(this.gearB);
      this.gear.update(dt);
    }
  }
}

// ---------------- places & routes ----------------
const pt = (x, z) => ({ x, z });
function roadWalk(z0, z1) {
  const pts = [];
  const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / 8));
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    pts.push(pt(roadX(z), z));
  }
  return pts;
}
function route(from, to) {
  if (from.group && from.group === to.group) return from.hub && Math.hypot(from.pos.x - to.pos.x, from.pos.z - to.pos.z) > 6 ? [from.hub, to.pos] : [to.pos];
  const out = [...[...from.via].reverse()];
  if (from.roadZ !== undefined && to.roadZ !== undefined) out.push(...roadWalk(from.roadZ, to.roadZ));
  out.push(...to.via, to.pos);
  return out;
}
const faceTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

function places() {
  const P = {};
  const L = layout;
  P.house = (h) => {
    const yard = localToWorld(h, 0, 5);
    if (Math.hypot(h.x - EH.x, h.z - EH.z) < 35) {
      return { pos: yard, roadZ: FOOT.z, via: [FOOT.w, FOOT.e, pt(EH.x - 6, EH.z - 4)], face: h.rot + Math.PI };
    }
    return { pos: yard, roadZ: h.z, via: [], face: h.rot + Math.PI };
  };
  const w = L.well;
  P.well = { pos: pt(w.x - 1.6, w.z), roadZ: w.z, via: [], face: Math.PI / 2 };
  P.wheat = [pt(27, -40), pt(36, -56), pt(45, -71), pt(30, -64)].map((p, i) => ({ pos: p, roadZ: -30, via: [pt(19, -30)], group: 'wheat', face: 0.4 + i }));
  P.mustard = [pt(-55, 1), pt(-68, 19), pt(-88, -19), pt(-62, -30)].map((p, i) => ({ pos: p, roadZ: 5, via: [pt(-44, 5)], group: 'mustard', face: -1.2 + i }));
  {
    const g = GHAT;
    const st = g.steps[4];
    const pos = localToWorld(g, st.lx, 2.4);
    const via = [10, 25, 40, 55].filter((x) => x < g.x - 3).map((x) => pt(x, pathZ(x)));
    via.push(pt(g.x - 2, g.z));
    P.ghat = { pos, roadZ: pathZ(roadX(0)), via, face: Math.atan2(Math.cos(g.rot), -Math.sin(g.rot)), y: st.top };
  }
  {
    const bn = L.banyan;
    const a0 = Math.atan2(SQUARE.z - bn.z, SQUARE.x - bn.x);
    P.banyanSeats = [0, 0.55, -0.55].map((da) => {
      const a = a0 + da, dx = Math.cos(a), dz = Math.sin(a);
      return { pos: pt(bn.x + dx * 4.75, bn.z + dz * 4.75), roadZ: bn.z, via: [pt(bn.x + dx * 7.5, bn.z + dz * 7.5)], face: Math.atan2(dx, dz), sit: true };
    });
    P.banyan = P.banyanSeats[0];
  }
  {
    const tp = L.temple;
    const pos = localToWorld(tp, 0, 4.7);
    P.temple = { pos, roadZ: tp.z - 2, via: [], face: tp.rot + Math.PI };
  }
  P.square = [pt(SQUARE.x + 4, SQUARE.z + 3), pt(SQUARE.x - 3, SQUARE.z - 4), pt(SQUARE.x + 5, SQUARE.z - 3), pt(SQUARE.x - 4, SQUARE.z + 4)].map((p, i) => ({ pos: p, roadZ: p.z, via: [], face: [-1, 2, -2.3, 0.9][i] }));
  P.cows = L.cows.slice(0, 3).map((c, i) => ({ pos: pt(c.x - 2.6, c.z - 1), roadZ: 15, via: [pt(14, 16)], group: 'cows', face: faceTo(pt(c.x - 2.6, c.z - 1), c) }));
  if (L.woodpiles[0]) {
    const wp = L.woodpiles[0];
    const pos = localToWorld(wp, 1.2, 1.5);
    P.wood = { pos, roadZ: wp.house.z, via: [localToWorld(wp.house, 0, 5)], face: wp.rot + Math.PI };
  }
  {
    const hs = L.haystacks.find((h) => h.field && h.x < -30) || L.haystacks[0];
    const pos = pt(hs.x, hs.z - 2.4);
    P.hay = { pos, roadZ: 5, via: [pt(hs.x, 5)], face: 0 };
  }
  if (L.cart) {
    const c = L.cart;
    const pos = localToWorld(c, 1.7, 0);
    P.cart = { pos, roadZ: c.z, via: [], face: c.rot - Math.PI / 2 };
  }
  // chai stall: the chaiwala behind his counter, two seats on the bench under the awning
  P.teaVendor = { pos: localToWorld(TEA, -0.42, 0.08), roadZ: TEA.z, via: [], group: 'chaiwala', face: TEA.rot, sheltered: true };
  // Chhota Gaon
  {
    const hub = pt(L.nv.x, L.nv.z);
    const po = L.postOffice, hp = L.hospital;
    const nvPlace = (p, face, extra = {}) => ({ pos: p, group: 'nv', hub, face, ...extra });
    const nvHouses = L.houses.filter((h) => Math.hypot(h.x - L.nv.x, h.z - L.nv.z) < 26);
    P.nvHouse = nvHouses.map((h) => nvPlace(localToWorld(h, 0, 5.5), h.rot + Math.PI));
    P.postOffice = nvPlace(localToWorld(po, 0, 4.2), po.rot + Math.PI);
    P.postBox = nvPlace(localToWorld(po, 2.4, 5.4), po.rot + Math.PI);
    P.counter = nvPlace(localToWorld(po, -1.2, 3.4), po.rot, { sheltered: true });
    P.hospitalDoor = nvPlace(localToWorld(hp, 1.2, 4.0), hp.rot + Math.PI, { sheltered: true });
    P.hospitalBench = nvPlace(localToWorld(hp, -2.5, 4.4), hp.rot, { sit: true, seatH: 0.48, sheltered: true });
    P.nvSquare = [nvPlace(pt(hub.x + 3, hub.z + 2), 0.5), nvPlace(pt(hub.x - 4, hub.z - 2), 2.2)];
  }
  // the flower garden
  {
    const G = L.garden;
    const hub = pt(G.x + G.hw - 1.2, G.z);
    P.garden = [[-0.5, -0.55], [0.5, -0.55], [0.5, 0.55], [-0.5, 0.55]].map(([a, b]) => ({ pos: pt(G.x + a * G.hw, G.z + b * G.hd * 0.05 + b * 1.6), group: 'garden', hub, face: b > 0 ? 0 : Math.PI }));
  }
  // the haat: a vendor behind each stall, shoppers drifting between them
  {
    const hub = pt(MARKET.x, MARKET.z);
    P.vendor = MARKET.stalls.map((st) => ({ pos: localToWorld(st, 0, -1.0), group: 'market', hub, face: st.rot, sit: true, seatH: 0.3, sheltered: true }));
    P.shop = MARKET.stalls.map((st) => ({ pos: localToWorld(st, 0, 1.25), group: 'market', hub, face: st.rot + Math.PI, roadZ: MARKET.z, via: [pt(MARKET.x0, MARKET.z)] }));
  }
  // Marudhar
  {
    const RV = L.rv;
    const hub = pt(RV.x - 6, RV.z);
    const rvHouses = L.houses.filter((h) => h.type === 'raj');
    P.rvHouse = rvHouses.map((h) => ({ pos: localToWorld(h, 0, 4.2), group: 'rv', hub, face: h.rot + Math.PI }));
    P.baoli = [[0, -5.2, 0], [5.2, 0, -Math.PI / 2], [0, 5.2, Math.PI], [-5.2, 2, Math.PI / 2]].map(([dx, dz, f]) => ({ pos: pt(RV.x + dx, RV.z + dz), group: 'rv', hub, face: f }));
    P.chhatri = { pos: pt(RV.chhatri.x - 2.4, RV.chhatri.z + 1.2), group: 'rv', hub, face: 2.0, sit: true, seatH: 0.3 };
  }
  // Banglagram and Thennoor
  {
    const bh = pt(BV.x, BV.z), th = pt(TV.x, TV.z);
    const bHouses = L.houses.filter((h) => h.type === 'bengal'), tHouses = L.houses.filter((h) => h.type === 'tamil');
    P.bvHouse = bHouses.map((h) => ({ pos: localToWorld(h, 0, 4.0), group: 'bv', hub: bh, face: h.rot + Math.PI }));
    P.pondStep = { pos: pt(BV.pond.x, BV.pond.z - BV.pond.r + 1.6), group: 'bv', hub: bh, face: 0, sheltered: false };
    P.pondEdge = { pos: pt(BV.pond.x + BV.pond.r + 0.6, BV.pond.z), group: 'bv', hub: bh, face: -Math.PI / 2 };
    P.bvTemple = { pos: localToWorld(BV.temple, 0, 3.6), group: 'bv', hub: bh, face: BV.temple.rot + Math.PI };
    P.tvHouse = tHouses.map((h) => ({ pos: localToWorld(h, 0, 4.4), group: 'tv', hub: th, face: h.rot + Math.PI }));
    P.thinnai = tHouses.slice(0, 3).map((h) => ({ pos: localToWorld(h, 1.6, 3.0), group: 'tv', hub: th, face: h.rot, sit: true, seatH: 0.6, sheltered: true }));
    P.tvTemple = { pos: pt(TV.temple.x - 5, TV.temple.z), group: 'tv', hub: th, face: Math.PI / 2 };
    P.tvHorse = { pos: pt(TV.horses[0].x + 2, TV.horses[0].z + 3), group: 'tv', hub: th, face: Math.PI };
  }
  // Vitthalwadi and the North-East
  {
    const mh = pt(MH.x, MH.z), ne = pt(NE.x, NE.z);
    const mHouses = L.houses.filter((h) => h.type === 'maha'), nHouses = L.houses.filter((h) => h.type === 'ne');
    P.mhHouse = mHouses.map((h) => ({ pos: localToWorld(h, 0, 4.2), group: 'mh', hub: mh, face: h.rot + Math.PI }));
    P.mhTemple = { pos: pt(MH.temple.x + 4.5, MH.temple.z), group: 'mh', hub: mh, face: -Math.PI / 2 };
    P.deepmala = { pos: pt(MH.deepmala.x + 1.6, MH.deepmala.z + 1), group: 'mh', hub: mh, face: -2.2 };
    P.wada = { pos: localToWorld(MH.wada, 0, 6.2), group: 'mh', hub: mh, face: MH.wada.rot + Math.PI, sit: true, seatH: 0.3 };
    P.neHouse = nHouses.map((h) => ({ pos: localToWorld(h, 0, 4.0), group: 'ne', hub: ne, face: h.rot + Math.PI }));
    const T = NE.tea;
    P.tea = [0.25, 0.5, 0.75].map((f, i) => ({ pos: pt(T.x0 + (T.x1 - T.x0) * f, T.z0 + 6 + i * 16 + 0.8), group: 'ne', hub: pt(T.x1 + 2, (T.z0 + T.z1) / 2), face: Math.PI / 2 }));
  }
  // anglers' spots on both banks, and Pahadi Gaon
  P.fishing = [[24, -1], [-48, -1], [96, 1], [196, -1], [-128, 1]].map(([z, side]) => {
    const x = riverX(z) + side * (RIVER_HALF + 1.4);
    return { pos: pt(x, z), roadZ: z, via: [pt(x - side * 10, z)], face: side > 0 ? -Math.PI / 2 : Math.PI / 2, sit: true, seatH: 0.12 };
  });
  {
    const hub = pt(PG.x, PG.z);
    const pHouses = L.houses.filter((h) => h.type === 'pahadi');
    P.pgHouse = pHouses.map((h) => ({ pos: localToWorld(h, 0, 4.2), group: 'pg', hub, face: h.rot + Math.PI }));
    P.pgTemple = { pos: pt(PG.temple.x, PG.temple.z - 4), group: 'pg', hub, face: 0 };
  }
  P.pump = { pos: localToWorld(layout.pump, 0.32, -1.5), roadZ: layout.pump.z, via: [], face: layout.pump.rot };
  P.teaSeat = [-0.5, 0.5].map((lx) => ({ pos: localToWorld(TEA, lx, 2.55), roadZ: TEA.z, via: [], face: TEA.rot + Math.PI, sit: true, seatH: 0.48, sheltered: true }));
  return P;
}

export class Villager {
  constructor(person, tasks, startPlace, nightTasks = null) {
    this.person = person;
    this.dayTasks = tasks;
    this.nightTasks = nightTasks;
    this.tasks = tasks;
    this.idx = 0;
    this.place = startPlace;
    this.p = { x: startPlace.pos.x, z: startPlace.pos.z };
    this.y = heightAt(this.p.x, this.p.z);
    this.facing = startPlace.face ?? 0;
    this.speed = person.female ? 1.05 : 1.15;
    this.state = 'act';
    this.timer = 2 + Math.random() * 8;
    this.task = { action: 'idle', props: [] };
    this.curSpeed = 0;
    this.weather = { rain: false, night: false };
    this.noGear = false;
  }
  setWeather(w) {
    const wasNight = this.weather.night;
    this.weather = w;
    if (this.nightTasks && w.night !== wasNight) {
      this.tasks = w.night ? this.nightTasks : this.dayTasks;
      this.idx = 0;
      if (this.state === 'act') this.timer = Math.min(this.timer, 2 + Math.random() * 4);
    }
  }
  next() {
    this.task = this.tasks[this.idx % this.tasks.length];
    this.idx++;
    this.route = route(this.place, this.task.place);
    this.state = 'walk';
    this.person.showOnly(this.task.walkProps || []);
  }
  update(dt, boy) {
    const P = this.person;
    if (P.fallT > 0) { P.update(dt, 0, 'idle'); this.p.x = P.root.position.x; this.p.z = P.root.position.z; return; }
    let speed = 0;
    if (this.greetT > 0) {
      // stop, turn to the boy and fold hands: namaste
      this.greetT -= dt;
      const want = Math.atan2(boy.x - this.p.x, boy.z - this.p.z);
      this.facing += ((((want - this.facing + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * damp(dt, 6);
      this.curSpeed += (0 - this.curSpeed) * damp(dt, 8);
      P.root.position.set(this.p.x, this.y, this.p.z);
      P.root.rotation.y = this.facing;
      P.update(dt, this.curSpeed, this.task.place?.sit && this.state === 'act' ? this.task.action : 'pray');
      return;
    }
    if (this.state === 'act') {
      this.timer -= dt;
      if (this.timer <= 0) this.next();
    } else {
      const tgt = this.route[0];
      const dx = tgt.x - this.p.x, dz = tgt.z - this.p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        this.route.shift();
        if (!this.route.length) {
          this.state = 'act';
          this.place = this.task.place;
          this.timer = this.task.dur * (0.8 + Math.random() * 0.4);
          P.showOnly(this.task.props || []);
          P.seatH = this.place.seatH ?? 0.55;
        }
      } else {
        const bx = boy.x - this.p.x, bz = boy.z - this.p.z;
        const bd = Math.hypot(bx, bz);
        const ahead = (bx * dx + bz * dz) / (bd * d + 1e-6);
        if (!(bd < 1.4 && ahead > 0.3)) {
          speed = this.speed * (this.weather.rain ? 1.15 : 1);
          this.p.x += (dx / d) * speed * dt;
          this.p.z += (dz / d) * speed * dt;
          resolveCollisions(this.p, 0.28, undefined, true);
          const want = Math.atan2(dx, dz);
          this.facing += ((((want - this.facing + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * damp(dt, 6);
        }
      }
    }
    this.curSpeed += (speed - this.curSpeed) * damp(dt, 8);
    let action = this.state === 'walk' ? (this.task.walkAction || 'walk') : this.task.action;
    if (this.state === 'act') {
      const f = this.task.place.face;
      if (f !== undefined) this.facing += ((((f - this.facing + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * damp(dt, 3);
    }
    let gy = this.state === 'act' && this.task.place.sit ? heightAt(this.p.x, this.p.z) : groundHeight(this.p.x, this.p.z);
    if (this.state === 'act' && this.task.place.y !== undefined) gy = this.task.place.y;
    this.y += (gy - this.y) * damp(dt, 10);
    // weather gear: umbrella in the rain unless under a roof, a lantern after dark
    const sheltered = this.state === 'act' && this.task.place.sheltered;
    let gear = 'none';
    if (!this.noGear) {
      if (this.weather.rain && !sheltered) gear = 'umbrella';
      else if (this.weather.night) gear = 'lantern';
    }
    P.setGear(gear);
    P.root.position.set(this.p.x, this.y, this.p.z);
    P.root.rotation.y = this.facing;
    // the boy has the pump: she waits a step to the side with her pot till he's done
    if (action === 'pump' && layout.pump.boyPumping) {
      const r = layout.pump.rot ?? 0;
      P.root.position.x += Math.cos(r) * 1.4; P.root.position.z -= Math.sin(r) * 1.4;
      action = 'idle';
    }
    P.update(dt, this.curSpeed, action);
    if (action === 'pump' && layout.pump.handle && !layout.pump.boyPumping) layout.pump.handle.rotation.x = 0.1 + (P.pumpW ?? 0) * 0.4;
  }
}

// ---------------- population ----------------
export function buildPeople(scene, village, hooks = {}) {
  const P = places();
  const roadHouses = layout.houses.filter((h) => h.side !== 0).sort((a, b) => Math.abs(a.z) - Math.abs(b.z));
  const home = (i) => P.house(roadHouses[i % roadHouses.length]);
  const T = (place, action, dur, extra = {}) => ({ place, action, dur, ...extra });
  const cup = { props: ['cup'] };

  const roster = [
    // women
    { o: { dress: 'saree', k: 0.93, top: '#d4a017', bottom: '#b3202c', veil: true, skin: '#80523a' },
      start: P.well, tasks: [T(P.well, 'draw', 12, { props: ['pot'] }), T(home(0), 'idle', 8, { walkProps: ['potHead'], walkAction: 'carry', props: ['potHead'] }), T(home(0), 'sweep', 18, { props: ['broom'] })] },
    { o: { dress: 'saree', k: 0.92, top: '#3c6e47', bottom: '#2e8b57', veil: false, skin: '#8c5c3e' },
      start: home(1), tasks: [T(home(1), 'sweep', 26, { props: ['broom'] }), T(P.temple, 'pray', 8), T(P.square[0], 'idle', 14), T(home(1), 'idle', 6)] },
    { o: { dress: 'saree', k: 0.94, top: '#7a2b6e', bottom: '#c2185b', veil: true, skin: '#7a4c33' },
      start: home(2), tasks: [T(P.ghat, 'wash', 34, { walkProps: ['bundle'], walkAction: 'carry', props: ['clothes'] }), T(home(2), 'idle', 12, { walkProps: ['bundle'], walkAction: 'carry' })],
      night: [T(P.temple, 'pray', 12), T(home(2), 'idle', 30)] },
    // men
    { o: { dress: 'dhoti', top: '#f1ece0', bottom: '#f4f1e8', headwear: 'turban', turban: '#e07a1e', mustache: true, skin: '#7d4f33' },
      start: P.wheat[0], tasks: [...P.wheat.map((w) => T(w, 'hoe', 20, { props: ['hoe'], walkProps: ['hoe'] }))],
      night: [T(P.square[2], 'idle', 25), T(P.temple, 'pray', 10), T(home(6), 'idle', 30)] },
    { o: { dress: 'dhoti', top: '#dfe6ea', bottom: '#efece4', headwear: 'turban', turban: '#f2efe6', mustache: true, skin: '#6e4530', sleeves: 'short' },
      start: P.mustard[0], tasks: [T(P.mustard[0], 'hoe', 18, { props: ['hoe'], walkProps: ['hoe'] }), T(P.mustard[1], 'idle', 7, { walkProps: ['hoe'] }), T(P.mustard[2], 'hoe', 18, { props: ['hoe'], walkProps: ['hoe'] }), T(P.mustard[3], 'idle', 6, { walkProps: ['hoe'] })],
      night: [T(P.banyanSeats[1], 'sit', 40), T(P.square[3], 'idle', 20)] },
    { o: { dress: 'pants', top: '#b9c7a5', bottom: '#5b5246', headwear: 'turban', turban: '#c0392b', skin: '#7a4a30' },
      start: P.cows[0], tasks: P.cows.map((c) => T(c, 'lean', 16, { props: ['stick'], walkProps: ['stick'] })),
      night: [T(P.square[1], 'idle', 20), T(P.cows[0], 'lean', 20, { props: ['stick'], walkProps: ['stick'] })] },
    { o: { dress: 'pants', top: '#8fa6c4', bottom: '#4a4a52', skin: '#83553a', sleeves: 'short' },
      start: P.wood || home(3), tasks: [T(P.wood || home(3), 'chop', 26, { props: ['axe'] }), T(home(3), 'idle', 10)],
      night: [T(home(3), 'idle', 30), T(P.square[0], 'idle', 15)] },
    { o: { dress: 'dhoti', top: '#e9dcc3', bottom: '#f0ebe0', headwear: 'cap', turban: '#f6f3ec', skin: '#86573b' },
      start: P.hay, tasks: P.cart ? [T(P.hay, 'idle', 4), T(P.cart, 'idle', 5, { walkProps: ['hay'], walkAction: 'carry' })] : [T(P.hay, 'idle', 10), T(P.square[1], 'idle', 10)],
      night: [T(P.banyanSeats[2], 'sit', 35), T(home(7), 'idle', 25)] },
    { o: { dress: 'dhoti', top: '#ffffff', bottom: '#ffffff', headwear: 'turban', turban: '#f4f0e6', mustache: true, skin: '#6f4834', hair: '#dcd6cc' },
      start: P.banyan, tasks: [T(P.banyan, 'sit', 45), T(P.temple, 'pray', 10), T(P.square[1], 'idle', 15), T(P.banyan, 'sit', 40)] },
    // the chai stall: the chaiwala and (at most) two customers on his bench
    { o: { dress: 'dhoti', top: '#efe8d6', bottom: '#e6dcc4', vest: '#6b4a2e', skin: '#7a4c33', sleeves: 'short', mustache: true },
      start: P.teaVendor, noGear: true,
      tasks: [T(P.teaVendor, 'pour', 9, { props: ['kettle', 'cupL'] }), T(P.teaVendor, 'stir', 12, { props: ['ladle'] }), T(P.teaVendor, 'idle', 5), T(P.teaVendor, 'pour', 8, { props: ['kettle', 'cupL'] })] },
    { o: { dress: 'dhoti', top: '#d8d2c4', bottom: '#efe9dc', headwear: 'cap', turban: '#f4f1ea', mustache: true, skin: '#7b4e34', hair: '#bdb6aa' },
      start: P.teaSeat[0], tasks: [T(P.teaSeat[0], 'sip', 45, cup), T(P.square[0], 'idle', 14), T(P.temple, 'pray', 8), T(P.teaSeat[0], 'sip', 32, cup), T(home(5), 'idle', 12)] },
    { o: { dress: 'pants', top: '#c9b27a', bottom: '#3e3a34', skin: '#86573b', sleeves: 'short', mustache: true },
      start: P.teaSeat[1], tasks: [T(P.teaSeat[1], 'sip', 55, cup), T(P.cart || P.square[2], 'idle', 10), T(P.well, 'idle', 8), T(P.teaSeat[1], 'sip', 40, cup)] },
    // Chhota Gaon: the postman on his rounds, the nurse, a patient waiting, a woman at her doorstep
    ...(P.nvHouse.length >= 3 ? [
      { o: { dress: 'pants', top: '#b8a06a', bottom: '#8a7448', headwear: 'cap', turban: '#b8a06a', mustache: true, skin: '#7a4c33', sleeves: 'short' },
        start: P.postOffice, tasks: [T(P.postOffice, 'idle', 10), T(P.nvHouse[0], 'idle', 4, { walkProps: ['bundle'], walkAction: 'carry' }), T(P.nvHouse[2], 'idle', 4, { walkProps: ['bundle'], walkAction: 'carry' }), T(P.postBox, 'lean', 6), T(P.nvHouse[1], 'idle', 4), T(P.postOffice, 'idle', 12)] },
      { o: { dress: 'saree', k: 0.92, top: '#f6f6f2', bottom: '#f2f2ee', veil: false, skin: '#86573b' },
        start: P.hospitalDoor, tasks: [T(P.hospitalDoor, 'idle', 18), T(P.nvSquare[0], 'idle', 6), T(P.hospitalDoor, 'idle', 20)] },
      { o: { dress: 'dhoti', top: '#d8d0bc', bottom: '#ece6d8', headwear: 'turban', turban: '#ffffff', mustache: true, skin: '#6e4530', hair: '#d6d0c6' },
        start: P.hospitalBench, tasks: [T(P.hospitalBench, 'sit', 80), T(P.nvSquare[1], 'idle', 10)] },
      { o: { dress: 'saree', k: 0.93, top: '#e08a1e', bottom: '#6a2a8a', veil: true, skin: '#7d4f33' },
        start: P.nvHouse[3] || P.nvHouse[0], tasks: [T(P.nvHouse[3] || P.nvHouse[0], 'sweep', 22, { props: ['broom'] }), T(P.counter, 'idle', 10), T(P.nvSquare[1], 'idle', 8)],
        night: [T(P.nvHouse[3] || P.nvHouse[0], 'idle', 40)] },
    ] : []),
    // at the hand pump
    { o: { dress: 'saree', k: 0.93, top: '#f2b705', bottom: '#1e6fa8', veil: true, skin: '#86573b' },
      start: P.pump, tasks: [T(P.pump, 'pump', 16, { props: ['pot'] }), T(home(4), 'idle', 8, { walkProps: ['potHead'], walkAction: 'carry', props: ['potHead'] }), T(P.pump, 'pump', 14, { props: ['pot'] })],
      night: [T(home(4), 'idle', 40)] },
    // market vendors and shoppers
    ...P.vendor.map((v, i) => ({ local: true, noGear: true,
      o: i % 3 === 1 ? { dress: 'saree', k: 0.93, top: ['#7a2b6e', '#2e8b57', '#d4a017'][i % 3], bottom: ['#e0612b', '#c2185b', '#1e6fa8', '#b3202c'][i % 4], veil: i % 2 === 0, skin: ['#80523a', '#7a4c33', '#8c5c3e'][i % 3] }
        : { dress: i % 2 ? 'pants' : 'dhoti', top: ['#e9dcc3', '#c9b27a', '#dfe6ea', '#b9c7a5'][i % 4], bottom: '#efe9dc', headwear: i % 4 === 0 ? 'turban' : i % 4 === 2 ? 'cap' : undefined, turban: ['#e07a1e', '#ffffff', '#c0392b'][i % 3], mustache: true, skin: ['#7d4f33', '#6e4530', '#83553a'][i % 3], sleeves: 'short' },
      start: v, tasks: [T(v, 'sit', 999)] })),
    ...[0, 1, 2, 3, 4].map((i) => ({ local: true,
      o: i % 2 ? { dress: 'saree', k: 0.92, top: ['#c2185b', '#2e8b57', '#f2b705'][i % 3], bottom: ['#1e6fa8', '#7a2b6e', '#e0612b'][i % 3], veil: true, skin: '#80523a' }
        : { dress: 'dhoti', top: '#efe8d6', bottom: '#f4f1e8', headwear: 'turban', turban: ['#f2efe6', '#e07a1e', '#3f7a4a'][i % 3], mustache: true, skin: '#7a4c33' },
      start: P.shop[(i * 3) % P.shop.length],
      tasks: [0, 1, 2, 3, 4, 5].map((k) => T(P.shop[(i * 3 + k * 2 + 1) % P.shop.length], 'idle', 5 + k % 3 * 3, { walkProps: k > 2 ? ['bundle'] : [], walkAction: k > 2 ? 'carry' : 'walk' })),
      night: [T(P.square[i % 4], 'idle', 30)] })),
    // Marudhar: bright turbans and ghagra-odhni, water carried home from the baoli in stacked pots
    ...(P.rvHouse.length > 4 ? [
      { local: true, o: { dress: 'saree', k: 0.93, top: '#f2b705', bottom: '#d81b60', veil: true, skin: '#8a5a3c' },
        start: P.baoli[0], tasks: [T(P.baoli[0], 'draw', 10, { props: ['pot'] }), T(P.rvHouse[1], 'idle', 8, { walkProps: ['potHead'], walkAction: 'carry', props: ['potHead'] }), T(P.rvHouse[1], 'sweep', 12, { props: ['broom'] })] },
      { local: true, o: { dress: 'saree', k: 0.92, top: '#e0612b', bottom: '#2e3fa8', veil: true, skin: '#80523a' },
        start: P.rvHouse[3], tasks: [T(P.rvHouse[3], 'idle', 10), T(P.baoli[1], 'draw', 10, { props: ['pot'] }), T(P.rvHouse[3], 'idle', 6, { walkProps: ['potHead'], walkAction: 'carry', props: ['potHead'] })] },
      { local: true, o: { dress: 'dhoti', top: '#ffffff', bottom: '#f4f1e8', headwear: 'turban', turban: '#e8261e', mustache: true, skin: '#7a4c33' },
        start: P.chhatri, tasks: [T(P.chhatri, 'sit', 50), T(P.baoli[2], 'idle', 10), T(P.rvHouse[5], 'idle', 10)] },
      { local: true, o: { dress: 'dhoti', top: '#f4ead4', bottom: '#f4f1e8', headwear: 'turban', turban: '#f08a12', mustache: true, skin: '#6e4530', hair: '#d6d0c6' },
        start: P.baoli[3], tasks: [T(P.baoli[3], 'lean', 20, { props: ['stick'] }), T(P.rvHouse[7] || P.rvHouse[0], 'idle', 15, { walkProps: ['stick'] })] },
      { local: true, o: { dress: 'saree', k: 0.9, top: '#2e8b57', bottom: '#f2b705', veil: true, skin: '#86573b' },
        start: P.rvHouse[6] || P.rvHouse[0], tasks: [T(P.rvHouse[6] || P.rvHouse[0], 'sweep', 16, { props: ['broom'] }), T(P.baoli[0], 'idle', 8)] },
    ] : []),
    // Banglagram: white sarees with red borders, a fisherman at the pond, an old man at the temple
    ...(P.bvHouse.length > 4 ? [
      { local: true, o: { dress: 'saree', k: 0.92, top: '#c4241c', bottom: '#f6f2e8', veil: true, skin: '#86573b' },
        start: P.pondStep, tasks: [T(P.pondStep, 'wash', 30, { walkProps: ['bundle'], walkAction: 'carry', props: ['clothes'] }), T(P.bvHouse[1], 'idle', 12, { walkProps: ['bundle'], walkAction: 'carry' })] },
      { local: true, o: { dress: 'saree', k: 0.93, top: '#2e6b4a', bottom: '#f2ead8', veil: false, skin: '#80523a' },
        start: P.bvHouse[3], tasks: [T(P.bvHouse[3], 'sweep', 16, { props: ['broom'] }), T(P.bvTemple, 'pray', 10), T(P.bvHouse[3], 'idle', 8, { walkProps: ['potHead'], walkAction: 'carry', props: ['potHead'] })] },
      { local: true, o: { dress: 'dhoti', top: '#e8dcc4', bottom: '#f4f1e8', mustache: true, skin: '#7a4c33', sleeves: 'short' },
        start: P.pondEdge, tasks: [T(P.pondEdge, 'lean', 25, { props: ['stick'] }), T(P.bvHouse[5] || P.bvHouse[0], 'idle', 12, { walkProps: ['stick'] })] },
      { local: true, o: { dress: 'dhoti', top: '#ffffff', bottom: '#ffffff', mustache: true, skin: '#6f4834', hair: '#dcd6cc' },
        start: P.bvTemple, tasks: [T(P.bvTemple, 'pray', 20), T(P.bvHouse[0], 'idle', 20)] },
    ] : []),
    // Thennoor: veshti and towel on the shoulder, silk sarees, a kolam being drawn at the doorstep
    ...(P.tvHouse.length > 4 ? [
      { local: true, o: { dress: 'dhoti', top: '#ffffff', bottom: '#ffffff', mustache: true, skin: '#5f3a26', sleeves: 'short' },
        start: P.thinnai[0], tasks: [T(P.thinnai[0], 'sit', 60), T(P.tvTemple, 'pray', 10)] },
      { local: true, o: { dress: 'saree', k: 0.92, top: '#c2185b', bottom: '#2e8b57', veil: false, skin: '#6a4230' },
        start: P.tvHouse[2], tasks: [T(P.tvHouse[2], 'sweep', 14), T(P.tvTemple, 'pray', 12), T(P.tvHouse[2], 'idle', 8, { walkProps: ['potHead'], walkAction: 'carry', props: ['potHead'] })] },
      { local: true, o: { dress: 'saree', k: 0.93, top: '#f2b705', bottom: '#7a1f6e', veil: false, skin: '#6e4530' },
        start: P.tvHouse[6] || P.tvHouse[0], tasks: [T(P.tvHouse[6] || P.tvHouse[0], 'sweep', 12), T(P.tvHorse, 'pray', 8), T(P.tvHouse[6] || P.tvHouse[0], 'idle', 10)] },
      { local: true, o: { dress: 'dhoti', top: '#f4efe4', bottom: '#f6f2e8', skin: '#5a3624', mustache: true, sleeves: 'short' },
        start: P.tvTemple, tasks: [T(P.tvTemple, 'pray', 25), T(P.thinnai[1] || P.tvHouse[1], 'sit', 30)] },
    ] : []),
    // Vitthalwadi: white dhoti and Gandhi cap, nine-yard nauvari sarees, a priest at the deepmala
    ...(P.mhHouse.length > 3 ? [
      { local: true, o: { dress: 'dhoti', top: '#ffffff', bottom: '#ffffff', headwear: 'cap', turban: '#ffffff', mustache: true, skin: '#6e4530' },
        start: P.wada, tasks: [T(P.wada, 'sit', 50), T(P.mhTemple, 'pray', 12)] },
      { local: true, o: { dress: 'saree', k: 0.92, top: '#7a2b6e', bottom: '#2e8b57', veil: false, skin: '#80523a' },
        start: P.mhHouse[1], tasks: [T(P.mhHouse[1], 'sweep', 15, { props: ['broom'] }), T(P.mhTemple, 'pray', 10), T(P.mhHouse[1], 'idle', 8, { walkProps: ['potHead'], walkAction: 'carry', props: ['potHead'] })] },
      { local: true, o: { dress: 'dhoti', top: '#f6e8c8', bottom: '#f4f1e8', skin: '#5f3a26', mustache: true, sleeves: 'short' },
        start: P.deepmala, tasks: [T(P.deepmala, 'pray', 18), T(P.mhTemple, 'idle', 12)] },
      { local: true, o: { dress: 'saree', k: 0.93, top: '#c2185b', bottom: '#f2b705', veil: true, skin: '#86573b' },
        start: P.mhHouse[4] || P.mhHouse[0], tasks: [T(P.mhHouse[4] || P.mhHouse[0], 'idle', 12), T(P.deepmala, 'pray', 8), T(P.mhHouse[2] || P.mhHouse[0], 'idle', 10)] },
    ] : []),
    // the North-East: cream mekhela chador with red, the white-and-red gamosa, tea pluckers with baskets
    ...(P.neHouse.length > 3 ? [
      ...P.tea.map((tp, i) => ({ local: true, o: { dress: 'saree', k: 0.9, top: ['#c4241c', '#2e6b4a', '#f2b705'][i], bottom: '#efe4c8', veil: true, skin: '#a8805e' },
        start: tp, tasks: [T(tp, 'water', 30, { props: ['bundle'] }), T(P.tea[(i + 1) % 3], 'water', 25, { walkProps: ['bundle'], props: ['bundle'] })] })),
      { local: true, o: { dress: 'dhoti', top: '#f4f1e8', bottom: '#efe8d6', skin: '#a07a58', sleeves: 'short' },
        start: P.neHouse[0], tasks: [T(P.neHouse[0], 'idle', 14), T(P.neHouse[3], 'idle', 10)] },
      { local: true, o: { dress: 'saree', k: 0.92, top: '#c4241c', bottom: '#efe4c8', veil: false, skin: '#b08a68' },
        start: P.neHouse[2], tasks: [T(P.neHouse[2], 'sweep', 14, { props: ['broom'] }), T(P.neHouse[5] || P.neHouse[1], 'idle', 12)] },
    ] : []),
    // anglers along the river
    ...P.fishing.map((f, i) => ({ o: { dress: i % 2 ? 'pants' : 'dhoti', top: ['#e9dcc3', '#8fa6c4', '#f4f1e8', '#b9c7a5', '#efe8d6'][i], bottom: i % 2 ? '#4a4a52' : '#f4f1e8', headwear: i % 3 === 0 ? 'turban' : i % 3 === 1 ? 'cap' : undefined, turban: '#e07a1e', mustache: true, skin: ['#7a4c33', '#6e4530', '#83553a', '#5f3a26', '#86573b'][i], sleeves: 'short' },
      start: f, noGear: false, tasks: [T(f, 'fish', 600, { props: ['rod'] })] })),
    // Pahadi Gaon: Himachali caps with a coloured band, warm pattu shawls and headscarves
    ...(P.pgHouse.length > 3 ? [
      { local: true, o: { dress: 'pants', top: '#8a5a3a', bottom: '#3a3a42', headwear: 'cap', turban: '#2e6b4a', mustache: true, skin: '#a07a58' },
        start: P.pgTemple, tasks: [T(P.pgTemple, 'pray', 15), T(P.pgHouse[1], 'idle', 15)] },
      { local: true, o: { dress: 'saree', k: 0.92, top: '#7a2b2b', bottom: '#3a4a6a', veil: true, skin: '#b08a68' },
        start: P.pgHouse[2], tasks: [T(P.pgHouse[2], 'sweep', 14, { props: ['broom'] }), T(P.pgHouse[4] || P.pgHouse[0], 'idle', 10, { walkProps: ['hay'], walkAction: 'carry' })] },
      { local: true, o: { dress: 'pants', top: '#e8dcc4', bottom: '#5a4a3a', headwear: 'cap', turban: '#7a1f2b', skin: '#a8805e', mustache: true, sleeves: 'short' },
        start: P.pgHouse[5] || P.pgHouse[0], tasks: [T(P.pgHouse[5] || P.pgHouse[0], 'chop', 20, { props: ['axe'] }), T(P.pgTemple, 'idle', 8)] },
    ] : []),
    // the gardener with his watering can
    { o: { dress: 'dhoti', top: '#7a8a5a', bottom: '#e9e2d0', headwear: 'turban', turban: '#3f7a4a', skin: '#6f4834', sleeves: 'short' },
      start: P.garden[0], tasks: P.garden.map((g) => T(g, 'water', 14, { props: ['can'], walkProps: ['can'] })),
      night: [T(P.garden[0], 'idle', 30)] },
  ];

  const villagers = roster.map((r) => {
    const person = new Person(r.o);
    scene.add(person.root);
    const v = new Villager(person, r.tasks, r.start, r.night);
    v.noGear = !!r.noGear;
    v.local = !!r.local;
    const first = r.tasks[0];
    if (first.place === r.start) {
      v.task = first;
      v.idx = 1;
      v.timer = first.dur * (0.3 + Math.random() * 0.7);
      person.showOnly(first.props || []);
    } else v.task = { action: r.start.sit ? 'sit' : 'idle', place: r.start, props: [] };
    person.seatH = r.start.seatH ?? 0.55;
    return v;
  });

  const kids = buildSchool(scene);
  const rowers = [[-90, 110, 0], [190, 380, 60]].map(([z0, z1, s0]) => {
    const boat = new RowBoat();
    const person = new Person({ dress: 'dhoti', top: '#efe8d6', bottom: '#f4f1e8', headwear: 'turban', turban: '#ffffff', mustache: true, skin: '#6e4530', sleeves: 'short' }); person.noHit = true;
    boat.root.add(person.root);
    scene.add(boat.root);
    return { boat, person, z0, z1, z: z0 + s0, dir: 1, lane: (Math.random() - 0.5) * RIVER_HALF * 0.6, pause: 0 };
  });
  const travellers = buildTravellers(scene, hooks);
  const play = buildPlay(scene, village, hooks);

  const dogs = [
    new Dog('#c8945a', '#e8d2b0', false, { x: roadX(10) + 3, z: 10 }),
    new Dog('#5b4030', '#d9c6a8', true, { x: roadX(34) - 3, z: 34 }),
  ];
  // every other village has its own dog or two
  const DOGC = [['#d8a868', '#f2e2c8'], ['#3a3230', '#c8b8a0'], ['#a8744a', '#e8d4b8'], ['#e8e0d0', '#f6f2ea'], ['#6a4a32', '#d8c4a8']];
  [layout.nv, layout.rv, layout.bv, layout.tv, layout.mh, layout.ne, layout.pg, EH].forEach((v, i) => { if (v) dogs.push(new Dog(...DOGC[i % DOGC.length], false, { x: v.x + 6, z: v.z + 4 }, { x: v.x, z: v.z })); });
  for (const d of dogs) scene.add(d.root);

  return {
    villagers,
    dogs,
    setWeather(w) { for (const v of villagers) v.setWeather(w); kids.setWeather(w); travellers.setWeather(w); play.setWeather(w); },
    travellers,
    cricket: play.cricket,
    update(dt, boy) {
      for (const v of villagers) {
        if (v.local) {
          const far = Math.abs(v.p.x - boy.x) + Math.abs(v.p.z - boy.z) > 170;
          v.person.root.visible = !far;
          if (far) continue;
        }
        v.update(dt, boy);
      }
      kids.update(dt, boy);
      for (const r of rowers) {
        const far = Math.abs(r.z - boy.z) > 220;
        r.boat.root.visible = !far;
        if (far) continue;
        r.pause -= dt;
        const speed = r.pause > 0 ? 0 : 1.3;
        r.z += r.dir * speed * dt;
        if (r.z > r.z1 || r.z < r.z0) { r.dir *= -1; r.pause = 6; r.z = Math.max(r.z0, Math.min(r.z1, r.z)); }
        const x = riverX(r.z) + r.lane, xa = riverX(r.z + r.dir) + r.lane;
        r.boat.root.position.set(x, WATER_Y + WATER.off, r.z);
        r.boat.root.rotation.y = Math.atan2(xa - x, r.dir);
        r.boat.update(dt, speed, 0, true);
        poseRower(r.person, r.boat);
      }
      travellers.update(dt, boy);
      play.update(dt, boy);
      for (const d of dogs) d.update(dt, boy);
    },
    // people a vehicle can knock over
    hittables() {
      const o = [];
      for (const v of villagers) if (v.person.root.visible) o.push({ x: v.p.x, z: v.p.z, person: v.person });
      for (const t of travellers.list) if (t.kind === 'walker' && t.holder.visible) o.push({ x: t.p.x, z: t.p.z, person: t.person });
      return o;
    },
    colliders() {
      return [...villagers.filter((v) => !(v.person.fallT > 0)).map((v) => ({ kind: 'c', x: v.p.x, z: v.p.z, r: 0.28, person: true })), ...dogs.map((d) => ({ kind: 'c', x: d.p.x, z: d.p.z, r: 0.3 })), ...travellers.colliders()];
    },
  };
}

// ---------------- the school: kids at play, two on the swings, a teacher watching ----------------
function buildSchool(scene) {
  const S = layout.school;
  const yard = { x: S.x - 9, z: S.z };
  const lw = (lx, lz) => localToWorld(S, lx, lz);
  const uniforms = [
    { dress: 'shorts', top: '#f4f4f0', bottom: '#2a3a6a', sleeves: 'short' },
    { dress: 'saree', top: '#f4f4f0', bottom: '#2a3a6a', pallu: false, braids: true, veil: false },
  ];
  const skins = ['#8a5a3c', '#7a4c33', '#93603f', '#6f4834', '#86573b'];
  const kids = [];
  for (let i = 0; i < 9; i++) {
    const u = uniforms[i % 2];
    const p = new Person({ ...u, k: 0.6 + (i % 3) * 0.05, headScale: 1.26, skin: skins[i % skins.length] });
    scene.add(p.root);
    kids.push({ p, x: yard.x + (Math.random() - 0.5) * 8, z: yard.z + (Math.random() - 0.5) * 8, face: Math.random() * 6, target: null, wait: Math.random() * 2, speed: 0, role: i < 2 ? 'swing' : 'play', i });
  }
  const teacher = new Person({ dress: 'saree', k: 0.94, top: '#2f5f8f', bottom: '#3c7a9a', veil: false, skin: '#80523a' });
  scene.add(teacher.root);
  const tPos = lw(2, 4.6);
  // swing pivots
  const sw = lw(-5, 12);
  const swingRot = S.rot + Math.PI / 2;
  const seatOff = (lx) => ({ x: sw.x + lx * Math.cos(swingRot), z: sw.z - lx * Math.sin(swingRot) });
  const verandah = [-5, -3, -1, 1, 3, 5].map((lx) => lw(lx, 4.4));
  let mode = 'day';
  return {
    setWeather(w) { mode = w.night ? 'night' : w.rain ? 'rain' : 'day'; },
    update(dt, boy) {
      const far = Math.abs(boy.x - yard.x) + Math.abs(boy.z - yard.z) > 180;
      const show = mode !== 'night';
      teacher.root.visible = show;
      for (const k of kids) k.p.root.visible = show;
      if (!show || far) return;
      teacher.root.position.set(tPos.x, groundHeight(tPos.x, tPos.z), tPos.z);
      teacher.root.rotation.y = S.rot + Math.PI;
      teacher.update(dt, 0, 'idle');
      for (const k of kids) {
        let action = 'walk', speed = 0;
        if (k.role === 'swing' && mode === 'day') {
          const seat = seatOff(k.i === 0 ? -0.75 : 0.75);
          const a = Math.sin(k.p.t * 2.2) * 0.55;
          const L = 1.95;
          const fx = Math.sin(swingRot + Math.PI / 2), fz = Math.cos(swingRot + Math.PI / 2);
          const gy = heightAt(seat.x, seat.z);
          k.p.root.position.set(seat.x + fx * Math.sin(a) * L, gy + 2.5 - Math.cos(a) * L + 0.05, seat.z + fz * Math.sin(a) * L);
          k.p.root.rotation.set(0, swingRot + Math.PI / 2, 0);
          k.p.seatH = 0;
          k.p.update(dt, 0, 'swing');
          k.x = seat.x; k.z = seat.z;
          continue;
        }
        if (mode === 'rain') {
          // wait under the verandah till it stops
          const v = verandah[k.i % verandah.length];
          const d = Math.hypot(v.x - k.x, v.z - k.z);
          if (d > 0.3) { speed = 2.2; k.x += ((v.x - k.x) / d) * speed * dt; k.z += ((v.z - k.z) / d) * speed * dt; k.face = Math.atan2(v.x - k.x, v.z - k.z); }
          else { action = 'idle'; k.face = S.rot + Math.PI * (k.i % 2 ? 1 : 0.8); }
        } else {
          k.wait -= dt;
          if (!k.target || k.wait > 0) {
            if (k.wait <= 0) {
              const a = Math.random() * 6.28, r = Math.random() * 7;
              k.target = { x: yard.x + Math.cos(a) * r, z: yard.z + Math.sin(a) * r };
            } else action = k.i % 3 === 0 ? 'play' : 'idle';
          }
          if (k.target && k.wait <= 0) {
            const d = Math.hypot(k.target.x - k.x, k.target.z - k.z);
            if (d < 0.4) { k.target = null; k.wait = 0.5 + Math.random() * 2.5; }
            else {
              speed = 2.6 + (k.i % 2) * 0.5;
              const p = { x: k.x + ((k.target.x - k.x) / d) * speed * dt, z: k.z + ((k.target.z - k.z) / d) * speed * dt };
              resolveCollisions(p, 0.2, undefined, true);
              const bx = p.x - boy.x, bz = p.z - boy.z, bd = Math.hypot(bx, bz);
              if (bd < 0.6) { p.x = boy.x + (bx / bd) * 0.6; p.z = boy.z + (bz / bd) * 0.6; }
              k.x = p.x; k.z = p.z;
              k.face = Math.atan2(k.target.x - k.x, k.target.z - k.z);
            }
          }
        }
        k.speed += (speed - k.speed) * damp(dt, 8);
        k.p.root.position.set(k.x, groundHeight(k.x, k.z), k.z);
        k.p.root.rotation.y = k.face;
        k.p.setGear('none');
        k.p.update(dt, k.speed, action);
      }
    },
  };
}

// ---------------- travellers on the road: cyclists and a bullock cart ----------------
// out along a list of points (keeping to the left side of the road) and back again
// the shrine bus's finery: tall saffron pennants on the roof corners, a string of little flags along the roof,
// and a marigold garland swagged across the front, so it's known from a long way off
function shrineDress(veh) {
  const roof = 3.32, L = veh.len, W = veh.half * 2;
  const saffron = new THREE.MeshStandardMaterial({ color: '#f07a12', roughness: 0.8, side: THREE.DoubleSide });
  const pole = new THREE.MeshStandardMaterial({ color: '#d8c8a0', roughness: 0.6 });
  const tri = (w, h) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -h, 0, 0, -h / 2, -w], 3)); g.computeVertexNormals(); return g; };
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const ph = sz > 0 ? 1.5 : 1.1;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, ph, 6), pole); p.position.set(sx * (W / 2 - 0.15), roof + ph / 2, sz * (L / 2 - 0.5)); veh.root.add(p);
    const f = new THREE.Mesh(tri(0.9, 0.55), saffron); f.position.set(sx * (W / 2 - 0.15), roof + ph, sz * (L / 2 - 0.5)); veh.root.add(f);
  }
  // bunting along each side of the roof, between the poles
  const bunt = new THREE.MeshStandardMaterial({ color: '#f2b21a', roughness: 0.8, side: THREE.DoubleSide });
  const flag = new THREE.PlaneGeometry(0.22, 0.2);
  for (const sx of [1, -1]) for (let i = 0; i < 10; i++) {
    const z = -(L / 2 - 0.5) + ((L - 1) * (i + 0.5)) / 10, y = roof + 0.95 - Math.sin(((i + 0.5) / 10) * Math.PI) * 0.35;
    const f = new THREE.Mesh(flag, i % 2 ? saffron : bunt);
    f.position.set(sx * (W / 2 - 0.15), y - 0.1, z); f.rotation.y = Math.PI / 2; veh.root.add(f);
  }
  // the marigold garland: orange and yellow flowers in a swag across the front, under the windscreen
  const mari = [new THREE.MeshStandardMaterial({ color: '#f28a0e', roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#f6c21a', roughness: 0.9 })];
  const bead = new THREE.IcosahedronGeometry(0.075, 0);
  for (let i = 0; i <= 18; i++) {
    const u = i / 18, x = (u - 0.5) * (W - 0.2), y = 1.95 - Math.sin(u * Math.PI) * 0.35;
    const b = new THREE.Mesh(bead, mari[i % 2]); b.position.set(x, y, L / 2 + 0.06); veh.root.add(b);
  }
}
function polyLoop(points, off) {
  const P = points.map(([x, z]) => pt(x, z));
  const side = (list, o) => list.map((p, i) => {
    const a = list[Math.max(0, i - 1)], b = list[Math.min(list.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return pt(p.x + (dz / l) * o, p.z - (dx / l) * o);
  });
  const go = side(P, off), back = side([...P].reverse(), off);
  const pts = [...go, ...back];
  const seg = [0];
  for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const total = seg[seg.length - 1] + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
  const half = seg[go.length - 1];
  pts.push(pts[0]); seg.push(total);
  return {
    total, half, pts: go,
    at(s, out) {
      s = ((s % total) + total) % total;
      let lo = 0, hi = seg.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (seg[m] < s) lo = m; else hi = m; }
      const a = pts[lo], b = pts[hi], t = (s - seg[lo]) / (seg[hi] - seg[lo] || 1);
      out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
      return out;
    },
  };
}
function roadLoop(off) {
  const go = [];
  for (let z = -104; z <= NV.z - 3; z += 6) go.push(pt(roadX(z) + off, z));
  for (let x = roadX(NV.z) - 3; x > NV.x + 14; x -= 6) go.push(pt(x, NV.z - off));
  const back = [];
  for (let x = NV.x + 14; x < roadX(NV.z) - 3; x += 6) back.push(pt(x, NV.z + off));
  for (let z = NV.z - 3; z >= -104; z -= 6) back.push(pt(roadX(z) - off, z));
  const pts = [...go, pt(NV.x + 12, NV.z), ...back, pt(roadX(-106), -106)];
  const seg = [0];
  for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const total = seg[seg.length - 1] + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
  pts.push(pts[0]); seg.push(total);
  return {
    total,
    at(s, out) {
      s = ((s % total) + total) % total;
      let i = 1;
      while (i < seg.length - 1 && seg[i] < s) i++;
      const a = pts[i - 1], b = pts[i], t = (s - seg[i - 1]) / (seg[i] - seg[i - 1] || 1);
      out.x = a.x + (b.x - a.x) * t; out.z = a.z + (b.z - a.z) * t;
      return out;
    },
  };
}
// a bullock cart the boy can drive, parked: the same cart and pair of bullocks as on the roads (see addCart)
export function makeBullockCart(coat = '#ece6da') {
  const vroot = new THREE.Group();
  const cart = cartModel();
  cart.g.position.z = -2.2;
  vroot.add(cart.g);
  const bulls = [-0.55, 0.55].map((x) => { const c = makeCow(coat); c.g.position.set(x, 0, 2.0); c.g.scale.setScalar(0.92); vroot.add(c.g); return c; });
  return {
    kind: 'cart', root: vroot, driverSeat: new THREE.Vector3(0, 1.0, -1.35), seats: [], len: 6.6, half: 0.95, wheelR: 0.72,
    update(dt, speed) {
      for (const w of cart.wheels) w.rotation.x += (speed * dt) / 0.7;
      for (const b of bulls) {
        b.ph = (b.ph ?? Math.random() * 6) + speed * dt * 3.2;
        for (const [i, l] of b.legs.entries()) l.hip.rotation.x = Math.sin(b.ph + (i % 3 === 0 ? 0 : Math.PI)) * 0.3 * Math.min(1, Math.abs(speed));
        b.neck.rotation.x = 0.15 + Math.sin(b.ph * 2) * 0.04;
        b.tail.rotation.z = Math.sin(performance.now() * 0.002 + b.ph) * 0.3;
      }
    },
  };
}
function cartModel() {
  const g = new THREE.Group();
  const wood = mat('#7a5232'), dark = mat('#3e2b1d');
  part(new THREE.BoxGeometry(1.4, 0.08, 2.1), wood, g, 0, 0.95, 0);
  for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.06, 0.3, 2.1), dark, g, sx * 0.7, 1.12, 0);
  part(new THREE.SphereGeometry(0.55, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, 0.5, 1.5), mat('#c9a95e', 1), g, 0, 1.0, -0.15);
  const wheels = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sx * 0.9, 0.72, 0);
    g.add(w);
    part(new THREE.TorusGeometry(0.7, 0.05, 6, 22).rotateY(Math.PI / 2), dark, w);
    for (let k = 0; k < 8; k++) part(new THREE.BoxGeometry(0.04, 1.38, 0.05), wood, w).rotation.x = (k / 8) * Math.PI;
    part(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 10).rotateZ(Math.PI / 2), dark, w);
    wheels.push(w);
  }
  const pole = part(new THREE.BoxGeometry(0.12, 0.12, 2.4), wood, g, 0, 0.78, 2.1);
  pole.rotation.x = 0.12;
  part(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6).rotateZ(Math.PI / 2), wood, g, 0, 0.62, 3.1);
  return { g, wheels };
}
function buildTravellers(scene, hooks) {
  const list = [];
  const riders = [
    { o: { dress: 'dhoti', top: '#f1ece0', bottom: '#f4f1e8', headwear: 'turban', turban: '#ffffff', mustache: true, skin: '#6f4834' }, milk: true, v: 3.6, off: 1.2, s0: 0 },
    { o: { dress: 'pants', top: '#8fa6c4', bottom: '#3a3a42', skin: '#83553a', sleeves: 'short' }, v: 4.4, off: 1.0, s0: 180 },
    { o: { dress: 'saree', k: 0.92, top: '#7a2b6e', bottom: '#e0612b', veil: false, skin: '#80523a' }, v: 3.4, off: 1.3, s0: 360 },
    { o: { dress: 'shorts', k: 0.72, headScale: 1.2, top: '#f4f4f0', bottom: '#2a3a6a', skin: '#8a5a3c', sleeves: 'short' }, v: 4.8, off: 0.9, s0: 520, bag: true },
  ];
  for (const r of riders) {
    const holder = new THREE.Group();
    scene.add(holder);
    const bike = new Bicycle();
    holder.add(bike.root);
    const person = new Person(r.o); person.noHit = true;
    holder.add(person.root);
    if (r.milk) for (const sx of [-1, 1]) part(lathe([[0, 0], [0.12, 0], [0.13, 0.25], [0.08, 0.34], [0.06, 0.4]], 12), new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.8, roughness: 0.3 }), bike.frame, sx * 0.2, 0.3, -0.34);
    if (r.bag) part(new THREE.BoxGeometry(0.22, 0.26, 0.1), mat('#b8322b'), person.torso, 0, 0.3, -0.16);
    list.push({ kind: 'bike', holder, bike, person, loop: roadLoop(r.off), s: r.s0, v: r.v, speed: r.v, heading: 0, p: { x: 0, z: 0 }, bellCool: 0 });
  }
  // bullock carts creaking along, each with a farmer and his stick
  const addCart = (loop, s0, coat = '#ece6da', look = {}) => {
    const holder = new THREE.Group();
    scene.add(holder);
    const cart = cartModel();
    cart.g.position.z = -2.2;
    const vroot = new THREE.Group();
    vroot.add(cart.g);
    holder.add(vroot);
    const bulls = [-0.55, 0.55].map((x) => {
      const c = makeCow(coat);
      c.g.position.set(x, 0, 2.0);
      c.g.scale.setScalar(0.92);
      vroot.add(c.g);
      return c;
    });
    // the cart as a vehicle: its seat, size, and wheels and bullocks that move with its speed
    const veh = {
      kind: 'cart', root: vroot, driverSeat: new THREE.Vector3(0, 1.0, -1.35), seats: [], len: 6.6, half: 0.95, wheelR: 0.72,
      update(dt, speed) {
        for (const w of cart.wheels) w.rotation.x += (speed * dt) / 0.7;
        for (const b of bulls) {
          b.ph = (b.ph ?? Math.random() * 6) + speed * dt * 3.2;
          for (const [i, l] of b.legs.entries()) l.hip.rotation.x = Math.sin(b.ph + (i % 3 === 0 ? 0 : Math.PI)) * 0.3 * Math.min(1, Math.abs(speed));
          b.neck.rotation.x = 0.15 + Math.sin(b.ph * 2) * 0.04;
          b.tail.rotation.z = Math.sin(performance.now() * 0.002 + b.ph) * 0.3;
        }
      },
    };
    const driver = new Person({ dress: 'dhoti', top: '#e9dcc3', bottom: '#f0ebe0', headwear: 'turban', turban: '#e07a1e', mustache: true, skin: '#6e4530', sleeves: 'short', ...look }); driver.noHit = true;
    driver.seatH = 0;
    driver.root.position.set(0, 1.0, -1.1);
    cart.g.add(driver.root);
    driver.root.position.z = 0.85;
    driver.prop('stick', true);
    list.push({ kind: 'cart', holder, cart, bulls, veh, riders: [], person: driver, loop, s: s0, v: 1.15, speed: 1.15, heading: 0, p: { x: 0, z: 0 } });
  };
  addCart(roadLoop(1.6), 260);
  // the new roads out to the far villages: cyclists, motorbikes and scooters, and people walking
  const along = (z0, z1, step = 10) => { const o = []; for (let z = z0; Math.sign(z1 - z0) * (z1 - z) > 0; z += Math.sign(z1 - z0) * step) o.push([roadX(z), z]); return o; };
  const [B1, B2, B3] = BRIDGES;
  const routes = {
    east: [...along(40, 150), [roadX(150) + 2, 150], [40, 152], [B1.aw.x, B1.aw.z], [B1.w.x, B1.w.z], [B1.e.x, B1.e.z], [B1.ae.x, B1.ae.z], [150, 158], [210, 145], [313, 179], [RV.x - 16, RV.z]],
    south: [...along(0, -150), [roadX(-150) + 2, -150], [20, -175], [B2.aw.x, B2.aw.z], [B2.w.x, B2.w.z], [B2.e.x, B2.e.z], [B2.ae.x, B2.ae.z], [130, -228], [221, -286], [BV.x - 16, BV.z]],
    north: [...along(150, 250), [roadX(250) + 2, 250], [35, 328], [B3.aw.x, B3.aw.z], [B3.w.x, B3.w.z], [B3.e.x, B3.e.z], [B3.ae.x, B3.ae.z], [151, 390], [221, 456], [TV.x - 16, TV.z]],
    main: along(-100, 175, 8),
    west: [...along(20, 175), [roadX(178) - 2, 178], [NV.x + 12, NV.z], [NV.x - 14, NV.z - 2], [-206, 160], [-232, 95], [-238, 10], [-356, 0], [-511, -40], [-629, -79], [MH.x + 16, MH.z]],
    ne: [[BV.x - 16, BV.z], [BV.x + 4, BV.z - 14], [346, -443], [350, -618], [NE.x, NE.z + 16]],
  };
  // the long lanes out to the new villages by the ring line
  if (layout.newRoads?.khet) routes.khet = layout.newRoads.khet;
  if (layout.newRoads?.rann) routes.rann = layout.newRoads.rann;
  if (layout.newRoads?.outer) routes.outer = layout.newRoads.outer;
  if (layout.newRoads?.canal) { routes.canal = layout.newRoads.canal; routes.canalBank = layout.newRoads.canalBank; }
  // the two new roads in to the canal country, and the long runs from home along them (round the edge of
  // Marudhar's square, clear of its stepwell; through Khetpura)
  if (layout.newRoads?.nahar) {
    routes.nahar = layout.newRoads.nahar; routes.kheri = layout.newRoads.kheri;
    routes.busN = [...routes.east, [RV.x - 6, RV.z - 16], [RV.x + 10, RV.z - 14], ...layout.newRoads.nahar];
    if (routes.khet) routes.jeepK = [...routes.north, ...routes.khet, ...layout.newRoads.kheri];
  }
  // the far north road, Dhaniyapur to Kheri Kalan
  if (layout.newRoads?.dk) routes.dk = layout.newRoads.dk;
  // the shrine shuttle: from the village bus stop down the main road to the hilltop shrine, then all the way
  // up the hill road to the summit; it waits a while at each end and comes back
  routes.shrine = [...along(66, HILLTOP.z + 14, 10), ...SHRINE_ROAD.pts.map((q) => [q.x, q.z])];
  // the buses and jeeps take longer runs, linking several villages
  routes.busA = [...along(30, 150), [roadX(150) + 2, 150], [40, 152], [B1.aw.x, B1.aw.z], [B1.w.x, B1.w.z], [B1.e.x, B1.e.z], [B1.ae.x, B1.ae.z], [150, 158], [210, 145], [313, 179], [RV.x - 16, RV.z], [RV.x - 6, RV.z - 16], [326, -181], [BV.x + 14, BV.z + 6], [BV.x - 16, BV.z], [221, -286], [130, -228], [B2.ae.x, B2.ae.z], [B2.e.x, B2.e.z], [B2.w.x, B2.w.z], [B2.aw.x, B2.aw.z], [20, -175], [roadX(-150) + 2, -150], ...along(-150, 10)];
  routes.busB = routes.west;
  routes.jeepA = [...along(60, 250), [roadX(250) + 2, 250], [35, 328], [B3.aw.x, B3.aw.z], [B3.w.x, B3.w.z], [B3.e.x, B3.e.z], [B3.ae.x, B3.ae.z], [151, 390], [221, 456], [TV.x - 16, TV.z], [TV.x + 12, TV.z], [TV.x + 28, TV.z + 8], [345, 345], [RV.x - 6, RV.z + 16]];
  routes.jeepB = [...along(0, -150), [roadX(-150) + 2, -150], [20, -175], [B2.aw.x, B2.aw.z], [B2.w.x, B2.w.z], [B2.e.x, B2.e.z], [B2.ae.x, B2.ae.z], [130, -228], [221, -286], ...routes.ne];
  // every route crosses the railway square on, the way the roads were laid (see squareCrossings in world.js)
  for (const k of Object.keys(routes)) squareCrossings(routes[k]);
  const motorRiders = [
    { route: 'east', kind: Moped, o: { dress: 'pants', top: '#c8323a', bottom: '#3a3a42', skin: '#7a4c33', sleeves: 'short', mustache: true }, v: 8, s0: 30 },
    { route: 'south', kind: Scooter, o: { dress: 'saree', k: 0.92, top: '#1e6fa8', bottom: '#f2b705', veil: false, skin: '#80523a' }, v: 7, s0: 90 },
    { route: 'north', kind: Moped, o: { dress: 'pants', top: '#f2efe6', bottom: '#5b5246', skin: '#6f4834', sleeves: 'short', mustache: true, headwear: 'cap', turban: '#f2efe6' }, v: 8.5, s0: 50 },
    { route: 'east', kind: Scooter, o: { dress: 'pants', top: '#8fa6c4', bottom: '#2a2a32', skin: '#83553a', sleeves: 'short' }, v: 7.5, s0: 260 },
    { route: 'south', kind: Bicycle, o: { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', skin: '#6e4530', headwear: 'turban', turban: '#e07a1e', mustache: true }, v: 3.8, s0: 200 },
    { route: 'north', kind: Bicycle, o: { dress: 'shorts', k: 0.72, headScale: 1.2, top: '#e0612b', bottom: '#2a3a6a', skin: '#8a5a3c', sleeves: 'short' }, v: 4.4, s0: 120 },
    { route: 'east', kind: Bicycle, o: { dress: 'saree', k: 0.92, top: '#2e8b57', bottom: '#c2185b', veil: false, skin: '#86573b' }, v: 3.4, s0: 150 },
    ...(routes.khet ? [{ route: 'khet', kind: Moped, o: { dress: 'kurta', top: '#f4f2ec', bottom: '#f4f1e8', skin: '#7a4c33', beard: true, mustache: true, headwear: 'turban', turban: '#f2a41a' }, v: 8, s0: 200 }] : []),
    ...(routes.outer ? [{ route: 'outer', kind: Moped, o: { dress: 'kurta', top: '#c9d8e8', bottom: '#f4f1e8', skin: '#7f5238', mustache: true, headwear: 'cap', turban: '#f2efe6' }, v: 7.5, s0: 600 }, { route: 'outer', kind: Bicycle, o: { dress: 'dhoti', top: '#f4f1e8', bottom: '#2e8b57', skin: '#6e4530', sleeves: 'short', mustache: true }, v: 3.6, s0: 1500 }] : []),
    ...(routes.rann ? [{ route: 'rann', kind: Bicycle, o: { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', skin: '#6e4530', headwear: 'turban', turban: '#c4241c', mustache: true }, v: 3.8, s0: 300 }] : []),
    // out round the far villages and on the country roads
    ...(routes.outer ? [
      { route: 'outer', kind: Bicycle, o: { dress: 'shorts', k: 0.72, headScale: 1.2, top: '#2e8b57', bottom: '#2a3a6a', skin: '#8a5a3c', sleeves: 'short' }, v: 4.2 },
      { route: 'outer', kind: Scooter, o: { dress: 'saree', k: 0.92, top: '#f6f2e8', bottom: '#c4241c', veil: false, skin: '#80523a' }, v: 7 },
      { route: 'outer', kind: Bicycle, o: { dress: 'dhoti', top: '#e9dcc3', bottom: '#f4f1e8', skin: '#6f4834', mustache: true, sleeves: 'short' }, v: 3.6 },
    ] : []),
    ...(routes.khet ? [{ route: 'khet', kind: Bicycle, o: { dress: 'kurta', top: '#c9d8e8', bottom: '#f4f1e8', skin: '#7a4c33', beard: true, mustache: true, headwear: 'turban', turban: '#1e6fa8' }, v: 4 }] : []),
    ...(routes.rann ? [{ route: 'rann', kind: Moped, o: { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', skin: '#6e4530', headwear: 'turban', turban: '#ffffff', mustache: true }, v: 8 }] : []),
    // the canal country: cyclists along the bank track, motorbikes and a scooter on the road in from Noorpur
    ...(routes.canal ? [
      { route: 'canal', kind: Bicycle, o: { dress: 'kurta', top: '#f4f2ec', bottom: '#f4f1e8', skin: '#7a4c33', mustache: true, headwear: 'turban', turban: '#f2a41a' }, v: 4.2 },
      { route: 'canal', kind: Bicycle, o: { dress: 'shorts', k: 0.72, headScale: 1.2, top: '#ffffff', bottom: '#1e3a6a', skin: '#8a5a3c', sleeves: 'short' }, v: 4.6 },
      { route: 'canal', kind: Bicycle, o: { dress: 'saree', k: 0.92, top: '#e85fc8', bottom: '#7a2b6e', veil: false, skin: '#86573b' }, v: 3.5 },
      { route: 'canal', kind: Moped, o: { dress: 'pants', top: '#8fa6c4', bottom: '#2a2a32', skin: '#83553a', sleeves: 'short', mustache: true }, v: 8 },
      { route: 'canal', kind: Moped, o: { dress: 'kurta', top: '#c9d8e8', bottom: '#f4f1e8', skin: '#7f5238', beard: true, headwear: 'turban', turban: '#1e6fa8' }, v: 7.5 },
      { route: 'canal', kind: Scooter, o: { dress: 'saree', k: 0.92, top: '#f2b705', bottom: '#c4241c', veil: false, skin: '#80523a' }, v: 7 },
      { route: 'canalBank', kind: Bicycle, o: { dress: 'dhoti', top: '#e9dcc3', bottom: '#f4f1e8', skin: '#6f4834', mustache: true, sleeves: 'short' }, v: 3.8 },
      { route: 'canalBank', kind: Bicycle, o: { dress: 'pants', top: '#c8323a', bottom: '#3a3a42', skin: '#7a4c33', sleeves: 'short' }, v: 4.4 },
      { route: 'canalBank', kind: Moped, o: { dress: 'pants', top: '#f2efe6', bottom: '#5b5246', skin: '#6f4834', sleeves: 'short', headwear: 'cap', turban: '#f2efe6' }, v: 7.5 },
    ] : []),
    ...(routes.nahar ? [
      { route: 'nahar', kind: Moped, o: { dress: 'pants', top: '#2e8b57', bottom: '#3a3a42', skin: '#7a4c33', sleeves: 'short', mustache: true }, v: 8.5 },
      { route: 'nahar', kind: Scooter, o: { dress: 'saree', k: 0.92, top: '#e85fc8', bottom: '#7a2b6e', veil: false, skin: '#86573b' }, v: 7.5 },
      { route: 'nahar', kind: Bicycle, o: { dress: 'kurta', top: '#e9dcc3', bottom: '#f4f1e8', skin: '#6f4834', headwear: 'turban', turban: '#e07a1e', mustache: true }, v: 4 },
      { route: 'nahar', kind: Bicycle, o: { dress: 'shorts', k: 0.72, headScale: 1.2, top: '#1e6fa8', bottom: '#2a3a6a', skin: '#8a5a3c', sleeves: 'short' }, v: 4.5 },
      { route: 'kheri', kind: Moped, o: { dress: 'kurta', top: '#c9d8e8', bottom: '#f4f1e8', skin: '#7f5238', beard: true, headwear: 'turban', turban: '#c4241c' }, v: 8 },
      { route: 'kheri', kind: Bicycle, o: { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', skin: '#6e4530', headwear: 'cap', turban: '#f2efe6' }, v: 3.8 },
      { route: 'kheri', kind: Bicycle, o: { dress: 'saree', k: 0.92, top: '#f2b705', bottom: '#c4241c', veil: false, skin: '#80523a' }, v: 3.6 },
    ] : []),
    // the far north road: a motorbike, a scooter, two cyclists
    ...(routes.dk ? [
      { route: 'dk', kind: Moped, o: { dress: 'kurta', top: '#e9dcc3', bottom: '#f4f1e8', skin: '#7a4c33', mustache: true, headwear: 'turban', turban: '#e07a1e' }, v: 8.5 },
      { route: 'dk', kind: Scooter, o: { dress: 'saree', k: 0.92, top: '#2e8b57', bottom: '#f2b705', veil: false, skin: '#86573b' }, v: 7.5 },
      { route: 'dk', kind: Bicycle, o: { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', skin: '#6e4530', headwear: 'cap', turban: '#f2efe6', mustache: true }, v: 3.8 },
      { route: 'dk', kind: Bicycle, o: { dress: 'shorts', k: 0.72, headScale: 1.2, top: '#c4241c', bottom: '#2a3a6a', skin: '#8a5a3c', sleeves: 'short' }, v: 4.4 },
    ] : []),
    // the postmen on their rounds: khaki, a cap, a satchel, a red India Post bag on the carrier
    { route: 'west', kind: Bicycle, post: true, o: { dress: 'pants', top: '#b8a06a', bottom: '#8a7448', headwear: 'cap', turban: '#b8a06a', mustache: true, skin: '#7a4c33', sleeves: 'short' }, v: 3.6 },
    { route: 'east', kind: Bicycle, post: true, o: { dress: 'pants', top: '#b8a06a', bottom: '#8a7448', headwear: 'cap', turban: '#b8a06a', skin: '#6e4530', sleeves: 'short' }, v: 3.6 },
    ...(routes.canal ? [{ route: 'canal', kind: Bicycle, post: true, o: { dress: 'pants', top: '#b8a06a', bottom: '#8a7448', headwear: 'cap', turban: '#b8a06a', mustache: true, skin: '#83553a', sleeves: 'short' }, v: 3.8 }] : []),
    { route: 'ne', kind: Moped, o: { dress: 'pants', top: '#e0612b', bottom: '#3a3a42', skin: '#7a4c33', sleeves: 'short' }, v: 8 },
    { route: 'ne', kind: Bicycle, o: { dress: 'saree', k: 0.92, top: '#1e6fa8', bottom: '#f2b705', veil: false, skin: '#86573b' }, v: 3.4 },
    { route: 'west', kind: Scooter, o: { dress: 'pants', top: '#f2efe6', bottom: '#4a4a52', skin: '#83553a', sleeves: 'short', mustache: true }, v: 7.5 },
    { route: 'west', kind: Bicycle, o: { dress: 'dhoti', top: '#dfe6ea', bottom: '#f4f1e8', skin: '#6e4530', headwear: 'cap', turban: '#f2efe6' }, v: 3.8 },
  ];
  for (const r of motorRiders) {
    const holder = new THREE.Group();
    scene.add(holder);
    const bike = new r.kind();
    consolidate(bike.root);
    holder.add(bike.root);
    const person = new Person(r.o); person.noHit = true;
    holder.add(person.root);
    if (r.post) {
      // the mail bag strapped on behind, and a satchel on the hip
      const bagT = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#c4241c'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#f2d23a'; g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.fillText('INDIA POST', 64, 28); g.font = '16px Arial'; g.fillText('डाक', 64, 50); return c; })());
      bagT.colorSpace = THREE.SRGBColorSpace;
      part(new THREE.BoxGeometry(0.36, 0.28, 0.42), new THREE.MeshStandardMaterial({ map: bagT, roughness: 0.8 }), bike.root, 0, 0.98, -0.5);
      part(new THREE.BoxGeometry(0.22, 0.24, 0.08), mat('#6a4a2a'), person.torso, 0.18, 0.12, 0.02);
    }
    const loop = polyLoop(routes[r.route], 1.2);
    list.push({ kind: 'bike', motor: r.kind !== Bicycle, holder, bike, person, loop, s: ((motorRiders.indexOf(r) * 0.618 + 0.11) % 1) * loop.total, v: r.v, speed: r.v, heading: 0, p: { x: 0, z: 0 }, bellCool: 0 });
  }
  const walkers = [
    { route: 'east', o: { dress: 'saree', k: 0.93, top: '#d4a017', bottom: '#b3202c', veil: true, skin: '#80523a' }, carry: 'potHead', s0: 40 },
    { route: 'east', o: { dress: 'dhoti', top: '#efe8d6', bottom: '#f4f1e8', headwear: 'turban', turban: '#ffffff', mustache: true, skin: '#6f4834', hair: '#dcd6cc' }, stick: true, s0: 210 },
    { route: 'south', o: { dress: 'dhoti', top: '#dfe6ea', bottom: '#efece4', headwear: 'turban', turban: '#c0392b', mustache: true, skin: '#7a4a30' }, carry: 'hay', s0: 60 },
    { route: 'south', o: { dress: 'saree', k: 0.92, top: '#c4241c', bottom: '#f6f2e8', veil: true, skin: '#86573b' }, carry: 'bundle', s0: 230 },
    { route: 'north', o: { dress: 'saree', k: 0.92, top: '#7a2b6e', bottom: '#2e8b57', veil: false, skin: '#6a4230' }, s0: 80 },
    { route: 'north', o: { dress: 'pants', top: '#b9c7a5', bottom: '#5b5246', skin: '#7a4a30', sleeves: 'short' }, carry: 'bundle', s0: 200 },
    { route: 'east', o: { dress: 'shorts', k: 0.66, headScale: 1.25, top: '#f4f4f0', bottom: '#2a3a6a', skin: '#8a5a3c', sleeves: 'short' }, s0: 100, kid: true },
  ];
  // more folk on foot: off to the market, the fields, the next village
  const SHIRTS = ['#efe8d6', '#dfe6ea', '#b9c7a5', '#8fa6c4', '#e9dcc3', '#c9b27a', '#f4f1e8'];
  const SAREES = [['#d4a017', '#b3202c'], ['#3c6e47', '#2e8b57'], ['#7a2b6e', '#c2185b'], ['#c4241c', '#f6f2e8'], ['#1e6fa8', '#f2b705'], ['#e0612b', '#2e3fa8']];
  const extra = ['main', 'main', 'main', 'west', 'west', 'west', 'west', 'ne', 'ne', 'ne', 'east', 'east', 'east', 'south', 'south', 'south', 'north', 'north', 'north'];
  if (routes.khet) extra.push('khet', 'khet', 'khet');
  if (routes.rann) extra.push('rann', 'rann', 'rann');
  if (routes.outer) extra.push('outer', 'outer', 'outer', 'outer', 'outer', 'outer', 'outer');
  if (routes.nahar) extra.push('nahar', 'nahar', 'nahar', 'nahar', 'kheri', 'kheri', 'kheri');
  if (routes.canal) extra.push('canal', 'canal', 'canal', 'canal', 'canal', 'canal', 'canalBank', 'canalBank', 'canalBank', 'canalBank');
  extra.forEach((route, i) => {
    const female = i % 2 === 0;
    const [top, bottom] = SAREES[i % SAREES.length];
    const o = female ? { dress: 'saree', k: 0.9 + (i % 3) * 0.02, top, bottom, veil: i % 4 === 0, skin: ['#80523a', '#86573b', '#7a4c33', '#6a4230'][i % 4] }
      : { dress: ['dhoti', 'pants', 'dhoti'][i % 3], top: SHIRTS[i % SHIRTS.length], bottom: ['#f4f1e8', '#4a4a52', '#efece4'][i % 3], headwear: ['turban', 'cap', undefined][i % 3], turban: ['#e07a1e', '#f2efe6', '#c0392b', '#ffffff'][i % 4], mustache: i % 3 !== 2, skin: ['#7d4f33', '#6e4530', '#83553a', '#5f3a26'][i % 4], sleeves: i % 2 ? 'short' : undefined };
    walkers.push({ route, o, carry: [null, 'potHead', 'bundle', null, 'hay', null][i % 6], stick: !female && i % 5 === 1, s0: (i * 97) % 600 });
  });
  // folk coming and going at every small village: along its lanes, through the square, and out (to the
  // station, or the next lane); after dark only one of them is still about, with a lantern
  for (const [vi, V] of (layout.villageWalks ?? []).entries()) {
    const key = 'v_' + vi;
    routes[key] = V.pts;
    const n = 3 + (vi % 2);
    for (let i = 0; i < n; i++) {
      const female = (i + vi) % 2 === 0;
      const [top, bottom] = SAREES[(i + vi) % SAREES.length];
      const o = female ? { dress: 'saree', k: 0.9 + (i % 3) * 0.02, top, bottom, veil: i % 2 === 0, skin: ['#80523a', '#86573b', '#7a4c33', '#6a4230'][(i + vi) % 4] }
        : i === 3 ? { dress: 'shorts', k: 0.68, headScale: 1.24, top: SHIRTS[vi % SHIRTS.length], bottom: '#2a3a6a', skin: '#8a5a3c', sleeves: 'short' }
        : { dress: ['dhoti', 'pants', 'kurta'][(i + vi) % 3], top: SHIRTS[(i * 3 + vi) % SHIRTS.length], bottom: ['#f4f1e8', '#4a4a52', '#efece4'][i % 3], headwear: ['turban', 'cap', undefined][(i + vi) % 3], turban: ['#e07a1e', '#f2efe6', '#c0392b', '#ffffff'][(i + vi) % 4], mustache: true, skin: ['#7d4f33', '#6e4530', '#83553a', '#5f3a26'][(i + vi) % 4], sleeves: i % 2 ? 'short' : undefined };
      walkers.push({ route: key, o, carry: [null, 'potHead', 'bundle', null][(i + vi) % 4], s0: 0, frac: (i + 0.3) / n, kid: o.dress === 'shorts', nightStay: i === 0 });
    }
  }
  for (const w of walkers) {
    const person = new Person(w.o);
    scene.add(person.root);
    if (w.carry) person.prop(w.carry, true);
    if (w.stick) person.prop('stick', true);
    const loop = polyLoop(routes[w.route], 2.0);
    // after dark the lanes empty: on the long roads only one walker in four is still out, at each village only one
    const wi = walkers.indexOf(w);
    const nightHide = w.nightStay !== undefined ? !w.nightStay : wi % 4 !== 0;
    list.push({ kind: 'walker', holder: person.root, person, carry: w.carry, loop, s: (w.frac !== undefined ? w.frac : (wi * 0.618 + 0.37) % 1) * loop.total, v: w.kid ? 1.6 : 1.1 + Math.random() * 0.2, speed: 1, heading: 0, p: { x: 0, z: 0 }, nightHide });
  }
  // what the map calls each bus and jeep
  const JEEP_RUN = { jeepA: 'Gaon – Thennoor', jeepB: 'Gaon – Bamboo hill', outer: 'the outer road', rann: 'the Rann road', khet: 'the khet road', jeepK: 'Gaon – Kheri Kalan', west: 'the west road', dk: 'Dhaniyapur – Kheri Kalan' };
  const title = (w) => w.toLowerCase().split('-').map((x) => x[0].toUpperCase() + x.slice(1)).join(' – ');
  const trafficName = (tr) => tr.Kind === VillageBus ? `Bus · ${title(tr.opt.dest?.[1] ?? 'GAON')}` : tr.Kind === Jeep ? `Jeep · ${JEEP_RUN[tr.route] ?? 'country roads'}` : 'Car';
  // buses and jeeps: a driver at the wheel and passengers aboard, pausing at each end of the run
  const traffic = [
    { Kind: VillageBus, opt: { color: '#b8322b', band: '#e8e2d0', dest: ['गाँव – मारुधर – बंगलाग्राम', 'GAON-MARUDHAR'] }, route: 'busA', v: 7.5, s0: 0 },
    { Kind: VillageBus, opt: { color: '#2e6aa8', band: '#f2e6c8', dest: ['गाँव – छोटा गाँव – विट्ठलवाडी', 'GAON-VITTHALWADI'] }, route: 'busB', v: 7, s0: 200 },
    { Kind: Jeep, opt: { color: '#f2efe6' }, route: 'jeepA', v: 9, s0: 50 },
    { Kind: Jeep, opt: { color: '#4a5a3a' }, route: 'jeepB', v: 9.5, s0: 120 },
    // out to the far villages, unhurried
    ...(routes.outer ? [{ Kind: Jeep, opt: { color: '#2e4a6a' }, route: 'outer', v: 8, s0: 900 }] : []),
    ...(routes.rann ? [{ Kind: Jeep, opt: { color: '#8a2a22' }, route: 'rann', v: 8, s0: 200 }] : []),
    // cars, another jeep and a bus out on the far roads
    ...(routes.outer ? [{ Kind: TrafficCar, opt: { color: '#e8e6e0' }, route: 'outer', v: 10, frac: 0.5 }, { Kind: VillageBus, opt: { color: '#2e7a4a', band: '#f2e6c8', dest: ['धनियापुर – नदीपार – पत्थरगाँव', 'DHANIYAPUR-NADIPAR'] }, route: 'outer', v: 7, frac: 0.15 }] : []),
    ...(routes.khet ? [{ Kind: TrafficCar, opt: { color: '#c0392b' }, route: 'khet', v: 10, frac: 0.6 }, { Kind: Jeep, opt: { color: '#3a5a8a' }, route: 'khet', v: 8.5, frac: 0.2 }] : []),
    // the long runs out to the canal country: a bus to Naharpur, a jeep to Kheri Kalan, a car on the high road
    ...(routes.busN ? [{ Kind: VillageBus, opt: { color: '#1f7a7a', band: '#f4e6b8', dest: ['गाँव – मारुधर – नहरपुर', 'GAON-NAHARPUR'] }, route: 'busN', v: 7.5, frac: 0.3 }] : []),
    ...(routes.jeepK ? [{ Kind: Jeep, opt: { color: '#b0402a' }, route: 'jeepK', v: 8.5, frac: 0.55 }] : []),
    ...(routes.nahar ? [{ Kind: TrafficCar, opt: { color: '#f2efe6' }, route: 'nahar', v: 10, frac: 0.2 }] : []),
    { Kind: TrafficCar, opt: { color: '#2a5aa8' }, route: 'ne', v: 9.5, frac: 0.4 },
    { Kind: Jeep, opt: { color: '#c9a95e' }, route: 'west', v: 8.5, frac: 0.7 },
    // the far north road: a bus between the two villages, a jeep
    ...(routes.dk ? [{ Kind: VillageBus, opt: { color: '#5a3a7a', band: '#f2e2c0', dest: ['धनियापुर – खेड़ी कलां', 'DHANIYAPUR-KHERI'] }, route: 'dk', v: 7.5, frac: 0.25 }, { Kind: Jeep, opt: { color: '#e8e2d0' }, route: 'dk', v: 8.5, frac: 0.7 }] : []),
    // the police on patrol: round the main village and out over the bridge to Marudhar and Banglagram
    { Kind: PoliceJeep, opt: {}, route: 'busA', v: 8, frac: 0.55, police: true, allNight: true, icon: '🚓', label: 'Police patrol' },
    // the shrine shuttle runs from morning to night
    // (two of them: one leaves the village bus stop as the other leaves the summit, so there's always one on the
    // hill road; saffron flags on the roof and a marigold garland across the front)
    ...[0, 0.5].map((frac) => ({ Kind: VillageBus, opt: { color: '#e07a1e', band: '#fff2d0', dest: ['शिखर मंदिर – गाँव', 'SHIKHAR MANDIR'], name: ['मंदिर सेवा', 'MANDIR SEVA'] }, route: 'shrine', v: 9, frac, stopWait: 22, allNight: true, shrine: true, icon: '🛕', label: 'Mandir Seva — the shrine bus' })),
  ];
  for (const tr of traffic) {
    const holder = new THREE.Group();
    scene.add(holder);
    const veh = new tr.Kind(tr.opt);
    if (tr.shrine) shrineDress(veh);
    consolidate(veh.root); // fixed parts merged by material: far fewer draws
    holder.add(veh.root);
    const driver = tr.police ? new Person({ dress: 'pants', top: '#bfa26a', bottom: '#a88c58', headwear: 'cap', turban: '#3a3a5a', mustache: true, skin: '#6e4530', sleeves: 'short' })
      : new Person({ dress: 'pants', top: tr.Kind === VillageBus ? '#8a9aa8' : '#e9dcc3', bottom: '#4a4a52', mustache: true, skin: '#6e4530', sleeves: 'short', headwear: tr.Kind === Jeep ? 'cap' : undefined, turban: '#f2efe6' });
    driver.noHit = true;
    driver.seatH = 0;
    driver.root.position.copy(veh.driverSeat);
    holder.add(driver.root);
    const riders = veh.seats.map((p, i) => {
      if (tr.police && i > 0) return null;
      const q = tr.police ? new Person({ dress: 'pants', top: '#bfa26a', bottom: '#a88c58', headwear: 'cap', turban: '#3a3a5a', skin: '#7a4c33', sleeves: 'short' }) : new Person(i % 2 ? { dress: 'saree', k: 0.92, top: SAREES[i % 6][0], bottom: SAREES[i % 6][1], veil: true, skin: '#80523a' } : { dress: 'dhoti', top: SHIRTS[i % 7], bottom: '#f4f1e8', headwear: i % 4 ? 'turban' : undefined, turban: '#e07a1e', mustache: true, skin: '#7a4c33' }); q.noHit = true;
      q.seatH = 0;
      q.root.position.copy(p);
      holder.add(q.root);
      return q;
    }).filter(Boolean);
    const loop = polyLoop(routes[tr.route], tr.Kind === VillageBus ? 1.8 : 1.5);
    list.push({ kind: tr.Kind === VillageBus ? 'bus' : 'jeep', icon: tr.icon, label: tr.label ?? trafficName(tr), color: tr.opt.color ?? '#e8e2d0', track: tr.Kind === VillageBus || tr.Kind === Jeep || tr.Kind === PoliceJeep, holder, veh, person: driver, riders, loop, s: tr.frac !== undefined ? tr.frac * loop.total : tr.s0, v: tr.v, speed: tr.v, heading: 0, p: { x: 0, z: 0 }, wait: 0, pitch: 0, bellCool: 0, stopWait: tr.stopWait, nightOff: !tr.allNight && traffic.indexOf(tr) % 2 === 1 });
  }
  // more bullock carts out on the country roads, plodding at walking pace
  if (routes.outer) addCart(polyLoop(routes.outer, 1.6), 300, '#b98e64', { turban: '#c4241c', skin: '#7a4c33' });
  if (routes.outer) addCart(polyLoop(routes.outer, 1.6), 2200, '#d8cfc0', { headwear: 'cap', turban: '#f2efe6', top: '#dfe6ea' });
  if (routes.khet) addCart(polyLoop(routes.khet, 1.6), 150, '#ece6da', { turban: '#f2a41a', beard: true });
  if (routes.west) addCart(polyLoop(routes.west, 1.6), 400, '#8a6a4a', { turban: '#ffffff' });
  for (const [route, coat, look, frac] of [['ne', '#ece6da', { turban: '#2e8b57' }, 0.5], ['south', '#b98e64', { headwear: 'cap', turban: '#f2efe6' }, 0.6], ['north', '#d8cfc0', { turban: '#c4241c' }, 0.55], ['rann', '#ece6da', { turban: '#ffffff', top: '#f4f1e8' }, 0.4]]) {
    if (!routes[route]) continue;
    const loop = polyLoop(routes[route], 1.6);
    addCart(loop, frac * loop.total, coat, look);
  }
  list.forEach((t, i) => { t.idx = i; });
  let weather = { rain: false, night: false };
  const tmp = { x: 0, z: 0 }, ahead = { x: 0, z: 0 };
  // a quiet start: only cyclists, people on foot and the bullock cart are about at first. The motorbikes,
  // scooters, buses and jeeps join the roads one by one over the first several minutes of play.
  {
    let i = 0;
    for (const t of list) {
      const motor = (t.kind === 'bike' && t.motor) || t.kind === 'bus' || t.kind === 'jeep';
      if (!motor || t.icon) continue; // (the shrine bus and the police patrol are out from the start: they're on the map)
      t.hold = 40 + i * 14 + Math.random() * 10;
      t.holder.visible = false;
      i++;
    }
  }
  return {
    list,
    get night() { return weather.night; },
    setWeather(w) {
      weather = w;
      // after dark only one bus and one jeep keep running; the others wait in the village till morning
      for (const t of list) if ((t.nightOff || t.nightHide) && !t.taken) t.holder.visible = !w.night && !(t.hold > 0);
    },
    colliders() {
      return list.filter((t) => t.holder.visible && !t.taken && !((t.nightOff || t.nightHide) && weather.night) && !t.crash && !(t.kind === 'walker' && t.person.fallT > 0)).map((t) => ({ kind: 'b', x: t.p.x, z: t.p.z, rot: t.heading, hw: t.veh ? t.veh.half + 0.05 : t.kind === 'cart' ? 0.9 : 0.25, hd: t.veh ? t.veh.len / 2 : t.kind === 'cart' ? 2.6 : 0.8, person: t.kind === 'walker' }));
    },
    update(dt, boy) {
      const sizeOf = (t) => (t.veh ? t.veh.len / 2 : t.kind === 'cart' ? 2.6 : t.kind === 'walker' ? 0.3 : 0.9);
      const obstacles = hooks.obstacles?.() ?? [];
      for (const t of list) {
        const big = t.kind === 'bus' || t.kind === 'jeep';
        if (t.crash || t.taken) continue; // knocked over (the crash physics has it) or taken by the boy
        if (t.kind === 'walker' && t.person.fallT > 0) { t.person.update(dt, 0, 'idle'); continue; }
        if (t.hold > 0) {
          // not on the road yet; the clock only runs once the game has started, and nothing pops into view
          if (hooks.started?.()) t.hold -= dt;
          t.holder.visible = false;
          if (t.hold <= 0) {
            t.loop.at(t.s, tmp);
            if (Math.hypot(boy.x - tmp.x, boy.z - tmp.z) < 90) t.hold = 4;
            else t.holder.visible = !(t.nightOff && weather.night);
          }
          continue;
        }
        if ((t.nightOff || t.nightHide) && weather.night) { t.holder.visible = false; continue; }
        t.loop.at(t.s + (t.kind === 'cart' ? 3.5 : big ? t.veh.len / 2 + 3 : t.motor ? 4 : 1.6), ahead);
        // (looking ahead along its own line: if it has pulled over or out, that's where it's going)
        if (t.lat) { ahead.x += Math.cos(t.heading) * t.lat; ahead.z -= Math.sin(t.heading) * t.lat; }
        // the boy standing in the road: wait for him a moment (and toot), then go round him
        const boyBlock = !(t.squeezeT > 0) && Math.hypot(boy.x - ahead.x, boy.z - ahead.z) < (t.kind === 'cart' ? 2.4 : big ? 3.2 : t.motor ? 2.6 : 1.8);
        // (people on foot just wait a couple of seconds, then step round him)
        if (t.kind === 'walker') t.boyWait = boyBlock ? (t.boyWait ?? 0) + dt : 0;
        let blocked = boyBlock && !(t.kind === 'walker' && t.boyWait > 2);
        // and they brake for anyone on foot in the road ahead
        if (!blocked && t.kind !== 'walker' && hooks.personAhead?.(ahead.x, ahead.z, big ? 2.6 : 1.6)) {
          blocked = true;
          // held up by someone standing in the road: after a moment, a toot of the horn and they step aside
          t.honkT = (t.honkT ?? 0) + dt;
          if (t.honkT > 1.2) { t.honkT = -2.5; hooks.clearWay?.(t, ahead); if (t.kind !== 'cart') (t.motor || big ? hooks.onHorn : hooks.onBell)?.(Math.hypot(boy.x - ahead.x, boy.z - ahead.z), big ? t.kind : t.bike?.kind); }
        } else if ((t.honkT ?? 0) > 0) t.honkT = 0;
        // everyone waits at the level crossing while a train goes through
        if (hooks.trainNear?.(ahead.x, ahead.z)) blocked = true;
        // give way to other traffic: anything in our lane just ahead holds us up; overtake slower things
        // going our way when the road ahead is clear of oncoming traffic
        if (t.kind !== 'walker') {
          const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
          const reach = sizeOf(t) + 3.5 + t.speed * 0.6;
          let slowAhead = null, oncoming = false, blocker = boyBlock ? { x: boy.x, z: boy.z, boy: true } : null;
          const squeezing = t.squeezeT > 0;
          for (const o of list) {
            // (anything not out on the road yet has no position: it mustn't block anyone)
            if (o === t || o.crash || o.taken || o.hold > 0 || ((o.nightOff || o.nightHide) && weather.night)) continue;
            const dx = o.p.x - t.p.x, dz = o.p.z - t.p.z;
            const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
            const same = Math.sin(o.heading) * fx + Math.cos(o.heading) * fz > 0.3;
            if (!same && along > 0 && along < 30 && side < 4.5) oncoming = true;
            if (along <= 0 || along > reach + sizeOf(o) || side > (t.veh ? t.veh.half : 0.6) + (o.veh ? o.veh.half : 0.5) + 0.3 - (t.passT > 0 ? 2.6 : 0)) continue;
            if (o.kind === 'walker' && !same) continue; // walkers step aside for oncoming vehicles
            if (squeezing) continue; // already easing out round whatever was in the way
            // two stuck on each other (head-on, or nose to nose at a crossing): the one with right of way goes
            if (o.blocker === t && t.idx < o.idx) continue;
            if (same && o.v < t.v - 0.4) slowAhead = o;
            else { blocked = true; blocker = o.p; }
          }
          if (!squeezing) for (const ob of obstacles) {
            const dx = ob.x - t.p.x, dz = ob.z - t.p.z;
            const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
            if (along > 0 && along < reach + ob.r && side < (t.veh ? t.veh.half : 0.6) + ob.r) { blocked = true; blocker = ob; }
          }
          // held up by something that isn't moving off: after a couple of seconds, pull out to the side away
          // from it and creep past (whatever it is, a stopped bus, a parked scooter, a jam at a crossing)
          t.blocker = null;
          if (blocked && blocker) {
            t.blocker = list.find((o) => o.p === blocker) ?? null;
            t.stuckT = (t.stuckT ?? 0) + dt;
            if (blocker.boy && t.stuckT > 1 && !(t.tootT > 0)) { t.tootT = 6; if (t.kind !== 'cart') (t.motor || big ? hooks.onHorn : hooks.onBell)?.(Math.hypot(boy.x - t.p.x, boy.z - t.p.z), big ? t.kind : t.bike?.kind); }
            if (t.stuckT > 2.2) {
              const lx = Math.cos(t.heading), lz = -Math.sin(t.heading); // the direction t.lat moves in
              const b = (blocker.x - t.p.x) * lx + (blocker.z - t.p.z) * lz;
              t.squeezeSide = b > 0.2 ? -1 : b < -0.2 ? 1 : (t.idx % 2 ? 1 : -1);
              t.squeezeT = 4.5; t.stuckT = 0; blocked = false;
            }
          } else t.stuckT = 0;
          t.squeezeT = Math.max(0, (t.squeezeT ?? 0) - dt);
          t.tootT = Math.max(0, (t.tootT ?? 0) - dt);
          if (slowAhead) { if (!oncoming && !(t.passT > 0)) t.passT = 3.5; else if (!(t.passT > 0)) blocked = true; }
          t.passT = Math.max(0, (t.passT ?? 0) - dt);
          // swing out to pass, then tuck back in; or pull over to the side of the road when the boy honks behind
          t.yieldT = Math.max(0, (t.yieldT ?? 0) - dt);
          // A vehicle can only move sideways by steering while it rolls: the sideways speed is limited by how
          // fast it's going (none at all when stopped), eased in and out like a steering wheel, and the nose
          // turns into the move (see yawOff below) — no more sliding across the road.
          const latWant = t.yieldT > 0 ? 2.4 : t.squeezeT > 0 ? t.squeezeSide * 2.7 : t.passT > 0 ? -2.6 : 0;
          t.lat = t.lat ?? 0;
          const maxRate = Math.min(1.8, t.speed * (t.kind === 'bike' ? 0.5 : 0.42));
          const rateWant = Math.max(-maxRate, Math.min(maxRate, (latWant - t.lat) * 1.6));
          t.latV = (t.latV ?? 0) + (rateWant - (t.latV ?? 0)) * damp(dt, 3);
          t.latV = Math.max(-maxRate, Math.min(maxRate, t.latV)); // never faster sideways than the wheels allow
          t.lat += t.latV * dt;
        }
        // buses and jeeps pause at the villages at each end of their run
        if (big) {
          if (t.wait > 0) t.wait -= dt;
          for (const stop of [0, t.loop.half]) {
            const ds = (((t.s - stop) % t.loop.total) + t.loop.total) % t.loop.total;
            if (ds < t.speed * dt + 0.01 && t.wait <= 0 && t.lastStop !== stop) { t.wait = t.stopWait ?? 7; t.lastStop = stop; }
          }
        }
        // pulling over for a horn: keep rolling while easing across to the side, then slow right down there
        const yieldSp = Math.abs((t.lat ?? 0) - 2.4) > 0.4 ? t.v * 0.55 : t.v * 0.22;
        const target = blocked || t.wait > 0 ? 0 : t.yieldT > 0 ? yieldSp : t.squeezeT > 0 ? Math.min(t.v, 2.5 + t.v * 0.25) : t.v;
        t.speed += (target - t.speed) * damp(dt, blocked ? 6 : big ? 0.8 : 1.5);
        t.s += t.speed * dt;
        t.loop.at(t.s, tmp);
        t.loop.at(t.s + 1.2, ahead);
        const want = Math.atan2(ahead.x - tmp.x, ahead.z - tmp.z);
        const dh = ((want - t.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        t.heading += dh * damp(dt, 4);
        if (t.lat) { tmp.x += Math.cos(t.heading) * t.lat; tmp.z -= Math.sin(t.heading) * t.lat; }
        t.p.x = tmp.x; t.p.z = tmp.z;
        const far = Math.abs(tmp.x - boy.x) + Math.abs(tmp.z - boy.z) > 200;
        t.holder.visible = !far;
        if (far) continue;
        t.holder.position.set(tmp.x, groundHeight(tmp.x, tmp.z), tmp.z);
        // pointing the way it's really going: along the road, plus the angle of any sideways move
        const yawOff = t.latV ? Math.max(-0.45, Math.min(0.45, Math.atan2(t.latV, Math.max(t.speed, 0.8)))) : 0;
        t.holder.rotation.y = t.heading + yawOff;
        if (big) {
          t.veh.update(dt, t.speed, Math.max(-0.45, Math.min(0.45, dh * 6 + (t.latV ?? 0) * 0.5)), false, weather.night ? 1 : 0); // wheels into the bends (and into a pull-over); headlights on after dark
          // tilt with the road: on its wheels, or (no wheels to go by) along its length
          if (!onWheels(t, tmp.x, tmp.z, t.heading + yawOff, dt)) {
            const back = { x: 0, z: 0 }; t.loop.at(t.s - t.veh.len / 2, back);
            const hf = groundHeight(ahead.x, ahead.z), hb = groundHeight(back.x, back.z);
            t.pitch += (-Math.atan2(hf - hb, Math.hypot(ahead.x - back.x, ahead.z - back.z) || 1) - t.pitch) * damp(dt, 4);
            t.holder.rotation.set(t.pitch, t.heading + yawOff, 0, 'YXZ');
          }
          t.person.update(dt, 0, 'drive');
          for (const q of t.riders) q.update(dt, 0, 'sit');
          t.bellCool -= dt;
          if (blocked && t.bellCool <= 0) { t.bellCool = 3.5; hooks.onHorn?.(Math.hypot(boy.x - tmp.x, boy.z - tmp.z), t.kind); }
          continue;
        }
        if (t.kind === 'walker') {
          t.person.setGear(weather.rain ? 'umbrella' : weather.night ? 'lantern' : 'none');
          t.person.update(dt, t.speed, t.carry === 'potHead' || t.carry === 'hay' || t.carry === 'bundle' ? 'carry' : 'walk');
          continue;
        }
        if (t.kind === 'bike') {
          t.bike.update(dt, t.speed, dh * 0.8 + (t.latV ?? 0) * 0.25, true, weather.night ? 1 : 0);
          poseRider(t.person, t.bike, t.motor ? 0.18 : 0.3);
          t.person.head.rotation.y = Math.sin(performance.now() * 0.0004 + t.s) * 0.4;
          t.person.setGear(weather.rain ? 'umbrella' : weather.night ? 'lantern' : 'none');
          if (t.person.gear.mode !== 'none') { t.person.gear.pose(1); t.person.gear.update(dt); }
          t.bellCool -= dt;
          if (blocked && t.bellCool <= 0) { t.bellCool = 4; (t.motor ? hooks.onHorn : hooks.onBell)?.(Math.hypot(boy.x - tmp.x, boy.z - tmp.z), t.bike.kind); }
          if (t.motor) hooks.onEngine?.(t, Math.hypot(boy.x - tmp.x, boy.z - tmp.z));
        } else {
          t.veh.update(dt, t.speed);
          if (!onWheels(t, tmp.x, tmp.z, t.heading + yawOff, dt)) {
            // tilt with the road under the bullocks and the back of the cart
            const fr = { x: 0, z: 0 }, bk = { x: 0, z: 0 }; t.loop.at(t.s + 3.2, fr); t.loop.at(t.s - 3.2, bk);
            const hf = groundHeight(fr.x, fr.z), hb = groundHeight(bk.x, bk.z);
            t.pitch = (t.pitch ?? 0) + (-Math.atan2(hf - hb, 6.4) - (t.pitch ?? 0)) * damp(dt, 4);
            t.holder.rotation.set(t.pitch, t.heading + yawOff, 0, 'YXZ');
            t.holder.position.y = Math.max(t.holder.position.y, (hf + hb) / 2);
          }
          t.person.update(dt, 0, 'drive');
          t.person.setGear(weather.rain ? 'umbrella' : weather.night ? 'lantern' : 'none');
        }
      }
    },
  };
}

// ---------------- kids at play: a cricket match and a kite flyer ----------------
function buildPlay(scene, village, hooks) {
  const C = CRICKET;
  const lw = (lx, lz) => localToWorld(C, lx, lz);
  const kid = (o) => { const p = new Person({ k: 0.64 + Math.random() * 0.08, headScale: 1.24, ...o }); scene.add(p.root); return p; };
  const shirts = ['#e0612b', '#2e8b57', '#1e6fa8', '#f2b705', '#c2185b', '#7a2b6e', '#e9dcc3'];
  const boyKid = (i) => kid({ dress: 'shorts', top: shirts[i % shirts.length], bottom: ['#3f5a7a', '#5b5246', '#2a3a6a'][i % 3], skin: ['#8a5a3c', '#7a4c33', '#93603f'][i % 3], sleeves: 'short' });
  const bat = new THREE.Group();
  part(new THREE.BoxGeometry(0.1, 0.55, 0.025).translate(0, -0.42, 0.02), mat('#d9c08a'), bat);
  part(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6).translate(0, -0.06, 0.02), mat('#3a2a1a'), bat);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat('#d8e05a', 0.5));
  ball.castShadow = true;
  scene.add(ball);
  const R = {
    bat: boyKid(0), bowl: boyKid(1), keep: boyKid(2), f1: boyKid(3), f2: kid({ dress: 'saree', top: '#f2b705', bottom: '#c2185b', pallu: false, braids: true, skin: '#80523a' }),
  };
  R.bat.arms[1].hand.add(bat);
  const spots = { bat: [0.35, 8.4], bowl: [0, -13], keep: [0, 10.4], f1: [6, 1], f2: [-7, -3] };
  const st = {};
  for (const [k, p] of Object.entries(R)) st[k] = { p, home: lw(...spots[k]), x: 0, z: 0, face: 0, speed: 0, action: 'idle' };
  for (const k of Object.keys(st)) { st[k].x = st[k].home.x; st[k].z = st[k].home.z; }
  const face = (a, x, z) => Math.atan2(x - a.x, z - a.z);
  let phase = 'wait', T = 0, from = null, to = null, flight = 1, peak = 1, chaser = null, swingT = -1;
  const crease = lw(0, -9.6), batPt = lw(0.15, 8.2), stumps = lw(0, 9.0);
  const ballAt = (x, y, z) => ball.position.set(x, y, z);
  // ---- the boy joins in ----
  // A little match: he bats first (the kid batsman goes out to field) — Space to swing as the ball comes, A / D
  // to place the shot — three wickets or three overs; then he bowls (Space when the marker is in the middle of
  // the bar for a good ball) and the kids chase his score. H.boy says where he stands and what he's doing;
  // main.js puts him there and poses him.
  const H = { mode: null, innings: 1, runs: 0, balls: 0, wkts: 0, kRuns: 0, kBalls: 0, kWkts: 0, last: '', lastT: 0, pressK: -1, aim: 0, meter: 0, quality: 0.5, go: false,
    boy: { x: 0, z: 0, face: 0, speed: 0, anim: 'stance', swing: -1, bowl: -1 } };
  const boyBat = new THREE.Group();
  part(new THREE.BoxGeometry(0.1, 0.55, 0.025).translate(0, -0.42, 0.02), mat('#d9c08a'), boyBat);
  part(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6).translate(0, -0.06, 0.02), mat('#3a2a1a'), boyBat);
  H.bat = boyBat;
  const fieldSpot = { bat: lw(-6, 4), bowl: lw(7, -5) };
  const say = (text, kind) => { H.last = text; H.lastT = 2.6; hooks.onCricket?.(kind, text); };
  R.bat.poseHook = (P) => {
    if (H.mode === 'bat') return; // (he's out in the field while the boy bats)
    // stance: bat down by the right foot; swing: a big pull across the body
    const s = swingT >= 0 ? Math.min(1, swingT / 0.35) : 0;
    P.sh1 = -0.5 - Math.sin(s * Math.PI) * 1.4; P.shz1 = -0.35 + s * 0.6; P.el1 = -0.4;
    P.sh0 = -0.7 - Math.sin(s * Math.PI) * 1.2; P.shz0 = 0.5; P.el0 = -0.6;
    P.torsoY = -0.4 + s * 1.3; P.torsoX = 0.25; P.knee0 = P.knee1 = 0.2; P.headY = -0.6 + s * 0.6;
  };
  R.bat.poseRate = 16;
  R.bowl.poseHook = (P) => {
    if (H.mode === 'bowl') return;
    if (phase === 'bowl') { const a = Math.min(1, T / 0.35); P.sh1 = -0.5 - a * 3.6; P.el1 = -0.1; P.sh0 = -1.4 + a * 1.2; P.torsoX = 0.1 + a * 0.4; }
  };
  R.bowl.poseRate = 18;
  // what happens to a ball: runs off the bat, or out, or nothing
  const resolve = (x, z) => {
    let runs = 0, out = null;
    if (H.mode === 'bat') {
      const k = H.pressK;
      if (k >= 0.62 && k <= 1.04) {
        const q = Math.max(0, 1 - Math.abs(k - 0.86) / 0.2);
        runs = q > 0.8 ? 6 : q > 0.58 ? 4 : q > 0.36 ? 2 : 1;
        if ((runs === 6 && Math.random() < 0.1) || (q < 0.25 && Math.random() < 0.35)) out = 'caught';
      } else if (Math.random() < 0.42) out = 'bowled';
    } else if (H.mode === 'bowl') {
      const q = H.quality, r = Math.random();
      if (q > 0.75) { if (r < 0.42) out = 'bowled'; else if (r < 0.78) runs = 0; else runs = 1; }
      else if (q > 0.4) { if (r < 0.14) out = Math.random() < 0.5 ? 'bowled' : 'caught'; else if (r < 0.42) runs = 0; else if (r < 0.78) runs = Math.random() < 0.5 ? 1 : 2; else runs = 4; }
      else { if (r < 0.05) out = 'caught'; else if (r < 0.22) runs = 0; else if (r < 0.62) runs = 4; else runs = 6; }
    } else return Math.random() < 0.65 ? { runs: 1 + Math.floor(Math.random() * 4), out: null } : { runs: 0, out: null };
    return { runs, out };
  };
  const score = (runs, out) => {
    if (H.mode === 'bat') {
      H.balls++; H.runs += runs; if (out) H.wkts++;
      say(out ? (out === 'bowled' ? 'Bowled! The stumps go flying' : 'Caught! Out!') : runs === 6 ? 'SIX! Over the houses!' : runs === 4 ? 'FOUR!' : runs ? `${runs} run${runs > 1 ? 's' : ''}` : 'Missed — dot ball', out ? 'out' : runs >= 4 ? 'boundary' : runs ? 'runs' : 'dot');
      if (H.wkts >= 3 || H.balls >= 18) setTimeout(() => { if (H.mode !== 'bat') return; say(`Innings over — you made ${H.runs}. Now bowl! The kids need ${H.runs + 1}`, 'innings'); setMode('bowl'); }, 1600);
    } else if (H.mode === 'bowl') {
      H.kBalls++; H.kRuns += runs; if (out) H.kWkts++;
      say(out ? (out === 'bowled' ? 'Bowled him! Stumps everywhere' : 'Caught! You got him!') : runs === 6 ? 'Six! He smashed that one' : runs === 4 ? 'Four to the kids' : runs ? `${runs} run${runs > 1 ? 's' : ''} to the kids` : 'Beaten! Dot ball', out ? 'wicket' : runs >= 4 ? 'boundary' : runs ? 'runs' : 'dot');
      const done = H.kRuns > H.runs ? 'lost' : H.kWkts >= 3 || H.kBalls >= 18 ? (H.kRuns === H.runs ? 'tie' : 'won') : null;
      if (done) setTimeout(() => {
        if (H.mode !== 'bowl') return;
        say(done === 'won' ? `You won by ${H.runs - H.kRuns} runs! 🏆` : done === 'tie' ? 'A tie! Everyone cheers' : 'The kids won this time — another match?', 'result');
        setTimeout(() => { if (H.mode) { H.runs = H.balls = H.wkts = H.kRuns = H.kBalls = H.kWkts = 0; setMode('bat'); say('New match — you bat first', 'innings'); } }, 3500);
      }, 1600);
    }
  };
  const setMode = (m) => {
    H.mode = m; phase = 'wait'; T = 0; swingT = -1; H.go = false; H.pressK = -1;
    if (m === 'bat') { const p = lw(...spots.bat); H.boy.x = p.x; H.boy.z = p.z; H.boy.face = face(p, crease.x, crease.z); H.boy.anim = 'stance'; R.bat.prop?.('none', false); bat.visible = false; boyBat.visible = true; }
    if (m === 'bowl') { const p = lw(...spots.bowl); H.boy.x = p.x; H.boy.z = p.z; H.boy.face = face(p, batPt.x, batPt.z); H.boy.anim = 'idle'; bat.visible = true; boyBat.visible = false; }
    if (!m) { bat.visible = true; boyBat.visible = false; }
  };
  H.start = () => { H.runs = H.balls = H.wkts = H.kRuns = H.kBalls = H.kWkts = 0; setMode('bat'); say('Gully cricket! You bat first — Space to swing', 'start'); };
  H.stop = () => { setMode(null); };
  H.swap = () => { setMode(H.mode === 'bat' ? 'bowl' : 'bat'); say(H.mode === 'bat' ? 'You take the bat' : 'You take the ball', 'innings'); };
  H.action = () => {
    if (H.mode === 'bat' && phase === 'flight' && swingT < 0) { H.pressK = Math.min(1, T / 0.75); swingT = 0; H.boy.swing = 0; }
    else if (H.mode === 'bowl' && phase === 'wait' && !H.go) { H.go = true; H.quality = 1 - Math.abs(H.meter); }
  };
  // the kite flyer, string up to the kite
  const kiteKid = kid({ dress: 'shorts', top: '#f4f4f0', bottom: '#5b5246', skin: '#86573b', sleeves: 'short' });
  const kitePos = { x: 15, z: -42 };
  kiteKid.poseHook = (P, t) => { P.sh1 = -2.2 + Math.sin(t * 1.3) * 0.25; P.el1 = -0.3; P.sh0 = -1.3; P.el0 = -0.6; P.headX = -0.6; P.headY = 0; };
  const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: '#f4f0e6', transparent: true, opacity: 0.6 }));
  string.frustumCulled = false;
  scene.add(string);
  let mode = 'day';
  const all = [...Object.values(R), kiteKid];
  const _v = new THREE.Vector3();
  const move = (s, x, z, v, dt) => {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < 0.25) { s.speed = 0; return true; }
    s.x += ((x - s.x) / d) * Math.min(d, v * dt); s.z += ((z - s.z) / d) * Math.min(d, v * dt);
    s.face = Math.atan2(x - s.x, z - s.z); s.speed = v;
    return false;
  };
  return {
    cricket: H,
    setWeather(w) { mode = w.night ? 'night' : w.rain ? 'rain' : 'day'; },
    update(dt, boy) {
      const show = mode !== 'night';
      for (const p of all) p.root.visible = show;
      ball.visible = string.visible = show;
      if (!show) return;
      const nearC = Math.abs(boy.x - C.x) + Math.abs(boy.z - C.z) < 160;
      if (nearC) {
        T += dt;
        if (swingT >= 0) swingT += dt;
        if (H.mode && mode !== 'day') { setMode(null); hooks.onCricket?.('stop', mode === 'rain' ? 'Rain stops play!' : 'Too dark to see the ball'); }
        if (H.lastT > 0) H.lastT -= dt;
        if (H.boy.swing >= 0) { H.boy.swing += dt; if (H.boy.swing > 0.6) H.boy.swing = -1; }
        if (H.boy.bowl >= 0) { H.boy.bowl += dt; if (H.boy.bowl > 0.5) H.boy.bowl = -1; }
        H.meter = Math.sin(performance.now() * 0.0042);
        if (mode === 'rain') {
          // monsoon! everyone jumps about in the rain
          for (const s of Object.values(st)) { s.speed = 0; s.action = 'play'; }
          ball.visible = false;
        } else {
          for (const s of Object.values(st)) s.action = 'idle';
          st.keep.action = 'keeper';
          // the kid whose place the boy has taken goes out to field
          const out = H.mode === 'bat' ? st.bat : H.mode === 'bowl' ? st.bowl : null;
          if (out) move(out, fieldSpot[H.mode].x, fieldSpot[H.mode].z, 2.2, dt);
          else { if (phase === 'wait' || phase === 'runup') move(st.bat, st.bat.home.x, st.bat.home.z, 2.2, dt); }
          const humanBowl = H.mode === 'bowl', B = humanBowl ? H.boy : st.bowl;
          const moveB = (x, z, v) => {
            if (!humanBowl) return move(st.bowl, x, z, v, dt);
            const d = Math.hypot(x - H.boy.x, z - H.boy.z);
            if (d < 0.25) { H.boy.speed = 0; return true; }
            H.boy.x += ((x - H.boy.x) / d) * Math.min(d, v * dt); H.boy.z += ((z - H.boy.z) / d) * Math.min(d, v * dt); H.boy.face = Math.atan2(x - H.boy.x, z - H.boy.z); H.boy.speed = v;
            return false;
          };
          if (phase === 'wait') {
            const home = humanBowl ? lw(...spots.bowl) : st.bowl.home;
            const back = moveB(home.x, home.z, 2.2);
            if (humanBowl && back) H.boy.face = face(H.boy, batPt.x, batPt.z);
            ballAt(B.x, groundHeight(B.x, B.z) + 0.9, B.z);
            if (humanBowl ? H.go && back : T > 2.5 && st.bowl.speed === 0) { phase = 'runup'; T = 0; }
          } else if (phase === 'runup') {
            const done = moveB(crease.x, crease.z, 4.2);
            ballAt(B.x, groundHeight(B.x, B.z) + 0.95, B.z);
            if (done) { phase = 'bowl'; T = 0; if (humanBowl) H.boy.bowl = 0; }
          } else if (phase === 'bowl') {
            if (humanBowl) H.boy.face = face(H.boy, batPt.x, batPt.z); else st.bowl.face = face(st.bowl, batPt.x, batPt.z);
            if (T > 0.35) { phase = 'flight'; T = 0; from = { x: crease.x, y: groundHeight(crease.x, crease.z) + 2.0, z: crease.z }; H.pressK = -1; }
          } else if (phase === 'flight') {
            const k = Math.min(1, T / 0.75);
            const bounce = 0.62;
            const x = from.x + (batPt.x - from.x) * k, z = from.z + (batPt.z - from.z) * k;
            const gy = groundHeight(x, z);
            const y = k < bounce ? gy + from.y - gy - (from.y - gy) * (k / bounce) ** 2 : gy + Math.sin(((k - bounce) / (1 - bounce)) * Math.PI * 0.55) * 0.75;
            ballAt(x, y, z);
            if (H.mode !== 'bat' && k > 0.85 && swingT < 0) swingT = 0;
            if (k >= 1) {
              const r = resolve(x, z);
              if (r.runs > 0 && !r.out) {
                // hit! off it goes, and the nearest fielder chases
                hooks.onBat?.(Math.hypot(boy.x - x, boy.z - z));
                const a = (H.mode === 'bat' ? H.aim * 0.9 + (H.pressK - 0.86) * 5 : 0) + (Math.random() - 0.5) * (H.mode === 'bat' ? 0.6 : 2.4);
                const d = r.runs >= 6 ? 34 + Math.random() * 8 : r.runs >= 4 ? 26 + Math.random() * 6 : r.runs === 2 ? 14 + Math.random() * 4 : 7 + Math.random() * 4;
                const L = lw(Math.sin(a) * d, 8 - Math.cos(a) * d);
                from = { x, y, z }; to = { x: L.x, y: groundHeight(L.x, L.z) + 0.05, z: L.z };
                flight = r.runs >= 6 ? 2.6 : r.runs >= 4 ? 1.6 : 1.3 + Math.random() * 0.5; peak = r.runs >= 6 ? 11 : r.runs >= 4 ? 1.2 : 2 + Math.random() * 3;
                const fielders = [st.f1, st.f2, out].filter(Boolean);
                chaser = fielders.sort((p, q) => Math.hypot(p.x - L.x, p.z - L.z) - Math.hypot(q.x - L.x, q.z - L.z))[0];
                phase = 'hit';
              } else if (r.out === 'caught') {
                const L = lw((Math.random() - 0.5) * 12, -2 - Math.random() * 6);
                hooks.onBat?.(Math.hypot(boy.x - x, boy.z - z));
                from = { x, y, z }; to = { x: L.x, y: groundHeight(L.x, L.z) + 1.4, z: L.z }; flight = 1.6; peak = 7;
                chaser = [st.f1, st.f2].sort((p, q) => Math.hypot(p.x - L.x, p.z - L.z) - Math.hypot(q.x - L.x, q.z - L.z))[0];
                phase = 'hit';
              } else if (r.out === 'bowled') { from = { x, y, z }; phase = 'stumps'; hooks.onStumps?.(Math.hypot(boy.x - x, boy.z - z)); }
              else { from = null; phase = 'keep'; }
              if (H.mode) score(r.runs, r.out);
              T = 0;
            }
          } else if (phase === 'stumps') {
            // through the batsman and into the stumps, then the keeper picks it up
            const k = Math.min(1, T / 0.25);
            ballAt(from.x + (stumps.x - from.x) * k, groundHeight(stumps.x, stumps.z) + 0.3, from.z + (stumps.z - from.z) * k);
            if (T > 0.9) { phase = 'keep'; T = 0; }
          } else if (phase === 'hit') {
            const k = Math.min(1, T / flight);
            ballAt(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * peak, from.z + (to.z - from.z) * k);
            const got = move(chaser, to.x, to.z, 3.6, dt);
            if (k >= 1 && got) { phase = 'throw'; T = 0; from = { x: chaser.x, y: groundHeight(chaser.x, chaser.z) + 1.2, z: chaser.z }; }
          } else if (phase === 'keep' || phase === 'throw') {
            const k = Math.min(1, T / 1.0);
            const src = phase === 'keep' ? { x: st.keep.x, y: groundHeight(st.keep.x, st.keep.z) + 0.6, z: st.keep.z } : from;
            const dst = { x: B.x, y: groundHeight(B.x, B.z) + 1.0, z: B.z };
            ballAt(src.x + (dst.x - src.x) * k, src.y + (dst.y - src.y) * k + Math.sin(k * Math.PI) * 2.5, src.z + (dst.z - src.z) * k);
            if (k >= 1) { phase = 'wait'; T = 0; swingT = -1; H.go = false; }
          }
          if (phase !== 'hit' && phase !== 'throw') { move(st.f1, st.f1.home.x, st.f1.home.z, 2.0, dt); move(st.f2, st.f2.home.x, st.f2.home.z, 2.0, dt); }
          else if (chaser !== st.f1) move(st.f1, st.f1.home.x, st.f1.home.z, 2.0, dt);
          else move(st.f2, st.f2.home.x, st.f2.home.z, 2.0, dt);
          if (swingT > 0.6) swingT = -1;
          if (H.mode === 'bat') H.boy.face = face(H.boy, crease.x, crease.z);
          for (const k of ['bat', 'keep', 'f1', 'f2', 'bowl']) if (st[k].speed === 0 && (k !== 'bowl' || H.mode === 'bowl')) st[k].face = face(st[k], ball.position.x, ball.position.z);
          H.phase = phase;
        }
        for (const s of Object.values(st)) {
          s.p.root.position.set(s.x, groundHeight(s.x, s.z), s.z);
          s.p.root.rotation.y = s.face;
          s.p.setGear('none');
          s.p.update(dt, s.speed, s.speed > 0 ? 'walk' : s.action);
        }
      }
      // kite flyer
      const kgy = groundHeight(kitePos.x, kitePos.z);
      kiteKid.root.position.set(kitePos.x, kgy, kitePos.z);
      const kp = village.kite.position;
      kiteKid.root.rotation.y = Math.atan2(kp.x - kitePos.x, kp.z - kitePos.z);
      kiteKid.setGear(mode === 'rain' ? 'umbrella' : 'none');
      kiteKid.update(dt, 0, 'idle');
      kiteKid.arms[1].hand.getWorldPosition(_v);
      const pos = stringGeo.attributes.position;
      pos.setXYZ(0, _v.x, _v.y, _v.z); pos.setXYZ(1, kp.x, kp.y, kp.z); pos.needsUpdate = true;
      village.kite.visible = mode !== 'rain';
      string.visible = mode !== 'rain';
    },
  };
}
