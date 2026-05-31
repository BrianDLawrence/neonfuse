import { describe, expect, it } from "vitest";
import { musicTrackSchema } from "./music";

const validTrack = {
  id: "test-track",
  title: "Test Track",
  subtitle: "test vibe",
  inspiration: "Inspired by nothing in particular.",
  bpm: 120,
  filterBase: 2000,
  accent: "cyan",
  source: "custom",
  layers: [
    {
      role: "bass",
      waveform: "sawtooth",
      pattern: ["c2", "g2", null, "a2"],
      stepsPerNote: 2,
      gain: 0.8
    }
  ],
  intensityProfiles: {
    danger: { tempoMul: 1.1, cutoffMul: 1.2 }
  }
};

describe("musicTrackSchema", () => {
  it("accepts a valid track", () => {
    expect(musicTrackSchema.safeParse(validTrack).success).toBe(true);
  });

  it("defaults source to custom", () => {
    const { source, ...withoutSource } = validTrack;
    void source;
    const result = musicTrackSchema.safeParse(withoutSource);

    expect(result.success).toBe(true);
    expect(result.success && result.data.source).toBe("custom");
  });

  it("rejects out-of-range bpm", () => {
    expect(musicTrackSchema.safeParse({ ...validTrack, bpm: 9 }).success).toBe(false);
    expect(musicTrackSchema.safeParse({ ...validTrack, bpm: 999 }).success).toBe(false);
  });

  it("rejects out-of-range layer gain", () => {
    const track = { ...validTrack, layers: [{ ...validTrack.layers[0], gain: 2 }] };
    expect(musicTrackSchema.safeParse(track).success).toBe(false);
  });

  it("rejects out-of-range octaveShift", () => {
    const track = { ...validTrack, layers: [{ ...validTrack.layers[0], octaveShift: 9 }] };
    expect(musicTrackSchema.safeParse(track).success).toBe(false);
  });

  it("rejects malformed note names", () => {
    const track = { ...validTrack, layers: [{ ...validTrack.layers[0], pattern: ["h9"] }] };
    expect(musicTrackSchema.safeParse(track).success).toBe(false);
  });

  it("rejects an oversized pattern", () => {
    const pattern = Array.from({ length: 65 }, () => "c2");
    const track = { ...validTrack, layers: [{ ...validTrack.layers[0], pattern }] };
    expect(musicTrackSchema.safeParse(track).success).toBe(false);
  });

  it("rejects too many layers", () => {
    const layers = Array.from({ length: 9 }, () => validTrack.layers[0]);
    expect(musicTrackSchema.safeParse({ ...validTrack, layers }).success).toBe(false);
  });

  it("rejects a non-slug id", () => {
    expect(musicTrackSchema.safeParse({ ...validTrack, id: "Not A Slug" }).success).toBe(false);
  });

  it("rejects an empty layer list", () => {
    expect(musicTrackSchema.safeParse({ ...validTrack, layers: [] }).success).toBe(false);
  });
});
