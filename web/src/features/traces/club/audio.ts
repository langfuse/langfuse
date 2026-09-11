export type MusicalFrame = {
  energy: number;
  tension: number;
  depth: number;
  generation: number;
  tool: number;
  seed: number;
  bureaucracy?: number;
  verification?: number;
  progress?: number;
  legalSeed?: number;
};

type Voice = {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
};

type Mixer = {
  input: GainNode;
  music: GainNode;
  rumble: DelayNode;
  echo: DelayNode;
  volume: GainNode;
  nodes: AudioNode[];
};

const BEAT = 60 / 132;
const FLOOR = 0.0001;
const BASS_PATTERNS = [
  [0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0],
  [0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1],
  [0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1],
];
const ACID_PATTERNS = [
  [0, -1, 0, 12, -1, 7, 0, -1, 0, 3, -1, 0, 10, -1, 7, 0],
  [0, 0, -1, 7, 0, -1, 3, -1, 0, -1, 10, 7, -1, 0, 3, -1],
  [0, -1, 12, -1, 7, 0, -1, 0, 3, -1, 0, 10, -1, 7, 0, 0],
];
const unit = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function saturation(drive: number, fold = 0) {
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) {
    const x = ((i * 2) / (curve.length - 1) - 1) * drive;
    curve[i] = Math.tanh(x + Math.sin(x * 2.4) * fold);
  }
  return curve;
}

const CRUNCH = saturation(3.5);
const FOLD = saturation(4.2, 0.75);
const LIMITER = saturation(1);

/** Sample-clock sequencer voices; the transport owns tempo, scheduling and pause. */
export class TechnoSynth {
  private context: AudioContext | null = null;
  private mixer: Mixer | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Set<Voice>();
  private volume = 0.3;
  private disposed = false;

  get currentTime() {
    return this.context?.currentTime ?? 0;
  }

  async resume(): Promise<void> {
    if (this.disposed) return;
    // AudioContext creation and resume both happen inside the initiating gesture.
    const context = (this.context ??= new AudioContext());
    this.mixer ??= this.createMixer(context);
    await context.resume();
  }

  setVolume(value: number) {
    this.volume = unit(value);
    if (this.context && this.mixer) {
      const gain = this.mixer.volume.gain;
      gain.cancelScheduledValues(this.currentTime);
      gain.setTargetAtTime(this.volume, this.currentTime, 0.025);
    }
  }

