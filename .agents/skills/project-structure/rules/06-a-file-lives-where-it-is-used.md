---
rule: 6
title: A file used by one feature lives in that feature
mechanism: graph
---

# Rule 6 — a file lives where it is used

Used by one feature: it belongs inside that feature. Used by two or more: it
belongs in a top-level shared folder — `src/components`, `src/hooks`,
`src/contexts`, `src/stores`, `src/fns`, `src/constants`, `src/types`.

There is deliberately no `src/shared`. Whatever sits in `src/components` is
shared *by definition*, because anything used by a single feature gets moved
into that feature.

**Why.** This makes the shared area self-cleaning. Over time the top-level
folders become an actual inventory of shared code instead of a dumping ground,
and a reader can trust that a file's location tells them who uses it.

**Wrong**

```text
src/hooks/useFormPersistence.ts     → imported only by features/prompts
```

**Right**

```text
src/features/prompts/hooks/useFormPersistence.ts
```

Do the move with the codemod, never by hand:
`pnpm --filter web run structure:move src/hooks/useFormPersistence.ts src/features/prompts/hooks`.

Counted by inverting the dependency graph: for each file in a shared folder,
the set of features importing it. List them with
`pnpm --filter web run structure:stats --rule 6`.

Note the ordering trap: moving a single-feature file home creates a
cross-feature import (rule 8) when the destination feature has no `index.ts`
yet. Give the feature a surface first — see [rule 9](09-index-files-only-at-feature-surfaces.md).
