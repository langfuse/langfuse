---
rule: 23
title: The test suffix implies which import rules apply
mechanism: not yet counted
---

# Rule 23 — the suffix is the contract

- `*.clienttest.*` obeys the client rules: no server barrel, no `server/`
  imports beyond types.
- `*.servertest.*` may import `@langfuse/shared/src/server`.

**Why.** The suffix already decides which vitest project runs the file and in
which environment. Making it decide the import rules too means one visible
token carries the whole contract, instead of a reader having to know which
runtime a given test happens to boot.

**Wrong**

```ts
// fns/buildTree.clienttest.ts
import { getTracesTable } from "@langfuse/shared/src/server";
```

**Right**

```ts
// fns/buildTree.clienttest.ts — plain data in, plain data out
import { buildTree } from "./buildTree";
```

No detector yet — this one is on reviewers. See
[rule 21](21-server-only-imports-stay-in-server.md).