  schedule(step: number, time: number, frame: MusicalFrame) {
    const context = this.context;
    const mixer = this.mixer;
    if (
      !context ||
      !mixer ||
      context.state !== "running" ||
      !Number.isFinite(time) ||
      !Number.isFinite(step) ||
      step < 0 ||
      this.voices.size > 96
    ) {
      return;
    }

    const tick = Math.floor(step);
    const position = tick % 16;
    const bar = Math.floor(tick / 16) % 64;
    const energy = unit(frame.energy);
    const tension = unit(frame.tension);
    const generation = unit(frame.generation);
    const tool = unit(frame.tool);
    const seed = frame.seed >>> 0;
    const bureaucracy = unit(frame.bureaucracy ?? tool);
    const verification = unit(frame.verification ?? 0);
    const depth = Math.min(12, Math.max(0, frame.depth | 0));
    // A trace has one tonic. Individual spans change phrases and timbre.
    const root = [29, 30, 32][((frame.legalSeed ?? 0) >>> 0) % 3]!;
    const intro = bar < 4;
    const breakdown = bar >= 28 && bar < 32;
    const build = bar >= 24 && bar < 32;
    const stripped = bar >= 48 && bar < 52;
    const drop = bar >= 32 && bar < 40;
    const ending = bar >= 60;
    const fill = bar % 8 === 7 && position >= 12;
    const intensity = (intro ? 0.8 : 1) * (0.74 + energy * 0.26);
    const at = Math.max(context.currentTime, time);
    const swung = at + (tick % 2 ? BEAT * 0.035 : 0);

    if (!breakdown && position % 4 === 0) {
      this.kick(at, intensity, root);
      mixer.music.gain.setValueAtTime(0.12, at);
      mixer.music.gain.setValueAtTime(0.12, at + 0.032);
      mixer.music.gain.exponentialRampToValueAtTime(1, at + BEAT * 0.8);
    }

    if (position % 2 === 0 || (!intro && position % 4 === 3)) {
      const open = !intro && !stripped && position % 4 === 2;
      this.percussion(
        swung,
        open ? 0.17 + energy * 0.04 : 0.024 + (position % 4) * 0.008,
        (open ? 0.105 : position % 2 ? 0.033 : 0.068) * intensity,
        6600 + (seed % 700),
        "highpass",
        position % 4 === 2 ? 0.36 : -0.32,
      );
    }

    if (!intro && !stripped && (position === 4 || position === 12)) {
      this.clap(at, 0.13 * intensity);
    }
    if (build && position % (bar >= 30 ? 1 : 2) === 0) {
      this.percussion(swung, 0.055, 0.026 + (bar - 24) * 0.008, 1900);
    } else if (fill && !ending && position % 2 === 1) {
      this.metal(swung, 115 + (15 - position) * 23, 0.075, -0.2);
    }
    if (!intro && !breakdown && (tick + depth) % 3 === 1) {
      this.percussion(
        swung,
        0.025,
        0.024 + bureaucracy * 0.026,
        9800,
        "highpass",
        -0.65,
      );
    }

    const bassPattern =
      BASS_PATTERNS[Math.floor(bar / 4) % BASS_PATTERNS.length]!;
    if (!breakdown && bassPattern[position] && (!intro || position % 4 === 2)) {
      const accent = position % 4 === 2;
      const note = position === 15 && bar % 4 === 3 ? 7 : 0;
      this.bass(
        swung,
        root + note,
        BEAT * (accent ? 0.48 : 0.27),
        intensity * (accent ? 0.38 : 0.26),
        190 + energy * 590 + bureaucracy * 380 + (drop ? 250 : 0),
      );
    }

    const phrase =
      ACID_PATTERNS[(Math.floor(bar / 4) + seed) % ACID_PATTERNS.length]!;
    const note = phrase[position]!;
    if (
      (!intro || generation > 0.3) &&
      !stripped &&
      note >= 0 &&
      (generation > 0.25 || position % 2 === 0)
    ) {
      const accent = (position + depth) % 4 === 2 || (drop && position === 0);
      const previous = phrase[(position + 15) % 16]!;
      this.tone(
        swung,
        root + 24 + note,
        BEAT * (accent ? 0.53 : 0.29),
        (accent ? 0.14 : 0.085) * (ending ? 0.6 : 1),
        {
          cutoff:
            (480 +
              energy * 1500 +
              generation * 1400 +
              tension * 1600 +
              verification * 1200) *
            (accent ? 1.2 : 0.7),
          resonance: 6 + tension * 6 + bureaucracy * 3,
          echo: true,
          pan: Math.sin(bar * 0.7) * 0.28,
          slide:
            previous >= 0 && position % 3 === 0
              ? root + 24 + previous
              : undefined,
          acid: true,
        },
      );
    }

    if (
      !intro &&
      ((position === 0 && (bar % 2 === 0 || breakdown)) ||
        (verification > 0.15 && position % 8 === 6))
    ) {
      const chord = verification > 0.15 ? [0, 3, 7, 14] : [0, 5, 10, 14];
      for (const [index, interval] of chord.entries()) {
        this.tone(
          at,
          root + 12 + interval,
          BEAT * (position !== 0 ? 0.8 : breakdown ? 3.8 : 1.7),
          (breakdown ? 0.1 : 0.065) * intensity,
          {
            cutoff: 450 + verification * 1100 + tension * 450,
            resonance: 1.4,
            echo: true,
            pan: (index / 3 - 0.5) * 1.3,
          },
        );
      }
    }

    // Repeated retrievals become an uneven mechanical stamp rhythm.
    if (
      bureaucracy > 0.12 &&
      (position === 5 ||
        position === 13 ||
        (bureaucracy > 0.55 && (position + seed) % 5 === 0))
    ) {
      this.metal(swung, 155 + depth * 27, 0.065 + bureaucracy * 0.11, 0.42);
      this.percussion(
        swung + 0.012,
        0.034,
        0.07 * bureaucracy,
        830,
        "bandpass",
        0.42,
      );
    }
    if (position === 0 && bar % 8 === 0) {
      this.sweep(at, BEAT * (drop ? 3 : 1.5), false, 0.1 * intensity);
    }
    if (position === 0 && (bar === 27 || bar === 31 || bar === 51)) {
      this.sweep(at, BEAT * 3.95, true, 0.095 + tension * 0.045);
    }
  }

