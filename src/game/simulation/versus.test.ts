import { describe, expect, it } from "vitest";
import { BOT_PROFILE_ORDER, BOT_PROFILES } from "./bots";
import { DEFAULT_BOT_FUSE_MS, EMPTY_CAMPAIGN_PROGRESS, applyStageResult, getCampaignStage } from "./campaign";
import { createInitialLoadout } from "./powerups";
import {
  OVERCLOCK_UNLOCK_STAGE,
  isOverclockUnlocked,
  resolveVersusOpponent,
  selectVersusOpponent
} from "./versus";

const win = { winner: "player" as const, durationMs: 60_000, blocksCleared: 0 };

describe("Overclocked unlocks", () => {
  it("ties every base bot to its own Act 2 stage", () => {
    for (const profileId of BOT_PROFILE_ORDER) {
      const stage = getCampaignStage(OVERCLOCK_UNLOCK_STAGE[profileId]);

      expect(stage?.act).toBe(2);
      expect(stage?.bots.map((bot) => bot.profileId)).toEqual([profileId]);
    }
  });

  it("starts locked and unlocks only the bot whose stage was cleared", () => {
    const progress = applyStageResult(EMPTY_CAMPAIGN_PROGRESS, "2-3", win);

    expect(BOT_PROFILE_ORDER.filter((id) => isOverclockUnlocked(EMPTY_CAMPAIGN_PROGRESS, id))).toEqual([]);
    expect(BOT_PROFILE_ORDER.filter((id) => isOverclockUnlocked(progress, id))).toEqual(["volt-warden"]);
  });
});

describe("resolveVersusOpponent", () => {
  it("fields the untouched base bot with today's rules", () => {
    const opponent = resolveVersusOpponent("circuit-shade", false);

    expect(opponent.profile).toEqual(BOT_PROFILES["circuit-shade"]);
    expect(opponent.loadout).toEqual(createInitialLoadout());
    expect(opponent.modifiers).toEqual({ botFuseMs: DEFAULT_BOT_FUSE_MS, botMoveScale: 1, powerupDropRates: null });
  });

  it("tunes the Overclocked variant within the stage bounds", () => {
    const opponent = resolveVersusOpponent("fuse-rush", true);

    expect(opponent.overclocked).toBe(true);
    expect(opponent.profile.id).toBe("fuse-rush");
    expect(opponent.profile.traits.aggression).toBe(10);
    expect(opponent.loadout.bombs).toBe(2);
    expect(opponent.modifiers.botFuseMs).toBe(1500);
    expect(opponent.modifiers.botMoveScale).toBe(0.9);
  });
});

describe("selectVersusOpponent", () => {
  const selection = { "bot-a": "fuse-rush", "bot-b": "circuit-shade" } as const;

  it("puts the pick in slot A and leaves slot B alone", () => {
    expect(selectVersusOpponent(selection, "volt-warden")).toEqual({
      "bot-a": "volt-warden",
      "bot-b": "circuit-shade"
    });
  });

  it("swaps the slots when the pick is already in slot B", () => {
    expect(selectVersusOpponent(selection, "circuit-shade")).toEqual({
      "bot-a": "circuit-shade",
      "bot-b": "fuse-rush"
    });
  });

  it("returns the same selection when the pick is already in slot A", () => {
    expect(selectVersusOpponent(selection, "fuse-rush")).toBe(selection);
  });
});
