---
name: eslint-disable-cleanup
description: Use when removing eslint-disable comments by fixing the underlying lint violation, or when changing the scheduled eslint-disable cleanup agent, its batch selector, or its workflow.
---

# ESLint disable cleanup

Scheduled cleanup removes existing `eslint-disable` comments. It never adds a disable, never widens one, and never edits ESLint config to silence a rule.

## Batch contract

Read `.agents/skills/eslint-disable-cleanup/references/batch-selection.md`.

The workflow writes the selected batch to the path in `ESLINT_DISABLE_BATCH_MANIFEST`. Edit only the files named there. Remove only the directives named there.

Acceptable pull requests:

- one directive
- every directive in one file
- several directives that name the same single rule

Do not mix a second rule or a file outside the batch. Keep the diff under 200 changed lines (the workflow rejects 200 or more).

## Fix shape

- Delete a disable when the rule no longer fires.
- Otherwise change the code so the rule passes, then delete the disable.
- For a file batch, every disable in that file must go.
- For an issue batch, remove that one comment. Leave every other disable in the file.
- For a rule batch, remove only comments whose sole rule is the batch rule.
- If any selected comment cannot be removed safely, restore the original files and report the batch unresolved. Do not leave a partial diff.
- Do not edit generated files, lockfiles, package manager files, or ESLint config.

## Check

Run exactly:

```bash
node scripts/eslint-disable-cleanup/lint-changed.mjs
```

`ESLINT_DISABLE_BATCH_MANIFEST` must already point at the selected batch. The script lints only those files with `--max-warnings 0`.
