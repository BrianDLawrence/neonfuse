import { WebSocket } from "ws";
import { expect, type Frame, type FrameLocator, type Page, type WebSocketRoute } from "@playwright/test";
import type { RoomSnapshot, ServerMessage } from "@/game/multiplayer/protocol";
import type { DiscordPartyMember, DiscordPartyRoster } from "@/lib/player-profile-types";
import { signJoinTicket } from "@/lib/multiplayer-ticket";
import {
  APP_PORT,
  DISCORD_HOST_ORIGIN,
  E2E_DISCORD_CLIENT_ID,
  E2E_MULTIPLAYER_SECRET,
  E2E_MULTIPLAYER_URL
} from "./environment";

/**
 * A synthetic Discord account. The IDs exist only in the fake Discord host and in
 * signed test tickets; the app must never render them.
 */
export type FakeDiscordUser = {
  discordUserId: string;
  username: string;
  displayName: string;
  playerId: string;
};

export function fakeUser(name: string, seed: number): FakeDiscordUser {
  return {
    discordUserId: `90000000000000${String(seed).padStart(4, "0")}`,
    username: name.toLowerCase().replace(/\W+/g, "-"),
    displayName: name,
    playerId: `e2e-player-${seed}`
  };
}

/** Each test gets its own Activity instance, so its realtime room is never shared. */
export function uniqueInstanceId(label: string) {
  return `e2e-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function partyMember(user: FakeDiscordUser, overrides: Partial<DiscordPartyMember> = {}): DiscordPartyMember {
  return {
    displayName: user.displayName,
    avatarUrl: null,
    title: "Fuse Initiate",
    level: 1,
    duel: { played: 0, wins: 0, losses: 0, draws: 0 },
    isCurrentPlayer: false,
    profileReady: true,
    ...overrides
  };
}

type HostOptions = {
  instanceId: string;
  user: FakeDiscordUser;
  participants: FakeDiscordUser[];
  inviteFails?: boolean;
};

declare global {
  interface Window {
    __discordHost?: {
      commands: string[];
      inviteCalls: number;
      setParticipants: (users: FakeDiscordUser[]) => void;
    };
    __duelLog?: Record<"chip" | "banner" | "countdown" | "title", string[]>;
  }
}

/**
 * Stands in for the Discord client around the Activity iframe. The Embedded App
 * SDK only trusts RPC messages from its allowlisted origins, so this page is served
 * at one of them and answers the handshake and the few commands the app sends.
 */
function hostPage({ instanceId, user, participants, inviteFails }: HostOptions) {
  const appUrl = new URL(`http://localhost:${APP_PORT}/`);
  appUrl.search = new URLSearchParams({ frame_id: "e2e-frame", instance_id: instanceId, platform: "desktop" }).toString();
  const config = JSON.stringify({ appUrl: appUrl.toString(), clientId: E2E_DISCORD_CLIENT_ID, user, participants, inviteFails: Boolean(inviteFails) });

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Discord</title>
<style>html, body { margin: 0; height: 100%; background: #111; } iframe { border: 0; width: 100%; height: 100%; display: block; }</style>
</head><body>
<script type="application/json" id="config">${config.replace(/</g, "\\u003c")}</script>
<script>
  const config = JSON.parse(document.getElementById("config").textContent);
  const frame = document.createElement("iframe");
  frame.title = "Neon Fuse Activity";
  frame.src = config.appUrl;
  const appOrigin = new URL(config.appUrl).origin;
  const participant = (user) => ({ id: user.discordUserId, username: user.username, global_name: user.displayName,
    discriminator: "0", avatar: null, flags: 0, bot: false });
  const send = (payload) => frame.contentWindow.postMessage([1, payload], appOrigin);
  const host = window.__discordHost = {
    commands: [],
    inviteCalls: 0,
    setParticipants(users) {
      config.participants = users;
      send({ cmd: "DISPATCH", evt: "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", nonce: null,
        data: { participants: users.map(participant) } });
    }
  };
  let codes = 0;
  window.addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow || !Array.isArray(event.data)) return;
    const [opcode, payload] = event.data;
    if (opcode === 0) {
      send({ cmd: "DISPATCH", evt: "READY", nonce: null,
        data: { v: 1, config: { api_endpoint: "//discord.com/api", environment: "production" } } });
      return;
    }
    if (opcode !== 1) return;
    const { cmd, nonce } = payload;
    host.commands.push(cmd);
    const reply = (data) => send({ cmd, nonce, evt: null, data });
    switch (cmd) {
      case "AUTHORIZE":
        return reply({ code: "e2e-code-" + ++codes });
      case "AUTHENTICATE":
        return reply({
          access_token: "e2e-discord-access-token",
          user: { username: config.user.username, discriminator: "0", id: config.user.discordUserId, avatar: null,
            public_flags: 0, global_name: config.user.displayName },
          scopes: ["identify"],
          expires: new Date(Date.now() + 3600000).toISOString(),
          application: { description: "", id: config.clientId, name: "Neon Fuse" }
        });
      case "GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS":
        return reply({ participants: config.participants.map(participant) });
      case "SUBSCRIBE":
      case "UNSUBSCRIBE":
        return reply({ evt: payload.evt });
      case "OPEN_INVITE_DIALOG":
        host.inviteCalls += 1;
        if (config.inviteFails) {
          return send({ cmd, nonce, evt: "ERROR", data: { code: 4000, message: "Invites are disabled here" } });
        }
        return reply(null);
      default:
        return reply(null);
    }
  });
  document.body.append(frame);
