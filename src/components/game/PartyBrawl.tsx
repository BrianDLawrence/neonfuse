"use client";

import { useEffect, useRef } from "react";
import type { PartyFighterView, PartySeatView, PartySnapshot } from "@/game/multiplayer/protocol";
import { BOT_PROFILES } from "@/game/simulation/bots";
import { PARTY_SEAT_PROFILES } from "@/game/simulation/partyBots";
import type { FusebotId } from "@/game/presentation/fusebotArt";
import { FusebotPortrait } from "./FusebotPortrait";

type Seatable = PartySeatView | PartyFighterView;

/** A person's name, or the bot's profile name. Never an account or Discord ID. */
export function seatName(seat: Seatable) {
  return seat.kind === "human" ? seat.name : BOT_PROFILES[seat.profileId].name;
}

/** Seat 0's person wears Spark; every other seat, and every bot, wears its seat's Fusebot. */
function seatCharacter(seat: Seatable, index: number): FusebotId {
  if (seat.kind === "bot") return seat.profileId;
  return index === 0 ? "spark" : PARTY_SEAT_PROFILES[index];
}

function peopleSeated(snapshot: PartySnapshot) {
  return snapshot.seats.filter((seat) => seat.kind === "human").length;
}

/** The round's fighters while one is on, otherwise who holds each seat now. */
function boardSeats(snapshot: PartySnapshot): Seatable[] {
  return snapshot.phase === "playing" || snapshot.phase === "countdown" ? snapshot.fighters ?? snapshot.seats : snapshot.seats;
}

/** Two fuse segments per seat: each lights when its holder wins a round. The series' one flourish. */
function SeriesFuse({ wins, target, label }: { wins: number; target: number; label: string }) {
  return (
    <span className="brawl-fuse" aria-label={`${label}: ${wins} of ${target} wins`} role="img">
      {Array.from({ length: target }, (_, index) => (
        <span aria-hidden="true" className="brawl-fuse-segment" data-lit={index < wins} key={index} />
      ))}
    </span>
  );
}

export function PartyScoreboard({ snapshot }: { snapshot: PartySnapshot }) {
  const seats = boardSeats(snapshot);
  return (
    <ol className="brawl-scoreboard" aria-label="Fighters">
      {seats.map((seat, index) => {
        const player = snapshot.duel?.players[index];
        const out = snapshot.phase === "playing" && player && !player.alive;
        const status = out ? "Out" : seat.kind === "bot" ? "Bot" : "connected" in seat && !seat.connected ? "Reconnecting…" : "Connected";
        return (
          <li className="brawl-scoreboard-seat" data-kind={seat.kind} data-out={Boolean(out)} data-seat={index} key={index}>
            <strong>{seatName(seat)}{snapshot.seat === index ? " (you)" : ""}</strong>
            <small>{status}</small>
          </li>
        );
      })}
    </ol>
  );
}

function roundHeading(snapshot: PartySnapshot) {
  const series = snapshot.series;
  const duel = snapshot.duel;
  if (snapshot.phase !== "finished" || !series || !duel) return "Party Brawl";
  const fighters = snapshot.fighters ?? snapshot.seats;
  if (series.outcome) {
    const champion = series.outcome.winnerSeat;
    if (champion === null) return "The series is a draw";
    return champion === snapshot.seat ? "You take the series!" : `${seatName(fighters[champion])} takes the series`;
  }
  if (duel.winner === "draw" || duel.winner === null) return `Round ${series.rounds} is a draw`;
  return duel.winner === snapshot.seat ? `You win round ${series.rounds}!` : `${seatName(fighters[duel.winner])} wins round ${series.rounds}`;
}

function lobbyCopy(snapshot: PartySnapshot) {
  const series = snapshot.series;
  if (snapshot.phase !== "finished" || !series) {
    return "Four fighters, first to two round wins. Bots take any empty seat, and friends who join can take a bot's seat between rounds.";
  }
  if (series.outcome) return "Choose Rematch to start a new best of three.";
  if (snapshot.duel?.reason === "forfeit") return "A player left or could not reconnect. Everyone who is seated chooses Next round.";
  if (snapshot.duel?.reason === "timeout") return "Time ran out with more than one fighter standing. Everyone who is seated chooses Next round.";
  return "Everyone who is seated chooses Next round.";
}

