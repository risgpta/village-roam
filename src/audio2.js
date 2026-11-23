// More lifelike voices for the machines and animals, layered onto the ambience engine (audio.js):
//  - train brakes: shoes squealing on steel tyres (loudest just before the stop), a grinding rumble, and the
//    long "pssshhh" of the air being let off once it halts
//  - car and jeep horns: a pair of electric disc horns — a buzzing diaphragm through a little trumpet
//  - the bus's pressure horn: a brassy three-trumpet air horn that swells as the air comes up
//  - the army helicopter: a heavy blade slap, the tail rotor's buzz, the turbines' whine and the roar of it
//  - animals: a natural, jittery throat source for every voice, and new barks, peacock calls, elephant
//    trumpets and rooster crows
import { Ambience } from './audio.js';

const P = Ambience.prototype;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- shared pieces ----------
P._soft = function (k = 2) {
  this._softC ??= new Map();
  if (!this._softC.has(k)) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
    this._softC.set(k, c);
  }
  const s = this.ctx.createWaveShaper(); s.curve = this._softC.get(k); s.oversample = '2x';
  return s;
};
// a pulse wave (a narrow duty cycle buzzes like a diaphragm or a pair of vocal folds)
P._pulseWave = function (duty = 0.3, n = 48, tilt = 1) {
  this._pw ??= new Map();
  const key = duty + ':' + n + ':' + tilt;
  if (!this._pw.has(key)) {
    const re = new Float32Array(n + 1), im = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) im[k] = (Math.sin(Math.PI * k * duty) / k) * Math.pow(k, 1 - tilt);
    this._pw.set(key, this.ctx.createPeriodicWave(re, im));
  }
  return this._pw.get(key);
};
// a glottal pulse: a steep closing edge, harmonics falling off at about 12 dB an octave
P._glottal = function () {
  if (!this._glot) {
    const n = 64, re = new Float32Array(n + 1), im = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) { im[k] = 1 / Math.pow(k, 1.35); re[k] = (k % 2 ? 0.25 : -0.15) / Math.pow(k, 1.6); }
    this._glot = this.ctx.createPeriodicWave(re, im);
  }
  return this._glot;
};
P._noise = function (t, dur, buf = this.white) {
  const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, Math.random() * 3); s.stop(t + dur);
  return s;
};
P._bp = function (f, q, type = 'bandpass') { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
P._g = function (v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; };
// slow random wander for a parameter (pitch jitter, a wobbling squeal): looped noise, low-passed
P._wander = function (t, dur, rate, depth, param) {
  const s = this._noise(t, dur), lp = this._bp(rate, 0.5, 'lowpass'), g = this._g(depth);
  s.connect(lp).connect(g).connect(param);
};

// ---------- the steam whistle ----------
// (the engine's whistle is the plain one in audio.js — Ambience.horn: a simple chord sliding up into pitch,
// long then short. It isn't overridden here.)

// ---------- train brakes ----------
P._brakeGraph = function () {
  if (this._bk) return this._bk;
  const ctx = this.ctx, t = ctx.currentTime;
  const loopN = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, Math.random() * 3); return s; };
  const sq = this._g(0), grind = this._g(0);
  sq.connect(this.master); grind.connect(this.master);
  // the squeal: a few sharp resonances of the wheel ringing, each wandering and fluttering
  const flutter = this._g(0.7);
  const fl = ctx.createOscillator(); fl.frequency.value = 6.3; fl.connect(this._g(0.3)).connect(flutter.gain); fl.start();
  flutter.connect(sq);
  for (const [f, lvl, q] of [[2380, 1, 55], [3710, 0.6, 45], [5230, 0.3, 40], [1180, 0.25, 30]]) {
    const bp = this._bp(f, q);
    const w = ctx.createOscillator(); w.frequency.value = 0.25 + Math.random() * 0.9; w.connect(this._g(f * 0.018)).connect(bp.frequency); w.start();
    loopN(this.white).connect(bp).connect(this._g(lvl * 7)).connect(flutter);
  }
  const core = ctx.createOscillator(); core.type = 'triangle'; core.frequency.value = 2380;
  const cw = ctx.createOscillator(); cw.frequency.value = 0.4; cw.connect(this._g(40)).connect(core.frequency); cw.start();
  core.connect(this._g(0.12)).connect(flutter); core.start();
  // shoes grinding on the tyres
  const lpb = loopN(this._brownBuf ?? this.white);
  lpb.connect(this._bp(300, 0.8)).connect(this._g(1.2)).connect(grind);
  loopN(this.white).connect(this._bp(900, 1.4)).connect(this._g(0.15)).connect(grind);
  this._bk = { sq, grind };
  return this._bk;
};
// level 0..1 (how hard the brakes are on, already scaled for distance); speed in m/s
P.setTrainBrake = function (level, speed = 0) {
  if (!this.ctx) return;
  if (level <= 0.001 && !this._bk) return;
  const B = this._brakeGraph(), t = this.ctx.currentTime;
  const slow = clamp01(1 - speed / 14);
  B.sq.gain.setTargetAtTime(level * (0.012 + 0.03 * slow * slow) * (speed > 0.25 ? 1 : 0), t, 0.12);
  B.grind.gain.setTargetAtTime(level * 0.11 * clamp01(0.25 + speed / 12) * (speed > 0.2 ? 1 : 0), t, 0.15);
};
// the vacuum/air brakes let off once the train has stopped: a long "pssshhhh" and a soft clunk
P.brakeHiss = function (v = 1) {
  if (!this.ctx || v <= 0.02) return;
  const t = this.ctx.currentTime + 0.05;
  const n = this._noise(t, 2.6), hp = this._bp(1500, 0.5, 'highpass'), bp = this._bp(4200, 0.5), g = this._g(0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.11 * v, t + 0.04); g.gain.setValueAtTime(0.1 * v, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0005, t + 2.4);
  n.connect(hp).connect(bp).connect(g).connect(this.master);
  const k = this._noise(t, 0.2), kl = this._bp(180, 0.8, 'lowpass'), kg = this._g(0);
  kg.gain.setValueAtTime(0, t); kg.gain.linearRampToValueAtTime(0.3 * v, t + 0.005); kg.gain.exponentialRampToValueAtTime(0.0005, t + 0.16);
  k.connect(kl).connect(kg).connect(this.master);
};

