import { seeded, TAU } from './lib.js';

const CHORDS = [
  [73.42, 110.0, 146.83, 220.0],
  [73.42, 110.0, 164.81, 220.0],
  [73.42, 110.0, 146.83, 185.0],
  [73.42, 92.5, 138.59, 185.0],
  [73.42, 110.0, 138.59, 164.81],
  [73.42, 98.0, 146.83, 196.0],
  [73.42, 110.0, 146.83, 220.0],
];

const BELLS = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 220.0];

export class Score {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.out = null;
    this.recordDest = null;
    this.voices = [];
    this.muted = false;
    this.built = false;
    this.chapter = -1;
  }

  init() {
    if (this.ctx) return this.ctx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.9;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.3;

    const out = ctx.createGain();
    out.gain.value = this.muted ? 0 : 1;

    this.recordDest = ctx.createMediaStreamDestination();

    master.connect(compressor);
    compressor.connect(out);
    out.connect(ctx.destination);
    compressor.connect(this.recordDest);

    this.master = master;
    this.compressor = compressor;
    this.out = out;
    return ctx;
  }

  async start() {
    const ctx = this.init();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try { await ctx.resume(); } catch { /* ignored */ }
    }
    if (!this.built) {
      this.buildDrone();
      this.built = true;
    }
  }

  buildDrone() {
    const ctx = this.ctx;
    if (!ctx) return;

    const bus = ctx.createGain();
    bus.gain.value = 0.2;
    bus.connect(this.master);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    filter.connect(bus);

    CHORDS[0].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : i === 3 ? 'triangle' : 'sine';
      osc.frequency.value = freq;
      osc.detune.value = (i % 2 ? 1 : -1) * (2 + i);
      const gain = ctx.createGain();
      gain.gain.value = i === 0 ? 0.16 : 0.085;
      const pan = ctx.createStereoPanner();
      pan.pan.value = -0.5 + i * 0.32;
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(filter);
      osc.start();
      this.voices.push({ osc, gain, base: gain.gain.value, index: i });
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    lfoGain.connect(bus.gain);
    lfo.start();

    const len = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rand = seeded(88);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = rand() * 2 - 1;
      last = (last + 0.018 * white) / 1.018;
      data[i] = last * 2.6;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.value = 320;
    nFilter.Q.value = 0.5;
    const nGain = ctx.createGain();
    nGain.gain.value = 0.05;
    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(bus);
    noise.start();

    const shimmer = ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = 587.33;
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.008;
    const shimmerLfo = ctx.createOscillator();
    shimmerLfo.frequency.value = 0.11;
    const shimmerDepth = ctx.createGain();
    shimmerDepth.gain.value = 0.006;
    shimmerLfo.connect(shimmerDepth);
    shimmerDepth.connect(shimmerGain.gain);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(bus);
    shimmer.start();
    shimmerLfo.start();
  }

  setChapter(index) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.chapter === index) return;
    this.chapter = index;
    this.bell(index);
  }

  bell(index = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const freq = BELLS[index % BELLS.length];
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.connect(this.master);
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(0.075, now + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 5.5);

    [1, 2.76, 5.4].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.16 / i;
      osc.connect(g);
      g.connect(out);
      osc.start(now);
      osc.stop(now + 5.6);
    });

    const drum = ctx.createOscillator();
    drum.type = 'sine';
    drum.frequency.setValueAtTime(88, now);
    drum.frequency.exponentialRampToValueAtTime(42, now + 0.65);
    const dg = ctx.createGain();
    dg.gain.setValueAtTime(0.09, now);
    dg.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    drum.connect(dg);
    dg.connect(this.master);
    drum.start(now);
    drum.stop(now + 1);
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setTargetAtTime(muted ? 0 : 1, now, 0.06);
  }

  duck(amount = 0.35, seconds = 1.2) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(amount, now, 0.15);
    this.master.gain.setTargetAtTime(0.9, now + seconds, 0.4);
  }

  getStream() {
    this.init();
    return this.recordDest ? this.recordDest.stream : null;
  }

  get context() {
    return this.ctx;
  }
}

export function chakra(radius = 32) {
  const spokes = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    spokes.push([Math.cos(a) * radius * 0.18, Math.sin(a) * radius * 0.18, Math.cos(a) * radius * 0.82, Math.sin(a) * radius * 0.82]);
  }
  return spokes;
}
