---
rule: 17
title: New code follows the rules; the violations baseline only shrinks
mechanism: ratchet
---

# Rule 17 — the baseline only shrinks

Existing code is where it is; the migration would chase a moving target
otherwise. New code follows all the rules, and `web/.structure-baseline.json`
— the committed snapshot of today's violations — only ever goes down.

**Why.** This is the one rule that makes the other 25 finishable. Enforcement
arrives per rule, not all at once: when a rule's count is small enough to
finish, it graduates and CI starts failing on new violations of it. The cheap
local rules graduate first (naming, one export per file, kind folders); the
ones that need surfaces to exist graduate last.

**Wrong**

```text
re-snapshotting the baseline to make a regression disappear
```

**Right**

```text
pnpm --filter web run structure:stats --diff     # what this branch added or cleared
```

Re-snapshot deliberately, as the point of its own PR, after a fix batch —
never as a side effect of unrelated work. A snapshot taken with a broken
sensor is worse than a stale one.

Counted by the baseline itself: `--diff` lists what a branch added and cleared.
