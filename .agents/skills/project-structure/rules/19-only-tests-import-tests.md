---
rule: 19
title: Only tests import from __tests__, at any level
mechanism: graph
---

# Rule 19 — `__tests__` is for tests only

`__tests__` is a pattern at every level: a component can have one, a feature
can have one, and the global `src/__tests__` stays. It holds support material —
builders, mocks, harnesses, fixtures, seed data — plus the tests that don't
belong to a single module. Test files themselves still colocate next to what
they test.

Hard rule: only tests (and other `__tests__` modules) import from `__tests__`.
Production code never does. The usual import directions apply on top — a
feature's `__tests__` may use the global one, never the reverse, and one
feature's tests don't reach into another feature's `__tests__`.

Placement follows usage, like everything else: reusable across features → the
global `src/__tests__`; used by one feature → that feature's.

**Why.** A fixture imported by production code ships to users, and a shared
mock imported across features couples two test suites that should be able to
change independently.

**Wrong**

```ts
// features/traces/fns/buildTree.ts
import { traceFixture } from "@/src/__tests__/fixtures/trace";
```

**Right**

```ts
// features/traces/fns/buildTree.clienttest.ts
import { traceFixture } from "@/src/__tests__/fixtures/trace";
```

Counted on the dependency graph: edges into `__tests__` from non-test modules,
plus cross-feature test edges. List them with
`pnpm --filter web run structure:stats --rule 19`.
