# Scoped ESLint Rollout

Use lint as the ratchet at the end of a complete submodule migration, not as a
substitute for classifying effects.

## Preconditions

- The lint target has no direct React `useEffect` or `useLayoutEffect` calls.
- Every effect retained in the broader submodule synchronizes with a named
  external system and sits outside the lint target for a documented reason.
- Focused tests cover initialization, refetch, draft preservation/reset, user
  actions, and cleanup as applicable.
- The user-visible flow has been reviewed in a browser.

## Add a Flat-Config Restriction

Add a named, path-scoped block to `web/eslint.config.mjs`:

```js
{
  name: "langfuse/web/<feature>-no-use-effect",
  files: ["src/features/<feature>/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector:
          "ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name=/^use(Layout)?Effect$/]",
        message:
          "Do not import useEffect or useLayoutEffect in this module. Derive during render, gate required data before mounting a stateful child, run workflows from events, or isolate a real external integration outside this scope.",
      },
      {
        selector:
          "CallExpression[callee.type='MemberExpression'][callee.property.name=/^use(Layout)?Effect$/]",
        message:
          "Do not call React.useEffect or React.useLayoutEffect in this module. Use the approved direct-effect-free ownership patterns.",
      },
      {
        selector:
          "CallExpression[callee.type='MemberExpression'][callee.computed=true][callee.property.value=/^use(Layout)?Effect$/]",
        message:
          "Do not call a computed React effect hook in this module. Use the approved direct-effect-free ownership patterns.",
      },
    ],
  },
},
```

This uses `no-restricted-syntax` because `web/eslint.config.mjs` already has a
separate `no-restricted-imports` policy for icons. In flat config, a later rule
configuration replaces an earlier configuration for the same rule; do not
silently overwrite the icon restrictions.

Place the block after any broader config that defines `no-restricted-syntax`,
or merge the selectors into the final matching block. Use the narrowest path
that represents the completed migration. Include tests and stories unless
there is a reviewed reason not to.

## Legitimate Integration Effects

Prefer one of these outcomes, in order:

1. use an existing effect-free subscription primitive;
2. move the integration to a pre-existing shared hook outside the clean
   submodule;
3. narrow the lint scope around an explicitly named integration boundary;
4. propose a file-level flat-config exception with a written rationale.

Do not move ordinary state synchronization into an “integration” folder merely
to pass lint. Do not add inline disables. Any new or widened lint exception
requires explicit user approval for the exact rule and scope.

Do not create feature-local aliases or wrapper hooks to evade the restriction.
The lint rule is a backstop for direct React effects, not proof that a migration
did not hide synchronization in an imported hook; review the inventory and
ownership boundaries for that guarantee.

## Verify the Ratchet

Run a direct lint check that bypasses stale cache entries, then the normal web
lint:

```bash
pnpm --filter web exec eslint 'src/features/<feature>/**/*.{ts,tsx}' --no-cache --max-warnings 0
pnpm --filter web run lint
```

Prove the rule catches conventional `useEffect`, `useLayoutEffect`, and
`React.useEffect` usage before finalizing it: temporarily add a minimal import
or call in a target file, run the direct lint check and observe the expected
failure, then revert that temporary probe. Never leave the probe in the
worktree. Do not add a source-inspection test that duplicates the lint rule.

Search once more for audit visibility:

```bash
rg -n '\b(use(?:Layout)?Effect|React\.use(?:Layout)?Effect)\b' 'web/src/features/<feature>'
```

The ESLint result is the enforcement evidence; the text search is a readable
cross-check.