// ---------- electric horns ----------
// Each horn is a steel diaphragm buzzing at its note (a narrow pulse, full of harmonics) driven slightly into
// distortion, through a small trumpet that lifts a band round 2.5 kHz. A pair a few semitones apart beat
// against each other. The note bends in as the diaphragm gets going and drops as the current is cut.
P._elecHorn = function ({ freqs, times, vol, res = 2500, drive = 2.2, duty = 0.28 }) {
  if (!this.ctx || vol <= 0.002) return;
  const ctx = this.ctx;
  for (const [dt, dur] of times) {
    const t = ctx.currentTime + 0.02 + dt, end = t + dur;
    const out = this._g(0);
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(vol * 1.15, t + 0.006); out.gain.linearRampToValueAtTime(vol, t + 0.04);
    out.gain.setValueAtTime(vol, end - 0.02); out.gain.linearRampToValueAtTime(0, end + 0.025);
    const sum = this._g(0.5), sh = this._soft(drive);
    const hp = this._bp(280, 0.7, 'highpass'), pk = this._bp(res, 1.4, 'peaking'), pk2 = this._bp(res * 1.85, 2, 'peaking'), lp = this._bp(7500, 0.6, 'lowpass');
    pk.gain.value = 9; pk2.gain.value = 5;
    sum.connect(sh).connect(hp).connect(pk).connect(pk2).connect(lp).connect(out).connect(this.master);
    for (const f of freqs) {
      const o = ctx.createOscillator(); o.setPeriodicWave(this._pulseWave(duty, 40, 0.9));
      o.frequency.setValueAtTime(f * 0.96, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      o.frequency.setValueAtTime(f, end - 0.01); o.frequency.exponentialRampToValueAtTime(f * 0.95, end + 0.03);
      this._wander(t, dur + 0.05, 40, f * 0.003, o.frequency);
      o.connect(sum); o.start(t); o.stop(end + 0.05);
    }
    // the click of the contacts
    const c = this._noise(t, 0.012), cg = this._g(0.06 * vol / 0.06);
    c.connect(this._bp(3000, 0.8)).connect(cg).connect(this.master);
  }
};
// the car: a quick "peep" and a longer "peeep" on two disc horns
P.carHorn = function (v = 1) { this._elecHorn({ freqs: [418, 510], times: [[0, 0.17], [0.25, 0.52]], vol: 0.055 * v }); };
// the jeep: deeper, harder, punchier
P.jeepHorn = function (v = 1) { this._elecHorn({ freqs: [352, 428], times: [[0, 0.15], [0.22, 0.32]], vol: 0.06 * v, res: 2100, drive: 3 }); };

// ---------- the bus's pressure horn ----------
// Three brass trumpets on compressed air: the reeds start low and climb to pitch as the air comes up, the
// bells colour it with a few broad formants, and a little air roars through. Indian buses lean on it — a
// short "paa" then a long "paaaam".
P.busHorn = function (v = 1) {
  if (!this.ctx || v <= 0.02) return;
  const ctx = this.ctx;
  const lp = this._bp(1800 + 6000 * v, 0.5, 'lowpass');
  lp.connect(this.master);
  for (const [dt, dur] of [[0, 0.32], [0.42, 0.95]]) {
    const t = ctx.currentTime + 0.02 + dt, end = t + dur;
    const out = this._g(0);
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.07 * v, t + 0.07); out.gain.setValueAtTime(0.075 * v, end - 0.05); out.gain.exponentialRampToValueAtTime(0.0005, end + 0.12);
    const sum = this._g(0.4), sh = this._soft(2.6);
    sum.connect(sh);
    for (const [f, q, lvl] of [[620, 1.3, 1], [1250, 2, 0.6], [2650, 3, 0.35], [3900, 4, 0.12]]) sh.connect(this._bp(f, q)).connect(this._g(lvl * 2.2)).connect(out);
    sh.connect(this._bp(180, 0.7, 'lowpass')).connect(this._g(0.3)).connect(out);
    out.connect(lp);
    for (const f of [233, 294, 349]) {
      const o = ctx.createOscillator(); o.setPeriodicWave(this._pulseWave(0.42, 40, 1));
      o.frequency.setValueAtTime(f * 0.8, t); o.frequency.exponentialRampToValueAtTime(f * 0.98, t + 0.09); o.frequency.exponentialRampToValueAtTime(f, t + 0.2);
      o.frequency.setValueAtTime(f, end); o.frequency.exponentialRampToValueAtTime(f * 0.9, end + 0.12);
      this._wander(t, dur + 0.15, 9, f * 0.004, o.frequency);
      o.connect(sum); o.start(t); o.stop(end + 0.15);
    }
    const a = this._noise(t, dur + 0.1), ag = this._g(0);
    ag.gain.setValueAtTime(0, t); ag.gain.linearRampToValueAtTime(0.025 * v, t + 0.04); ag.gain.linearRampToValueAtTime(0.008 * v, t + 0.25); ag.gain.linearRampToValueAtTime(0, end + 0.1);
    a.connect(this._bp(1600, 0.8)).connect(ag).connect(lp);
  }
};