  silence() {
    if (this.mixer) {
      this.mixer.volume.gain.cancelScheduledValues(this.currentTime);
      this.mixer.volume.gain.setValueAtTime(0, this.currentTime);
    }
    for (const voice of this.voices) {
      for (const source of voice.sources) {
        source.onended = null;
        source.stop();
      }
      for (const node of voice.nodes) node.disconnect();
    }
    this.voices.clear();
    // Discard delay buffers, feedback loops and scheduled ducking on every stop.
    for (const node of this.mixer?.nodes ?? []) node.disconnect();
    this.mixer = null;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.silence();
    this.noise = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") await context.close();
  }

  private createMixer(context: AudioContext): Mixer {
    const input = context.createGain();
    const music = context.createGain();
    const highpass = context.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 27;
    const air = context.createBiquadFilter();
    air.frequency.value = 12800;
    air.Q.value = 0.5;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -11;
    compressor.knee.value = 8;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.1;
    const limiter = context.createWaveShaper();
    limiter.curve = LIMITER;
    const volume = context.createGain();
    volume.gain.setValueAtTime(0, context.currentTime);
    volume.gain.linearRampToValueAtTime(
      this.volume,
      context.currentTime + 0.04,
    );
    music.connect(input);
    input
      .connect(highpass)
      .connect(air)
      .connect(compressor)
      .connect(limiter)
      .connect(volume)
      .connect(context.destination);
    const nodes: AudioNode[] = [
      input,
      music,
      highpass,
      air,
      compressor,
      limiter,
      volume,
    ];

    const delay = (
      seconds: number,
      cutoff: number,
      amount: number,
      feedback: number,
    ) => {
      const echo = context.createDelay(1);
      echo.delayTime.value = seconds;
      const filter = context.createBiquadFilter();
      filter.frequency.value = cutoff;
      filter.Q.value = 0.7;
      const repeat = context.createGain();
      repeat.gain.value = feedback;
      const output = context.createGain();
      output.gain.value = amount;
      echo.connect(filter);
      filter.connect(repeat).connect(echo);
      filter.connect(output).connect(music);
      nodes.push(echo, filter, repeat, output);
      return echo;
    };

    const rumble = delay(BEAT * 0.75, 165, 0.65, 0.38);
    const echo = delay(BEAT * 0.75, 2100, 0.25, 0.39);
    if (!this.noise) {
      this.noise = context.createBuffer(
        1,
        context.sampleRate * 2,
        context.sampleRate,
      );
      const samples = this.noise.getChannelData(0);
      let state = 0x2f6e2b1;
      for (let i = 0; i < samples.length; i++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        samples[i] = state / 0x80000000;
      }
    }
    return { input, music, rumble, echo, volume, nodes };
  }

  private play(voice: Voice, time: number, duration: number) {
    this.voices.add(voice);
    let remaining = voice.sources.length;
    for (const source of voice.sources) {
      source.onended = () => {
        source.onended = null;
        if (--remaining === 0) {
          for (const node of voice.nodes) node.disconnect();
          this.voices.delete(voice);
        }
      };
      source.start(time);
      source.stop(time + duration + 0.02);
    }
  }

