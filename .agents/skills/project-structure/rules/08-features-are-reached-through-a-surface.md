---
rule: 8
title: Anything that imports a feature goes through one of its surfaces
mechanism: graph
---

# Rule 8 — features are reached through a surface

A feature exposes two surfaces, because it is a full-stack slice:

- `@/src/features/<feature>` — the root `index.ts`, client-safe exports.
- `@/src/features/<feature>/server` — `server/index.ts`, server-only exports.

Every importer binds to those, not just other features: the tRPC root, shared
components, `src/pages`, all of them. Nothing else inside a feature is
importable from outside it.

**Why.** The surface is the only place where "what other people may use" is
written down. Without it, every internal file is public by accident and no
feature can be reorganised. It also keeps the client/server split structural:
if the root index re-exported `server/`, every client importer would
transitively evaluate Prisma, ClickHouse and ioredis — and nothing would
crash, which is why prose alone cannot hold the line.

**Wrong**

```ts
import { CommentableJsonView } from "@/src/features/comments/components/CommentableJsonView";
```

**Right**

```ts
// features/comments/index.ts
export { CommentableJsonView } from "./components/CommentableJsonView";

// the importer
import { CommentableJsonView } from "@/src/features/comments";
```

This is the largest rule by count, and most of it predates the surfaces. It is
counted and surfaced with a proposed fix, not blocked at merge.

Counted on the dependency graph: any edge entering a feature at a path other
than its two surfaces. List them with
`pnpm --filter web run structure:stats --rule 8`, and see what a fix is worth
with `--next --scope src/features/<feature>`.
