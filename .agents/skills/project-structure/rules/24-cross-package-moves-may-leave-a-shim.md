---
rule: 24
title: Cross-package moves may leave a one-line shim; inside web, none
mechanism: not yet counted
---

# Rule 24 — shims are a cross-package concession, and they are counted

A move between packages may leave a one-line `export *` shim at the old path,
so importers in other packages don't all have to change in the same PR. Shims
are counted in the baseline, so they drain instead of accumulating.

Inside `web` there are no shims: the codemod rewrites every importer, so there
is no reason to leave one.

**Why.** A shim is a deliberate, temporary, *counted* exception. Uncounted, it
is just a second path to the same module — which is how a dead duplicate of a
file survives review for months, because greps for the name keep finding the
live one.

**Wrong**

```ts
// web/src/hooks/useFormPersistence.ts — after moving into features/prompts
export * from "@/src/features/prompts/hooks/useFormPersistence";
```

**Right**

```ts
// nothing left behind; structure:move rewrote all 14 importers
```

No detector yet — this one is on reviewers.
