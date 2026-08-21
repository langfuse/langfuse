---
rule: 4
title: One function per file in fns/, no dump files
mechanism: census
---

# Rule 4 — one function per file in `fns/`

Each file in `fns/` exports one function. No `utils.ts`, no `helpers.ts`, no
`index.ts` collecting several. Many small files beat few large ones.

When a set of functions is one engine rather than one function, group it in a
module folder: `fns/searchJson/` holding `matchNode.ts`, `buildIndex.ts`,
`rankHits.ts`. The grouping lives in the folder name, so every file still has
one export and `fns/` doesn't become a hundred flat files. A module folder
holds modules only — the moment it wants `components/`, it is a feature.

**Why.** A dump file is a shared surface nobody designed: every consumer pulls
the whole file's imports, and the file's history becomes unreadable because
five unrelated functions change in it.

**Wrong**

```text
fns/utils.ts        → formatCost, parseFilter, buildTree
fns/index.ts        → re-exports the above
```

**Right**

```text
fns/formatCost.ts
fns/parseFilter.ts
fns/searchJson/matchNode.ts
fns/searchJson/buildIndex.ts
fns/searchJson/__tests__/matchNode.clienttest.ts
```

Counted from a TS parse: value-export count per file in `fns/`, plus a closed
list of dump filenames. List them with
`pnpm --filter web run structure:stats --rule 4`.
