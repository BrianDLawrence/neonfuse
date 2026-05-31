import type { AudioAssetKey, AudioBusName, MusicIntensity, MusicLayer, MusicTrack } from "./types";
import { Mixer } from "./Mixer";

type SynthOptions = {
  bus: AudioBusName;
  volume: number;
  pitch: number;
};

type ProceduralLoop = {
  gain: GainNode;
  stop: (when: number) => void;
};

const NOTE = {
  c2: 65.41,
  d2: 73.42,
  e2: 82.41,
  f2: 87.31,
  g2: 98,
  a2: 110,
  b2: 123.47,
  c3: 130.81,
  d3: 146.83,
  e3: 164.81,
  f3: 174.61,
  g3: 196,
  a3: 220,
  b3: 246.94,
  c4: 261.63,
  d4: 293.66,
  e4: 329.63,
  g4: 392
};

export function playSynthFallback(
  context: AudioContext,
  mixer: Mixer,
  key: AudioAssetKey,
  { bus, volume, pitch }: SynthOptions
) {
  if (key.includes("explosion") || key.includes("shield.break")) {
    playExplosion(context, mixer, bus, volume, pitch, key.includes("large") || key.includes("boss"));
    return;
  }

  if (key.includes("weapon")) {
    playBlip(context, mixer, bus, volume, pitch, 520, 0.09, "sawtooth");
    return;
  }

  if (key.includes("pickup") || key.includes("reward") || key.includes("combo")) {
    playArp(context, mixer, bus, volume, pitch);
    return;
  }

  if (key.includes("player.damage") || key.includes("enemy.damage")) {
    playBlip(context, mixer, bus, volume, pitch, 180, 0.11, "square");
    return;
  }

  if (key.includes("ui.error") || key.includes("cancel")) {
    playBlip(context, mixer, bus, volume, pitch, 130, 0.1, "triangle");
    return;
  }

  if (key.includes("stinger") || key.includes("boss") || key.includes("phase")) {
    playStinger(context, mixer, bus, volume, pitch, key.includes("victory"));
    return;
  }

  playBlip(context, mixer, bus, volume, pitch, 420, 0.06, "square");
}

export function createProceduralMusicLoop(
  context: AudioContext,
  mixer: Mixer,
  intensity: MusicIntensity,
  fadeMs: number
): ProceduralLoop {
  const output = context.createGain();
  const now = context.currentTime;
  const fadeEnd = now + fadeMs / 1000;
  const activeNodes = new Set<AudioScheduledSourceNode>();
  const sequence = getMusicSequence(intensity);
  const stepSeconds = intensity === "calm" ? 0.18 : 0.14;
  const barSeconds = sequence.arp.length * stepSeconds;
  let nextStepAt = now + 0.04;
  let step = 0;
  let stopped = false;

  output.gain.value = 0;
  output.connect(mixer.getBus("music"));
  output.gain.linearRampToValueAtTime(getIntensityVolume(intensity), fadeEnd);

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = intensity === "calm" ? 1700 : 2600;
  filter.Q.value = 0.9;
  filter.connect(output);

  const register = (node: AudioScheduledSourceNode) => {
    activeNodes.add(node);
    node.addEventListener("ended", () => activeNodes.delete(node));
  };

  const schedule = () => {
    if (stopped) {
      return;
    }

    const scheduleUntil = context.currentTime + barSeconds;

    while (nextStepAt < scheduleUntil) {
      const arpNote = sequence.arp[step % sequence.arp.length];
      const bassNote = sequence.bass[Math.floor(step / 4) % sequence.bass.length];
      const accent = step % 4 === 0;
      const offbeat = step % 4 === 2;

      scheduleTone(context, filter, activeNodes, register, {
        at: nextStepAt,
        frequency: arpNote,
        duration: stepSeconds * 0.72,
        volume: intensity === "calm" ? 0.026 : 0.038,
        type: "triangle",
        detune: step % 2 === 0 ? -4 : 4
      });

      if (accent) {
        scheduleTone(context, filter, activeNodes, register, {
          at: nextStepAt,
          frequency: bassNote,
          duration: stepSeconds * 1.8,
          volume: intensity === "calm" ? 0.045 : 0.07,
          type: "sawtooth",
          endFrequency: bassNote * 0.7
        });
      }

      if (intensity !== "calm" && offbeat) {
        scheduleNoise(context, filter, activeNodes, register, nextStepAt, 0.045, 0.018);
      }

      step += 1;
      nextStepAt += stepSeconds;
    }
  };

  schedule();
  const timer = window.setInterval(schedule, 500);

  return {
    gain: output,
    stop: (when: number) => {
      stopped = true;
      window.clearInterval(timer);
      activeNodes.forEach((node) => node.stop(when));
    }
  };
}

