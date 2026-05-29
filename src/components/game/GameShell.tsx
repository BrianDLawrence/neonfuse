"use client";

import { useCallback, useState } from "react";
import { PhaserGame } from "./PhaserGame";

export function GameShell() {
  const [roundStatus, setRoundStatus] = useState("Warmup");
  const [bombs, setBombs] = useState(1);
  const [blast, setBlast] = useState(2);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const handleLoadoutChange = useCallback(
    ({ bombs: nextBombs, blast: nextBlast }: { bombs: number; blast: number }) => {
      setBombs(nextBombs);
      setBlast(nextBlast);
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

  return (
    <main className="app-frame">
      <section className="game-stage" aria-label="Neon Fuse game prototype">
        <PhaserGame
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
              <span>Bombs</span>
              <strong>{bombs}</strong>
            </div>
            <div className="hud-chip">
              <span>Blast</span>
              <strong>{blast}</strong>
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
            Hunt the red bot, dodge hostile fuses, and clear soft blocks to open
            attack lanes. Round results are ready to save to MongoDB.
          </p>
          <div className="command-row">
            <button className="command-button" type="button">
              Local Match
            </button>
            <button className="command-button secondary" type="button">
              Bot Skirmish
            </button>
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
