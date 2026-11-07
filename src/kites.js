// Patang-baazi on the open meadow: four kids fly paper kites high downwind, each line sagging from a raised
// hand, a little girl minding the charkhi (the string spool) for her brother. Every so often two kites drift
// together and fight a pech — the lines cross, one is cut ("Bo kata!"), the winner jumps about, and the cut
// kite floats away and flutters down while the youngest runs after it, picks it up and brings it back so the
// loser can launch again.
import * as THREE from 'three';
import { Person } from './people.js';
import { groundHeight, resolveCollisions } from './world.js';

const mat = (c, r = 0.8, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o });
// the kites fly south over the wheat (away from the river, so cut kites come down on land)
const WIND = new THREE.Vector2(0.25, -0.97).normalize();
const damp = (dt, r) => 1 - Math.exp(-dt * r);
const N = 18; // points per string

function kiteMesh(c1, c2) {
  const g = new THREE.Group();
  const w = 0.62, h = 0.72;
  // the paper: a diamond in two colours split down the spine, double-sided
  const half = (sx, col) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, h / 2, 0, sx * w / 2, h * 0.12, 0, 0, -h / 2, 0], 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat(col, 0.7, { side: THREE.DoubleSide }));
    m.castShadow = true;
    g.add(m);
  };
  half(1, c1); half(-1, c2);
  // spine and the bowed cross-stick
  const stick = mat('#d8c08a', 0.8);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, h), stick));
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.005, 4, 16, 1.6), stick);
  bow.rotation.z = Math.PI / 2 - 0.8; bow.position.set(0, h * 0.12 - 0.4, 0.04);
  g.add(bow);
  // the little tail (puchhalla)
  const tail = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, -h / 2, 0, 0.1, -h / 2 - 0.16, 0, -0.1, -h / 2 - 0.16, 0], 3)), mat(c1, 0.7, { side: THREE.DoubleSide }));
  g.add(tail);
  g.scale.setScalar(1.35);
  return g;
}

