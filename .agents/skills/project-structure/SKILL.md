---
name: project-structure
description: |
  The 26 project-structure rules for `web/src` and `ee/` — where a file goes,
  what it is named, and how imports cross boundaries. Use when creating,
  moving, renaming or splitting a frontend file; when deciding whether
  something belongs in a feature or a shared folder; when `structure:stats`,
  a CI check or a pre-write hook reports a rule number; or when picking
  migration work off the violation counts.
---

# Project structure

One goal: **by navigating the folders, a human must be able to tell where a
change goes.** The test — given a URL or a feature name, you can name the
folder without grepping. Agents navigate the same way humans do, so the same
structure shrinks the context needed to work in it.

## The one obligation

New code follows the rules. Existing code is where it is — we stay relaxed
about that, or the migration chases a moving target. What you must not do is
add a new violation, and the sensor is what says whether you did:

```sh
pnpm --filter web run structure:stats --diff     # what this branch added or cleared
```

The sensor is the source of truth for counts, not this document.

## Where a file goes, in four questions

1. **Who uses it?** One feature → inside that feature. Two or more → the
   top-level shared folders (`src/components`, `src/hooks`, `src/contexts`,
   `src/stores`, `src/fns`, `src/constants`, `src/types`). There is no
   `src/shared`, deliberately.
2. **What kind is it?** The closed list: `components`, `hooks`, `contexts`,
   `stores`, `fns`, `server`, `constants`, `types`. Never `utils/`, `lib/`,
   `helpers/`, `shared/`, `config/`. `docs/` and `__tests__/` may sit anywhere
   and are not kind folders.
3. **What is it called?** Components PascalCase, filename = component name.
   Everything else camelCase, filename = the export. One export per file.
4. **Who may import it?** A feature is reached only through
   `@/src/features/<feature>` or `@/src/features/<feature>/server`. Client code
   never imports `server/` except for types. Relative imports stay inside their
   own directory; anything crossing a boundary is `@/src/...`.

Full reasoning and examples in `rules/`, one file per rule.

## The 26 rules

`mechanism` is how a rule is decided: **census** from the files themselves,
**graph** from the import graph, **review** by a human, **process** by how the
commit is made, **ratchet** by a committed count that may only shrink, and
**not yet counted** by nobody — see below. Counts are a snapshot of `web/src`
on 2026-08-21 (total **2,710**) — they move, so re-read them from the sensor
rather than from here.

| # | Rule | Mechanism | Count |
| --- | --- | --- | --- |
| [1](rules/01-one-component-per-file.md) | One component per file, PascalCase filename matching it | census | 196 |
| [2](rules/02-component-file-exports-only-the-component.md) | A component file exports only the component and its types | census | 60 |
| [3](rules/03-camelcase-named-after-the-export.md) | Hooks, fns, stores, contexts, constants, types: camelCase, named after the export | census | 43 |
| [4](rules/04-one-function-per-file-in-fns.md) | One function per file in `fns/`, no dump files | census | 19 |
| [5](rules/05-kind-folders-are-a-closed-list.md) | Kind folders are a closed list | census | 102 |
| [6](rules/06-a-file-lives-where-it-is-used.md) | A file used by one feature lives in that feature | graph | 68 |
| [7](rules/07-no-importing-component-internals.md) | A component never imports another component's internals | graph | 23 |
| [8](rules/08-features-are-reached-through-a-surface.md) | Anything importing a feature goes through one of its surfaces | graph | 1,214 |
| [9](rules/09-index-files-only-at-feature-surfaces.md) | `index.ts` only at a feature root and its `server/` root | census | 42 |
| [10](rules/10-client-code-never-imports-server.md) | Client code does not import `server/`, types excepted | graph | 97 |
| [11](rules/11-no-new-import-cycles.md) | No new import cycles | graph | 8 |
| [12](rules/12-pages-are-thin-shims.md) | A `src/pages` file only imports a Page component and route config | graph | 616 |
| [13](rules/13-components-ui-is-frozen.md) | `components/ui` is frozen | census | 73 |
| [14](rules/14-design-system-components-stay-pure.md) | Design-system components hold no app state and fetch no data | review | — |
| [15](rules/15-moves-preserve-git-history.md) | Moves preserve git history: `git mv`, move ≠ edit | process | — |
| [16](rules/16-eslint-ignores-at-file-level.md) | ESLint ignores at file level only | census | 108 |
| [17](rules/17-the-baseline-only-shrinks.md) | New code follows the rules; the baseline only shrinks | ratchet | — |
| [18](rules/18-fn-and-hook-tests-colocate-flat.md) | Tests for fns and hooks sit flat next to their file | census | 24 |
| [19](rules/19-only-tests-import-tests.md) | Only tests import from `__tests__` | graph | 0 |
| [20](rules/20-no-unused-exports.md) | No unused exports | graph | 17 |
| [21](rules/21-server-only-imports-stay-in-server.md) | `@langfuse/shared/src/server` only from server code | not yet counted | — |
| [22](rules/22-shared-domain-never-imports-server.md) | In `packages/shared`, `domain/` never imports `server/` | not yet counted | — |
| [23](rules/23-test-suffix-implies-the-import-rules.md) | The test suffix implies which import rules apply | not yet counted | — |
| [24](rules/24-cross-package-moves-may-leave-a-shim.md) | Cross-package moves may leave a counted shim; inside `web`, none | not yet counted | — |
| [25](rules/25-one-name-means-one-thing.md) | Inside a feature, one name means one thing | not yet counted | — |
| [26](rules/26-relative-imports-stay-inside-their-directory.md) | Relative imports stay inside their own directory | not yet counted | — |

Rules 21–26 have no detector yet: they are on reviewers, and a violation of
one will not show up in any count.

## The fix loop

The migration is many small, boring PRs, each visibly dropping the count.

```sh
pnpm --filter web run structure:stats --next --scope src/features/traces
```

1. Take **item #1**. `--next` ranks by leverage (violations cleared × rule
   weight) and each item is sized for one PR.
2. Do the mechanical half with the codemod — it does the `git mv`, rewrites
   every importer through the TypeScript language service, and brings colocated
   tests and stories along:
   ```sh
   pnpm --filter web run structure:move <from...> <to-dir>
   ```
   The judgment half — splitting a file, renaming an export, authoring an
   `index.ts` — is yours.
3. Re-run stats. The PR body is the item headline plus the before/after counts
   from `--diff` ("rule 6: 104 → 68"). One item per PR, and no baseline
   regeneration unless that *is* the point of the PR.

Two things about `--next` that read like bugs and are not:

- A violation is attributed to where its **fix** lands, not where it is
  observed — so `--scope src/features/traces` can return an item about
  `src/features/comments`.
- Ordering matters. Moving a single-feature file home (rule 6) creates a
  cross-feature import (rule 8) if the destination feature has no `index.ts`
  yet, so surfaces (rule 9) should lead moves (rule 6).

## Enforcement today

Measured, not gated. The tooling counts violations, points at them and proposes
the rework; nothing blocks a merge on the total. Enforcement arrives one rule at
a time: when a rule's count is small enough to finish, it graduates and CI
starts failing on new violations of it.

`web/.structure-baseline.json` is the committed snapshot every delta compares
against. Re-snapshot it deliberately, as the point of its own PR.

Mechanism details, the rule → detector map and the calibration notes live in
[`web/scripts/structure/README.md`](../../../web/scripts/structure/README.md).
