import type { MusicTrack } from "./types";

// Four original, copyright-safe "homage" compositions. Each evokes the ERA and
// MOOD of a film soundtrack the player asked for, without reproducing any
// protected melody. These are plain data the synth engine renders, and ship in
// code so the Music screen works with no MongoDB configured. Custom tracks added
// later via /api/music/tracks are merged on top of these.
export const BUILTIN_MUSIC_TRACKS: MusicTrack[] = [
  {
    id: "mach-rush",
    title: "Mach Rush",
    subtitle: "80s jet-fuel synth-rock",
    inspiration: "Inspired by the adrenaline and afterburner energy of Top Gun.",
    bpm: 140,
    filterBase: 2600,
    accent: "amber",
    source: "builtin",
    layers: [
      {
        role: "bass",
        waveform: "sawtooth",
        pattern: ["a2", "a2", "a2", "a2", "g2", "g2", "f2", "e2"],
        stepsPerNote: 2,
        gain: 0.9
      },
      {
        role: "lead",
        waveform: "square",
        pattern: ["e4", "g4", "a4", "b4", "a4", "g4", "e4", "d4"],
        stepsPerNote: 4,
        gain: 0.8,
        detune: 6
      },
      {
        role: "arp",
        waveform: "triangle",
        pattern: ["a3", "c4", "e4", "c4", "a3", "e4", "a4", "e4", "g3", "b3", "d4", "b3", "g3", "d4", "g4", "d4"],
        gain: 0.5,
        intensities: ["combat", "danger", "boss"]
      }
    ],
    intensityProfiles: {
      calm: { tempoMul: 0.9, cutoffMul: 0.7, gainMul: 0.85 },
      danger: { tempoMul: 1.08, cutoffMul: 1.25, gainMul: 1.1 },
      boss: { tempoMul: 1.12, cutoffMul: 1.4, gainMul: 1.12 }
    }
  },
  {
    id: "skyward-saga",
    title: "Skyward Saga",
    subtitle: "soaring dream-pop anthem",
    inspiration: "Inspired by the wonder and endless skies of The NeverEnding Story.",
    bpm: 96,
    filterBase: 1500,
    accent: "cyan",
    source: "builtin",
    layers: [
      {
        role: "bass",
        waveform: "sine",
        pattern: ["c2", "a2", "f2", "g2"],
        stepsPerNote: 8,
        gain: 0.7
      },
      {
        role: "pad",
        waveform: "triangle",
        pattern: ["c3", "a3", "f3", "g3"],
        stepsPerNote: 8,
        gain: 0.6
      },
      {
        role: "lead",
        waveform: "sine",
        pattern: ["e4", "g4", "c5", "b4", "a4", "g4", "e4", "d4"],
        stepsPerNote: 4,
        gain: 0.7
      },
      {
        role: "arp",
        waveform: "triangle",
        pattern: ["c4", "e4", "g4", "e4", "a4", "e4", "f4", "a4"],
        stepsPerNote: 2,
        gain: 0.4,
        intensities: ["combat", "danger", "boss"]
      }
    ],
    intensityProfiles: {
      calm: { tempoMul: 0.95, cutoffMul: 0.85 },
      danger: { tempoMul: 1.05, cutoffMul: 1.2, gainMul: 1.05 },
      boss: { tempoMul: 1.08, cutoffMul: 1.3, gainMul: 1.08 }
    }
  },
  {
    id: "stellar-command",
    title: "Stellar Command",
    subtitle: "majestic starship fanfare",
    inspiration: "Inspired by the grandeur and exploration of Star Trek: The Next Generation.",
    bpm: 84,
    filterBase: 1900,
    accent: "green",
    source: "builtin",
    layers: [
      {
        role: "bass",
        waveform: "sine",
        pattern: ["f2", "f2", "c2", "g2"],
        stepsPerNote: 8,
        gain: 0.7
      },
      {
        role: "pad",
        waveform: "sawtooth",
        pattern: ["f2", "c3", "d3", "c3"],
        stepsPerNote: 8,
        gain: 0.4,
        octaveShift: 1
      },
      {
        role: "lead",
        waveform: "sawtooth",
        pattern: ["c4", "f4", "a4", "g4", "c5", "a4", "f4", "g4"],
        stepsPerNote: 4,
        gain: 0.78,
        detune: 4
      }
    ],
    intensityProfiles: {
      calm: { tempoMul: 0.97, cutoffMul: 0.9 },
      danger: { tempoMul: 1.05, cutoffMul: 1.2, gainMul: 1.05 },
      boss: { tempoMul: 1.06, cutoffMul: 1.35, gainMul: 1.08 }
    }
  },
  {
    id: "flux-overdrive",
    title: "Flux Overdrive",
    subtitle: "heroic adventure overture",
    inspiration: "Inspired by the bombast and momentum of Back to the Future.",
    bpm: 120,
    filterBase: 2400,
    accent: "pink",
    source: "builtin",
    layers: [
      {
        role: "bass",
        waveform: "sawtooth",
        pattern: ["c2", "c2", "g2", "g2", "a2", "a2", "f2", "g2"],
        stepsPerNote: 2,
        gain: 0.85
      },
      {
        role: "lead",
        waveform: "square",
        pattern: ["g3", "c4", "e4", "g4", "f4", "e4", "d4", "c4"],
        stepsPerNote: 4,
        gain: 0.8,
        detune: 5
      },
      {
        role: "arp",
        waveform: "triangle",
        pattern: ["c4", "e4", "g4", "c5", "g4", "e4", "c4", "e4", "d4", "f4", "a4", "d5", "a4", "f4", "d4", "f4"],
        gain: 0.5,
        intensities: ["combat", "danger", "boss"]
      }
    ],
    intensityProfiles: {
      calm: { tempoMul: 0.92, cutoffMul: 0.75, gainMul: 0.85 },
      danger: { tempoMul: 1.08, cutoffMul: 1.3, gainMul: 1.1 },
      boss: { tempoMul: 1.12, cutoffMul: 1.45, gainMul: 1.12 }
    }
  }
];

export function getMusicTrack(id: string): MusicTrack | undefined {
  return BUILTIN_MUSIC_TRACKS.find((track) => track.id === id);
}
