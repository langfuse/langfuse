---
name: cursor-cloud-issue-delivery
description: |
  End-to-end Cursor Cloud Agent workflow for Langfuse issues: investigate thoroughly,
  write and follow an implementation plan, verify locally on the Cloud stack, open a
  draft PR, address all review-agent comments on the PR, manually test in the PR
  preview with seeded sample data, and add preview review instructions for the human
  engineer. Use when a Cloud Agent owns an issue, bug fix, or feature from triage
  through preview-ready handoff.
---

# Cursor Cloud Issue Delivery

Use this skill when a Cursor Cloud Agent should own an issue from investigation through
preview-ready handoff. Follow the phases in order; do not skip ahead to implementation
before investigation and a written plan are complete.

## Phase map

| Phase | Goal | Primary skills / tools |
| --- | --- | --- |
| 1. Investigate | Understand the bug, root cause, and repro shape | `debug-issue-with-datadog`, `langfuse-codebase-navigator`, `seed-test-data` |
| 2. Plan | Lock scope, approach, tests, and data needs before coding | This skill |
| 3. Implement | Smallest correct fix or feature | Package `AGENTS.md`, `backend-dev-guidelines`, `refactor-react-effects` |
| 4. Test locally | Prove the fix on the Cloud stack | `frontend-browser-review`, `start-cursor-cloud.sh` |
| 5. PR + babysit | Draft PR, fix CI, address review-agent comments | `git-workflow`, `code-review`, GitHub MCP |
| 6. Preview QA | Verify on `pr-<N>.preview.langfuse.com` | `langfuse-previews`, `seed-test-data` |
| 7. Handoff | Preview review steps for the human engineer | [`references/preview-review-template.md`](references/preview-review-template.md) |

## Phase 1 — Investigate thoroughly

Do not write production code until investigation is complete.

1. **Intake every signal** in the issue, Linear thread, Datadog alert, or user report.
   - For production failures: read and follow `debug-issue-with-datadog`.
   - For UI-only bugs: locate the route/component and read the narrowest `AGENTS.md`.
2. **Reproduce or narrow the failure mode.**
   - Bugs: identify the smallest failing automated test or write one that proves the
     reported behavior before changing production code (root `AGENTS.md`).
   - Data-dependent bugs: check whether `pnpm run seed -- list` already has a scenario
     for the shape; if not, note whether a seeder extension is needed.
3. **Record investigation output** (keep in the agent thread, not in public repo docs):
   - symptom
   - root cause hypothesis (with code paths cited)
   - repro command or seed scenario
   - what is in / out of scope

If investigation is inconclusive, stop and report gaps instead of guessing.

## Phase 2 — Plan before implementation

Write a short plan in the agent thread **before** editing production code:

```markdown
## Plan

### Problem
(one sentence)

### Root cause
(file paths + mechanism)

### Approach
(numbered steps; call out migrations, API contracts, UI flows)

### Tests
- failing test to add first (file + assertion)
- other verification (lint, targeted vitest, browser flow)

### Test data
- seed scenario + flags, or "default demo project is enough"

### Risks / out of scope
(bullet list)
```

- Keep the plan proportional: a one-line fix still gets a three-bullet plan.
- For ambiguous scope or risky migrations, ask the user to confirm the plan before Phase 3.
- Do not treat "plan mode" as permission to skip local verification later.

## Phase 3 — Implement the plan

1. Create branch: `cursor/<descriptive-name>-8a1e` off `main`.
2. Implement only what the plan covers; no drive-by refactors.
3. For bug fixes: confirm the new failing test fails on the pre-fix behavior, then make
   it pass.
4. Match surrounding conventions; read the owning package `AGENTS.md` first.

## Phase 4 — Test locally on Cursor Cloud

The Cloud VM already runs the stack via `scripts/agents/start-cursor-cloud.sh`.
**Do not** start a second web/worker on ports 3000 or 3030.

1. **After web/worker production code changes**, rerun:

   ```bash
   bash scripts/agents/start-cursor-cloud.sh
   ```

2. **Seed the data shape the fix needs** (`seed-test-data` skill). Open printed deep
   links instead of hand-navigating.

3. **Run automated checks** from root `AGENTS.md` Verification section for every
   package you touched. Quote summary lines in your update.

