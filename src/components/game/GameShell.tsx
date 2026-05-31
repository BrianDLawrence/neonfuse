"use client";

import { useCallback, useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { PhaserGame } from "./PhaserGame";
import type { BotHudState } from "@/game/createGame";
import { DEFAULT_GAME_MODE, type GameMode } from "@/game/modes";
import {
  BOT_PROFILE_ORDER,
  BOT_PROFILES,
  DEFAULT_BOT_SELECTION,
  type BotId,
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

export function GameShell() {
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
  const selectedBotProfile = BOT_PROFILES[selectedBotInfo];

  useEffect(() => {
    if (!isAdminOpen && !isBotLabOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAdminOpen(false);
        setIsBotLabOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAdminOpen, isBotLabOpen]);

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
  const handleBotSelectionChange = useCallback((slot: BotId, profileId: BotProfileId) => {
    setBotSelection((currentSelection) => ({
      ...currentSelection,
      [slot]: profileId
    }));
    setSelectedBotInfo(profileId);
  }, []);
  const handleModeStart = useCallback((mode: GameMode) => {
    setModeCommand((currentCommand) => ({
      mode,
      sequence: currentCommand.sequence + 1
    }));
    setRoundStatus("Warmup");
  }, []);

  return (
    <main className="app-frame">
      <section className="game-stage" aria-label="Neon Fuse game prototype">
        <PhaserGame
          botSelection={botSelection}
          modeCommand={modeCommand}
          powerupDropRates={powerupDropRates}
          onRoundStatusChange={setRoundStatus}
          onLoadoutChange={handleLoadoutChange}
          onBotHudChange={setBotHud}
          onMatchStatsChange={handleMatchStatsChange}
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
                <div className="hud-chip">
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
          <div className="command-row">
            <button
              aria-pressed={modeCommand.mode === "player-vs-bot"}
              className="command-button"
              onClick={() => handleModeStart("player-vs-bot")}
              type="button"
            >
              Local Match
            </button>
            <button
              aria-pressed={modeCommand.mode === "bot-skirmish"}
              className="command-button secondary"
              onClick={() => handleModeStart("bot-skirmish")}
              type="button"
            >
              Bot Skirmish
            </button>
          </div>
          <div className="match-links">
            <a className="admin-link" href="#bot-lab" onClick={handleBotLabLinkClick}>
              Bots
            </a>
            <a className="admin-link" href="#admin-settings" onClick={handleAdminLinkClick}>
              Admin
            </a>
          </div>
        </aside>

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
                  <span>Roster setup</span>
                </div>

                <div className="bot-lab-grid">
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
                            style={{ borderColor: profile.accent }}
                            type="button"
                          >
                            <span>{profile.name}</span>
                            <small>{profile.tagline}</small>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="bot-detail-panel" aria-live="polite">
                    <div className="bot-detail-title">
                      <span style={{ backgroundColor: selectedBotProfile.accent }} />
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
                  <span>Powerup rate</span>
                </div>
                {POWERUP_CONTROLS.map((control) => (
                  <label className="slider-row" key={control.type}>
                    <span className="slider-label">
                      <i className={`stat-icon ${control.iconClass}`} aria-hidden="true" />
                      {control.label}
                    </span>
                    <input
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
      </div>
    </main>
  );
}
