"use client";

import { useEffect, useRef, useState } from "react";
import { FusebotPortrait } from "./FusebotPortrait";
import type { ArenaPresetId } from "@/game/simulation/arena";
import {
  CAMPAIGN_ACTS,
  CAMPAIGN_STAGES,
  applyStageResult,
  getActStages,
  getCampaignStage,
  getNextStage,
  getPreviousStage,
  getStageOpponents,
  isActUnlocked,
  isStageCleared,
  isStageUnlocked,
  resolveStageBot,
  resolveStageModifiers,
  scoreStageResult,
  type CampaignActId,
  type CampaignProgress,
  type CampaignStage,
  type CampaignStageId,
  type RoundFacts,
  type StageStars
} from "@/game/simulation/campaign";
import { createInitialLoadout } from "@/game/simulation/powerups";
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

const PRESET_LABELS: Record<ArenaPresetId, string> = {
  standard: "Standard",
  "open-core": "Open Core",
  maze: "Maze"
};

/** "Fuse Rush", or "Fuse Rush + Circuit Shade" for a gauntlet. */
export function stageOpponentLabel(stage: CampaignStage) {
  return getStageOpponents(stage)
    .map((bot) => bot.name)
    .join(" + ");
}

function actTitle(act: CampaignActId) {
  const entry = CAMPAIGN_ACTS.find((candidate) => candidate.id === act);
  return entry ? `Act ${act}: ${entry.title}` : `Act ${act}`;
}

/** Board, format, par and best, then whatever the stage changes from a normal round. */
function stageFacts(stage: CampaignStage, bestTimeMs: number | null): Array<{ label: string; value: string }> {
  const modifiers = resolveStageModifiers(stage);
  const initial = createInitialLoadout();
  const tuned = stage.bots.map((spec) => resolveStageBot(spec).loadout);
  const facts = [
    { label: "Board", value: `${stage.arena.cols}×${stage.arena.rows}` },
    { label: "Format", value: `1v${stage.bots.length}` },
    { label: "Par", value: formatClock(stage.parTimeMs) },
    { label: "Best", value: bestTimeMs === null ? "None" : formatClock(bestTimeMs) }
  ];

  if (stage.arena.preset !== "standard") {
    facts.push({ label: "Layout", value: PRESET_LABELS[stage.arena.preset] });
  }

  const botBombs = Math.max(...tuned.map((loadout) => loadout.bombs));
  const botBlast = Math.max(...tuned.map((loadout) => loadout.blast));

  if (botBombs > initial.bombs) facts.push({ label: "Bot bombs", value: String(botBombs) });
  if (botBlast > initial.blast) facts.push({ label: "Bot blast", value: String(botBlast) });
  if (stage.modifiers.botFuseMs !== undefined) {
    facts.push({ label: "Bot fuse", value: `${(modifiers.botFuseMs / 1000).toFixed(1)}s` });
  }
  if (modifiers.botMoveScale < 1) {
    facts.push({ label: "Bot pace", value: `+${Math.round((1 / modifiers.botMoveScale - 1) * 100)}%` });
  }
  if (modifiers.powerupDropRates) {
    const rates = modifiers.powerupDropRates;
    const top = (Object.keys(rates) as Array<keyof typeof rates>).sort((a, b) => rates[b] - rates[a])[0];
    facts.push({ label: "Drops", value: `Mostly ${top[0].toUpperCase()}${top.slice(1)}` });
  }

  return facts;
}

