/* ============================================================================
   70 — PROCEDURAL AUDIO
   Every sound in this build is synthesised at runtime: a generative score with
   mood stems, a physical-ish engine model, footstep impacts, rain beds,
   thunder, UI feedback and spatialised world events. Zero audio assets.
   ============================================================================ */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.mood = 'menu';
    this.beat = 0;
    this.nextBeatTime = 0;
    this.noiseBuf = null;
    this.engine = null;
    this.rainGain = null;
    this.volume = 0.75;
    this.meters = { music: 0.34, sfx: 0.9 };
  }

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 22; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.22;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp); comp.connect(ctx.destination);

    this.musicGain = ctx.createGain(); this.musicGain.gain.value = this.meters.music;
    this.musicGain.connect(this.master);
    this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = this.meters.sfx;
    this.sfxGain.connect(this.master);

    // reverb (synthesised impulse)
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.makeImpulse(2.4, 2.6);
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.28;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);

    // shared noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // persistent rain bed
    const rs = ctx.createBufferSource();
    rs.buffer = buf; rs.loop = true;
    const rbp = ctx.createBiquadFilter();
    rbp.type = 'bandpass'; rbp.frequency.value = 1500; rbp.Q.value = 0.55;
    const rhp = ctx.createBiquadFilter();
    rhp.type = 'highpass'; rhp.frequency.value = 380;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rs.connect(rbp); rbp.connect(rhp); rhp.connect(this.rainGain);
    this.rainGain.connect(this.master);
    rs.start();
    this.rainSrc = rs;

    this.startEngine();
    this.nextBeatTime = ctx.currentTime + 0.1;
    this.ready = true;
  }

  makeImpulse(dur, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate;
    const len = Math.floor(rate * dur);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.2);
      }
    }
    return buf;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  /* ------------------------------------------------------------ utilities */
  tone(freq, dur, o) {
    if (!this.ready) return;
    o = o || {};
    const ctx = this.ctx, t0 = this.t + (o.delay || 0);
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.glide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain === undefined ? 0.16 : o.gain), t0 + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.value = o.fc || 1200; f.Q.value = o.q || 1;
      node.connect(f); node = f;
    }
    node.connect(g);
    const dest = o.verb ? this.verb : (o.dest || this.sfxGain);
    g.connect(dest);
    if (o.pan !== undefined) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1);
      g.disconnect(); g.connect(p); p.connect(dest);
    }
    osc.start(t0); osc.stop(t0 + dur + 0.05);
    return osc;
  }

  noise(dur, o) {
    if (!this.ready) return;
    o = o || {};
    const ctx = this.ctx, t0 = this.t + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.fc || 900, t0);
    if (o.fcTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.fcTo), t0 + dur);
    f.Q.value = o.q === undefined ? 1.2 : o.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain === undefined ? 0.2 : o.gain), t0 + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g);
    g.connect(o.verb ? this.verb : (o.dest || this.sfxGain));
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  /* -------------------------------------------------------------- world */
  step(intensity, surface) {
    const i = clamp(intensity, 0.1, 1.6);
    const hard = surface === 'marble' || surface === 'tile';
    this.noise(0.075, { fc: hard ? 2600 : 900, fcTo: hard ? 700 : 260, q: hard ? 0.8 : 1.6, gain: 0.11 * i, filter: 'bandpass' });
    if (hard) this.tone(rnd(1400, 2100), 0.05, { gain: 0.03 * i, type: 'triangle', fc: 3000, filter: 'highpass' });
    this.tone(rnd(70, 95), 0.10, { gain: 0.06 * i, type: 'sine', glide: 42 });
  }
  jump() { this.noise(0.12, { fc: 700, fcTo: 1800, gain: 0.06 }); }
  land(i) {
    this.tone(60, 0.18, { gain: 0.22 * i, type: 'sine', glide: 34 });
    this.noise(0.14, { fc: 420, fcTo: 120, gain: 0.14 * i });
  }
  vault() {
    this.noise(0.18, { fc: 900, fcTo: 2400, gain: 0.08 });
    this.tone(220, 0.14, { gain: 0.05, type: 'triangle', glide: 420 });
  }
  thud(i) { this.tone(52, 0.32, { gain: 0.3 * i, type: 'sine', glide: 28 }); this.noise(0.2, { fc: 300, gain: 0.16 * i }); }
  crash(i) {
    this.noise(0.42, { fc: 2200, fcTo: 200, q: 0.5, gain: 0.34 * i });
    this.tone(rnd(120, 190), 0.3, { gain: 0.24 * i, type: 'sawtooth', glide: 44, fc: 800, filter: 'lowpass' });
    this.tone(rnd(700, 1100), 0.5, { gain: 0.09 * i, type: 'square', fc: 2400, filter: 'bandpass', q: 4 });
  }
  ui(up) { this.tone(up ? 880 : 520, 0.06, { gain: 0.07, type: 'triangle' }); this.tone(up ? 1320 : 392, 0.09, { gain: 0.045, type: 'sine', delay: 0.035 }); }
  blip(i) { this.tone(440 + i * 130, 0.07, { gain: 0.075, type: 'sine' }); }
  select() { this.tone(660, 0.05, { gain: 0.08, type: 'square', fc: 2000, filter: 'lowpass' }); this.tone(990, 0.08, { gain: 0.05, type: 'sine', delay: 0.04 }); }
  meter(dir) {
    if (dir > 0) { this.tone(523, 0.10, { gain: 0.09, type: 'triangle' }); this.tone(784, 0.16, { gain: 0.07, type: 'sine', delay: 0.07 }); }
    else { this.tone(392, 0.14, { gain: 0.09, type: 'sawtooth', fc: 900, filter: 'lowpass' }); this.tone(233, 0.24, { gain: 0.08, type: 'sine', delay: 0.09 }); }
  }
  keycard(ok) {
    this.tone(ok ? 1180 : 320, 0.09, { gain: 0.10, type: 'square', fc: 2600, filter: 'lowpass' });
    this.tone(ok ? 1560 : 210, 0.13, { gain: 0.08, type: 'square', delay: 0.09, fc: 2600, filter: 'lowpass' });
  }
  evidence() {
    [660, 880, 1174, 1568].forEach((f, i) => this.tone(f, 0.34, { gain: 0.07, type: 'sine', delay: i * 0.055, verb: true }));
  }
  objective() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.26, { gain: 0.075, type: 'triangle', delay: i * 0.08 })); }
  missionDone() { [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.6, { gain: 0.085, type: 'triangle', delay: i * 0.13, verb: true })); }
  alert() { for (let i = 0; i < 3; i++) this.tone(880, 0.14, { gain: 0.09, type: 'square', delay: i * 0.19, fc: 1800, filter: 'lowpass' }); }
  shout() {
    // crude formant "voice" burst
    [520, 1180, 2450].forEach((f, i) => this.tone(f, 0.34, { gain: 0.055 / (i + 1), type: 'sawtooth', fc: f * 1.6, filter: 'bandpass', q: 7 }));
    this.noise(0.3, { fc: 1400, gain: 0.05, q: 0.7 });
  }
  dialogBlip(female) {
    const base = female ? 230 : 132;
    this.tone(base * rnd(0.9, 1.35), 0.055, { gain: 0.035, type: 'square', fc: base * 6, filter: 'lowpass' });
  }
  phone() { [1046, 1318].forEach((f, i) => this.tone(f, 0.16, { gain: 0.06, type: 'sine', delay: i * 0.02 })); }
  heart(i) { this.tone(58, 0.14, { gain: 0.20 * i, type: 'sine', glide: 34 }); this.tone(52, 0.12, { gain: 0.14 * i, type: 'sine', delay: 0.17, glide: 30 }); }

  /* ------------------------------------------------------- pattern sight */
  patternOn() {
    this.psOsc = this.tone ? null : null;
    if (!this.ready) return;
    const ctx = this.ctx, t0 = this.t;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sine'; o1.frequency.value = 74;
    o2.type = 'sine'; o2.frequency.value = 111.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.075, t0 + 0.4);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.42;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    o1.connect(g); o2.connect(g); g.connect(this.master);
    o1.start(t0); o2.start(t0); lfo.start(t0);
    this.psNodes = { o1, o2, lfo, g };
  }
  patternOff() {
    if (!this.psNodes) return;
    const { o1, o2, lfo, g } = this.psNodes;
    const t0 = this.t;
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(g.gain.value, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    o1.stop(t0 + 0.35); o2.stop(t0 + 0.35); lfo.stop(t0 + 0.35);
    this.psNodes = null;
  }

  /* ------------------------------------------------------------- engine */
  startEngine() {
    const ctx = this.ctx, t0 = this.t;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), sub = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square'; sub.type = 'sine';
    o1.frequency.value = 60; o2.frequency.value = 60; sub.frequency.value = 30;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 1.1;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0;
    // induction noise
    const ns = ctx.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 900; nf.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0;
    ns.connect(nf); nf.connect(ng); ng.connect(g);
    o1.connect(lp); o2.connect(bp); bp.connect(lp); sub.connect(lp);
    lp.connect(g); g.connect(this.sfxGain);
    g2.connect(this.sfxGain);
    o1.start(t0); o2.start(t0); sub.start(t0); ns.start(t0);
    this.engine = { o1, o2, sub, lp, bp, g, ng, ns, nf };

    // tyre screech bed
    const ts = ctx.createBufferSource(); ts.buffer = this.noiseBuf; ts.loop = true;
    const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 2100; tf.Q.value = 9;
    const tg = ctx.createGain(); tg.gain.value = 0;
    ts.connect(tf); tf.connect(tg); tg.connect(this.sfxGain);
    ts.start(t0);
    this.tyre = { ts, tf, tg };
  }

  updateEngine(v, camDist) {
    if (!this.engine) return;
    const t = this.t;
    if (!v || !v.driven) {
      this.engine.g.gain.setTargetAtTime(0, t, 0.12);
      this.tyre.tg.gain.setTargetAtTime(0, t, 0.08);
      return;
    }
    const rpmN = clamp01(v.rpm / v.redline);
    const base = 26 + rpmN * 132;
    this.engine.o1.frequency.setTargetAtTime(base, t, 0.05);
    this.engine.o2.frequency.setTargetAtTime(base * 2.005, t, 0.05);
    this.engine.sub.frequency.setTargetAtTime(base * 0.5, t, 0.06);
    this.engine.lp.frequency.setTargetAtTime(360 + rpmN * 2400 + v.throttle * 700, t, 0.08);
    this.engine.nf.frequency.setTargetAtTime(600 + rpmN * 2200, t, 0.1);
    const load = 0.045 + Math.abs(v.throttle || 0) * 0.055 + rpmN * 0.05;
    this.engine.g.gain.setTargetAtTime(load, t, 0.08);
    this.engine.ng.gain.setTargetAtTime(0.10 + Math.abs(v.throttle || 0) * 0.30, t, 0.1);
    this.tyre.tf.frequency.setTargetAtTime(1700 + v.slip * 1500 + Math.abs(v.kmh) * 6, t, 0.06);
    this.tyre.tg.gain.setTargetAtTime(clamp01(v.slip - 0.22) * 0.16, t, 0.05);
  }

  /* --------------------------------------------------------------- rain */
  setRain(amount, thunder) {
    if (!this.ready) return;
    this.rainGain.gain.setTargetAtTime(amount * 0.20, this.t, 0.6);
    if (thunder && Math.random() < 0.5) this.thunder();
  }
  thunder() {
    if (!this.ready) return;
    this.noise(2.4, { fc: 130, fcTo: 42, q: 0.4, gain: 0.32, attack: 0.06, filter: 'lowpass' });
    this.tone(38, 2.0, { gain: 0.20, type: 'sine', glide: 22, attack: 0.05 });
  }

  /* -------------------------------------------------------------- music */
  music(mood) {
    if (this.mood === mood) return;
    this.mood = mood;
  }

  musicTick(dt) {
    if (!this.ready) return;
    const M = MOODS[this.mood] || MOODS.day;
    const spb = 60 / M.bpm;
    while (this.nextBeatTime < this.t + 0.25) {
      this.scheduleBeat(M, this.beat, this.nextBeatTime);
      this.beat = (this.beat + 1) % 64;
      this.nextBeatTime += spb;
    }
  }

  scheduleBeat(M, beat, t0) {
    const ctx = this.ctx;
    const bar = Math.floor(beat / 4) % M.chords.length;
    const chord = M.chords[bar];
    const inBar = beat % 4;
    const g = this.musicGain;
    const at = Math.max(0, t0 - this.t);

    // pad chord on bar start
    if (inBar === 0 && M.pad) {
      chord.forEach((semi, i) => {
        const f = 55 * Math.pow(2, semi / 12);
        this.tone(f, (60 / M.bpm) * 4 * 0.95, {
          type: M.padType || 'sawtooth', gain: M.padGain * 0.30, attack: 0.55,
          fc: M.padFc || 900, filter: 'lowpass', q: 0.7, delay: at, dest: g, verb: true
        });
      });
    }
    // bass
    if (M.bass && (M.bassPattern ? M.bassPattern[beat % 8] : inBar === 0 || inBar === 2)) {
      const f = 55 * Math.pow(2, chord[0] / 12) * 0.5;
      this.tone(f, (60 / M.bpm) * (M.bassLen || 0.7), {
        type: 'triangle', gain: M.bassGain, attack: 0.01, fc: 420, filter: 'lowpass', delay: at, dest: g
      });
    }
    // arpeggio
    if (M.arp) {
      const seq = M.arpSeq || [0, 2, 1, 3];
      const semi = chord[seq[beat % seq.length] % chord.length];
      const f = 220 * Math.pow(2, semi / 12) * (M.arpOct || 1);
      this.tone(f, 0.42, { type: M.arpType || 'triangle', gain: M.arpGain, attack: 0.006, fc: 3200, filter: 'lowpass', delay: at, dest: g, verb: true });
    }
    // percussion
    if (M.kick && (M.kickPattern ? M.kickPattern[beat % 8] : inBar === 0 || inBar === 2)) {
      this.tone(110, 0.22, { type: 'sine', glide: 42, gain: M.kickGain, attack: 0.004, delay: at, dest: g });
    }
    if (M.snare && (inBar === 1 || inBar === 3)) {
      this.noise(0.16, { fc: 1900, q: 0.8, gain: M.snareGain, attack: 0.003, delay: at, dest: g });
    }
    if (M.hat && beat % 2 === 1) {
      this.noise(0.05, { fc: 8200, q: 1.4, gain: M.hatGain, filter: 'highpass', delay: at, dest: g });
    }
  }
}

