---
rule: 22
title: Inside packages/shared, domain/ never imports from server/
mechanism: not yet counted
---

# Rule 22 — in `packages/shared`, location encodes runtime

`packages/shared` is consumed by two runtimes — browser and node — so there a
file's location also encodes who may run it:

- `domain/` — types, zod schemas, plain data, pure functions. Nothing that
  reaches infra (Prisma, ClickHouse, Redis, S3, logger). Safe in any runtime.
- `server/` — anything that may touch infra. Node only.

`server/` may import `domain/`. `domain/` never imports `server/`. New
domain-safe code lands in `domain/` even when a service is what ships it.

**Why.** Same principle as everywhere else — location = usage — one layer down,
where the axis is runtime instead of feature. And it is mechanically
computable: a module in `server/` whose transitive dependencies are all
domain-safe is misplaced, so misplaced domain code can become a number that
shrinks like every other.

**Wrong**

```text
packages/shared/src/server/presets/catalog.ts   → plain data, no infra imports
```

**Right**

```text
packages/shared/src/domain/presets/catalog.ts
```

No detector yet — this one is on reviewers.
