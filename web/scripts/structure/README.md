# structure:stats — the project-structure RFC dashboard

Counts violations of the [web project-structure RFC](https://linear.app/clickhouse/document/langfuse-web-project-code-structure-rfc-ecbc304915d6)
(meta LFE-14748) per rule, so migration progress is one visible number.

```sh
pnpm structure:stats                          # per-rule counts (+ Δ vs baseline)
pnpm structure:stats --rule 8                 # list rule 8's offending imports
pnpm structure:stats --scope src/features/traces   # counts for one subtree
pnpm structure:stats --diff                   # what got fixed / added vs baseline
pnpm structure:stats --baseline               # re-snapshot .structure-baseline.json
pnpm structure:stats --json                   # machine-readable
```

A full run takes ~3s (dependency-cruiser graph) + ~1s (TS-parse census).
`.structure-baseline.json` is committed; regenerate it deliberately after a
fix batch so the Δ column and `--diff` track real progress.

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
