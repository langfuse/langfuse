---
name: weekly-changelog-check
description: Review recent Langfuse commits across the platform workspace and decide whether a new public changelog should be published. Use when asked to check last week's commits, audit weekly product changes, assess changelog-worthy work across app, docs, SDKs, CLI, skills, or infra, or produce a publish/maybe/no changelog recommendation.
---

# Weekly Changelog Check

Use this skill when you need to decide whether the last week's Langfuse changes
need a new public changelog entry.

This skill lives in the `langfuse/langfuse` repo, but it is intended to be run
from the broader platform workspace when sibling repos such as
`langfuse/langfuse-docs`, `langfuse/infrastructure`, `langfuse/langfuse-js`,
and `langfuse/langfuse-python` are available nearby.

## Workflow

1. Run from the platform workspace root when possible, not just the `app/`
   checkout.
2. Refresh local repo state if freshness matters. Prefer the platform
   workspace's `./scripts/init --no-pull` so existing clean checkouts are
   fetched without fast-forwarding working trees.
3. Run the platform workspace's `./scripts/doctor` and stop if relevant repos
   are missing or dirty.
4. Run the scanner:

   ```bash
   python3 app/.agents/skills/weekly-changelog-check/scripts/scan_weekly_changelog_commits.py --root .
   ```

   By default, the scanner uses the previous completed ISO week: Monday 00:00
   inclusive through the next Monday 00:00 exclusive in the local timezone.
5. Check whether an open PR is already adding the changelog before calling an
   item missing. Search at least the `langfuse/langfuse-docs` repository for
   open PRs that touch `content/changelog/` or clearly propose a changelog for
   the scanned week. Use the GitHub app/plugin when available, or
   `gh pr list --repo langfuse/langfuse-docs` / `gh pr view --repo
   langfuse/langfuse-docs` as a fallback.
6. Review the candidates and decide with product judgment. The script is a
   triage aid, not the final authority.

Use explicit dates when the user names a different window:

```bash
python3 app/.agents/skills/weekly-changelog-check/scripts/scan_weekly_changelog_commits.py \
  --root . \
  --since 2026-05-04 \
  --until 2026-05-11
```

## Decision Rules

Recommend `publish` when last week's commits include user-visible features,
new integrations, public API or SDK behavior changes, self-hosting/deployment
changes, notable performance improvements, security/compliance updates, region
or billing changes, or important fixes that users should know about.

Recommend `maybe` when there are visible fixes or docs changes but no clear
launch narrative. Ask whether product/marketing wants a small update, or suggest
folding the items into the next changelog.

Recommend `no` when commits are only internal refactors, tests, CI, dependency
updates, private infrastructure maintenance, or docs cleanup without customer
impact.

If existing files under `langfuse/langfuse-docs/content/changelog/` already
cover the week, call out whether the recommendation is to publish a new
changelog, update the existing one, or do nothing.

If an open PR is already adding the changelog, treat that as a strong reason to
recommend `maybe` or `no` rather than opening duplicate work. Call out whether
the best next step is to review/merge the existing PR, update it with missing
items, or still publish a separate changelog because the PR does not cover the
launch-worthy changes you found.

## Output

Return a concise report that is table-first.

Start with a short summary:

- Recommendation: `publish`, `maybe`, or `no`
- Date window scanned
- Main reasons
- Open changelog PRs found: `none` or a short list

Then include two Markdown tables:

1. `What did we launch`
   Columns:
   - `Launched item`
   - `Source`
   - `Why it mattered`
   - `Status`

   Include changelog files that already cover the scanned week or are the clear
   published outcome of the week's work. Mark `Status` as `already launched`.
   If there is an open PR that is about to publish the item, include it here or
   in the next table as appropriate and mark `Status` as `pending in open PR`.
   Write `Launched item` and `Why it mattered` as short, user-facing summaries
   in plain English rather than raw changelog titles or commit-style phrasing.

2. `What should we launch`
   Columns:
   - `Candidate`
   - `What changed`
   - `Repo`
   - `Evidence`
   - `Why launch-worthy`
   - `Recommendation`

   Use this table for missing or possible changelog items. `Recommendation`
   should be one of `publish now`, `bundle later`, `covered by open PR`, or
   `skip`.
   In `Evidence`, prefer proper GitHub Markdown links to the most relevant
   commit, pull request, or published changelog file rather than raw SHAs or
   plain-text references.
   Write `Candidate`, `What changed`, and `Why launch-worthy` as user-facing
   summaries in plain English, not raw commit titles. `What changed` should
   briefly explain the actual product or docs change in one sentence, while
   `Why launch-worthy` should explain the customer impact or why it may deserve
   changelog attention.

After the tables, include:

- Candidate commits grouped by repo
- Existing changelog files in or near the scanned week
- Open changelog PRs in or near the scanned week, including whether they fully
  cover the launch-worthy items
- Suggested changelog title and angle when publishing is recommended
- Follow-up repos to update, usually `langfuse/langfuse-docs` plus any source
  repo whose behavior needs examples or references synchronized

## Safety

Keep private infrastructure details out of public changelogs. For infra-driven
changes, mention only stable public behavior, public configuration, supported
deployment modes, user-facing reliability, or safe telemetry fields.

Do not publish or edit docs unless the user explicitly asks. This skill only
decides whether a changelog is warranted and prepares a recommendation.