// ---------- the army helicopter ----------
// A big four-bladed military helicopter: each blade passing slaps the air (a sharp pulse driving a burst of
// low noise — the "whop"), harder under load; the tail rotor buzzes several times faster; two turboshafts
// whine high above a broad roar. rpm 0..1, load 0..1.
P._heliGraph = function () {
  if (this._hg) return this._hg;
  const ctx = this.ctx, t = ctx.currentTime;
  const loopN = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, Math.random() * 3); return s; };
  const g = this._g(0); g.connect(this.master);
  // blade slap: a pulse train opening a gate on low noise, plus the pulse itself as a thump
  const bp = ctx.createOscillator(); bp.setPeriodicWave(this._pulseWave(0.12, 32, 0.6)); bp.frequency.value = 12; bp.start();
  const gate = this._g(0.15);
  const depth = this._g(0.9); bp.connect(depth).connect(gate.gain);
  loopN(this.white).connect(this._bp(520, 0.7, 'lowpass')).connect(this._g(2.6)).connect(gate);
  loopN(this.white).connect(this._bp(1400, 1)).connect(this._g(0.35)).connect(gate);
  const slapLp = this._bp(1200, 0.6, 'lowpass');
  gate.connect(slapLp).connect(g);
  const thump = this._g(0.5); bp.connect(this._bp(160, 0.8, 'lowpass')).connect(thump).connect(g);
  // tail rotor buzz
  const tr = ctx.createOscillator(); tr.type = 'sawtooth'; tr.frequency.value = 62; tr.start();
  const trg = this._g(0); tr.connect(this._bp(420, 1.2)).connect(trg).connect(g);
  // turbines
  const whine = this._g(0); whine.connect(this.master);
  const w1 = ctx.createOscillator(); w1.type = 'sine'; w1.frequency.value = 1500; w1.connect(this._g(1)).connect(whine); w1.start();
  const w2 = ctx.createOscillator(); w2.type = 'sine'; w2.frequency.value = 3040; w2.connect(this._g(0.35)).connect(whine); w2.start();
  const w3 = ctx.createOscillator(); w3.type = 'triangle'; w3.frequency.value = 6100; w3.connect(this._g(0.12)).connect(whine); w3.start();
  loopN(this.white).connect(this._bp(5500, 0.9)).connect(this._g(0.25)).connect(whine);
  // the roar of the exhausts and the downwash
  const roar = this._g(0); roar.connect(this.master);
  loopN(this._brownBuf ?? this.white).connect(this._bp(260, 0.6, 'lowpass')).connect(this._g(1.5)).connect(roar);
  loopN(this.white).connect(this._bp(700, 0.5)).connect(this._g(0.12)).connect(roar);
  this._hg = { g, bp, depth, slapLp, thump, tr, trg, whine, w1, w2, w3, roar };
  return this._hg;
};
P.setHeli = function (on, rpm = 0, load = 0.5) {
  if (!this.ctx) return;
  if (!on && rpm <= 0.02 && !this._hg) return;
  if (this.heliV) this.heliV.g.gain.value = 0, this.heliV.whine.gain.value = 0; // the old, simpler voice stays silent
  const H = this._heliGraph(), t = this.ctx.currentTime;
  const live = on || rpm > 0.03 ? 1 : 0;
  H.bp.frequency.setTargetAtTime(1 + rpm * 12.5, t, 0.25);
  H.depth.gain.setTargetAtTime(0.5 + load * 0.6, t, 0.3);
  H.slapLp.frequency.setTargetAtTime(500 + load * 1400, t, 0.3);
  H.g.gain.setTargetAtTime(live * rpm * (0.055 + load * 0.06), t, 0.3);
  H.thump.gain.setTargetAtTime(0.25 + load * 0.5, t, 0.3);
  H.tr.frequency.setTargetAtTime(8 + rpm * 62, t, 0.3);
  H.trg.gain.setTargetAtTime(live * rpm * 0.2, t, 0.3);
  H.w1.frequency.setTargetAtTime(500 + rpm * 1100, t, 0.6);
  H.w2.frequency.setTargetAtTime(1030 + rpm * 2210, t, 0.6);
  H.w3.frequency.setTargetAtTime(2000 + rpm * 4300, t, 0.6);
  H.whine.gain.setTargetAtTime(rpm > 0.02 ? 0.005 + rpm * 0.012 : 0, t, 0.5);
  H.roar.gain.setTargetAtTime(live * rpm * (0.05 + load * 0.06), t, 0.4);
};

