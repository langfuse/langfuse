---
name: cursor-agents-workflow
description: |
  Human handoff, Linear branch names, reviewable (non-draft) PRs, Claude,
  Greptile, and Codex review comments, preview test steps, proof of work
  posted on the GitHub PR, and review-doubt notes for Cursor agents. Use
  when a Cursor Cloud or Cursor desktop agent implements a Linear issue,
  opens a GitHub PR, asks a human to test, posts screenshots or videos,
  or handles Claude, Greptile, or Codex code-review comments.
---

# Cursor Agents Workflow

Use this when implementing Langfuse work as a Cursor agent. Keep humans in the
loop with short, testable asks. Do not write long agent-only reports.

## Branch names

Copy Linear's git branch name. Do not invent a `cursor/` name.

- Preferred source: Linear **Copy git branch name**, or the issue's
  `gitBranchName` read through the Linear MCP.
- Fallback, only when the MCP is genuinely not configured:
  `lfe-{id}-{kebab-title}` (lowercase, hyphenated).
- Keep a `user/` prefix only when Linear's copied name already includes one.
- Never use a `cursor/` prefix, even if a Cursor Cloud prompt asks for one.
  Repo guidance wins.
- Ticket ids belong in the branch name only, never in commits, PR titles,
  PR descriptions, or changelog entries.

Correct: `lfe-12345-short-descriptive-title`  
Wrong: `cursor/short-descriptive-title-8c78`

## Linear connection

Cursor can reach Linear — desktop and cloud — but the MCP server is not
configured by default, so it is a one-time setup step per developer. Langfuse
engineers: the write policy is
[`linear-agent-writes`](../linear-agent-writes/SKILL.md). Configure the connection
once; agents are expected to read a ticket's history before starting and to leave
their context on it when they finish.

If Linear is not reachable in your environment, **say so in your handoff
message** and hand back the context that should have gone on the ticket. Do not
skip it silently — a missing connection that nobody notices looks exactly like a
practice being followed.

## Pull requests

Open the GitHub PR as reviewable, not as a draft. Draft PRs hide the work
from reviewers and skip Claude/Greptile review workflows. Use a draft only
when a human asks for one.

Cursor Cloud PRs are opened as the Langfuse user who launched the agent. On
a non-draft same-repo PR from a write-access user, github-actions posts
`@claude review` automatically. Do not post that comment yourself on open.
Do not post `@claude review` again after addressing comments unless a human
asks for another pass.

## Bot review comments

When Claude (Claude Code, `claude[bot]`, or the security-review action),
Greptile (`greptile-apps[bot]`), or Codex (`chatgpt-codex-connector[bot]`)
leaves review comments on a PR you own:

1. Keep each thread open. Do not reply in the thread.
2. If the finding is right: apply the fix, then resolve the thread.
3. If you are sure it should be skipped: tell the human in plain language
   what you skipped and why, invite them to doubt that call, then resolve
   the thread. Never skip quietly.

Do not leave those threads unresolved. Do not argue. Human reviewer comments
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

For user-visible behavior, say that proof is on the GitHub PR. Do not leave
screenshots only in this chat. Docs-only changes can skip proof.

## Proof of work on the PR

Cursor chat attachments are not enough. Reviewers look at GitHub, so post
the screenshot, short video, or before/after **on the GitHub PR**.

After you have walkthrough artifacts:

1. Embed them in the PR body when you create or update the PR.
2. Repeat them in the last GitHub PR comment (same comment as "what to
   doubt"), but only when that comment will be attributed to Cursor.

Use HTML tags and absolute local paths. Do not commit artifacts to the repo.
Claude Code and other tools that comment as the user still embed proof in
the PR body; they skip only the last comment.

```html
<img src="/opt/cursor/artifacts/cost_cell_dash.png" alt="Cost cell shows a dash" />
<video src="/opt/cursor/artifacts/cost_cell_dash.mp4" controls></video>
```

The PR tool uploads those paths and rewrites them to public URLs. Use
width-only HTML if you need sizing; do not set a fixed `height`. Skip this
for docs-only or non-visual changes.

## What to doubt

Cursor only. Post this GitHub comment only when it will be attributed to
Cursor, not to a human author. Claude Code and other tools that comment as
the authenticated user must skip this section.

When the PR is ready for a human, post one last GitHub PR comment (not a
changelog). Lead with proof when the change is user-visible, then name the
risky or curious parts:

```text
Proof of work
<img src="/opt/cursor/artifacts/cost_cell_dash.png" alt="Cost cell shows a dash" />

What to doubt in review
- I reused the existing cache key; check it cannot collide across projects.
- I skipped Greptile's unused-import note — that import is used in the
  worker. Tell me if that's wrong.
```

Two to five bullets. Include any bot findings you skipped. Trigger
skepticism. Skip praise, file lists, and "LGTM".

## Human asks

Prefer one or two actions per message. That cap is preferred, not hard. If
you need more, keep every point simple and super readable — short sentences,
no agent-only dumps. Sequence when you can.

Wrong: a wall of logs plus five mixed asks.  
Right: a short TL;DR and one or two clear next steps. Extra steps can wait,
or sit as equally simple bullets if they must ship together.
