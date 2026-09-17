"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { DuelGame } from "./DuelGame";
import { DiscordPartyScreen } from "./DiscordPartyScreen";
import { PhaserGame, type TouchControlsApi } from "./PhaserGame";
import { HighScoresScreen, type RoundScoreResult } from "./HighScoresScreen";
import { MusicScreen } from "./MusicScreen";
import {
  ProfileAvatar,
  ProfileScreen,
  type ProfileSyncStatus
} from "./ProfileScreen";
import type { PlayerTitleId } from "@/game/simulation/progression";
import { BUILTIN_MUSIC_TRACKS } from "@/audio/musicTracks";
import type { MusicTrack } from "@/audio/types";
import type { BotHudState, RoundCompletePayload } from "@/game/createGame";
import { DEFAULT_GAME_MODE, type GameMode } from "@/game/modes";
import { calculateRoundScore } from "@/game/simulation/scoring";
import { authenticatedHeaders } from "@/lib/authenticated-headers";
import type { HighScoreEntry } from "@/lib/leaderboard";
import {
  DEFAULT_PROFILE_PREFERENCES,
  type PlayerProfile,
  type ProfilePreferences
} from "@/lib/player-profile-types";
import type { Direction } from "@/game/simulation/arena";
import {
  BOT_PROFILE_ORDER,
  BOT_PROFILES,
  DEFAULT_BOT_SELECTION,
  type BotId,
  type BotProfile,
  type BotProfileId,
  type BotSelection
} from "@/game/simulation/bots";
import {
  DEFAULT_POWERUP_DROP_RATES,
  type PowerupDropRates,
  type PowerupType
} from "@/game/simulation/powerups";

const POWERUP_CONTROLS: Array<{
  type: PowerupType;
  label: string;
  iconClass: string;
}> = [
  { type: "bomb", label: "Bomb", iconClass: "stat-icon-bomb" },
  { type: "blast", label: "Blast", iconClass: "stat-icon-blast" },
  { type: "speed", label: "Speed", iconClass: "stat-icon-speed" }
];

const BOT_SLOTS: Array<{ id: BotId; label: string }> = [
  { id: "bot-a", label: "Slot A" },
  { id: "bot-b", label: "Slot B" }
];

const TOUCH_DIRECTIONS: Array<{ dir: Direction; label: string; glyph: string }> = [
  { dir: "up", label: "Move up", glyph: "▲" },
  { dir: "left", label: "Move left", glyph: "◀" },
  { dir: "right", label: "Move right", glyph: "▶" },
  { dir: "down", label: "Move down", glyph: "▼" }
];

const AUDIO_CONTROLS: Array<{
  type: "music" | "sfx";
  label: string;
  iconClass: string;
}> = [
  { type: "music", label: "Music", iconClass: "stat-icon-music" },
  { type: "sfx", label: "SFX", iconClass: "stat-icon-sfx" }
];

const VISITOR_STORAGE_KEY = "neon-fuse:visitor-id";
const MUSIC_TRACK_STORAGE_KEY = "neon-fuse:music-track";

function readStoredMusicTrack(): MusicTrack | null {
  try {
    const stored = window.localStorage.getItem(MUSIC_TRACK_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as MusicTrack) : null;
  } catch {
    return null;
  }
}

function createVisitorId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  const tail = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.slice(0, 12).padEnd(12, "0");
  return `00000000-0000-4000-8000-${tail}`;
}

function readOrCreateVisitorId() {
  try {
    const stored = window.localStorage.getItem(VISITOR_STORAGE_KEY);
    if (stored) {
      return stored;
    }

    const visitorId = createVisitorId();
    window.localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
    return visitorId;
  } catch {
    return createVisitorId();
  }
}

function useTouchControlsEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(hover: none) and (pointer: coarse)");

    if (!mediaQuery) {
      return;
    }

    const syncTouchControls = () => setEnabled(mediaQuery.matches);
    syncTouchControls();

    mediaQuery.addEventListener("change", syncTouchControls);
    return () => mediaQuery.removeEventListener("change", syncTouchControls);
  }, []);

  return enabled;
}

