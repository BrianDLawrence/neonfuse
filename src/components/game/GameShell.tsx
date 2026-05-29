"use client";

import { useCallback, useState } from "react";
import { PhaserGame } from "./PhaserGame";
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

export function GameShell() {
  const [roundStatus, setRoundStatus] = useState("Warmup");
  const [bombs, setBombs] = useState(1);
  const [blast, setBlast] = useState(2);
  const [speed, setSpeed] = useState(1);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [powerupDropRates, setPowerupDropRates] = useState<PowerupDropRates>(DEFAULT_POWERUP_DROP_RATES);
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

  return (
    <main className="app-frame">
      <section className="game-stage" aria-label="Neon Fuse game prototype">
        <PhaserGame
          powerupDropRates={powerupDropRates}
          onRoundStatusChange={setRoundStatus}
          onLoadoutChange={handleLoadoutChange}
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
          </div>
        </div>

        <aside className="start-panel">
          <h2>Prototype Zero</h2>
          <p>
            Hunt the red bot, dodge hostile fuses, and break soft blocks for
            upgrades. Round results are ready to save to MongoDB.
          </p>
          <div className="command-row">
            <button className="command-button" type="button">
              Local Match
            </button>
            <button className="command-button secondary" type="button">
              Bot Skirmish
            </button>
          </div>
          <div className="admin-panel" aria-label="Powerup admin controls">
            <div className="admin-panel-header">
              <h3>Admin</h3>
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
          </div>
        </aside>

        <div className="control-strip">
          <span className="key-chip">Arrow Keys / WASD: Move</span>
          <span className="key-chip">Space: Bomb</span>
          <span className="key-chip">R: Reset</span>
          <span className="key-chip">Goal: Blast the red bot</span>
          <span className="key-chip">Danger: Bot bombs</span>
        </div>
      </div>
    </main>
  );
}