4. **Browser signoff** for UI changes: follow `frontend-browser-review`. In Cloud, use
   computer use against `http://localhost:3000`.

5. **Commit and push** before opening the PR:

   ```bash
   git push -u origin cursor/<descriptive-name>-8a1e
   ```

Local verification must pass before Phase 5.

## Phase 5 — Create and babysit the PR

**Babysitting** means staying on the PR until every comment from automated review
agents is addressed — not just until CI is green.

1. **Open a draft PR** to `main` via the GitHub MCP / `ManagePullRequest`.
   - Title: Conventional Commits (`fix(web): …`, `feat: …`).
   - No internal ticket ids in title, body, or commits.
   - List impacted packages and verification commands run locally.
2. **Keep the PR draft** until Phase 6 preview QA passes.
3. **Watch CI** after each push:
   - Poll `get_ci_status`; fix failures on the same branch.
   - Do not mark the PR ready for review while required checks are red.
4. **Babysit review-agent comments** — loop until none remain open:
   - After opening the PR and after every push, fetch all PR review comments
     (inline and top-level) from automated review agents such as Bugbot, security
     review, or other repo-configured review bots.
   - For each comment: fix the underlying issue when valid, push, and re-run the
     relevant checks; reply on the thread with what changed; resolve the thread
     when done.
   - When a finding is a false positive, reply with evidence and resolve or leave
     unresolved only if the agent cannot be convinced — do not silently ignore
     comments.
   - Do not mark the PR ready for review while actionable review-agent threads
     are still open.
5. **Wait for the preview build** (~5 min). The bot comment and `Live preview:` line
   on the PR are the source of truth for the preview URL.
6. **Off-hours:** previews sleep Mon–Fri nights and weekends (Europe/Berlin). Schedule
   Phase 6 during working hours or note in the PR that preview QA is blocked until
   the preview is awake.

## Phase 6 — Manual preview QA with sample data

Previews start with synthetic demo data only. **Never** put real credentials or customer
data in a preview.

1. Read `langfuse-previews` for access, login, and debugging.
2. Open `https://pr-<N>.preview.langfuse.com` (auto sign-in as demo user).
3. **Seed issue-specific data when the default demo project is insufficient:**
   - From the PR branch checkout, port-forward the preview Postgres + ClickHouse and
     run the seed CLI with `NEXTAUTH_URL` pointed at the preview (full commands in
     `langfuse-previews`).
   - Pick the scenario from `seed-test-data` that matches the bug shape.
4. **Manually exercise the primary flow** in the preview (computer use or browser).
   Capture screenshots or a screen recording for UI changes.
5. **Compare preview behavior to local behavior.** If they diverge, investigate before
   marking ready.
6. When preview QA passes, proceed to Phase 7, then mark the PR ready for review.

## Phase 7 — Engineer preview review instructions

Add a **Preview review** section to the PR body so a human can verify in minutes without
re-deriving your steps. Copy and fill
[`references/preview-review-template.md`](references/preview-review-template.md).

Minimum content:

- preview URL and PR number
- whether extra seeding was done (command or "default demo is enough")
- numbered click-path with expected outcomes
- known limitations or flows not covered
- artifact links (screenshots / recording paths)

Mark the PR ready for review only after Phases 4–7 are complete.

## Exit criteria

Before ending the agent run, confirm:

- [ ] Investigation and plan were written before implementation
- [ ] Failing test added first (bug fixes)
- [ ] Local Cloud stack verified (`start-cursor-cloud.sh` + seed + checks)
- [ ] Draft PR opened, CI green, all review-agent comments addressed
- [ ] Preview manually tested with appropriate sample data
- [ ] PR body includes filled preview review instructions
- [ ] Final summary quotes verification evidence, not claims

## Delegation guide

| Need | Skill |
| --- | --- |
| Production telemetry | `debug-issue-with-datadog`, `datadog-query-recipes` |
| Code navigation | `langfuse-codebase-navigator` |
| Local / preview data | `seed-test-data` |
| Browser signoff | `frontend-browser-review` |
| Preview deploy / kubectl | `langfuse-previews` |
| Commits / PR hygiene | `git-workflow` |
| Responding to review findings | `code-review` |
| Backend patterns | `backend-dev-guidelines` |
| React effects cleanup | `refactor-react-effects` |
| Security-sensitive changes | `security-review` |
