---
rule: 21
title: The shared server entrypoints may only be imported from server code
mechanism: not yet counted
---

# Rule 21 — `@langfuse/shared/src/server` is server-only

`@langfuse/shared/src/server` and `@langfuse/shared/src/db` may be imported
only from:

- inside a `server/` folder — `server/` means node, wherever it sits
- `src/pages/api/**`
- `*.servertest.*` files
- `worker/**`

Everything else imports `@langfuse/shared`.

**Why.** Importing the server barrel evaluates Prisma, ClickHouse and ioredis.
In a jsdom test that succeeds silently, so the boundary erodes without a single
failure: one client test needed a plain-data preset catalogue whose only export
path was the server barrel, and the fix was this RFC's own placement rule
applied one layer down — the file was domain code living in a server folder.

**Wrong**

```ts
// features/traces/components/TraceTable/TraceTable.tsx
import { getTracesTable } from "@langfuse/shared/src/server";
```

**Right**

```ts
import type { TracesTableRow } from "@langfuse/shared";
// behaviour comes through tRPC; the server import lives in features/traces/server/
```

No detector yet — this one is on reviewers. See
[rule 22](22-shared-domain-never-imports-server.md) for the same boundary
inside `packages/shared`.
