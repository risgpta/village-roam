// Animals to ride: a decorated camel at Marudhar and a temple elephant at Thennoor. Each is the same animal
// as the ones that roam the country, with a saddle (the camel: a red and gold one on the hump; the elephant:
// a quilted cloth and a rope on its neck, where a mahout sits) and a walk driven by how fast the boy urges it
// on. They plug into the riding code like a bicycle: a saddle to sit on, reins to hold, somewhere for the feet.
import * as THREE from 'three';
import { Goat } from './animals.js';
import { Elephant } from './wildlife.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mat = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
const noRng = () => 0.5;

// the top of the animal's back at (0, z): cast a ray down onto it
function backTop(root, z) {
  root.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(V(0, 10, z), V(0, -1, 0));
  const hit = rc.intersectObject(root, true)[0];
  return hit ? hit.point.y : 2;
}

export class AnimalMount {
  constructor(kind) {
    this.kind = kind;
    this.root = new THREE.Group();
    const home = { x: 0, z: 0, r: 1 };
    if (kind === 'elephant') {
      this.a = new Elephant(home, noRng, 1.05, null, true);
      this.seatZ = 0.62; // the mahout's seat, on the neck behind the ears
    } else {
      this.a = new Goat(['#c49a62', '#e2c89a', 1], 1.05, home, noRng, null, 'camel');
      this.seatZ = -0.12; // on the saddle over the hump
    }
    const A = this.a, model = A.root;
    model.position.set(0, 0, 0); model.rotation.set(0, 0, 0);
    // stand it square, legs straight, before measuring the back
    for (const l of A.legs) { l.hip.rotation.x = 0; if (l.knee) l.knee.rotation.x = 0; }
    const holder = new THREE.Group();
    holder.add(model);
    const top = backTop(holder, this.seatZ * model.scale.z);
    model.position.z = -this.seatZ * model.scale.z; // the seat sits over the root's origin
    this.root.add(holder);
    const seatY = top + (kind === 'elephant' ? 0.06 : 0.02);
    if (kind === 'elephant') {
      // a quilted cloth over the neck and shoulders, red with a gold border, and the mahout's rope
      const cloth = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.32).scale(0.62, 0.3, 0.7), mat('#a8202a', 0.8));
      cloth.position.set(0, seatY - 0.3, 0); this.root.add(cloth);
      const border = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 5, 28).rotateX(Math.PI / 2).scale(0.55, 1, 0.6), mat('#e0a82a', 0.5));
      border.position.set(0, seatY - 0.22, 0); this.root.add(border);
      const rope = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 22).rotateY(Math.PI / 2), mat('#c8b080', 0.95));
      rope.position.set(0, seatY - 0.45, 0.32); this.root.add(rope);
    }
    this.L = { saddle: V(0, seatY, 0), bar: V(0, seatY + (kind === 'elephant' ? 0.12 : 0.28), kind === 'elephant' ? 0.38 : 0.42) };
    this.camLift = seatY - 0.75; // the follow camera looks at the rider up there, not at the ground
    this.camDist = kind === 'elephant' ? 8 : 6;
    this.phase = 0; this.t = 0; this.speed = 0;
    this.bodyY0 = A.body.position.y; // (the gait's bob and roll ride on the body's resting height)
  }
  // feet astride, hanging down the animal's sides
  foot(side, out) { return out.set(side * 0.2, this.L.saddle.y - (this.kind === 'elephant' ? 0.35 : 0.48), this.kind === 'elephant' ? 0.32 : 0.22); }
  update(dt, speed = 0, steer = 0, riding = false) {
    const A = this.a;
    this.t += dt;
    const sp = Math.abs(speed);
    this.speed += (sp - this.speed) * (1 - Math.exp(-dt * 4));
    const s = this.speed, walk = Math.min(1, s / 1.2);
    // the camel paces (both legs on a side together); the elephant ambles (each leg in turn)
    const legH = this.kind === 'elephant' ? 1.75 : 1.5;
    this.phase += (s * dt * Math.PI * 2) / (legH * 1.25);
    A.legs.forEach((l) => {
      const off = this.kind === 'camel' ? (l.hip.position.x > 0 ? 0 : Math.PI) : l.ph + (l.front ? 0 : Math.PI / 2);
      const sw = Math.sin(this.phase + off);
      l.hip.rotation.x = sw * 0.38 * walk;
      if (l.knee) l.knee.rotation.x = (l.front ? 1 : -1) * Math.max(0, Math.cos(this.phase + off)) * 0.45 * walk;
    });
    // the body rolls and bobs with the gait; the head nods; the tail swishes; the elephant flaps its ears and
    // swings its trunk
    A.body.position.y = this.bodyY0 + Math.abs(Math.sin(this.phase)) * 0.04 * walk;
    A.body.rotation.z = Math.sin(this.phase) * (this.kind === 'camel' ? 0.06 : 0.03) * walk;
    if (A.neck) A.neck.rotation.x = Math.sin(this.phase * 2) * 0.05 * walk + Math.sin(this.t * 0.5) * 0.03 * (1 - walk);
    if (A.head) A.head.rotation.y = steer * 0.25 + Math.sin(this.t * 0.31) * 0.15 * (1 - walk);
    if (A.tail) A.tail.rotation.z = Math.sin(this.t * 1.7) * 0.35;
    if (A.ears) A.ears.forEach((e, i) => { e.rotation.y = (i ? -1 : 1) * (0.25 + Math.sin(this.t * 2.2 + i) * 0.25); });
    if (A.trunk) A.trunk.forEach((g, i) => { g.rotation.x = 0.12 + Math.sin(this.t * 1.2 + i * 0.5) * 0.08 + walk * 0.04; g.rotation.z = Math.sin(this.t * 0.7 + i * 0.4) * 0.06; });
  }
}
