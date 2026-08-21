---
rule: 16
title: ESLint ignores go at file level, and they are counted
mechanism: census
---

# Rule 16 — ignores are visible or they don't exist

An ESLint suppression goes at the top of the file as
`/* eslint-disable <rule> */`. Not `eslint-disable-line`, not
`eslint-disable-next-line`.

File-level ignores are allowed and counted as a survey metric. Line-level ones
are the violation.

**Why.** A file-level ignore is in your face the moment you open the file. A
line-level one is invisible until you happen to scroll past it, so it never
gets revisited. Either way they are debt with a name on it, which is why the
dashboard counts them.

Do not add or widen a suppression without explicit approval for the exact rule
and scope.

**Wrong**

```ts
const x = compute(); // eslint-disable-line @typescript-eslint/no-unsafe-assignment
```

**Right**

```ts
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// at the top of the file, so anyone opening it sees the exemption
```

Counted from a line scan of every file in `web/src`. List them with
`pnpm --filter web run structure:stats --rule 16`.
