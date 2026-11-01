"use client";

import { FusebotPortrait } from "./FusebotPortrait";
import { PRESET_LABELS, formatClock, tuningFacts } from "./CampaignScreen";
import type { RoundFacts } from "@/game/simulation/campaign";
import {
  applyDailyWin,
  getCurrentStreak,
  getDailyChallenge,
  getDailyOpponents,
  isDailyCleared,
  type DailyChallenge,
  type DailyProgress
} from "@/game/simulation/daily";
import { calculateRoundScore } from "@/game/simulation/scoring";

const UNRANKED_NOTE = "Personal and unranked. Your browser reports the result, so it never reaches the leaderboard.";

/** "Sunday 1 November", read in UTC because that is the Daily Fuse day. */
export function formatDailyDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** "Fuse Rush", or "Fuse Rush + Circuit Shade" on a gauntlet day. */
export function dailyOpponentLabel(challenge: DailyChallenge) {
  return getDailyOpponents(challenge)
    .map((bot) => bot.name)
    .join(" + ");
}

function dailyFacts(challenge: DailyChallenge): Array<{ label: string; value: string }> {
  return [
    { label: "Board", value: `${challenge.arena.cols}×${challenge.arena.rows}` },
    { label: "Layout", value: PRESET_LABELS[challenge.arena.preset] },
    { label: "Format", value: `1v${challenge.bots.length}` },
    ...tuningFacts(challenge.bots, challenge.modifier.modifiers)
  ];
}

