---
name: parallel-worktrees
description: |
  Run several checkouts of this repo at once with git worktrees, each on its own
  branch and web port but sharing one local data tier. Use when work is blocked
  waiting on a review, when verifying a stack branch by branch, when a fix must
  be reproduced on another branch without losing the current one, and whenever
  switching branches in place would throw away work in progress.
---

# Parallel worktrees

One checkout serializes you: you cannot verify a fix on one branch while a
review sits on another, and the branch you left it on drifts until nobody knows
what state it is in. A worktree is a second working directory on the same
repository — its own branch and its own dev server, sharing the object store.

The reason it is cheap here is that **all of them can share one data tier.**
Postgres, ClickHouse, Redis and MinIO come from the single Docker Compose stack;
only the web port differs. You are not running four databases.

## Create one

```bash
git -C <main checkout> fetch origin
git -C <main checkout> worktree add ../langfuse-<slug> -b <branch> origin/main
cd ../langfuse-<slug>

cp <main checkout>/.env .env                  # share the data tier
# then override only the port and the auth URL in that copy:
#   PORT=<port>
#   NEXTAUTH_URL="http://localhost:<port>"

pnpm install                                  # also syncs the agent skills
pnpm --filter=shared run db:generate
pnpm --filter=shared run build                # ← do not skip this
```

**`pnpm dev:web` does not build `shared`.** A fresh worktree returns a 500 on
`@langfuse/shared/src/server` until you have, and the error names a module rather
than a missing build, so it reads like a broken import. Build it before the first
run and again after switching that worktree between branches.

**Name it for the work, not for its port number.** Sequential names collide: two
sessions picking "the next free port" at the same moment choose the same one and
the second clobbers the first. A slug taken from the branch cannot.

Then run the server on its own port, and only while you need it:

```bash
pnpm dev:web -- -p <port>
```

## Four things that bite

- **Worktrees share `refs/stash`.** `git stash` in one and `git stash pop` in
  another pops the wrong entry — silently, because the stack looks plausible.
  Use a throwaway commit to set work aside instead. If you must stash, use
  `git stash push -u -m "<unique tag>"`, note the SHA from
  `git stash list --format='%H %gs'`, and restore with `git stash apply <sha>`.
- **Worktrees share one turbo cache**, which turbo says on every run
  (`using shared worktree cache`). A green `lint` in one worktree can be a replay
  of another branch's result. `.agents/AGENTS.md` → *Verification* has the
  invocation that forces execution.
- **`@langfuse/shared` resolves to a built `dist`**, so a filtered typecheck in a
  worktree whose `shared` was built on a different branch reports on that other
  branch's source. Same fix as above: rebuild it after every branch switch.
- **Stop a server by its listener, never by the port.** `lsof -ti tcp:<port>`
  returns everything on that port including *clients* — a browser tab open to it
  is in that list, and killing the list closes the browser. Scope it:

  ```bash
  lsof -ti tcp:<port> -sTCP:LISTEN | xargs kill
  ```

## When the app misbehaves in a new worktree

- **500 on `@langfuse/shared/src/server`** — `shared` is not built. See above.
- **Auth failing on every page** — the shared database is behind this branch's
  migrations. `pnpm --filter=shared run db:deploy` (forward-only). Check an
  authenticated page afterwards, not just an HTTP 200 on the root.
- **A skill you expect is missing** — `.claude/skills/` and the other per-tool
  configs are generated and gitignored, so a fresh worktree has none until
  `pnpm install` runs its postinstall. `pnpm run agents:sync` regenerates them.

## The docs repo is lighter

`langfuse/langfuse-docs` has no `shared` package, no data tier and no `.env`, so
a worktree there is `git worktree add` plus `pnpm install`. Two differences worth
knowing: `pnpm dev` hardcodes its port, so pass one (`pnpm dev -- -p <port>`);
and the handbook and team roster live there, so a stale docs worktree serves
stale answers — read those from `origin/main` rather than the working tree.

## Clean up

```bash
git worktree list                     # what exists, and on which branch
git worktree remove ../langfuse-<slug>
git worktree prune                    # after deleting a directory by hand
```

Removing a worktree does not delete its branch, so a merged branch is still
there to tidy separately. Do this when the work lands: a directory nobody
remembers creating, sitting on a branch nobody remembers, is the state worktrees
exist to prevent.

Do not leave dev servers running in worktrees you are not using. Each one holds
a Node process and a file watcher, and several idle ones will make the machine
slower than the serialization you were avoiding.
