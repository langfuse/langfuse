---
name: verify-changes
description: |
  Prove a Langfuse change by launching or reusing the local stack, running the
  matching unit or e2e tests, and driving the UI or public API. Use when
  verifying a change, collecting proof, signing off a fix, or when someone
  asks to show that Langfuse actually works. A change is done only when the
  named evidence exists.
---

# Verify changes

Drive Langfuse the way a user or API client does, and keep the proof. Saying
it worked is not a result.

Read [`features/README.md`](features/README.md) before driving a user-facing
flow. Read [`references/tests.md`](references/tests.md) before picking a test
command. Browser signoff details also live in `frontend-browser-review`;
seeded data lives in `seed-test-data`. Do not restate those skills here.

## Task contract

Write this before the first command. A run without it has not started.

```markdown
## Task
- Goal: <what behavior must be true>
- Finish condition: <observable check a second person can re-run>
- Evidence required: <files, command summaries, screenshots, or traces>
- Constraints: <what this run must not do>
```

The finish condition names a command exit code, a response field, or text on
a page. "Looks fine" is not a finish condition.

## Launch

Two stacks exist. Pick one. Do not mix them on ports 3000 and 3030.

**Cursor Cloud.** The shared stack is `bash scripts/agents/start-cursor-cloud.sh`
from the repo root. If [`scripts/doctor.sh`](scripts/doctor.sh) already exits
0, do not launch again. If it fails, run the start script once. It builds the
compose project `langfuse-cursor`, seeds Postgres, and probes both health
URLs. Do not start `pnpm run dev`, `pnpm run dev:web`, or another worker.
Do not feed the workspace `.env` to Compose; the start script keeps host
`localhost` URLs out of the containers.

**Local source dev.** Use this only when 3000 and 3030 are free.

1. Once per worktree: `bash scripts/agents/setup.sh`.
2. `pnpm run infra:dev:up` for Postgres, ClickHouse, Redis, and MinIO.
3. Start the app in a tmux session named `langfuse-verify-dev` with
   `pnpm run dev` (`turbo watch dev` runs web and worker). Schema and the
   demo user must already exist. `pnpm run dx` rebuilds that state and
   deletes local volumes; run it only when destroying that data is the point.
4. Ready means `scripts/doctor.sh` exits 0. A database health check can pass
   while Next.js is still compiling, so the doctor also requires
   `/auth/sign-in` to return HTTP 200.

Web health JSON uses `"status": "OK"`. Worker health JSON uses
`"status": "ok"`. Both are healthy. Do not "fix" the case difference.

Seeded identities, from `packages/shared/scripts/seeder`, exist only after
`pnpm --filter=shared run db:seed` (the Cloud start script does this):

- UI: `demo@langfuse.com` / `password`, org **Seed Org**, project **llm-app**
  (`7a88fb47-b4e2-43b8-a06c-a5ce950dc53a`)
- API: public `pk-lf-1234567890`, secret `sk-lf-1234567890`

These are local fixtures. A login failure on a database that was never seeded
is a missing fixture, not a product bug.

## Doctor

Run this first, and again after any failed drive:

```bash
bash .agents/skills/verify-changes/scripts/doctor.sh
```

Override `LANGFUSE_WEB_URL` and `LANGFUSE_WORKER_URL` only when the stack is
deliberately not on 3000 and 3030. Exit 0 means web health is `OK`, worker
health is `ok`, and the sign-in page returned 200. Anything else means do
not drive.

## Drive

Exercise the real user or API path in the feature file. Do not call internal
setters or test-only routes and then call the feature verified.

- UI: Cursor computer use against `http://127.0.0.1:3000`, or the workspace
  Playwright MCP server (`playwright` in `.agents/config.json`). Prefer
  `data-testid`, then the accessible name. Playwright session files land in
  `/tmp/playwright-mcp`; copy screenshots and traces into the evidence
  directory before that session is discarded.
- API: `curl` against `/api/public/*` with the seeded basic-auth key. Save
  the status line and body.
- Data: `pnpm run seed -- <scenario>` from `seed-test-data`. Use the deep
  link the command prints. No ad-hoc inserts.

One feature is enough when the task names one. A proof that drives a
different entry point from the one the map lists does not cover the listed
one. Record an unreachable path with the URL or command tried and the unmet
precondition.

## Evidence

Create one directory and do not delete it during cleanup:

- `/opt/cursor/artifacts/verify-changes/<run-id>/` when that parent exists
- otherwise `/tmp/langfuse-verify-evidence/<run-id>/`

`<run-id>` is a timestamp such as `20261013T121400Z`. Write `report.md` there
using the format below. Copy command output, screenshots, and traces into
that directory. Quote each check's summary line in the report (`Tests 12
passed (12)`, `doctor=OK`). For turbo, also quote the `Cached:` line. A
cached lint or typecheck is not a fresh run; `pnpm exec turbo run lint
--force` forces execution.

A change is done when every artifact named in **Evidence required** is in
that directory and the finish condition is visible in one of them. Missing
evidence is a failed run, including when the commands succeeded and the
files were not saved.

## Cleanup

Stop only what this run started.

- Leave the Cursor Cloud compose project `langfuse-cursor` running. It is
  shared with the desktop.
- If this run created tmux session `langfuse-verify-dev`, stop it with
  `tmux kill-session -t langfuse-verify-dev`.
- Do not kill processes by name.
- Do not delete the evidence directory. After cleanup, `test -f` the report
  and confirm it is still there.

## Helpers

[`scripts/doctor.sh`](scripts/doctor.sh) is the only helper. Invoke it with
the `bash` command in **Doctor**. It is read-only: it does not start, seed,
or stop anything.

## Tests

Choose commands from [`references/tests.md`](references/tests.md). Match the
test to the risk. A new assertion that only repeats the diff does not earn a
file. Skip it in the report in one line and say why.

For a change under `.agents/` only, `pnpm run agents:sync` and
`pnpm run agents:check` are the owning checks. Do not boot the product test
matrix to prove a skill edit.

## Report

`report.md` must be valid Markdown: fenced code blocks closed, links closed,
a space after every list marker.

```markdown
# Verification report

## Task
- Goal:
- Finish condition:
- Evidence required:
- Constraints:

## Result
pass | fail | blocked

## Evidence
- <command or flow>: exit <code>, summary `<summary line>`, artifact `<path>`

## Not checked
- <what was skipped and why>

## Skill drift
- <none, or a concrete mismatch between this skill and what the run observed>
```

## After the run

Run `maintain-verification-skill` on this report. It proposes diffs to this
skill where the run showed the skill was wrong. It does not change product
code.
