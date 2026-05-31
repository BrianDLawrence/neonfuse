import { audioManifest } from "./audioManifest";
import type { AudioAssetKey, AudioBusName } from "./types";
import { Mixer } from "./Mixer";
import { playSynthFallback } from "./synthFallback";

type PlayOptions = {
  bus: AudioBusName;
  volume: number;
  pitch: number;
};

export class SfxManager {
  private readonly context: AudioContext;
  private readonly mixer: Mixer;
  private readonly buffers = new Map<AudioAssetKey, AudioBuffer>();
  private readonly missingAssets = new Set<AudioAssetKey>();

  constructor(context: AudioContext, mixer: Mixer) {
    this.context = context;
    this.mixer = mixer;
  }

  async preload(keys: AudioAssetKey[]) {
    await Promise.all(keys.map((key) => this.load(key).catch(() => undefined)));
  }

  async play(key: AudioAssetKey, options: PlayOptions) {
    if (this.missingAssets.has(key)) {
      playSynthFallback(this.context, this.mixer, key, options);
      return;
    }

    const buffer = await this.load(key).catch(() => null);

    if (!buffer) {
      this.missingAssets.add(key);
      playSynthFallback(this.context, this.mixer, key, options);
      return;
    }

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();

    source.buffer = buffer;
    source.playbackRate.value = options.pitch;
    gain.gain.value = options.volume;

    source.connect(gain);
    gain.connect(this.mixer.getBus(options.bus));
    source.start();
  }

  private async load(key: AudioAssetKey) {
    const cached = this.buffers.get(key);

    if (cached) {
      return cached;
    }

    const url = audioManifest[key];
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to load audio asset "${key}" from ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.context.decodeAudioData(arrayBuffer);

    this.buffers.set(key, audioBuffer);

    return audioBuffer;
  }
}
