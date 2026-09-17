"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  BOT_PROFILE_ORDER,
  BOT_PROFILES,
  type BotId,
  type BotProfileId,
  type BotSelection
} from "@/game/simulation/bots";
import type {
  PlayerCareerMatch,
  PlayerCareerStats,
  PlayerProfile,
  ProfilePreferences
} from "@/lib/player-profile-types";
import { EMPTY_PROFILE_MATCH_STATS } from "@/lib/player-profile-types";
import { authenticatedHeaders } from "@/lib/authenticated-headers";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/lib/account-deletion";
import { clearNeonFuseClientStorage } from "@/lib/client-storage";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_IDS,
  PLAYER_TITLES,
  calculatePlayerProgression,
  getLevelProgress,
  type PlayerProgression,
  type PlayerTitleId
} from "@/game/simulation/progression";

export type ProfileSyncStatus = "loading" | "saved" | "saving" | "offline";

type ProfileScreenProps = {
  authToken?: string;
  fallbackName: string;
  profile: PlayerProfile | null;
  preferences: ProfilePreferences;
  syncStatus: ProfileSyncStatus;
  onClose: () => void;
  onAccountDeleted: () => Promise<void>;
  onPreferencesChange: (preferences: Partial<ProfilePreferences>) => void;
  onEquippedTitleChange: (titleId: PlayerTitleId) => void;
};

type HistoryStatus = "loading" | "ready" | "loading-more" | "error";

const EMPTY_CAREER: PlayerCareerStats = {
  local: { ...EMPTY_PROFILE_MATCH_STATS },
  duel: { ...EMPTY_PROFILE_MATCH_STATS },
  bestScore: 0,
  bestWinStreak: 0
};

const BOT_SLOTS: Array<{ id: BotId; label: string }> = [
  { id: "bot-a", label: "Bot A" },
  { id: "bot-b", label: "Bot B" }
];

const SYNC_LABELS: Record<ProfileSyncStatus, string> = {
  loading: "Loading",
  saved: "Synced",
  saving: "Saving",
  offline: "Local only"
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "NF";
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatPlayedAt(playedAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(playedAt));
}

