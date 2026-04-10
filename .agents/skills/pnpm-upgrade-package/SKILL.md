---
name: pnpm-upgrade-package
description: Use when upgrading a dependency in this pnpm workspace, including requests to bump a package to a specific version, compare the registry latest version with the latest version installable under the current minimum-release-age window, or decide whether minimumReleaseAgeExclude in pnpm-workspace.yaml must change. Ask the user for the package name or target version when either is missing.
---

# PNPM Upgrade Package

Use this skill for interactive dependency bumps in Langfuse.

## Read Order

- Start with [AGENTS.md](AGENTS.md) for the end-to-end workflow.
- Open [references/release-age-workflow.md](references/release-age-workflow.md)
  for the `minimumReleaseAgeExclude` decision rules.
- Run the main helper once at the start of the upgrade:
  `node .agents/skills/pnpm-upgrade-package/scripts/check-release-age-window.mjs <package> [targetVersion]`
- Use `find-package-references.mjs` only as a debug fallback if you need a
  smaller local-only view.

## Apply This Skill

- Ask for the package name if the user did not provide one.
- Ask for the target version if the user did not provide one.
- Run the main helper once as the first analysis step and use that single
  output for scope, exclusion decisions, and the final bump.
- If the target package is not directly declared anywhere, run
  `pnpm why -r <package>` to find which direct dependency brings it in, then
  upgrade that parent dependency instead of adding the target package directly
  unless the user explicitly wants that.
- Resolve the registry latest version, but do not silently upgrade to latest
  unless the user asked for latest.
- Compare the target version with the latest version installable under the
  current `minimumReleaseAge` window.
- Ask before adding `minimumReleaseAgeExclude` entries for the target package,
  related exact-version direct dependencies, or locally installed exact peer
  dependencies.
- Finish with `pnpm why -r <package>` to confirm that only the intended version
  remains in the workspace.