  private envelope(time: number, duration: number, level: number) {
    const envelope = this.context!.createGain();
    envelope.gain.setValueAtTime(FLOOR, time);
    envelope.gain.linearRampToValueAtTime(level, time + 0.003);
    envelope.gain.setValueAtTime(level, time + Math.min(0.028, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(FLOOR, time + duration);
    return envelope;
  }

  private kick(time: number, intensity: number, midi: number) {
    const context = this.context!;
    const mixer = this.mixer!;
    const oscillator = context.createOscillator();
    const fundamental = frequency(midi);
    oscillator.frequency.setValueAtTime(185, time);
    oscillator.frequency.exponentialRampToValueAtTime(
      fundamental * 1.09,
      time + 0.047,
    );
    oscillator.frequency.exponentialRampToValueAtTime(fundamental, time + 0.21);
    const envelope = this.envelope(time, 0.34, 0.94 * intensity);
    envelope.gain.setValueAtTime(0.88 * intensity, time + 0.023);
    const distortion = context.createWaveShaper();
    distortion.curve = CRUNCH;
    distortion.oversample = "2x";
    const warmth = context.createBiquadFilter();
    warmth.frequency.value = 1900;
    oscillator.connect(distortion).connect(warmth).connect(envelope);
    envelope.connect(mixer.input);
    envelope.connect(mixer.rumble);
    this.play(
      {
        sources: [oscillator],
        nodes: [oscillator, envelope, distortion, warmth],
      },
      time,
      0.36,
    );
    this.percussion(time, 0.009, 0.13 * intensity, 2000, "highpass");
  }

  private bass(
    time: number,
    midi: number,
    duration: number,
    level: number,
    cutoff: number,
  ) {
    const context = this.context!;
    const mixer = this.mixer!;
    const saws = [-8, 8].map((detune) => {
      const saw = context.createOscillator();
      saw.type = "sawtooth";
      saw.frequency.value = frequency(midi);
      saw.detune.value = detune;
      return saw;
    });
    const blend = context.createGain();
    blend.gain.value = 0.4;
    const fold = context.createWaveShaper();
    fold.curve = FOLD;
    fold.oversample = "2x";
    const filter = context.createBiquadFilter();
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(110, time + duration);
    filter.Q.value = 2.2;
    const lowpass = context.createBiquadFilter();
    lowpass.frequency.value = 900;
    lowpass.Q.value = 0.6;
    const envelope = this.envelope(time, duration, level);
    envelope.gain.setValueAtTime(level * 0.85, time + duration * 0.42);
    for (const saw of saws) saw.connect(blend);
    blend
      .connect(fold)
      .connect(filter)
      .connect(lowpass)
      .connect(envelope)
      .connect(mixer.music);

    // The clean, centered fundamental survives the upper voice's wavefolding.
    const sub = context.createOscillator();
    sub.frequency.value = frequency(midi);
    const subEnvelope = this.envelope(time, duration * 1.1, level * 0.8);
    subEnvelope.gain.setValueAtTime(level * 0.7, time + duration * 0.5);
    sub.connect(subEnvelope).connect(mixer.music);
    this.play(
      {
        sources: [...saws, sub],
        nodes: [
          ...saws,
          sub,
          blend,
          fold,
          filter,
          lowpass,
          envelope,
          subEnvelope,
        ],
      },
      time,
      duration * 1.1,
    );
  }

  private tone(
    time: number,
    midi: number,
    duration: number,
    level: number,
    options: {
      cutoff: number;
      resonance: number;
      echo?: boolean;
      pan?: number;
      slide?: number;
      acid?: boolean;
    },
  ) {
    const context = this.context!;
    const mixer = this.mixer!;
    const oscillator = context.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(frequency(options.slide ?? midi), time);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency(midi),
      time + 0.035,
    );
    const second = context.createOscillator();
    second.type = options.acid ? "square" : "sawtooth";
    second.frequency.setValueAtTime(frequency(options.slide ?? midi), time);
    second.frequency.exponentialRampToValueAtTime(
      frequency(midi),
      time + 0.035,
    );
    second.detune.value = options.acid ? -4 : 8;
    const blend = context.createGain();
    blend.gain.value = 0.38;
    const filter = context.createBiquadFilter();
    filter.frequency.setValueAtTime(options.cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(180, time + duration);
    filter.Q.value = options.resonance;
    const distortion = context.createWaveShaper();
    distortion.curve = options.acid ? FOLD : CRUNCH;
    distortion.oversample = "2x";
    const warmth = context.createBiquadFilter();
    warmth.frequency.value = options.acid ? 6800 : 3500;
    const envelope = this.envelope(time, duration, level);
    const pan = context.createStereoPanner();
    pan.pan.value = options.pan ?? 0;
    oscillator.connect(blend);
    second.connect(blend);
    blend
      .connect(filter)
      .connect(distortion)
      .connect(warmth)
      .connect(envelope)
      .connect(pan)
      .connect(mixer.music);
    if (options.echo) envelope.connect(mixer.echo);
    this.play(
      {
        sources: [oscillator, second],
        nodes: [
          oscillator,
          second,
          blend,
          filter,
          distortion,
          warmth,
          envelope,
          pan,
        ],
      },
      time,
      duration,
    );
  }

  private percussion(
    time: number,
    duration: number,
    level: number,
    cutoff: number,
    type: BiquadFilterType = "bandpass",
    position = 0,
  ) {
    const context = this.context!;
    const noise = context.createBufferSource();
    noise.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = 0.7;
    const envelope = this.envelope(time, duration, level);
    const pan = context.createStereoPanner();
    pan.pan.value = position;
    noise
      .connect(filter)
      .connect(envelope)
      .connect(pan)
      .connect(this.mixer!.input);
    this.play(
      { sources: [noise], nodes: [noise, filter, envelope, pan] },
      time,
      duration,
    );
  }

  private clap(time: number, level: number) {
    for (const offset of [0, 0.013, 0.027]) {
      this.percussion(
        time + offset,
        offset === 0.027 ? 0.16 : 0.018,
        level,
        1400,
      );
    }
  }

  private metal(time: number, pitch: number, level: number, position: number) {
    const context = this.context!;
    const carrier = context.createOscillator();
    carrier.frequency.value = pitch;
    const modulator = context.createOscillator();
    modulator.frequency.value = pitch * 1.731;
    const modulation = context.createGain();
    modulation.gain.setValueAtTime(pitch * 5, time);
    modulation.gain.exponentialRampToValueAtTime(1, time + 0.09);
    modulator.connect(modulation).connect(carrier.frequency);
    const envelope = this.envelope(time, 0.135, level);
    const pan = context.createStereoPanner();
    pan.pan.value = position;
    carrier.connect(envelope).connect(pan).connect(this.mixer!.input);
    envelope.connect(this.mixer!.echo);
    this.play(
      {
        sources: [carrier, modulator],
        nodes: [carrier, modulator, modulation, envelope, pan],
      },
      time,
      0.15,
    );
  }

  private sweep(
    time: number,
    duration: number,
    rising: boolean,
    level: number,
  ) {
    const context = this.context!;
    const noise = context.createBufferSource();
    noise.buffer = this.noise;
    noise.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.6;
    filter.frequency.setValueAtTime(rising ? 240 : 9000, time);
    filter.frequency.exponentialRampToValueAtTime(
      rising ? 10500 : 300,
      time + duration,
    );
    const envelope = this.envelope(time, duration, level);
    if (rising) {
      envelope.gain.cancelScheduledValues(time);
      envelope.gain.setValueAtTime(FLOOR, time);
      envelope.gain.linearRampToValueAtTime(level, time + duration - 0.04);
      envelope.gain.exponentialRampToValueAtTime(FLOOR, time + duration);
    }
    const pan = context.createStereoPanner();
    pan.pan.setValueAtTime(-0.65, time);
    pan.pan.linearRampToValueAtTime(0.65, time + duration);
    noise
      .connect(filter)
      .connect(envelope)
      .connect(pan)
      .connect(this.mixer!.music);
    this.play(
      { sources: [noise], nodes: [noise, filter, envelope, pan] },
      time,
      duration,
    );
  }
}