export function buildKites(scene, site, hooks = {}) {
  if (!site) return { update() {}, setWeather() {}, kids: [] };
  const kidOpts = (o) => ({ k: 0.64 + Math.random() * 0.07, headScale: 1.24, sleeves: 'short', ...o });
  const mk = (o) => { const p = new Person(kidOpts(o)); scene.add(p.root); return p; };
  // flyers stand in a loose line across the wind, a few metres apart, upwind side of the meadow
  const side = new THREE.Vector2(-WIND.y, WIND.x);
  const base = { x: site.x - WIND.x * 4, z: site.z - WIND.y * 4 };
  const looks = [
    { dress: 'shorts', top: '#f2b705', bottom: '#2a3a6a', skin: '#8a5a3c' },
    { dress: 'shorts', top: '#e9dcc3', bottom: '#5b5246', skin: '#7a4c33' },
    { dress: 'saree', top: '#2e8b57', bottom: '#c2185b', pallu: false, braids: true, skin: '#80523a' },
    { dress: 'shorts', top: '#1e6fa8', bottom: '#3f5a7a', skin: '#93603f' },
  ];
  const colours = [['#e8382f', '#f2c21a'], ['#2e8b57', '#ffffff'], ['#7a2b6e', '#f28ab0'], ['#1e6fa8', '#f2efe6']];
  const strMat = new THREE.LineBasicMaterial({ color: '#f4f0e6', transparent: true, opacity: 0.75 });
  const flyers = looks.map((o, i) => {
    const p = mk(o);
    const off = (i - 1.5) * 4.2;
    const home = { x: base.x + side.x * off, z: base.z + side.y * off };
    const kite = kiteMesh(...colours[i]);
    scene.add(kite);
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const line = new THREE.Line(geo, strMat);
    line.frustumCulled = false;
    scene.add(line);
    const F = {
      p, home, x: home.x, z: home.z, kite, line, i,
      az: (i - 1.5) * 0.28, // azimuth of the kite off straight downwind
      azT: (i - 1.5) * 0.28, len: 38 + i * 3, lenT: 38 + i * 3, el: 0.85,
      state: 'fly', t: Math.random() * 10, tug: 0, cheer: 0,
      kp: new THREE.Vector3(), kv: new THREE.Vector3(), hand: new THREE.Vector3(),
    };
    p.poseHook = (P, t) => {
      if (F.cheer > 0) { const j = Math.max(0, Math.sin(t * 9)); P.bodyY += j * 0.14; P.sh0 = -2.8; P.sh1 = -2.6 - j * 0.3; P.el0 = P.el1 = -0.2; P.knee0 = P.knee1 = (1 - j) * 0.4; return; }
      if (F.state !== 'fly' && F.state !== 'launch') { P.sh1 = -0.4; P.headX = 0.2; return; }
      // right hand up holding the line, left hand pulling string in; tugging jerks both down
      const tg = F.tug;
      P.sh1 = -2.35 + tg * 0.5 + Math.sin(t * 1.3) * 0.12; P.el1 = -0.35; P.shz1 = -0.1;
      P.sh0 = -1.35 + tg * 0.3; P.el0 = -0.9; P.shz0 = 0.25;
      P.torsoX = -0.12 + tg * 0.15; P.headX = -0.65; P.headY = 0;
    };
    p.poseRate = 12;
    return F;
  });
  // the spool girl beside the first flyer, the charkhi turning as he lets out line
  const spoolKid = mk({ dress: 'saree', top: '#f2efe6', bottom: '#e0612b', pallu: false, braids: true, skin: '#86573b', k: 0.6 });
  const spool = new THREE.Group();
  {
    const wood = mat('#a8763a', 0.6);
    const put = (geo, m, x, y) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, 0); spool.add(o); };
    for (const s of [-1, 1]) put(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 8).rotateZ(Math.PI / 2), wood, s * 0.08, 0);
    put(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 12).rotateZ(Math.PI / 2), mat('#e8382f', 0.8), 0, 0);
    for (const s of [-1, 1]) put(new THREE.CylinderGeometry(0.012, 0.012, 0.14), wood, s * 0.15, -0.07);
  }
  spool.position.set(-0.02, -0.12, 0.08);
  spoolKid.arms[1].hand.add(spool);
  spoolKid.poseHook = (P) => { P.sh0 = P.sh1 = -1.05; P.el0 = P.el1 = -0.85; P.shz0 = 0.35; P.shz1 = -0.35; P.headX = -0.5; P.headY = 0; };
  // the little one who chases cut kites
  const runner = mk({ dress: 'shorts', top: '#c2185b', bottom: '#2a3a6a', skin: '#8a5a3c', k: 0.58 });
  const R = { x: base.x - WIND.x * 3, z: base.z - WIND.y * 3, state: 'idle', target: null, F: null, carry: null };
  runner.poseHook = (P) => { if (R.carry) { P.sh1 = -2.4; P.el1 = -0.3; } };
  const kids = [...flyers.map((f) => f.p), spoolKid, runner];

  let mode = 'day', fight = null, nextFight = 20 + Math.random() * 15, clock = 0;
  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  const flightPos = (F, out) => {
    // where a flying kite wants to be: up the wind window at this azimuth, wobbling in the gusts
    const a = Math.atan2(WIND.y, WIND.x) + F.az + Math.sin(F.t * 0.37 + F.i) * 0.05;
    const el = F.el + Math.sin(F.t * 0.53 + F.i * 2) * 0.06 - F.tug * 0.05;
    const h = Math.cos(el) * F.len, v = Math.sin(el) * F.len;
    return out.set(F.hand.x + Math.cos(a) * h, F.hand.y + v, F.hand.z + Math.sin(a) * h);
  };
  const setLine = (F, a, b, sag, loose = false) => {
    const pos = F.line.geometry.attributes.position;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      let y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
      if (loose) y = Math.max(groundHeight(x, z) + 0.02, y);
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    F.line.geometry.computeBoundingSphere();
  };
  const orient = (kite, toward, roll) => {
    kite.lookAt(toward);
    kite.rotateX(-0.35);
    kite.rotateZ(roll);
  };

  return {
    kids,
    get flyers() { return flyers; },
    forceFight() { nextFight = 0; },
    setWeather(w) { mode = w.night ? 'night' : w.rain ? 'rain' : 'day'; },
    update(dt, player) {
      clock += dt;
      const show = mode === 'day';
      for (const p of kids) p.root.visible = show;
      for (const F of flyers) { F.kite.visible = show; F.line.visible = show && (F.state === 'fly' || F.state === 'launch' || F.state === 'cut'); }
      if (!show) return;
      const d = Math.hypot(player.x - site.x, player.z - site.z);
      if (d > 320) return;
      const near = d < 160;
      // ---- flyers ----
      for (const F of flyers) {
        F.t += dt;
        F.cheer = Math.max(0, F.cheer - dt);
        const gy = groundHeight(F.x, F.z);
        F.p.root.position.set(F.x, gy, F.z);
        if (near) F.p.update(dt, 0, 'idle');
        F.p.arms[1].hand.getWorldPosition(F.hand);
        if (!F.init) { F.init = true; flightPos(F, F.kp); }
        // a sharp tug now and then to make the kite dance
        const tugging = (Math.sin(F.t * 0.9 + F.i * 1.7) > 0.7) || (fight && (fight.a === F || fight.b === F));
        F.tug += ((tugging ? (Math.sin(F.t * 11) > 0 ? 1 : 0) : 0) - F.tug) * damp(dt, 14);
        if (F.state === 'fly' || F.state === 'launch') {
          if (F.state === 'launch') { F.len += dt * 4.5; if (F.len >= F.lenT) { F.len = F.lenT; F.state = 'fly'; } F.el += (0.85 - F.el) * damp(dt, 0.6); }
          F.az += (F.azT - F.az) * damp(dt, 0.25);
          flightPos(F, _v);
          F.kp.lerp(_v, damp(dt, 2.2));
          const yaw = Math.atan2(F.kp.x - F.x, F.kp.z - F.z);
          F.p.root.rotation.y += Math.atan2(Math.sin(yaw - F.p.root.rotation.y), Math.cos(yaw - F.p.root.rotation.y)) * damp(dt, 3);
          F.kite.position.copy(F.kp);
          orient(F.kite, F.hand, Math.sin(F.t * 1.7 + F.i) * 0.25 + F.tug * 0.3);
          setLine(F, F.hand, F.kp, F.len * 0.07);
        } else if (F.state === 'cut') {
          // a cut kite: floats downwind, see-saws and sinks, the broken line trailing beneath it
          F.kv.x += (WIND.x * 1.6 - F.kv.x) * damp(dt, 0.8);
          F.kv.z += (WIND.y * 1.6 - F.kv.z) * damp(dt, 0.8);
          F.kv.y += (-1.5 - F.kv.y) * damp(dt, 0.7);
          F.kp.addScaledVector(F.kv, dt);
          F.kp.x += Math.sin(F.t * 2.3) * dt * 1.4;
          const g = groundHeight(F.kp.x, F.kp.z);
          F.kite.position.copy(F.kp);
          _w.set(F.kp.x - F.kv.x, F.kp.y + 2, F.kp.z - F.kv.z);
          orient(F.kite, _w, Math.sin(F.t * 2.3) * 0.9);
          _w.set(F.kp.x - WIND.x * 6, F.kp.y - 9, F.kp.z - WIND.y * 6);
          setLine(F, _w, F.kp, -0.5, true);
          if (F.kp.y < g + 0.15) { F.kp.y = g + 0.05; F.state = 'down'; F.kite.rotation.set(-Math.PI / 2, 0, F.t); F.kite.position.copy(F.kp); }
        } else if (F.state === 'down') {
          F.line.visible = false;
        } else if (F.state === 'hold') {
          // the runner brought it back: in the flyer's hand, ready to throw up into the wind
          F.kite.position.copy(F.hand); F.kite.position.y += 0.3;
          orient(F.kite, _w.set(F.x, F.hand.y, F.z), 0);
          F.line.visible = false;
          F.holdT -= dt;
          if (F.holdT < 0) { F.state = 'launch'; F.len = 2; F.el = 0.5; F.kp.copy(F.kite.position); F.line.visible = true; }
        }
      }
      // ---- spool girl stands by flyer 0, turning the charkhi ----
      {
        const F = flyers[0];
        const x = F.x - side.x * 1.1 - WIND.x * 0.6, z = F.z - side.y * 1.1 - WIND.y * 0.6;
        spoolKid.root.position.set(x, groundHeight(x, z), z);
        spoolKid.root.rotation.y = F.p.root.rotation.y;
        spool.rotation.x += dt * (F.state === 'launch' ? 14 : 1.5 + F.tug * 4);
        if (near) spoolKid.update(dt, 0, 'idle');
      }
      // ---- the pech: pick two neighbours, steer their kites together, cut one ----
      if (!fight) {
        nextFight -= dt;
        const ready = flyers.filter((f) => f.state === 'fly');
        if (nextFight < 0 && ready.length >= 2) {
          const i = Math.floor(Math.random() * (ready.length - 1));
          const a = ready[i], b = ready[i + 1];
          const mid = (a.azT + b.azT) / 2;
          a.azT = mid; b.azT = mid;
          fight = { a, b, t: 0 };
        }
      } else {
        fight.t += dt;
        const { a, b } = fight;
        const close = a.kp.distanceTo(b.kp);
        if ((close < 4 && fight.t > 6) || fight.t > 16) {
          const lose = Math.random() < 0.5 ? a : b, win = lose === a ? b : a;
          lose.state = 'cut'; lose.kv.set(WIND.x * 2, 0.5, WIND.y * 2); lose.t = 0;
          win.cheer = 2.5;
          hooks.say?.(...(Math.random() < 0.6 ? ['बो काटा!', 'Bo kata!'] : ['वो काटा! वो मारा!', 'Woh kata! Woh maara!']), Math.hypot(player.x - win.x, player.z - win.z));
          // spread the kites back out
          flyers.forEach((f) => { f.azT = (f.i - 1.5) * 0.28; });
          fight = null; nextFight = 30 + Math.random() * 25;
          if (R.state === 'idle') { R.state = 'wait'; R.F = lose; }
        }
      }
      // ---- the runner chases the cut kite ----
      {
        const step = (tx, tz, v) => {
          const dx = tx - R.x, dz = tz - R.z, l = Math.hypot(dx, dz);
          if (l < 0.5) return true;
          R.x += (dx / l) * v * dt; R.z += (dz / l) * v * dt;
          const q = { x: R.x, z: R.z }; resolveCollisions(q, 0.25, undefined, true); R.x = q.x; R.z = q.z;
          runner.root.rotation.y = Math.atan2(dx, dz);
          if (near) runner.update(dt, v, 'walk');
          return false;
        };
        if (R.state === 'idle' || R.state === 'wait') {
          if (near) runner.update(dt, 0, 'idle');
          if (R.state === 'wait' && R.F.state !== 'cut') { R.state = 'chase'; R.t = 0; }
          else if (R.state === 'wait') step(R.F.kp.x, R.F.kp.z, 2.0);
        } else if (R.state === 'chase') {
          const F = R.F;
          R.t += dt;
          if (step(F.kp.x, F.kp.z, 3.6) || R.t > 40) {
            R.state = 'bring'; R.carry = F; F.state = 'carried';
          }
        } else if (R.state === 'bring') {
          const F = R.F;
          runner.arms[1].hand.getWorldPosition(_v);
          F.kite.position.copy(_v); F.kite.position.y += 0.25;
          orient(F.kite, _w.set(R.x, _v.y, R.z), 0);
          if (step(F.x + side.x * 0.8, F.z + side.y * 0.8, 3.0)) {
            R.state = 'home'; R.carry = null; F.state = 'hold'; F.holdT = 1.5; F.len = 2;
          }
        } else if (R.state === 'home') {
          if (step(base.x - WIND.x * 3, base.z - WIND.y * 3, 1.6)) { R.state = 'idle'; R.F = null; }
        }
        runner.root.position.set(R.x, groundHeight(R.x, R.z), R.z);
        if (R.state === 'idle') runner.root.rotation.y = Math.atan2(WIND.x, WIND.y);
      }
    },
  };
}
