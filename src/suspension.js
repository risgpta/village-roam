// Wheels on the ground. A vehicle is posed from the ground under each of its wheels — the height, the pitch and
// the roll of the plane that fits them best — and then each wheel rides up or drops down on its own spring to
// meet the ground right under it (as far as the spring lets it; past that the whole body is lifted). So on a
// hillside, a bump, a ridge or the camber of a road every tyre sits on the earth instead of sinking into it or
// hanging in the air, while the body moves smoothly over the top.
import * as THREE from 'three';

const _inv = new THREE.Matrix4(), _p = new THREE.Vector3(), _b = new THREE.Box3(), _m = new THREE.Matrix4();
// each wheel's height on its axle as built, kept the first time it's seen (a vehicle taken out of the traffic,
// or given back, is measured again with its wheels wherever their springs had them)
const REST = new WeakMap();

// The wheels measured once, in the frame of `frame` (the object whose position and rotation will be set: it
// stands on the ground at its origin, facing +z, with +x its left side). Two-wheelers have no plane to fit.
export function wheelRig(frame, wheels, { travel = 0.16 } = {}) {
  if (!wheels || wheels.length < 3) return null;
  frame.updateMatrixWorld(true);
  _inv.copy(frame.matrixWorld).invert();
  const list = [];
  for (const w of wheels) {
    if (!REST.has(w)) REST.set(w, w.position.y);
    w.position.y = REST.get(w);
    w.getWorldPosition(_p).applyMatrix4(_inv);
    // the tyre's radius: how far its rubber reaches from the hub, in the wheel's own frame (however it's spun)
    let r = 0;
    w.updateMatrixWorld(true);
    const wInv = new THREE.Matrix4().copy(w.matrixWorld).invert();
    w.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _b.copy(o.geometry.boundingBox).applyMatrix4(_m.multiplyMatrices(wInv, o.matrixWorld));
      r = Math.max(r, Math.abs(_b.min.y), Math.abs(_b.max.y), Math.abs(_b.min.z), Math.abs(_b.max.z));
    });
    // (scaled with the wheel and everything above it, up to the frame)
    const e = _m.multiplyMatrices(_inv, w.matrixWorld).elements;
    r *= Math.hypot(e[4], e[5], e[6]);
    list.push({ w, x: _p.x, y: _p.y, z: _p.z, r, y0: REST.get(w), s: 0 });
  }
  // three wheels in a line (a cart's axle) give no plane
  const xs = list.map((q) => q.x), zs = list.map((q) => q.z);
  if (Math.max(...xs) - Math.min(...xs) < 0.3 || Math.max(...zs) - Math.min(...zs) < 0.3) return null;
  return { list, travel, Y: null, pitch: 0, roll: 0, h: new Float64Array(list.length) };
}

// Where the body should be: the height of the frame's origin, its pitch (rotation.x, nose down positive) and
// roll (rotation.z, left side up positive), for a frame at (x, z) facing `heading` — fitted to the ground
// under the wheels (a least-squares plane through them).
export function groundPose(rig, x, z, heading, ground, out) {
  const s = Math.sin(heading), c = Math.cos(heading), L = rig.list, n = L.length;
  // ground under each wheel; sums for the plane h = a + b·z + k·x in the vehicle's own frame
  let Sx = 0, Sz = 0, Sxx = 0, Szz = 0, Sxz = 0, Sh = 0, Shx = 0, Shz = 0;
  for (let i = 0; i < n; i++) {
    const q = L[i];
    const wx = x + q.x * c + q.z * s, wz = z - q.x * s + q.z * c;
    const h = (rig.h[i] = ground(wx, wz));
    Sx += q.x; Sz += q.z; Sxx += q.x * q.x; Szz += q.z * q.z; Sxz += q.x * q.z; Sh += h; Shx += h * q.x; Shz += h * q.z;
  }
  // solve the 3×3 normal equations (Cramer's rule) for a, b (along) and k (across)
  const M = [[n, Sz, Sx], [Sz, Szz, Sxz], [Sx, Sxz, Sxx]], R = [Sh, Shz, Shx];
  const det3 = (A) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  const D = det3(M);
  let b = 0, k = 0;
  if (Math.abs(D) > 1e-9) {
    const col = (j) => M.map((row, i) => row.map((v, jj) => (jj === j ? R[i] : v)));
    b = det3(col(1)) / D; k = det3(col(2)) / D;
  }
  out.pitch = -Math.atan(b);
  out.roll = Math.atan(k);
  // the height that puts the wheels, on average, on the ground
  const cp = Math.cos(out.pitch), sp = Math.sin(out.pitch), cr = Math.cos(out.roll), sr = Math.sin(out.roll);
  let sum = 0;
  for (let i = 0; i < n; i++) { const q = L[i], yb = q.y - q.r; sum += rig.h[i] - ((q.x * sr + yb * cr) * cp - q.z * sp); }
  out.y = sum / n;
  return out;
}

// With the body where it is now (origin height Y, pitch, roll — after any easing), each wheel goes up or
// down on its spring to meet the ground under it. Returns how far the body must rise so that no wheel needs
// more than its spring can give (add it to Y). Uses the ground heights from the last groundPose().
export function settleWheels(rig, Y, pitch, roll) {
  const L = rig.list, cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll), T = rig.travel;
  let lift = 0;
  for (let i = 0; i < L.length; i++) {
    const q = L[i], yb = q.y - q.r;
    q.s = rig.h[i] - (Y + (q.x * sr + yb * cr) * cp - q.z * sp); // + : the ground is above the tyre
    if (q.s - T > lift) lift = q.s - T;
  }
  const k = 1 / Math.max(0.5, cp * cr);
  for (let i = 0; i < L.length; i++) {
    const q = L[i];
    q.s = Math.max(-T, Math.min(T, q.s - lift));
    q.w.position.y = q.y0 + q.s * k;
  }
  return lift;
}

// every wheel back where it was built
export function restWheels(rig) { if (rig) for (const q of rig.list) { q.w.position.y = q.y0; q.s = 0; } }
