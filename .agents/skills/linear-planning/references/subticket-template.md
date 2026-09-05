# Planning subticket template

One subticket per PR in the intended stack, created as a **child of the existing
ticket** — which needs no permission — and labelled `AI created`. Filing the
parent itself is a top-level ticket and needs a yes first.

The bar is not "a human can follow this". It is: **an agent with no session
history can implement it from the ticket alone.** If a field would be empty, that
is usually a sign the slice is not understood yet — not a sign the field is
optional. The exception is *Not in scope*, which is empty only when nothing was
tempting.

Title: imperative, names the surface, no ticket-speak.
`Show the populated score columns by default on the experiments list`

```markdown
*Created by <agent> on <date> while planning <PARENT-ID>, for whoever implements
slice N of the stack. Everything here is agent-written.*

## The change

<One imperative sentence. If it needs an "and", it is two subtickets.>

## Why — the evidence

<The number, the quote, or the screenshot that justifies it. Name the source and
the window: "440 of 449 users (98%), 90 days, users not pageviews". A design
opinion with no evidence line is fine — say so explicitly, so review argues about
the right thing.>

## Where it lives

- `web/src/.../ThisFile.tsx:757` — <what is there today>
- `packages/shared/src/.../thatQuery.ts` — <the projection that has to change>

<2–5 entry points. Not a file list of the diff — the places an implementer starts
reading. Include the mechanism if it is not obvious from the file:
"both families are discovered with the same filter, so each level produces an
always-empty twin".>

## Acceptance check

1. `http://localhost:3025/project/<id>/experiments`
2. <click path>
3. Expect: <observable outcome with a number — "24 score columns, all populated,
   0 blank" — not "looks better">

<Plus the seeded data or scenario the check needs, and the command that produces
it.>

## Position in the stack

`N/M` · branches off #<parent PR> · base retargets to `main` when that lands ·
must pass the repo's verification bar on its own branch, not only on the stack
tip.

## Not in scope

- <The tempting adjacent change> — stays in <TICKET-ID> / on the parent, because
  <reason>.
```

## After the PR merges

Do not rewrite this block. Append the leaf handover pointer below it and add
`AI edited` alongside `AI created` — see
[`linear-context-handover`](../../linear-context-handover/references/handover-template.md).

## What not to put in a planning subticket

- The whole design doc. Link the parent, or attach an `.md`; eight copies of one
  essay is noise.
- A status narrative ("first we tried X"). That belongs in the handover, after.
- Estimates, priorities, assignees, cycle — human-only fields. Leave them unset
  and mention the suggestion in chat.
- Anything confidential: no customer names, no support-ticket ids, no vendor
  references. Same rule as the public PR artifacts.