const MOODS = {
  menu: {
    bpm: 76, chords: [[0, 7, 12, 16], [-3, 4, 9, 14], [-5, 2, 7, 12], [-1, 6, 11, 15]],
    pad: true, padType: 'sawtooth', padGain: 0.30, padFc: 700, arp: true, arpGain: 0.05, arpType: 'sine', arpOct: 2
  },
  day: {
    bpm: 92, chords: [[0, 7, 12], [-4, 3, 8], [-2, 5, 10], [3, 10, 15]],
    pad: true, padType: 'triangle', padGain: 0.20, padFc: 1100, bass: true, bassGain: 0.10, hat: true, hatGain: 0.02
  },
  night: {
    bpm: 84, chords: [[0, 7, 14], [-5, 2, 9], [-3, 4, 11], [2, 9, 16]],
    pad: true, padType: 'sawtooth', padGain: 0.22, padFc: 640, bass: true, bassGain: 0.09,
    bassPattern: [1, 0, 0, 1, 0, 0, 1, 0], arp: true, arpGain: 0.035, arpType: 'sine', arpOct: 2
  },
  tension: {
    bpm: 104, chords: [[0, 6, 13], [1, 7, 14], [-2, 5, 11], [0, 6, 13]],
    pad: true, padType: 'sawtooth', padGain: 0.26, padFc: 520, bass: true, bassGain: 0.13,
    bassPattern: [1, 0, 1, 1, 0, 1, 0, 1], hat: true, hatGain: 0.028
  },
  chase: {
    bpm: 142, chords: [[0, 7, 10], [0, 7, 10], [-2, 5, 8], [3, 10, 13]],
    pad: false, bass: true, bassGain: 0.16, bassLen: 0.34,
    bassPattern: [1, 1, 0, 1, 1, 0, 1, 1], kick: true, kickGain: 0.20, kickPattern: [1, 0, 1, 0, 1, 0, 1, 1],
    snare: true, snareGain: 0.09, hat: true, hatGain: 0.035,
    arp: true, arpGain: 0.05, arpType: 'sawtooth', arpOct: 2, arpSeq: [0, 1, 2, 1]
  },
  romance: {
    bpm: 78, chords: [[0, 4, 7, 11], [-3, 0, 4, 9], [-5, -1, 2, 7], [2, 5, 9, 14]],
    pad: true, padType: 'triangle', padGain: 0.26, padFc: 1300, arp: true, arpGain: 0.055,
    arpType: 'sine', arpOct: 2, arpSeq: [0, 2, 1, 3, 2, 0, 3, 1], bass: true, bassGain: 0.07
  },
  cinematic: {
    bpm: 66, chords: [[0, 7, 12, 19], [-5, 2, 7, 14], [-3, 4, 9, 16], [0, 7, 12, 19]],
    pad: true, padType: 'sawtooth', padGain: 0.34, padFc: 560, bass: true, bassGain: 0.14, bassLen: 1.6
  },
};