</script>
</body></html>`;
}

/**
 * Records the duel HUD's transitions in the Activity frame. The countdown, the
 * reconnect banners and a reconnect itself last a second or so, which a poll can
 * miss on a loaded machine; the log keeps them in order.
 */
function recordDuelTransitions() {
  const log: NonNullable<Window["__duelLog"]> = { chip: [], banner: [], countdown: [], title: [] };
  window.__duelLog = log;
  const selectors = {
    chip: ".duel-header .hud-chip strong",
    banner: ".duel-connection-banner",
    countdown: ".duel-countdown",
    title: "#duel-title"
  } as const;
  const observer = new MutationObserver(() => {
    for (const [kind, selector] of Object.entries(selectors) as [keyof typeof selectors, string][]) {
      const text = document.querySelector(selector)?.textContent ?? "";
      const entries = log[kind];
      if (text && text !== entries[entries.length - 1]) entries.push(text);
    }
  });
  document.addEventListener("DOMContentLoaded", () =>
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  );
}

export type ActivityOptions = {
  instanceId: string;
  user: FakeDiscordUser;
  /** Everyone Discord reports in the instance, the signed-in user included. */
  participants?: FakeDiscordUser[];
  /** The roster `/api/social/party` returns; a 503 when null. */
  roster?: DiscordPartyRoster | null;
  inviteFails?: boolean;
  /** Makes `/api/activity/session` answer 503 with this error. */
  sessionError?: string;
  /** Treats the first Activity session as expired when a join ticket is requested. */
  expireFirstSession?: boolean;
  /**
   * Relays server messages through the test so `serverStates` and `onNextCountdown`
   * work. Each relayed message is a Playwright call, so only tests that need it opt in.
   */
  observeServer?: boolean;
};

/** What the realtime server told this client, recorded at the proxy: one entry per change. */
export type ServerState = {
  phase: string;
  seat: number;
  ready: (boolean | null)[];
  connected: (boolean | null)[];
};

export type ActivityClient = {
  page: Page;
  app: FrameLocator;
  frame: () => Frame;
  /** Every bearer session issued, oldest first; a renewal adds one. */
  sessionTokens: string[];
  sessionRequests: { code: string; instanceId: string }[];
  partyRequests: string[];
  ticketRequests: () => number;
  sockets: () => number;
  /** Severs the newest realtime socket, as a network drop would. */
  dropSocket: () => Promise<void>;
  /** With `observeServer`: runs once, right after the server first reports a countdown. */
  onNextCountdown: (callback: () => Promise<void> | void) => void;
  /** With `observeServer`: what the server sent this client, one entry per change. */
  serverStates: () => ServerState[];
  /** Closes every realtime socket, so a relaying proxy stops before the context closes. */
  closeSockets: () => Promise<void>;
  setRoster: (roster: DiscordPartyRoster | null) => void;
  host: () => Promise<{ commands: string[]; inviteCalls: number }>;
  setParticipants: (users: FakeDiscordUser[]) => Promise<void>;
  duelLog: () => Promise<NonNullable<Window["__duelLog"]>>;
};

/**
 * Launches the app as a Discord Activity for `user`. No production auth path is
 * bypassed: the browser-facing APIs that need Discord or MongoDB are answered
 * here, and join tickets are signed with the isolated test server's own secret.
 */
export async function openActivity(page: Page, options: ActivityOptions): Promise<ActivityClient> {
  const { instanceId, user } = options;
  const participants = options.participants ?? [user];
  const sessionTokens: string[] = [];
  const sessionRequests: ActivityClient["sessionRequests"] = [];
  const partyRequests: string[] = [];
  let roster = options.roster === undefined
    ? { connectedCount: participants.length, members: participants.map((member) => partyMember(member, { isCurrentPlayer: member === user })) }
    : options.roster;
  let tickets = 0;
  const sockets: WebSocketRoute[] = [];
  let countdownCallback: (() => Promise<void> | void) | null = null;
  const serverStates: ServerState[] = [];

  // The host page is served by the test, so Chrome's Local Network Access checks would
  // otherwise block it from framing the app on localhost.
  await page.context().grantPermissions(["local-network-access"], { origin: DISCORD_HOST_ORIGIN });
  await page.route(`${DISCORD_HOST_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: "text/html", body: hostPage({ instanceId, user, participants, inviteFails: options.inviteFails }) })
  );
  await page.route("**/api/activity/session", async (route) => {
    sessionRequests.push(route.request().postDataJSON() as { code: string; instanceId: string });
    if (options.sessionError) {
      await route.fulfill({ status: 503, json: { error: options.sessionError } });
      return;
    }
    const sessionToken = `e2e-activity-session-${user.playerId}-${sessionRequests.length}-${"x".repeat(16)}`;
    sessionTokens.push(sessionToken);
    await route.fulfill({
      json: { accessToken: "e2e-discord-access-token", sessionToken, expiresIn: 3600, player: { displayName: user.displayName, avatarUrl: null } }
    });
  });
  await page.route("**/api/social/party", async (route) => {
    partyRequests.push(route.request().headers().authorization ?? "");
    await route.fulfill(
      roster ? { json: { ok: true, roster } } : { status: 503, json: { ok: false, error: "Discord party is temporarily unavailable" } }
    );
  });
  await page.route("**/api/multiplayer/ticket", async (route) => {
    // Like the real route, a ticket needs a live Activity bearer session.
    const token = /^Bearer (.+)$/.exec(route.request().headers().authorization ?? "")?.[1];
    const expired = options.expireFirstSession && token === sessionTokens[0];
    if (!token || !sessionTokens.includes(token) || expired) {
      await route.fulfill({ status: 401, json: { error: "Open Neon Fuse inside Discord to play with a friend." } });
      return;
    }
    tickets += 1;
    await route.fulfill({
      json: { ticket: signJoinTicket({ playerId: user.playerId, name: user.displayName, roomId: instanceId }, E2E_MULTIPLAYER_SECRET, Date.now()) }
    });
  });
  // A pass-through proxy to the real test server, so a test can sever one socket.
  await page.routeWebSocket(E2E_MULTIPLAYER_URL, (socket) => {
    sockets.push(socket);
    const server = socket.connectToServer();
    if (!options.observeServer) return;
    server.onMessage((message) => {
      socket.send(message);
      const parsed = JSON.parse(String(message)) as ServerMessage;
      if (parsed.type !== "state") return;
      const state: ServerState = {
        phase: parsed.phase,
        seat: parsed.seat,
        ready: parsed.players.map((player) => player?.ready ?? null),
        connected: parsed.players.map((player) => player?.connected ?? null)
      };
      if (JSON.stringify(state) !== JSON.stringify(serverStates[serverStates.length - 1])) serverStates.push(state);
      if (countdownCallback && parsed.phase === "countdown") {
        const callback = countdownCallback;
        countdownCallback = null;
        void callback();
      }
    });
  });
  await page.addInitScript(recordDuelTransitions);

  await page.goto(`${DISCORD_HOST_ORIGIN}/`);
  const app = page.frameLocator("iframe[title='Neon Fuse Activity']");
  const frame = () => {
    const found = page.frames().find((candidate) => candidate.url().startsWith(`http://localhost:${APP_PORT}/`));
    if (!found) throw new Error("The Activity frame has not loaded");
    return found;
  };

  const client: ActivityClient = {
    page,
    app,
    frame,
    sessionTokens,
    sessionRequests,
    partyRequests,
    ticketRequests: () => tickets,
    sockets: () => sockets.length,
    dropSocket: async () => {
      await sockets[sockets.length - 1]?.close({ code: 4000, reason: "Network dropped" });
    },
    onNextCountdown: (callback) => { countdownCallback = callback; },
    serverStates: () => [...serverStates],
    closeSockets: async () => {
      await Promise.all(sockets.map((socket) => socket.close({ code: 1000, reason: "Test finished" })));
    },
    setRoster: (next) => { roster = next; },
    host: () => page.evaluate(() => ({ commands: [...(window.__discordHost?.commands ?? [])], inviteCalls: window.__discordHost?.inviteCalls ?? 0 })),
    setParticipants: (users) => page.evaluate((next) => window.__discordHost?.setParticipants(next), users),
    duelLog: () => frame().evaluate(() => window.__duelLog ?? { chip: [], banner: [], countdown: [], title: [] })
  };
  openClients.add(client);
  return client;
}

