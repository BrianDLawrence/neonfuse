---
name: discord-launch-check
description: Audit Neon Fuse against Discord Activity and App Directory launch requirements before a submission, a release, or any change to auth, sessions, rate limits, the realtime server, legal pages, or user-visible shared content. Use when the user says "Discord review", "submit to Discord", "App Directory", "launch check", or "are we ready to ship".
---

# /discord-launch-check — Discord Activity launch readiness

Neon Fuse ships as both a website and an embedded Discord Activity. Discord's
iframe, proxy, and review process impose constraints that unit tests do not
catch. Walk this list, **cite `file:line` evidence for each item**, and report
✅ / ⚠️ / ❌ with a one-line reason. Do not mark an item ✅ without reading the code.

Read first: [docs/DISCORD_ACTIVITY.md](../../../docs/DISCORD_ACTIVITY.md),
[docs/MULTIPLAYER.md](../../../docs/MULTIPLAYER.md),
[AuthGate.tsx](../../../src/components/auth/AuthGate.tsx).

## 1. Runs inside Discord's sandbox

- **Every network request is same-origin** (routed through `<client-id>.discordsays.com`).
  Grep `src/` for `https://` and `wss://` in client code. External hosts must go
  through a URL mapping or a server route. Avatars must use `next/image`
  (`/_next/image`), not a raw `<img src="https://cdn.discordapp.com/…">`.
- **No cookies required inside the Activity.** Every authenticated client `fetch`
  must send `authenticatedHeaders(authToken)`. Grep `fetch(` in `src/components`.
- **No `X-Frame-Options: DENY` or `frame-ancestors` that exclude Discord** in
  `next.config.ts` headers or middleware.
- **Referenced static assets exist.** Every path in `src/audio/audioManifest.ts`
  (and any other `/…` asset URL) must exist under `public/`. Missing files cost a
  404 round-trip through Discord's proxy.

## 2. Identity and sessions

- The SDK's client-side identity is never trusted; the OAuth code is exchanged
  server-side (`src/app/api/activity/session/route.ts`).
- **Sessions survive a long hangout.** Activity sessions expire (≤1h in
  `src/lib/activity-session.ts`). Confirm the client renews them before expiry
  **without** re-running effects that tear down a live duel socket (`useDuelConnection`
  sends `leave` on cleanup, which forfeits).
- Instance membership is re-verified with the bot token before party or duel access.

## 3. Abuse controls behind the proxy

- Discord hides player IPs, so **per-IP limits are per-proxy-address**. Confirm
  bearer-authenticated routes are limited per session (`src/lib/rate-limit.ts`)
  and that pre-auth Discord-only routes have limits sized for shared addresses.
- The realtime server bounds payload size, command rate, connections, and rooms
  (`server/realtime.ts`, `server/rooms.ts`).

## 4. Content visible to other players (App Directory content policy, 13+)

- List every string one player can make visible to another: display names
  (from Discord, fine), leaderboard names, **custom music track titles**, and any
  future chat or naming feature. Each must be either Discord-sourced, gated to
  trusted publishers (for example `MUSIC_TRACK_ADMIN_DISCORD_IDS`), or moderated
  with a report path.
- No gambling-adjacent mechanics, paid randomness, or age-restricted content.

## 5. Legal and support surfaces

- `/privacy`, `/terms`, `/support` render without auth and are linked from the
  sign-in and error gates (`LegalLinks`).
- The privacy policy matches the code. Diff what `src/lib/player-data-deletion.ts`
  actually deletes or anonymizes against the policy's retention section, and list
  every collection written in `src/app/api/**` against the "Data we collect" section.
- `SUPPORT_EMAIL` and `DISCORD_SUPPORT_URL` are documented in `.env.example`, and
  the support server is a Community server.
- Self-service deletion works for **both** web and Activity sessions.

## 6. Configuration and operations

- `/api/health` reports `authentication` and `discordActivity` as `configured`
  and does not leak internal error strings.
- `render.yaml`: the free plan sleeps after 15 minutes idle, so the first friend
  match of the day waits about a minute. Flag it if the launch expects instant matches.
- Exactly one realtime replica (rooms and ticket nonces are in memory).

## 7. Gate

Run `/check`. Then list what still needs **manual verification inside Discord**
(two accounts, desktop and mobile): launch, party roster, invite dialog,
friend-match admission, reconnect after a network drop, a session longer than
the token lifetime, touch controls, and orientation.

## Output

A table of items with status and `file:line` evidence, then the top three
blockers in priority order. Don't fix anything unless the user asks. This skill
is an audit.
