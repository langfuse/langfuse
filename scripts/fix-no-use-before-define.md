# Safe no-use-before-define fixes

```sh
node scripts/fix-no-use-before-define.mjs          # Dry run
node scripts/fix-no-use-before-define.mjs --write  # Apply fully fixable files
node scripts/fix-no-use-before-define.mjs --check  # Audit modified TS files against HEAD
node --test scripts/fix-no-use-before-define.test.mjs
```

Uses the installed TypeScript compiler and ESLint; no additional dependencies.
Targets tracked TypeScript files with an initial `eslint-disable` comment for
`@typescript-eslint/no-use-before-define`. Other disabled rules are preserved.

Only ordinary top-level function declarations and erased type declarations can
move. A symbol dependency graph determines their order in one pass. Runtime
statements keep their original order; declaration text and attached comments
remain unchanged. Files with unsafe dependencies, cycles, overload groups,
comment directives, or unresolved diagnostics are skipped without partial edits.
This is intentionally conservative, not a general-purpose declaration sorter.

The transform runs only the target ESLint rule, without project-aware parsing,
before and after reordering. Repository lint and typecheck are separate checks:

```sh
pnpm exec turbo run typecheck lint --filter=@langfuse/shared --filter=web --filter=worker --continue=always
```

`--check` checks statement/comment conservation, runtime statement order, overload
safety, and the target rule. It assumes modified tracked TypeScript files belong
to this codemod; unrelated edits will be reported as failures. It does not replace
repository validation or runtime tests.