/**
 * Joins `user`'s room straight from the test, the way a second device would reach the
 * realtime server after the ticket route: with a fresh ticket for the same player.
 */
export async function joinFromAnotherDevice(instanceId: string, user: FakeDiscordUser) {
  const socket = new WebSocket(E2E_MULTIPLAYER_URL);
  const closed = new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); });
  const joined = new Promise<RoomSnapshot>((resolve) =>
    socket.once("message", (raw) => resolve(JSON.parse(raw.toString()) as RoomSnapshot))
  );
  socket.send(JSON.stringify({
    type: "join",
    ticket: signJoinTicket({ playerId: user.playerId, name: user.displayName, roomId: instanceId }, E2E_MULTIPLAYER_SECRET, Date.now())
  }));
  return { joined: await joined, closed };
}

const openClients = new Set<ActivityClient>();

/**
 * Ends every Activity client opened in this test: closes its realtime sockets, then
 * unloads its page so the Phaser game is torn down before the context closes.
 * Closing a context while a software-rendered game runs can stall teardown.
 */
export async function closeActivities() {
  const clients = [...openClients];
  openClients.clear();
  await Promise.all(clients.map(async (client) => {
    await client.closeSockets();
    await client.page.goto("about:blank").catch(() => undefined);
  }));
}

/** The arena canvas inside the Activity frame, which proves the shell finished booting. */
export async function expectShell(client: ActivityClient) {
  await expect(client.app.getByRole("region", { name: "Neon Fuse arena" }).locator("canvas")).toBeVisible({ timeout: 15_000 });
}
