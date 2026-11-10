import type { ArenaGrid, GridPoint } from "./arena";
import { getDangerTiles, type BombThreat } from "./danger";
import { hasPerk, type PlayerLoadout } from "./powerups";

export type BlastZoneViewer = {
  /** The watching fighter's loadout, or null for a spectator with no fighter on the board. */
  viewer: Partial<Pick<PlayerLoadout, "vision">> | null;
  /** The player's "Show blast zones" accessibility setting. */
  alwaysShow?: boolean;
};

/**
 * Whether the blast-zone overlay is drawn for this viewer. Blast zones are hidden by
 * default; the Vision perk shows them. Spectators and players who turn on the setting
 * always see them. Presentation only: bots read danger directly and never see this.
 */
export function canSeeBlastZones({ viewer, alwaysShow = false }: BlastZoneViewer): boolean {
  return alwaysShow || viewer === null || hasPerk(viewer, "vision");
}

/** The danger tiles to draw: every bomb's blast zone when the viewer can see them, else none. */
export function visibleDangerTiles({
  arena,
  bombs,
  ...viewer
}: BlastZoneViewer & { arena: ArenaGrid; bombs: BombThreat[] }): GridPoint[] {
  return canSeeBlastZones(viewer) ? getDangerTiles(arena, bombs) : [];
}
