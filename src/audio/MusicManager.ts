import { audioManifest } from "./audioManifest";
import type { AudioAssetKey, MusicIntensity } from "./types";
import { Mixer } from "./Mixer";
import { SfxManager } from "./SfxManager";
import { createProceduralMusicLoop } from "./synthFallback";

const INTENSITY_TRACKS: Record<MusicIntensity, AudioAssetKey | null> = {
  calm: "music.menu.loop",
  combat: "music.gameplay.loop",
  danger: "music.gameplay.high",
  boss: "music.boss.loop",
  victory: null
};

export class MusicManager {
  private readonly context: AudioContext;
  private readonly mixer: Mixer;
  private readonly sfx: SfxManager;
  private currentSource?: AudioBufferSourceNode;
  private currentGain?: GainNode;
  private currentStop?: (when: number) => void;
  private currentTrack?: AudioAssetKey;

  constructor(context: AudioContext, mixer: Mixer, sfx: SfxManager) {
    this.context = context;
    this.mixer = mixer;
    this.sfx = sfx;
  }

  async setIntensity(intensity: MusicIntensity, fadeMs = 700) {
    const track = INTENSITY_TRACKS[intensity];

    if (!track) {
      this.stop(fadeMs);
      return;
    }

    if (track === this.currentTrack) {
      return;
    }

    await this.playLoop(track, fadeMs);
  }

  async playStinger(key: AudioAssetKey, volume = 0.85) {
    await this.sfx.play(key, {
      bus: "music",
      volume,
      pitch: 1
    });
  }

  stop(fadeMs = 400) {
    if (!this.currentGain) {
      return;
    }

    const now = this.context.currentTime;
    const fadeEnd = now + fadeMs / 1000;
    const source = this.currentSource;

    this.currentGain.gain.cancelScheduledValues(now);
    this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, now);
    this.currentGain.gain.linearRampToValueAtTime(0, fadeEnd);
    source?.stop(fadeEnd + 0.05);
    this.currentStop?.(fadeEnd + 0.05);

    this.currentSource = undefined;
    this.currentGain = undefined;
    this.currentStop = undefined;
    this.currentTrack = undefined;
  }

  private async playLoop(key: AudioAssetKey, fadeMs: number) {
    const previousSource = this.currentSource;
    const previousGain = this.currentGain;
    const previousStop = this.currentStop;
    const now = this.context.currentTime;
    const fadeEnd = now + fadeMs / 1000;
    const intensity = this.getIntensityForTrack(key);
    const buffer = await this.loadBuffer(key).catch(() => null);
    let source: AudioBufferSourceNode | undefined;
    let gain: GainNode;
    let stop: ((when: number) => void) | undefined;

    if (buffer) {
      source = this.context.createBufferSource();
      gain = this.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(this.mixer.getBus("music"));
      source.start();
      gain.gain.linearRampToValueAtTime(1, fadeEnd);
    } else {
      const proceduralLoop = createProceduralMusicLoop(this.context, this.mixer, intensity, fadeMs);
      gain = proceduralLoop.gain;
      stop = proceduralLoop.stop;
    }

    if (previousGain) {
      previousGain.gain.cancelScheduledValues(now);
      previousGain.gain.setValueAtTime(previousGain.gain.value, now);
      previousGain.gain.linearRampToValueAtTime(0, fadeEnd);
      previousSource?.stop(fadeEnd + 0.05);
      previousStop?.(fadeEnd + 0.05);
    }

    this.currentSource = source;
    this.currentGain = gain;
    this.currentStop = stop;
    this.currentTrack = key;
  }

  private async loadBuffer(key: AudioAssetKey) {
    const response = await fetch(audioManifest[key]);

    if (!response.ok) {
      throw new Error(`Failed to load music asset "${key}"`);
    }

    return this.context.decodeAudioData(await response.arrayBuffer());
  }

  private getIntensityForTrack(key: AudioAssetKey): MusicIntensity {
    return (Object.entries(INTENSITY_TRACKS).find(([, track]) => track === key)?.[0] ?? "combat") as MusicIntensity;
  }
}
