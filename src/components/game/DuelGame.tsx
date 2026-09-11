"use client";

import { useEffect, useRef, useState } from "react";
import type { Direction } from "@/game/simulation/arena";
import { useDuelConnection } from "./useDuelConnection";

const DIRECTIONS = [{ dir: "up", glyph: "▲" }, { dir: "left", glyph: "◀" }, { dir: "right", glyph: "▶" }, { dir: "down", glyph: "▼" }] as const;

export function DuelGame({ authToken, onLeave }: { authToken?: string; onLeave: () => void }) {
  const connection = useDuelConnection(authToken);
  const { snapshot, snapshotRef, input, status, error, notice } = connection;
  const host = useRef<HTMLDivElement>(null);
  const direction = useRef<Direction | null>(null);
  const [loaded, setLoaded] = useState(false);
  const phase = snapshot?.phase ?? "waiting";
  const player = snapshot?.players[snapshot.seat];
  const loadout = snapshot?.duel?.players[snapshot.seat].loadout;
  const canPlay = status === "connected" && phase === "playing";
  const liveRef = useRef(canPlay);
  useEffect(() => { liveRef.current = canPlay; if (!canPlay) direction.current = null; }, [canPlay]);

  useEffect(() => {
    let disposed = false;
    let game: import("phaser").Game | undefined;
    let observer: ResizeObserver | undefined;
    const blur = () => { direction.current = null; };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", blur);
    void import("@/game/createDuelGame").then(({ createDuelGame }) => {
      if (disposed || !host.current) return;
      game = createDuelGame(host.current, {
        snapshot: () => snapshotRef.current,
        direction: () => direction.current,
        input: (command) => { if (liveRef.current) input(command); },
        loaded: () => { if (!disposed) setLoaded(true); }
      });
      observer = new ResizeObserver(() => {
        if (host.current) game?.scale.resize(host.current.clientWidth, host.current.clientHeight);
      });
      observer.observe(host.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect(); game?.destroy(true);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", blur);
    };
  }, [input, snapshotRef]);

  useEffect(() => { if (canPlay) host.current?.focus(); }, [canPlay]);
  const countdown = snapshot?.duel ? Math.max(1, Math.ceil((snapshot.duel.startsAt - snapshot.duel.time) / 1000)) : 3;
  const winner = snapshot?.duel?.winner;
  const heading = phase === "finished"
    ? winner === "draw" ? "Draw!" : winner === snapshot?.seat ? "You win!" : "Round over"
    : "Play with a friend";
  const summary = phase === "finished"
    ? snapshot?.duel?.reason === "forfeit" ? "A player left or could not reconnect." : snapshot?.duel?.reason === "timeout" ? "Time is up. This round is a draw." : "Ready for another round? Both players choose Rematch."
    : "Ask your friend to join this Discord Activity, then both select Ready.";

  return (
    <main className="duel-shell">
      <div className="duel-canvas" ref={host} tabIndex={-1} aria-label="Two-player arena. Arrow keys or WASD to move, Space to plant a bomb." />
      <header className="duel-header">
        <div><h1>Neon Fuse</h1><p>Friend match · Two players</p></div>
        <div className="duel-header-actions">
          <span className="hud-chip" aria-live="polite"><span>Round</span><strong>{status !== "connected" ? status : phase === "playing" ? "Live" : phase}</strong></span>
          <button className="command-button secondary" onClick={onLeave} type="button">Leave</button>
        </div>
      </header>
      {snapshot ? <div className="duel-scoreboard" aria-label="Player slots">
        {snapshot.players.map((member, index) => <span className="duel-player-label" data-seat={index} key={index}>
          <strong>{member?.name ?? "Open slot"}{snapshot.seat === index ? " (you)" : ""}</strong>
          <small>{member ? member.connected ? "Connected" : "Reconnecting…" : "Waiting for opponent"}</small>
        </span>)}
      </div> : null}
      {(phase === "waiting" || phase === "finished" || status === "error") ? (
        <section className="duel-lobby" aria-labelledby="duel-title">
          <p className="auth-kicker">Discord Party</p>
          <h2 id="duel-title">{heading}</h2>
          <p className="duel-copy">{summary}</p>
          <div className="duel-slots">
            {[0, 1].map((index) => {
              const member = snapshot?.players[index];
              return <div className="duel-slot" data-seat={index} key={index}>
                <span>Player {index + 1}</span>
                <strong>{member?.name ?? "Waiting for opponent…"}</strong>
                <small>{member ? !member.connected ? "Reconnecting…" : member.ready ? "Ready" : "Not ready" : "Join this Activity to play"}</small>
              </div>;
            })}
          </div>
          <p className="duel-notice" aria-live="polite">{error ?? notice ?? (status !== "connected" ? "Connecting to your party…" : !loaded ? "Loading the arena…" : "Two players · Three-minute rounds")}</p>
          <div className="duel-lobby-actions">
            {status === "error" ? <button className="command-button" onClick={connection.retry} type="button">Retry connection</button> :
              <button className="command-button" aria-pressed={player?.ready ?? false} disabled={!loaded || status !== "connected"} onClick={() => connection.ready(!player?.ready)} type="button">
                {player?.ready ? "Cancel ready" : phase === "finished" ? "Rematch" : "Ready"}
              </button>}
            <button className="command-button secondary" onClick={onLeave} type="button">Back to local play</button>
          </div>
        </section>
      ) : null}
      {phase === "countdown" && status === "connected" ? <div className="duel-countdown" role="status">{countdown}<span>Get ready!</span></div> : null}
      {status === "reconnecting" && phase === "playing" ? <p className="duel-connection-banner" role="status">Reconnecting… The round continues.</p> : snapshot?.reconnectSeconds != null && phase === "playing" ? <p className="duel-connection-banner" role="status">Opponent reconnecting · {snapshot.reconnectSeconds}s remaining</p> : null}
      <footer className="duel-controls">
        <p className="duel-help">WASD / Arrows: Move · Space: Bomb{loadout ? ` · Bombs ${loadout.bombs} / Blast ${loadout.blast} / Speed ${loadout.speed}` : ""}</p>
        {phase === "playing" ? <div className="duel-touch-row">
          <div className="duel-pad" role="group" aria-label="Move">
            {DIRECTIONS.map(({ dir, glyph }) => <button className="touch-pad-button" data-dir={dir} aria-label={`Move ${dir}`} disabled={!canPlay} key={dir} type="button"
              onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); direction.current = dir; host.current?.focus(); }}
              onPointerUp={() => { direction.current = null; }} onPointerCancel={() => { direction.current = null; }} onLostPointerCapture={() => { direction.current = null; }}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); input({ type: "move", direction: dir }); } }}>
              <span aria-hidden="true">{glyph}</span>
            </button>)}
          </div>
          <button className="touch-button touch-button-bomb" disabled={!canPlay} onClick={() => { input({ type: "bomb" }); host.current?.focus(); }} type="button">Bomb</button>
        </div> : null}
      </footer>
    </main>
  );
}
