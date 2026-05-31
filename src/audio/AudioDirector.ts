import { audioEvents } from "./audioEvents";
import { Mixer } from "./Mixer";
import { MusicManager } from "./MusicManager";
import { SfxManager } from "./SfxManager";
import type { AudioEventName, AudioEventPayload } from "./types";

const randomBetween = ([min, max]: readonly [number, number]) => {
  return min + Math.random() * (max - min);
};

const pickOne = <T>(items: T[]) => {
  return items[Math.floor(Math.random() * items.length)];
};

export class AudioDirector {
  private readonly context: AudioContext;
  private readonly mixer: Mixer;
  private readonly sfx: SfxManager;
  private readonly music: MusicManager;
  private readonly lastPlayed = new Map<AudioEventName, number>();
  private pendingIntensity?: Parameters<MusicManager["setIntensity"]>[0];

  constructor(context = new AudioContext()) {
    this.context = context;
    this.mixer = new Mixer(context);
    this.sfx = new SfxManager(context, this.mixer);
    this.music = new MusicManager(context, this.mixer, this.sfx);
  }

  async unlock() {
    if (this.context.state !== "running") {
      await this.context.resume();
    }

    if (this.pendingIntensity) {
      const intensity = this.pendingIntensity;
      this.pendingIntensity = undefined;
      await this.music.setIntensity(intensity);
    }
  }

  setVolume(bus: Parameters<Mixer["setVolume"]>[0], volume: number) {
    this.mixer.setVolume(bus, volume);
  }

  setMusicEnabled(enabled: boolean, volume = 0.8) {
    this.mixer.setVolume("music", enabled ? volume : 0);
  }

  setMusicVolume(volume: number) {
    this.mixer.setVolume("music", volume);
  }

  setSfxVolume(volume: number) {
    this.mixer.setVolume("sfx", volume);
    this.mixer.setVolume("ui", volume);
  }

  async emit(eventName: AudioEventName, payload: AudioEventPayload = {}) {
    void payload;

    const rule = audioEvents[eventName];
    const nowMs = this.mixer.outputTime * 1000;
    const previousMs = this.lastPlayed.get(eventName) ?? -Infinity;

    if (rule.cooldownMs && nowMs - previousMs < rule.cooldownMs) {
      return;
    }

    this.lastPlayed.set(eventName, nowMs);

    if (rule.musicIntensity) {
      if (this.context.state !== "running") {
        this.pendingIntensity = rule.musicIntensity;
        return;
      }

      await this.music.setIntensity(rule.musicIntensity);
    }

    if (rule.duckMusic) {
      this.mixer.duck("music", rule.duckMusic);
    }

    const volume = randomBetween(rule.volume ?? [1, 1]);
    const pitch = randomBetween(rule.pitch ?? [1, 1]);

    const assets = rule.playMode === "layered" ? rule.variants : [pickOne(rule.variants)];

    await Promise.all(
      assets.map((asset) =>
        this.sfx.play(asset, {
          bus: rule.bus,
          volume,
          pitch
        })
      )
    );
  }

  async setMusicIntensity(intensity: Parameters<MusicManager["setIntensity"]>[0]) {
    if (this.context.state !== "running") {
      this.pendingIntensity = intensity;
      return;
    }

    await this.music.setIntensity(intensity);
  }

  async dispose() {
    this.music.stop(120);

    if (this.context.state !== "closed") {
      await this.context.close();
    }
  }
}
