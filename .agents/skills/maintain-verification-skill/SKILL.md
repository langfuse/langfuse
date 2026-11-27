---
name: maintain-verification-skill
description: |
  After a verify-changes run, propose diffs to that skill where the run
  showed it was wrong or stale. Use when a verification report names skill
  drift, when verify-changes commands or selectors failed as written, or
  when asked to audit the Langfuse verification skill. Proposes the diff.
  Does not edit product code.
---

# Maintain the verification skill

`verify-changes` rots when ports, selectors, seed data, or test commands
move. This skill turns a finished verification run into a proposed diff
against `.agents/skills/verify-changes/` only.

## Outcomes

Say which one:

- **clean** — the report's commands and observations match the skill. No
  diff.
- **proposed** — one unified diff, limited to the skill directory, each
  hunk tied to something this run observed.
- **blocked** — the report lacks the observation needed to prove a
  correction. Say what is missing.

## Edit scope

Only `.agents/skills/verify-changes/` (`SKILL.md`, `features/`,
`references/`, `scripts/`). Do not edit product code. Behavior the map
describes that the app no longer does is either skill drift (propose a doc
fix, with the observed text) or a product bug (name it, leave the skill
alone).

Do not apply the diff in this skill. Print it and write it next to the
verification report as `proposed-verify-changes.diff`. Applying it is a
separate edit after a person asks, or after the same session is explicitly
told to land the correction.

## Pass

1. **Locate the run.** Read the latest `report.md` under
   `/opt/cursor/artifacts/verify-changes/` or
   `/tmp/langfuse-verify-evidence/`. No report: stop and point at
   `verify-changes`. Do not invent a run.
2. **Read the drift.** Use the report's **Skill drift** section, failed
   commands, and unexpected UI or API text. Ignore praise and skipped
   checks that the report already justified.
3. **Confirm.** Open the skill file the drift names and the artifact
   (command log, screenshot note, response body) that contradicts it.
   A hunch without that pair is not a hunk.
4. **Propose.** Write a unified diff. Keep unaffected feature files out of
   it. A full rewrite of the map is out of scope for one verification run;
   say which feature files this run did not cover.
5. **Leave evidence.** The proposal file lives in the run's evidence
   directory. Do not commit the report or the proposal into the repo.

## Report

The reply is valid Markdown. Close every fence. Use a space after list
markers.

```markdown
# Verification skill maintenance

## Outcome
clean | proposed | blocked

## Covered
- <feature or section this run actually exercised>

## Not covered
- <feature files this run did not exercise>

## Product bugs
- <none, or what the app did that a skill edit must not hide>

## Proposed diff
<none, or a ```diff fence>
```

When the outcome is **proposed**, the fence is the full diff a reviewer
can apply with `git apply`.
