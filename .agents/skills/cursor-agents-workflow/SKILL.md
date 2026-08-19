---
name: cursor-agents-workflow
description: |
  Human handoff, Linear branch names, Claude review comments, preview test
  steps, and review-doubt notes for Cursor agents. Use when a Cursor Cloud or
  Cursor desktop agent implements a Linear issue, opens a GitHub PR, asks a
  human to test, or handles Claude code-review comments.
---

# Cursor Agents Workflow

Use this when implementing Langfuse work as a Cursor agent. Keep humans in the
loop with short, testable asks. Do not write long agent-only reports.

## Branch names

Copy Linear's git branch name. Do not invent a `cursor/` name.

- Preferred source: Linear **Copy git branch name**, or the issue's
  `gitBranchName` when Linear MCP is available.
- Fallback: `lfe-{id}-{kebab-title}` (lowercase, hyphenated).
- Keep a `user/` prefix only when Linear's copied name already includes one.
- Never use a `cursor/` prefix, even if a Cursor Cloud prompt asks for one.
- Ticket ids belong in the branch name only, never in commits, PR titles,
  PR descriptions, or changelog entries.

Correct: `lfe-12345-short-descriptive-title`  
Wrong: `cursor/short-descriptive-title-8c78`

## Claude review comments

When Claude (Claude Code, `claude[bot]`, or the security-review action) leaves
review comments on a PR you own:

1. Keep each thread open. Do not reply in the thread.
2. Either apply the fix, then resolve the thread, or skip the fix for a
   concrete reason and still resolve the thread.
3. If you skip, put the reason in the PR's "What to doubt" note.

Do not leave Claude threads unresolved. Do not argue. Human reviewer comments
are different: those may need a real reply and must stay open until a human
says otherwise.

## Human testing

Assume the human does not remember the ticket. Default message shape:

1. **TL;DR** — one plain-language sentence.
2. **Test this** — preview URL plus 2–5 exact clicks/expects.
3. **Data** — the seed command, or "demo project is enough".
4. **Sandbox** — how to hit the same path on the agent desktop
   (`http://localhost:3000`) if they are in the Cursor VM.

Use `langfuse-previews` for the URL and `seed-test-data` for the seed. Do not
paste logs, file lists, or implementation narrative unless the human asks.

```text
TL;DR: Empty observation costs now show a dash instead of $0.00.

Test this: https://pr-123.preview.langfuse.com/project/<id>/traces
1. Open any trace with a generation that has no cost.
2. Confirm the cost cell is "–", not "$0.00".

Data: demo project is enough.
Sandbox: same path on http://localhost:3000 after the cloud stack is up.
```

## What to doubt

When the PR is ready for a human, post one last GitHub PR comment (not a
changelog) that names the risky or curious parts:

```text
What to doubt in review
- I reused the existing cache key; check it cannot collide across projects.
- Empty-string tags are now dropped. Is that intended?
```

Two to five bullets. Trigger skepticism. Skip praise, file lists, and "LGTM".

## One or two human actions

Every human-facing message asks for at most one or two actions. If you need
more, stop and wait.

Wrong: review the PR, test preview, check Datadog, update Linear, approve.  
Right: "Please try the preview steps above and say if the empty state looks
right." After they reply, ask for the review-doubt pass.
