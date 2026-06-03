---
name: pnpm-upgrade-package
description: >-
  Upgrade pnpm workspace dependencies to target/latest versions:
  direct/transitive bumps, release-age checks, temporary overrides,
  minimumReleaseAgeExclude, lockfile/dedupe verification.
---

# PNPM Upgrade Package

Use this skill for interactive dependency bumps in Langfuse.

## Read Order

- Use this `SKILL.md` for the end-to-end workflow.
- Run the main helper once at the start of the upgrade:
  `node .agents/skills/pnpm-upgrade-package/scripts/check-release-age-window.mjs <package> [targetVersion]`

## Apply This Skill

- Ask for the package name if the user did not provide one.
- Ask for the target version if the user did not provide one.
- Run the main helper once as the first analysis step and use that single
  output for scope, exclusion decisions, and the final bump.
- If the target package is not directly declared anywhere, run
  `pnpm why -r <package>` to find which direct dependency brings it in, then
  inspect whether the current top-level parent already allows the requested
  transitive version via its dependency range.
- If the current parent range already covers the requested transitive version,
  prefer a lockfile refresh / reinstall path over bumping the parent manifest.
- If the current parent range does not cover the requested transitive version,
  upgrade that parent dependency instead of adding the target package directly
  unless the user explicitly wants that.
- If pnpm will not move an already-allowed transitive version, a scoped
  `overrides` entry in `pnpm-workspace.yaml` may be used as a temporary
  resolution tool. Before finishing, prove whether the override is still
  required: remove it, run `pnpm install`, then run `pnpm dedupe`. Inspect the
  diff after each generated change. If the target version remains without the
  override, do not keep the override; keep or restore it only when pnpm reverts
  or drifts from the requested version without it.
- Never manually edit `pnpm-lock.yaml`; regenerate lockfile changes with
  `pnpm` commands only. If a lockfile-only refresh causes unrelated churn,
  adjust the pnpm command and rerun instead of patching the lockfile by hand.
- After fixing or upgrading a package, run `pnpm dedupe`. Always inspect the
  diff after dedupe and revert that generated attempt if it introduces
  unrelated churn.
- Resolve the registry latest version, but do not silently upgrade to latest
  unless the user asked for latest.
- Compare the target version with the latest version installable under the
  current `minimumReleaseAge` window.
- Ask before adding `minimumReleaseAgeExclude` entries for the target package,
  exact dependency companions from `dependencies` or `optionalDependencies`, or
  locally installed exact peer dependencies.
- Finish with `pnpm why -r <package>` to confirm that only the intended version
  remains in the workspace.

## Quick Commands

- Analysis pass:
  `node .agents/skills/pnpm-upgrade-package/scripts/check-release-age-window.mjs <package> <targetVersion>`
- Transitive provenance check:
  `pnpm why -r <package>`
- Inspect a current parent manifest on the registry:
  `npm view <parent>@<installedVersion> dependencies peerDependencies optionalDependencies --json`
- Final graph verification:
  `pnpm why -r <package>`
- Optional lockfile cleanup:
  `pnpm dedupe`
- Bump in the root workspace:
  `pnpm -w up <package>@<version>`
- Bump in one workspace:
  `pnpm --filter web up <package>@<version>`
- Bump everywhere that should move together:
  `pnpm -r up <package>@<version>`
- Verify temporary override removal:
  remove the override, then run `pnpm install` and `pnpm dedupe`
