"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GameMode } from "@/game/modes";
import type { ScoreWinner } from "@/game/simulation/scoring";
import type { HighScoreEntry } from "@/lib/leaderboard";
import type { HighScoreMode } from "@/lib/schemas/high-score";

export type RoundScoreResult = {
  matchId: string | null;
  mode: GameMode;
  winner: ScoreWinner;
  durationMs: number;
  blocksCleared: number;
  score: number;
  stored: boolean;
  qualifiesForLeaderboard: boolean;
  topScores: HighScoreEntry[];
  status: "saving" | "ready" | "offline" | "error";
  error?: string;
};

type HighScoresScreenProps = {
  visitorId: string | null;
  result: RoundScoreResult | null;
  onClose: () => void;
};

const MODES: Array<{ value: HighScoreMode; label: string }> = [
  { value: "all", label: "All" },
  { value: "player-vs-bot", label: "Local" },
  { value: "bot-skirmish", label: "Bots" }
];

function formatDuration(durationMs: number) {
  return `${Math.max(0, Math.round(durationMs / 1000))}s`;
}

function describeWinner(winner: ScoreWinner) {
  if (winner === "bot-a") {
    return "Bot A";
  }

  if (winner === "bot-b") {
    return "Bot B";
  }

  return winner.charAt(0).toUpperCase() + winner.slice(1);
}

