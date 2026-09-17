import { z } from "zod";
import type { ActivitySessionIdentity } from "@/lib/activity-session";

const instanceSchema = z.object({
  application_id: z.string().min(1),
  instance_id: z.string().min(1),
  users: z.array(z.string().min(1)).max(100)
});

export type VerifiedDiscordActivityInstance =
  | { ok: true; discordUserIds: string[] }
  | { ok: false; status: 403 | 429 | 503; error: string };

export async function verifyDiscordActivityInstance(
  identity: ActivitySessionIdentity
): Promise<VerifiedDiscordActivityInstance> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!botToken || !clientId) {
    return { ok: false, status: 503, error: "Discord party features are not configured yet." };
  }

  const response = await fetch(
    `https://discord.com/api/v10/applications/${encodeURIComponent(clientId)}/activity-instances/${encodeURIComponent(identity.instanceId)}`,
    {
      headers: { Authorization: `Bot ${botToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000)
    }
  );

  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 429 ? 429 : 403,
      error: "Unable to verify this Discord party. Please try again."
    };
  }

  const parsed = instanceSchema.safeParse(await response.json().catch(() => null));

  if (
    !parsed.success ||
    parsed.data.application_id !== clientId ||
    parsed.data.instance_id !== identity.instanceId ||
    !parsed.data.users.includes(identity.discordUserId)
  ) {
    return {
      ok: false,
      status: 403,
      error: "Join the same Discord Activity as your party first."
    };
  }

  return { ok: true, discordUserIds: Array.from(new Set(parsed.data.users)) };
}
