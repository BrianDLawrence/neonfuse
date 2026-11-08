import {
  EMPTY_CAMPAIGN_PROGRESS,
  getActStages,
  isStageCleared,
  type CampaignActId,
  type CampaignProgress
} from "./campaign";

export const XP_PER_LEVEL = 500;
export const MAX_PLAYER_LEVEL = 50;

export const PLAYER_TITLE_IDS = [
  "fuse-initiate",
  "arena-breaker",
  "duel-certified",
  "hot-streak",
  "high-voltage",
  "grid-veteran",
  "ladder-climber",
  "overclocked",
  "megagrid"
] as const;

export type PlayerTitleId = (typeof PLAYER_TITLE_IDS)[number];

export const ACHIEVEMENT_IDS = [
  "first-spark",
  "arena-breaker",
  "duel-certified",
  "three-alarm",
  "score-surge",
  "arena-regular",
  "ladder-climber",
  "overclocked",
  "megagrid"
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export type PlayerProgression = {
  xp: number;
  level: number;
  badges: AchievementId[];
  unlockedTitles: PlayerTitleId[];
  equippedTitle: PlayerTitleId;
};

export type ProgressionCareerStats = {
  local: { played: number; wins: number; losses: number; draws: number };
  duel: { played: number; wins: number; losses: number; draws: number };
  /** Optional so stored stats from before Party Brawl still derive the same progression. */
  party?: { played: number; wins: number; losses: number; draws: number };
  partySeriesWins?: number;
  bestScore: number;
  bestWinStreak: number;
};

export const PLAYER_TITLES: Record<PlayerTitleId, { name: string; description: string }> = {
  "fuse-initiate": {
    name: "Fuse Initiate",
    description: "Entered the Neon Fuse arena."
  },
  "arena-breaker": {
    name: "Arena Breaker",
    description: "Won a local arena match."
  },
  "duel-certified": {
    name: "Duel Certified",
    description: "Won a verified Discord duel."
  },
  "hot-streak": {
    name: "Hot Streak",
    description: "Won three verified duels in a row."
  },
  "high-voltage": {
    name: "High Voltage",
    description: "Scored at least 7,500 points locally."
  },
  "grid-veteran": {
    name: "Grid Veteran",
    description: "Completed 25 matches across all modes."
  },
  "ladder-climber": {
    name: "Ladder Climber",
    description: "Cleared every Circuit Ladder stage in Campaign."
  },
  overclocked: {
    name: "Overclocked",
    description: "Cleared every Overclock stage in Campaign."
  },
  megagrid: {
    name: "Megagrid",
    description: "Cleared every Megagrid stage in Campaign."
  }
};

export const ACHIEVEMENTS: Record<
  AchievementId,
  { name: string; description: string; titleId: PlayerTitleId | null }
> = {
  "first-spark": {
    name: "First Spark",
    description: "Complete your first match.",
    titleId: null
  },
  "arena-breaker": {
    name: "Break the Grid",
    description: "Win a local arena match.",
    titleId: "arena-breaker"
  },
  "duel-certified": {
    name: "Verified Victor",
    description: "Win a server-authoritative Discord duel.",
    titleId: "duel-certified"
  },
  "three-alarm": {
    name: "Three Alarm",
    description: "Build a three-win verified duel streak.",
    titleId: "hot-streak"
  },
  "score-surge": {
    name: "Score Surge",
    description: "Reach 7,500 points in a local match.",
    titleId: "high-voltage"
  },
  "arena-regular": {
    name: "Arena Regular",
    description: "Complete 25 matches across all modes.",
    titleId: "grid-veteran"
  },
  "ladder-climber": {
    name: "Ladder Climber",
    description: "Clear every Circuit Ladder stage (Act 1).",
    titleId: "ladder-climber"
  },
  overclocked: {
    name: "Overclocked",
    description: "Clear every Overclock stage (Act 2).",
    titleId: "overclocked"
  },
  megagrid: {
    name: "Megagrid",
    description: "Clear every Megagrid stage (Act 3).",
    titleId: "megagrid"
  }
};

/** The campaign act whose full clear earns each campaign achievement. */
const ACT_CLEAR_ACHIEVEMENTS: Record<
  "ladder-climber" | "overclocked" | "megagrid",
  CampaignActId
> = {
  "ladder-climber": 1,
  overclocked: 2,
  megagrid: 3
};

/** An act is cleared once every one of its stages has a stored clear. */
export function isActCleared(progress: CampaignProgress, act: CampaignActId): boolean {
  const stages = getActStages(act);
  return stages.length > 0 && stages.every((stage) => isStageCleared(progress, stage.id));
}

function earnedAchievements(
  stats: ProgressionCareerStats,
  campaign: CampaignProgress
): AchievementId[] {
  const totalPlayed = stats.local.played + stats.duel.played + (stats.party?.played ?? 0);

  return ACHIEVEMENT_IDS.filter((id) => {
    switch (id) {
      case "first-spark":
        return totalPlayed >= 1;
      case "arena-breaker":
        return stats.local.wins >= 1;
      case "duel-certified":
        return stats.duel.wins >= 1;
      case "three-alarm":
        return stats.bestWinStreak >= 3;
      case "score-surge":
        return stats.bestScore >= 7_500;
      case "arena-regular":
        return totalPlayed >= 25;
      case "ladder-climber":
      case "overclocked":
      case "megagrid":
        return isActCleared(campaign, ACT_CLEAR_ACHIEVEMENTS[id]);
    }
  });
}

function calculateXp(stats: ProgressionCareerStats): number {
  const localXp = stats.local.played * 20 + stats.local.wins * 30 + stats.local.draws * 10;
  const duelXp = stats.duel.played * 50 + stats.duel.wins * 100 + stats.duel.draws * 30;
  const partyXp = (stats.party?.played ?? 0) * 30 + (stats.party?.wins ?? 0) * 60 + (stats.partySeriesWins ?? 0) * 100;

  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, localXp + duelXp + partyXp));
}

