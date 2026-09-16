"use client";

import Image from "next/image";
import {
  BOT_PROFILE_ORDER,
  BOT_PROFILES,
  type BotId,
  type BotProfileId,
  type BotSelection
} from "@/game/simulation/bots";
import type {
  PlayerProfile,
  ProfilePreferences
} from "@/lib/player-profile-types";

export type ProfileSyncStatus = "loading" | "saved" | "saving" | "offline";

type ProfileScreenProps = {
  fallbackName: string;
  profile: PlayerProfile | null;
  preferences: ProfilePreferences;
  syncStatus: ProfileSyncStatus;
  onClose: () => void;
  onPreferencesChange: (preferences: Partial<ProfilePreferences>) => void;
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
  fallbackName,
  profile,
  preferences,
  syncStatus,
  onClose,
  onPreferencesChange
}: Readonly<ProfileScreenProps>) {
  const displayName = profile?.identity.displayName ?? fallbackName;
  const sourceLabel = profile?.identity.source === "discord-activity" ? "Discord Activity" : "Discord Web";
  const joinedLabel = profile
    ? new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(
        new Date(profile.createdAt)
      )
    : "Current session";

  function updateBotSelection(slot: BotId, profileId: BotProfileId) {
    const nextSelection: BotSelection = {
      ...preferences.botSelection,
      [slot]: profileId
    };
    onPreferencesChange({ botSelection: nextSelection });
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
                <p>Level {profile?.progression.level ?? 1} · Joined {joinedLabel}</p>
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
          </div>

          <button className="dialog-close-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </section>
    </div>
  );
}
