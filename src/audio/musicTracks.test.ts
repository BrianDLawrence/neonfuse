import { describe, expect, it } from "vitest";
import { musicTrackSchema } from "../lib/schemas/music";
import { BUILTIN_MUSIC_TRACKS, getMusicTrack } from "./musicTracks";
import { noteFrequency } from "./synthFallback";

describe("noteFrequency", () => {
  it("anchors A4 at 440 Hz", () => {
    expect(noteFrequency("a4")).toBeCloseTo(440, 5);
  });

  it("doubles frequency one octave up", () => {
    expect(noteFrequency("a5")).toBeCloseTo(880, 5);
  });

  it("computes middle C", () => {
    expect(noteFrequency("c4")).toBeCloseTo(261.63, 1);
  });

  it("handles sharps", () => {
    // C#4 sits one semitone above middle C.
    expect(noteFrequency("c#4")).toBeCloseTo(277.18, 1);
  });

  it("throws on an invalid note name", () => {
    expect(() => noteFrequency("h9")).toThrow();
  });
});

describe("BUILTIN_MUSIC_TRACKS", () => {
  it("ships the four launch tracks", () => {
    const ids = BUILTIN_MUSIC_TRACKS.map((track) => track.id);
    expect(ids).toEqual(["mach-rush", "skyward-saga", "stellar-command", "flux-overdrive"]);
  });

  it("has unique ids", () => {
    const ids = BUILTIN_MUSIC_TRACKS.map((track) => track.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("validates against the music track schema", () => {
    for (const track of BUILTIN_MUSIC_TRACKS) {
      expect(musicTrackSchema.safeParse(track).success).toBe(true);
    }
  });

  it("references only renderable note names", () => {
    for (const track of BUILTIN_MUSIC_TRACKS) {
      for (const layer of track.layers) {
        for (const note of layer.pattern) {
          if (note) {
            expect(() => noteFrequency(note)).not.toThrow();
          }
        }
      }
    }
  });

  it("resolves built-in tracks by id", () => {
    expect(getMusicTrack("mach-rush")?.title).toBe("Mach Rush");
    expect(getMusicTrack("does-not-exist")).toBeUndefined();
  });
});
