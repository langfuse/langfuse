---
rule: 12
title: A src/pages file only imports a Page component and exports route config
mechanism: graph
---

# Rule 12 — `src/pages` is routing, not code

Next.js structure is a routing structure. A file in `src/pages` maps a URL to a
Page component from a feature, plus route-level config. It should stay under
roughly 20 lines.

A Page is a big component responsible for an entire URL, living in its feature
and named for what it does: `TracesPage.tsx`, not `IndexPage.tsx`.

`pages/api` is the same idea for the public API: shims into
`features/public-api` handlers.

**Why.** Logic in `pages/` is logic no feature owns, reachable only through a
URL. It also welds the app to Next.js: a thin routing layer is the seam that
makes the framework replaceable.

**Wrong**

```ts
// src/pages/project/[projectId]/dashboards/[dashboardId]/index.tsx — 1,404 lines
```

**Right**

```ts
// src/pages/project/[projectId]/traces/index.tsx
import { TracesPage } from "@/src/features/traces";

export default function Page() {
  return <TracesPage />;
}
```

Move a fat page with `git mv` into its feature so history follows, then write a
fresh shim at the old path — see [rule 15](15-moves-preserve-git-history.md).

Counted on the dependency graph: imports from a `src/pages` file that are not
a feature Page component. List them with
`pnpm --filter web run structure:stats --rule 12`.