// ---------- animals ----------
// The voice used by every animal: a glottal pulse rather than a bare sawtooth, the pitch never quite steady
// (jitter), a little sub-harmonic growl when rough, breath noise through the same formants, and four
// formants instead of three, so lows, moos, bleats and grunts sound like throats rather than synths.
P.voice = function ({ dur, pitch, f1, f2, f3 = [[0, 2400], [1, 2300]], f4 = null, amp = 0.1, rough = 0, breath = 0.03, vib = 0, attack = 0.12, release = 0.3, jitter = 0.012, pan = null }) {
  if (!this.ctx) return;
  const ctx = this.ctx, t = ctx.currentTime + 0.02;
  const ramp = (param, pts, k = 1) => { param.setValueAtTime(pts[0][1] * k, t); for (const [u, v] of pts.slice(1)) param.linearRampToValueAtTime(v * k, t + u * dur); };
  const out = this._g(0);
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(amp, t + attack * dur); out.gain.setValueAtTime(amp * 0.9, t + (1 - release) * dur); out.gain.exponentialRampToValueAtTime(0.0002, t + dur);
  const pn = ctx.createStereoPanner(); pn.pan.value = pan ?? (Math.random() * 0.5 - 0.25); pn.connect(this.master);
  out.connect(pn);
  const src = this._g(1);
  const stops = [];
  const det = 0.97 + Math.random() * 0.06;
  for (const d of [1, 1.004]) {
    const o = ctx.createOscillator(); o.setPeriodicWave(this._glottal());
    ramp(o.frequency, pitch, det * d);
    this._wander(t, dur + 0.1, 18, pitch[0][1] * jitter, o.frequency);
    if (vib) { const l = ctx.createOscillator(); l.frequency.value = 5 + Math.random() * 2; l.connect(this._g(pitch[0][1] * vib)).connect(o.frequency); l.start(t); stops.push(l); }
    o.connect(this._g(0.55)).connect(src); o.start(t); stops.push(o);
  }
  if (rough) {
    // a throat too big and slack to keep time: a sub-harmonic and a flutter in the loudness
    const sub = ctx.createOscillator(); sub.setPeriodicWave(this._glottal()); ramp(sub.frequency, pitch, det * 0.5);
    sub.connect(this._g(rough * 0.7)).connect(src); sub.start(t); stops.push(sub);
    const l = ctx.createOscillator(); l.frequency.value = 22 + Math.random() * 12; l.connect(this._g(rough * 0.8)).connect(src.gain); l.start(t); stops.push(l);
  }
  const br = this._noise(t, dur + 0.1);
  br.connect(this._g(breath * 7)).connect(src);
  const F4 = f4 ?? f3.map(([u, v]) => [u, v * 1.38]);
  for (const [pts, q, lvl] of [[f1, 6, 1], [f2, 8, 0.5], [f3, 9, 0.22], [F4, 10, 0.1]]) {
    const f = this._bp(1000, q); ramp(f.frequency, pts);
    src.connect(f).connect(this._g(lvl * 1.15)).connect(out);
  }
  // a touch of the raw source low down, for body
  src.connect(this._bp(Math.max(60, pitch[0][1] * 1.5), 0.7, 'lowpass')).connect(this._g(0.12)).connect(out);
  for (const n of stops) n.stop(t + dur + 0.1);
};

