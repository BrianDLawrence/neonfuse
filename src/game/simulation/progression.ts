export const XP_PER_LEVEL = 500;
export const MAX_PLAYER_LEVEL = 50;

export const PLAYER_TITLE_IDS = [
  "fuse-initiate",
  "arena-breaker",
  "duel-certified",
  "hot-streak",
  "high-voltage",
  "grid-veteran"
] as const;

export type PlayerTitleId = (typeof PLAYER_TITLE_IDS)[number];

export const ACHIEVEMENT_IDS = [
  "first-spark",
  "arena-breaker",
  "duel-certified",
  "three-alarm",
  "score-surge",
  "arena-regular"
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
  }
};

function earnedAchievements(stats: ProgressionCareerStats): AchievementId[] {
  const totalPlayed = stats.local.played + stats.duel.played;

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
    }
  });
}

function calculateXp(stats: ProgressionCareerStats): number {
  const localXp = stats.local.played * 20 + stats.local.wins * 30 + stats.local.draws * 10;
  const duelXp = stats.duel.played * 50 + stats.duel.wins * 100 + stats.duel.draws * 30;

  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, localXp + duelXp));
}

/** Derives the complete profile progression view from durable career facts. */
export function calculatePlayerProgression(
  stats: ProgressionCareerStats,
  requestedTitle: PlayerTitleId | null = null
): PlayerProgression {
  const xp = calculateXp(stats);
  const badges = earnedAchievements(stats);
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
