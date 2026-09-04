---
name: linear-planning
description: |
  Plan a feature in Linear as subtickets that map 1:1 to a chained PR stack,
  with enough context in each ticket that an agent could implement it from the
  ticket alone. Use before writing code for anything bigger than a one-commit
  fix — "plan this feature", "split this branch into reviewable PRs", "turn this
  RFC into tickets", "open a PR stack".
---

# Planning a feature as Linear subtickets

**One idea:** the planning session is where the expensive thinking happens, and
it evaporates when the session ends. Write it into subtickets *while* you plan,
one subticket per PR you intend to open, so the implementation can be handed to
any agent — a cloud agent, a colleague, a session next month — and nothing is
lost.

This skill owns the Linear half: whether to plan at all, and what a subticket
must contain. It does not own the PR mechanics.

- **Where to cut the slices, the stack rules, and how to verify each branch** are
  [`pr-stack-workflow`](../pr-stack-workflow/SKILL.md). Read it for the slicing;
  this file does not restate it.
- **What an agent may write to Linear and how it must be marked** is
  [`linear-agent-writes`](../linear-agent-writes/SKILL.md). Read it before your
  first write.
- **Reconstructing history before you plan, and the handover after you ship**,
  are [`linear-context-handover`](../linear-context-handover/SKILL.md).

## Step 0 — reconstruct before you slice

Run the context CLI on the files you are about to change, then read what it finds:
[`linear-context-handover`](../linear-context-handover/SKILL.md) → *reconstruct
its history*. Half the design questions have already been answered somewhere in
that chain, and a decision that was already reversed once does not need
proposing again.

## Does it need a plan at all?

The discriminator is in [`pr-stack-workflow`](../pr-stack-workflow/SKILL.md) →
*Decide whether it needs a stack*:
one sentence without an "and", a default or persisted shape that needs a
migration decision, a shared component, a click-path verification. Use that
table; it is the same question.

Two consequences for the tracker specifically:

- **If the fix is one commit, the ticket already is the plan.** Do not manufacture
  subtickets for it. Hand the ticket to an agent as the whole brief.
- **If you cannot yet write the acceptance check, you are researching, not
  planning.** Do the research and put *it* on the parent ticket — the numbers, the
  screenshots, an attached `.md`. The plan is the second document, not the first.

## One subticket per slice, created up front

Create the whole set before any branch exists, so the plan is reviewable as a
plan. Each is a **subticket of the existing ticket**, which needs no permission.
If the work has no parent ticket yet, that parent is a top-level ticket — show it
and get a yes before filing it, then plan underneath it.

The worked example is the experiments-UI rebuild: 54 commits on one branch became
eight subtickets under LFE-15711 and eight chained PRs (#16912–#16919), one to
one, in landing order. PR #1 merged while #2–#8 were still in review, which is the
whole point of planning it as a stack rather than discovering the split at review
time.

## What a subticket must contain

The bar is not "a human can follow this". It is: **hand it to an agent with no
session history and it can implement it.** Six fields, every time — paste-ready
shape in [`references/subticket-template.md`](references/subticket-template.md):

1. **The change**, in one imperative sentence. "Show the 24 populated score
   columns by default." If it needs an "and", it is two subtickets.
2. **The evidence that justifies it** — the number, the quote, the screenshot.
   `98% of column-picker use on this table ends with a score column added (440 of
   449 users, 90d)`. Without this, review re-litigates the design.
3. **Entry-point files** — two to five paths, with the line where the behavior
   lives, and the mechanism if it is not obvious from the file.
4. **The acceptance check** — a click path with a URL and an observable outcome,
   plus the seeded data it needs. *Expect 24 score columns, all populated, 0
   blank*, not "looks better".
5. **Position in the stack** — `4/8, branches off #16914, base retargets to main
   when #16914 lands`.
6. **Deliberately not in scope**, with where it went instead. This is the field
   that stops an implementer helpfully widening the slice and breaking the union
   check.

An empty field is usually a sign the slice is not understood yet, not a sign the
field is optional. *Not in scope* is the exception — it is empty only when nothing
was tempting.

## Labels and boundaries

Planning this way uses two of the three permitted write shapes: creating
subtickets, and writing into descriptions. **The policy is not restated here** —
[`linear-agent-writes`](../linear-agent-writes/SKILL.md) is the authority for
which shapes are allowed, which label stamps each, and what still belongs to a
human.

The two rules you will hit immediately while planning:

- **Subtickets are free; the top of the tree needs a yes.** Planning under an
  existing ticket needs no permission. Creating the parent itself does.
- **Stamp every shape you used.** A subticket you created *and* wrote the plan
  into carries both `AI created` and `AI edited`.

Estimates, priorities, assignees and cycle stay unset. Suggest them in your reply
instead.

## When the stack lands

Wrap up with [`linear-context-handover`](../linear-context-handover/SKILL.md): the
substantial handover on the parent, short pointers on the leaves, `AI edited` on
each. The parent's subticket list plus those blocks are exactly what the context
CLI hands the next agent.
