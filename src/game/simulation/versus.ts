import type { BotProfile, BotProfileId, BotSelection } from "./bots";
import {
  clampModifiers,
  isStageCleared,
  resolveStageBot,
  type CampaignProgress,
  type CampaignStageId,
  type ResolvedModifiers,
  type StageBotSpec,
  type StageModifiers
} from "./campaign";
import type { ActorLoadout } from "./powerups";

/**
 * Versus: pick any base bot and fight it. Every base bot is always available;
 * clearing a bot's Act 2 stage unlocks its Overclocked variant here as a reward.
 */
export const OVERCLOCK_UNLOCK_STAGE: Record<BotProfileId, CampaignStageId> = {
  "fuse-rush": "2-1",
  "circuit-shade": "2-2",
  "volt-warden": "2-3",
  "glitch-bloom": "2-4"
};

/** One bounded tuning for every Overclocked opponent, in the same terms as stage data. */
export const VERSUS_OVERCLOCK: { bot: Omit<StageBotSpec, "profileId">; modifiers: StageModifiers } = {
  bot: { traitDelta: { aggression: 1 }, startingLoadout: { bombs: 2 } },
  modifiers: { botFuseMs: 1500, botMoveScale: 0.9 }
};

export type VersusOpponent = {
  profile: BotProfile;
  loadout: ActorLoadout;
  modifiers: ResolvedModifiers;
  overclocked: boolean;
};

export function isOverclockUnlocked(progress: CampaignProgress, profileId: BotProfileId): boolean {
  return isStageCleared(progress, OVERCLOCK_UNLOCK_STAGE[profileId]);
}

/** The bot a Versus round fields: the base bot, or its Overclocked variant when asked for. */
export function resolveVersusOpponent(profileId: BotProfileId, overclocked: boolean): VersusOpponent {
  const spec: StageBotSpec = overclocked ? { profileId, ...VERSUS_OVERCLOCK.bot } : { profileId };
  const { profile, loadout } = resolveStageBot(spec);

  return {
    profile,
    loadout,
    modifiers: clampModifiers(overclocked ? VERSUS_OVERCLOCK.modifiers : {}),
    overclocked
  };
}

/**
 * Bot Lab keeps its two slots on different bots. Picking slot B's bot for Versus
 * swaps the slots instead of leaving a mirror match in Bot Skirmish.
 */
export function selectVersusOpponent(selection: BotSelection, profileId: BotProfileId): BotSelection {
  if (selection["bot-a"] === profileId) {
    return selection;
  }

  return {
    "bot-a": profileId,
    "bot-b": selection["bot-b"] === profileId ? selection["bot-a"] : selection["bot-b"]
  };
}
