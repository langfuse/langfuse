---
name: retro
description: |
  Retrospective on coding-agent work. Use only when the user asks for /retro
  or a retrospective of agent sessions, agent pull requests, or the central
  agent log. Reads that log, then proposes environment fixes in AGENTS.md,
  skills, and scripts. Prune stale guidance. Prefer a script over another
  paragraph when the miss is mechanical.
---

# Retro

Suggest improvements to the coding agent's environment. Order them by how
often they will waste the next session. Apply them only when the user asked
you to apply them.

The pass has two sources, used together. A single session (the current one,
or the one the user names) shows what this run stumbled on. A central log of
the team's agent work shows what many runs stumble on. Prefer the log when
the user does not name a session. GitHub pull requests, review comments, and
CI are the log this repo already has. Langfuse traces are the log when the
user points at a project or an export; if that project is not configured,
say so and continue with GitHub. Do not invent one.

## Read the log

1. Session transcripts the user names, including this session when they say
   "this session" or do not name a source.
2. GitHub, default window 42 days (narrow to four weeks when they ask):

   ```bash
   node .agents/skills/retro/scripts/agent-pr-log.mjs --since YYYY-MM-DD
   ```

   The script caps each search (default 100). Say so when the sample is full.
   Then open the duplicate groups, the draft-heavy authors, and a sample of
   review threads and failed checks. Use `gh` read-only. Quote comments and
   link the PR, the comment, or the Actions run. Do not invent a URL.
3. Langfuse traces of agent sessions, when the user supplies a project or
   export. Separate three outcomes and keep them labeled:
   - patterns worth copying from the strongest sessions
   - repo steering that made agents fail (AGENTS.md, skills, checks)
   - personal setup (a harness, a global instruction, a habit). Tell the
     human. Do not commit it.

## What counts

Look for these, and skip a category that the log does not support:

- **Navigation.** The agent took a long detour to find a file or a hidden
  dependency. Add a pointer in the narrowest `AGENTS.md` that owns it.
- **Automated checks.** The agent shipped a mistake a linter, typecheck, or
  test already catches, or a check exists and nobody runs it. Point at the
  repo's command. Do not invent a second checker.
- **Mechanical standards.** A fixed pattern (a banned call, an import, a
  possibly-undefined binding). Encode it in the existing linter or a script.
  A one-off judgement call ("this will hammer Postgres") stays out of
  steering files.
- **Steering weight.** The same rule copied across `AGENTS.md` and several
  skills, especially a rule the platform contradicts. Keep one accurate
  copy. Delete the others.
- **No-ops.** Instructions that do not change what agents do. Delete them
  or rewrite them so they match the system that actually runs.
- **Repeated manual steps.** A human, or every agent, runs the same search
  or the same command by hand. Add a script under this skill, or under
  `scripts/`, and name it from the workflow that needs it.
- **Tool economy and missing access.** Expensive calls, or a fact the agent
  could not see (CI logs, a service). Prefer tee'd logs or a read-only
  query over more prose.
- **Unrelated CI.** A failing job whose assertion is outside the diff. Say
  to leave those files alone. Name the flake if it recurs.

## Edit

- Smallest file that will be loaded for that task. Root `AGENTS.md` stays
  short. A rule for one package goes in that package's `AGENTS.md`. A
  workflow goes in the skill that already owns it.
- Do not add a skill-by-skill list to root `AGENTS.md`.
- After changing `.agents/**` or root guidance, run `pnpm run agents:sync`
  and `pnpm run agents:check`.
- One PR. Draft only when the human asked for a draft. Do not merge it and
  do not request reviewers.
- PR body: each finding, then the evidence links (PRs, review comments, CI
  runs), then what changed. For a finding you did not encode, say why in
  one sentence.
- Keep internal ticket ids out of the PR title, the PR body, and commit
  messages. Pull request numbers and GitHub links are the evidence.

## Output

Return valid Markdown. Findings first, most severe first. Each finding has
the failure, the evidence links, and the change (or why you left it). Close
every link. Put a space after `-`. No dangling fences.

Before returning, check the Markdown: headings, lists, and links parse, and
every code fence is closed.

## Script

`scripts/agent-pr-log.mjs` prints the sample and groups identical titles.
`--search "distinctive words"` checks open PRs before you open another one
for the same work. Exit 1 means an open PR already matches; do not open a
second one. The script does not post, label, or edit anything.
