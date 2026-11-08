// Villagers going about their chores, and two village dogs. All procedural rigs and animation.
import * as THREE from 'three';
import {
  layout, roadX, pathZ, groundHeight, heightAt, resolveCollisions, localToWorld, SQUARE, FOOT, EH, GHAT, TEA, MARKET, CRICKET, NV, BRIDGES, RV, BV, TV, MH, NE, PG, riverX, RIVER_HALF, WATER_Y, WATER,
} from './world.js';
import { Moped } from './bicycle.js';
import { Scooter, VillageBus, Jeep, RowBoat, poseRower } from './vehicles.js';
import { Bicycle, poseRider } from './bicycle.js';
import { makeCow } from './animals.js';
import { lathe, limb, limbZ, ellipsoid } from './shapes.js';
import { Dog, consolidate } from './animals.js';
import { Gear } from './gear.js';

const mat = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
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

// ---------------- human rig ----------------
// Built in unit (k = 1) space from smooth tapered capsules and lathed shapes; the body group is scaled by k.
// A sculpted head, shared by everyone (one for men, a finer one for women and children). From a sphere: a
// fuller back of the skull, a sloping forehead and brow ridge, eye sockets, cheekbones, a jaw that narrows to
// a rounded chin, and a slightly flattened face.
const HEADS = new Map();
function headGeo(fine) {
  if (HEADS.has(fine)) return HEADS.get(fine);
  const g = new THREE.SphereGeometry(1, 40, 30);
  const p = g.attributes.position;
  const bump = (x, y, z, cx, cy, cz, r) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) / r);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let X = x * 0.094, Y = y * 0.113 + 0.008, Z = z * 0.102;
    // the jaw: below the cheekbones the face narrows toward the chin
    const low = Math.min(1, Math.max(0, (-y - 0.12) / 0.85));
    const lowS = low * low * (3 - 2 * low);
    X *= 1 - (fine ? 0.36 : 0.3) * lowS;
    // the chin comes forward a little; the throat side goes back
    if (z > 0) Z += 0.014 * lowS * z * (fine ? 0.7 : 1);
    else Z *= 1 - 0.18 * lowS;
    // the forehead slopes back above the brow; the back of the skull is fuller
    if (z > 0 && y > 0.32) Z *= 1 - 0.07 * (y - 0.32);
    if (z < 0 && y > -0.2) { Z *= 1.06; Y += 0.004 * Math.max(0, -z); }
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
    p.setXYZ(i, X, Y, Z);
  }
  g.computeVertexNormals();
  HEADS.set(fine, g);
  return g;
}

