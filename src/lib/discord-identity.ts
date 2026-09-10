import { createHash } from "node:crypto";

export function discordPlayerId(discordUserId: string): string {
  return `discord-${createHash("sha256")
    .update(`neon-fuse:discord:${discordUserId}`)
    .digest("hex")}`;
}
