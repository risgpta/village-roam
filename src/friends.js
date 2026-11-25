// Making friends: hold P and a marker picks out whoever you're looking at (a soft gold ring at their feet, a
// little arrow bobbing over their head); press F while holding P and they become your friend. A friend walks
// along beside you wherever you go — keeping up when you run — and when you get into something with room, they
// climb in too: a pillion behind you on a bicycle, motorbike or scooter (two people on a two-wheeler), the
// passenger seats of a car, auto, jeep, e-rickshaw or bus. Where there's no room they wait, and catch up with you
// once you're back on foot. Mark a friend again and press F to say goodbye: they go back to what they were doing.
import * as THREE from 'three';
import { Person, ALL_PEOPLE } from './people.js';
import { groundHeight, resolveCollisions } from './world.js';

// where passengers sit, in the frame of the boy's seat (+x is the left side, +z ahead); y is the seat's height
// above the ground (each friend is placed so their hips rest on it)
const SEATS = {
  bicycle: [[0, 0.86, -0.52]], moped: [[0, 0.77, -0.5]], scooter: [[0, 0.76, -0.46]],
  car: [[0.66, 0.5, 0.02], [0, 0.52, -0.86], [0.66, 0.52, -0.86]],
  auto: [[0.4, 0.58, -0.78], [0, 0.58, -0.78], [-0.4, 0.58, -0.78]],
  erick: [[0.32, 0.62, -0.62], [-0.32, 0.62, -0.62], [0.32, 0.62, -1.25], [-0.32, 0.62, -1.25]],
  jeep: [[0.76, 0.62, 0.1], [0.3, 0.62, -0.95], [0.9, 0.62, -0.95]],
  police: [[0.76, 0.62, 0.1], [0.3, 0.62, -0.95], [0.9, 0.62, -0.95]],
  ambulance: [[0.85, 0.85, 0.2], [0.5, 0.75, -1.6]], firetruck: [[0.9, 1.1, 0.25], [0.3, 1.1, 0.25]],
  cart: [[0.42, 1.05, -1.0], [-0.42, 1.05, -1.0], [0, 1.05, -1.7]],
  boat: [[0, 0.32, -1.05]],
  tonga: [[0.42, 1.18, 0.0], [0.25, 1.18, -0.93, Math.PI], [-0.25, 1.18, -0.93, Math.PI]],
};
const MAX_FRIENDS = 3;
const NAMES_M = ['Ramu', 'Shyam', 'Mohan', 'Raju', 'Gopal', 'Bablu', 'Kishan', 'Hari'];
const NAMES_F = ['Sita', 'Radha', 'Meena', 'Geeta', 'Lakshmi', 'Pinki', 'Kamla', 'Savitri'];
const damp = (dt, r) => 1 - Math.exp(-dt * r);
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function buildFriends(scene, ctx) {
  // ctx: { player, boy, camera, ride(), onFoot(), toast(text), say(hi, roman, female), heightAt }
  const friends = [];
  let marking = false, target = null, held = 0, used = false, nameI = 0;
  // the marker: a gold ring on the ground and an arrow over the head
  const gold = new THREE.MeshBasicMaterial({ color: '#ffd34a', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  const marker = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 8, 40).rotateX(Math.PI / 2), gold);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.0, 0.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd34a', transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }));
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4).rotateX(Math.PI), gold);
  marker.add(ring, ring2, arrow);
  marker.visible = false;
  marker.renderOrder = 5;
  scene.add(marker);
  const isFriendOrig = (p) => friends.some((f) => f.orig === p || f.person === p);

  // whoever the camera is looking at (near the middle of the view), on foot, within ~30 m
  function pick() {
    const cam = ctx.camera, fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const P = ctx.player;
    let best = null, bs = Infinity;
    for (const p of ALL_PEOPLE) {
      if (p.gone || p.fallT > 0 || p.isBoy) continue;
      const e = p.root.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
      const d = Math.hypot(x - P.x, z - P.z);
      if (!(d < 32) || d < 0.4) continue;
      let o = p.root, vis = true;
      while (o) { if (!o.visible) { vis = false; break; } o = o.parent; }
      if (!vis) continue;
      // (only someone standing on the ground or sitting: not a rider on a passing bike or bus)
      if (p.noHit && !isFriendOrig(p)) continue;
      if (y - groundHeight(x, z, y + 0.3) > 0.7) continue;
      const dx = x - cam.position.x, dy = y + 1.1 - cam.position.y, dz = z - cam.position.z, dl = Math.hypot(dx, dy, dz) || 1;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fwd.x + dy * fwd.y + dz * fwd.z) / dl)));
      const score = ang + d / 90;
      if (ang < 0.32 && score < bs) { bs = score; best = { p, x, y, z }; }
    }
    return best;
  }

  function befriend(t) {
    const orig = t.p;
    // saying goodbye to a friend
    const fi = friends.findIndex((f) => f.person === orig || f.orig === orig);
    if (fi >= 0) { farewell(friends[fi]); return; }
    if (friends.length >= MAX_FRIENDS) { ctx.toast(`You already have ${MAX_FRIENDS} friends with you — mark one and press F to say goodbye first`); return; }
    if (!orig.opts) { ctx.toast("They smile, but they're busy just now"); return; }
    const person = new Person(orig.opts);
    for (const [k, pr] of Object.entries(orig.props)) if (pr.visible && k !== 'stick') person.prop(k, true);
    scene.add(person.root);
    person.root.position.set(t.x, groundHeight(t.x, t.z), t.z);
    person.root.rotation.y = Math.atan2(ctx.player.x - t.x, ctx.player.z - t.z);
    person.friend = true;
    orig.gone = true; orig.root.visible = false;
    const female = !!person.female;
    const name = (female ? NAMES_F : NAMES_M)[nameI++ % 8];
    const f = { person, orig, name, female, x: t.x, z: t.z, face: person.root.rotation.y, mode: 'walk', seat: null, speed: 0, wave: 1.2 };
    friends.push(f);
    ctx.toast(`${name} is your friend now! ${female ? 'She' : 'He'} will come along wherever you go 🤝`);
    ctx.say(female ? ['चलो, मैं भी चलती हूँ!', 'Chalo, main bhi chalti hoon!'] : ['चलो दोस्त, मैं भी चलता हूँ!', 'Chalo dost, main bhi chalta hoon!'], female);
  }
  function farewell(f) {
    unseat(f);
    scene.remove(f.person.root);
    const i = ALL_PEOPLE.indexOf(f.person); if (i >= 0) ALL_PEOPLE.splice(i, 1);
    f.orig.gone = false; f.orig.root.visible = true;
    friends.splice(friends.indexOf(f), 1);
    ctx.toast(`${f.name} waves goodbye and heads back home 👋`);
    ctx.say(['फिर मिलेंगे!', 'Phir milenge!'], f.female);
  }
  // into a seat in whatever the boy is riding (parented to the boy, so they move, lean and bump with it)
  function seatIn(f, k, v) {
    const s = SEATS[v.name] ?? (v.obj.seats ? null : undefined);
    if (s === undefined) return false;
    if (s === null) {
      // the buses: one of the back seats
      const list = v.obj.seats, i = list.length - 1 - k;
      if (i < 0) return false;
      v.obj.root.add(f.person.root);
      f.person.root.position.copy(list[i]);
      f.person.root.rotation.set(0, v.obj.seatRot?.[i] ?? 0, 0);
    } else {
      if (k >= s.length) return false;
      const [x, y, z, rot = 0] = s[k];
      ctx.boy.root.add(f.person.root);
      f.person.root.position.set(x, y - (f.person.seatH ?? 0.55), z);
      f.person.root.rotation.set(0, rot, 0);
    }
    f.person.noHit = true;
    f.mode = 'seat'; f.seat = v;
    return true;
  }
  function unseat(f) {
    if (f.mode !== 'seat') return;
    f.person.root.updateWorldMatrix(true, false);
    const w = new THREE.Vector3().setFromMatrixPosition(f.person.root.matrixWorld);
    scene.attach(f.person.root);
    // step down beside it
    const P = ctx.player, side = friends.indexOf(f) % 2 ? -1 : 1, lx = Math.cos(P.facing) * side, lz = -Math.sin(P.facing) * side;
    f.x = w.x + lx * 0.9; f.z = w.z + lz * 0.9;
    const q = { x: f.x, z: f.z }; resolveCollisions(q, 0.28, P.y); f.x = q.x; f.z = q.z;
    f.person.root.position.set(f.x, groundHeight(f.x, f.z), f.z);
    f.person.root.rotation.set(0, P.facing, 0);
    f.face = P.facing;
    f.person.noHit = false;
    f.mode = 'walk'; f.seat = null;
  }

  return {
    get list() { return friends; },
    get marking() { return marking; },
    // P held / released
    keyP(down) {
      if (down) {
        if (marking) return;
        marking = true; held = 0; used = false;
        if (!friends.length && !this.hinted) { this.hinted = true; ctx.toast('Look at someone (move the camera) and press F to make friends'); }
      } else {
        const tap = marking && held < 0.35 && !used;
        marking = false; target = null; marker.visible = false;
        return tap; // a quick tap of P still takes a postcard
      }
    },
    // F while P is held
    keyF() {
      if (!marking) return false;
      used = true;
      if (target) befriend(target);
      else ctx.toast('Point the camera at someone nearby, then press F');
      return true;
    },
    update(dt, t) {
      // the marker
      if (marking) {
        held += dt;
        target = pick();
        marker.visible = !!target;
        if (target) {
          const g = groundHeight(target.x, target.z, target.y + 0.3);
          marker.position.set(target.x, g + 0.06, target.z);
          ring.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
          arrow.position.y = 2.35 + Math.sin(t * 4) * 0.12 + (target.y - g);
          arrow.rotation.y = t * 2;
          gold.color.set(isFriendOrig(target.p) ? '#8fd0ff' : '#ffd34a'); // (blue over a friend: F says goodbye)
        }
      }
      if (!friends.length) return;
      const P = ctx.player, v = ctx.ride(), onFoot = ctx.onFoot();
      // getting into something: as many as there's room for climb in with you
      if (v && !v.fly) {
        let k = friends.filter((f) => f.mode === 'seat' && f.seat === v).length;
        for (const f of friends) {
          if (f.mode === 'seat' && f.seat !== v) unseat(f);
          if (f.mode === 'seat') continue;
          if (Math.hypot(f.x - P.x, f.z - P.z) > 30) { f.mode = 'wait'; continue; }
          if (seatIn(f, k, v)) { k++; if (k === 1 && SEATS[v.name]?.length === 1) ctx.toast(`${f.name} hops on behind you`); }
          else f.mode = 'wait';
        }
      } else for (const f of friends) if (f.mode === 'seat') unseat(f);
      friends.forEach((f, i) => {
        const p = f.person;
        if (f.mode === 'seat') { p.update(dt, 0, 'sit'); return; }
        if (p.fallT > 0) { p.update(dt, 0, 'idle'); return; }
        // waiting (the boy's in the plane, the train, or something with no room): stand and watch
        if (!onFoot) {
          f.mode = 'wait';
          p.root.position.set(f.x, groundHeight(f.x, f.z), f.z);
          f.face += wrapA(Math.atan2(P.x - f.x, P.z - f.z) - f.face) * damp(dt, 2);
          p.root.rotation.y = f.face;
          p.update(dt, 0, 'idle');
          return;
        }
        f.mode = 'walk';
        // a place a little behind and to one side of the boy (two friends: one each side)
        const fx = Math.sin(P.facing), fz = Math.cos(P.facing), lx = Math.cos(P.facing), lz = -Math.sin(P.facing);
        const side = i % 2 ? -1 : 1, back = 1.3 + Math.floor(i / 2) * 1.1;
        const tx = P.x - fx * back + lx * side * 0.95, tz = P.z - fz * back + lz * side * 0.95;
        let dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz);
        if (d > 70) {
          // left far behind: they turn up (out of sight, just behind you)
          f.x = tx - fx * 6; f.z = tz - fz * 6; dx = tx - f.x; dz = tz - f.z; d = Math.hypot(dx, dz);
        }
        // walk to keep up, jog when the boy runs, a little faster when they've fallen behind
        const want = d < 0.25 ? 0 : Math.min(5.2, Math.max(0.9, d * 1.1 + (P.speed > 3 ? 1.5 : 0)));
        f.speed += (want - f.speed) * damp(dt, 5);
        if (f.speed > 0.05 && d > 0.05) {
          const k = Math.min(1, (f.speed * dt) / d);
          const q = { x: f.x + dx * k, z: f.z + dz * k };
          resolveCollisions(q, 0.28, groundHeight(f.x, f.z) + 0.1);
          f.x = q.x; f.z = q.z;
          if (d > 0.3) f.face += wrapA(Math.atan2(dx, dz) - f.face) * damp(dt, 8);
        } else f.face += wrapA(P.facing - f.face) * damp(dt, 3);
        p.root.position.set(f.x, groundHeight(f.x, f.z, p.root.position.y + 0.5), f.z);
        p.root.rotation.y = f.face;
        p.update(dt, f.speed, f.speed > 0.2 ? 'walk' : 'idle');
      });
    },
  };
}
