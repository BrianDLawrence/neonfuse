---
name: check
description: Run the required Neon Fuse verification gate (lint → typecheck → test → build) in order, stop at the first failure, and summarize. Use after any code change, before committing, or when the user asks to "check", "verify the build", or "run the gates".
---

# /check — required verification gate

Run the exact checks that CI ([.github/workflows/ci.yml](../../../.github/workflows/ci.yml)) and [AGENTS.md](../../../AGENTS.md) require after a code change. Run them **in this order** and **stop at the first failure** — a later step is meaningless if an earlier one is broken.

## Steps

Run each as a separate Bash call so failures are attributable:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run build`

For speed, you may chain them with `&&` in one call (`npm run lint && npm run typecheck && npm run test && npm run build`) — but if the chain fails, re-run the individual failing step to capture its full output.

## On failure

- Stop. Do not run later steps.
- Show the relevant error output (not the whole log).
- Fix the cause if it's clearly in scope for the current change, then re-run `/check` from the top. If the failure is pre-existing or out of scope, report it and ask before changing unrelated code.
- A test failure after a simulation change usually means the rule changed behavior — confirm with the user whether the test or the code is wrong before "fixing" the test.

## On success

Report a one-line summary: `✅ lint · typecheck · test · build all passed`. Keep it short — don't paste full output when everything is green.