export function ProfileAvatar({
  avatarUrl,
  name,
  size = "normal"
}: Readonly<{
  avatarUrl?: string | null;
  name: string;
  size?: "small" | "normal";
}>) {
  const pixels = size === "small" ? 26 : 68;

  return (
    <span className="profile-avatar" data-size={size} aria-hidden="true">
      {avatarUrl ? (
        <Image alt="" height={pixels} src={avatarUrl} width={pixels} />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  );
}

export function ProfileScreen({
  authToken,
  fallbackName,
  profile,
  preferences,
  syncStatus,
  onClose,
  onAccountDeleted,
  onPreferencesChange,
  onEquippedTitleChange
}: Readonly<ProfileScreenProps>) {
  const [career, setCareer] = useState<PlayerCareerStats>(profile?.stats ?? EMPTY_CAREER);
  const [progression, setProgression] = useState<PlayerProgression>(
    profile?.progression ?? calculatePlayerProgression(EMPTY_CAREER)
  );
  const [history, setHistory] = useState<PlayerCareerMatch[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("loading");
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [deletionStatus, setDeletionStatus] = useState<"idle" | "deleting" | "deleted">("idle");
  const [deletionError, setDeletionError] = useState<string | null>(null);
  const displayName = profile?.identity.displayName ?? fallbackName;
  const sourceLabel = profile?.identity.source === "discord-activity" ? "Discord Activity" : "Discord Web";
  const joinedLabel = profile
    ? new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(
        new Date(profile.createdAt)
      )
    : "Current session";
  const levelProgress = getLevelProgress(progression.xp);

  const loadHistory = useCallback(
    async (before?: string) => {
      setHistoryStatus(before ? "loading-more" : "loading");

      try {
        const query = new URLSearchParams({ limit: "6" });
        if (before) query.set("before", before);
        const response = await fetch(`/api/profile/history?${query}`, {
          headers: authenticatedHeaders(authToken)
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          stats?: PlayerCareerStats;
          progression?: PlayerProgression;
          matches?: PlayerCareerMatch[];
          nextCursor?: string | null;
        };

        if (
          !response.ok ||
          !payload.ok ||
          !payload.stats ||
          !payload.progression ||
          !payload.matches
        ) {
          throw new Error("Career history unavailable");
        }

        const matches = payload.matches;
        setCareer(payload.stats);
        setProgression(payload.progression);
        setHistory((current) => (before ? [...current, ...matches] : matches));
        setNextCursor(payload.nextCursor ?? null);
        setHistoryStatus("ready");
      } catch {
        setHistoryStatus("error");
      }
    },
    [authToken]
  );

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (profile?.progression) {
      setProgression(profile.progression);
    }
  }, [profile?.progression]);

  function updateBotSelection(slot: BotId, profileId: BotProfileId) {
    const nextSelection: BotSelection = {
      ...preferences.botSelection,
      [slot]: profileId
    };
    onPreferencesChange({ botSelection: nextSelection });
  }

  async function deleteAccountData() {
    setDeletionStatus("deleting");
    setDeletionError(null);

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: authenticatedHeaders(authToken, { "Content-Type": "application/json" }),
        body: JSON.stringify({ confirmation: deletionConfirmation })
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Account data could not be deleted");
      }

      clearNeonFuseClientStorage();
      setDeletionStatus("deleted");
      await onAccountDeleted();
    } catch (error) {
      setDeletionStatus("idle");
      setDeletionError(
        error instanceof Error ? error.message : "Account data could not be deleted"
      );
    }
  }

  return (
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <section
        aria-labelledby="profile-title"
        aria-modal="true"
        className="admin-dialog profile-dialog"
        id="player-profile"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-panel">
          <div className="admin-panel-header">
            <h3 id="profile-title">Fighter Profile</h3>
            <div className="admin-panel-header-actions">
              <span className="profile-sync-status" data-status={syncStatus} aria-live="polite">
                {SYNC_LABELS[syncStatus]}
              </span>
              <button
                aria-label="Close profile"
                className="dialog-icon-button"
                onClick={onClose}
                type="button"
              >
                Close
              </button>
            </div>
          </div>

          <div className="profile-dialog-content dialog-scroll-region">
            <section className="profile-identity" aria-label="Discord identity">
              <ProfileAvatar avatarUrl={profile?.identity.avatarUrl} name={displayName} />
              <div>
                <p className="profile-source">{sourceLabel}</p>
                <h4>{displayName}</h4>
                <p>{PLAYER_TITLES[progression.equippedTitle].name}</p>
                <p>Level {progression.level} · Joined {joinedLabel}</p>
              </div>
            </section>

            <section className="profile-career" aria-labelledby="profile-career-title">
              <div className="profile-section-heading">
                <div>
                  <span>Career signal</span>
                  <h4 id="profile-career-title">Match Record</h4>
                </div>
                <div className="profile-career-metrics">
                  <span>Best score <strong>{career.bestScore.toLocaleString()}</strong></span>
                  <span>Win streak <strong>{career.bestWinStreak}</strong></span>
                </div>
              </div>
              <div className="profile-record-grid">
                <div className="profile-record" data-kind="duel">
                  <span>Verified duels</span>
                  <strong>{career.duel.wins}-{career.duel.losses}-{career.duel.draws}</strong>
                  <small>{career.duel.played} played</small>
                </div>
                <div className="profile-record" data-kind="local">
                  <span>Local arena</span>
                  <strong>{career.local.wins}-{career.local.losses}-{career.local.draws}</strong>
                  <small>{career.local.played} unranked</small>
                </div>
              </div>
            </section>

            <section className="profile-progression" aria-labelledby="profile-progression-title">
              <div className="profile-section-heading">
                <div>
                  <span>Earned progression</span>
                  <h4 id="profile-progression-title">Level {progression.level}</h4>
                </div>
                <strong className="profile-xp-total">{progression.xp.toLocaleString()} XP</strong>
              </div>

              <div className="profile-level-meter">
                <div className="profile-level-meter-label">
                  <span>{levelProgress.current} / {levelProgress.required} XP</span>
                  <span>{levelProgress.percent}%</span>
                </div>
                <div
                  aria-label={`Level progress: ${levelProgress.percent}%`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={levelProgress.percent}
                  className="profile-level-track"
                  role="progressbar"
                >
                  <span style={{ width: `${levelProgress.percent}%` }} />
                </div>
              </div>

              <label className="profile-title-picker">
                <span>Equipped title</span>
                <select
                  className="bot-select"
                  onChange={(event) => {
                    const titleId = event.target.value as PlayerTitleId;
                    setProgression((current) => ({ ...current, equippedTitle: titleId }));
                    onEquippedTitleChange(titleId);
                  }}
                  value={progression.equippedTitle}
                >
                  {progression.unlockedTitles.map((titleId) => (
                    <option key={titleId} value={titleId}>
                      {PLAYER_TITLES[titleId].name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="profile-achievement-grid" aria-label="Achievement progress">
                {ACHIEVEMENT_IDS.map((achievementId) => {
                  const achievement = ACHIEVEMENTS[achievementId];
                  const unlocked = progression.badges.includes(achievementId);

                  return (
                    <article
                      className="profile-achievement"
                      data-unlocked={unlocked}
                      key={achievementId}
                    >
                      <span aria-hidden="true">{unlocked ? "ON" : "--"}</span>
                      <div>
                        <strong>{achievement.name}</strong>
                        <small>{achievement.description}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="profile-preferences" aria-labelledby="profile-preferences-title">
              <div className="profile-section-heading">
                <div>
                  <span>Cloud settings</span>
                  <h4 id="profile-preferences-title">Arena Preferences</h4>
                </div>
                <button
                  aria-pressed={preferences.musicEnabled}
                  className="command-button secondary profile-music-toggle"
                  onClick={() => onPreferencesChange({ musicEnabled: !preferences.musicEnabled })}
                  type="button"
                >
                  Music {preferences.musicEnabled ? "On" : "Off"}
                </button>
              </div>

              <div className="profile-setting-grid">
                <label className="slider-row">
                  <span className="slider-label">
                    <i className="stat-icon stat-icon-music" aria-hidden="true" />
                    Music
                  </span>
                  <input
                    aria-label="Music volume"
                    max="10"
                    min="0"
                    onChange={(event) =>
                      onPreferencesChange({ musicVolume: Number(event.target.value) })
                    }
                    type="range"
                    value={preferences.musicVolume}
                  />
                  <strong>{preferences.musicVolume}</strong>
                </label>
                <label className="slider-row">
                  <span className="slider-label">
                    <i className="stat-icon stat-icon-sfx" aria-hidden="true" />
                    SFX
                  </span>
                  <input
                    aria-label="Sound effects volume"
                    max="10"
                    min="0"
                    onChange={(event) =>
                      onPreferencesChange({ sfxVolume: Number(event.target.value) })
                    }
                    type="range"
                    value={preferences.sfxVolume}
                  />
                  <strong>{preferences.sfxVolume}</strong>
                </label>
              </div>

              <div className="profile-bot-grid">
                {BOT_SLOTS.map((slot) => {
                  const otherSlot = slot.id === "bot-a" ? "bot-b" : "bot-a";

                  return (
                    <label className="bot-slot-row" key={slot.id}>
                      <span>{slot.label}</span>
                      <select
                        className="bot-select"
                        onChange={(event) =>
                          updateBotSelection(slot.id, event.target.value as BotProfileId)
                        }
                        value={preferences.botSelection[slot.id]}
                      >
                        {BOT_PROFILE_ORDER.map((profileId) => (
                          <option
                            disabled={preferences.botSelection[otherSlot] === profileId}
                            key={profileId}
                            value={profileId}
                          >
                            {BOT_PROFILES[profileId].name}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="profile-history" aria-labelledby="profile-history-title" aria-live="polite">
              <div className="profile-section-heading">
                <div>
                  <span>Latest rounds</span>
                  <h4 id="profile-history-title">Match History</h4>
                </div>
              </div>

              {history.length ? (
                <div className="profile-history-list">
                  {history.map((match) => (
                    <article className="profile-history-row" data-result={match.result} key={match.id}>
                      <span className="profile-match-kind" data-kind={match.kind}>
                        {match.kind === "duel" ? "Verified duel" : "Local unranked"}
                      </span>
                      <span className="profile-match-opponent">
                        <strong>{match.result}</strong>
                        <span>vs {match.opponentName}</span>
                      </span>
                      <span className="profile-match-meta">
                        {match.score === null
                          ? formatDuration(match.durationMs)
                          : `${match.score.toLocaleString()} pts`}
                        <small>{formatPlayedAt(match.playedAt)}</small>
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="profile-history-empty">
                  {historyStatus === "loading" ? "Loading rounds…" : "No completed matches yet."}
                </p>
              )}

              {historyStatus === "error" ? (
                <p className="profile-history-error" role="status">
                  Career history is temporarily unavailable.
                </p>
              ) : null}
              {nextCursor ? (
                <button
                  className="command-button secondary profile-history-more"
                  disabled={historyStatus === "loading-more"}
                  onClick={() => void loadHistory(nextCursor)}
                  type="button"
                >
                  {historyStatus === "loading-more" ? "Loading" : "Load more"}
                </button>
              ) : null}
            </section>

            <section className="profile-data-controls" aria-labelledby="profile-data-controls-title">
              <div className="profile-section-heading">
                <div>
                  <span>Privacy controls</span>
                  <h4 id="profile-data-controls-title">Data Controls</h4>
                </div>
                <div className="profile-data-links">
                  <a href="/privacy">Privacy</a>
                  <a href="/support">Support</a>
                </div>
              </div>
              <p>
                Permanently remove your Neon Fuse profile, match history, scores,
                visitor record, duel records, Activity sessions, and linked login data.
              </p>

              {!deletionOpen ? (
                <button
                  className="profile-delete-button"
                  onClick={() => setDeletionOpen(true)}
                  type="button"
                >
                  Delete account data
                </button>
              ) : (
                <div className="profile-delete-confirmation" role="group" aria-labelledby="delete-data-title">
                  <h5 id="delete-data-title">This cannot be undone</h5>
                  <p>
                    Type <strong>{ACCOUNT_DELETION_CONFIRMATION}</strong> to confirm permanent deletion.
                  </p>
                  <label>
                    <span>Confirmation phrase</span>
                    <input
                      autoComplete="off"
                      autoFocus
                      disabled={deletionStatus === "deleting"}
                      onChange={(event) => setDeletionConfirmation(event.target.value)}
                      spellCheck={false}
                      value={deletionConfirmation}
                    />
                  </label>
                  {deletionError ? (
                    <p className="profile-delete-error" role="alert">
                      {deletionError}
                    </p>
                  ) : null}
                  {deletionStatus === "deleted" ? (
                    <p className="profile-delete-success" role="status">
                      Your Neon Fuse account data was deleted.
                    </p>
                  ) : (
                    <div className="profile-delete-actions">
                      <button
                        className="command-button secondary"
                        disabled={deletionStatus === "deleting"}
                        onClick={() => {
                          setDeletionOpen(false);
                          setDeletionConfirmation("");
                          setDeletionError(null);
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="profile-delete-button"
                        disabled={
                          deletionStatus === "deleting" ||
                          deletionConfirmation !== ACCOUNT_DELETION_CONFIRMATION
                        }
                        onClick={() => void deleteAccountData()}
                        type="button"
                      >
                        {deletionStatus === "deleting" ? "Deleting…" : "Delete permanently"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          <button className="dialog-close-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
