# PNPM Upgrade Package

Use this workflow when a user wants to upgrade a dependency in the Langfuse
pnpm workspace.

## Workflow

1. Collect the missing inputs.
   - Ask for the package name if it was not passed in the request.
   - Ask for the target version if it was not passed in the request.
   - If the user says `latest`, resolve the actual latest registry version and
     use that as the target version.

2. Run the main analysis once, at the start.
   - Run
     `node .agents/skills/pnpm-upgrade-package/scripts/check-release-age-window.mjs <package> <targetVersion>`.
   - Do not run a second discovery pass unless the helper output is missing
     something you need.
   - Start with the dependency and peer surface before deciding scope.
   - Use this one output for:
     - where the package is installed
     - whether root `pnpm.overrides` or `pnpm.patchedDependencies` apply
     - whether `minimumReleaseAgeExclude` already covers the target version
     - which direct dependencies or locally installed exact peer dependencies
       need companion exclusions
   - If the helper shows no direct workspace references, treat the package as a
     transitive-only candidate until proven otherwise.
   - In that case, run `pnpm why -r <package>` before editing anything.
   - Use the `why` output to identify which direct dependency introduces the
     package, then check whether upgrading that parent dependency is the real
     change you should make.
   - Do not add the target package directly just because it is present in the
     lockfile unless the user explicitly wants to add it as a direct dependency.

3. Ask about `minimumReleaseAgeExclude` before editing it.
   - If the target version is newer than the latest version installable under
     the current `minimumReleaseAge`, ask whether to add an exclusion.
   - Prefer a version-specific exclusion like `package@1.2.3`.
   - Add a package-wide exclusion like `package` only after explicit user
     approval.
   - If the script flags exact-version direct dependencies that are also too
     new, ask whether to add version-specific exclusions for those packages too.
   - If the script flags locally installed exact peer dependencies that are too
     new, ask whether to add version-specific exclusions for those packages too.
   - If the script lists range-based direct dependencies or peers for manual
     review, only add exclusions after confirming the resolved version really
     needs it.

4. Bump the dependency at the narrowest useful scope.
   - Use `pnpm -w up <package>@<version>` for root-only dependencies.
   - Use `pnpm --filter <workspace> up <package>@<version>` for one workspace.
   - Use `pnpm -r up <package>@<version>` only when every current workspace
     reference should move together.
   - Use the workspace-reference output from the first analysis step to choose
     the narrowest scope.
   - For transitive-only packages, bump the direct parent package that `pnpm why
     -r` identified instead of the transitive package itself, unless the user
     explicitly asked to add the transitive package as a direct dependency.
   - Do not hand-edit `pnpm-lock.yaml`.

5. Update `pnpm-workspace.yaml` if approved.
   - Keep exclusions narrow by default.
   - Preserve existing formatting and nearby comments.
   - Prefer adding exact-version entries for one-off upgrades.

6. Validate the upgrade.
   - Use the verification matrix in root `AGENTS.md`.
   - Open the nearest package `AGENTS.md` when the change is package-specific.
   - Run broader checks when the dependency is shared across `web`, `worker`,
     `packages/shared`, or `ee`.
   - Run `pnpm why -r <package>` as a final dependency-graph check.
   - If the upgrade also moved tightly coupled companions, run
     `pnpm why -r <companion-package>` for those too.

## Quick Commands

- Run the single analysis pass:
  `node .agents/skills/pnpm-upgrade-package/scripts/check-release-age-window.mjs <package> <targetVersion>`
- Transitive provenance check:
  `pnpm why -r <package>`
- Final graph verification:
  `pnpm why -r <package>`
- Optional local-only debug view:
  `node .agents/skills/pnpm-upgrade-package/scripts/find-package-references.mjs <package>`
- Bump in the root workspace:
  `pnpm -w up <package>@<version>`
- Bump in one workspace:
  `pnpm --filter web up <package>@<version>`
- Bump everywhere that should move together:
  `pnpm -r up <package>@<version>`
