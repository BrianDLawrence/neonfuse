import type { PlayerIdentity } from "@/lib/player-identity";

// Custom tracks are shown to every player, so only the Discord accounts named in
// MUSIC_TRACK_EDITOR_DISCORD_IDS (comma-separated user IDs) may add one. With the
// variable unset nobody can, which is the production default.
export function isMusicTrackEditor(
  player: Pick<PlayerIdentity, "discordUserId">,
  allowlist: string | undefined = process.env.MUSIC_TRACK_EDITOR_DISCORD_IDS
): boolean {
  if (!player.discordUserId || !allowlist) {
    return false;
  }

  return allowlist
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(player.discordUserId);
}
