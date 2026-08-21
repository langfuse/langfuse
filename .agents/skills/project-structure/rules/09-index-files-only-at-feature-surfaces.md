---
rule: 9
title: index.ts lives at exactly two places — the feature root and the feature's server/ root
mechanism: census
---

# Rule 9 — `index.ts` only at a feature surface

Two legal locations, and no others:

```text
features/<feature>/index.ts          client-safe surface
features/<feature>/server/index.ts   server-side surface
```

Both contain **named re-exports only** — no `export *`, no logic, no
declarations of their own. The root index never re-exports from `server/`.
Components don't get an `index.ts`; the shared folders don't either.

**Why.** An `index.ts` anywhere else is an invisible module boundary: it makes
a folder importable as a unit that nobody designed, and `export *` hides what
is actually public. Surfaces should stay thin and shallow — a fat index means
the feature wants splitting, and a deep one (reaching into a component's
internals) means the module it reaches for should be promoted to feature level
first.

**Wrong**

```text
features/traces/components/index.ts
features/traces/fns/index.ts
```

```ts
// features/traces/index.ts
export * from "./components/TraceTable/TraceTable";
export const DEFAULT_LIMIT = 50;
```

**Right**

```ts
// features/traces/index.ts
export { TraceTable } from "./components/TraceTable/TraceTable";
export { TracesPage } from "./TracesPage";
export type { TraceRow } from "./types/traceRow";
```

Counted from a TS parse of every `index.*` file in scope: location, plus
`export *` and own declarations at the two legal ones. List them with
`pnpm --filter web run structure:stats --rule 9`.