/**
 * Derives the complete profile progression view from durable career facts.
 * `campaign` is the progress derived from stored campaign matches; omit it only
 * where no campaign data is available, since act-clear titles then stay locked.
 */
export function calculatePlayerProgression(
  stats: ProgressionCareerStats,
  requestedTitle: PlayerTitleId | null = null,
  campaign: CampaignProgress = EMPTY_CAMPAIGN_PROGRESS
): PlayerProgression {
  const xp = calculateXp(stats);
  const badges = earnedAchievements(stats, campaign);
  const unlockedTitles = [
    "fuse-initiate" as const,
    ...badges.flatMap((id) => {
      const titleId = ACHIEVEMENTS[id].titleId;
      return titleId ? [titleId] : [];
    })
  ];
  const equippedTitle =
    requestedTitle && unlockedTitles.includes(requestedTitle)
      ? requestedTitle
      : "fuse-initiate";

  return {
    xp,
    level: Math.min(MAX_PLAYER_LEVEL, Math.floor(xp / XP_PER_LEVEL) + 1),
    badges,
    unlockedTitles,
    equippedTitle
  };
}

export function getLevelProgress(xp: number): {
  current: number;
  required: number;
  percent: number;
} {
  const safeXp = Math.max(0, xp);
  const level = Math.min(MAX_PLAYER_LEVEL, Math.floor(safeXp / XP_PER_LEVEL) + 1);

  if (level === MAX_PLAYER_LEVEL) {
    return { current: XP_PER_LEVEL, required: XP_PER_LEVEL, percent: 100 };
  }

  const current = safeXp % XP_PER_LEVEL;
  return {
    current,
    required: XP_PER_LEVEL,
    percent: Math.round((current / XP_PER_LEVEL) * 100)
  };
}
