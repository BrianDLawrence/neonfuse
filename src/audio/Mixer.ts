import type { AudioBusName, AudioDuckRule } from "./types";

const BUS_DEFAULTS: Record<AudioBusName, number> = {
  master: 1,
  music: 0.8,
  sfx: 0.9,
  ui: 0.8,
  ambient: 0.5
};

export class Mixer {
  private readonly context: AudioContext;
  private readonly buses = new Map<AudioBusName, GainNode>();
  private readonly baseVolumes = new Map<AudioBusName, number>();

  constructor(context: AudioContext) {
    this.context = context;

    const master = this.createBus("master", BUS_DEFAULTS.master);
    master.connect(context.destination);

    this.createBus("music", BUS_DEFAULTS.music).connect(master);
    this.createBus("sfx", BUS_DEFAULTS.sfx).connect(master);
    this.createBus("ui", BUS_DEFAULTS.ui).connect(master);
    this.createBus("ambient", BUS_DEFAULTS.ambient).connect(master);
  }

  get outputTime() {
    return this.context.currentTime;
  }

  getBus(bus: AudioBusName) {
    const gain = this.buses.get(bus);

    if (!gain) {
      throw new Error(`Unknown audio bus: ${bus}`);
    }

    return gain;
  }

  setVolume(bus: AudioBusName, volume: number) {
    const safeVolume = Math.max(0, Math.min(1, volume));
    const gain = this.getBus(bus);

    this.baseVolumes.set(bus, safeVolume);
    gain.gain.setTargetAtTime(safeVolume, this.context.currentTime, 0.015);
  }

  duck(bus: AudioBusName, rule: AudioDuckRule) {
    const gain = this.getBus(bus);
    const baseVolume = this.baseVolumes.get(bus) ?? 1;
    const duckedVolume = Math.max(0, baseVolume * (1 - rule.amount));
    const now = this.context.currentTime;
    const attackEnd = now + rule.attackMs / 1000;
    const holdEnd = attackEnd + rule.holdMs / 1000;
    const releaseEnd = holdEnd + rule.releaseMs / 1000;

    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(duckedVolume, attackEnd);
    gain.gain.setValueAtTime(duckedVolume, holdEnd);
    gain.gain.linearRampToValueAtTime(baseVolume, releaseEnd);
  }

  private createBus(bus: AudioBusName, volume: number) {
    const gain = this.context.createGain();

    gain.gain.value = volume;
    this.buses.set(bus, gain);
    this.baseVolumes.set(bus, volume);

    return gain;
  }
}
