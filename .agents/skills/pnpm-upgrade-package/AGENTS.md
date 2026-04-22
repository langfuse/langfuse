# PNPM Upgrade Package

Use this workflow when a user wants to upgrade a dependency in the Langfuse
pnpm workspace.

## Workflow

1. Collect missing inputs.
   - Ask for the package if missing.
   - Ask for the target version if missing.
   - If the user says `latest`, resolve the real registry latest first.

2. Run the main helper once.
   - Run
     `node .agents/skills/pnpm-upgrade-package/scripts/check-release-age-window.mjs <package> <targetVersion>`.
   - Treat this as the single source of truth for:
     - direct workspace references
     - root `pnpm.overrides` / `pnpm.patchedDependencies`
     - latest registry version
     - latest version installable under the current release-age rules
     - existing matching `minimumReleaseAgeExclude` entries
     - exact dependency companions from `dependencies` and `optionalDependencies`
     - exact peer dependencies that are actually installed in the workspace

3. Handle the transitive-only case before editing anything.
   - If the helper shows no direct workspace references, run `pnpm why -r <package>`.
   - Identify the current top-level parent that pulls the package in.
   - Check whether that parent's current dependency range already permits the
     requested transitive version.
   - If the current parent range already covers the requested version, prefer a
     lock refresh / reinstall path before changing `package.json`.
   - If the current parent range does not cover the requested version, upgrade
     the direct parent dependency that pulls the package in.
   - If a compatible transitive package still stays pinned after the normal
     refresh path, you may suggest `pnpm dedupe` to the user as an optional
     manual follow-up, but do not run it automatically and do not require it.
   - Do not add the transitive package directly unless the user explicitly asks.

4. Ask before changing `minimumReleaseAgeExclude`.
   - Prefer `package@version` entries.
   - Only use bare `package` entries after explicit approval.
   - Ask about exact companion packages only when the helper says they still
     need a new exclusion.
   - Treat range-based dependency or peer entries as manual review.

5. Bump at the narrowest useful scope.
   - `pnpm -w up <package>@<version>` for root-only changes.
   - `pnpm --filter <workspace> up <package>@<version>` for one workspace.
   - `pnpm -r up <package>@<version>` only when every current reference should move.
   - Do not hand-edit `pnpm-lock.yaml`.

6. Validate.
   - Use the nearest package `AGENTS.md` plus the root verification matrix.
   - Finish with `pnpm why -r <package>`.
   - If companions moved too, run `pnpm why -r <companion-package>` for them as well.

## Quick Commands

- Run the single analysis pass:
  `node .agents/skills/pnpm-upgrade-package/scripts/check-release-age-window.mjs <package> <targetVersion>`
- Transitive provenance check:
  `pnpm why -r <package>`
- Inspect the current parent manifest on the registry:
  `npm view <parent>@<installedVersion> dependencies peerDependencies optionalDependencies --json`
- Final graph verification:
  `pnpm why -r <package>`
- Bump in the root workspace:
  `pnpm -w up <package>@<version>`
- Bump in one workspace:
  `pnpm --filter web up <package>@<version>`
- Bump everywhere that should move together:
  `pnpm -r up <package>@<version>`