export function GameShell({
  accountName,
  authToken,
  activityParticipantCount,
  connectionLabel,
  onInviteFriends,
  onSignOut
}: Readonly<{
  accountName: string;
  authToken?: string;
  activityParticipantCount?: number;
  connectionLabel?: string;
  onInviteFriends?: () => Promise<void>;
  onSignOut: () => Promise<void>;
}>) {
  const [isDuelOpen, setIsDuelOpen] = useState(false);
  const [roundStatus, setRoundStatus] = useState("Warmup");
  const [bombs, setBombs] = useState(1);
  const [blast, setBlast] = useState(2);
  const [speed, setSpeed] = useState(1);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [botHud, setBotHud] = useState<BotHudState[]>([]);
  const [modeCommand, setModeCommand] = useState<{ mode: GameMode; sequence: number }>({
    mode: DEFAULT_GAME_MODE,
    sequence: 0
  });
  const [powerupDropRates, setPowerupDropRates] = useState<PowerupDropRates>(DEFAULT_POWERUP_DROP_RATES);
  const [botSelection, setBotSelection] = useState<BotSelection>(DEFAULT_BOT_SELECTION);
  const [selectedBotInfo, setSelectedBotInfo] = useState<BotProfileId>(DEFAULT_BOT_SELECTION["bot-a"]);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isBotLabOpen, setIsBotLabOpen] = useState(false);
  const [isMusicOpen, setIsMusicOpen] = useState(false);
  const [isHighScoresOpen, setIsHighScoresOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPartyOpen, setIsPartyOpen] = useState(false);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [scoreResult, setScoreResult] = useState<RoundScoreResult | null>(null);
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [profileSyncStatus, setProfileSyncStatus] = useState<ProfileSyncStatus>("loading");
  const [musicEnabled, setMusicEnabled] = useState(DEFAULT_PROFILE_PREFERENCES.musicEnabled);
  const [musicVolume, setMusicVolume] = useState(DEFAULT_PROFILE_PREFERENCES.musicVolume);
  const [sfxVolume, setSfxVolume] = useState(DEFAULT_PROFILE_PREFERENCES.sfxVolume);
  const [selectedTrack, setSelectedTrack] = useState<MusicTrack | null>(null);
  const touchApiRef = useRef<TouchControlsApi | null>(null);
  const musicEnabledRef = useRef(musicEnabled);
  const musicVolumeRef = useRef(musicVolume);
  const sfxVolumeRef = useRef(sfxVolume);
  const selectedTrackRef = useRef(selectedTrack);
  const visitorIdRef = useRef<string | null>(null);
  const profileSaveSequenceRef = useRef(0);
  const selectedBotProfile = BOT_PROFILES[selectedBotInfo];
  const touchControlsEnabled = useTouchControlsEnabled();

  useEffect(() => {
    visitorIdRef.current = visitorId;
  }, [visitorId]);

  useEffect(() => {
    musicEnabledRef.current = musicEnabled;
  }, [musicEnabled]);

  useEffect(() => {
    musicVolumeRef.current = musicVolume;
  }, [musicVolume]);

  useEffect(() => {
    sfxVolumeRef.current = sfxVolume;
  }, [sfxVolume]);

  useEffect(() => {
    selectedTrackRef.current = selectedTrack;
  }, [selectedTrack]);

  // Local storage remains the immediate fallback while the signed-in profile loads.
  useEffect(() => {
    const stored = readStoredMusicTrack();

    if (stored) {
      setSelectedTrack(stored);
      selectedTrackRef.current = stored;
    }
  }, []);

  useEffect(() => {
    if (!isAdminOpen && !isBotLabOpen && !isHighScoresOpen && !isMusicOpen && !isProfileOpen && !isPartyOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAdminOpen(false);
        setIsBotLabOpen(false);
        setIsMusicOpen(false);
        setIsHighScoresOpen(false);
        setIsProfileOpen(false);
        setIsPartyOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAdminOpen, isBotLabOpen, isHighScoresOpen, isMusicOpen, isPartyOpen, isProfileOpen]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const response = await fetch("/api/profile", {
          headers: authenticatedHeaders(authToken)
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          created?: boolean;
          profile?: PlayerProfile;
          error?: string;
        };

        if (!response.ok || !payload.ok || !payload.profile) {
          throw new Error(payload.error ?? "Profile sync unavailable");
        }

        let profile = payload.profile;
        const localTrack = readStoredMusicTrack();

        if (payload.created && !profile.preferences.selectedTrackId && localTrack) {
          const migrationResponse = await fetch("/api/profile", {
            method: "PATCH",
            headers: authenticatedHeaders(authToken, { "Content-Type": "application/json" }),
            body: JSON.stringify({ preferences: { selectedTrackId: localTrack.id } })
          });
          const migrationPayload = (await migrationResponse.json()) as {
            ok?: boolean;
            profile?: PlayerProfile;
          };

          if (migrationResponse.ok && migrationPayload.ok && migrationPayload.profile) {
            profile = migrationPayload.profile;
          }
        }

        if (!active) {
          return;
        }

        setPlayerProfile(profile);
        setProfileSyncStatus("saved");
        setMusicEnabled(profile.preferences.musicEnabled);
        setMusicVolume(profile.preferences.musicVolume);
        setSfxVolume(profile.preferences.sfxVolume);
        setBotSelection(profile.preferences.botSelection);
        setSelectedBotInfo(profile.preferences.botSelection["bot-a"]);
        musicEnabledRef.current = profile.preferences.musicEnabled;
        musicVolumeRef.current = profile.preferences.musicVolume;
        sfxVolumeRef.current = profile.preferences.sfxVolume;
        touchApiRef.current?.setMusicEnabled(
          profile.preferences.musicEnabled,
          profile.preferences.musicVolume / 10
        );
        touchApiRef.current?.setSfxVolume(profile.preferences.sfxVolume / 10);

        const selectedTrackId = profile.preferences.selectedTrackId;

        if (!selectedTrackId) {
          return;
        }

        let track = localTrack?.id === selectedTrackId ? localTrack : null;
        track ??= BUILTIN_MUSIC_TRACKS.find((candidate) => candidate.id === selectedTrackId) ?? null;

        if (!track) {
          try {
            const tracksResponse = await fetch("/api/music/tracks");
            const tracksPayload = (await tracksResponse.json()) as { tracks?: MusicTrack[] };
            track = tracksPayload.tracks?.find((candidate) => candidate.id === selectedTrackId) ?? null;
          } catch {
            // The profile itself is still synced even if a custom track is unavailable.
          }
        }

        if (active && track) {
          setSelectedTrack(track);
          selectedTrackRef.current = track;
          touchApiRef.current?.setMusicTrack(track);
          try {
            window.localStorage.setItem(MUSIC_TRACK_STORAGE_KEY, JSON.stringify(track));
          } catch {
            // Profile storage remains the source of truth when local storage is unavailable.
          }
        }
      } catch {
        if (active) {
          setProfileSyncStatus("offline");
        }
      }
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, [authToken]);

  useEffect(() => {
    const nextVisitorId = readOrCreateVisitorId();
    setVisitorId(nextVisitorId);
    visitorIdRef.current = nextVisitorId;

    async function registerVisitor() {
      try {
        const response = await fetch("/api/visitors", {
          method: "POST",
          headers: authenticatedHeaders(authToken, {
            "Content-Type": "application/json"
          }),
          body: JSON.stringify({ visitorId: nextVisitorId })
        });
        const payload = (await response.json()) as { visitorId?: string };

        if (payload.visitorId && payload.visitorId !== nextVisitorId) {
          setVisitorId(payload.visitorId);
          visitorIdRef.current = payload.visitorId;
          window.localStorage.setItem(VISITOR_STORAGE_KEY, payload.visitorId);
        }
      } catch {
        // Anonymous tracking should never block local play.
      }
    }

    void registerVisitor();
  }, [authToken]);

  const persistProfilePreferences = useCallback(
    async (preferences: Partial<ProfilePreferences>) => {
      const sequence = ++profileSaveSequenceRef.current;
      setProfileSyncStatus("saving");
      setPlayerProfile((current) =>
        current
          ? {
              ...current,
              preferences: { ...current.preferences, ...preferences }
            }
          : current
      );

      try {
        const response = await fetch("/api/profile", {
          method: "PATCH",
          headers: authenticatedHeaders(authToken, { "Content-Type": "application/json" }),
          body: JSON.stringify({ preferences })
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          profile?: PlayerProfile;
        };
        const savedProfile = payload.profile;

        if (!response.ok || !payload.ok || !savedProfile) {
          throw new Error("Profile sync failed");
        }

        if (profileSaveSequenceRef.current === sequence) {
          setPlayerProfile((current) => ({
            ...savedProfile,
            stats: current?.stats ?? savedProfile.stats
          }));
          setProfileSyncStatus("saved");
        }
      } catch {
        if (profileSaveSequenceRef.current === sequence) {
          setProfileSyncStatus("offline");
        }
      }
    },
    [authToken]
  );

  const persistEquippedTitle = useCallback(
    async (equippedTitle: PlayerTitleId) => {
      const sequence = ++profileSaveSequenceRef.current;
      const previousTitle = playerProfile?.progression.equippedTitle;
      setProfileSyncStatus("saving");
      setPlayerProfile((current) =>
        current
          ? {
              ...current,
              progression: { ...current.progression, equippedTitle }
            }
          : current
      );

      try {
        const response = await fetch("/api/profile", {
          method: "PATCH",
          headers: authenticatedHeaders(authToken, { "Content-Type": "application/json" }),
          body: JSON.stringify({ equippedTitle })
        });
        const payload = (await response.json()) as { ok?: boolean; profile?: PlayerProfile };

        if (!response.ok || !payload.ok || !payload.profile) {
          throw new Error("Title sync failed");
        }

        if (profileSaveSequenceRef.current === sequence) {
          setPlayerProfile(payload.profile);
          setProfileSyncStatus("saved");
        }
      } catch {
        if (profileSaveSequenceRef.current === sequence) {
          setPlayerProfile((current) =>
            current && previousTitle
              ? {
                  ...current,
                  progression: { ...current.progression, equippedTitle: previousTitle }
                }
              : current
          );
          setProfileSyncStatus("offline");
        }
      }
    },
    [authToken, playerProfile?.progression.equippedTitle]
  );

  const handleLoadoutChange = useCallback(
    ({
      bombs: nextBombs,
      blast: nextBlast,
      speed: nextSpeed
    }: {
      bombs: number;
      blast: number;
      speed: number;
    }) => {
      setBombs(nextBombs);
      setBlast(nextBlast);
      setSpeed(nextSpeed);
    },
    []
  );
  const handleMatchStatsChange = useCallback(
    ({ wins: nextWins, losses: nextLosses }: { wins: number; losses: number }) => {
      setWins(nextWins);
      setLosses(nextLosses);
    },
    []
  );
  const handlePowerupRateChange = useCallback((type: PowerupType, value: number) => {
    setPowerupDropRates((currentRates) => ({
      ...currentRates,
      [type]: value
    }));
  }, []);
  const handleAdminLinkClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setIsAdminOpen(true);
  }, []);
  const handleBotLabLinkClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setIsBotLabOpen(true);
  }, []);
  const handleMusicLinkClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setIsMusicOpen(true);
  }, []);
  const handleHighScoresLinkClick = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setIsHighScoresOpen(true);
  }, []);
  const handleBotSelectionChange = useCallback((slot: BotId, profileId: BotProfileId) => {
    setBotSelection((currentSelection) => ({
      ...currentSelection,
      [slot]: profileId
    }));
    const nextSelection = { ...botSelection, [slot]: profileId };
    void persistProfilePreferences({ botSelection: nextSelection });
    setSelectedBotInfo(profileId);
  }, [botSelection, persistProfilePreferences]);
  const handleModeStart = useCallback((mode: GameMode) => {
    setModeCommand((currentCommand) => ({
      mode,
      sequence: currentCommand.sequence + 1
    }));
    setRoundStatus("Warmup");
  }, []);
  const handleRoundComplete = useCallback((payload: RoundCompletePayload) => {
    const nextVisitorId = visitorIdRef.current ?? readOrCreateVisitorId();
    visitorIdRef.current = nextVisitorId;
    setVisitorId(nextVisitorId);

    const localScore = calculateRoundScore(payload);
    setScoreResult({
      ...payload,
      matchId: null,
      score: localScore,
      stored: false,
      qualifiesForLeaderboard: true,
      topScores: [],
      status: "saving"
    });
    setIsHighScoresOpen(true);

    async function saveMatch() {
      try {
        const response = await fetch("/api/matches", {
          method: "POST",
          headers: authenticatedHeaders(authToken, {
            "Content-Type": "application/json"
          }),
          body: JSON.stringify({
            ...payload,
            visitorId: nextVisitorId
          })
        });
        const result = (await response.json()) as {
          ok?: boolean;
          stored?: boolean;
          matchId?: string;
          score?: number;
          qualifiesForLeaderboard?: boolean;
          topScores?: HighScoreEntry[];
          error?: string;
        };

        if (!response.ok || !result.ok) {
          throw new Error(result.error ?? "Unable to save match");
        }

        setScoreResult({
          ...payload,
          matchId: result.matchId ?? null,
          score: result.score ?? localScore,
          stored: result.stored ?? false,
          qualifiesForLeaderboard: result.qualifiesForLeaderboard ?? true,
          topScores: result.topScores ?? [],
          status: result.stored === false ? "offline" : "ready"
        });
      } catch (error) {
        setScoreResult({
          ...payload,
          matchId: null,
          score: localScore,
          stored: false,
          qualifiesForLeaderboard: false,
          topScores: [],
          status: "error",
          error: error instanceof Error ? error.message : "Unable to save match"
        });
      }
    }

    void saveMatch();
  }, [authToken]);
  const handleRegisterTouchControls = useCallback((api: TouchControlsApi | null) => {
    touchApiRef.current = api;
    api?.setMusicEnabled(musicEnabledRef.current, musicVolumeRef.current / 10);
    api?.setSfxVolume(sfxVolumeRef.current / 10);
    api?.setMusicTrack(selectedTrackRef.current);
  }, []);
  const handleSelectTrack = useCallback((track: MusicTrack) => {
    setSelectedTrack(track);
    selectedTrackRef.current = track;
    touchApiRef.current?.setMusicTrack(track);

    try {
      window.localStorage.setItem(MUSIC_TRACK_STORAGE_KEY, JSON.stringify(track));
    } catch {
      // Storage may be unavailable (private mode); the choice still applies this session.
    }

    void persistProfilePreferences({ selectedTrackId: track.id });
  }, [persistProfilePreferences]);
  const handlePreviewTrack = useCallback((track: MusicTrack) => {
    touchApiRef.current?.previewMusicTrack(track);
  }, []);
  const handleStopPreviewTrack = useCallback(() => {
    touchApiRef.current?.previewMusicTrack(null);
  }, []);
  const handleMusicToggle = useCallback(() => {
    setMusicEnabled((currentEnabled) => {
      const nextEnabled = !currentEnabled;
      touchApiRef.current?.setMusicEnabled(nextEnabled, musicVolumeRef.current / 10);
      void persistProfilePreferences({ musicEnabled: nextEnabled });
      return nextEnabled;
    });
  }, [persistProfilePreferences]);
  const handleAudioVolumeChange = useCallback((type: "music" | "sfx", value: number) => {
    if (type === "music") {
      setMusicVolume(value);

      if (musicEnabledRef.current) {
        touchApiRef.current?.setMusicVolume(value / 10);
      }

      void persistProfilePreferences({ musicVolume: value });

      return;
    }

    setSfxVolume(value);
    touchApiRef.current?.setSfxVolume(value / 10);
    void persistProfilePreferences({ sfxVolume: value });
  }, [persistProfilePreferences]);
  const handleProfilePreferencesChange = useCallback(
    (preferences: Partial<ProfilePreferences>) => {
      if (preferences.musicEnabled !== undefined) {
        setMusicEnabled(preferences.musicEnabled);
        musicEnabledRef.current = preferences.musicEnabled;
        touchApiRef.current?.setMusicEnabled(
          preferences.musicEnabled,
          musicVolumeRef.current / 10
        );
      }

      if (preferences.musicVolume !== undefined) {
        setMusicVolume(preferences.musicVolume);
        musicVolumeRef.current = preferences.musicVolume;
        touchApiRef.current?.setMusicVolume(preferences.musicVolume / 10);
      }

      if (preferences.sfxVolume !== undefined) {
        setSfxVolume(preferences.sfxVolume);
        sfxVolumeRef.current = preferences.sfxVolume;
        touchApiRef.current?.setSfxVolume(preferences.sfxVolume / 10);
      }

      if (preferences.botSelection) {
        setBotSelection(preferences.botSelection);
        setSelectedBotInfo(preferences.botSelection["bot-a"]);
      }

      void persistProfilePreferences(preferences);
    },
    [persistProfilePreferences]
  );
  const handleTouchDirectionStart = useCallback((direction: Direction) => {
    touchApiRef.current?.setDirection(direction);
  }, []);
  const handleTouchDirectionEnd = useCallback(() => {
    touchApiRef.current?.setDirection(null);
  }, []);
  const handleTouchBomb = useCallback(() => {
    touchApiRef.current?.tapBomb();
  }, []);
  const handleTouchReset = useCallback(() => {
    touchApiRef.current?.requestReset();
  }, []);

  const profilePreferences: ProfilePreferences = {
    musicEnabled,
    musicVolume,
    sfxVolume,
    selectedTrackId: selectedTrack?.id ?? null,
    botSelection
  };
  const profileDisplayName = playerProfile?.identity.displayName ?? accountName;

  if (isDuelOpen) return <DuelGame authToken={authToken} onLeave={() => setIsDuelOpen(false)} />;

  return (
    <main className="app-frame" data-touch-controls={touchControlsEnabled ? "true" : "false"}>
      <section className="game-stage" aria-label="Neon Fuse game prototype">
        <PhaserGame
          botSelection={botSelection}
          modeCommand={modeCommand}
          powerupDropRates={powerupDropRates}
          touchControlsEnabled={touchControlsEnabled}
          onRoundStatusChange={setRoundStatus}
          onLoadoutChange={handleLoadoutChange}
          onBotHudChange={setBotHud}
          onMatchStatsChange={handleMatchStatsChange}
          onRoundComplete={handleRoundComplete}
          onRegisterTouchControls={handleRegisterTouchControls}
        />
      </section>

      <div className="hud" aria-hidden="false">
        <div className="hud-top">
          <div className="brand-lockup">
            <h1>Neon Fuse</h1>
            <p>
              A first playable arena shell for the local-versus bomber prototype.
              Move, plant a bomb, and watch the grid light up.
            </p>
          </div>

          <div className="hud-cluster">
            <div className="hud-chip">
              <span>Round</span>
              <strong>{roundStatus}</strong>
            </div>
            {modeCommand.mode === "bot-skirmish" ? (
              botHud.map((bot) => (
                <div className="hud-chip bot-hud-chip" key={bot.id}>
                  <span>{bot.alive ? bot.name : `${bot.name} Down`}</span>
                  <strong>
                    B{bot.bombs} / R{bot.blast} / S{bot.speed}
                  </strong>
                </div>
              ))
            ) : (
              <>
                <div className="hud-chip">
                  <span className="metric-label">
                    <i className="stat-icon stat-icon-bomb" aria-hidden="true" />
                    Bombs
                  </span>
                  <strong>{bombs}</strong>
                </div>
                <div className="hud-chip">
                  <span className="metric-label">
                    <i className="stat-icon stat-icon-blast" aria-hidden="true" />
                    Blast
                  </span>
                  <strong>{blast}</strong>
                </div>
                <div className="hud-chip">
                  <span className="metric-label">
                    <i className="stat-icon stat-icon-speed" aria-hidden="true" />
                    Speed
                  </span>
                  <strong>{speed}</strong>
                </div>
                <div className="hud-chip hud-chip-record">
                  <span>Record</span>
                  <strong>
                    {wins}-{losses}
                  </strong>
                </div>
              </>
            )}
          </div>
        </div>

        <aside className="match-actions" aria-label="Match actions">
          <div className="command-row" role="group" aria-label="Match mode">
            <button
              aria-pressed={modeCommand.mode === "player-vs-bot"}
              className="command-button"
              onClick={() => handleModeStart("player-vs-bot")}
              type="button"
            >
              <span className="label-full">Local Match</span>
              <span className="label-compact">Local</span>
            </button>
            <button
              aria-pressed={modeCommand.mode === "bot-skirmish"}
              className="command-button secondary"
              onClick={() => handleModeStart("bot-skirmish")}
              type="button"
            >
              <span className="label-full">Bot Skirmish</span>
              <span className="label-compact">Skirmish</span>
            </button>
            <button
              aria-pressed={false}
              className="command-button secondary"
              onClick={() => setIsDuelOpen(true)}
              type="button"
            >
              <span className="label-full">Play with a friend</span>
              <span className="label-compact">Friend</span>
            </button>
          </div>
          <div className="match-links">
            <button
              aria-pressed={musicEnabled}
              className="admin-link hud-link-button music-toggle-button"
              onClick={handleMusicToggle}
              type="button"
            >
              Music {musicEnabled ? "On" : "Off"}
            </button>
            <a className="admin-link" href="#music" onClick={handleMusicLinkClick}>
              Tracks
            </a>
            <a className="admin-link" href="#high-scores" onClick={handleHighScoresLinkClick}>
              High Scores
            </a>
            <a className="admin-link" href="#bot-lab" onClick={handleBotLabLinkClick}>
              Bots
            </a>
            <a className="admin-link" href="#admin-settings" onClick={handleAdminLinkClick}>
              Admin
            </a>
            <button
              aria-haspopup="dialog"
              className="profile-trigger"
              onClick={() => setIsProfileOpen(true)}
              title={`Open ${profileDisplayName}'s profile`}
              type="button"
            >
              <ProfileAvatar
                avatarUrl={playerProfile?.identity.avatarUrl}
                name={profileDisplayName}
                size="small"
              />
              <span>{profileDisplayName}</span>
            </button>
            {connectionLabel && authToken && onInviteFriends ? (
              <button
                aria-haspopup="dialog"
                className="admin-link hud-link-button account-name account-context"
                onClick={() => setIsPartyOpen(true)}
                type="button"
              >
                {connectionLabel}
              </button>
            ) : null}
            <button
              className="admin-link hud-link-button"
              onClick={() => void onSignOut()}
              type="button"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {isProfileOpen ? (
          <ProfileScreen
            authToken={authToken}
            fallbackName={accountName}
            onClose={() => setIsProfileOpen(false)}
            onEquippedTitleChange={(titleId) => void persistEquippedTitle(titleId)}
            onPreferencesChange={handleProfilePreferencesChange}
            preferences={profilePreferences}
            profile={playerProfile}
            syncStatus={profileSyncStatus}
          />
        ) : null}

        {isPartyOpen && authToken && onInviteFriends ? (
          <DiscordPartyScreen
            authToken={authToken}
            onClose={() => setIsPartyOpen(false)}
            onInviteFriends={onInviteFriends}
            onStartDuel={() => {
              setIsPartyOpen(false);
              setIsDuelOpen(true);
            }}
            participantCount={activityParticipantCount ?? 1}
          />
        ) : null}

        {isBotLabOpen ? (
          <div className="admin-dialog-backdrop" onClick={() => setIsBotLabOpen(false)}>
            <section
              aria-labelledby="bot-lab-title"
              aria-modal="true"
              className="admin-dialog bot-lab-dialog"
              id="bot-lab"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="admin-panel">
                <div className="admin-panel-header">
                  <h3 id="bot-lab-title">Bot Lab</h3>
                  <div className="admin-panel-header-actions">
                    <span>Roster setup</span>
                    <button
                      aria-label="Close Bot Lab"
                      className="dialog-icon-button"
                      onClick={() => setIsBotLabOpen(false)}
                      type="button"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="bot-lab-grid dialog-scroll-region">
                  <section className="bot-setup-panel" aria-label="Bot slot selection">
                    <div className="bot-slot-grid">
                      {BOT_SLOTS.map((slot) => {
                        const otherSlot = slot.id === "bot-a" ? "bot-b" : "bot-a";

                        return (
                          <label className="bot-slot-row" key={slot.id}>
                            <span>{slot.label}</span>
                            <select
                              className="bot-select"
                              value={botSelection[slot.id]}
                              onChange={(event) =>
                                handleBotSelectionChange(slot.id, event.target.value as BotProfileId)
                              }
                            >
                              {BOT_PROFILE_ORDER.map((profileId) => (
                                <option
                                  disabled={botSelection[otherSlot] === profileId}
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

                    <div className="bot-roster" aria-label="Bot profile info">
                      {BOT_PROFILE_ORDER.map((profileId) => {
                        const profile = BOT_PROFILES[profileId];

                        return (
                          <button
                            aria-pressed={selectedBotInfo === profileId}
                            className="bot-roster-button"
                            key={profileId}
                            onClick={() => setSelectedBotInfo(profileId)}
                            type="button"
                          >
                            <BotProfileIcon profile={profile} />
                            <span>
                              <strong>{profile.name}</strong>
                              <small>{profile.tagline}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="bot-detail-panel" aria-live="polite">
                    <div className="bot-detail-title">
                      <BotProfileIcon profile={selectedBotProfile} size="large" />
                      <div>
                        <h4>{selectedBotProfile.name}</h4>
                        <p>{selectedBotProfile.tagline}</p>
                      </div>
                    </div>
                    <p className="bot-summary">{selectedBotProfile.summary}</p>
                    <div className="bot-strengths">
                      {selectedBotProfile.strengths.map((strength) => (
                        <span key={strength}>{strength}</span>
                      ))}
                    </div>
                    <div className="trait-grid" aria-label={`${selectedBotProfile.name} traits`}>
                      {Object.entries(selectedBotProfile.traits).map(([trait, value]) => (
                        <div className="trait-pill" key={trait}>
                          <span>{trait.replace(/([A-Z])/g, " $1")}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                    <p className="bot-quirk">{selectedBotProfile.quirk}</p>
                    <p className="bot-persona">
                      <strong>LLM seed:</strong> {selectedBotProfile.llmPersona}
                    </p>
                  </section>
                </div>

                <button
                  className="dialog-close-button"
                  onClick={() => setIsBotLabOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isAdminOpen ? (
          <div className="admin-dialog-backdrop" onClick={() => setIsAdminOpen(false)}>
            <section
              aria-labelledby="admin-settings-title"
              aria-modal="true"
              className="admin-dialog"
              id="admin-settings"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <div className="admin-panel" aria-label="Powerup admin controls">
                <div className="admin-panel-header">
                  <h3 id="admin-settings-title">Admin</h3>
                  <span>Audio + powerups</span>
                </div>
                {AUDIO_CONTROLS.map((control) => {
                  const value = control.type === "music" ? musicVolume : sfxVolume;

                  return (
                    <label className="slider-row" key={control.type}>
                      <span className="slider-label">
                        <i className={`stat-icon ${control.iconClass}`} aria-hidden="true" />
                        {control.label}
                      </span>
                      <input
                        aria-label={control.label}
                        type="range"
                        min="0"
                        max="10"
                        value={value}
                        onInput={(event) =>
                          handleAudioVolumeChange(control.type, Number(event.currentTarget.value))
                        }
                        onChange={(event) =>
                          handleAudioVolumeChange(control.type, Number(event.target.value))
                        }
                      />
                      <strong>{value}</strong>
                    </label>
                  );
                })}
                {POWERUP_CONTROLS.map((control) => (
                  <label className="slider-row" key={control.type}>
                    <span className="slider-label">
                      <i className={`stat-icon ${control.iconClass}`} aria-hidden="true" />
                      {control.label}
                    </span>
                    <input
                      aria-label={control.label}
                      type="range"
                      min="1"
                      max="10"
                      value={powerupDropRates[control.type]}
                      onChange={(event) =>
                        handlePowerupRateChange(control.type, Number(event.target.value))
                      }
                    />
                    <strong>{powerupDropRates[control.type]}</strong>
                  </label>
                ))}
                <button
                  className="dialog-close-button"
                  onClick={() => setIsAdminOpen(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {isMusicOpen ? (
          <MusicScreen
            selectedTrackId={selectedTrack?.id ?? null}
            onSelect={handleSelectTrack}
            onPreview={handlePreviewTrack}
            onStopPreview={handleStopPreviewTrack}
            onClose={() => setIsMusicOpen(false)}
          />
        ) : null}

        {isHighScoresOpen ? (
          <HighScoresScreen
            authToken={authToken}
            playerName={accountName}
            result={scoreResult}
            onClose={() => setIsHighScoresOpen(false)}
          />
        ) : null}

        <div className="control-strip">
          {modeCommand.mode === "player-vs-bot" ? (
            <>
              <span className="key-chip">Arrow Keys / WASD: Move</span>
              <span className="key-chip">Space: Bomb</span>
            </>
          ) : (
            <span className="key-chip">Bot Skirmish: Watch only</span>
          )}
          <span className="key-chip">R: Reset</span>
          <span className="key-chip">
            Goal: {modeCommand.mode === "bot-skirmish" ? "Last bot standing" : "Blast the red bot"}
          </span>
          <span className="key-chip">Danger: Bot bombs</span>
        </div>

        <aside className="touch-controls" aria-label="Touch controls">
          {modeCommand.mode === "player-vs-bot" ? (
            <div className="touch-pad" role="group" aria-label="Move">
              {TOUCH_DIRECTIONS.map(({ dir, label, glyph }) => (
                <button
                  aria-label={label}
                  className="touch-pad-button"
                  data-dir={dir}
                  key={dir}
                  onPointerCancel={handleTouchDirectionEnd}
                  onPointerDown={() => handleTouchDirectionStart(dir)}
                  onPointerLeave={handleTouchDirectionEnd}
                  onPointerUp={handleTouchDirectionEnd}
                  type="button"
                >
                  <span aria-hidden="true">{glyph}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="touch-action-cluster">
            {modeCommand.mode === "player-vs-bot" ? (
              <button
                aria-label="Plant bomb"
                className="touch-button touch-button-bomb"
                onPointerDown={handleTouchBomb}
                type="button"
              >
                <span aria-hidden="true">Bomb</span>
              </button>
            ) : null}
            <button
              aria-label="Reset round"
              className="touch-button touch-button-reset"
              onClick={handleTouchReset}
              type="button"
            >
              <span aria-hidden="true">Reset</span>
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

function BotProfileIcon({ profile, size = "normal" }: { profile: BotProfile; size?: "normal" | "large" }) {
  const className = size === "large" ? "bot-profile-icon bot-profile-icon-large" : "bot-profile-icon";

  if (profile.texture === "bot-circuit-core") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 34 34">
        <rect fill="#8b5cf6" height="34" rx="8" width="34" />
        <rect
          fill="none"
          height="28"
          rx="7"
          stroke="#22d3ee"
          strokeOpacity="0.9"
          strokeWidth="2"
          width="28"
          x="3"
          y="3"
        />
        <rect fill="#101217" height="7" rx="2" width="5" x="9" y="10" />
        <rect fill="#101217" height="7" rx="2" width="5" x="20" y="10" />
        <rect fill="#22d3ee" height="2" width="2" x="11" y="12" />
        <rect fill="#22d3ee" height="2" width="2" x="22" y="12" />
      </svg>
    );
  }

  if (profile.texture === "bot-volt-core") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 34 34">
        <rect fill="#22d3ee" height="34" rx="8" width="34" />
        <rect
          fill="none"
          height="28"
          rx="7"
          stroke="#a3e635"
          strokeOpacity="0.9"
          strokeWidth="2"
          width="28"
          x="3"
          y="3"
        />
        <rect fill="#101217" height="7" rx="2" width="6" x="8" y="10" />
        <rect fill="#101217" height="7" rx="2" width="6" x="20" y="10" />
        <path d="M9 24H25M17 18V30" stroke="#f8fafc" strokeLinecap="round" strokeOpacity="0.92" strokeWidth="2" />
      </svg>
    );
  }

  if (profile.texture === "bot-glitch-core") {
    return (
      <svg aria-hidden="true" className={className} viewBox="0 0 34 34">
        <rect fill="#a3e635" height="34" rx="8" width="34" />
        <rect
          fill="none"
          height="28"
          rx="7"
          stroke="#f43f5e"
          strokeOpacity="0.9"
          strokeWidth="2"
          width="28"
          x="3"
          y="3"
        />
        <path d="M8 10L15 13L8 17ZM26 10L19 13L26 17Z" fill="#101217" />
        <path d="M10 25L15 22L20 27L25 23" stroke="#101217" strokeLinecap="round" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 34 34">
      <rect fill="#f43f5e" height="34" rx="8" width="34" />
      <rect
        fill="none"
        height="28"
        rx="7"
        stroke="#f59e0b"
        strokeOpacity="0.9"
        strokeWidth="2"
        width="28"
        x="3"
        y="3"
      />
      <rect fill="#101217" height="5" width="6" x="8" y="11" />
      <rect fill="#101217" height="5" width="6" x="20" y="11" />
      <path d="M14 24L20 17V30Z" fill="#f59e0b" />
    </svg>
  );
}
