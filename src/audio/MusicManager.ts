import type { AudioAssetKey, MusicIntensity, MusicTrack } from "./types";
import { Mixer } from "./Mixer";
import { SfxManager } from "./SfxManager";
import { createProceduralMusicLoop, createTrackMusicLoop } from "./synthFallback";

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
  private currentGain?: GainNode;
  private currentStop?: (when: number) => void;
  private currentIntensity: MusicIntensity = "combat";
  // The user-selected gameplay theme (null = fall back to the legacy intensity
  // music). When set, the intensity system still modulates it via the track's
  // intensityProfiles.
  private activeTrack?: MusicTrack;
  // While previewing on the Music screen this overrides activeTrack so a track
  // can be auditioned without committing to it.
  private previewOverride?: MusicTrack;
  private resumeAfterPreview?: MusicIntensity;

  constructor(context: AudioContext, mixer: Mixer, sfx: SfxManager) {
    this.context = context;
    this.mixer = mixer;
    this.sfx = sfx;
  }

  async setIntensity(intensity: MusicIntensity, fadeMs = 700) {
    const key = INTENSITY_TRACKS[intensity];

    if (!key) {
      this.currentIntensity = intensity;
      this.stop(fadeMs);
      return;
    }

    if (intensity === this.currentIntensity && this.currentGain && !this.previewOverride) {
      return;
    }

    this.currentIntensity = intensity;
    await this.startLoop(intensity, fadeMs);
  }

  // Set the active gameplay theme. If music is already playing (and not in a
  // preview), re-render it immediately at the current intensity so the new
  // track takes over with a crossfade.
  async setActiveTrack(track: MusicTrack | null) {
    this.activeTrack = track ?? undefined;

    if (this.currentGain && !this.previewOverride && INTENSITY_TRACKS[this.currentIntensity]) {
      await this.startLoop(this.currentIntensity, 600);
    }
  }

  getActiveTrackId(): string | undefined {
    return this.activeTrack?.id;
  }

  // Audition a track immediately (rendered at combat energy), remembering
  // whether music was playing so stopPreview can restore it.
  async previewTrack(track: MusicTrack, fadeMs = 350) {
    this.resumeAfterPreview = this.currentGain ? this.currentIntensity : undefined;
    this.previewOverride = track;
    await this.startLoop("combat", fadeMs);
  }

  async stopPreview(fadeMs = 350) {
    if (!this.previewOverride) {
      return;
    }

    this.previewOverride = undefined;
    const resume = this.resumeAfterPreview;
    this.resumeAfterPreview = undefined;

    if (resume && INTENSITY_TRACKS[resume]) {
      this.currentIntensity = resume;
      await this.startLoop(resume, fadeMs);
    } else {
      this.stop(fadeMs);
    }
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

    this.currentGain.gain.cancelScheduledValues(now);
    this.currentGain.gain.setValueAtTime(this.currentGain.gain.value, now);
    this.currentGain.gain.linearRampToValueAtTime(0, fadeEnd);
    this.currentStop?.(fadeEnd + 0.05);

    this.currentGain = undefined;
    this.currentStop = undefined;
  }

  // Render the currently appropriate music (preview override → active track →
  // procedural intensity loop) at the given intensity, crossfading the
  // previous loop out.
  private async startLoop(intensity: MusicIntensity, fadeMs: number) {
    const previousGain = this.currentGain;
    const previousStop = this.currentStop;
    const now = this.context.currentTime;
    const fadeEnd = now + fadeMs / 1000;
    const track = this.previewOverride ?? this.activeTrack;
    const loop = track
      ? createTrackMusicLoop(this.context, this.mixer, track, intensity, fadeMs)
      : createProceduralMusicLoop(this.context, this.mixer, intensity, fadeMs);

    if (previousGain) {
      previousGain.gain.cancelScheduledValues(now);
      previousGain.gain.setValueAtTime(previousGain.gain.value, now);
      previousGain.gain.linearRampToValueAtTime(0, fadeEnd);
      previousStop?.(fadeEnd + 0.05);
    }

    this.currentGain = loop.gain;
    this.currentStop = loop.stop;
  }
}