// a dog: "wuf! wuf-wuf" — a hard onset, the mouth opening then closing on each bark, a rough throat
P.bark = function (v = 1) {
  if (!this.ctx) return;
  const n = 1 + Math.floor(Math.random() * 3), big = 0.85 + Math.random() * 0.35;
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      if (!this.ctx) return;
      const p = (330 + Math.random() * 90) / big;
      this.voice({ dur: 0.16 + Math.random() * 0.06, amp: 0.36 * v, rough: 0.25, breath: 0.09, attack: 0.08, release: 0.55, jitter: 0.03,
        pitch: [[0, p * 1.15], [0.3, p * 1.3], [1, p * 0.75]],
        f1: [[0, 500 / big], [0.3, 900 / big], [1, 450 / big]], f2: [[0, 1300], [0.3, 1700], [1, 1200]], f3: [[0, 2600], [1, 2400]] });
      // the burst of air as the mouth snaps open
      const t = this.ctx.currentTime + 0.02, s = this._noise(t, 0.06), g = this._g(0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.06);
      s.connect(this._bp(1700, 1)).connect(g).connect(this.master);
    }, i * (230 + Math.random() * 120));
  }
};

// the peacock's piercing "may-AWW" (a short rising note, then a long loud one), repeated two or three times
P.peacock = function (v = 1) {
  if (!this.ctx || v <= 0.02) return;
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      if (!this.ctx) return;
      this.voice({ dur: 0.18, amp: 0.1 * v, breath: 0.02, attack: 0.15, jitter: 0.02,
        pitch: [[0, 520], [1, 760]], f1: [[0, 900], [1, 1200]], f2: [[0, 1900], [1, 2300]], f3: [[0, 3200], [1, 3400]] });
      setTimeout(() => this.ctx && this.voice({ dur: 0.55, amp: 0.15 * v, breath: 0.03, rough: 0.05, attack: 0.08, release: 0.4, jitter: 0.015, vib: 0.01,
        pitch: [[0, 820], [0.2, 1020], [0.7, 960], [1, 780]], f1: [[0, 1250], [0.3, 1400], [1, 1100]], f2: [[0, 2500], [0.3, 2700], [1, 2400]], f3: [[0, 3800], [1, 3600]] }), 200);
    }, i * 950);
  }
};