export function buildHuman(o) {
  const k = o.k ?? 1, hs = o.headScale ?? 1;
  const skinC = o.skin ?? '#8a5a3c';
  const skin = mat(skinC, 0.62);
  const lip = mat('#' + new THREE.Color(skinC).multiplyScalar(0.7).getHexString(), 0.5);
  const top = mat(o.top ?? '#efe9dc', 0.9);
  const topDS = new THREE.MeshStandardMaterial({ color: o.top ?? '#efe9dc', roughness: 0.9, side: THREE.DoubleSide });
  const bottom = mat(o.bottom ?? '#eeeae0', 0.9);
  const bottomDS = new THREE.MeshStandardMaterial({ color: o.bottom ?? '#eeeae0', roughness: 0.85, side: THREE.DoubleSide });
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
    else if (saree) part(limb(0.068, 0.052, thigh), skin, hip);
    else if (dress === 'shorts') { part(limb(0.094, 0.086, thigh * 0.48), bottom, hip); part(limb(0.064, 0.052, thigh), skin, hip); }
    else part(limb(0.088, 0.07, thigh), bottom, hip);
    const knee = new THREE.Group();
    knee.position.y = -thigh;
    hip.add(knee);
    if (dress === 'dhoti') { part(limb(0.084, 0.074, shin * 0.42), bottom, knee); part(limb(0.052, 0.036, shin), skin, knee); }
    else if (saree || dress === 'shorts') part(limb(0.052, 0.036, shin), skin, knee);
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
    if (o.pallu !== false) {
      band(-1.15, 2.3); band(Math.PI - 0.95, 1.9);
      part(ellipsoid(0.11, 0.3, 0.018), bottomDS, torso, -0.07, 0.24, -0.135).rotation.z = 0.2;
    }
  } else {
    const kurta = dress === 'kurta' ? 0.46 : dress === 'dhoti' ? 0.3 : dress === 'shorts' ? 0.2 : 0.1;
    part(lathe([[0, -0.06], [0.13, -0.05], [0.155, 0.02], [0.16, 0.15], [0.168, 0.3], [0.178, 0.42], [0.172, 0.48], [0.14, 0.53], [0.075, 0.565], [0, 0.575]], 20).scale(1, 1, 0.68), top, torso);
    part(lathe([[0.21, -kurta], [0.19, -kurta * 0.5], [0.165, -0.03], [0.157, 0.04]], 20).scale(1, 1, 0.72), topDS, torso);
    if (o.vest) part(lathe([[0.163, 0.12], [0.172, 0.3], [0.182, 0.42], [0.176, 0.48], [0.12, 0.535]], 20).scale(1, 1, 0.7), mat(o.vest, 0.9), torso);
  }
  part(limb(0.05, 0.054, 0.11, 12), skin, torso, 0, 0.64, 0);

  const head = new THREE.Group();
  head.position.y = 0.72;
  head.scale.setScalar(hs);
  torso.add(head);
  // the head: one sculpted shape (cranium, brow, cheekbones, a tapering jaw and a chin), then the features
  part(headGeo(saree || (o.k ?? 1) < 0.8), skin, head);
  const lidM = mat('#' + new THREE.Color(skinC).multiplyScalar(0.86).getHexString(), 0.6);
  const sclera = mat('#ece6da', 0.25), iris = mat(o.eyes ?? '#3a2414', 0.3), pupil = mat('#060403', 0.2);
  const shine = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.6, roughness: 0.1 });
  const fem = saree;
  for (const s of [-1, 1]) {
    // eyes set into their sockets: the white, a brown iris, the pupil and a glint; lids over and under
    const ex = s * 0.036, ey = 0.014, ez = 0.084;
    part(new THREE.SphereGeometry(0.0128, 14, 10), sclera, head, ex, ey, ez);
    part(ellipsoid(0.0072, 0.0072, 0.0026, 12, 8), iris, head, ex, ey - 0.0004, ez + 0.0118);
    part(ellipsoid(0.0034, 0.0034, 0.0016, 8, 6), pupil, head, ex, ey - 0.0004, ez + 0.0136);
    part(new THREE.SphereGeometry(0.0012, 5, 4), shine, head, ex + 0.0024, ey + 0.0026, ez + 0.0142);
    const upper = part(ellipsoid(0.0156, 0.0078, 0.0126, 14, 8), lidM, head, ex, ey + 0.0086, ez + 0.0008);
    upper.rotation.x = -0.12;
    part(ellipsoid(0.0156, 0.0014, 0.0116, 10, 4), dark, head, ex, ey + 0.0058, ez + 0.0042); // the lash line
    part(ellipsoid(0.0146, 0.0038, 0.0108, 12, 6), lidM, head, ex, ey - 0.0108, ez + 0.0006);
    // brows: an arch of hair over each eye, finer for the women
    const bw = fem ? 0.0024 : 0.0036;
    const brow = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.016, 0.034, 0.097), new THREE.Vector3(s * 0.034, 0.041, 0.095), new THREE.Vector3(s * 0.054, 0.036, 0.083)]);
    part(new THREE.TubeGeometry(brow, 8, bw, 5, false), hairCol, head);
    // ears: the outer rim and the dark bowl inside
    const ear = part(ellipsoid(0.011, 0.027, 0.019, 12, 8), skin, head, s * 0.094, 0.0, -0.008);
    ear.rotation.y = s * 0.35;
    part(ellipsoid(0.005, 0.016, 0.011, 8, 6), lidM, head, s * 0.1, -0.001, -0.004).rotation.y = s * 0.35;
    // the sides of the nose and the nostrils
    part(ellipsoid(0.0088, 0.0078, 0.0092, 10, 6), skin, head, s * 0.0118, -0.0335, 0.1);
    part(ellipsoid(0.0028, 0.0016, 0.0026, 6, 4), dark, head, s * 0.0058, -0.0418, 0.1032);
  }
  // the nose: a bridge running down from between the brows to a rounded tip
  part(ellipsoid(0.0098, 0.03, 0.011, 10, 8), skin, head, 0, -0.006, 0.0985).rotation.x = -0.28;
  part(new THREE.SphereGeometry(0.0125, 12, 10), skin, head, 0, -0.031, 0.1075);
  // lips: a shaped upper lip, a fuller lower one, the line of the mouth between
  const lipC = fem ? mat('#' + new THREE.Color(skinC).lerp(new THREE.Color('#9a3438'), 0.45).multiplyScalar(0.85).getHexString(), 0.45) : lip;
  part(ellipsoid(0.021, 0.0052, 0.0085, 12, 6), lipC, head, 0, -0.0535, 0.0935);
  part(ellipsoid(0.0185, 0.0066, 0.0092, 12, 6), lipC, head, 0, -0.0615, 0.0915);
  part(ellipsoid(0.0195, 0.0011, 0.004, 10, 4), dark, head, 0, -0.0575, 0.0985);
  // a small chin pad and soft cheeks
  part(ellipsoid(0.014, 0.009, 0.008, 10, 6), skin, head, 0, -0.083, 0.08);
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
    part(cap(0.108, Math.PI * 0.52), hairCol, head, 0, 0.018, -0.008).rotation.x = -0.3;
  }
  if (saree) {
    part(cap(0.108, Math.PI * 0.53), hairCol, head, 0, 0.016, -0.005).rotation.x = -0.22;
    if (o.braids) for (const sx of [-1, 1]) part(limb(0.03, 0.018, 0.2, 8), hairCol, head, sx * 0.07, -0.04, -0.07);
    else part(new THREE.SphereGeometry(0.048, 12, 10), hairCol, head, 0, -0.02, -0.105);
    if (o.hijab) {
      // a headscarf wrapped round the head, under the chin, and falling over the shoulders
      const hm = mat(o.hijab, 0.9), hds = new THREE.MeshStandardMaterial({ color: o.hijab, roughness: 0.9, side: THREE.DoubleSide });
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
    shoulder.position.set(s * 0.182, 0.505, 0);
    torso.add(shoulder);
    const longSleeve = !saree && o.sleeves !== 'short';
    if (saree) { part(limb(0.056, 0.05, 0.11), top, shoulder); part(limb(0.046, 0.038, 0.29), skin, shoulder); }
    else if (!longSleeve) { part(limb(0.059, 0.053, 0.15), top, shoulder); part(limb(0.047, 0.04, 0.29), skin, shoulder); }
    else part(limb(0.057, 0.047, 0.3), top, shoulder);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    shoulder.add(elbow);
    part(limb(0.043, 0.033, 0.26), longSleeve ? top : skin, elbow);
    if (longSleeve) part(limb(0.034, 0.032, 0.03, 10), skin, elbow, 0, -0.255, 0);
    const hand = new THREE.Group();
    hand.position.y = -0.28;
    elbow.add(hand);
    part(ellipsoid(0.019, 0.052, 0.033, 12, 10), skin, hand, 0, -0.04, 0.004);
    part(ellipsoid(0.011, 0.026, 0.012, 8, 6), skin, hand, -s * 0.012, -0.03, 0.03).rotation.z = s * 0.35;
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
const POSE_KEYS = ['hip0', 'hip1', 'knee0', 'knee1', 'sh0', 'sh1', 'shz0', 'shz1', 'el0', 'el1', 'torsoX', 'torsoY', 'headX', 'headY', 'bodyY'];

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
  update(dt, speed, action) {
    if (this.fallT > 0) { this.fallStep(dt); return; }
    this.t += dt;
    const t = this.t;
    const P = Object.fromEntries(POSE_KEYS.map((k) => [k, 0]));
    P.shz0 = -0.06; P.shz1 = 0.06; P.el0 = P.el1 = -0.12;
    this.walkB += ((speed > 0.1 ? 1 : 0) - this.walkB) * damp(dt, 6);
    const b = this.walkB;
    this.phase += (speed * dt * (this.female ? 5.8 : 5.0)) / this.k;
    const amp = this.female ? 0.3 : 0.42;
    for (let i = 0; i < 2; i++) {
      const ph = this.phase + i * Math.PI;
      P['hip' + i] = Math.sin(ph) * amp * b;
      P['knee' + i] = b * (0.06 + Math.max(0, -Math.cos(ph)) * 0.7);
      P['sh' + i] = -Math.sin(ph) * 0.32 * b;
    }
    P.bodyY = Math.abs(Math.cos(this.phase)) * 0.025 * b;
    P.torsoY = Math.sin(this.phase) * 0.05 * b;
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
    this.head.rotation.x = c.headX; this.head.rotation.y = c.headY;
    this.body.position.y = c.bodyY;
    if (this.skirt) {
      this.skirt.visible = c.bodyY > -0.2;
      this.skirt.rotation.x = c.hip0 * 0.1;
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
    const action = this.state === 'walk' ? (this.task.walkAction || 'walk') : this.task.action;
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
    P.update(dt, this.curSpeed, action);
    if (action === 'pump' && layout.pump.handle) layout.pump.handle.rotation.x = 0.1 + (P.pumpW ?? 0) * 0.4;
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
      return [...villagers.filter((v) => !(v.person.fallT > 0)).map((v) => ({ kind: 'c', x: v.p.x, z: v.p.z, r: 0.28 })), ...dogs.map((d) => ({ kind: 'c', x: d.p.x, z: d.p.z, r: 0.3 })), ...travellers.colliders()];
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
    total, half,
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
  // a bullock cart creaking along with a farmer and his stick
  {
    const holder = new THREE.Group();
    scene.add(holder);
    const cart = cartModel();
    cart.g.position.z = -2.2;
    holder.add(cart.g);
    const bulls = [-0.55, 0.55].map((x) => {
      const c = makeCow('#ece6da');
      c.g.position.set(x, 0, 2.0);
      c.g.scale.setScalar(0.92);
      holder.add(c.g);
      return c;
    });
    const driver = new Person({ dress: 'dhoti', top: '#e9dcc3', bottom: '#f0ebe0', headwear: 'turban', turban: '#e07a1e', mustache: true, skin: '#6e4530', sleeves: 'short' }); driver.noHit = true;
    driver.seatH = 0;
    driver.root.position.set(0, 1.0, -1.1);
    cart.g.add(driver.root);
    driver.root.position.z = 0.85;
    driver.prop('stick', true);
    list.push({ kind: 'cart', holder, cart, bulls, person: driver, loop: roadLoop(1.6), s: 260, v: 1.15, speed: 1.15, heading: 0, p: { x: 0, z: 0 } });
  }
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
  // the buses and jeeps take longer runs, linking several villages
  routes.busA = [...along(30, 150), [roadX(150) + 2, 150], [40, 152], [B1.aw.x, B1.aw.z], [B1.w.x, B1.w.z], [B1.e.x, B1.e.z], [B1.ae.x, B1.ae.z], [150, 158], [210, 145], [313, 179], [RV.x - 16, RV.z], [RV.x - 6, RV.z - 16], [326, -181], [BV.x + 14, BV.z + 6], [BV.x - 16, BV.z], [221, -286], [130, -228], [B2.ae.x, B2.ae.z], [B2.e.x, B2.e.z], [B2.w.x, B2.w.z], [B2.aw.x, B2.aw.z], [20, -175], [roadX(-150) + 2, -150], ...along(-150, 10)];
  routes.busB = routes.west;
  routes.jeepA = [...along(60, 250), [roadX(250) + 2, 250], [35, 328], [B3.aw.x, B3.aw.z], [B3.w.x, B3.w.z], [B3.e.x, B3.e.z], [B3.ae.x, B3.ae.z], [151, 390], [221, 456], [TV.x - 16, TV.z], [TV.x + 12, TV.z], [TV.x + 28, TV.z + 8], [345, 345], [RV.x - 6, RV.z + 16]];
  routes.jeepB = [...along(0, -150), [roadX(-150) + 2, -150], [20, -175], [B2.aw.x, B2.aw.z], [B2.w.x, B2.w.z], [B2.e.x, B2.e.z], [B2.ae.x, B2.ae.z], [130, -228], [221, -286], ...routes.ne];
  const motorRiders = [
    { route: 'east', kind: Moped, o: { dress: 'pants', top: '#c8323a', bottom: '#3a3a42', skin: '#7a4c33', sleeves: 'short', mustache: true }, v: 8, s0: 30 },
    { route: 'south', kind: Scooter, o: { dress: 'saree', k: 0.92, top: '#1e6fa8', bottom: '#f2b705', veil: false, skin: '#80523a' }, v: 7, s0: 90 },
    { route: 'north', kind: Moped, o: { dress: 'pants', top: '#f2efe6', bottom: '#5b5246', skin: '#6f4834', sleeves: 'short', mustache: true, headwear: 'cap', turban: '#f2efe6' }, v: 8.5, s0: 50 },
    { route: 'east', kind: Scooter, o: { dress: 'pants', top: '#8fa6c4', bottom: '#2a2a32', skin: '#83553a', sleeves: 'short' }, v: 7.5, s0: 260 },
    { route: 'south', kind: Bicycle, o: { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', skin: '#6e4530', headwear: 'turban', turban: '#e07a1e', mustache: true }, v: 3.8, s0: 200 },
    { route: 'north', kind: Bicycle, o: { dress: 'shorts', k: 0.72, headScale: 1.2, top: '#e0612b', bottom: '#2a3a6a', skin: '#8a5a3c', sleeves: 'short' }, v: 4.4, s0: 120 },
    { route: 'east', kind: Bicycle, o: { dress: 'saree', k: 0.92, top: '#2e8b57', bottom: '#c2185b', veil: false, skin: '#86573b' }, v: 3.4, s0: 150 },
    ...(routes.khet ? [{ route: 'khet', kind: Moped, o: { dress: 'kurta', top: '#f4f2ec', bottom: '#f4f1e8', skin: '#7a4c33', beard: true, mustache: true, headwear: 'turban', turban: '#f2a41a' }, v: 8, s0: 200 }] : []),
    ...(routes.rann ? [{ route: 'rann', kind: Bicycle, o: { dress: 'dhoti', top: '#f4f1e8', bottom: '#f4f1e8', skin: '#6e4530', headwear: 'turban', turban: '#c4241c', mustache: true }, v: 3.8, s0: 300 }] : []),
  ];
  for (const r of motorRiders) {
    const holder = new THREE.Group();
    scene.add(holder);
    const bike = new r.kind();
    holder.add(bike.root);
    const person = new Person(r.o); person.noHit = true;
    holder.add(person.root);
    list.push({ kind: 'bike', motor: r.kind !== Bicycle, holder, bike, person, loop: polyLoop(routes[r.route], 1.2), s: r.s0, v: r.v, speed: r.v, heading: 0, p: { x: 0, z: 0 }, bellCool: 0 });
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
  const extra = ['main', 'main', 'main', 'main', 'west', 'west', 'west', 'ne', 'ne', 'east', 'east', 'south', 'south', 'north', 'north', 'main'];
  if (routes.khet) extra.push('khet', 'khet');
  if (routes.rann) extra.push('rann', 'rann');
  extra.forEach((route, i) => {
    const female = i % 2 === 0;
    const [top, bottom] = SAREES[i % SAREES.length];
    const o = female ? { dress: 'saree', k: 0.9 + (i % 3) * 0.02, top, bottom, veil: i % 4 === 0, skin: ['#80523a', '#86573b', '#7a4c33', '#6a4230'][i % 4] }
      : { dress: ['dhoti', 'pants', 'dhoti'][i % 3], top: SHIRTS[i % SHIRTS.length], bottom: ['#f4f1e8', '#4a4a52', '#efece4'][i % 3], headwear: ['turban', 'cap', undefined][i % 3], turban: ['#e07a1e', '#f2efe6', '#c0392b', '#ffffff'][i % 4], mustache: i % 3 !== 2, skin: ['#7d4f33', '#6e4530', '#83553a', '#5f3a26'][i % 4], sleeves: i % 2 ? 'short' : undefined };
    walkers.push({ route, o, carry: [null, 'potHead', 'bundle', null, 'hay', null][i % 6], stick: !female && i % 5 === 1, s0: (i * 97) % 600 });
  });
  for (const w of walkers) {
    const person = new Person(w.o);
    scene.add(person.root);
    if (w.carry) person.prop(w.carry, true);
    if (w.stick) person.prop('stick', true);
    list.push({ kind: 'walker', holder: person.root, person, carry: w.carry, loop: polyLoop(routes[w.route], 2.0), s: w.s0, v: w.kid ? 1.6 : 1.1 + Math.random() * 0.2, speed: 1, heading: 0, p: { x: 0, z: 0 } });
  }
  // buses and jeeps: a driver at the wheel and passengers aboard, pausing at each end of the run
  const traffic = [
    { Kind: VillageBus, opt: { color: '#b8322b', band: '#e8e2d0', dest: ['गाँव – मारुधर – बंगलाग्राम', 'GAON-MARUDHAR'] }, route: 'busA', v: 7.5, s0: 0 },
    { Kind: VillageBus, opt: { color: '#2e6aa8', band: '#f2e6c8', dest: ['गाँव – छोटा गाँव – विट्ठलवाडी', 'GAON-VITTHALWADI'] }, route: 'busB', v: 7, s0: 200 },
    { Kind: Jeep, opt: { color: '#f2efe6' }, route: 'jeepA', v: 9, s0: 50 },
    { Kind: Jeep, opt: { color: '#4a5a3a' }, route: 'jeepB', v: 9.5, s0: 120 },
  ];
  for (const tr of traffic) {
    const holder = new THREE.Group();
    scene.add(holder);
    const veh = new tr.Kind(tr.opt);
    holder.add(veh.root);
    const driver = new Person({ dress: 'pants', top: tr.Kind === VillageBus ? '#8a9aa8' : '#e9dcc3', bottom: '#4a4a52', mustache: true, skin: '#6e4530', sleeves: 'short', headwear: tr.Kind === Jeep ? 'cap' : undefined, turban: '#f2efe6' }); driver.noHit = true;
    driver.seatH = 0;
    driver.root.position.copy(veh.driverSeat);
    holder.add(driver.root);
    const riders = veh.seats.map((p, i) => {
      const q = new Person(i % 2 ? { dress: 'saree', k: 0.92, top: SAREES[i % 6][0], bottom: SAREES[i % 6][1], veil: true, skin: '#80523a' } : { dress: 'dhoti', top: SHIRTS[i % 7], bottom: '#f4f1e8', headwear: i % 4 ? 'turban' : undefined, turban: '#e07a1e', mustache: true, skin: '#7a4c33' }); q.noHit = true;
      q.seatH = 0;
      q.root.position.copy(p);
      holder.add(q.root);
      return q;
    });
    const loop = polyLoop(routes[tr.route], tr.Kind === VillageBus ? 1.8 : 1.5);
    list.push({ kind: tr.Kind === VillageBus ? 'bus' : 'jeep', holder, veh, person: driver, riders, loop, s: tr.s0, v: tr.v, speed: tr.v, heading: 0, p: { x: 0, z: 0 }, wait: 0, pitch: 0, bellCool: 0, nightOff: traffic.indexOf(tr) % 2 === 1 });
  }
  let weather = { rain: false, night: false };
  const tmp = { x: 0, z: 0 }, ahead = { x: 0, z: 0 };
  // a quiet start: only cyclists, people on foot and the bullock cart are about at first. The motorbikes,
  // scooters, buses and jeeps join the roads one by one over the first several minutes of play.
  {
    let i = 0;
    for (const t of list) {
      const motor = (t.kind === 'bike' && t.motor) || t.kind === 'bus' || t.kind === 'jeep';
      if (!motor) continue;
      t.hold = 100 + i * 35 + Math.random() * 15;
      t.holder.visible = false;
      i++;
    }
  }
  return {
    list,
    setWeather(w) {
      weather = w;
      // after dark only one bus and one jeep keep running; the others wait in the village till morning
      for (const t of list) if (t.nightOff && !t.taken) t.holder.visible = !w.night && !(t.hold > 0);
    },
    colliders() {
      return list.filter((t) => t.holder.visible && !t.taken && !(t.nightOff && weather.night) && !t.crash && !(t.kind === 'walker' && t.person.fallT > 0)).map((t) => ({ kind: 'b', x: t.p.x, z: t.p.z, rot: t.heading, hw: t.veh ? t.veh.half + 0.05 : t.kind === 'cart' ? 0.9 : 0.25, hd: t.veh ? t.veh.len / 2 : t.kind === 'cart' ? 2.6 : 0.8 }));
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
        if (t.nightOff && weather.night) { t.holder.visible = false; continue; }
        t.loop.at(t.s + (t.kind === 'cart' ? 3.5 : big ? t.veh.len / 2 + 3 : t.motor ? 4 : 1.6), ahead);
        let blocked = Math.hypot(boy.x - ahead.x, boy.z - ahead.z) < (t.kind === 'cart' ? 2.4 : big ? 3.2 : t.motor ? 2.6 : 1.8);
        // and they brake for anyone on foot in the road ahead
        if (!blocked && t.kind !== 'walker' && hooks.personAhead?.(ahead.x, ahead.z, big ? 2.6 : 1.6)) blocked = true;
        // everyone waits at the level crossing while a train goes through
        if (hooks.trainNear?.(ahead.x, ahead.z)) blocked = true;
        // give way to other traffic: anything in our lane just ahead holds us up; overtake slower things
        // going our way when the road ahead is clear of oncoming traffic
        if (t.kind !== 'walker') {
          const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
          const reach = sizeOf(t) + 3.5 + t.speed * 0.6;
          let slowAhead = null, oncoming = false;
          for (const o of list) {
            if (o === t || o.crash || o.taken || (o.nightOff && weather.night)) continue;
            const dx = o.p.x - t.p.x, dz = o.p.z - t.p.z;
            const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
            const same = Math.sin(o.heading) * fx + Math.cos(o.heading) * fz > 0.3;
            if (!same && along > 0 && along < 30 && side < 4.5) oncoming = true;
            if (along <= 0 || along > reach + sizeOf(o) || side > (t.veh ? t.veh.half : 0.6) + (o.veh ? o.veh.half : 0.5) + 0.3 - (t.passT > 0 ? 2.6 : 0)) continue;
            if (o.kind === 'walker' && !same) continue; // walkers step aside for oncoming vehicles
            if (same && o.v < t.v - 0.4) slowAhead = o;
            else blocked = true;
          }
          for (const ob of obstacles) {
            const dx = ob.x - t.p.x, dz = ob.z - t.p.z;
            const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
            if (along > 0 && along < reach + ob.r && side < (t.veh ? t.veh.half : 0.6) + ob.r) blocked = true;
          }
          if (slowAhead) { if (!oncoming && !(t.passT > 0)) t.passT = 3.5; else if (!(t.passT > 0)) blocked = true; }
          t.passT = Math.max(0, (t.passT ?? 0) - dt);
          // swing out to pass, then tuck back in
          t.lat = (t.lat ?? 0) + ((t.passT > 0 ? -2.6 : 0) - (t.lat ?? 0)) * damp(dt, 2.5);
        }
        // buses and jeeps pause at the villages at each end of their run
        if (big) {
          if (t.wait > 0) t.wait -= dt;
          for (const stop of [0, t.loop.half]) {
            const ds = (((t.s - stop) % t.loop.total) + t.loop.total) % t.loop.total;
            if (ds < t.speed * dt + 0.01 && t.wait <= 0 && t.lastStop !== stop) { t.wait = 7; t.lastStop = stop; }
          }
        }
        const target = blocked || t.wait > 0 ? 0 : t.v;
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
        t.holder.rotation.y = t.heading;
        if (big) {
          t.veh.update(dt, t.speed);
          // tilt with the road
          const back = { x: 0, z: 0 }; t.loop.at(t.s - t.veh.len / 2, back);
          const hf = groundHeight(ahead.x, ahead.z), hb = groundHeight(back.x, back.z);
          t.pitch += (-Math.atan2(hf - hb, Math.hypot(ahead.x - back.x, ahead.z - back.z) || 1) - t.pitch) * damp(dt, 4);
          t.holder.rotation.set(t.pitch, t.heading, 0, 'YXZ');
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
          t.bike.update(dt, t.speed, dh * 0.8, true);
          poseRider(t.person, t.bike, t.motor ? 0.18 : 0.3);
          t.person.head.rotation.y = Math.sin(performance.now() * 0.0004 + t.s) * 0.4;
          t.person.setGear(weather.rain ? 'umbrella' : weather.night ? 'lantern' : 'none');
          if (t.person.gear.mode !== 'none') { t.person.gear.pose(1); t.person.gear.update(dt); }
          t.bellCool -= dt;
          if (blocked && t.bellCool <= 0) { t.bellCool = 4; (t.motor ? hooks.onHorn : hooks.onBell)?.(Math.hypot(boy.x - tmp.x, boy.z - tmp.z), t.bike.kind); }
          if (t.motor) hooks.onEngine?.(t, Math.hypot(boy.x - tmp.x, boy.z - tmp.z));
        } else {
          for (const w of t.cart.wheels) w.rotation.x += (t.speed * dt) / 0.7;
          for (const b of t.bulls) {
            b.ph = (b.ph ?? Math.random() * 6) + t.speed * dt * 3.2;
            for (const [i, l] of b.legs.entries()) l.hip.rotation.x = Math.sin(b.ph + (i % 3 === 0 ? 0 : Math.PI)) * 0.3 * Math.min(1, t.speed);
            b.neck.rotation.x = 0.15 + Math.sin(b.ph * 2) * 0.04;
            b.tail.rotation.z = Math.sin(performance.now() * 0.002 + b.ph) * 0.3;
          }
          t.person.update(dt, 0, 'drive');
          t.person.setGear(weather.rain ? 'umbrella' : weather.night ? 'lantern' : 'none');
        }
      }
    },
  };
}

// ---------------- kids at play: a cricket match, a boy and his tyre, a kite flyer ----------------
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
  const crease = lw(0, -9.6), batPt = lw(0.15, 8.2);
  const ballAt = (x, y, z) => ball.position.set(x, y, z);
  R.bat.poseHook = (P) => {
    // stance: bat down by the right foot; swing: a big pull across the body
    const s = swingT >= 0 ? Math.min(1, swingT / 0.35) : 0;
    P.sh1 = -0.5 - Math.sin(s * Math.PI) * 1.4; P.shz1 = -0.35 + s * 0.6; P.el1 = -0.4;
    P.sh0 = -0.7 - Math.sin(s * Math.PI) * 1.2; P.shz0 = 0.5; P.el0 = -0.6;
    P.torsoY = -0.4 + s * 1.3; P.torsoX = 0.25; P.knee0 = P.knee1 = 0.2; P.headY = -0.6 + s * 0.6;
  };
  R.bat.poseRate = 16;
  R.bowl.poseHook = (P) => {
    if (phase === 'bowl') { const a = Math.min(1, T / 0.35); P.sh1 = -0.5 - a * 3.6; P.el1 = -0.1; P.sh0 = -1.4 + a * 1.2; P.torsoX = 0.1 + a * 0.4; }
  };
  R.bowl.poseRate = 18;
  // the tyre boy runs alongside the road, keeping an old tyre rolling with a stick
  const tyreKid = boyKid(4);
  tyreKid.prop('stick', true);
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 8, 20), mat('#1c1a19', 0.9));
  tyre.castShadow = true;
  scene.add(tyre);
  const tk = { s: 0, dir: 1 };
  // the kite flyer, string up to the kite
  const kiteKid = kid({ dress: 'shorts', top: '#f4f4f0', bottom: '#5b5246', skin: '#86573b', sleeves: 'short' });
  const kitePos = { x: 15, z: -42 };
  kiteKid.poseHook = (P, t) => { P.sh1 = -2.2 + Math.sin(t * 1.3) * 0.25; P.el1 = -0.3; P.sh0 = -1.3; P.el0 = -0.6; P.headX = -0.6; P.headY = 0; };
  const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: '#f4f0e6', transparent: true, opacity: 0.6 }));
  string.frustumCulled = false;
  scene.add(string);
  let mode = 'day';
  const all = [...Object.values(R), tyreKid, kiteKid];
  const _v = new THREE.Vector3();
  const move = (s, x, z, v, dt) => {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < 0.25) { s.speed = 0; return true; }
    s.x += ((x - s.x) / d) * Math.min(d, v * dt); s.z += ((z - s.z) / d) * Math.min(d, v * dt);
    s.face = Math.atan2(x - s.x, z - s.z); s.speed = v;
    return false;
  };
  return {
    setWeather(w) { mode = w.night ? 'night' : w.rain ? 'rain' : 'day'; },
    update(dt, boy) {
      const show = mode !== 'night';
      for (const p of all) p.root.visible = show;
      ball.visible = tyre.visible = string.visible = show;
      if (!show) return;
      const nearC = Math.abs(boy.x - C.x) + Math.abs(boy.z - C.z) < 160;
      if (nearC) {
        T += dt;
        if (swingT >= 0) swingT += dt;
        if (mode === 'rain') {
          // monsoon! everyone jumps about in the rain
          for (const s of Object.values(st)) { s.speed = 0; s.action = 'play'; }
          ball.visible = false;
        } else {
          for (const s of Object.values(st)) s.action = 'idle';
          st.keep.action = 'keeper';
          if (phase === 'wait') {
            move(st.bowl, st.bowl.home.x, st.bowl.home.z, 2.2, dt);
            ballAt(st.bowl.x, groundHeight(st.bowl.x, st.bowl.z) + 0.9, st.bowl.z);
            if (T > 2.5 && st.bowl.speed === 0) { phase = 'runup'; T = 0; }
          } else if (phase === 'runup') {
            const done = move(st.bowl, crease.x, crease.z, 4.2, dt);
            ballAt(st.bowl.x, groundHeight(st.bowl.x, st.bowl.z) + 0.95, st.bowl.z);
            if (done) { phase = 'bowl'; T = 0; }
          } else if (phase === 'bowl') {
            st.bowl.face = face(st.bowl, batPt.x, batPt.z);
            if (T > 0.35) { phase = 'flight'; T = 0; from = { x: crease.x, y: groundHeight(crease.x, crease.z) + 2.0, z: crease.z }; }
          } else if (phase === 'flight') {
            const k = Math.min(1, T / 0.75);
            const bounce = 0.62;
            const x = from.x + (batPt.x - from.x) * k, z = from.z + (batPt.z - from.z) * k;
            const gy = groundHeight(x, z);
            const y = k < bounce ? gy + from.y - gy - (from.y - gy) * (k / bounce) ** 2 : gy + Math.sin(((k - bounce) / (1 - bounce)) * Math.PI * 0.55) * 0.75;
            ballAt(x, y, z);
            if (k > 0.85 && swingT < 0) swingT = 0;
            if (k >= 1) {
              if (Math.random() < 0.65) {
                // hit! off it goes, and the nearest fielder chases
                hooks.onBat?.(Math.hypot(boy.x - x, boy.z - z));
                const a = (Math.random() - 0.5) * 2.4, d = 7 + Math.random() * 9;
                const L = lw(Math.sin(a) * d, 8 - Math.cos(a) * d);
                from = { x, y, z }; to = { x: L.x, y: groundHeight(L.x, L.z) + 0.05, z: L.z }; flight = 1.3 + Math.random(); peak = 2 + Math.random() * 5;
                chaser = [st.f1, st.f2].sort((p, q) => Math.hypot(p.x - L.x, p.z - L.z) - Math.hypot(q.x - L.x, q.z - L.z))[0];
                phase = 'hit';
              } else { from = null; phase = 'keep'; }
              T = 0;
            }
          } else if (phase === 'hit') {
            const k = Math.min(1, T / flight);
            ballAt(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * peak, from.z + (to.z - from.z) * k);
            const got = move(chaser, to.x, to.z, 3.6, dt);
            if (k >= 1 && got) { phase = 'throw'; T = 0; from = { x: chaser.x, y: groundHeight(chaser.x, chaser.z) + 1.2, z: chaser.z }; }
          } else if (phase === 'keep' || phase === 'throw') {
            const k = Math.min(1, T / 1.0);
            const src = phase === 'keep' ? { x: st.keep.x, y: groundHeight(st.keep.x, st.keep.z) + 0.6, z: st.keep.z } : from;
            const dst = { x: st.bowl.x, y: groundHeight(st.bowl.x, st.bowl.z) + 1.0, z: st.bowl.z };
            ballAt(src.x + (dst.x - src.x) * k, src.y + (dst.y - src.y) * k + Math.sin(k * Math.PI) * 2.5, src.z + (dst.z - src.z) * k);
            if (k >= 1) { phase = 'wait'; T = 0; swingT = -1; }
          }
          if (phase !== 'hit' && phase !== 'throw') { move(st.f1, st.f1.home.x, st.f1.home.z, 2.0, dt); move(st.f2, st.f2.home.x, st.f2.home.z, 2.0, dt); }
          else if (chaser !== st.f1) move(st.f1, st.f1.home.x, st.f1.home.z, 2.0, dt);
          else move(st.f2, st.f2.home.x, st.f2.home.z, 2.0, dt);
          if (swingT > 0.6) swingT = -1;
          for (const k of ['bat', 'keep', 'f1', 'f2']) if (st[k].speed === 0) st[k].face = face(st[k], ball.position.x, ball.position.z);
        }
        for (const s of Object.values(st)) {
          s.p.root.position.set(s.x, groundHeight(s.x, s.z), s.z);
          s.p.root.rotation.y = s.face;
          s.p.setGear('none');
          s.p.update(dt, s.speed, s.speed > 0 ? 'walk' : s.action);
        }
      }
      // tyre boy: up and down the road between the square and the footbridge lane
      if (Math.abs(boy.z - 40) < 180) {
        tk.s += dt * 2.6 * tk.dir;
        if (tk.s > 34) tk.dir = -1;
        if (tk.s < 0) tk.dir = 1;
        const z = 18 + tk.s, x = roadX(z) - 1.4;
        tyreKid.root.position.set(x, groundHeight(x, z), z - tk.dir * 0.8);
        tyreKid.root.rotation.y = tk.dir > 0 ? 0 : Math.PI;
        tyreKid.setGear('none');
        tyreKid.update(dt, 2.6, 'walk');
        tyre.position.set(x + 0.35, groundHeight(x, z) + 0.39, z + tk.dir * 0.3);
        tyre.rotation.set(tk.s / 0.39, Math.PI / 2, 0, 'YXZ');
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
