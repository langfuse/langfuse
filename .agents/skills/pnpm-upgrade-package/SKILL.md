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

- Start with [AGENTS.md](AGENTS.md) for the end-to-end workflow.
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
  `overrides` entry may be used as a temporary resolution tool. After the
  lockfile moves, remove the temporary override, run `pnpm install`, then run
  `pnpm dedupe` when permitted. If the lockfile stays at the target without the
  override, do not keep the override.
- Never manually edit `pnpm-lock.yaml`; regenerate lockfile changes with
  `pnpm` commands only. If a lockfile-only refresh causes unrelated churn,
  adjust the pnpm command and rerun instead of patching the lockfile by hand.
- After fixing or upgrading a package, run `pnpm dedupe` when it is needed to
  verify temporary resolver cleanup or when the user permits it; otherwise
  suggest it as optional cleanup. Always inspect the diff after dedupe.
- Resolve the registry latest version, but do not silently upgrade to latest
  unless the user asked for latest.
- Compare the target version with the latest version installable under the
  current `minimumReleaseAge` window.
- Ask before adding `minimumReleaseAgeExclude` entries for the target package,
  exact dependency companions from `dependencies` or `optionalDependencies`, or
  locally installed exact peer dependencies.
- Finish with `pnpm why -r <package>` to confirm that only the intended version
  remains in the workspace.
