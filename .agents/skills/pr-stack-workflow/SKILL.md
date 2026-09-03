---
name: pr-stack-workflow
description: |
  Split a large change into a chained stack of small, independently reviewable
  pull requests, and verify each branch on its own. Use when a change is too
  large for one PR, when splitting a long-lived branch into PRs, when deciding
  whether work needs a planning stage at all, when landing or propagating a fix
  through a stack, or when every check is green on a stack and the change is
  still wrong.
---

# PR Stack Workflow

Use this for any change too large to review as one pull request: deciding
whether to stack at all, where to cut the slices, the mechanics that keep a
stack reviewable, and how to verify each branch instead of only the tip.

Branch names, commit and PR-title conventions, and how to handle bot review
threads live in `git-workflow`. Read that first; this skill does not restate it.

## Decide whether it needs a stack

A stack costs real time, because every landing forces a base move plus a merge
down the rest of the chain. Pay that only when one of these is true.

| Stack it | Ship it as one PR |
| --- | --- |
| You cannot describe the diff in one sentence without the word "and" | One symptom, one cause |
| It changes a default, or a shape users already have persisted, so it needs a migration decision | The behavior is new and nobody has state in it |
| Someone will ask "why" and the answer is evidence: numbers, screenshots, a competitor's UI | The bug report is the justification |
| It touches a shared component other surfaces consume | The blast radius is one screen |
| Verification is a click path, not an assertion | An existing test proves it |

Two consequences:

- If the fix is one commit, there is no plan to make. Do not manufacture slices.
- If you cannot yet write the acceptance check, you are researching, not
  planning. Do the research, publish it, then plan.

Keep the stack short. Every landing costs another round of retarget-and-merge,
so length is a running cost you pay until the last PR is in.

## Slice by what a reviewer has to hold in their head

Not by file, not by directory, not by frontend versus backend. A slice is right
when a reviewer can state what it does, and check it, without loading any other
slice. Practical shapes, in the order they should land:

1. **The bugs first.** Anything true on `main` regardless of the wider change.
   It is mergeable on day one, it carries no judgment, and landing it early
   shrinks everything downstream.
2. **Defaults and data shape next.** A default-visible column, a one-time
   migration, "stop rendering an empty string". Cheap diffs with expensive
   consequences deserve their own review.
3. **One screen per slice.** A whole component replaced is one reviewer concern
   even at 30 files.
4. **Housekeeping in a bag.** Several small independent removals nobody will
   argue about.
5. **One question per slice.** "Which run do we compare against?" is one slice:
   the query, the picker, the auto-selection, and the URL state together.
6. **The dense one, alone.** There is always one genuinely hard slice. Give it
   nothing else to carry.
7. **New capabilities last but one.** A new layout or filter reads as a feature
   only once the surface under it has settled.
8. **Instrumentation last.** It wires the seams the earlier slices create. Put
   it first and you instrument code that is about to change.

This repo's own agent-setup work is a worked example: #16390, #16391 and #16392
shipped a project-structure path guard as three PRs, landed in that order — the
measured baseline first, then the rules the guard's messages cite, then the hook
that enforces them. The later two are based on the first's branch, not on `main`,
and #16392's body opens by naming the merge order.

## What each PR must say

State the position and the dependency in the body, so a reviewer knows what they
may ignore:

- `2/8, based on #16913. Base retargets to main when #16913 lands.`
- What is deliberately **not** in this slice, and which slice took it. This is
  the line that stops an implementer helpfully widening the scope and breaking
  the union check below.
- Any unmerged upstream change that would silently break this slice. A change
  that makes two mechanisms read identical data makes them go *quiet* rather
  than visibly wrong, and no test catches that.

Open the whole stack as reviewable, not drafts.

## Five rules that cost us

1. **A fix-up commit lands in the PR that contains the thing it fixes**, never as
   a follow-up PR later in the stack. Otherwise the earlier PR ships a state you
   already know is broken, and it is the one that merges first. When you slice an
   existing branch, fold each fix-up back into its parent commit's slice.
2. **Propagate downward by merging parent into child. Never rebase or force-push
   a stack that is under review.** Review bots hang their threads off commit
   shas, so a force-push discards review you already paid for. These PRs are
   squash-merged, so merge commits in a child cost nothing in `main`'s history.
   (The one documented force-push in `CONTRIBUTING.md` is the CLA author-header
   fix on a single PR — not a stack under review.)
3. **Every PR must stand alone.** Lint, typecheck and tests green on its own
   branch, not only on the stack tip. A slice that compiles only with its
   successor is not a slice: merge it into its neighbor.
4. **Every landing costs a retarget.** When the parent merges, its immediate
   child becomes the new bottom: that one PR's base moves to `main`, `main` is
   merged into it, and the merge is then propagated down the rest of the chain.
   Every landing, until the stack is empty. Plan for that cost instead of
   meeting it on merge day.
5. **A branch that has already merged `main` cannot be split by cherry-picking
   its commits.** The reconciled state exists only in the merged tree: upstream
   took some of your changes, replaced others, reverted a few. Slice the final
   diff instead, then prove the union.

## Prove the union

After slicing a branch, `git diff <stack-tip> <original-branch>` must be empty,
or every remaining difference must be a deliberate, named decision.

Do not skip this because the slices look right. On an eight-PR split the union
delta came to three files and one added, three removed lines — and that delta was
the finding: the original branch had dropped three ESLint disable pragmas and was
carrying a latent lint failure toward `main`.

Keep the original branch untouched as the arbiter. When a slice's behavior is in
doubt, run both and compare. Never edit the arbiter to match a slice.

The commands for slicing a merged branch and proving the union are in
[`references/stack-commands.md`](references/stack-commands.md), together with the
git-to-PR walk for recovering why a surface is the way it is before you slice it.

## Verify per branch, not per stack

Run the verification bar from `.agents/AGENTS.md` on **each branch**, in a
worktree checked out on that branch, and publish the result as a table of branch
by check. That file owns the commands and the checks that pass without executing;
follow it there rather than from memory. Three failure modes belong to stacking
specifically:

- **Worktrees share one turbo cache.** Turbo says so on every run
  (`using shared worktree cache`), which is exactly why a green lint on slice 4
  can be a replay of slice 3's result. Force execution when you switch branches.
- **Slicing is what provokes the unused-export gate.** Split a feature and you
  routinely produce an export whose only consumer lives in a later slice: dead
  code on this branch, fine on the tip, and `knip` is a required check. The fix
  is to move the export into the slice that uses it, not to widen an ignore list.
- **A rendering change is not verified until somebody loads the screen.** Do it
  once per slice, on that slice's branch and its own preview, not once on the
  tip. Green checks and bot reviews have between them approved a branch that
  rendered a blank page.
