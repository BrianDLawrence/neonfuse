"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameMode } from "@/game/modes";
import type { ScoreWinner } from "@/game/simulation/scoring";
import { authenticatedHeaders } from "@/lib/authenticated-headers";
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
  authToken?: string;
  playerName: string;
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

export function HighScoresScreen({
  authToken,
  playerName,
  result,
  onClose
}: HighScoresScreenProps) {
  const [mode, setMode] = useState<HighScoreMode>("all");
  const [scores, setScores] = useState<HighScoreEntry[]>(result?.topScores ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const submittedMatchIdRef = useRef<string | null>(null);

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

    if (!result.qualifiesForLeaderboard || submitStatus === "saved") {
      return "Score recorded";
    }

    if (submitStatus === "saving") {
      return "Saving player score";
    }

    if (submitStatus === "error") {
      return "Save interrupted";
    }

    return "Qualifying score";
  }, [result, submitStatus]);

  const submitCurrentScore = useCallback(async () => {
    if (
      !result?.matchId ||
      !result.qualifiesForLeaderboard ||
      result.status !== "ready"
    ) {
      return;
    }

    submittedMatchIdRef.current = result.matchId;
    setSubmitStatus("saving");
    setMessage(null);

    try {
      const response = await fetch("/api/high-scores", {
        method: "POST",
        headers: authenticatedHeaders(authToken, {
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          matchId: result.matchId
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        stored?: boolean;
        scores?: HighScoreEntry[];
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Unable to save your leaderboard score");
      }

      if (mode === "all") {
        setScores(payload.scores ?? []);
      } else {
        const scoresResponse = await fetch(`/api/high-scores?mode=${mode}&limit=10`);
        const scoresPayload = (await scoresResponse.json()) as { scores?: HighScoreEntry[] };
        setScores(scoresPayload.scores ?? []);
      }
      setSubmitStatus("saved");
      setMessage(
        payload.stored === false
          ? "MongoDB is offline; your leaderboard score was not stored."
          : `Score saved as ${playerName}.`
      );
    } catch (error) {
      submittedMatchIdRef.current = null;
      setSubmitStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to save your leaderboard score");
    }
  }, [authToken, mode, playerName, result]);

  useEffect(() => {
    if (result?.matchId && submittedMatchIdRef.current !== result.matchId) {
      void submitCurrentScore();
    }
  }, [result?.matchId, submitCurrentScore]);

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
                    <strong className="scoreboard-player" title={score.playerName}>
                      {score.playerName}
                    </strong>
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

            <div className="score-player-card">
              <span>Signed-in player</span>
              <strong title={playerName}>{playerName}</strong>
              <small>Qualifying scores save automatically.</small>
            </div>

            {result && !result.qualifiesForLeaderboard && result.status === "ready" ? (
              <p className="score-message" aria-live="polite">
                Score saved. It did not crack the top board.
              </p>
            ) : null}

            {result?.status === "saving" ? (
              <p className="score-message" aria-live="polite">
                Saving match...
              </p>
            ) : null}
            {result?.status === "offline" ? (
              <p className="score-message" aria-live="polite">
                MongoDB is not configured. This score stays local to this screen.
              </p>
            ) : null}
            {result?.status === "error" ? (
              <p className="score-message" aria-live="polite">
                {result.error ?? "The match result could not be stored."}
              </p>
            ) : null}
            {submitStatus === "saving" ? (
              <p className="score-message" aria-live="polite">
                Adding {playerName} to the leaderboard...
              </p>
            ) : null}
            {message ? (
              <p className="score-message" aria-live="polite">
                {message}
              </p>
            ) : null}
            {submitStatus === "error" ? (
              <button
                className="dialog-icon-button"
                onClick={() => void submitCurrentScore()}
                type="button"
              >
                Retry leaderboard save
              </button>
            ) : null}

            <button className="dialog-close-button" onClick={onClose} type="button">
              Close
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}
