import { DEFAULT_BOT_SELECTION, type BotSelection } from "@/game/simulation/bots";

export type ProfilePreferences = {
  musicEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  selectedTrackId: string | null;
  botSelection: BotSelection;
};

export type ProfileMatchStats = {
  played: number;
  wins: number;
  losses: number;
  draws: number;
};

export type PlayerCareerStats = {
  local: ProfileMatchStats;
  duel: ProfileMatchStats;
  bestScore: number;
  bestWinStreak: number;
};

export type PlayerCareerMatch = {
  id: string;
  kind: "local" | "duel";
  result: "win" | "loss" | "draw";
  opponentName: string;
  durationMs: number;
  score: number | null;
  reason: string | null;
  playedAt: string;
};

export type PlayerProfile = {
  playerId: string;
  identity: {
    displayName: string;
    avatarUrl: string | null;
    source: "web" | "discord-activity";
    refreshedAt: string;
  };
  preferences: ProfilePreferences;
  progression: {
    xp: number;
    level: number;
    badges: string[];
    unlockedTitles: string[];
    equippedTitle: string | null;
  };
  stats: PlayerCareerStats;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

export const DEFAULT_PROFILE_PREFERENCES: ProfilePreferences = {
  musicEnabled: true,
  musicVolume: 8,
  sfxVolume: 9,
  selectedTrackId: null,
  botSelection: { ...DEFAULT_BOT_SELECTION }
};

export const EMPTY_PROFILE_MATCH_STATS: ProfileMatchStats = {
  played: 0,
  wins: 0,
  losses: 0,
  draws: 0
};
