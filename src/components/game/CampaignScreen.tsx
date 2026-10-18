"use client";

import { useState } from "react";
import { FusebotPortrait } from "./FusebotPortrait";
import {
  CAMPAIGN_STAGES,
  applyStageResult,
  getCampaignStage,
  getNextStage,
  getPreviousStage,
  getStageOpponents,
  isStageCleared,
  isStageUnlocked,
  scoreStageResult,
  type CampaignProgress,
  type CampaignStage,
  type CampaignStageId,
  type RoundFacts,
  type StageStars
} from "@/game/simulation/campaign";
import { calculateRoundScore } from "@/game/simulation/scoring";

type StageState = "cleared" | "next" | "open" | "locked";

export function formatClock(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function stageState(progress: CampaignProgress, stage: CampaignStage, nextId: CampaignStageId | null): StageState {
  if (isStageCleared(progress, stage.id)) return "cleared";
  if (stage.id === nextId) return "next";
  return isStageUnlocked(progress, stage.id) ? "open" : "locked";
}

function stageAfter(id: CampaignStageId): CampaignStage | null {
  const index = CAMPAIGN_STAGES.findIndex((stage) => stage.id === id);
  return CAMPAIGN_STAGES[index + 1] ?? null;
}

function StarRow({ stars, className = "campaign-stars" }: Readonly<{ stars: StageStars; className?: string }>) {
  return (
    <span aria-label={`${stars} of 3 stars`} className={className} role="img">
      {[1, 2, 3].map((slot) => (
        <span aria-hidden="true" className="campaign-star" data-earned={slot <= stars} key={slot}>
          ★
        </span>
      ))}
    </span>
  );
}

function StageMark({ state, stars }: Readonly<{ state: StageState; stars: StageStars }>) {
  if (state === "cleared") return <StarRow stars={stars} />;
  if (state === "next") return <span className="campaign-stage-mark">Next</span>;
  if (state === "locked") return <span className="campaign-stage-mark">Locked</span>;
  return null;
}

/** The Act 1 ladder plus a briefing for the selected stage. */
export function CampaignScreen({
  progress,
  onStart,
  onClose
}: Readonly<{
  progress: CampaignProgress;
  onStart: (stageId: CampaignStageId) => void;
  onClose: () => void;
}>) {
  const nextId = getNextStage(progress)?.id ?? null;
  const [selectedId, setSelectedId] = useState<CampaignStageId>(nextId ?? CAMPAIGN_STAGES[0].id);
  const stage = getCampaignStage(selectedId) ?? CAMPAIGN_STAGES[0];
  const opponent = getStageOpponents(stage)[0];
  const record = progress.stages[stage.id];
  const locked = !isStageUnlocked(progress, stage.id);
  const previous = getPreviousStage(stage.id);

  return (
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <section
        aria-labelledby="campaign-title"
        aria-modal="true"
        className="admin-dialog campaign-dialog"
        id="campaign"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-panel">
          <div className="admin-panel-header">
            <h3 id="campaign-title">Campaign</h3>
            <div className="admin-panel-header-actions">
              <span>Act 1: Circuit Ladder</span>
              <button aria-label="Close campaign" className="dialog-icon-button" onClick={onClose} type="button">
                Close
              </button>
            </div>
          </div>

          <div className="campaign-grid dialog-scroll-region">
            <ol aria-label="Act 1 stages" className="campaign-ladder">
              {CAMPAIGN_STAGES.map((candidate) => {
                const state = stageState(progress, candidate, nextId);
                const bot = getStageOpponents(candidate)[0];

                return (
                  <li data-state={state} key={candidate.id}>
                    <button
                      aria-pressed={candidate.id === stage.id}
                      className="campaign-stage-card"
                      data-state={state}
                      onClick={() => setSelectedId(candidate.id)}
                      type="button"
                    >
                      <span className="campaign-stage-number">{candidate.id}</span>
                      <FusebotPortrait character={bot.id} className="campaign-stage-portrait" />
                      <span className="campaign-stage-name">
                        <strong>{bot.name}</strong>
                        <small>{candidate.title}</small>
                      </span>
                      <StageMark stars={progress.stages[candidate.id]?.stars ?? 0} state={state} />
                    </button>
                  </li>
                );
              })}
            </ol>

            <section aria-label="Stage briefing" aria-live="polite" className="campaign-briefing">
              <div className="campaign-briefing-head">
                <FusebotPortrait character={opponent.id} className="campaign-briefing-portrait" />
                <div>
                  <p className="campaign-briefing-stage">Stage {stage.id}</p>
                  <h4>{opponent.name}</h4>
                  <p>{opponent.tagline}</p>
                </div>
              </div>

              <p className="campaign-brief">{stage.brief}</p>
              <p className="campaign-intel">
                <strong>Intel</strong> {opponent.quirk}
              </p>

              <div className="trait-grid campaign-facts">
                <div className="trait-pill">
                  <span>Board</span>
                  <strong>
                    {stage.arena.cols}×{stage.arena.rows}
                  </strong>
                </div>
                <div className="trait-pill">
                  <span>Format</span>
                  <strong>1v1</strong>
                </div>
                <div className="trait-pill">
                  <span>Par</span>
                  <strong>{formatClock(stage.parTimeMs)}</strong>
                </div>
                <div className="trait-pill">
                  <span>Best</span>
                  <strong>{record ? formatClock(record.bestTimeMs) : "None"}</strong>
                </div>
              </div>

              <div className="campaign-goals">
                <div className="campaign-goals-heading">
                  <span>Star goals</span>
                  <StarRow stars={record?.stars ?? 0} />
                </div>
                <ul>
                  <li>Win the round</li>
                  <li>Win in {formatClock(stage.parTimeMs)} or less</li>
                  <li>Break {stage.blockTarget} or more blocks</li>
                </ul>
              </div>

              {locked && previous ? (
                <p className="campaign-lock-note">Clear stage {previous.id} to unlock this stage.</p>
              ) : null}

              <button
                className="command-button campaign-start"
                disabled={locked}
                onClick={() => onStart(stage.id)}
                type="button"
              >
                {record ? "Replay stage" : "Start stage"}
              </button>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

export type CampaignRoundResult = RoundFacts & {
  stageId: CampaignStageId;
  /** Progress before this round was applied, to spot new unlocks. */
  progressBefore: CampaignProgress;
};

/** Shown after the KO/Down banner in campaign mode, in place of the generic results. */
export function CampaignResultPanel({
  result,
  onPlayStage,
  onOpenMap,
  onClose
}: Readonly<{
  result: CampaignRoundResult;
  onPlayStage: (stageId: CampaignStageId) => void;
  onOpenMap: () => void;
  onClose: () => void;
}>) {
  const stage = getCampaignStage(result.stageId) ?? CAMPAIGN_STAGES[0];
  const opponent = getStageOpponents(stage)[0];
  const stars = scoreStageResult(stage, result);
  const won = stars > 0;
  const progressAfter = applyStageResult(result.progressBefore, stage.id, result);
  const following = stageAfter(stage.id);
  const unlockedNow =
    following &&
    !isStageUnlocked(result.progressBefore, following.id) &&
    isStageUnlocked(progressAfter, following.id)
      ? following
      : null;
  const actCompleteNow =
    !following && won && !isStageCleared(result.progressBefore, stage.id);
  const nextToPlay = won && following && isStageUnlocked(progressAfter, following.id) ? following : null;
  const title = won ? `Stage ${stage.id} cleared` : result.winner === "draw" ? "Draw" : "Knocked out";
  const score = calculateRoundScore({ mode: "campaign", ...result });

  return (
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <section
        aria-labelledby="campaign-result-title"
        aria-modal="true"
        className="admin-dialog campaign-result"
        data-outcome={won ? "win" : "loss"}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-panel">
          <div className="campaign-result-head">
            <FusebotPortrait character={won ? "spark" : opponent.id} className="campaign-result-portrait" />
            <div>
              <p className="campaign-briefing-stage">
                Stage {stage.id}: {opponent.name}
              </p>
              <h3 id="campaign-result-title">{title}</h3>
            </div>
          </div>

          {won ? <StarRow className="campaign-stars campaign-result-stars" stars={stars} /> : null}

          <div className="trait-grid campaign-facts">
            <div className="trait-pill">
              <span>Time</span>
              <strong>{formatClock(result.durationMs)}</strong>
            </div>
            <div className="trait-pill">
              <span>Par</span>
              <strong>{formatClock(stage.parTimeMs)}</strong>
            </div>
            <div className="trait-pill">
              <span>Blocks</span>
              <strong>
                {result.blocksCleared}/{stage.blockTarget}
              </strong>
            </div>
            <div className="trait-pill">
              <span>Score</span>
              <strong>{score.toLocaleString()}</strong>
            </div>
          </div>

          {unlockedNow ? (
            <p className="campaign-callout">
              Stage {unlockedNow.id} unlocked: {getStageOpponents(unlockedNow)[0].name} is waiting.
            </p>
          ) : null}
          {actCompleteNow ? <p className="campaign-callout">Act 1 complete. Every Fusebot on the ladder is down.</p> : null}
          {!won ? (
            <p className="campaign-intel">
              <strong>Intel</strong> {opponent.quirk}
            </p>
          ) : null}

          <div className="campaign-result-actions">
            {nextToPlay ? (
              <button className="command-button" onClick={() => onPlayStage(nextToPlay.id)} type="button">
                Next stage
              </button>
            ) : null}
            <button
              className={`command-button${nextToPlay ? " secondary" : ""}`}
              onClick={() => onPlayStage(stage.id)}
              type="button"
            >
              Retry
            </button>
            <button className="command-button secondary" onClick={onOpenMap} type="button">
              Campaign map
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
