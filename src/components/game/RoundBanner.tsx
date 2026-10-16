"use client";

import type { FusebotId } from "@/game/presentation/fusebotArt";
import { BOT_PROFILE_ORDER, BOT_PROFILES, type BotProfile } from "@/game/simulation/bots";
import { FusebotPortrait } from "./FusebotPortrait";

type BannerKind = "count" | "go" | "win" | "lose" | "draw";

type Banner = {
  kind: BannerKind;
  title: string;
  caption?: string;
  character?: FusebotId;
};

/**
 * Maps the round status the arena already reports (GameEvents.onRoundStatusChange)
 * to a full-width banner. Statuses with no big moment ("Live", "Blast", ...) show none.
 */
function bannerFor(status: string, opponent: BotProfile): Banner | null {
  if (/^[123]$/.test(status)) {
    return { kind: "count", title: status, caption: "Get ready" };
  }

  if (status === "Fuse!") {
    return { kind: "go", title: "Fuse!" };
  }

  if (status === "Win") {
    return { kind: "win", title: "KO!", caption: `You beat ${opponent.name}`, character: "spark" };
  }

  if (status === "Down") {
    return {
      kind: "lose",
      title: "Knocked out",
      caption: `${opponent.name} takes the round`,
      character: opponent.id
    };
  }

  if (status === "Draw") {
    return { kind: "draw", title: "Draw", caption: "Nobody walked away" };
  }

  if (status.endsWith(" Wins")) {
    const name = status.slice(0, -" Wins".length);
    const winner = BOT_PROFILE_ORDER.map((id) => BOT_PROFILES[id]).find((profile) => profile.name === name);
    return { kind: "win", title: "KO!", caption: `${name} wins the skirmish`, character: winner?.id };
  }

  return null;
}

/** Countdown and knockout callouts layered over the arena, under any open dialog. */
export function RoundBanner({ status, opponent }: Readonly<{ status: string; opponent: BotProfile }>) {
  const banner = bannerFor(status, opponent);

  return (
    <div aria-live="polite" className="round-banner-region" role="status">
      {banner ? (
        <div className="round-banner" data-kind={banner.kind} key={status}>
          {banner.character ? (
            <FusebotPortrait character={banner.character} className="round-banner-portrait" />
          ) : null}
          <strong className="round-banner-title">{banner.title}</strong>
          {banner.caption ? <span className="round-banner-caption">{banner.caption}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