function StagePortraits({ stage, className }: Readonly<{ stage: CampaignStage; className: string }>) {
  return (
    <span className="campaign-portraits" data-count={stage.bots.length}>
      {getStageOpponents(stage).map((bot) => (
        <FusebotPortrait character={bot.id} className={className} key={bot.id} />
      ))}
    </span>
  );
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

/** Act tabs, the selected act's ladder, and a briefing for the selected stage. */
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
  const ladderRef = useRef<HTMLOListElement>(null);
  const stage = getCampaignStage(selectedId) ?? CAMPAIGN_STAGES[0];
  const opponents = getStageOpponents(stage);
  const gauntlet = opponents.length > 1;
  const record = progress.stages[stage.id];
  const locked = !isStageUnlocked(progress, stage.id);
  const previous = getPreviousStage(stage.id);
  // On phones the ladder is a horizontal strip; keep the selected card in view.
  useEffect(() => {
    ladderRef.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedId]);

  const selectAct = (act: CampaignActId) => {
    const stages = getActStages(act);
    const next = stages.find((candidate) => candidate.id === nextId);
    setSelectedId((next ?? stages[0]).id);
  };

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
              <span>{actTitle(stage.act)}</span>
              <button aria-label="Close campaign" className="dialog-icon-button" onClick={onClose} type="button">
                Close
              </button>
            </div>
          </div>

          <div aria-label="Acts" className="campaign-acts" role="group">
            {CAMPAIGN_ACTS.map((act) => {
              const actLocked = !isActUnlocked(progress, act.id);

              return (
                <button
                  aria-pressed={act.id === stage.act}
                  className="campaign-act-tab"
                  data-locked={actLocked}
                  key={act.id}
                  onClick={() => selectAct(act.id)}
                  type="button"
                >
                  <strong>Act {act.id}</strong>
                  <small>{actLocked ? "Locked" : act.title}</small>
                </button>
              );
            })}
          </div>

          <div className="campaign-grid dialog-scroll-region">
            <ol aria-label={`Act ${stage.act} stages`} className="campaign-ladder" ref={ladderRef}>
              {getActStages(stage.act).map((candidate) => {
                const state = stageState(progress, candidate, nextId);
                const candidateGauntlet = candidate.bots.length > 1;

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
                      <StagePortraits className="campaign-stage-portrait" stage={candidate} />
                      <span className="campaign-stage-name">
                        <strong>{candidateGauntlet ? candidate.title : stageOpponentLabel(candidate)}</strong>
                        <small>{candidateGauntlet ? stageOpponentLabel(candidate) : candidate.title}</small>
                      </span>
                      <StageMark stars={progress.stages[candidate.id]?.stars ?? 0} state={state} />
                    </button>
                  </li>
                );
              })}
            </ol>

            <section aria-label="Stage briefing" aria-live="polite" className="campaign-briefing">
              <div className="campaign-briefing-head">
                <StagePortraits className="campaign-briefing-portrait" stage={stage} />
                <div>
                  <p className="campaign-briefing-stage">
                    Stage {stage.id}: {stage.title}
                  </p>
                  <h4>{stageOpponentLabel(stage)}</h4>
                  <p>{gauntlet ? "Two bots at once. Last one standing wins." : opponents[0].tagline}</p>
                </div>
              </div>

              <p className="campaign-brief">{stage.brief}</p>
              {opponents.map((bot) => (
                <p className="campaign-intel" key={bot.id}>
                  <strong>Intel</strong> {gauntlet ? `${bot.name}: ` : ""}
                  {bot.quirk}
                </p>
              ))}

              <div className="trait-grid campaign-facts">
                {stageFacts(stage, record?.bestTimeMs ?? null).map((fact) => (
                  <div className="trait-pill" key={fact.label}>
                    <span>{fact.label}</span>
                    <strong>{fact.value}</strong>
                  </div>
                ))}
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
                <p className="campaign-lock-note">
                  {previous.act !== stage.act
                    ? `Clear Act ${previous.act} (finish stage ${previous.id}) to unlock ${actTitle(stage.act)}.`
                    : `Clear stage ${previous.id} to unlock this stage.`}
                </p>
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
    won && !isStageCleared(result.progressBefore, stage.id) && (!following || following.act !== stage.act);
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
                Stage {stage.id}: {stageOpponentLabel(stage)}
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

          {actCompleteNow ? (
            <p className="campaign-callout">
              {actTitle(stage.act)} complete.
              {unlockedNow ? ` ${actTitle(unlockedNow.act)} is open.` : " That's the whole campaign for now."}
            </p>
          ) : unlockedNow ? (
            <p className="campaign-callout">
              Stage {unlockedNow.id} unlocked: {stageOpponentLabel(unlockedNow)} {unlockedNow.bots.length > 1 ? "are" : "is"}{" "}
              waiting.
            </p>
          ) : null}
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
