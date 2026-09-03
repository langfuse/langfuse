# Stack commands

Command recipes for the mechanics described in `SKILL.md`. Read this when
building a stack out of an existing branch, propagating a change through one,
retargeting after a landing, or recovering why a surface is the way it is.

- [Recover the context before you slice](#recover-the-context-before-you-slice)
- [Cut a stack from a finished branch](#cut-a-stack-from-a-finished-branch)
- [Prove the union](#prove-the-union)
- [Propagate a change downward](#propagate-a-change-downward)
- [Retarget after a landing](#retarget-after-a-landing)
- [Verify one branch](#verify-one-branch)

## Recover the context before you slice

Most work on an existing surface has a paper trail that answers half the design
questions, and a reversal already litigated once does not need re-litigating.
Walk it from the file to the work item:

```bash
# 1. file -> commits
git log --follow --date=short --format='%h %ad %an %s' -n 10 -- <path>

# 2. commit -> PR: squash-merge subjects carry "(#N)"; otherwise ask GitHub
git log -1 --format=%s <sha>
gh api "repos/langfuse/langfuse/commits/<sha>/pulls" --jq '.[].number'

# 3. PR -> the branch that carries the work-item identifier
gh pr view <N> --json number,state,title,headRefName,baseRefName,url,body

# 4. an identifier -> its other PRs. GitHub search cannot query branch names,
#    so match the identifier against recent head branches.
gh pr list --state all --limit 300 --json number,headRefName,title \
  --jq '.[] | select(.headRefName | contains("<identifier>"))'
```

Step 3 is the load-bearing one: this repo keeps work-item identifiers out of
commit messages, PR titles and PR descriptions, so the head branch name is the
only link back to the tracker.

## Cut a stack from a finished branch

A branch that has already merged `main` cannot be split by cherry-picking its
commits — the reconciled state exists only in the merged tree. Slice the final
diff instead, cutting each branch from the previous one:

```bash
git fetch origin
REF=<the finished branch>

# what actually has to land, hunk by hunk
git diff origin/main...$REF --stat
git diff origin/main...$REF -- <paths for slice 1> > /tmp/slice-1.patch

git switch -c stack/01-bugs origin/main
git apply --3way /tmp/slice-1.patch
git add -A && git commit -m "fix: ..."

git switch -c stack/02-defaults stack/01-bugs
# ... repeat, each branch cut from its predecessor
```

Stage with `git add -A`, not `git commit -am`: a slice that adds a file arrives
untracked, and `-a` stages only tracked files, so the committed stack would be
missing it and the union proof below would fail.

Push each branch and open its PR against its parent's branch, not `main`.

## Prove the union

The stack tip must reproduce the finished branch:

```bash
git diff stack/08-instrumentation $REF --stat   # expect empty
git diff stack/08-instrumentation $REF          # inspect every remaining hunk
```

An empty diff means the split is faithful. A non-empty diff is either a dropped
change or a deliberate decision — name it in the PR body of the slice it belongs
to. Never edit `$REF` to make the diff go away; it is the arbiter.

## Propagate a change downward

A fix belongs in the PR that contains the thing it fixes. Once it is committed
there, merge that branch into each descendant in order. Do not rebase and do not
force-push a branch that has open review threads.

```bash
git switch stack/02-defaults && git merge stack/01-bugs && git push
git switch stack/03-screen   && git merge stack/02-defaults && git push
# ... down the stack
```

## Retarget after a landing

When the bottom PR squash-merges, exactly one PR retargets — its immediate
child, which is now the bottom. That child's base moves to `main` and `main` has
to come back in:

```bash
gh pr edit <child PR> --base main
git switch <child branch>
git fetch origin && git merge origin/main && git push
```

The rest of the stack keeps its existing base and picks the landed work up by
the propagate recipe above — `git merge <parent branch>` into each descendant in
order. Retargeting more than one PR to `main` per landing would make every
descendant's diff carry its unmerged ancestors, which is the thing a stack
exists to avoid. This is the running cost of a stack; budget for one round of it
per landing.

## Verify one branch

Per branch, in a worktree checked out on that branch. `.agents/AGENTS.md` owns
the authoritative bar; this is the shape of the loop:

```bash
git worktree add ../langfuse-slice-4 stack/04-housekeeping
cd ../langfuse-slice-4 && pnpm install

pnpm --filter=shared run db:generate && pnpm --filter=shared run build
pnpm exec turbo run lint --force      # read the Cached: line, not just Tasks:
pnpm run typecheck
pnpm --filter=web run test-client <file>
pnpm exec knip
```

Then load the surface the slice touches in a browser and look at it. Publish the
outcome as a table of branch by check, and say which checks you skipped.