function DailyPortraits({ challenge, className }: Readonly<{ challenge: DailyChallenge; className: string }>) {
  return (
    <span className="campaign-portraits" data-count={challenge.bots.length}>
      {getDailyOpponents(challenge).map((bot) => (
        <FusebotPortrait character={bot.id} className={className} key={bot.id} />
      ))}
    </span>
  );
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Today's board, opponents and modifier, beside the player's streak. */
export function DailyScreen({
  dateKey,
  progress,
  onStart,
  onClose
}: Readonly<{
  dateKey: string;
  progress: DailyProgress;
  onStart: (dateKey: string) => void;
  onClose: () => void;
}>) {
  const challenge = getDailyChallenge(dateKey);

  if (!challenge) {
    return null;
  }

  const opponents = getDailyOpponents(challenge);
  const gauntlet = opponents.length > 1;
  const cleared = isDailyCleared(progress, dateKey);
  const streak = getCurrentStreak(progress, dateKey);
  const todaysBest = progress.recent[dateKey];

  return (
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <section
        aria-labelledby="daily-title"
        aria-modal="true"
        className="admin-dialog daily-dialog"
        id="daily-fuse"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-panel">
          <div className="admin-panel-header">
            <h3 id="daily-title">Daily Fuse</h3>
            <div className="admin-panel-header-actions">
              <span>{formatDailyDate(dateKey)}</span>
              <button aria-label="Close Daily Fuse" className="dialog-icon-button" onClick={onClose} type="button">
                Close
              </button>
            </div>
          </div>

          <div className="daily-grid dialog-scroll-region">
            <section aria-label="Today's challenge" className="daily-briefing">
              <div className="daily-modifier">
                <span className="daily-modifier-kicker">Today&apos;s rule</span>
                <strong className="daily-modifier-label">{challenge.modifier.label}</strong>
                <p>{challenge.modifier.blurb}</p>
              </div>

              <div className="campaign-briefing-head">
                <DailyPortraits challenge={challenge} className="campaign-briefing-portrait" />
                <div>
                  <p className="campaign-briefing-stage">{gauntlet ? "Gauntlet" : "Opponent"}</p>
                  <h4>{dailyOpponentLabel(challenge)}</h4>
                  <p>{gauntlet ? "Two bots at once. Last one standing wins." : opponents[0].tagline}</p>
                </div>
              </div>

              {opponents.map((bot) => (
                <p className="campaign-intel" key={bot.id}>
                  <strong>Intel</strong> {gauntlet ? `${bot.name}: ` : ""}
                  {bot.quirk}
                </p>
              ))}

              <div className="trait-grid campaign-facts">
                {dailyFacts(challenge).map((fact) => (
                  <div className="trait-pill" key={fact.label}>
                    <span>{fact.label}</span>
                    <strong>{fact.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section aria-label="Your streak" aria-live="polite" className="daily-side">
              <div className="daily-streak" data-active={streak > 0}>
                <strong className="daily-streak-count">{streak}</strong>
                <span>Day streak</span>
              </div>

              <p className="daily-status" data-cleared={cleared}>
                {cleared
                  ? `Cleared today in ${formatClock(todaysBest ?? 0)}. Replay to beat your time.`
                  : streak > 0
                    ? "Not cleared yet. Win today to keep your streak."
                    : "Not cleared yet. Win today to start a streak."}
              </p>

              <div className="trait-grid campaign-facts daily-records">
                <div className="trait-pill">
                  <span>Longest</span>
                  <strong>{plural(progress.longestStreak, "day")}</strong>
                </div>
                <div className="trait-pill">
                  <span>Days cleared</span>
                  <strong>{progress.totalClears}</strong>
                </div>
                <div className="trait-pill">
                  <span>Best time</span>
                  <strong>{progress.bestTimeMs === null ? "None" : formatClock(progress.bestTimeMs)}</strong>
                </div>
              </div>
            </section>

            <button className="command-button daily-start" onClick={() => onStart(dateKey)} type="button">
              {cleared ? "Replay today's fuse" : "Play today's fuse"}
            </button>

            <p className="daily-note">{UNRANKED_NOTE} A new fuse lights at midnight UTC.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export type DailyRoundResult = RoundFacts & {
  dateKey: string;
  /** Progress before this round was applied, to spot a new streak or best. */
  progressBefore: DailyProgress;
};

/** Shown after the KO/Down banner in Daily Fuse, in place of the leaderboard. */
export function DailyResultPanel({
  result,
  onRetry,
  onOpenBriefing,
  onClose
}: Readonly<{
  result: DailyRoundResult;
  onRetry: (dateKey: string) => void;
  onOpenBriefing: () => void;
  onClose: () => void;
}>) {
  const challenge = getDailyChallenge(result.dateKey);

  if (!challenge) {
    return null;
  }

  const opponent = getDailyOpponents(challenge)[0];
  const won = result.winner === "player";
  const before = result.progressBefore;
  const after = won ? applyDailyWin(before, { dateKey: result.dateKey, durationMs: result.durationMs }) : before;
  const firstClear = won && !isDailyCleared(before, result.dateKey);
  const previousBest = before.recent[result.dateKey];
  const streak = getCurrentStreak(after, result.dateKey);
  const title = won ? "Daily Fuse cleared" : result.winner === "draw" ? "Draw" : "Knocked out";
  const score = calculateRoundScore({ mode: "daily", ...result });
  let callout: string | null = null;

  if (firstClear) {
    callout =
      after.longestStreak > before.longestStreak && streak > 1
        ? `Streak: ${plural(streak, "day")}. That's your longest yet.`
        : `Streak: ${plural(streak, "day")}. Come back tomorrow to keep it going.`;
  } else if (won && previousBest !== undefined) {
    callout =
      result.durationMs < previousBest
        ? `New best time for today: ${formatClock(result.durationMs)}.`
        : `Already cleared today. Your best is ${formatClock(previousBest)}.`;
  }

  return (
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <section
        aria-labelledby="daily-result-title"
        aria-modal="true"
        className="admin-dialog campaign-result daily-result"
        data-outcome={won ? "win" : "loss"}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-panel">
          <div className="campaign-result-head">
            <FusebotPortrait character={won ? "spark" : opponent.id} className="campaign-result-portrait" />
            <div>
              <p className="campaign-briefing-stage">
                {formatDailyDate(result.dateKey)}: {challenge.modifier.label}
              </p>
              <h3 id="daily-result-title">{title}</h3>
            </div>
          </div>

          <div className="trait-grid campaign-facts">
            <div className="trait-pill">
              <span>Time</span>
              <strong>{formatClock(result.durationMs)}</strong>
            </div>
            <div className="trait-pill">
              <span>Blocks</span>
              <strong>{result.blocksCleared}</strong>
            </div>
            <div className="trait-pill">
              <span>Streak</span>
              <strong>{plural(streak, "day")}</strong>
            </div>
            <div className="trait-pill">
              <span>Score</span>
              <strong>{score.toLocaleString()}</strong>
            </div>
          </div>

          {callout ? <p className="campaign-callout">{callout}</p> : null}
          {!won ? (
            <p className="campaign-intel">
              <strong>Intel</strong> {opponent.quirk}
            </p>
          ) : null}
          <p className="daily-note">{UNRANKED_NOTE}</p>

          <div className="campaign-result-actions">
            <button className="command-button" onClick={() => onRetry(result.dateKey)} type="button">
              {won ? "Play again" : "Retry"}
            </button>
            <button className="command-button secondary" onClick={onOpenBriefing} type="button">
              Daily briefing
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
