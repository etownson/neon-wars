// Synthesized audio: SFX, black-hole rumble, and an ambient arpeggio loop.
// Everything is built with Web Audio oscillators/noise — no assets to load.
//
// The AudioContext is created lazily and resumed on the first user gesture
// (browsers block autoplay). Call start() from a pointerdown/keydown/gamepad
// press.

export interface Fx {
  shoot?(): void;
  kill?(): void;
  split?(): void;
  death?(): void;
  blackholeSpawn?(): void;
  setRumble?(level: number): void;
  collect?(): void;
  boom?(): void;
  extraLife?(): void;
}

export class Sounds implements Fx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private noiseBuf!: AudioBuffer;

  // Rumble source (persistent, gain controlled per frame).
  private rumbleGain: GainNode | null = null;

  // Music state.
  private seqTimer: ReturnType<typeof setInterval> | null = null;
  private nextNote = 0;
  private stepIndex = 0;
  private intensity = 0; // 0..1 from wave progress
  private baseBPM = 92;

  /** Create/resume the context. Must be called within a user gesture. */
  start(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.master);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.0;
      this.musicGain.connect(this.master);

      // Shared white-noise buffer.
      const n = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (!this.seqTimer) this.startMusic();
  }

  // ---- SFX ----

  shoot(): void {
    // Round, body-forward pew: warm sine, slightly higher, subtle thump.
    this.tone(320, 0.09, "sine", 0.4, 220, false);
    this.tone(1400, 0.02, "sine", 0.06, 1000, false);
  }

  kill(): void {
    // Bright pitch-up sweep + a noise burst.
    this.tone(520, 0.16, "square", 0.5, 2000, false);
    this.noise(0.12, 0.5, 4000);
  }

  hit(): void {
    this.tone(180, 0.05, "square", 0.3, 300, true);
  }

  split(): void {
    if (!this.ctx) return;
    // Glitchy quick descending gliss.
    const start = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(880, start);
    o.frequency.exponentialRampToValueAtTime(140, start + 0.22);
    g.gain.setValueAtTime(0.2, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
    o.connect(g); g.connect(this.sfxGain);
    o.start(start); o.stop(start + 0.24);
  }

  blackholeSpawn(): void {
    this.tone(1200, 0.35, "sine", 0.5, 500, false);
  }

  death(): void {
    if (!this.ctx) return;
    // Descending saw sweep.
    const start = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(440, start);
    o.frequency.exponentialRampToValueAtTime(40, start + 0.5);
    g.gain.setValueAtTime(0.25, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
    o.connect(g); g.connect(this.sfxGain);
    o.start(start); o.stop(start + 0.52);
  }

  collect(): void {
    // Cheerful two-note pickup chime.
    this.tone(660, 0.09, "sine", 0.3, 660, false);
    this.tone(990, 0.14, "sine", 0.3, 990, false);
  }

  extraLife(): void {
    // Rising arpeggio for an extra life.
    this.tone(523, 0.1, "sine", 0.3, 523, false);
    window.setTimeout(() => this.tone(659, 0.1, "sine", 0.3, 659, false), 80);
    window.setTimeout(() => this.tone(784, 0.2, "sine", 0.3, 784, false), 160);
  }

  boom(): void {
    // Huge low boom + wash.
    this.tone(120, 0.5, "sine", 0.9, 40, false);
    this.noise(0.4, 0.7, 500);
  }

  /** Level 0..1 drives the drone; fade in/out smoothly and swell while present. */
  setRumble(level: number): void {
    if (!this.ctx) return;
    if (!this.rumbleGain) {
      const o = this.ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 55;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 200;
      this.rumbleGain = this.ctx.createGain(); // envelopes the level
      this.rumbleGain.gain.value = 0;
      const trem = this.ctx.createGain(); // slow fade-in/out swell
      trem.gain.value = 0.6;
      const lfo = this.ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.22; // ~4.5s per full in/out cycle
      const lfoAmp = this.ctx.createGain();
      lfoAmp.gain.value = 0.4;
      lfo.connect(lfoAmp); lfoAmp.connect(trem.gain); // trem ≈ 0.2..1.0
      o.connect(filter); filter.connect(this.rumbleGain);
      this.rumbleGain.connect(trem); trem.connect(this.sfxGain);
      o.start(); lfo.start();
    }
    const t = this.ctx.currentTime;
    const target = level > 0 ? Math.min(1, level * 0.18) : 0;
    this.rumbleGain.gain.cancelScheduledValues(t);
    // Smooth exponential fade so the drone never clicks or snaps on/off.
    this.rumbleGain.gain.setTargetAtTime(target, t, 0.35);
  }

  // ---- Music ----

  setIntensity(x: number): void {
    this.intensity = Math.max(0, Math.min(1, x));
  }

  private startMusic(): void {
    // Fade music in once the game is going.
    if (this.ctx) {
      this.musicGain.gain.linearRampToValueAtTime(0.28, this.ctx.currentTime + 2);
    }
    this.seqTimer = setInterval(() => this.schedule(), 90);
  }

  private schedule(): void {
    if (!this.ctx) return;
    const bpm = this.baseBPM + this.intensity * 55;

    while (this.nextNote < this.ctx.currentTime + 0.2) {
      const t = this.nextNote;
      this.playStep(t, this.stepIndex);
      const spb = 60 / bpm / 2; // eighth note
      this.nextNote += spb;
      this.stepIndex++;
    }
  }

  private playStep(t: number, i: number): void {
    if (!this.ctx) return;
    // A minor pentatonic arpeggio, octave rises with intensity.
    const scale = [220, 261.6, 293.7, 329.6, 392, 440]; // A3..A4
    const pattern = [0, 2, 4, 2, 1, 2, 4, 2];
    const idx = pattern[i % pattern.length];
    const oct = this.intensity > 0.5 ? 1 : 0;
    const freq = scale[idx] * Math.pow(2, oct + Math.floor(this.intensity * 2));

    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle";
    o.frequency.value = freq;
    const dur = 0.22;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);

    // Sub bass on downbeats when intensity is up.
    if (i % 8 === 0 && this.intensity > 0.35) {
      const s = this.ctx.createOscillator();
      const sg = this.ctx.createGain();
      s.type = "sine";
      s.frequency.value = 55;
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.linearRampToValueAtTime(0.14, t + 0.02);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      s.connect(sg); sg.connect(this.musicGain);
      s.start(t); s.stop(t + 1.3);
    }
  }

  // ---- Helpers ----

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    endFreq: number,
    noiseOn: boolean
  ): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
    if (noiseOn) this.noise(dur, gain * 0.4, 3000);
  }

  private noise(dur: number, gain: number, freq: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.sfxGain);
    src.start(t); src.stop(t + dur + 0.02);
  }
}