const SEMITONES: Record<string, number> = {
  c: 0,
  "c#": 1,
  d: 2,
  "d#": 3,
  e: 4,
  f: 5,
  "f#": 6,
  g: 7,
  "g#": 8,
  a: 9,
  "a#": 10,
  b: 11
};

// Convert a note name like "a4" / "f#3" to a frequency in Hz (A4 = 440, equal
// temperament). Used by the data-driven track engine so tracks can be written
// as readable note patterns instead of raw frequencies.
export function noteFrequency(name: string): number {
  const match = /^([a-g])(#?)(-?\d+)$/.exec(name.trim().toLowerCase());

  if (!match) {
    throw new Error(`Invalid note name "${name}"`);
  }

  const [, letter, sharp, octaveText] = match;
  const semitone = SEMITONES[`${letter}${sharp}`];
  const octave = Number(octaveText);
  const midi = (octave + 1) * 12 + semitone;

  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Relative loudness of a synth voice by role, kept in the same magnitude band
// as the legacy procedural loop so tracks never blast louder than the SFX bus.
const ROLE_VOLUME: Record<MusicLayer["role"], number> = {
  lead: 0.05,
  arp: 0.038,
  bass: 0.07,
  pad: 0.034
};

// Render a data-driven MusicTrack into a looping Web Audio graph. Mirrors
// createProceduralMusicLoop's contract (returns { gain, stop }) and reuses the
// same scheduleTone helper, but the notes/tempo/filter come from track data and
// the current intensity nudges tempo, cutoff, and gain via intensityProfiles.
export function createTrackMusicLoop(
  context: AudioContext,
  mixer: Mixer,
  track: MusicTrack,
  intensity: MusicIntensity,
  fadeMs: number
): ProceduralLoop {
  const profile = track.intensityProfiles?.[intensity] ?? {};
  const tempoMul = profile.tempoMul ?? 1;
  const cutoffMul = profile.cutoffMul ?? 1;
  const gainMul = profile.gainMul ?? 1;

  const output = context.createGain();
  const now = context.currentTime;
  const fadeEnd = now + fadeMs / 1000;
  const activeNodes = new Set<AudioScheduledSourceNode>();

  // A sequencer "step" is a 16th note; pattern entries can hold several steps.
  const stepSeconds = 60 / track.bpm / 4 / tempoMul;
  const layers = track.layers.filter(
    (layer) => !layer.intensities || layer.intensities.includes(intensity)
  );
  const layerSpanSteps = (layer: MusicLayer) => layer.pattern.length * (layer.stepsPerNote ?? 1);
  const loopSteps = layers.reduce((max, layer) => Math.max(max, layerSpanSteps(layer)), 1);
  const barSeconds = loopSteps * stepSeconds;

  output.gain.value = 0;
  output.connect(mixer.getBus("music"));
  output.gain.linearRampToValueAtTime(getIntensityVolume(intensity) * gainMul, fadeEnd);

  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = track.filterBase * cutoffMul;
  filter.Q.value = 0.9;
  filter.connect(output);

  const register = (node: AudioScheduledSourceNode) => {
    activeNodes.add(node);
    node.addEventListener("ended", () => activeNodes.delete(node));
  };

  let nextLoopAt = now + 0.04;
  let stopped = false;

  const scheduleLoopFrom = (loopStart: number) => {
    layers.forEach((layer) => {
      const steps = layer.stepsPerNote ?? 1;
      const noteSeconds = steps * stepSeconds;
      const octaveMul = Math.pow(2, layer.octaveShift ?? 0);
      const volume = Math.max(0.0001, ROLE_VOLUME[layer.role] * layer.gain);

      layer.pattern.forEach((noteName, index) => {
        if (!noteName) {
          return;
        }

        const frequency = noteFrequency(noteName) * octaveMul;

        scheduleTone(context, filter, activeNodes, register, {
          at: loopStart + index * noteSeconds,
          frequency,
          duration: noteSeconds * (layer.role === "pad" ? 0.96 : 0.82),
          volume,
          type: layer.waveform,
          detune: layer.detune ?? 0,
          endFrequency: layer.role === "bass" ? frequency * 0.85 : undefined
        });
      });
    });
  };

  const tick = () => {
    if (stopped) {
      return;
    }

    const scheduleUntil = context.currentTime + barSeconds + 0.1;

    while (nextLoopAt < scheduleUntil) {
      scheduleLoopFrom(nextLoopAt);
      nextLoopAt += barSeconds;
    }
  };

  tick();
  const timer = window.setInterval(tick, 500);

  return {
    gain: output,
    stop: (when: number) => {
      stopped = true;
      window.clearInterval(timer);
      activeNodes.forEach((node) => node.stop(when));
    }
  };
}

function playExplosion(
  context: AudioContext,
  mixer: Mixer,
  bus: AudioBusName,
  volume: number,
  pitch: number,
  large: boolean
) {
  const now = context.currentTime;
  const duration = large ? 0.58 : 0.28;
  const noise = context.createBufferSource();
  const noiseGain = context.createGain();
  const filter = context.createBiquadFilter();
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  }

  noise.buffer = buffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(large ? 900 : 1500, now);
  filter.frequency.exponentialRampToValueAtTime(90, now + duration);
  noiseGain.gain.setValueAtTime(0.0001, now);
  noiseGain.gain.exponentialRampToValueAtTime(volume * (large ? 0.75 : 0.45), now + 0.015);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(mixer.getBus(bus));
  noise.start(now);
  noise.stop(now + duration);

  playBlip(context, mixer, bus, volume * 0.8, pitch * 0.55, large ? 95 : 150, large ? 0.36 : 0.18, "sine");
}

function playBlip(
  context: AudioContext,
  mixer: Mixer,
  bus: AudioBusName,
  volume: number,
  pitch: number,
  frequency: number,
  duration: number,
  type: OscillatorType
) {
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency * pitch, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(50, frequency * pitch * 0.45), now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.28), now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(mixer.getBus(bus));
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playArp(context: AudioContext, mixer: Mixer, bus: AudioBusName, volume: number, pitch: number) {
  [NOTE.c3, NOTE.e3, NOTE.g3].forEach((frequency, index) => {
    const delay = index * 0.045;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    const end = start + 0.11;

    oscillator.type = "triangle";
    oscillator.frequency.value = frequency * pitch;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume * 0.22, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(mixer.getBus(bus));
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  });
}

function playStinger(
  context: AudioContext,
  mixer: Mixer,
  bus: AudioBusName,
  volume: number,
  pitch: number,
  victory: boolean
) {
  const notes = victory ? [NOTE.c3, NOTE.e3, NOTE.g3] : [NOTE.g2, NOTE.d2, NOTE.c2];

  notes.forEach((frequency, index) => {
    const start = context.currentTime + index * 0.09;
    const duration = 0.22;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = victory ? "triangle" : "sawtooth";
    oscillator.frequency.value = frequency * pitch;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume * 0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(mixer.getBus(bus));
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  });
}

function scheduleTone(
  context: AudioContext,
  destination: AudioNode,
  activeNodes: Set<AudioScheduledSourceNode>,
  register: (node: AudioScheduledSourceNode) => void,
  {
    at,
    frequency,
    duration,
    volume,
    type,
    detune = 0,
    endFrequency
  }: {
    at: number;
    frequency: number;
    duration: number;
    volume: number;
    type: OscillatorType;
    detune?: number;
    endFrequency?: number;
  }
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  register(oscillator);
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);

  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
  }

  oscillator.detune.value = detune;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
  activeNodes.add(oscillator);
}

