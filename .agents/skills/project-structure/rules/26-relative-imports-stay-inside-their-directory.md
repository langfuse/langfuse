---
rule: 26
title: Relative imports reach inside their own directory only
mechanism: not yet counted
---

# Rule 26 — relative inside, absolute across

A relative import may reach inside its own directory. Anything crossing a
directory boundary is absolute — `@/src/...`.

**Why.** This is what makes [rule 15](15-moves-preserve-git-history.md)
possible. A moved file's absolute imports stay valid, so the file itself does
not change when it moves — only its importers do, and those are different files
with their own untouched history. A file whose relative imports reach out of
its own directory cannot move without a content edit, which is precisely what
a move is not allowed to contain. Five files in traces were blocked exactly
that way; the move tool refuses to do that rewrite silently.

**Wrong**

```ts
// features/traces/components/TraceTable/TraceTable.tsx
import { formatCost } from "../../../fns/formatCost";
```

**Right**

```ts
import { formatCost } from "@/src/features/traces/fns/formatCost";
import { TraceRow } from "./TraceRow";              // same directory: fine
```

Absolutise first, in its own commit, then move. No detector yet.
