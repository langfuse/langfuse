---
rule: 13
title: src/components/ui is frozen — nothing new goes in
mechanism: census
---

# Rule 13 — `components/ui` is frozen

`src/components/ui` is the legacy shadcn folder. No new file goes into it, and
its files move out one by one as they are touched:

- used by one feature → into that feature
- used by several and simple → into `src/components/design-system`
- anything else → into `src/components`

It keeps its kebab-case filenames until its files leave.

**Why.** A frozen folder can only shrink, which turns "we should clean that up
one day" into a number that goes down. It has drained by 45 files so far.

**Wrong**

```text
src/components/ui/trace-status-badge.tsx     (new file)
```

**Right**

```text
src/features/traces/components/TraceStatusBadge.tsx
```

Counted as a file census of the folder; the baseline ratchets on additions.
List them with `pnpm --filter web run structure:stats --rule 13`.
