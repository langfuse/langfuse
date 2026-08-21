---
rule: 11
title: No new import cycles
mechanism: graph
---

# Rule 11 — no new import cycles

No runtime import cycle. The mutually-importing feature pairs that exist today
are grandfathered and form a worklist; nothing new joins them.

Type-only cycles are reported separately as a survey metric — a cycle a type
import closes carries no runtime hazard.

**Why.** Before imports routed through surfaces, a cycle was a style problem.
Once a feature is reached through its `index.ts`, a cycle means module
evaluation order decides whether a binding exists — a real,
initialisation-order runtime hazard.

**Wrong**

```text
features/dashboards → features/widgets → features/dashboards
```

**Right** — one of three ways out, decided per pair:

```text
merge the two features
invert the dependency
move the piece they both need into the top-level shared folders
```

Counted on the dependency graph, runtime edges only. List them with
`pnpm --filter web run structure:stats --rule 11`.
