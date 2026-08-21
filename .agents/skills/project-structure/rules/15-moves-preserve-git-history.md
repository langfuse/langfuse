---
rule: 15
title: Moves preserve git history — git mv, and a move is never an edit
mechanism: process
---

# Rule 15 — move ≠ edit

Git does not store renames; it detects them at diff and blame time by content
similarity. So history survives a move only when the moved file's content stays
near-identical in that commit. Everything else follows from that one fact.

- A move PR contains `git mv` plus importer updates. Never a content edit of a
  moved file — that goes in a follow-up PR.
- This survives squash-merge: the moved file is a delete at the old path plus
  an add with identical content at the new one, and rename detection still
  works.
- Absolute imports are what make it clean. A moved file's own `@/src/...`
  imports stay valid, so the file itself does not change — see
  [rule 26](26-relative-imports-stay-inside-their-directory.md).
- Mass renames land as pure-rename commits listed in `.git-blame-ignore-revs`.

**Why.** Preserving history is an explicit goal of the migration. A move that
also edits the file reads as a rewrite, and `git blame` stops at the move.

**Wrong**

```text
one commit: git mv + rename the exported symbol + fix a bug
```

**Right**

```text
commit 1: pnpm --filter web run structure:move <from> <to-dir>
commit 2: rename the symbol
commit 3: fix the bug
```

Use the codemod: it does the `git mv`, rewrites every importer through the
TypeScript language service, brings colocated tests and stories along, and
refuses to silently turn a move into an edit. Reading history after a move:
`git log --follow`, `git blame -C -C -C`.

Not machine-counted: this one is process.
