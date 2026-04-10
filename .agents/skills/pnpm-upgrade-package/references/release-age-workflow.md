# Release-Age Workflow

Use this reference when the upgrade may need a `minimumReleaseAgeExclude`
change.

## Inputs

- Package name: required
- Target version: required for the actual bump
- Registry latest version: resolve before deciding whether `latest` is blocked
  by the release-age window

If the user did not provide the package name or target version, ask before
changing files.

## Main Analysis

Run:

```bash
node .agents/skills/pnpm-upgrade-package/scripts/check-release-age-window.mjs <package> <targetVersion>
```

Use this single analysis pass to answer these questions:

1. Where is the target package installed in the workspace?
2. Is the package controlled by root `pnpm.overrides` or
   `pnpm.patchedDependencies`?
3. What is the registry latest version?
4. What is the target version?
5. What is the latest version installable without adding a new exclusion?
6. Is the target version already covered by an existing exclusion?
7. Which exact-version direct dependencies are also younger than the current
   release-age threshold?
8. Which exact-version peer dependencies are installed in the workspace and
   also younger than the current release-age threshold?
9. Which range-based dependencies or peers need manual review?

Use `find-package-references.mjs` only if you need a smaller local-only debug
view after the main analysis pass.

## Transitive-Only Case

If the main analysis shows no direct workspace references:

1. Run `pnpm why -r <package>`.
2. Identify which direct dependency or workspace package introduces the target
   package.
3. Check whether upgrading that direct parent dependency is the real requested
   change.
4. Only add the target package as a new direct dependency if the user
   explicitly wants that behavior.

## Decision Rules

1. If the target version is already installable under the current
   `minimumReleaseAge` window, do not add a new exclusion.
2. If the target version is newer than the latest installable version, ask the
   user whether to add an exclusion.
3. Prefer `package@version` entries over bare `package` entries. Use a bare
   package entry only after explicit approval to unblock future releases too.
4. If an exact-version direct dependency is also younger than the threshold,
   ask whether to add an exact-version exclusion for that dependency.
5. If an exact-version peer dependency is installed in the workspace and is
   also younger than the threshold, ask whether to add an exact-version
   exclusion for that peer package too.
6. Treat range-based direct dependencies and range-based peers as manual review
   cases. Only add an exclusion if the resolved version actually needs it.
7. Do not add exclusions for peer dependencies that are not installed anywhere
   in the workspace.
8. If the package is only present transitively, prefer upgrading the direct
   parent dependency over adding the transitive package as a new top-level
   dependency.

## Registry Fallback

Use raw registry commands only when the helper script is not enough:

```bash
npm view <package> version time --json
npm view <package>@<version> dependencies peerDependencies --json
```

The helper script is preferred because it already combines the registry data
with the local `pnpm-workspace.yaml` settings.