// an elephant's trumpet: air blasted through the trunk — brassy, very rough, sliding up and breaking
P.trumpet = function (d) {
  const v = this._vol(d, 300); if (!this.ctx || !v) return;
  const dur = 1.1 + Math.random() * 0.5;
  this.voice({ dur, amp: 0.2 * v, rough: 0.55, breath: 0.12, attack: 0.06, release: 0.35, jitter: 0.05, vib: 0.03,
    pitch: [[0, 360], [0.15, 560], [0.6, 520], [0.85, 610], [1, 380]],
    f1: [[0, 800], [0.3, 1100], [1, 900]], f2: [[0, 1800], [0.3, 2200], [1, 1900]], f3: [[0, 3000], [1, 3200]] });
  // and a rumble underneath, felt as much as heard
  setTimeout(() => this.ctx && this.voice({ dur: 1.4, amp: 0.12 * v, rough: 0.6, breath: 0.03, attack: 0.25, pitch: [[0, 34], [0.5, 40], [1, 30]],
    f1: [[0, 160], [1, 180]], f2: [[0, 420], [1, 380]], f3: [[0, 900], [1, 900]] }), dur * 700);
};

// a rooster: "ku-ku-ru-kooo" — three clipped notes climbing, then one long strangled one falling away
P.rooster = function (v) {
  if (!this.ctx || v <= 0.03) return;
  const parts = [[0, 0.13, 560, 640], [0.17, 0.13, 680, 760], [0.34, 0.16, 760, 860], [0.55, 0.85, 900, 620]];
  for (const [at, dur, a, b] of parts) {
    setTimeout(() => this.ctx && this.voice({ dur, amp: 0.085 * v, rough: 0.12, breath: 0.05, attack: 0.12, release: 0.35, jitter: 0.03, vib: dur > 0.5 ? 0.02 : 0,
      pitch: [[0, a], [0.3, b], [1, b * 0.94]], f1: [[0, 1100], [1, 1300]], f2: [[0, 2300], [1, 2100]], f3: [[0, 3500], [1, 3300]] }), at * 1000);
  }
};

// a hen's cluck: a short throaty "buk"
P.cluck = function (v = 1) {
  if (!this.ctx || v <= 0.03) return;
  const n = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) setTimeout(() => this.ctx && this.voice({ dur: 0.09 + Math.random() * 0.04, amp: 0.09 * v, rough: 0.2, breath: 0.04, attack: 0.1, release: 0.6, jitter: 0.04,
    pitch: [[0, 300], [0.3, 380], [1, 260]], f1: [[0, 700], [1, 900]], f2: [[0, 1600], [1, 1500]], f3: [[0, 2800], [1, 2800]] }), i * 140);
};

// ---------- sirens ----------
// The ambulance's electronic wail sweeping up and down; the fire tender's slower, deeper mechanical wail with
// a growl in it. Both a bright, buzzy tone through a horn-shaped band, swept by a slow oscillator.
P.setSiren = function (kind, on = true) {
  if (!this.ctx) return;
  const ctx = this.ctx, t = ctx.currentTime;
  if (!this._sir) {
    const g = this._g(0), o = ctx.createOscillator(); o.setPeriodicWave(this._pulseWave(0.45, 24, 1));
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; const depth = this._g(300);
    lfo.connect(depth).connect(o.frequency);
    const sh = this._soft(1.8), bp = this._bp(1100, 0.9), pk = this._bp(2400, 1.5, 'peaking'); pk.gain.value = 5;
    o.connect(sh).connect(bp).connect(pk).connect(g).connect(this.master);
    o.start(); lfo.start();
    this._sir = { g, o, lfo, depth, bp };
  }
  const S = this._sir;
  if (kind && on) {
    const fire = kind === 'firetruck', pol = kind === 'police';
    // the fire tender: a slow, deep wail; the ambulance: a quicker, higher one; the police: a fast yelp
    S.o.frequency.setTargetAtTime(fire ? 720 : pol ? 880 : 980, t, 0.05);
    S.depth.gain.setTargetAtTime(fire ? 330 : pol ? 290 : 380, t, 0.05);
    S.lfo.frequency.setTargetAtTime(fire ? 0.2 : pol ? 2.6 : 0.42, t, 0.05);
    S.bp.frequency.setTargetAtTime(fire ? 850 : pol ? 1000 : 1150, t, 0.05);
    S.g.gain.setTargetAtTime(fire ? 0.06 : 0.05, t, 0.15);
  } else S.g.gain.setTargetAtTime(0, t, 0.2);
};

