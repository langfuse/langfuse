---
name: integration-repo-setup
description: |
  Set up or audit the repository machinery of a Langfuse coding-agent
  observability plugin — required files, GitHub workflows, supply-chain pinning,
  dependency automation and the version/tag/publish path. Covers `.github/**`,
  manifests and tags in a plugin repo, not this monorepo, whose git and release
  flow is owned by git-workflow. Use when creating a plugin repo, adding or
  changing a workflow, preparing a public launch, cutting a release, or when a
  published version does not contain merged fixes. This skill owns whether a
  workflow exists and how it is gated; which cells the test matrix must cover,
  and what the suite must assert, are owned by integration-testing.
---

# Integration Repo Setup

An overview, not a rulebook. The ideal setup for these repos is still being
worked out, so **read the current state of the real repos rather than trusting a
codified standard** — including this one.

## Read the living examples first

Orient yourself to the current state of the plugin repos by reading the living examples first.
Four published plugin repos exist under the `langfuse` GitHub org. Check them
locally if a clone is beside this one, otherwise read them on GitHub:

- `langfuse/Claude-Observability-Plugin` — Python, `uv` single-file hook
- `langfuse/codex-observability-plugin` — TypeScript, pnpm workspace, committed `dist/`
- `langfuse/opencode-observability-plugin` — TypeScript, npm, tsdown
- `langfuse/pi-observability-plugin` — TypeScript, npm; the most complete CI

They might disagree with each other, and none is the template. 
As mentioned, the current state is still being worked out.

## What a plugin repo needs, and where to read the real thing

This section outlines essential files and configurations that each plugin repo should have, and where to find the most up-to-date versions.
Choose the reference repo that best matches your plugin's language and structure, consider the following set ups and implement them accordingly to ensure consistency and reliability across all plugin repositories. Some might be less relevant to your specific plugin, but they provide a comprehensive overview of best practices.

| File | Read the real one at | Why |
|---|---|---|
| `.github/workflows/ci.yml` | `pi-observability-plugin` (177 lines — the most complete in the family) | host-version matrix, nightly run against host `latest`, packed-tarball install job, fail-open smoke |
| `.github/workflows/release.yml` | `pi-observability-plugin` (57 lines); all four converged on the same shape | tag → validate version against every manifest → run gates → staged publish with provenance |
| `.github/workflows/zizmor.yml` | `pi-observability-plugin` (33 lines) | workflow-security scan; codex has none and carries 6 unpinned actions |
| `.github/dependabot.yml` | `codex-observability-plugin` (19 lines — the only one with it) | weekly npm + github-actions bumps, OTEL and Langfuse grouped |
| `CONTRIBUTING.md` | `opencode-observability-plugin` (62 lines) | the check commands must stay byte-identical to what CI runs |
| `AGENTS.md` | `opencode-observability-plugin` (15 lines — the only one with it) | repo-local code conventions an agent should follow in that repo |
| `eslint.config.js` | `opencode-observability-plugin` (64 lines — the only one with it) | the conventions a reviewer would otherwise enforce by hand |
| `.github/ISSUE_TEMPLATE/` | `opencode-observability-plugin` has only a `config.yml` of contact links | **no bug-report form exists in the family.** Ask for plugin version, host-agent version, Langfuse deployment, OS and launch path, and the debug log — a host release moving a payload field is the most common cause |

All five repos are public under the `langfuse` GitHub org, so read these on
GitHub when no local clone sits beside this one.

## The few things that are settled

These came from shipped incidents rather than preference, so keep them even when
the rest of the setup is in flux:

- The release workflow **validates the tag against every manifest that carries a
  version**, before building anything.
- `permissions: {}` at workflow level, narrowest grant per job.
- Actions pinned to a full commit SHA with a `# vX.Y.Z` comment, and
  `persist-credentials: false` on checkout.
- Publish through OIDC provenance — no long-lived npm token in repo secrets.
- A prerelease tag must not take the `latest` dist-tag.
- Matrix values reach the shell as environment variables, never interpolated
  into a `run:` body.
- One CI job installs the packed artifact using the **host's own** install
  command and flags. pnpm resolves peer dependencies that a host installer may
  skip, so nothing else catches a missing runtime dependency.

## Related

- What the matrix must cover and what tests assert: [`integration-testing`](../integration-testing/SKILL.md)
- This monorepo's own git and release flow: [`git-workflow`](../git-workflow/SKILL.md)
