# Production operations

This runbook covers the initial Discord App Directory release topology: one
Next.js deployment and exactly one persistent realtime process. It defines the
checks and limits that can be enforced in code while room ownership remains
process-local.

## Health contracts

Monitor both public endpoints:

- `https://<app-host>/api/health` checks MongoDB connectivity, Better Auth,
  Discord Activity configuration, and multiplayer admission configuration. It
  returns `200` only when every check is ready and never returns driver errors or
  secret values.
- `https://<realtime-host>/health` reports persistence state and aggregate room,
  connection, and queued-result counts. It returns `503` while draining or when
  configured persistence becomes unavailable. A service intentionally started
  without MongoDB returns `200` with `status: "degraded"` until persistence is
  configured.

Both responses set `Cache-Control: no-store`. Neither response includes player,
room, Discord, database, or credential identifiers.

## Scheduled uptime check

`.github/workflows/uptime.yml` checks both endpoints four times per hour, retries
transient failures three times, and fails the workflow when either service is
unhealthy.

Before merging the workflow to the default branch, create these GitHub Actions
repository variables:

| Variable | Value |
| --- | --- |
| `APP_HEALTH_URL` | `https://<app-host>/api/health` |
| `REALTIME_HEALTH_URL` | `https://<realtime-host>/health` |

Run **Production uptime** manually once after setting the variables. In GitHub
notification settings, enable Actions notifications and select failed workflows
only. Scheduled Actions can be delayed, so use a dedicated external uptime
provider later if the game needs a contractual response time.

The same probe can run locally or from another scheduler:

```bash
APP_HEALTH_URL=https://<app-host>/api/health \
REALTIME_HEALTH_URL=https://<realtime-host>/health \
npm run healthcheck:production
```

## Sanitized error monitoring

Next.js `onRequestError` and known failure boundaries emit single-line JSON
events. The realtime process uses the same event format for startup and result
persistence failures. Vercel and Render can retain or drain these events without
receiving raw error messages, stacks, request headers, tokens, database URLs, or
player/room identifiers.

Alert on these event names:

- `request.unhandled-error`
- `activity.session.failed`
- `account.deletion.failed`
- `social.party.failed`
- `multiplayer.ticket.failed`
- `health.database.failed`
- `server.startup.failed`
- `result.persistence.failed`

Treat `server.startup.failed` and sustained `result.persistence.failed` events as
release-blocking. A `persistence.disabled` warning is expected only in local or
explicitly unranked environments.

## Initial realtime capacity

The launch configuration is deliberately bounded to one process:

- `MAX_REALTIME_CONNECTIONS=200`
- `MAX_REALTIME_ROOMS=100`
- two seats per room
- 40 client messages per second per connection
- 8 KiB maximum WebSocket payload

These are safety ceilings, not a load-tested service-level guarantee. Excess
WebSocket upgrades receive `503 Service Unavailable` with `Retry-After: 5`.
During deployment shutdown, existing clients receive WebSocket code `1012`
(`Service Restart`) so the client reconnect path can take over.

Use the aggregate `/health` capacity values during a test event. Schedule a load
test and capacity review before either connections or rooms remain above 70% of
their configured maximum, or before promotion is expected to create that load.
Only raise the ceilings after measuring CPU, memory, event-loop responsiveness,
snapshot latency, reconnect behavior, and result-write backlog on the actual
host plan.

## Horizontal scaling plan

Do not add a second replica while rooms and ticket nonces are process-local.
Horizontal scale needs all of the following as one design change:

1. Route an Activity instance consistently to the process that owns its room,
   either through sticky routing or a shared room directory.
2. Move used ticket nonces to shared, expiring storage so replay protection works
   across replicas.
3. Publish room lifecycle/ownership changes atomically and recover ownership when
   a process disappears.
4. Load-test reconnects during deploys and owner failure before enabling multiple
   replicas.

Until that work exists, scale the single instance vertically and keep the
platform replica count at one.

## Incident response

1. Confirm which health endpoint is failing and save its non-sensitive status.
2. Check structured events by `event` name; do not paste environment variables,
   request headers, or database connection strings into an issue.
3. If only realtime persistence is unavailable, stop promotion, restore MongoDB,
   and verify `pendingResults` returns to zero.
4. If the realtime process is at capacity, do not add a replica. Reduce traffic
   or vertically resize, then run the capacity review.
5. After recovery, run the Production uptime workflow manually and complete a
   two-account Discord duel through persisted results.