// ---------- fire ----------
// striking a match: a dry scrape, a flaring hiss as the head catches
P.matchStrike = function () {
  if (!this.ctx) return;
  const t = this.ctx.currentTime + 0.01;
  const sc = this._noise(t, 0.16), sf = this._bp(3200, 1.2), sg = this._g(0);
  sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.16, t + 0.02); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  sc.connect(sf).connect(sg).connect(this.master);
  const fl = this._noise(t + 0.08, 0.7), ff = this._bp(1400, 0.6), fg = this._g(0);
  fg.gain.setValueAtTime(0, t + 0.08); fg.gain.linearRampToValueAtTime(0.09, t + 0.13); fg.gain.exponentialRampToValueAtTime(0.002, t + 0.75);
  fl.connect(ff).connect(fg).connect(this.master);
};
// the fire tender's hose: the hiss of the spray over the low gush of water through the pump (0..1)
P.setHose = function (level = 0) {
  if (!this.ctx) return;
  const t = this.ctx.currentTime;
  if (!this._hoseG) {
    if (level <= 0.01) return;
    const s = this.ctx.createBufferSource(); s.buffer = this.white; s.loop = true; s.start(t, Math.random());
    this._hoseG = this._g(0);
    const hiss = this._bp(2600, 0.7), hg = this._g(0.55);
    const gush = this._bp(380, 0.8, 'lowpass'), gg = this._g(1.1);
    s.connect(hiss).connect(hg).connect(this._hoseG);
    s.connect(gush).connect(gg).connect(this._hoseG);
    this._hoseG.connect(this.master);
  }
  this._hoseG.gain.setTargetAtTime(Math.min(0.2, level * 0.2), t, level > 0.02 ? 0.08 : 0.15);
};
// a fire's voice: a low roar that grows with the blaze, and the snap and pop of burning straw and wood
P.setFire = function (roar = 0, crackle = 0) {
  if (!this.ctx) return;
  const t = this.ctx.currentTime;
  if (!this._fireG) {
    if (roar <= 0.001) return;
    const s = this.ctx.createBufferSource(); s.buffer = this._brownBuf ?? this.white; s.loop = true; s.start(t, Math.random() * 3);
    this._fireG = this._g(0);
    s.connect(this._bp(420, 0.5, 'lowpass')).connect(this._fireG).connect(this.master);
  }
  this._fireG.gain.setTargetAtTime(Math.min(0.22, roar * 0.16), t, 0.3);
  // pops: a few a second, more the bigger the fire
  this._popT = (this._popT ?? 0) - 1 / 60;
  if (crackle > 0.02 && this._popT <= 0) {
    this._popT = 0.05 + Math.random() * 0.3 / Math.min(3, crackle + 0.3);
    const at = t + Math.random() * 0.02, n = this._noise(at, 0.05), f = this._bp(1800 + Math.random() * 3500, 2.5), g = this._g(0);
    const v = Math.min(0.2, 0.05 + crackle * 0.06) * (0.4 + Math.random() * 0.6);
    g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(0.0005, at + 0.02 + Math.random() * 0.04);
    n.connect(f).connect(g).connect(this.master);
  }
};

