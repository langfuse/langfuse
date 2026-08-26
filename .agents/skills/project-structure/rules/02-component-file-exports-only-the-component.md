---
rule: 2
title: A component file exports only the component and its types
mechanism: census
---

# Rule 2 — a component file exports only the component

The only non-type export allowed from a component file is the component
itself. Types are always allowed. Dot-notation compound components
(`Modal.Header`, `Modal.Body`) count as one export.

**Why.** A helper exported from a component file is a helper with no home. It
gets imported from three places, none of which want the component, and the
file becomes a module boundary nobody designed. Private helpers may stay in
the file — just don't export them.

**Wrong**

```ts
// components/TraceTable/TraceTable.tsx
export function TraceTable() { … }
export const formatLatency = (ms: number) => …   // wanted by two other files
```

**Right**

```ts
// fns/formatLatency.ts
export const formatLatency = (ms: number) => …

// components/TraceTable/TraceTable.tsx
export function TraceTable() { … }
```

Exporting an internal only so a test can reach it is not allowed: either it
becomes a real module with its own file, or the component's public API is what
gets tested.

Counted from a TS parse: non-PascalCase value exports in a file that also
exports a component. List them with
`pnpm --filter web run structure:stats --rule 2`.
