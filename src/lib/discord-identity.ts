import { createHash } from "node:crypto";

export function discordPlayerId(discordUserId: string): string {
  return `discord-${createHash("sha256")
    .update(`neon-fuse:discord:${discordUserId}`)
    .digest("hex")}`;
}

export function discordAvatarUrl(discordUserId: string, avatarHash?: string | null): string | undefined {
  if (!avatarHash) {
    return undefined;
  }

  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(discordUserId)}/${encodeURIComponent(avatarHash)}.png?size=128`;
}