// ---------- the jungle ----------
// an owl's call: a soft low hoo… hoo-hoo, each note sliding down a little
P.hoot = function (d = 20) {
  if (!this.ctx) return;
  const v = Math.max(0, 1 - d / 90) * 0.09;
  if (v <= 0.002) return;
  const t0 = this.ctx.currentTime + 0.02;
  for (const [st, len] of [[0, 0.42], [0.75, 0.22], [1.05, 0.5]]) {
    const o = this.ctx.createOscillator(), g = this._g(0), t = t0 + st;
    o.type = 'sine'; o.frequency.setValueAtTime(410, t); o.frequency.exponentialRampToValueAtTime(355, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.06); g.gain.setValueAtTime(v, t + len - 0.1); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(this._bp(900, 0.7, 'lowpass')).connect(g).connect(this.master); o.start(t); o.stop(t + len + 0.05);
  }
};
// a parakeet flock going over: a scatter of sharp, scratchy shrieks
P.screech = function (d = 40) {
  if (!this.ctx) return;
  const v = Math.max(0, 1 - d / 150) * 0.05;
  if (v <= 0.002) return;
  const t0 = this.ctx.currentTime + 0.02, n = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * (0.09 + Math.random() * 0.12), f = 2400 + Math.random() * 1400, len = 0.07 + Math.random() * 0.06;
    const o = this.ctx.createOscillator(), g = this._g(0);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 1.15, t); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + len);
    o.connect(this._bp(f, 3)).connect(g).connect(this.master); o.start(t); o.stop(t + len + 0.02);
  }
};
// the jungle all round (0..1, how deep in you are): cicadas shrilling in pulses, a lower bed of crickets,
// and now and then a call from the trees — a koel, a bulbul's trill, a far-off whoop
P.setJungle = function (level = 0, night = false) {
  if (!this.ctx) return;
  const t = this.ctx.currentTime;
  if (!this._jg) {
    if (level < 0.02) return;
    const g = this._g(0); g.connect(this.master);
    // cicadas: a high band of noise, chopped up by a fast tremolo, swelling and fading slowly
    const cic = this.ctx.createBufferSource(); cic.buffer = this.white; cic.loop = true; cic.start(t, Math.random() * 3);
    const cg = this._g(0.0); const trem = this.ctx.createOscillator(); trem.frequency.value = 34; trem.connect(this._g(0.5)).connect(cg.gain); trem.start();
    const swell = this.ctx.createOscillator(); swell.frequency.value = 0.09; const sw = this._g(0.25); swell.connect(sw).connect(cg.gain); swell.start();
    cg.gain.value = 0.5;
    cic.connect(this._bp(5200, 6)).connect(cg).connect(g);
    // crickets: lower, softer, steadier
    const cr = this.ctx.createBufferSource(); cr.buffer = this.white; cr.loop = true; cr.start(t, Math.random() * 3);
    const crg = this._g(0.35); const ct = this.ctx.createOscillator(); ct.frequency.value = 17; ct.connect(this._g(0.3)).connect(crg.gain); ct.start();
    cr.connect(this._bp(3400, 10)).connect(crg).connect(g);
    this._jg = g; this._jcall = 3;
  }
  this._jg.gain.setTargetAtTime(Math.min(0.06, level * (night ? 0.06 : 0.045)), t, 0.8);
  // calls from the trees (this is called four times a second)
  this._jcall -= 0.25;
  if (level > 0.25 && this._jcall <= 0) {
    this._jcall = 2.5 + Math.random() * 6;
    const v = level * 0.05, k = Math.random(), at = t + 0.05;
    const tone = (f0, f1, st, len, type = 'sine', vol = v) => { const o = this.ctx.createOscillator(), g = this._g(0); o.type = type; o.frequency.setValueAtTime(f0, at + st); o.frequency.exponentialRampToValueAtTime(f1, at + st + len); g.gain.setValueAtTime(0, at + st); g.gain.linearRampToValueAtTime(vol, at + st + 0.03); g.gain.exponentialRampToValueAtTime(0.0005, at + st + len); o.connect(g).connect(this.master); o.start(at + st); o.stop(at + st + len + 0.05); };
    if (night) { if (k < 0.5) tone(620, 540, 0, 0.5, 'sine', v * 0.6); }
    else if (k < 0.35) { tone(700, 1050, 0, 0.32); tone(760, 1150, 0.45, 0.38); } // the koel: ku-OO, ku-OO
    else if (k < 0.65) { for (let i = 0; i < 5; i++) tone(1800 + Math.random() * 600, 2600 + Math.random() * 500, i * 0.09, 0.08); } // a bulbul's bubbling trill
    else if (k < 0.85) { tone(300, 520, 0, 0.35, 'triangle', v * 0.8); tone(320, 560, 0.4, 0.3, 'triangle', v * 0.7); tone(340, 600, 0.75, 0.4, 'triangle', v * 0.6); } // a langur's whoop, far off
    else { tone(1300, 900, 0, 0.5, 'triangle', v * 0.7); tone(1350, 950, 0.65, 0.5, 'triangle', v * 0.7); } // a peacock somewhere
  }
};
