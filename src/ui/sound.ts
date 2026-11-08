/**
 * Sound (CONCEPT.md §7.2а): synthesized with Web Audio — a swing tune for the newsroom whose mood
 * darkens with the town, and short effects for the paper, the press and the reporters. Only the crowd's
 * voices are recordings (CC0, public/assets/sounds/crowd): synthesized voices sound like robots.
 * The same engine renders offline (the trailer).
 */
import { ASSET_BASE } from '../assets';

export const SFX_NAMES = ['click', 'paper', 'type', 'sensation', 'press', 'stamp', 'crowdScared', 'crowdHappy', 'crowdDoubt', 'fight', 'chant', 'exodus', 'shutter', 'chime', 'coin', 'exposed', 'win', 'lose'] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/** 0 — a thriving or calm town, 1 — crisis, 2 — decline and ruins. */
export type MusicMood = 0 | 1 | 2;

// ---------- The tunes ----------

const NOTE: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6, 9],
};

/** A chord as its root (0–11) and intervals, from a name like `Dm7` or `Bb7`. */
function chord(name: string): { root: number; tones: number[] } {
  const m = /^([A-G][b#]?)(.*)$/.exec(name)!;
  return { root: NOTE[m[1]], tones: QUALITY[m[2]] ?? QUALITY[''] };
}

interface Tune {
  bpm: number;
  /** One bar per entry; two chords split the bar. */
  bars: string[][];
  /** How busy the melody and drums are, 0..1. */
  density: number;
  seed: number;
}

const TUNES: Record<MusicMood, Tune> = {
  // A cheerful small-town swing: the paper still has nothing to worry about.
  0: {
    bpm: 112,
    density: 0.8,
    seed: 7,
    bars: [['C6'], ['Am7'], ['Dm7'], ['G7'], ['C6'], ['A7'], ['Dm7', 'G7'], ['C6'], ['F6'], ['Fm6'], ['Em7'], ['A7'], ['Dm7'], ['G7'], ['C6', 'A7'], ['Dm7', 'G7']],
  },
  // Crisis: the same band in minor, a little nervous.
  1: {
    bpm: 104,
    density: 0.65,
    seed: 11,
    bars: [['Am'], ['F7'], ['Dm6'], ['E7'], ['Am'], ['Bb7'], ['Dm6'], ['E7'], ['Dm'], ['Am'], ['F7'], ['E7'], ['Am'], ['Dm6'], ['Bb7', 'E7'], ['Am', 'E7']],
  },
  // Decline: slow, sparse, a bit sinister.
  2: {
    bpm: 84,
    density: 0.4,
    seed: 23,
    bars: [['Dm'], ['Dm'], ['Bb7'], ['A7'], ['Gm6'], ['Dm'], ['Eb7'], ['A7'], ['Dm'], ['Gm6'], ['Dm'], ['Bb7'], ['Gm6'], ['A7'], ['Dm'], ['A7']],
  },
};

/** A note of a part: start in eighths from the tune's beginning, length in eighths, MIDI pitch. */
export interface TuneNote {
  at: number;
  len: number;
  pitch: number;
  vel: number;
}

export interface Score {
  bpm: number;
  bars: number;
  melody: TuneNote[];
  bass: TuneNote[];
  keys: TuneNote[];
  /** Drum hits: 0 kick, 1 brush, 2 hat. */
  drums: { at: number; kind: 0 | 1 | 2; vel: number }[];
}

/** A small deterministic generator, so the tune is the same every time. */
function rngOf(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** The chord sounding at an eighth of a bar. */
const chordAt = (t: Tune, bar: number, eighth: number) => {
  const names = t.bars[bar % t.bars.length];
  return chord(names.length > 1 && eighth >= 4 ? names[1] : names[0]);
};

/** Writes out a tune: a walking bass, comping stabs, a melody from repeated motifs, brushes. */
export function composeTune(mood: MusicMood): Score {
  const t = TUNES[mood];
  const rnd = rngOf(t.seed);
  const bars = t.bars.length;
  const melody: TuneNote[] = [];
  const bass: TuneNote[] = [];
  const keys: TuneNote[] = [];
  const drums: Score['drums'] = [];
  // Two rhythmic motifs (eighth slots with lengths), each used for a pair of bars, so the tune repeats.
  const motif = () => {
    const out: [number, number][] = [];
    for (let i = 0; i < 16; ) {
      const rest = rnd() > t.density * 0.9;
      const len = rnd() < 0.55 ? 1 : rnd() < 0.7 ? 2 : 3;
      if (!rest) out.push([i, Math.min(len, 16 - i)]);
      i += len;
    }
    return out;
  };
  const motifs = [motif(), motif(), motif()];
  const form = [0, 1, 0, 2, 0, 1, 0, 2];
  let pitch = 72;
  for (let bar = 0; bar < bars; bar++) {
    const base = bar * 8;
    // Bass: root, a chord tone, the fifth, then a step into the next bar's root.
    const ch = chordAt(t, bar, 0);
    const next = chordAt(t, bar + 1, 0);
    const root = 36 + ch.root;
    const beats = [root, root + ch.tones[1 + Math.floor(rnd() * (ch.tones.length - 1))], root + 7, 36 + next.root + (rnd() < 0.5 ? 1 : -1)];
    if (t.bars[bar].length > 1) {
      const ch2 = chordAt(t, bar, 4);
      beats[2] = 36 + ch2.root;
      beats[3] = 36 + ch2.root + ch2.tones[2];
    }
    beats.forEach((p, i) => bass.push({ at: base + i * 2, len: mood === 2 && i % 2 ? 1 : 2, pitch: p > 50 ? p - 12 : p, vel: i === 0 ? 1 : 0.8 }));
    // Comping: stabs on the «and» of two and on four (a Charleston figure), the chord's upper tones.
    for (const [slot, len] of mood === 2 ? [[0, 6]] : [[3, 1], [6, 1]]) {
      const cc = chordAt(t, bar, slot);
      const voicing = cc.tones.slice(1).map((x) => 60 + ((cc.root + x) % 12));
      for (const p of voicing) keys.push({ at: base + slot, len, pitch: p, vel: mood === 2 ? 0.6 : 0.8 });
    }
    // Drums: a swung ride, brushes on two and four, a soft kick.
    for (let e = 0; e < 8; e++) {
      if (e % 2 === 0 || (e === 3 || e === 7)) if (rnd() < 0.5 + t.density * 0.5) drums.push({ at: base + e, kind: 2, vel: e % 2 ? 0.6 : 0.9 });
    }
    drums.push({ at: base + 2, kind: 1, vel: 0.8 }, { at: base + 6, kind: 1, vel: 0.8 });
    drums.push({ at: base, kind: 0, vel: 1 });
    if (mood !== 2) drums.push({ at: base + 4, kind: 0, vel: 0.6 });
    // Melody: the bar pair's motif, pitches walking over the chord tones; phrases end on the root.
    if (bar % 2 === 0) {
      const m = motifs[form[(bar / 2) % form.length]];
      for (const [slot, len] of m) {
        const b = bar + (slot >= 8 ? 1 : 0);
        const cc = chordAt(t, b, slot % 8);
        const tones: number[] = [];
        for (let o = 60; o <= 84; o += 12) for (const x of cc.tones) tones.push(o + ((cc.root + x) % 12));
        const strong = slot % 2 === 0;
        const end = (bar + 2) % 8 === 0 && slot >= 12;
        const target = end ? 72 + cc.root : pitch + Math.round((rnd() - 0.5) * 7);
        let best = tones[0];
        for (const p of tones) if (Math.abs(p - target) < Math.abs(best - target)) best = p;
        // Off the beat a passing note a step away may sound instead of a chord tone.
        pitch = !strong && !end && rnd() < 0.35 ? best + (rnd() < 0.5 ? 1 : 2) : best;
        pitch = Math.max(64, Math.min(84, pitch));
        melody.push({ at: bar * 8 + slot, len, pitch, vel: strong ? 1 : 0.8 });
      }
    }
  }
  return { bpm: t.bpm, bars, melody, bass, keys, drums };
}

// ---------- The synth ----------

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// ---------- Crowd recordings ----------

/** How loud a crowd clip plays next to the synthesized effects. */
const CROWD = 0.35;

/**
 * Short clips of real crowds (GameSoundCon 2024 Walla by ShangusBurger, freesound.org, CC0), cut and
 * evened out in loudness: grumbling, a calm «mm-hm», gasps, gossip, «pff», the noise of a protest.
 */
const CLIPS = {
  grumble: ['grumble_1', 'grumble_2', 'grumble_3', 'grumble_4'],
  approve: ['approve_1', 'approve_2', 'approve_3', 'approve_4'],
  gasp: ['gasp_1', 'gasp_2'],
  gossip: ['gossip_1', 'gossip_2'],
  pff: ['pff_1', 'pff_2'],
  protest: ['protest_1'],
} as const;
type ClipKind = keyof typeof CLIPS;
const clipBuffers = new Map<string, AudioBuffer>();
let clipsLoading: Promise<void> | null = null;

/** Fetches and decodes the crowd clips once (buffers work in any context). Never throws. */
export function loadClips(ctx: BaseAudioContext): Promise<void> {
  clipsLoading ??= Promise.all(
    Object.values(CLIPS)
      .flat()
      .map(async (id) => {
        try {
          const r = await fetch(`${ASSET_BASE}sounds/crowd/${id}.mp3`);
          if (r.ok) clipBuffers.set(id, await ctx.decodeAudioData(await r.arrayBuffer()));
        } catch {
          // A missing clip is a silent one.
        }
      }),
  ).then(() => undefined);
  return clipsLoading;
}

/** A synth bound to an audio context and two outputs (music and effects). */
export class Synth {
  readonly ctx: BaseAudioContext;
  readonly music: GainNode;
  readonly sfx: GainNode;
  private noise: AudioBuffer;
  private reed: PeriodicWave;

  constructor(ctx: BaseAudioContext, out: AudioNode) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.connect(out);
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music.connect(comp);
    this.sfx.connect(comp);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    const rnd = rngOf(99);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    // A reedy wave (odd harmonics, softly rolled off): a clarinet in pixel form.
    const real = new Float32Array(12);
    const imag = new Float32Array(12);
    for (let k = 1; k < 12; k++) imag[k] = k % 2 ? 1 / k : 0.12 / k;
    this.reed = ctx.createPeriodicWave(real, imag);
  }

  /** An envelope on a fresh gain node: attack to the peak, then an exponential fall to silence. */
  private env(t: number, peak: number, attack: number, decay: number, dest: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  private tone(type: OscillatorType | PeriodicWave, freq: number, t: number, dur: number, peak: number, dest: AudioNode, opts: { attack?: number; detune?: number; slideTo?: number; cutoff?: number } = {}): void {
    const o = this.ctx.createOscillator();
    if (type instanceof PeriodicWave) o.setPeriodicWave(type);
    else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
    if (opts.detune) o.detune.value = opts.detune;
    let node: AudioNode = this.env(t, peak, opts.attack ?? 0.005, dur, dest);
    if (opts.cutoff) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.cutoff;
      f.connect(node);
      node = f;
    }
    o.connect(node);
    o.start(t);
    o.stop(t + (opts.attack ?? 0.005) + dur + 0.05);
  }

  private hiss(t: number, dur: number, peak: number, dest: AudioNode, filter: BiquadFilterType, freq: number, q = 1, attack = 0.002, freqTo?: number): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    f.Q.value = q;
    s.connect(f);
    f.connect(this.env(t, peak, attack, dur, dest));
    s.start(t, Math.random() * 1.5);
    s.stop(t + attack + dur + 0.05);
  }

  /** Schedules a span of a score from eighth `from` to `to`, the tune starting at time `t0`. */
  scheduleScore(score: Score, t0: number, from: number, to: number, swing = 0.17): void {
    const beat = 60 / score.bpm;
    const total = score.bars * 8;
    const time = (e: number) => t0 + Math.floor(e / 2) * beat + (e % 2 ? beat / 2 + swing * beat : 0);
    const inSpan = (at: number) => {
      // The tune loops: an event sounds in every lap that falls in the span.
      const out: number[] = [];
      for (let lap = Math.floor(from / total); lap * total <= to; lap++) {
        const e = lap * total + at;
        if (e >= from && e < to) out.push(e);
      }
      return out;
    };
    const m = this.music;
    for (const n of score.bass) for (const e of inSpan(n.at)) {
      const t = time(e);
      const len = n.len * beat * 0.5;
      this.tone('triangle', hz(n.pitch), t, len * 0.9, 0.32 * n.vel, m, { cutoff: 900 });
      this.tone('sine', hz(n.pitch - 12), t, len * 0.7, 0.18 * n.vel, m);
    }
    for (const n of score.keys) for (const e of inSpan(n.at)) {
      const t = time(e);
      const len = Math.min(n.len * beat * 0.5, 0.35);
      this.tone('square', hz(n.pitch), t, len, 0.035 * n.vel, m, { cutoff: 1500, detune: -7 });
      this.tone('triangle', hz(n.pitch), t, len, 0.06 * n.vel, m, { detune: 6 });
    }
    for (const n of score.melody) for (const e of inSpan(n.at)) {
      const t = time(e);
      const len = n.len * beat * 0.5;
      this.tone(this.reed, hz(n.pitch), t, len * 0.95 + 0.06, 0.11 * n.vel, m, { attack: 0.02, cutoff: 2400 });
    }
    for (const d of score.drums) for (const e of inSpan(d.at)) {
      const t = time(e);
      if (d.kind === 0) this.tone('sine', 110, t, 0.16, 0.45 * d.vel, m, { slideTo: 42 });
      else if (d.kind === 1) this.hiss(t, 0.16, 0.08 * d.vel, m, 'bandpass', 2600, 0.8, 0.01);
      else this.hiss(t, 0.05, 0.05 * d.vel, m, 'highpass', 7500, 0.7);
    }
  }

  /** Length of a score's lap in seconds. */
  static lap(score: Score): number {
    return (score.bars * 4 * 60) / score.bpm;
  }

  private lastClip = new Map<ClipKind, string>();

  /** A crowd clip of a kind (not the one played last), a little faster or slower and to one side. */
  private clip(kind: ClipKind, t: number, gain: number): void {
    const ids = CLIPS[kind].filter((id) => clipBuffers.has(id));
    const fresh = ids.length > 1 ? ids.filter((id) => id !== this.lastClip.get(kind)) : ids;
    const id = fresh[Math.floor(Math.random() * fresh.length)];
    if (!id) return;
    this.lastClip.set(kind, id);
    const src = this.ctx.createBufferSource();
    src.buffer = clipBuffers.get(id)!;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 0.6 - 0.3;
    src.connect(g);
    g.connect(pan);
    pan.connect(this.sfx);
    src.start(t);
  }

  /** Plays an effect at time `t` (default now). */
  play(name: SfxName, t = this.ctx.currentTime + 0.01): void {
    const s = this.sfx;
    switch (name) {
      case 'click':
        this.tone('sine', 1300, t, 0.035, 0.08, s, { slideTo: 900 });
        break;
      case 'paper':
        // A sheet unfolding: two quick rustles.
        this.hiss(t, 0.12, 0.24, s, 'bandpass', 3200, 1.2, 0.01, 1800);
        this.hiss(t + 0.08, 0.16, 0.18, s, 'bandpass', 2400, 1.2, 0.02, 4200);
        break;
      case 'type':
        // Typewriter keys and the carriage bell.
        for (let i = 0; i < 4; i++) {
          const k = t + i * 0.07 + Math.random() * 0.02;
          this.hiss(k, 0.025, 0.22, s, 'highpass', 2500, 1);
          this.tone('square', 180, k, 0.02, 0.05, s, { cutoff: 800 });
        }
        this.tone('sine', 2093, t + 0.32, 0.5, 0.06, s);
        break;
      case 'sensation':
        // A brass stab: a loud story has come in.
        for (const p of [62, 66, 69, 74]) this.tone('sawtooth', hz(p), t, 0.45, 0.05, s, { attack: 0.01, cutoff: 2200 });
        this.tone('sawtooth', hz(50), t, 0.5, 0.08, s, { cutoff: 600 });
        this.play('type', t + 0.15);
        break;
      case 'press':
        // The printing press: a few heavy strokes of the cylinder and the paper running.
        for (let i = 0; i < 4; i++) {
          const k = t + i * 0.22;
          this.tone('sine', 90, k, 0.18, 0.32, s, { slideTo: 40 });
          this.hiss(k, 0.09, 0.2, s, 'bandpass', 900, 1.5);
          this.hiss(k + 0.11, 0.06, 0.08, s, 'highpass', 5000);
        }
        this.hiss(t, 1.0, 0.07, s, 'bandpass', 1800, 0.6, 0.2);
        break;
      case 'stamp':
        this.tone('sine', 160, t, 0.12, 0.32, s, { slideTo: 60 });
        this.hiss(t, 0.06, 0.25, s, 'lowpass', 1500);
        break;
      case 'crowdScared':
        // Bad news: a gasp, then the town grumbles.
        this.clip('gasp', t, CROWD * 0.35);
        this.clip('grumble', t + 0.25, CROWD);
        break;
      case 'crowdHappy':
        // Good news: a calm «mm-hm» of agreement, not cheering.
        this.clip('approve', t, CROWD);
        break;
      case 'crowdDoubt':
        // Not believed: «pff» and whispering.
        this.clip('pff', t, CROWD * 0.9);
        this.clip('gossip', t + 0.3, CROWD * 0.4);
        break;
      case 'fight':
        for (let i = 0; i < 4; i++) {
          const k = t + i * 0.28 + Math.random() * 0.06;
          this.hiss(k - 0.06, 0.06, 0.1, s, 'bandpass', 1500, 1, 0.04, 400);
          this.tone('sine', 120, k, 0.12, 0.34, s, { slideTo: 50 });
          this.hiss(k, 0.05, 0.3, s, 'lowpass', 1200);
        }
        this.clip('gasp', t, CROWD * 0.7);
        this.clip('protest', t + 0.2, CROWD * 0.5);
        break;
      case 'chant':
        // A protest: the crowd's angry noise over grumbling.
        this.clip('protest', t, CROWD);
        this.clip('grumble', t + 0.4, CROWD * 0.5);
        break;
      case 'exodus':
        // A car driving off.
        this.tone('sawtooth', 55, t, 1.6, 0.08, s, { slideTo: 90, cutoff: 500, attack: 0.1 });
        this.hiss(t, 1.6, 0.05, s, 'lowpass', 600, 0.7, 0.1, 200);
        break;
      case 'shutter':
        // A shop's shutter rattling down and the bang at the end.
        for (let i = 0; i < 14; i++) this.hiss(t + i * 0.045, 0.03, 0.12, s, 'bandpass', 1800 - i * 60, 3);
        this.tone('sine', 140, t + 0.66, 0.2, 0.32, s, { slideTo: 50 });
        this.hiss(t + 0.66, 0.1, 0.25, s, 'lowpass', 2000);
        break;
      case 'chime':
        [76, 79, 84, 88].forEach((p, i) => this.tone('sine', hz(p), t + i * 0.09, 0.6, 0.12, s));
        break;
      case 'coin':
        this.tone('square', hz(83), t, 0.07, 0.1, s, { cutoff: 4000 });
        this.tone('square', hz(88), t + 0.07, 0.25, 0.1, s, { cutoff: 4000 });
        break;
      case 'exposed':
        // A caught lie: a falling «wah-wah».
        [64, 63, 62, 58].forEach((p, i) => this.tone('sawtooth', hz(p), t + i * 0.22, i === 3 ? 0.7 : 0.2, 0.16, s, { cutoff: 1100, attack: 0.02, slideTo: i === 3 ? hz(55) : undefined }));
        break;
      case 'win':
        [60, 64, 67, 72, 76, 79, 84].forEach((p, i) => this.tone('sawtooth', hz(p), t + i * 0.09, i === 6 ? 1.2 : 0.25, 0.05, s, { cutoff: 2600 }));
        this.play('crowdHappy', t + 0.5);
        break;
      case 'lose':
        [67, 63, 60, 55].forEach((p, i) => this.tone(this.reed, hz(p), t + i * 0.35, i === 3 ? 1.4 : 0.35, 0.12, s, { attack: 0.03 }));
        break;
    }
  }
}

// ---------- The game's player ----------

/** The live engine: created on the first press (browsers start sound only after one). */
class Player {
  private synth: Synth | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicVolume = 0.6;
  private sfxVolume = 0.8;
  private mood: MusicMood = 0;
  private score: Score | null = null;
  private scoreMood: MusicMood = 0;
  private tuneStart = 0;
  private scheduled = 0;
  private timer = 0;
  private lastSfx = new Map<SfxName, number>();

  /** Starts the engine and the music; call from a user gesture. Never throws. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.synth = new Synth(this.ctx, this.master);
        void loadClips(this.ctx);
        this.applyVolumes();
        document.addEventListener('visibilitychange', () => {
          if (!this.ctx) return;
          if (document.hidden) void this.ctx.suspend();
          else void this.ctx.resume();
        });
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      this.startMusic();
    } catch {
      // No sound on this device: the game plays silent.
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
    if (music > 0) this.startMusic();
  }

  private applyVolumes(): void {
    if (!this.synth || !this.ctx) return;
    // Loudness is heard roughly as the square of the slider.
    this.synth.music.gain.setTargetAtTime(this.musicVolume * this.musicVolume * 0.55, this.ctx.currentTime, 0.1);
    this.synth.sfx.gain.setTargetAtTime(this.sfxVolume * this.sfxVolume, this.ctx.currentTime, 0.05);
  }

  /** The music follows the town: a new mood takes over at the next lap of the tune. */
  setMood(mood: MusicMood): void {
    this.mood = mood;
  }

  play(name: SfxName): void {
    if (!this.synth || !this.ctx || this.sfxVolume <= 0 || this.ctx.state !== 'running') return;
    // The same effect twice in a moment is one sound, not a pile.
    const now = this.ctx.currentTime;
    if (now - (this.lastSfx.get(name) ?? -1) < 0.06) return;
    this.lastSfx.set(name, now);
    this.synth.play(name);
  }

  private startMusic(): void {
    if (this.timer || !this.ctx || this.musicVolume <= 0) return;
    this.score = composeTune(this.mood);
    this.scoreMood = this.mood;
    this.tuneStart = this.ctx.currentTime + 0.1;
    this.scheduled = 0;
    this.timer = window.setInterval(() => this.tick(), 100);
    this.tick();
  }

  /** Schedules the next stretch of the tune a little ahead of time. */
  private tick(): void {
    if (!this.ctx || !this.synth || !this.score) return;
    if (this.musicVolume <= 0) {
      window.clearInterval(this.timer);
      this.timer = 0;
      return;
    }
    const eighth = 30 / this.score.bpm;
    const ahead = this.ctx.currentTime + 0.4 - this.tuneStart;
    const until = Math.floor(ahead / eighth);
    const total = this.score.bars * 8;
    while (this.scheduled < until) {
      // At the end of a lap the tune may change to the town's mood.
      if (this.scheduled > 0 && this.scheduled % total === 0 && this.mood !== this.scoreMood) {
        this.tuneStart += Synth.lap(this.score) * (this.scheduled / total);
        this.score = composeTune(this.mood);
        this.scoreMood = this.mood;
        this.scheduled = 0;
        continue;
      }
      const to = Math.min(until, (Math.floor(this.scheduled / total) + 1) * total);
      this.synth.scheduleScore(this.score, this.tuneStart, this.scheduled, to);
      this.scheduled = to;
    }
  }
}

export const sound = new Player();

/**
 * Renders the music (from a mood) with effects at given seconds into a WAV, for the trailer.
 * Used from a browser page: `renderAudio(40, [[0, 0], [20, 1]], [[3.2, 'press']])`.
 */
export async function renderAudio(seconds: number, moods: [number, MusicMood][], effects: [number, SfxName][], musicGain = 0.5): Promise<Blob> {
  const rate = 44100;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  await loadClips(ctx);
  const synth = new Synth(ctx, ctx.destination);
  synth.music.gain.value = musicGain;
  synth.sfx.gain.value = 1;
  moods.forEach(([at, mood], i) => {
    const end = i + 1 < moods.length ? moods[i + 1][0] : seconds;
    const score = composeTune(mood);
    const eighth = 30 / score.bpm;
    synth.scheduleScore(score, at, 0, Math.ceil((end - at) / eighth));
  });
  for (const [at, name] of effects) synth.play(name, at);
  const buf = await ctx.startRendering();
  // 16-bit PCM WAV.
  const n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o: number, s: string) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  data.setUint32(4, 36 + n * 4, true);
  w(8, 'WAVEfmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 2, true);
  data.setUint32(24, rate, true);
  data.setUint32(28, rate * 4, true);
  data.setUint16(32, 4, true);
  data.setUint16(34, 16, true);
  w(36, 'data');
  data.setUint32(40, n * 4, true);
  const l = buf.getChannelData(0);
  const r = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    data.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true);
    data.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r[i])) * 32767, true);
  }
  return new Blob([data], { type: 'audio/wav' });
}
