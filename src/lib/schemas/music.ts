import { z } from "zod";

// Note names like "a3" / "f#4", octaves 1-6 (the synth applies octaveShift on
// top of these). Anything outside this is rejected before it reaches the engine.
const noteNameSchema = z.string().regex(/^[a-gA-G]#?[1-6]$/, "Invalid note name");

const intensitySchema = z.enum(["calm", "combat", "danger", "boss", "victory"]);

const musicLayerSchema = z.object({
  role: z.enum(["lead", "arp", "bass", "pad"]),
  waveform: z.enum(["sine", "square", "sawtooth", "triangle"]),
  pattern: z.array(noteNameSchema.nullable()).min(1).max(64),
  stepsPerNote: z.number().int().min(1).max(16).optional(),
  octaveShift: z.number().int().min(-3).max(3).optional(),
  gain: z.number().min(0).max(1),
  detune: z.number().min(-1200).max(1200).optional(),
  intensities: z.array(intensitySchema).max(5).optional()
});

const intensityProfileSchema = z.object({
  tempoMul: z.number().min(0.25).max(4).optional(),
  cutoffMul: z.number().min(0.1).max(8).optional(),
  gainMul: z.number().min(0).max(4).optional()
});

// Per-intensity modulation. Modeled as an object with optional keys so the
// inferred type matches Partial<Record<MusicIntensity, ...>> in src/audio.
const intensityProfilesSchema = z
  .object({
    calm: intensityProfileSchema.optional(),
    combat: intensityProfileSchema.optional(),
    danger: intensityProfileSchema.optional(),
    boss: intensityProfileSchema.optional(),
    victory: intensityProfileSchema.optional()
  })
  .optional();

export const musicTrackSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "id must be a lowercase slug"),
  title: z.string().min(1).max(80),
  subtitle: z.string().min(1).max(120),
  inspiration: z.string().min(1).max(240),
  bpm: z.number().int().min(40).max(240),
  filterBase: z.number().min(100).max(8000),
  accent: z.enum(["cyan", "pink", "green", "amber"]),
  layers: z.array(musicLayerSchema).min(1).max(8),
  intensityProfiles: intensityProfilesSchema,
  source: z.enum(["builtin", "custom"]).default("custom")
});

export type MusicTrackInput = z.infer<typeof musicTrackSchema>;