type PartyLobbyProps = {
  snapshot: PartySnapshot | null;
  notice: string;
  canReady: boolean;
  status: "connecting" | "connected" | "reconnecting" | "error";
  onReady: (ready: boolean) => void;
  onRetry: () => void;
  onLeave: () => void;
};

export function PartyLobby({ snapshot, notice, canReady, status, onReady, onRetry, onLeave }: PartyLobbyProps) {
  const seats = snapshot?.seats ?? [];
  const series = snapshot?.series ?? null;
  const me = snapshot ? snapshot.seats[snapshot.seat] : null;
  const ready = me?.kind === "human" && me.ready;
  const seriesOver = Boolean(snapshot?.phase === "finished" && series?.outcome);
  const between = Boolean(snapshot?.phase === "finished" && series && !series.outcome);
  const tooFew = snapshot ? peopleSeated(snapshot) < 2 : false;
  const primary = useRef<HTMLButtonElement>(null);
  // When a round or the series ends, the next decision is the obvious place for focus.
  useEffect(() => { if (between || seriesOver) primary.current?.focus(); }, [between, seriesOver]);
  const standings = seriesOver && series
    ? seats.map((seat, index) => ({ seat, index, wins: series.wins[index] ?? 0 })).sort((a, b) => b.wins - a.wins || a.index - b.index)
    : null;

  return (
    <section className="duel-lobby brawl-lobby" aria-labelledby="duel-title">
      <p className="auth-kicker">Discord Party</p>
      <h2 id="duel-title">{snapshot ? roundHeading(snapshot) : "Party Brawl"}</h2>
      <p className="duel-copy">{snapshot ? lobbyCopy(snapshot) : "Connecting to your party…"}</p>
      {standings && series ? (
        <ol className="brawl-standings" aria-label="Final standings">
          {standings.map(({ seat, index, wins }) => (
            <li className="brawl-standing" data-kind={seat.kind} data-seat={index} key={index}>
              <FusebotPortrait character={seatCharacter(seat, index)} className="brawl-portrait" />
              <strong>{seatName(seat)}{snapshot?.seat === index ? " (you)" : ""}</strong>
              <SeriesFuse label={seatName(seat)} target={series.target} wins={wins} />
            </li>
          ))}
        </ol>
      ) : (
        <ol className="brawl-seats" aria-label="Seats">
          {seats.map((seat, index) => {
            const label = seat.kind === "bot"
              ? `Seat ${index + 1}, bot, ${seatName(seat)}`
              : `Seat ${index + 1}, ${seat.name}${snapshot?.seat === index ? ", you" : ""}`;
            const state = seat.kind === "bot"
              ? BOT_PROFILES[seat.profileId].tagline
              : !seat.connected ? "Reconnecting…" : seat.ready ? "Ready" : "Not ready";
            return (
              <li
                aria-label={label}
                className="brawl-seat"
                data-kind={seat.kind}
                data-ready={seat.kind === "human" && seat.ready}
                data-seat={index}
                key={index}
              >
                <FusebotPortrait character={seatCharacter(seat, index)} className="brawl-portrait" />
                <span className="brawl-seat-text">
                  <span className="brawl-seat-kind">{seat.kind === "bot" ? "Bot" : `Player ${index + 1}`}</span>
                  <strong>{seatName(seat)}{snapshot?.seat === index ? " (you)" : ""}</strong>
                  <small>{state}</small>
                </span>
                {series ? <SeriesFuse label={seatName(seat)} target={series.target} wins={series.wins[index] ?? 0} /> : null}
              </li>
            );
          })}
        </ol>
      )}
      <p className="duel-notice" aria-live="polite">{tooFew && status === "connected" ? "Waiting for a second player to join this Activity." : notice}</p>
      <div className="duel-lobby-actions">
        {status === "error" ? (
          <button className="command-button" onClick={onRetry} type="button">Retry connection</button>
        ) : (
          <button
            aria-pressed={ready}
            className="command-button"
            ref={primary}
            disabled={!canReady || tooFew}
            onClick={() => onReady(!ready)}
            type="button"
          >
            {ready ? "Cancel ready" : seriesOver ? "Rematch" : between ? "Next round" : "Ready"}
          </button>
        )}
        <button className="command-button secondary" onClick={onLeave} type="button">Back to local play</button>
      </div>
    </section>
  );
}
