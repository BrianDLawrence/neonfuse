import type { AudioAssetKey, AudioBusName } from "./types";
import { Mixer } from "./Mixer";
import { playSynthFallback } from "./synthFallback";

type PlayOptions = {
  bus: AudioBusName;
  volume: number;
  pitch: number;
};

// Every sound is synthesized with Web Audio at play time; no audio files are
// shipped or fetched. AudioAssetKey names the sound design slot the synth
// renders for.
export class SfxManager {
  private readonly context: AudioContext;
  private readonly mixer: Mixer;

  constructor(context: AudioContext, mixer: Mixer) {
    this.context = context;
    this.mixer = mixer;
  }

  async play(key: AudioAssetKey, options: PlayOptions) {
    playSynthFallback(this.context, this.mixer, key, options);
  }
}
