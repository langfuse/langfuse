# Batch selection

The workflow selects the batch before the model runs. The model does not choose a different file or rule.

Priority:

1. One whole file that has 1 to 6 `eslint-disable` comments, fewest comments first, then path order.
2. One comment in one file, path order then line order. Use this when every remaining file has more than 6 comments.
3. One rule across at most 4 files and 6 comments. Every comment in that batch names only that rule.

Skip a batch key that is already in `unresolved.json` or in an open pull request body (`Batch-Key:` / `Batch-Files:`). Files named by an open batch are blocked so a later batch does not edit them.

A run publishes at most one pull request. The changed-line cap is 199. If a correct fix would exceed it, leave the tree unchanged and report the batch as unresolved.

Generated and vendored paths are out of scope: `generated/`, `web/.next/`, `web/src/workers/generated/`, `packages/shared/prisma/generated/`, `packages/native/index.js`, `packages/native/index.d.ts`, `dist/`, and `node_modules/`.
