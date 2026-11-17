// Procedural ambience with WebAudio — no audio files.
// Layers: wind, leaves, river, rain, crickets, cicadas, frogs, birdsong (incl. the koel), owl,
// footsteps, temple bell, cows, barking dogs, and the passing steam train (chuffs + whistle). Sound "themes" set the mix.
export const THEMES = {
  calm: { label: 'Calm afternoon', wind: 0.35, birds: 0.45, koel: 0.12, crickets: 0, cicada: 0.08, rain: 0, frogs: 0, owl: 0 },
  dawn: { label: 'Early-morning birds', wind: 0.08, birds: 1.8, koel: 1, crickets: 0, cicada: 0, rain: 0, frogs: 0, owl: 0 },
  insects: { label: 'Insects & crickets', wind: 0.15, birds: 0.05, koel: 0, crickets: 0.8, cicada: 0.25, rain: 0, frogs: 0.2, owl: 0.4 },
  wind: { label: 'Silence with wind', wind: 0.8, birds: 0.1, koel: 0, crickets: 0, cicada: 0, rain: 0, frogs: 0, owl: 0 },
  rain: { label: 'Rain & frogs', wind: 0.2, birds: 0, koel: 0, crickets: 0.1, cicada: 0, rain: 1, frogs: 0.8, owl: 0 },
  storm: { label: 'Wind & thunder', wind: 0.6, birds: 0, koel: 0, crickets: 0, cicada: 0, rain: 0, frogs: 0.1, owl: 0 },
};

