---
rule: 7
title: A component never imports another component's internals
mechanism: graph
---

# Rule 7 — never reach inside another component

A component may import another component's root entry. It may not reach past
it into that component's `components/`, `fns/` or `hooks/`. If it wants
something in there, promote that thing to a sibling of the importer first.

A component boundary is any PascalCase directory; its public entry is
`<Name>.tsx`.

**Why.** Reaching inside makes the inner file public without anyone deciding
that it should be. The owning component can no longer be refactored without
breaking a stranger, which is exactly the coupling folders were supposed to
prevent.

**Wrong**

```ts
// components/TraceTable/TraceTable.tsx
import { formatSpanLabel } from "@/src/features/traces/components/TraceGraphView/fns/formatSpanLabel";
```

**Right**

```ts
// promoted to the nearest common ancestor first
import { formatSpanLabel } from "@/src/features/traces/fns/formatSpanLabel";
```

Counted on the dependency graph, walking component boundaries deepest-first.
List them with `pnpm --filter web run structure:stats --rule 7`.
