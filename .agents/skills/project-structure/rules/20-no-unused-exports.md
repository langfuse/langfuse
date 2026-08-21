---
rule: 20
title: No unused exports — if nothing imports it, it isn't exported
mechanism: graph
---

# Rule 20 — an export nobody imports is not an export

If nothing imports a symbol, it is either dead code or a private helper
pretending to be public. Delete it, or drop the `export`.

The converse of [rule 4](04-one-function-per-file-in-fns.md)'s split rule: we
split a file when something new needs to be exported, and we unexport when
nothing needs it any more.

**Why.** Every export is a promise. An unread one still shows up in
autocomplete, still gets imported by mistake, and still blocks a refactor that
would otherwise be local. Exporting an internal purely so a test can reach it
is the most common way this happens, and it is not allowed.

**Wrong**

```ts
export const parseFilter = (raw: string) => …   // no importer; a test reaches for it
```

**Right**

```ts
const parseFilter = (raw: string) => …          // private, tested through the public API
```

Currently counted at file level — modules nothing imports. Symbol-level
detection needs a knip config and is a follow-up; string-referenced modules
(worker URLs, route strings) are invisible to the graph, so `src/workers`,
`scripts/` and Next entry points are excluded.

List them with `pnpm --filter web run structure:stats --rule 20`.