export function HighScoresScreen({ visitorId, result, onClose }: HighScoresScreenProps) {
  const [mode, setMode] = useState<HighScoreMode>("all");
  const [scores, setScores] = useState<HighScoreEntry[]>(result?.topScores ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [initials, setInitials] = useState("AAA");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("neon-fuse:last-initials");
      if (stored && /^[A-Z]{3}$/.test(stored)) {
        setInitials(stored);
      }
    } catch {
      // Initials are a convenience only.
    }
  }, []);

  useEffect(() => {
    if (mode === "all" && result?.topScores.length) {
      setScores(result.topScores);
    }
  }, [mode, result]);

  useEffect(() => {
    let isMounted = true;

    async function loadScores() {
      setIsLoading(true);

      try {
        const response = await fetch(`/api/high-scores?mode=${mode}&limit=10`);
        const payload = (await response.json()) as {
          ok?: boolean;
          stored?: boolean;
          scores?: HighScoreEntry[];
        };

        if (!isMounted) {
          return;
        }

        setScores(payload.scores ?? []);
        if (payload.stored === false) {
          setMessage("MongoDB is offline for this run. Scores are visible for this round only.");
        } else {
          setMessage((currentMessage) => (currentMessage?.startsWith("MongoDB") ? null : currentMessage));
        }
      } catch {
        if (isMounted) {
          setMessage("Leaderboard is unavailable right now.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadScores();

    return () => {
      isMounted = false;
    };
  }, [mode]);

  const canSubmitInitials = Boolean(
    result?.matchId &&
      visitorId &&
      result.qualifiesForLeaderboard &&
      result.status === "ready" &&
      submitStatus !== "saved"
  );

  const statusText = useMemo(() => {
    if (!result) {
      return "Leaderboard";
    }

    if (result.status === "saving") {
      return "Saving score";
    }

    if (result.status === "offline") {
      return "Offline score";
    }

    if (result.status === "error") {
      return "Score not stored";
    }

    return result.qualifiesForLeaderboard ? "Enter initials" : "Score recorded";
  }, [result]);

  const handleInitialsChange = useCallback((value: string) => {
    const normalized = value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
    setInitials(normalized);
  }, []);

  const handleSubmitInitials = useCallback(async () => {
    if (!result?.matchId || !visitorId || initials.length !== 3) {
      return;
    }

    setSubmitStatus("saving");
    setMessage(null);

    try {
      const response = await fetch("/api/high-scores", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          matchId: result.matchId,
          visitorId,
          initials
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        stored?: boolean;
        scores?: HighScoreEntry[];
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to submit initials");
      }

      if (mode === "all") {
        setScores(payload.scores ?? []);
      } else {
        const scoresResponse = await fetch(`/api/high-scores?mode=${mode}&limit=10`);
        const scoresPayload = (await scoresResponse.json()) as { scores?: HighScoreEntry[] };
        setScores(scoresPayload.scores ?? []);
      }
      setSubmitStatus("saved");
      setMessage(payload.stored === false ? "MongoDB is offline; initials were not stored." : "Initials locked.");

      try {
        window.localStorage.setItem("neon-fuse:last-initials", initials);
      } catch {
        // Optional convenience.
      }
    } catch (error) {
      setSubmitStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to submit initials");
    }
  }, [initials, mode, result, visitorId]);

  return (
    <div className="admin-dialog-backdrop high-score-backdrop" onClick={onClose}>
      <section
        aria-labelledby="high-scores-title"
        aria-modal="true"
        className="high-score-screen"
        id="high-scores"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="high-score-marquee">
          <span>Neon Fuse</span>
          <strong id="high-scores-title">High Scores</strong>
          <span>{statusText}</span>
        </div>

        <div className="high-score-body">
          <section className="scoreboard-panel" aria-label="Leaderboard">
            <div className="scoreboard-tabs" role="group" aria-label="Leaderboard mode">
              {MODES.map((tab) => (
                <button
                  aria-pressed={mode === tab.value}
                  className="scoreboard-tab"
                  key={tab.value}
                  onClick={() => setMode(tab.value)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <ol className="scoreboard-list" aria-busy={isLoading}>
              {scores.length ? (
                scores.map((score) => (
                  <li className="scoreboard-row" key={score.matchId}>
                    <span className="score-rank">{String(score.rank).padStart(2, "0")}</span>
                    <strong>{score.initials}</strong>
                    <span>{score.mode === "bot-skirmish" ? "BOT" : "LOC"}</span>
                    <span>{describeWinner(score.winner)}</span>
                    <b>{score.score.toLocaleString()}</b>
                  </li>
                ))
              ) : (
                <li className="scoreboard-empty">{isLoading ? "Loading..." : "No stored scores"}</li>
              )}
            </ol>
          </section>

          <section className="score-entry-panel" aria-label="Current score">
            <div className="current-score-readout">
              <span>Current Score</span>
              <strong>{result ? result.score.toLocaleString() : "0"}</strong>
            </div>

            {result ? (
              <div className="score-facts">
                <span>{result.mode === "bot-skirmish" ? "Bot Skirmish" : "Local Match"}</span>
                <span>Winner {describeWinner(result.winner)}</span>
                <span>{result.blocksCleared} blocks</span>
                <span>{formatDuration(result.durationMs)}</span>
              </div>
            ) : null}

            {canSubmitInitials ? (
              <form
                className="initials-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSubmitInitials();
                }}
              >
                <label htmlFor="initials-input">Initials</label>
                <input
                  aria-label="Three letter initials"
                  autoComplete="off"
                  id="initials-input"
                  inputMode="text"
                  maxLength={3}
                  onChange={(event) => handleInitialsChange(event.target.value)}
                  value={initials}
                />
                <button disabled={initials.length !== 3 || submitStatus === "saving"} type="submit">
                  {submitStatus === "saving" ? "Saving" : "Submit"}
                </button>
              </form>
            ) : null}

            {result && !result.qualifiesForLeaderboard && result.status === "ready" ? (
              <p className="score-message">Score saved. It did not crack the top board.</p>
            ) : null}

            {result?.status === "saving" ? <p className="score-message">Saving match...</p> : null}
            {result?.status === "offline" ? (
              <p className="score-message">MongoDB is not configured. This score stays local to this screen.</p>
            ) : null}
            {result?.status === "error" ? (
              <p className="score-message">{result.error ?? "The match result could not be stored."}</p>
            ) : null}
            {message ? <p className="score-message">{message}</p> : null}

            <button className="dialog-close-button" onClick={onClose} type="button">
              Close
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}