export class Ambience {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.theme = THEMES.calm;
  }

  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.9, ctx.currentTime + 3);
    // Everything goes out through one bus: a little open-air reverb (so nothing sounds like it is inside your
    // head, and the mono layers spread across the stereo field), a soft top-end roll-off to take the edge off
    // the synthetic highs, and a gentle compressor so loud things never jump out.
    {
      const out = ctx.createDynamicsCompressor();
      out.threshold.value = -20; out.knee.value = 18; out.ratio.value = 3; out.attack.value = 0.012; out.release.value = 0.35;
      out.connect(ctx.destination);
      const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 9000; tone.Q.value = 0.4;
      const warm = ctx.createBiquadFilter(); warm.type = 'lowshelf'; warm.frequency.value = 220; warm.gain.value = 2.5;
      tone.connect(warm).connect(out);
      this.master.connect(tone);
      const N = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, N, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < N; i++) {
          const k = i / N, early = i < ctx.sampleRate * 0.03 ? 0.25 : 1;
          lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.42 * k); // the tail gets darker as it dies away
          d[i] = lp * Math.pow(1 - k, 3.4) * early;
        }
      }
      const rev = ctx.createConvolver(); rev.buffer = ir;
      const send = ctx.createGain(); send.gain.value = 0.3;
      this.master.connect(send).connect(rev).connect(tone);
    }

    const len = ctx.sampleRate * 4;
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const pink = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = white.getChannelData(0), b = brown.getChannelData(0), pk = pink.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last * 3.5;
      b0 = 0.99765 * b0 + w[i] * 0.099; b1 = 0.963 * b1 + w[i] * 0.2965; b2 = 0.57 * b2 + w[i] * 1.0526;
      pk[i] = (b0 + b1 + b2 + w[i] * 0.1848) * 0.2;
    }
    this.white = white;
    const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 3); return s; };
    const filt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };

    // wind & leaves
    this.windF = filt('lowpass', 400, 0.8); this.windG = gain(0.2);
    loop(brown).connect(this.windF).connect(this.windG).connect(this.master);
    this.leafF = filt('bandpass', 3200, 0.6); this.leafG = gain(0.02);
    loop(white).connect(this.leafF).connect(this.leafG).connect(this.master);

    // river
    this.riverG = gain(0); this.riverG.connect(this.master);
    loop(white).connect(filt('lowpass', 900)).connect(this.riverG);
    const babble = filt('bandpass', 1100, 4);
    loop(white).connect(babble).connect(gain(0.9)).connect(this.riverG);
    for (const [f, a] of [[0.7, 350], [1.9, 220], [3.3, 140]]) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = f;
      lfo.connect(gain(a)).connect(babble.frequency); lfo.start();
    }

    // rain: soft hiss + low patter
    this.rainG = gain(0); this.rainG.connect(this.master);
    loop(pink).connect(filt('highpass', 900)).connect(filt('lowpass', 7000)).connect(gain(0.9)).connect(this.rainG);
    loop(brown).connect(filt('lowpass', 300)).connect(gain(0.5)).connect(this.rainG);

    // crickets: pulsed tones
    this.cricketG = gain(0); this.cricketG.connect(this.master);
    for (const [f, rate, gate, pan] of [[4300, 32, 1.3, -0.6], [4700, 28, 0.9, 0.5], [3950, 36, 1.7, 0.1]]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const am = gain(0.5);
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = rate; lfo.connect(gain(0.5)).connect(am.gain);
      const gt = gain(0.5);
      const glfo = ctx.createOscillator(); glfo.type = 'square'; glfo.frequency.value = gate; glfo.connect(gain(0.5)).connect(gt.gain);
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      o.connect(am).connect(gt).connect(gain(0.05)).connect(p).connect(this.cricketG);
      o.start(); lfo.start(); glfo.start();
    }
    // cicadas: buzzing band of noise with slow swells
    this.cicadaG = gain(0); this.cicadaG.connect(this.master);
    {
      const am = gain(0.5);
      const lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 45; lfo.connect(gain(0.5)).connect(am.gain);
      const sw = gain(0.5);
      const slfo = ctx.createOscillator(); slfo.frequency.value = 0.08; slfo.connect(gain(0.45)).connect(sw.gain);
      loop(white).connect(filt('bandpass', 5600, 7)).connect(am).connect(sw).connect(gain(0.35)).connect(this.cicadaG);
      lfo.start(); slfo.start();
    }

    // train
    // the train: a rolling roar of steel wheels on steel rails (deeper and duller far off, brighter and harder
    // at speed), and the steam hissing from the engine as it stands at a platform
    this.trainG = gain(0); this.trainG.connect(this.master);
    this.trainLP = filt('lowpass', 160);
    loop(brown).connect(this.trainLP).connect(gain(1.6)).connect(this.trainG);
    this.trainRing = gain(0);
    loop(pink).connect(filt('bandpass', 1400, 2.5)).connect(this.trainRing).connect(this.trainG); // the singing of the rails
    loop(white).connect(filt('bandpass', 700, 1)).connect(gain(0.05)).connect(this.trainG);
    this.steamG = gain(0); this.steamG.connect(this.master);
    loop(white).connect(filt('highpass', 2600, 0.6)).connect(this.steamG);
    this.nextClack = 0; this.nextJoint = 0;

    // two-stroke engines: the moped (under you) and the tractor in the field
    const engine = (base, cutoff) => {
      const g = gain(0); g.connect(this.master);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = base;
      const am = gain(0.5);
      const pulse = ctx.createOscillator(); pulse.type = 'square'; pulse.frequency.value = base / 2;
      pulse.connect(gain(0.5)).connect(am.gain);
      const lp = filt('lowpass', cutoff, 1.5);
      o.connect(am).connect(lp).connect(g);
      loop(brown).connect(filt('bandpass', base * 3, 1)).connect(gain(0.6)).connect(am);
      o.start(); pulse.start();
      return { g, o, pulse, lp, base };
    };
    this.moped = engine(55, 900);
    this.auto = engine(38, 650);
    // ---- ride sounds: a distinct engine voice per vehicle, tyre/road rumble, bicycle chain & freewheel ----
    const voice = (o) => {
      const g = gain(0); g.connect(this.master);
      const lp = filt('lowpass', o.cut, o.q);
      const am = gain(1 - o.depth / 2);
      const osc = [];
      for (const [type, mul, lvl] of o.osc) {
        const x = ctx.createOscillator(); x.type = type; x.frequency.value = o.base * mul;
        x.connect(gain(lvl)).connect(am); x.start(); osc.push({ x, mul });
      }
      const fire = ctx.createOscillator(); fire.type = o.fireType ?? 'square'; fire.frequency.value = o.base * o.fire;
      fire.connect(gain(o.depth / 2)).connect(am.gain); fire.start();
      if (o.noise) loop(brown).connect(filt('bandpass', o.noiseF, 1.2)).connect(gain(o.noise)).connect(am);
      am.connect(lp).connect(g);
      return { ...o, fireR: o.fire, g, lp, osc, fire };
    };
    // A diesel engine, built the way one actually makes its sound: a train of firing pulses (rich in low
    // harmonics, the beat slightly irregular, with a half-speed lump from the crank), a burst of combustion
    // noise on every firing, the metallic tick-tick of the injectors, and the whole lot shaped by the exhaust
    // and body resonances. base: firing rate at idle (Hz); res: the resonances [Hz, gain dB, Q].
    const diesel = (o) => {
      const g = gain(0); g.connect(this.master);
      const lp = filt('lowpass', o.cut, 0.7);
      let node = lp;
      for (const [f, db, q] of o.res) { const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = f; pk.gain.value = db; pk.Q.value = q; node.connect(pk); node = pk; }
      node.connect(g);
      const sum = gain(1); sum.connect(lp);
      // the firing pulses: a waveform with strong, unevenly falling harmonics, like a real exhaust note
      const n = 24, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) im[k] = (1 / Math.pow(k, 0.85)) * (k % 2 ? 1 : 0.7) * (k === 3 ? 1.3 : 1);
      const wave = ctx.createPeriodicWave(re, im);
      const osc = [];
      const main = ctx.createOscillator(); main.setPeriodicWave(wave); main.frequency.value = o.base;
      main.connect(gain(0.55)).connect(sum); osc.push({ x: main, mul: 1 });
      const lump = ctx.createOscillator(); lump.type = 'sine'; lump.frequency.value = o.base / 2;
      lump.connect(gain(o.lump ?? 0.35)).connect(sum); osc.push({ x: lump, mul: 0.5 });
      // the firing isn't perfectly even: a slow random wobble in its rate
      const jit = loop(brown); const jf = filt('lowpass', 9, 0.7); const jg = gain(o.base * 0.05);
      jit.connect(jf).connect(jg); jg.connect(main.frequency); jg.connect(lump.frequency);
      // combustion: a band of noise that bursts on each firing (the pulse train opens and closes it)
      const chuffG = gain(0.15); loop(pink).connect(filt('bandpass', o.chuffF ?? 500, 0.9)).connect(gain(o.chuff ?? 1.1)).connect(chuffG).connect(sum);
      const fire = ctx.createOscillator(); fire.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(10), new Float32Array([0, 1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.12, 0.06, 0.03])));
      fire.frequency.value = o.base; fire.connect(gain(0.6)).connect(chuffG.gain);
      // the diesel clatter: short ticks of bright noise at the firing rate
      const clatG = gain(0); loop(white).connect(filt('bandpass', o.clatF ?? 2600, 2)).connect(gain(o.clatter ?? 0.25)).connect(clatG).connect(g);
      const tick = ctx.createOscillator(); const tr = new Float32Array(32), ti = new Float32Array(32); for (let k = 1; k < 32; k++) ti[k] = 1;
      tick.setPeriodicWave(ctx.createPeriodicWave(tr, ti)); tick.frequency.value = o.base; tick.connect(gain(0.5)).connect(clatG.gain);
      osc.push({ x: tick, mul: 1 });
      for (const x of [main, lump, fire, tick]) x.start();
      return { ...o, fireR: 1, g, lp, osc, fire };
    };
    this.voices = {
      moped: voice({ base: 48, osc: [['sawtooth', 1, 0.8], ['square', 2, 0.25]], fire: 1, depth: 0.7, cut: 1500, q: 3, noise: 0.5, noiseF: 1800, vol: 0.07, gears: [0, 8, 15, 40] }),
      scooter: voice({ base: 36, osc: [['sawtooth', 1, 0.7], ['triangle', 2, 0.35]], fire: 0.5, depth: 0.5, cut: 950, q: 1.6, noise: 0.35, noiseF: 900, vol: 0.075, gears: [0, 5, 10, 16, 40] }),
      auto: voice({ base: 24, osc: [['sawtooth', 1, 0.8], ['square', 1.5, 0.3]], fire: 0.5, depth: 0.9, cut: 520, q: 2, noise: 0.6, noiseF: 2200, vol: 0.11, gears: [0, 5, 10, 30] }),
      minibus: diesel({ base: 27, lump: 0.4, cut: 900, res: [[110, 6, 1.2], [340, 4, 1.5], [900, -3, 1]], chuffF: 420, chuff: 1.2, clatter: 0.22, clatF: 2300, vol: 0.16, gears: [0, 4, 8, 13, 30] }),
      // the e-rickshaw: no engine, just the hub motor's rising electric whine and a little gear hum
      erick: voice({ base: 95, osc: [['sine', 1, 0.7], ['triangle', 2.01, 0.25], ['sine', 3.02, 0.12]], fire: 0.25, fireType: 'sine', depth: 0.08, cut: 2600, q: 1.2, noise: 0.1, noiseF: 3000, vol: 0.035, gears: [0, 40] }),
      bus: diesel({ base: 24, lump: 0.45, cut: 780, res: [[90, 7, 1.1], [300, 4, 1.4], [800, -4, 1]], chuffF: 380, chuff: 1.3, clatter: 0.26, clatF: 2100, vol: 0.19, gears: [0, 3.5, 7, 11, 25] }),
      jeep: diesel({ base: 26, lump: 0.35, cut: 1100, res: [[130, 6, 1.3], [420, 5, 1.6], [1100, -2, 1]], chuffF: 520, chuff: 1.1, clatter: 0.3, clatF: 2800, vol: 0.15, gears: [0, 5, 10, 16, 40] }),
      car: diesel({ base: 27, lump: 0.3, cut: 1150, res: [[140, 5, 1.3], [450, 4, 1.6], [1200, -2, 1]], chuffF: 540, chuff: 1.0, clatter: 0.26, clatF: 2900, vol: 0.14, gears: [0, 5, 10, 15, 21, 45] }),
    };
    // the little plane: a buzzy flat-four, the propeller's thrum, wind over the wings, the stall horn
    {
      const g = gain(0); g.connect(this.master);
      const lp = filt('lowpass', 900, 1.1);
      const am = gain(0.65);
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 40;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 80;
      o1.connect(gain(0.7)).connect(am); o2.connect(gain(0.16)).connect(am);
      const beat = ctx.createOscillator(); beat.frequency.value = 20; beat.connect(gain(0.35)).connect(am.gain);
      loop(brown).connect(filt('bandpass', 260, 0.8)).connect(gain(0.7)).connect(am);
      am.connect(lp).connect(g);
      o1.start(); o2.start(); beat.start();
      const wind = gain(0); wind.connect(this.master);
      const wf = filt('bandpass', 700, 0.5);
      loop(pink).connect(wf).connect(wind);
      const tyre = gain(0); tyre.connect(this.master);
      loop(brown).connect(filt('bandpass', 180, 0.9)).connect(gain(1.2)).connect(tyre);
      const horn = gain(0); horn.connect(this.master);
      const ho = ctx.createOscillator(); ho.type = 'square'; ho.frequency.value = 440; ho.connect(filt('lowpass', 1500, 1)).connect(horn); ho.start();
      this.planeV = { g, lp, o1, o2, beat, wind, wf, tyre, horn };
    }
    // the helicopter: the thud-thud of the blades (noise chopped by the blade pass) over a turbine's whine
    {
      const g = gain(0); g.connect(this.master);
      const chop = gain(0.4);
      const lfo = ctx.createOscillator(); lfo.type = 'sawtooth'; lfo.frequency.value = 12; lfo.connect(gain(0.55)).connect(chop.gain); lfo.start();
      loop(brown).connect(filt('lowpass', 420, 0.9)).connect(gain(2.2)).connect(chop);
      loop(pink).connect(filt('bandpass', 900, 0.7)).connect(gain(0.25)).connect(chop);
      chop.connect(g);
      const whine = gain(0); whine.connect(this.master);
      const w1 = ctx.createOscillator(); w1.type = 'sine'; w1.frequency.value = 900; w1.connect(whine); w1.start();
      const w2 = ctx.createOscillator(); w2.type = 'triangle'; w2.frequency.value = 1810; w2.connect(gain(0.3)).connect(whine); w2.start();
      this.heliV = { g, lfo, whine, w1, w2 };
    }
    this.roadG = gain(0); this.roadG.connect(this.master);
    loop(brown).connect(filt('bandpass', 260, 0.7)).connect(gain(1.4)).connect(this.roadG);
    loop(pink).connect(filt('bandpass', 1400, 0.9)).connect(gain(0.15)).connect(this.roadG);
    this.lapG = gain(0); this.lapG.connect(this.master);
    {
      const am = gain(0.5);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.9; lfo.connect(gain(0.5)).connect(am.gain); lfo.start();
      loop(pink).connect(filt('lowpass', 700, 1)).connect(am).connect(this.lapG);
    }
    this.chainG = gain(0); this.chainG.connect(this.master);
    loop(white).connect(filt('bandpass', 3800, 3)).connect(gain(0.5)).connect(this.chainG);
    this.freewheel = 0;
    this.rideKind = null;
    // the haat's hubbub: many voices, bargaining
    this.marketG = gain(0); this.marketG.connect(this.master);
    {
      const am = gain(0.5);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 3.1; lfo.connect(gain(0.35)).connect(am.gain); lfo.start();
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 4.7; lfo2.connect(gain(0.25)).connect(am.gain); lfo2.start();
      loop(pink).connect(filt('bandpass', 650, 1.4)).connect(am).connect(this.marketG);
      loop(pink).connect(filt('bandpass', 1300, 2.5)).connect(gain(0.4)).connect(this.marketG);
    }
    this.tractor = engine(32, 420);

    this.nextBird = ctx.currentTime + 1.5;
    this.nextKoel = ctx.currentTime + 6;
    this.nextFrog = ctx.currentTime + 2;
    this.nextOwl = ctx.currentTime + 15;
  }

  setTheme(name) {
    this.theme = THEMES[name] || THEMES.calm;
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.3);
  }

  update(gust, riverDist, near, train) {
    if (!this.ctx) return;
    const T = this.theme;
    const t = this.ctx.currentTime;
    const wv = Math.min(1.6, gust) * T.wind;
    this.windG.gain.setTargetAtTime(wv * 0.07, t, 0.8);
    this.windF.frequency.setTargetAtTime(220 + wv * 520, t, 0.6);
    this.leafG.gain.setTargetAtTime(wv * wv * 0.008, t, 0.6);
    const r = Math.max(0, Math.min(1, 1 - (riverDist - 4) / 55));
    this.riverG.gain.setTargetAtTime(r * r * r * 0.45, t, 0.5);
    // close to the water: gurgles and little splashes against the bank
    if (riverDist < 16 && Math.random() < 0.06) this.splash(0.12 + Math.random() * 0.15 * (1 - riverDist / 16));
    this.rainG.gain.setTargetAtTime(T.rain * 0.3, t, 1.5);
    this.cricketG.gain.setTargetAtTime(T.crickets * 0.5, t, 1.5);
    this.cicadaG.gain.setTargetAtTime(T.cicada * 0.12, t, 1.5);

    if (T.birds > 0 && t > this.nextBird) {
      this.chirp();
      this.nextBird = t + (1.2 + Math.random() * 4.5) / T.birds;
    }
    if (T.koel > 0 && t > this.nextKoel) {
      this.koel();
      this.nextKoel = t + (9 + Math.random() * 14) / T.koel;
    }
    if (T.frogs > 0 && t > this.nextFrog) {
      this.frog();
      this.nextFrog = t + (0.6 + Math.random() * 2.5) / T.frogs;
    }
    if (T.owl > 0 && t > this.nextOwl) {
      this.owl();
      this.nextOwl = t + (18 + Math.random() * 25) / T.owl;
    }
    // temple bell: rung as you come up to the temple, now and then while you linger, rarely from afar
    if (near.temple < 11) {
      if (!this.atTemple || t > this.nextBell) {
        const v = 0.7 + 0.3 * (1 - near.temple / 11);
        const n = this.atTemple ? 1 + Math.floor(Math.random() * 2) : 3;
        for (let i = 0; i < n; i++) setTimeout(() => this.bell(v), i * 650);
        this.nextBell = t + 7 + Math.random() * 8;
      }
      this.atTemple = true;
    } else {
      if (near.temple > 14) this.atTemple = false;
      if (near.temple < 40 && Math.random() < 0.002) this.bell(1 - near.temple / 40);
    }
    // the cows near you low every so often
    if (near.cow < 40 && t > (this.nextMoo ?? 0)) { this.moo(Math.max(0.25, 1 - near.cow / 40)); this.nextMoo = t + 14 + Math.random() * 22; }

    // train: the rolling roar by distance and speed; the clickety-clack of the rail joints, timed to the
    // train's real speed (a joint every 13 m of rail, each pair of axles on a bogie going over it: ta-tak);
    // and the hiss of steam while it stands
    const td = train.distance, sp = train.speed ?? 0;
    const tv = train.active ? Math.max(0, Math.min(1, 1 - td / 260)) : 0;
    const roll = Math.min(1, sp / 16);
    this.trainG.gain.setTargetAtTime(tv * tv * (0.15 + 0.6 * roll), t, 0.4);
    this.trainLP.frequency.setTargetAtTime(110 + roll * 260, t, 0.5);
    this.trainRing.gain.setTargetAtTime(roll * roll * 0.05, t, 0.6);
    this.steamG.gain.setTargetAtTime(train.dwell && tv > 0.2 ? tv * tv * 0.035 * (0.7 + 0.3 * Math.sin(t * 0.7)) : 0, t, 0.8);
    if (tv > 0.05 && sp > 1) {
      if (this.nextJoint < t) this.nextJoint = t + 0.05;
      const gap = 13 / sp, axle = 2.4 / sp;
      while (this.nextJoint < t + 0.35) {
        const at = this.nextJoint;
        this.clack(tv, at, sp); this.clack(tv * 0.85, at + axle, sp);
        this.nextJoint += gap * (0.92 + Math.random() * 0.16);
      }
    }
  }

  // kind: bicycle | moped | scooter | auto | car | boat | null. speed in m/s; throttle: accelerating
  setRide(kind, speed, throttle, boost) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [k, v] of Object.entries(this.voices)) {
      if (k !== kind) { v.g.gain.setTargetAtTime(0, t, 0.25); continue; }
      // gears: rpm climbs through each gear's band and drops on the shift
      const G = v.gears;
      let gi = 1;
      while (gi < G.length - 1 && speed > G[gi]) gi++;
      const lo = G[gi - 1], hi = G[gi];
      let rpm = speed < 0.3 ? 0.12 : 0.25 + 0.75 * Math.min(1, (speed - lo) / (hi - lo));
      if (gi === G.length - 1) rpm = Math.min(1.2, 0.3 + (speed - lo) / 20);
      if (throttle) rpm += 0.08;
      if (boost) rpm += 0.2;
      const f = v.base * (1 + rpm * 2.4);
      for (const o of v.osc) o.x.frequency.setTargetAtTime(f * o.mul, t, 0.08);
      v.fire.frequency.setTargetAtTime(f * v.fireR, t, 0.08);
      v.lp.frequency.setTargetAtTime(v.cut * (0.8 + rpm * 1.8) * (boost ? 1.4 : 1), t, 0.1);
      v.g.gain.setTargetAtTime(v.vol * (0.55 + rpm * 0.5 + (throttle ? 0.15 : 0)), t, 0.12);
    }
    const land = kind && kind !== 'boat';
    this.roadG.gain.setTargetAtTime(land ? Math.min(0.14, speed * 0.007) : 0, t, 0.2);
    this.lapG.gain.setTargetAtTime(kind === 'boat' ? 0.03 + Math.min(0.08, speed * 0.04) : 0, t, 0.3);
    // bicycle: a soft chain whirr while pedalling, the tick-tick of the freewheel when coasting
    const bike = kind === 'bicycle';
    this.chainG.gain.setTargetAtTime(bike && throttle ? Math.min(0.025, speed * 0.004) : 0, t, 0.1);
    if (bike && !throttle && speed > 0.8) {
      this.freewheel += speed * 0.06;
      while (this.freewheel > 1) {
        this.freewheel -= 1;
        const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 2400 + Math.random() * 300;
        const g = this.ctx.createGain(); this.env(g, 0.012, 0.001, 0.012, t);
        o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.02);
      }
    }
  }
  // the helicopter: rotor speed 0..1, how hard it's working 0..1
  setHeli(on, rpm = 0, load = 0.5) {
    if (!this.ctx || !this.heliV) return;
    const t = this.ctx.currentTime, H = this.heliV;
    H.lfo.frequency.setTargetAtTime(2 + rpm * 11 + load * 1.5, t, 0.2);
    H.g.gain.setTargetAtTime(on || rpm > 0.05 ? (0.04 + load * 0.05) * rpm : 0, t, 0.3);
    H.w1.frequency.setTargetAtTime(380 + rpm * 620, t, 0.4);
    H.w2.frequency.setTargetAtTime(760 + rpm * 1240, t, 0.4);
    H.whine.gain.setTargetAtTime(rpm > 0.02 ? 0.006 + rpm * 0.01 : 0, t, 0.4);
  }
  // the plane: engine rpm 0..1, airspeed (m/s), rolling on the ground, stall warning
  setPlane(on, rpm = 0, speed = 0, ground = false, stall = false) {
    if (!this.ctx || !this.planeV) return;
    const t = this.ctx.currentTime, P = this.planeV;
    const f = 34 + rpm * 74;
    P.o1.frequency.setTargetAtTime(f, t, 0.15);
    P.o2.frequency.setTargetAtTime(f * 2, t, 0.15);
    P.beat.frequency.setTargetAtTime(f * 0.5, t, 0.15);
    P.lp.frequency.setTargetAtTime(420 + rpm * 1700, t, 0.15);
    P.g.gain.setTargetAtTime(on ? 0.035 + rpm * 0.085 : 0, t, on ? 0.25 : 0.6);
    P.wind.gain.setTargetAtTime(on ? Math.min(0.16, speed * speed * 0.00006) : 0, t, 0.3);
    P.wf.frequency.setTargetAtTime(380 + speed * 16, t, 0.3);
    P.tyre.gain.setTargetAtTime(on && ground ? Math.min(0.14, speed * 0.006) : 0, t, 0.15);
    P.horn.gain.setTargetAtTime(on && stall && Math.sin(t * 14) > 0 ? 0.035 : 0, t, 0.02);
  }
  // rpm 0..1; on/off by gain
  setMoped(on, rpm, pitch = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, e = this.moped;
    e.g.gain.setTargetAtTime(on ? 0.07 + rpm * 0.05 : 0, t, 0.15);
    e.o.frequency.setTargetAtTime(e.base * pitch * (1 + rpm * 1.9), t, 0.2);
    e.pulse.frequency.setTargetAtTime((e.base * pitch / 2) * (1 + rpm * 1.9), t, 0.2);
    e.lp.frequency.setTargetAtTime(700 + rpm * 1600, t, 0.2);
  }
  setAuto(on, rpm) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, e = this.auto;
    e.g.gain.setTargetAtTime(on ? 0.09 + rpm * 0.05 : 0, t, 0.15);
    e.o.frequency.setTargetAtTime(e.base * (1 + rpm * 1.6), t, 0.25);
    e.pulse.frequency.setTargetAtTime((e.base / 2) * (1 + rpm * 1.6), t, 0.25);
    e.lp.frequency.setTargetAtTime(500 + rpm * 1100, t, 0.25);
  }
  setMarket(dist) {
    if (!this.ctx) return;
    const v = Math.max(0, Math.min(1, 1 - dist / 70));
    this.marketG.gain.setTargetAtTime(v * v * 0.09, this.ctx.currentTime, 0.5);
  }
  // a horn built from buzzing reed tones through a resonant bell; pitches/lengths give each its character
  _horn(parts, { form = 1100, q = 2.5, air = 0.02, bend = 0, vib = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const [dt, dur] of parts.times) {
      const t = ctx.currentTime + dt;
      const out = ctx.createGain();
      out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(parts.vol, t + 0.015);
      out.gain.setValueAtTime(parts.vol, t + dur - 0.04); out.gain.linearRampToValueAtTime(0, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = form; f.Q.value = q;
      const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = form * 2.2; f2.gain.value = 6;
      f.connect(f2).connect(out).connect(this.master);
      for (const fr of parts.freqs) {
        const o = ctx.createOscillator(); o.type = parts.type ?? 'square';
        o.frequency.setValueAtTime(fr * (1 + bend), t); o.frequency.exponentialRampToValueAtTime(fr, t + 0.05);
        if (vib) { const l = ctx.createOscillator(); l.frequency.value = 28; const lg = ctx.createGain(); lg.gain.value = fr * vib; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur); }
        o.connect(f); o.start(t); o.stop(t + dur + 0.02);
      }
      if (air) {
        const s = ctx.createBufferSource(); s.buffer = this.white;
        const ag = ctx.createGain(); ag.gain.value = air;
        s.connect(ag).connect(f); s.start(t, Math.random()); s.stop(t + dur);
      }
    }
  }
  // the e-rickshaw's cheap electronic horn: a bright double "pee-peep"
  erickHorn() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const [dt, dur] of [[0, 0.16], [0.22, 0.26]]) {
      const t = ctx.currentTime + dt;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.01); g.gain.setValueAtTime(0.07, t + dur - 0.03); g.gain.linearRampToValueAtTime(0, t + dur);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 1.4;
      f.connect(g).connect(this.master);
      for (const fr of [1180, 1480]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr; o.connect(f); o.start(t); o.stop(t + dur + 0.02); }
    }
  }
  // the auto's squeeze-bulb horn: a rubbery "paa-paa" with air hissing through the reed
  bulbHorn() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const dt of [0, 0.34]) {
      const t = ctx.currentTime + dt;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(250, t); o.frequency.linearRampToValueAtTime(345, t + 0.05); o.frequency.linearRampToValueAtTime(300, t + 0.24);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 850; f.Q.value = 3;
      const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2100; f2.Q.value = 4;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.04); g.gain.linearRampToValueAtTime(0.1, t + 0.18); g.gain.linearRampToValueAtTime(0, t + 0.27);
      o.connect(f).connect(g); o.connect(f2).connect(g); g.connect(this.master);
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const ag = ctx.createGain(); this.env(ag, 0.03, 0.02, 0.25, t);
      s.connect(f).connect(ag).connect(this.master);
      o.start(t); o.stop(t + 0.3); s.start(t, Math.random()); s.stop(t + 0.3);
    }
  }
  // the village bus: a deep, brassy three-tone air horn
  busHorn(v = 1) { this._horn({ times: [[0, 0.5], [0.62, 0.9]], freqs: [196, 247, 294], vol: 0.075 * v, type: 'sawtooth' }, { form: 700, q: 1.1, air: 0.03 }); }
  // the jeep: a quick, punchy "pom-pom"
  jeepHorn(v = 1) { this._horn({ times: [[0, 0.16], [0.22, 0.3]], freqs: [349, 440], vol: 0.07 * v }, { form: 950, q: 1.6, air: 0.01 }); }
  // the little car: a dual-tone "beep beeeep"
  carHorn(v = 1) { this._horn({ times: [[0, 0.22], [0.3, 0.55]], freqs: [415, 523], vol: 0.07 * v }, { form: 1000, q: 1.4, air: 0 }); }
  // scooter: a thin, high "meep-meep"
  scooterHorn(v = 1) { this._horn({ times: [[0, 0.2], [0.27, 0.2]], freqs: [560, 700], vol: 0.06 * v }, { form: 1500, q: 2.2, air: 0.01, vib: 0.006 }); }
  // bat meets tennis ball
  tock(v = 1) {
    if (!this.ctx || v <= 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(400, t + 0.05);
    const g = ctx.createGain(); this.env(g, 0.12 * v, 0.002, 0.07, t);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.1);
  }
  // a trowel tapping a brick home: a short bright ring
  tink(v = 1) {
    if (!this.ctx || v <= 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, a] of [[2650, 1], [4120, 0.5], [6300, 0.25]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * (0.98 + Math.random() * 0.04);
      const g = ctx.createGain(); this.env(g, 0.05 * v * a, 0.001, 0.12, t);
      o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.16);
    }
  }
  // the peacock's loud "may-AWW" call
  peacock(v = 1) {
    if (!this.ctx || v <= 0.02) return;
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(700, t); o.frequency.linearRampToValueAtTime(1150, t + 0.12); o.frequency.linearRampToValueAtTime(950, t + 0.4);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 1.5;
      const g = ctx.createGain(); this.env(g, 0.07 * v, 0.04, 0.38, t);
      o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 0.5);
      t += 0.7;
    }
  }
  // a crash: a low thump, a crunch of noise and, for metal, a clang; v 0..1 loudness, metal 0..1
  crash(v = 1, metal = 1) {
    if (!this.ctx || !(v > 0.02) || !Number.isFinite(metal)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain(); this.env(g, 0.35 * v, 0.003, 0.3, t);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.4);
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + metal * 1400; f.Q.value = 0.7;
    const g2 = ctx.createGain(); this.env(g2, 0.22 * v, 0.002, 0.35 + metal * 0.2, t);
    s.connect(f).connect(g2).connect(this.master); s.start(t, Math.random()); s.stop(t + 0.7);
    if (metal > 0.2) for (const [fr, d] of [[523, 0.6], [787, 0.45], [1240, 0.3]]) {
      const m = ctx.createOscillator(); m.type = 'triangle'; m.frequency.value = fr * (0.9 + Math.random() * 0.2);
      const gm = ctx.createGain(); this.env(gm, 0.035 * v * metal, 0.002, d, t + 0.01);
      m.connect(gm).connect(this.master); m.start(t); m.stop(t + d + 0.1);
    }
  }
  // the minibus door: a pneumatic hiss and a clunk
  busDoor() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 0.8);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t + 0.55); o.frequency.exponentialRampToValueAtTime(60, t + 0.7);
    const g2 = ctx.createGain(); this.env(g2, 0.12, 0.005, 0.15, t + 0.55);
    o.connect(g2).connect(this.master); o.start(t + 0.55); o.stop(t + 0.8);
  }
  // reversing: the beep-beep of a reversing vehicle (soft, so it doesn't nag)
  setReverse(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!on) { this.revT = 0; return; }
    if (t < (this.revT || 0)) return;
    this.revT = t + 0.9;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1150;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.01); g.gain.setValueAtTime(0.025, t + 0.38); g.gain.linearRampToValueAtTime(0, t + 0.4);
    o.connect(lp).connect(g).connect(this.master); o.start(t); o.stop(t + 0.42);
  }
  // nitro kicking in: a rising rush of air
  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 1);
  }
  _vol(d, range) { return Math.max(0, Math.min(1, 1 - d / range)); }
  // the wild: a crocodile's hiss, a tiger's growl and roar, wolves growling and howling
  hiss(d) {
    const v = this._vol(d, 30); if (!this.ctx || !v) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18 * v, t + 0.15); g.gain.linearRampToValueAtTime(0.0001, t + 1.4);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 1.5);
  }
  growl(d, kind = 'tiger') {
    const v = this._vol(d, kind === 'wolf' ? 40 : 60); if (!this.ctx || !v) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = kind === 'wolf' ? 1.4 : 2.0;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(kind === 'wolf' ? 110 : 70, t);
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 22; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'wolf' ? 600 : 400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(am).connect(f).connect(g).connect(this.master); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
  }
  roar(d) {
    const v = this._vol(d, 200); if (!this.ctx || !v) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    // grit: a soft-clipping waveshaper over the whole roar
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 3.5); }
    shaper.curve = curve;
    const out = ctx.createGain(); out.gain.value = 0.9 * v;
    shaper.connect(out).connect(this.master);
    const call = (t, dur, f0, f1, amp) => {
      // throat: a saw driven hard, pitch rising then falling, with a rough flutter (vocal fry)
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur * 0.3); o.frequency.exponentialRampToValueAtTime(f0 * 0.65, t + dur);
      const fry = ctx.createOscillator(); fry.frequency.value = 23; const fg = ctx.createGain(); fg.gain.value = f0 * 0.18;
      fry.connect(fg).connect(o.frequency);
      const am = ctx.createGain(); am.gain.value = 0.7;
      const amo = ctx.createOscillator(); amo.frequency.value = 17; const ag = ctx.createGain(); ag.gain.value = 0.3; amo.connect(ag).connect(am.gain);
      // mouth & chest: two formants plus breath noise
      const f1n = ctx.createBiquadFilter(); f1n.type = 'bandpass'; f1n.Q.value = 1.4;
      f1n.frequency.setValueAtTime(380, t); f1n.frequency.linearRampToValueAtTime(820, t + dur * 0.3); f1n.frequency.exponentialRampToValueAtTime(300, t + dur);
      const f2n = ctx.createBiquadFilter(); f2n.type = 'bandpass'; f2n.Q.value = 2.2; f2n.frequency.value = 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + 0.12); g.gain.setValueAtTime(amp * 0.85, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(am); am.connect(f1n).connect(g); am.connect(f2n).connect(g);
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 650; nb.Q.value = 0.7;
      const ng = ctx.createGain(); ng.gain.value = 0.35; s.connect(nb).connect(ng).connect(g);
      const sub = ctx.createOscillator(); sub.frequency.setValueAtTime(f0 * 0.5, t); sub.frequency.exponentialRampToValueAtTime(f0 * 0.32, t + dur);
      const sg = ctx.createGain(); sg.gain.value = 0.6; sub.connect(sg).connect(g);
      g.connect(shaper);
      for (const n of [o, fry, amo, sub]) { n.start(t); n.stop(t + dur + 0.05); }
      s.start(t, Math.random() * 2); s.stop(t + dur);
    };
    call(t0, 0.35, 70, 95, 0.12); // a grunt
    call(t0 + 0.4, 2.1, 95, 165, 0.32); // the full roar
    call(t0 + 2.7, 0.6, 80, 100, 0.14); // trailing growls
    call(t0 + 3.4, 0.5, 70, 85, 0.1);
  }
  // a hyena's whooping cackle: a run of quick rising yelps
  cackle(d) {
    const v = this._vol(d, 120); if (!this.ctx || !v) return;
    const ctx = this.ctx, t0 = ctx.currentTime, n = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.13 + Math.random() * 0.04), f0 = 520 + Math.random() * 120 + i * 18;
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(f0 * 0.7, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.05); o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.11);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09 * v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 0.13);
    }
  }
  // monkeys: sharp squeaks and chatter
  chatter(d) {
    const v = this._vol(d, 60); if (!this.ctx || !v) return;
    const ctx = this.ctx, t0 = ctx.currentTime, n = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.08 + Math.random() * 0.1), f0 = 1300 + Math.random() * 900;
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (0.6 + Math.random() * 0.3), t + 0.07);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2000; f.Q.value = 2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 0.09);
    }
  }
  // a rhino's or wild buffalo's snort: a burst of breath through the nose, with a low grunt
  snort(d) {
    const v = this._vol(d, 70); if (!this.ctx || !v) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * v, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + 0.55);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.4);
    const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 300;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.12 * v, t + 0.05); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(lf).connect(g2).connect(this.master); o.start(t); o.stop(t + 0.5);
  }
  // an elephant's brassy trumpet
  trumpet(d) {
    const v = this._vol(d, 260); if (!this.ctx || !v) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f0, a] of [[420, 1], [630, 0.5], [840, 0.3]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 0.8, t); o.frequency.linearRampToValueAtTime(f0 * 1.15, t + 0.25); o.frequency.linearRampToValueAtTime(f0, t + 0.9); o.frequency.linearRampToValueAtTime(f0 * 0.7, t + 1.3);
      const vib = ctx.createOscillator(); vib.frequency.value = 14; const vg = ctx.createGain(); vg.gain.value = f0 * 0.03; vib.connect(vg).connect(o.frequency);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12 * a * v, t + 0.08); g.gain.setValueAtTime(0.1 * a * v, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(f).connect(g).connect(this.master); o.start(t); vib.start(t); o.stop(t + 1.5); vib.stop(t + 1.5);
    }
  }
  howl(d) {
    const v = this._vol(d, 350); if (!this.ctx || !v) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(560, t + 0.8); o.frequency.setValueAtTime(560, t + 2.0); o.frequency.linearRampToValueAtTime(380, t + 3.0);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = 8; vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07 * v, t + 0.6); g.gain.setValueAtTime(0.07 * v, t + 2.2); g.gain.linearRampToValueAtTime(0.0001, t + 3.1);
    o.connect(g).connect(this.master); o.start(t); vib.start(t); o.stop(t + 3.2); vib.stop(t + 3.2);
  }
  // Marudhar's folk music drifting from the chhatri: a plucked kamaicha-like melody over a dholak
  setFolk(dist) {
    if (!this.ctx) return;
    const v = Math.max(0, Math.min(1, 1 - dist / 70));
    if (v <= 0) return;
    const t = this.ctx.currentTime;
    if (!this.folkT || t > this.folkT + 4) this.folkT = t;
    const ctx = this.ctx;
    const scale = [0, 2, 4, 7, 9, 12, 14]; // a pentatonic-ish raga flavour
    while (this.folkT < t + 0.3) {
      const nt = this.folkT;
      this.folkStep = (this.folkStep ?? 0) + 1;
      const s = this.folkStep % 16;
      // dholak: dha on 1, ta on 3, a ghost note between
      if (s % 4 === 0 || s % 8 === 3) {
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(s % 8 === 0 ? 110 : 200, nt); o.frequency.exponentialRampToValueAtTime(60, nt + 0.15);
        const g = ctx.createGain(); this.env(g, (s % 8 === 0 ? 0.12 : 0.06) * v, 0.003, 0.18, nt);
        o.connect(g).connect(this.master); o.start(nt); o.stop(nt + 0.2);
      }
      if (s % 2 === 0) {
        const deg = scale[Math.floor((Math.sin(this.folkStep * 0.7) * 0.5 + 0.5) * scale.length) % scale.length];
        const f = 293.7 * Math.pow(2, deg / 12);
        for (const [mul, a] of [[1, 1], [2, 0.35], [3, 0.15]]) {
          const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * mul;
          const g = ctx.createGain(); this.env(g, 0.035 * a * v, 0.005, 0.5, nt);
          o.connect(g).connect(this.master); o.start(nt); o.stop(nt + 0.55);
        }
      }
      this.folkT += 0.18;
    }
  }
  // the mela's loudspeaker: a dhol going dha-dhin-dhin-dha under a reedy shehnai tune, a little tinny and far off
  setMela(dist, night = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.melaBus) {
      this.melaBus = ctx.createGain(); this.melaBus.gain.value = 0;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
      this.melaBus.connect(hp).connect(lp).connect(this.master);
    }
    const v = Math.max(0, Math.min(1, 1 - dist / 110));
    this.melaBus.gain.setTargetAtTime(v * v * (night ? 1.15 : 1), t, 0.4);
    if (v <= 0) { this.melaT = 0; return; }
    if (!this.melaT || t > this.melaT + 2) this.melaT = t;
    const SA = 277.2; // C#
    const tune = [0, 2, 4, 5, 7, 7, 9, 7, 5, 4, 2, 4, 0, -1, 0, 0, 7, 9, 11, 12, 11, 9, 7, 9, 7, 5, 4, 5, 4, 2, 0, 0];
    while (this.melaT < t + 0.35) {
      const nt = this.melaT;
      this.melaStep = (this.melaStep ?? 0) + 1;
      const s16 = this.melaStep % 16;
      // dhol: deep bass on the "dha", a slap on the off-beats
      if ([0, 3, 6, 8, 11, 14].includes(s16)) {
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(s16 % 8 === 0 ? 95 : 130, nt); o.frequency.exponentialRampToValueAtTime(52, nt + 0.18);
        const g = ctx.createGain(); this.env(g, s16 % 8 === 0 ? 0.32 : 0.18, 0.003, 0.22, nt);
        o.connect(g).connect(this.melaBus); o.start(nt); o.stop(nt + 0.25);
      }
      if (s16 % 4 === 2 || s16 === 15) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(520, nt); o.frequency.exponentialRampToValueAtTime(300, nt + 0.05);
        const g = ctx.createGain(); this.env(g, 0.1, 0.002, 0.07, nt);
        o.connect(g).connect(this.melaBus); o.start(nt); o.stop(nt + 0.1);
      }
      // shehnai: one note every two steps, with a slide into it and a quick vibrato
      if (this.melaStep % 2 === 0) {
        const i = (this.melaStep / 2) % tune.length;
        const f = SA * Math.pow(2, tune[i] / 12), held = tune[(i + 1) % tune.length] === tune[i];
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * 0.97, nt); o.frequency.linearRampToValueAtTime(f, nt + 0.04);
        const vib = ctx.createOscillator(); vib.frequency.value = 6.2; const vg = ctx.createGain(); vg.gain.value = f * 0.012; vib.connect(vg).connect(o.frequency);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.6;
        const g = ctx.createGain(); this.env(g, 0.05, 0.02, held ? 0.6 : 0.3, nt);
        o.connect(bp).connect(g).connect(this.melaBus); o.start(nt); o.stop(nt + 0.7); vib.start(nt); vib.stop(nt + 0.7);
      }
      this.melaT += 0.15;
    }
  }
  // The falls: a deep roar you hear (and almost feel) from far off, a broad rush of white noise closer in, and
  // the hiss of spray right beside the pool. Each band falls away with distance at its own rate — the high
  // frequencies die first, which is how distance actually sounds. The level wavers slowly, like real water.
  setFalls(dist) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.fallsG) {
      const mk = (buf, type, f, q, gain) => {
        const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.start(0, Math.random() * 3);
        const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
        // a slow, irregular surge — on its own stage, so it scales with the distance level instead of being
        // added on top of it (which is what let the roar be heard from the far side of the map)
        const surge = ctx.createGain(); surge.gain.value = 1;
        const g = ctx.createGain(); g.gain.value = 0;
        src.connect(fl).connect(surge).connect(g).connect(this.master);
        for (const [rate, depth] of [[0.13, 0.25], [0.37, 0.12]]) { const l = ctx.createOscillator(); l.frequency.value = rate * (0.8 + Math.random() * 0.4); const lg = ctx.createGain(); lg.gain.value = depth; l.connect(lg).connect(surge.gain); l.start(); }
        return { g, gain };
      };
      const len = ctx.sampleRate * 3, brown = ctx.createBuffer(1, len, ctx.sampleRate), pink = ctx.createBuffer(1, len, ctx.sampleRate);
      const bd = brown.getChannelData(0), pd = pink.getChannelData(0);
      let last = 0, b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; bd[i] = last * 3.5; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      this.fallsG = { roar: mk(brown, 'lowpass', 220, 0.6, 0.55), rush: mk(pink, 'bandpass', 900, 0.5, 0.35), hiss: mk(this.white, 'highpass', 3800, 0.4, 0.06) };
    }
    // only heard near the falls: full within ~55 m of the pool, fading to silence by 100 m
    const REACH = 100, u = Math.max(0, Math.min(1, (REACH - dist) / 45)), win = u * u * (3 - 2 * u);
    const k = (r) => win / (1 + (dist / r) ** 2);
    const F = this.fallsG;
    F.roar.g.gain.setTargetAtTime(F.roar.gain * k(90), t, 0.4);
    F.rush.g.gain.setTargetAtTime(F.rush.gain * k(45), t, 0.4);
    F.hiss.g.gain.setTargetAtTime(F.hiss.gain * k(18), t, 0.4);
    // splashes slapping into the pool when you are right there
    if (dist < 30 && Math.random() < 0.25) this.splash(0.15 + Math.random() * 0.2 * (1 - dist / 30));
  }
  setTractor(dist) {
    if (!this.ctx) return;
    const v = Math.max(0, Math.min(1, 1 - dist / 140));
    this.tractor.g.gain.setTargetAtTime(v * v * 0.16, this.ctx.currentTime, 0.4);
  }
  // a moped's squeaky "peep peep"
  mopedHorn(v = 1) { this._horn({ times: [[0, 0.32], [0.42, 0.18]], freqs: [380, 470], vol: 0.065 * v }, { form: 1200, q: 2.8, air: 0.015, vib: 0.01, bend: -0.04 }); }
  mopedHornOld() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (const dt of [0, 0.22]) {
      const t = ctx.currentTime + dt;
      for (const f of [420, 520]) {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.01); g.gain.setValueAtTime(0.05, t + 0.16); g.gain.linearRampToValueAtTime(0, t + 0.19);
        o.connect(lp).connect(g).connect(this.master);
        o.start(t); o.stop(t + 0.2);
      }
    }
  }
  // water: a stroke or a fish dropping back in
  splash(v = 1) {
    if (!this.ctx || v <= 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.25);
    const g = ctx.createGain();
    this.env(g, 0.12 * v, 0.01, 0.28, t);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 3); s.stop(t + 0.35);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(500 + Math.random() * 300, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.06);
    const og = ctx.createGain(); this.env(og, 0.03 * v, 0.005, 0.07, t);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.1);
  }
  // thunder: a sharp crack for close strikes, then a long rolling rumble
  thunder(dist) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const near = Math.max(0, Math.min(1, 1 - dist / 1400));
    const t0 = ctx.currentTime + dist / 343;
    if (near > 0.55) {
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
      const g = ctx.createGain(); this.env(g, 0.35 * near, 0.005, 0.35, t0);
      s.connect(f).connect(g).connect(this.master); s.start(t0, Math.random()); s.stop(t0 + 0.5);
    }
    const dur = 3 + (1 - near) * 3 + Math.random() * 2;
    const s = ctx.createBufferSource(); s.buffer = this.white; s.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(220 + near * 500, t0); lp.frequency.exponentialRampToValueAtTime(70, t0 + dur);
    const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.9 * (0.4 + near * 0.6), t0 + 0.08 + (1 - near) * 0.5);
    // rolling: a few swells as the sound echoes off the hills
    for (let i = 1; i < 5; i++) {
      const tt = t0 + (dur * i) / 5;
      g.gain.linearRampToValueAtTime((0.5 + Math.random() * 0.5) * 0.8 * (0.4 + near * 0.6) * (1 - i / 6), tt);
    }
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    s.connect(lp).connect(lp2).connect(g).connect(this.master);
    s.start(t0, Math.random() * 3); s.stop(t0 + dur + 0.1);
  }

  // ---- the village soundscape: roosters at dawn, cowbells and goats nearby, distant dogs at night, a soft murmur ----
  setVillageLife(dv, preset, season, dGoat) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const near = Math.max(0, Math.min(1, 1 - dv / 140));
    if (!this.lifeG) {
      const ctx = this.ctx;
      this.lifeG = ctx.createGain(); this.lifeG.gain.value = 0; this.lifeG.connect(this.master);
      const src = ctx.createBufferSource(); src.buffer = this.white; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.9;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const am = ctx.createGain(); am.gain.value = 0.6;
      const l1 = ctx.createOscillator(); l1.frequency.value = 0.31; const g1 = ctx.createGain(); g1.gain.value = 0.3; l1.connect(g1).connect(am.gain); l1.start();
      src.connect(bp).connect(lp).connect(am).connect(this.lifeG); src.start();
      this.nextRooster = t + 3; this.nextCowbell = t + 2; this.nextFarDog = t + 8; this.nextBleat = t + 5;
    }
    this.lifeG.gain.setTargetAtTime(0, t, 2); // no background murmur: it read as a hiss
    const morning = preset.key === 'morning';
    if (t > this.nextRooster && near > 0.2 && !preset.night) { this.rooster(near * (morning ? 1 : 0.5)); this.nextRooster = t + (morning ? 6 + Math.random() * 10 : 25 + Math.random() * 40); }
    if (t > this.nextFarDog && preset.night) { this.bark(0.12 + Math.random() * 0.15); this.nextFarDog = t + 12 + Math.random() * 25; }
    if (t > this.nextBleat && dGoat < 25) { this.bleat(1 - dGoat / 25); this.nextBleat = t + 5 + Math.random() * 9; }
    if (t > this.nextCowbell && near > 0.3 && !preset.night) { this.cowbell(near * 0.5); this.nextCowbell = t + 3 + Math.random() * 6; }
    if (t > (this.nextCluck ?? 0) && near > 0.45 && !preset.night) { this.cluck(near * 0.8); this.nextCluck = t + 7 + Math.random() * 16; }
    void season;
  }
  // a hen pottering about: a few soft clucks, the last one rising
  cluck(v = 1) {
    if (!this.ctx || v <= 0.03) return;
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.02;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const last = i === n - 1, f0 = 420 + Math.random() * 90;
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(last ? f0 * 1.7 : f0 * 0.72, t + (last ? 0.16 : 0.06));
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 3;
      const g = ctx.createGain(); this.env(g, 0.03 * v, 0.006, last ? 0.16 : 0.055, t);
      o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + 0.25);
      t += 0.13 + Math.random() * 0.12;
    }
  }
  // a camel: a long gargling groan
  camel(v = 1) {
    if (!this.ctx || v <= 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime, d = 1.3 + Math.random() * 0.6;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(140, t + d * 0.35); o.frequency.linearRampToValueAtTime(80, t + d);
    const gar = ctx.createOscillator(); gar.frequency.value = 23; const gg = ctx.createGain(); gg.gain.value = 22; gar.connect(gg).connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 2.2;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 3;
    const g = ctx.createGain(); this.env(g, 0.07 * v, 0.18, d, t);
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(this.master);
    o.start(t); gar.start(t); o.stop(t + d + 0.3); gar.stop(t + d + 0.3);
  }
  // a sheep: lower and broader than the goats — "baaa"
  baa(v = 1) {
    if (!this.ctx || v <= 0.03) return;
    const p = 0.9 + Math.random() * 0.25;
    this.voice({ dur: 0.7 + Math.random() * 0.4, amp: 0.12 * v, vib: 0.035, rough: 0.12, attack: 0.1,
      pitch: [[0, 225 * p], [0.3, 250 * p], [1, 205 * p]], f1: [[0, 420], [0.25, 700], [1, 620]], f2: [[0, 1300], [0.25, 1500], [1, 1400]], f3: [[0, 2600], [1, 2600]] });
  }
  // a bansuri somewhere across the fields: a slow phrase in a pentatonic raga, breathy, with a little vibrato
  flute(v = 1) {
    if (!this.ctx || v <= 0.03 || (this.fluteUntil ?? 0) > this.ctx.currentTime) return;
    const ctx = this.ctx;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19], base = 392; // Bhoopali on G
    let t = ctx.currentTime + 0.1, deg = 2 + Math.floor(Math.random() * 4);
    const out = ctx.createGain(); out.gain.value = 0.085 * v; out.connect(this.master);
    const n = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      deg = Math.max(0, Math.min(scale.length - 1, deg + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
      const f = base * Math.pow(2, scale[deg] / 12), last = i === n - 1;
      const d = last ? 1.9 : [0.38, 0.55, 0.8, 1.1][Math.floor(Math.random() * 4)];
      const o = ctx.createOscillator(); o.type = 'sine';
      // each note slides up into pitch (a meend) and wavers once it is held
      o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.setValueAtTime(f * 2, t);
      const vib = ctx.createOscillator(); vib.frequency.value = 5.2; const vg = ctx.createGain();
      vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(d, 0.5)); vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.07); g.gain.setValueAtTime(0.85, t + d * 0.7); g.gain.linearRampToValueAtTime(0, t + d + 0.12);
      const g2 = ctx.createGain(); g2.gain.value = 0.12;
      // the breath: a thin band of noise riding on the note
      const br = ctx.createBufferSource(); br.buffer = this.white; br.loop = true;
      const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = f * 2.4; bf.Q.value = 1.2;
      const bg = ctx.createGain(); bg.gain.value = 0.05;
      o.connect(g); o2.connect(g2).connect(g); br.connect(bf).connect(bg).connect(g); g.connect(out);
      for (const x of [o, o2, vib, br]) { x.start(t); x.stop(t + d + 0.2); }
      t += d + (Math.random() < 0.25 ? 0.35 : 0.02);
    }
    this.fluteUntil = t + 4;
  }
  rooster(v) {
    if (!this.ctx || v <= 0.03) return;
    const ctx = this.ctx;
    let t = ctx.currentTime + 0.05;
    for (const [f0, f1, d] of [[700, 820, 0.12], [900, 1000, 0.12], [1000, 1150, 0.15], [1150, 760, 0.7]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + d);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 2;
      const g = ctx.createGain(); this.env(g, 0.045 * v, 0.02, d, t);
      o.connect(f).connect(g).connect(this.master); o.start(t); o.stop(t + d + 0.05);
      t += d + 0.03;
    }
  }
  cowbell(v) {
    if (!this.ctx || v <= 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [f, a] of [[540, 1], [812, 0.6], [1460, 0.3]]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (0.98 + Math.random() * 0.04);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6;
      const g = ctx.createGain(); this.env(g, 0.02 * a * v, 0.003, 0.35, t);
      o.connect(bp).connect(g).connect(this.master); o.start(t); o.stop(t + 0.4);
    }
  }
  // a goat: a nasal, wavering "meh-eh-eh"
  bleat(v) {
    if (!this.ctx || v <= 0.03) return;
    const p = 0.9 + Math.random() * 0.3;
    this.voice({ dur: 0.55 + Math.random() * 0.35, amp: 0.11 * v, vib: 0.045, breath: 0.03, attack: 0.08,
      pitch: [[0, 330 * p], [0.3, 380 * p], [1, 320 * p]], f1: [[0, 560], [0.3, 720], [1, 600]], f2: [[0, 1750], [0.3, 1900], [1, 1800]], f3: [[0, 2900], [1, 2900]] });
  }
  // No synthetic voices: what someone says is handed on as a line of text (a caption), and they act it out.
  say(text, { volume = 1, roman = null } = {}) {
    if (volume > 0.3) this.onSay?.(text, roman);
  }

  env(node, peak, a, d, t0) {
    if (!Number.isFinite(peak) || !Number.isFinite(t0) || !Number.isFinite(a) || !Number.isFinite(d)) { peak = 0; a = Number.isFinite(a) ? a : 0.01; d = Number.isFinite(d) ? d : 0.1; }
    peak = Math.max(0, peak);
    node.gain.setValueAtTime(0, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  // a house crow's harsh "kaa-kaa": a buzzy, falling, nasal call, two or three times
  caw(v = 1) {
    if (!this.ctx || v <= 0.02) return;
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.4 - 0.7; pan.connect(this.master);
    let t = ctx.currentTime + 0.02;
    const n = 1 + Math.floor(Math.random() * 3), f0 = 520 + Math.random() * 160;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'square';
      const g = ctx.createGain();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 2.2;
      const d = 0.26 + Math.random() * 0.08;
      o.frequency.setValueAtTime(f0 * 1.08, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.82, t + d);
      o2.frequency.setValueAtTime(f0 * 0.5, t); o2.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + d);
      this.env(g, 0.05 * v, 0.02, d, t);
      o.connect(bp); o2.connect(bp); bp.connect(g).connect(pan);
      o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
      t += d + 0.12 + Math.random() * 0.06;
    }
  }
  // house sparrows: quick bright cheeps
  sparrow(v = 1) {
    if (!this.ctx || v <= 0.02) return;
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.4 - 0.7; pan.connect(this.master);
    let t = ctx.currentTime + 0.02;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const f = 3600 + Math.random() * 900, d = 0.05 + Math.random() * 0.04;
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.25 : 0.8), t + d);
      this.env(g, 0.03 * v, 0.005, d, t);
      o.connect(g).connect(pan); o.start(t); o.stop(t + d + 0.03);
      t += d + 0.05 + Math.random() * 0.1;
    }
  }
  chirp() {
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.master);
    const kind = Math.random();
    const base = 2200 + Math.random() * 2400;
    const n = 2 + Math.floor(Math.random() * 6);
    let t = ctx.currentTime + 0.05;
    const vol = 0.02 + Math.random() * 0.035;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const d = kind < 0.4 ? 0.06 : kind < 0.8 ? 0.11 : 0.2;
      o.frequency.setValueAtTime(base * (kind < 0.4 ? 1 : 1.25), t);
      o.frequency.exponentialRampToValueAtTime(base * (kind < 0.4 ? 1.5 : kind < 0.8 ? 0.8 : 1.1), t + d);
      this.env(g, vol, 0.01, d, t);
      o.connect(g).connect(pan);
      o.start(t); o.stop(t + d + 0.05);
      t += d + 0.04 + Math.random() * 0.07;
    }
  }

  koel() {
    // the Asian koel's rising "ku-oo, ku-oo"
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    pan.connect(this.master);
    let t = ctx.currentTime + 0.05;
    const reps = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < reps; i++) {
      const f0 = 900 + i * 70;
      for (const [fa, fb, dur] of [[f0, f0 * 1.05, 0.13], [f0 * 1.25, f0 * 1.45, 0.32]]) {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.setValueAtTime(fa, t);
        o.frequency.linearRampToValueAtTime(fb, t + dur);
        this.env(g, 0.05, 0.03, dur, t);
        o.connect(g).connect(pan);
        o.start(t); o.stop(t + dur + 0.1);
        t += dur + 0.06;
      }
      t += 0.45;
    }
  }

  frog() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.master);
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t0 = t + i * 0.22;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(140 + Math.random() * 60, t0);
      o.frequency.linearRampToValueAtTime(110, t0 + 0.16);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 3;
      const g = ctx.createGain();
      this.env(g, 0.05, 0.02, 0.16, t0);
      o.connect(f).connect(g).connect(pan);
      o.start(t0); o.stop(t0 + 0.25);
    }
  }

  owl() {
    const ctx = this.ctx;
    let t = ctx.currentTime;
    for (const [d, gap] of [[0.35, 0.5], [0.25, 0.25], [0.6, 0]]) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(390, t);
      o.frequency.linearRampToValueAtTime(360, t + d);
      this.env(g, 0.04, 0.06, d, t);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + d + 0.1);
      t += d + gap;
    }
  }

  clack(v, at = null, sp = 10) {
    if (!this.ctx || v <= 0.01) return;
    const ctx = this.ctx, t = at ?? ctx.currentTime, k = Math.min(1, sp / 15);
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700 + k * 900; f.Q.value = 3;
    const g = ctx.createGain(); this.env(g, 0.2 * v * v * (0.6 + 0.4 * k), 0.002, 0.05, t);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 3); s.stop(t + 0.08);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.06);
    const og = ctx.createGain(); this.env(og, 0.16 * v * v, 0.002, 0.07, t);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.1);
  }
  // A steam engine's exhaust beat: a blast of steam up the chimney — a booming low thud, a broad roar of
  // noise that sweeps down as the blast dies, and a hissy tail. Slow and long when starting off, short and
  // sharp at speed; every fourth beat (one cylinder end) a touch heavier, as on a real engine.
  chuff(v, sp = 5, n = 0) {
    if (!this.ctx || v <= 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = Math.max(0.1, Math.min(0.55, 0.7 / (1 + sp * 0.35)));
    const heavy = n % 4 === 0 ? 1.25 : 1, a = v * heavy * (0.75 + 0.5 * Math.max(0, 1 - sp / 20));
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(320, t + dur * 0.9); f.Q.value = 0.7;
    const g = ctx.createGain(); this.env(g, 0.2 * a, 0.006, dur, t);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random() * 3); s.stop(t + dur + 0.1);
    const hs = ctx.createBufferSource(); hs.buffer = this.white;
    const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 3200;
    const hg = ctx.createGain(); this.env(hg, 0.04 * a, 0.01, dur * 1.4, t);
    hs.connect(hf).connect(hg).connect(this.master); hs.start(t, Math.random() * 3); hs.stop(t + dur * 1.5 + 0.1);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(85, t); o.frequency.exponentialRampToValueAtTime(42, t + dur * 0.7);
    const og = ctx.createGain(); this.env(og, 0.17 * a, 0.004, dur * 0.7, t);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + dur);
  }
  bark(v = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 0.6 - 0.3;
    pan.connect(this.master);
    let t = ctx.currentTime + 0.02;
    const n = 1 + Math.floor(Math.random() * 3);
    const base = 380 + Math.random() * 120;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.35, t);
      o.frequency.exponentialRampToValueAtTime(base * 0.7, t + 0.13);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
      f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.13);
      const g = ctx.createGain();
      this.env(g, 0.38 * v, 0.008, 0.14, t);
      o.connect(f).connect(g).connect(pan);
      o.start(t); o.stop(t + 0.18);
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1800; nf.Q.value = 1.2;
      const ng = ctx.createGain();
      this.env(ng, 0.14 * v, 0.004, 0.08, t);
      s.connect(nf).connect(ng).connect(pan);
      s.start(t, Math.random() * 3); s.stop(t + 0.12);
      t += 0.22 + Math.random() * 0.12;
    }
  }

  // the bicycle bell: tring-tring
  cycleBell(v = 1) {
    if (!this.ctx || v <= 0.02) return;
    // a thumb-flicked bicycle bell: bright inharmonic partials, the striker rattling on the first ring
    {
    const ctx = this.ctx;
    for (const [dt, a] of [[0, 1], [0.14, 0.85]]) {
      const t = ctx.currentTime + dt;
      for (const [f, p, d] of [[2380, 1, 0.9], [3190, 0.55, 0.6], [4420, 0.35, 0.45], [6050, 0.2, 0.3], [7300, 0.1, 0.2]]) {
        const o = ctx.createOscillator(); o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
        const g = ctx.createGain();
        const trem = ctx.createOscillator(); trem.frequency.value = 32 + Math.random() * 8;
        const tg = ctx.createGain(); tg.gain.value = 0.35 * p * a * v * 0.05;
        trem.connect(tg).connect(g.gain);
        this.env(g, 0.05 * p * a * v, 0.002, d, t);
        o.connect(g).connect(this.master);
        o.start(t); o.stop(t + d + 0.05); trem.start(t); trem.stop(t + d);
      }
    }
    }
    return;
    const ctx = this.ctx;
    for (const dt of [0, 0.16]) {
      const t = ctx.currentTime + dt;
      for (const [f, a] of [[2350, 1], [3480, 0.5], [5200, 0.25]]) {
        const o = ctx.createOscillator(); o.frequency.value = f;
        const g = ctx.createGain();
        const trem = ctx.createOscillator(); trem.frequency.value = 38;
        const tg = ctx.createGain(); tg.gain.value = 0.5;
        trem.connect(tg).connect(g.gain);
        this.env(g, 0.06 * a * v, 0.003, 0.5, t);
        o.connect(g).connect(this.master);
        o.start(t); o.stop(t + 0.6); trem.start(t); trem.stop(t + 0.6);
      }
    }
  }

  horn(v) {
    if (!this.ctx || v <= 0) return;
    const ctx = this.ctx;
    // a steam whistle: a breathy chord that slides up into pitch, long then short
    let t = ctx.currentTime;
    for (const dur of [1.4, 0.6]) {
      for (const [f, a] of [[311, 1], [370, 0.85], [466, 0.7], [622, 0.25]]) {
        // each pipe of the chime: a sine with a little vibrato, sliding up into pitch as the steam pressure rises
        const o = ctx.createOscillator(); o.type = 'sine';
        const vb = ctx.createOscillator(); vb.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = f * 0.006; vb.connect(vg).connect(o.frequency); vb.start(t); vb.stop(t + dur + 0.35);
        o.frequency.setValueAtTime(f * 0.86, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.32);
        o.frequency.setValueAtTime(f, t + dur);
        o.frequency.exponentialRampToValueAtTime(f * 0.96, t + dur + 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.045 * a * v, t + 0.2);
        g.gain.setValueAtTime(0.04 * a * v, t + dur);
        g.gain.linearRampToValueAtTime(0, t + dur + 0.3);
        o.connect(g).connect(this.master);
        o.start(t); o.stop(t + dur + 0.35);
      }
      const s = ctx.createBufferSource(); s.buffer = this.white;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.1;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, t);
      ng.gain.linearRampToValueAtTime(0.05 * v, t + 0.08);
      ng.gain.setValueAtTime(0.035 * v, t + dur);
      ng.gain.linearRampToValueAtTime(0, t + dur + 0.3);
      s.connect(bp).connect(ng).connect(this.master);
      s.start(t, Math.random()); s.stop(t + dur + 0.35);
      t += dur + 0.35;
    }
  }

  footstep(run = 0, land = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.white;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = (land ? 380 : 500) + Math.random() * 300;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    this.env(g, land ? 0.3 : 0.12 + run * 0.08, 0.008, land ? 0.18 : 0.1, t);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 3); s.stop(t + 0.25);
  }

  bell(v) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [f, a, d] of [[820, 1, 3.5], [1656, 0.5, 2.2], [2260, 0.35, 1.6], [3120, 0.18, 1.0]]) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = f;
      this.env(g, 0.06 * a * v, 0.005, d, t);
      o.connect(g).connect(this.master);
      o.start(t); o.stop(t + d + 0.1);
    }
  }

  // An animal's voice, built the way a throat makes one: a buzzing source (the vocal folds — a little unsteady,
  // with some breath in it) shaped by three resonances of the mouth that move as it opens and closes.
  // pitch / f1 / f2 / f3: [[time 0–1, Hz], …] across the call; amp: loudness; rough: a low growly flutter.
  voice({ dur, pitch, f1, f2, f3 = [[0, 2400], [1, 2300]], amp = 0.1, rough = 0, breath = 0.03, vib = 0, attack = 0.12, release = 0.3 }) {
    const ctx = this.ctx, t = ctx.currentTime + 0.02;
    const ramp = (param, pts, k = 1) => { param.setValueAtTime(pts[0][1] * k, t); for (const [u, v] of pts.slice(1)) param.linearRampToValueAtTime(v * k, t + u * dur); };
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(amp, t + attack * dur); out.gain.setValueAtTime(amp * 0.9, t + (1 - release) * dur); out.gain.exponentialRampToValueAtTime(0.0002, t + dur);
    out.connect(this.master);
    const src = ctx.createGain(); src.gain.value = 1;
    const stops = [];
    // two slightly detuned saws make a fuller, less electronic buzz than one
    for (const det of [1, 1.006]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      ramp(o.frequency, pitch, det * (0.97 + Math.random() * 0.06));
      if (vib) { const l = ctx.createOscillator(); l.frequency.value = 5 + Math.random() * 2; const lg = ctx.createGain(); lg.gain.value = pitch[0][1] * vib; l.connect(lg).connect(o.frequency); l.start(t); stops.push(l); }
      const g = ctx.createGain(); g.gain.value = 0.5; o.connect(g).connect(src); o.start(t); stops.push(o);
    }
    // breath through the nose and lips
    const br = ctx.createBufferSource(); br.buffer = this.white; br.loop = true;
    const bg = ctx.createGain(); bg.gain.value = breath * 6; br.connect(bg).connect(src); br.start(t, Math.random() * 2); stops.push(br);
    // the flutter of a big, slack throat
    if (rough) { const l = ctx.createOscillator(); l.frequency.value = 24 + Math.random() * 10; const lg = ctx.createGain(); lg.gain.value = rough; l.connect(lg).connect(src.gain); l.start(t); stops.push(l); }
    for (const [pts, q, lvl] of [[f1, 5, 1], [f2, 7, 0.55], [f3, 8, 0.2]]) {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; ramp(f.frequency, pts);
      const g = ctx.createGain(); g.gain.value = lvl;
      src.connect(f).connect(g).connect(out);
    }
    for (const n of stops) n.stop(t + dur + 0.1);
  }
  // a cow: "mmm-ooo-uh" — lips closed, opening wide and round, the pitch rising then sagging away
  moo(v) {
    if (!this.ctx || v <= 0.03) return;
    const long = Math.random() < 0.6, dur = long ? 1.7 + Math.random() * 0.7 : 0.9 + Math.random() * 0.3, p = 0.9 + Math.random() * 0.25;
    this.voice({ dur, amp: 0.2 * v, rough: 0.22, breath: 0.02,
      pitch: [[0, 92 * p], [0.25, 128 * p], [0.6, 122 * p], [1, 84 * p]],
      f1: [[0, 240], [0.18, 300], [0.4, 520], [0.75, 480], [1, 300]],
      f2: [[0, 880], [0.18, 820], [0.4, 760], [0.75, 900], [1, 980]],
      f3: [[0, 2300], [0.4, 2150], [1, 2300]] });
  }
  // a calf: the same word, higher and thinner
  mooCalf(v) {
    if (!this.ctx || v <= 0.03) return;
    this.voice({ dur: 0.8 + Math.random() * 0.3, amp: 0.13 * v, rough: 0.1, vib: 0.01,
      pitch: [[0, 210], [0.3, 285], [1, 200]], f1: [[0, 320], [0.3, 640], [1, 420]], f2: [[0, 1100], [0.3, 1050], [1, 1250]], f3: [[0, 2700], [1, 2700]] });
  }
  // a water buffalo: a short, deep, closed-mouth grunt — "uunh" — or a calf's bawl
  buffalo(v, calf = false) {
    if (!this.ctx || v <= 0.03) return;
    if (calf) { this.mooCalf(v * 0.8); return; }
    const p = 0.9 + Math.random() * 0.2, dur = 0.55 + Math.random() * 0.5;
    this.voice({ dur, amp: 0.22 * v, rough: 0.4, breath: 0.04, attack: 0.2,
      pitch: [[0, 70 * p], [0.35, 88 * p], [1, 62 * p]],
      f1: [[0, 230], [0.4, 360], [1, 260]], f2: [[0, 700], [0.4, 640], [1, 760]], f3: [[0, 1900], [1, 1900]] });
  }
}
