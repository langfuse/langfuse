---
rule: 10
title: Client code does not import from server/, types excepted
mechanism: graph
---

# Rule 10 — client code never imports `server/`

A file outside a `server/` folder may not import a module inside one. Type-only
imports are the exception.

`server/` means node, wherever it sits — a feature's `server/`, a component's,
`packages/shared/src/server`.

**Why.** Nothing crashes when a client module imports server code: the bundler
pulls Prisma, ClickHouse and ioredis into the browser graph, the import
evaluates, and the boundary erodes silently. Type imports are erased at
compile time, so they carry no runtime cost and stay allowed.

**Wrong**

```ts
// features/traces/components/TraceTable/TraceTable.tsx
import { deleteTrace } from "../../server/deleteTrace";
```

**Right**

```ts
import type { TraceRow } from "../../server/types";      // type-only: fine
// and reach the behaviour through tRPC, not by importing the server module
```

Server code that sits *outside* `server/` — a `*Router.ts` next to components —
shows up here as its imports. Moving it into `server/` clears them.

Counted on the dependency graph, excluding type-only edges. List them with
`pnpm --filter web run structure:stats --rule 10`.