function scheduleNoise(
  context: AudioContext,
  destination: AudioNode,
  activeNodes: Set<AudioScheduledSourceNode>,
  register: (node: AudioScheduledSourceNode) => void,
  at: number,
  duration: number,
  volume: number
) {
  const noise = context.createBufferSource();
  const gain = context.createGain();
  const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * duration)), context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  }

  register(noise);
  noise.buffer = buffer;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  noise.connect(gain);
  gain.connect(destination);
  noise.start(at);
  noise.stop(at + duration + 0.01);
  activeNodes.add(noise);
}

function getMusicSequence(intensity: MusicIntensity) {
  if (intensity === "boss") {
    return {
      bass: [NOTE.f2, NOTE.f2, NOTE.d2, NOTE.e2],
      arp: [NOTE.f3, NOTE.c4, NOTE.d4, NOTE.c4, NOTE.f3, NOTE.a3, NOTE.c4, NOTE.a3]
    };
  }

  if (intensity === "danger") {
    return {
      bass: [NOTE.d2, NOTE.d2, NOTE.f2, NOTE.e2],
      arp: [NOTE.d3, NOTE.a3, NOTE.c4, NOTE.a3, NOTE.f3, NOTE.a3, NOTE.d4, NOTE.c4]
    };
  }

  if (intensity === "calm") {
    return {
      bass: [NOTE.a2, NOTE.g2, NOTE.f2, NOTE.g2],
      arp: [NOTE.a3, NOTE.c4, NOTE.e4, NOTE.c4, NOTE.g3, NOTE.b3, NOTE.d4, NOTE.b3]
    };
  }

  return {
    bass: [NOTE.c2, NOTE.c2, NOTE.g2, NOTE.a2],
    arp: [NOTE.c3, NOTE.g3, NOTE.c4, NOTE.e4, NOTE.g3, NOTE.c4, NOTE.e4, NOTE.g4]
  };
}

function getIntensityVolume(intensity: MusicIntensity) {
  return intensity === "calm" ? 0.34 : 0.42;
}
