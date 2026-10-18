"use client";

import { useState } from "react";
import { FusebotPortrait } from "./FusebotPortrait";
import { BOT_PROFILE_ORDER, BOT_PROFILES, type BotProfileId } from "@/game/simulation/bots";
import type { CampaignProgress } from "@/game/simulation/campaign";
import {
  OVERCLOCK_UNLOCK_STAGE,
  VERSUS_OVERCLOCK,
  isOverclockUnlocked,
  resolveVersusOpponent
} from "@/game/simulation/versus";

const OVERCLOCK_SUMMARY = (() => {
  const { modifiers, bot } = VERSUS_OVERCLOCK;
  const pace = Math.round((1 / (modifiers.botMoveScale ?? 1) - 1) * 100);
  return `Starts with ${bot.startingLoadout?.bombs ?? 1} bombs, ${((modifiers.botFuseMs ?? 1800) / 1000).toFixed(1)}s fuse, moves ${pace}% faster.`;
})();

/** Pick any bot and fight it. Overclocked variants unlock from the campaign. */
export function VersusScreen({
  initialOpponent,
  initialOverclocked,
  progress,
  onFight,
  onClose
}: Readonly<{
  initialOpponent: BotProfileId;
  initialOverclocked: boolean;
  progress: CampaignProgress;
  onFight: (profileId: BotProfileId, overclocked: boolean) => void;
  onClose: () => void;
}>) {
  const [selectedId, setSelectedId] = useState<BotProfileId>(initialOpponent);
  const [overclockArmed, setOverclockArmed] = useState(initialOverclocked);
  const unlocked = isOverclockUnlocked(progress, selectedId);
  const overclocked = overclockArmed && unlocked;
  const opponent = resolveVersusOpponent(selectedId, overclocked);
  const base = BOT_PROFILES[selectedId];

  return (
    <div className="admin-dialog-backdrop" onClick={onClose}>
      <section
        aria-labelledby="versus-title"
        aria-modal="true"
        className="admin-dialog bot-lab-dialog versus-dialog"
        id="versus"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="admin-panel">
          <div className="admin-panel-header">
            <h3 id="versus-title">Versus</h3>
            <div className="admin-panel-header-actions">
              <span>Pick your opponent</span>
              <button aria-label="Close Versus" className="dialog-icon-button" onClick={onClose} type="button">
                Close
              </button>
            </div>
          </div>

          <div className="bot-lab-grid dialog-scroll-region">
            <div aria-label="Opponents" className="versus-roster" role="group">
              {BOT_PROFILE_ORDER.map((profileId) => {
                const profile = BOT_PROFILES[profileId];
                const ready = isOverclockUnlocked(progress, profileId);

                return (
                  <button
                    aria-pressed={profileId === selectedId}
                    className="bot-roster-button versus-card"
                    key={profileId}
                    onClick={() => setSelectedId(profileId)}
                    type="button"
                  >
                    <FusebotPortrait character={profileId} className="bot-profile-icon versus-card-portrait" />
                    <span>
                      <strong>{profile.name}</strong>
                      <small>{profile.tagline}</small>
                      {ready ? <em className="versus-oc-badge">Overclock ready</em> : null}
                    </span>
                  </button>
                );
              })}
            </div>

            <section aria-live="polite" className="bot-detail-panel versus-detail" data-overclocked={overclocked}>
              <div className="bot-detail-title">
                <FusebotPortrait character={selectedId} className="bot-profile-icon bot-profile-icon-large" />
                <div>
                  <h4>{base.name}</h4>
                  <p>{overclocked ? "Overclocked" : base.tagline}</p>
                </div>
              </div>
              <p className="bot-summary">{base.summary}</p>
              <div className="bot-strengths">
                {base.strengths.map((strength) => (
                  <span key={strength}>{strength}</span>
                ))}
              </div>
              <div className="trait-grid" aria-label={`${base.name} traits`}>
                {Object.entries(opponent.profile.traits).map(([trait, value]) => (
                  <div className="trait-pill" key={trait}>
                    <span>{trait.replace(/([A-Z])/g, " $1")}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="campaign-intel">
                <strong>Intel</strong> {base.quirk}
              </p>

              <button
                aria-pressed={overclocked}
                className="versus-overclock"
                disabled={!unlocked}
                onClick={() => setOverclockArmed((armed) => !armed)}
                type="button"
              >
                <span className="versus-overclock-switch" aria-hidden="true" />
                <span>
                  <strong>Overclocked</strong>
                  <small>
                    {unlocked
                      ? OVERCLOCK_SUMMARY
                      : `Clear campaign stage ${OVERCLOCK_UNLOCK_STAGE[selectedId]} to unlock.`}
                  </small>
                </span>
              </button>

              <button
                className="command-button versus-fight"
                onClick={() => onFight(selectedId, overclocked)}
                type="button"
              >
                Fight {base.name}
              </button>
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
