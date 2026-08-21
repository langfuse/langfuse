---
rule: 18
title: Tests for fns and hooks sit flat next to the file they test
mechanism: census
---

# Rule 18 — a test sits next to its subject

```text
fns/groupByKey.ts
fns/groupByKey.clienttest.ts
hooks/useDialog.ts
hooks/useDialog.clienttest.ts
```

A folder appears only when something accumulates more than a test. A module
folder keeps its tests together instead — `fns/searchJson/__tests__/` — because
the group is tested as a group.

**Why.** Flat colocation means the test is impossible to miss when you change
the file, and impossible to orphan when you move it: the move codemod carries
`X.clienttest.ts` along with `X.ts` automatically.

**Wrong**

```text
fns/groupByKey.ts
__tests__/groupByKey.clienttest.ts
```

**Right**

```text
fns/groupByKey.ts
fns/groupByKey.clienttest.ts
```

Facet-named tests count as colocated when the subject sits beside them:
`X.media.clienttest.tsx` next to `X.tsx` is fine.

When you write the test before the module exists, create the module file first
— the check looks for a subject next to the test, and cannot tell test-first
from a misplaced test.

Counted from the file census: a test file with no adjacent subject module.
List them with `pnpm --filter web run structure:stats --rule 18`.
