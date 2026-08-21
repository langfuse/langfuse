---
rule: 3
title: Hooks, fns, stores, contexts, constants and types are camelCase, named after the export
mechanism: census
---

# Rule 3 — camelCase, named after what is inside

A file in `hooks/`, `fns/`, `stores/`, `contexts/`, `constants/` or `types/` is
camelCase and named after its export. `useDialog` lives in `useDialog.ts`;
`groupByKey` in `groupByKey.ts`; the `TreeNode` type in `types/treeNode.ts`.

Two deliberate exceptions:

- A constants file may be named after the subject it groups —
  `constants/traceDownload.ts` — because what matters there is that the folder
  makes the values visible as constants. Split it when two consumers start
  pulling unrelated values out of it.
- A context module is the canonical React trio in one unit:
  `FooContext.tsx` may export `FooContext`, `FooProvider` and `useFoo*`.
  Anything beyond that is a violation.

**Why.** This is the largest source of new violations in the migration, and it
costs nothing to get right: the name is decided before the file exists.
kebab-case is the legacy spelling — 277 files still carry it, and they get
renamed when touched.

**Wrong**

```text
hooks/use-dialog.ts
fns/tree-building.ts
fns/types.ts          → a type is not a function, and a dump is not a module
```

**Right**

```text
hooks/useDialog.ts
fns/buildTree.ts
types/treeNode.ts
```

Counted from a TS parse: filename casing, plus whether an export matching the
filename exists. List them with
`pnpm --filter web run structure:stats --rule 3`.
