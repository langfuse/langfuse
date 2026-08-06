# structure:\* — the project-structure RFC panel

`structure:stats` says what is wrong and ranks what to fix next;
`structure:move` does the mechanical half of the fix. The loop they exist for is
many small, boring PRs, each visibly dropping the count:

1. `pnpm structure:stats --next --scope <area>` → take item #1.
2. Mechanical part via `pnpm structure:move`; judgment part (splits, renames,
   authoring an `index.ts`) by hand.
3. Re-run stats. The PR body is the item headline plus the before/after counts
   from `--diff` ("rule 6: 104 → 63"). One item per PR; no baseline
   regeneration unless it is the point of the PR.

# structure:stats — the RFC dashboard

Counts violations of the [web project-structure RFC](https://linear.app/clickhouse/document/langfuse-web-project-code-structure-rfc-ecbc304915d6)
(meta LFE-14748) per rule, so migration progress is one visible number.

```sh
pnpm structure:stats                          # per-rule counts (+ Δ vs baseline)
pnpm structure:stats --rule 8                 # list rule 8's offending imports
pnpm structure:stats --scope src/features/traces   # counts for one subtree
pnpm structure:stats --diff                   # what got fixed / added vs baseline
pnpm structure:stats --baseline               # re-snapshot .structure-baseline.json
pnpm structure:stats --next [n]               # top n ranked work items (default 6)
pnpm structure:stats --json                   # machine-readable (also with --next)
```

A full run takes ~3s (dependency-cruiser graph) + ~1s (TS-parse census).
`.structure-baseline.json` is committed; regenerate it deliberately after a
fix batch so the Δ column and `--diff` track real progress.

## What to fix next

`--next` turns the violation lists into ranked work items, each sized for one
small PR: every violation is attributed to the path where its fix lands (the
file to split, the folder to move, the feature that needs an `index.ts`),
subjects roll up to a directory when one rule dominates the subtree, and a
greedy pass picks the highest-leverage item, consumes its violations, and
rescores. Leverage = violations cleared × rule weight (`RULE_WEIGHTS` in
`next.mjs` — runtime hazards outrank naming nits). The intended loop:
`--next --scope <area>` → fix item 1 as its own PR → re-run.

## structure:move — a move with the imports carried along

```sh
pnpm structure:move <from...> <to-dir>       # files and/or folders, batched
pnpm structure:move --dry-run src/hooks/useFoo.ts src/features/bar/hooks
```

Flags: `--dry-run` (print the plan and every rewrite, change nothing),
`--no-siblings`, `--no-verify` (skip the closing `tsc` + `--diff`), `--no-color`.

The rewrites come from TypeScript's own
`LanguageService.getEditsForFileRename` over `web/tsconfig.json` — the exact
primitive VS Code's "move file" uses — so `@/src/...` aliases, extension-less
specifiers, index resolution and literal dynamic `import()` are the compiler's
problem, not ours. Booting the service costs ~5–15s and every move after that
is instant, which is why the CLI is batch-shaped.

- **Batch moves need a live layout.** The host is mutable: each rename bumps the
  affected script versions and the project version, so move #2 computes its
  edits against the tree move #1 produced. Freeze those versions and the second
  move's spans are offsets into stale text — it shreds any importer that both
  moves touch, silently. That is the whole reason this is a script and not a
  `for` loop around a fresh program.
- **Colocated siblings come along.** `X.tsx` brings `X.clienttest.tsx`,
  `X.stories.tsx`, `X.fixtures.ts` (and `.servertest`/`.test`/`.spec`/`.module`),
  both flat next to it and from its `__tests__/` — where they land in a
  `__tests__/` at the destination. `--no-siblings` opts out. The tag list is
  closed on purpose, so `index.ts` never drags `index.tsx` along.
- **Move ≠ edit (rule 15).** Rewrites land in importers. A moved file may only
  change where an alias self-reference (`@/src/<old path>/sibling`) has to
  follow the subtree it is part of; those are listed separately. A rewrite that
  would point a moved file at something left behind aborts the whole batch —
  move that sibling too, or do the move by hand.
- **History is preserved**: `git mv`, so `log --follow` and `blame -C` keep
  working. Importer rewrites go through prettier (a longer specifier can push a
  line past the print width) and are staged.
- **Nothing is destructive.** No `reset`, no `stash`, no `checkout --`. Failures
  print the way back — which is the inverse `structure:move`, not a reset.
- **Idempotent**: everything already at the destination is a no-op, exit 0.
- **Blind spot, surfaced not solved**: modules named by string (`vi.mock` paths,
  worker URLs, route strings) are invisible to the compiler, so `tsc` stays
  green while they dangle. Each run greps the repo for the old path and prints
  every surviving hit — fix those by hand. Not theoretical: the
  `AdvancedJsonViewer` calibration move left three `vi.mock()` paths behind and
  six tests failed under a green typecheck.

Renames and splits are not part of the surface (follow-up LFE-14806).

## Rule → mechanism

| Rule   | What                                                | Counted by                                                               |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------------ |
| 1–4    | component/hook/fn/store/context file shape + naming | census (TS parse)                                                        |
| 5      | kind folders closed list                            | census (dir walk)                                                        |
| 6      | single-feature files live in the feature            | graph (used-in inversion)                                                |
| 7      | no importing another component's internals          | graph + `.dependency-cruiser.js`                                         |
| 8      | cross-feature imports via feature `index.ts`        | graph + `.dependency-cruiser.js`                                         |
| 9      | `index.ts` only at feature roots, re-exports only   | census                                                                   |
| 10     | no client → `server/` (types excepted)              | graph + `.dependency-cruiser.js`                                         |
| 11     | no runtime import cycles                            | graph + `.dependency-cruiser.js`                                         |
| 12     | `src/pages` files import only a Page component      | graph + `.dependency-cruiser.js`                                         |
| 13     | `components/ui` frozen                              | census (file count, baseline ratchets adds)                              |
| 14, 15 | design-system purity; git-mv moves                  | review / process — not counted                                           |
| 16     | ESLint ignores at file level only                   | census (line-level disables)                                             |
| 17     | baseline only shrinks                               | this baseline + `--diff`                                                 |
| 18     | fn/hook tests colocated flat                        | census                                                                   |
| 19     | only tests import `__tests__`                       | graph + `.dependency-cruiser.js`                                         |
| 20     | no unused exports                                   | graph (file-level orphans; symbol-level needs a knip config — follow-up) |

`.dependency-cruiser.js` carries the import rules as CI-ready warnings; the
detectors here are the exact reference implementation (the config's regex
approximations under-count some nested-component cases — see its header).

## Calibration notes (as of the reworked traces feature, #15784)

- Component boundary (rules 7/9) = any PascalCase directory; its public entry
  is `<Name>.tsx` (index files are tolerated by rule 7 so rule 9 flags each
  exactly once). Lowercase dirs (`components/ui`, `components/table`) are
  legacy containers, not boundaries.
- Context modules: `FooContext.tsx` exporting `FooContext` + `FooProvider` +
  `useFoo*` counts as one unit; anything beyond flags rule 3. The RFC has no
  explicit contexts pattern yet — policy gap, see the audit in LFE-14781.
- Cycles that a type-only edge breaks are not runtime hazards; they are
  reported as a survey metric, not rule 11.
- Server code placed outside `server/` (e.g. `*Router.ts` beside components)
  surfaces as rule-10 hits of its imports; moving it into `server/` clears
  them. `server/` internals themselves are not structured by the RFC (rules
  5/9 skip below `server/`).
- Rule 6/20 caveat: string-referenced modules (worker URLs, route strings)
  are invisible to the graph; `src/workers`, `scripts/`, Next entries are
  excluded from rule 20.
