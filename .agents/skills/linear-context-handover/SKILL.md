---
name: linear-context-handover
description: |
  Use Linear as the org's memory: reconstruct a feature's history before
  touching it, and leave the reasoning behind finished work in the ticket
  description so the next agent inherits it. Use when starting work on an
  existing feature, when planning multi-PR work, and always when wrapping up —
  "what happened to this screen before", "write the handover", "why is this
  code like this".
---

# Linear context handover

Linear is the org's long-term memory. Agent sessions are not — they end, and
everything they worked out ends with them. This skill is how reasoning survives
the session that produced it.

Two halves, and the second one is the one people skip:

1. **Before you touch a feature, reconstruct its history.** Most "new" work on an
   existing surface has a paper trail that answers half the design questions.
2. **When you wrap up, write the handover into the ticket's description.**

What an agent may write to Linear, which label stamps it, and what stays
human-only are not in this file:
[`linear-agent-writes`](../linear-agent-writes/SKILL.md) is the authority. Read
it before your first write. This file is the *craft* — where post-context goes,
what earns a place in it, and the two mechanics that stop it being destroyed on
the way in.

How to slice a big change into PRs, and what a planning subticket must contain,
are the sibling skill: [`linear-planning`](../linear-planning/SKILL.md).

## Before you touch a feature: reconstruct its history

Do this before designing anything. A reversal already litigated once does not
need re-litigating.

**Start with the CLI**, which walks steps 1–3 for you and prints the ticket ids,
the URLs and the exact MCP calls for step 4. Run it from inside the checkout you
are about to change:

```bash
S=.agents/skills/linear-context-handover/scripts/lf-context.sh
bash $S web/src/features/experiments/.../ExperimentsTable.tsx
bash $S 65bbc753c    # a sha · 16912 # a PR · LFE-15711 # a ticket
bash $S --help       # options, and what is automatic
```

Everything up to the ticket ids is automatic. The ticket bodies need Linear: the
script queries the API directly if `LINEAR_API_KEY` is exported, and otherwise
prints the ids, URLs and MCP calls for you to run — so the agent hand-off is the
normal path, not a failure.

By hand, the same chain is:

1. **Code → PR.** `git log --follow <path>` on the files you are about to change,
   then the commit's PR (`gh api repos/<owner>/<repo>/commits/<sha>/pulls`).
2. **PR → ticket.** The **branch name** carries the identifier
   (`lfe-15489-release-to-everybody` → LFE-15489). PR titles and descriptions in
   these repos deliberately omit ticket ids, so the branch is the only link.
3. **Ticket → the rest.** Read the description including any AI block, then walk
   `parentId`, the subtickets, `relations`, and the project. The project's other
   tickets are usually where the decisions live.
4. **Ticket → prior agent reasoning.** Filter the `AI edited` label to find where
   earlier sessions left context.

Read all of it before proposing a direction.

## When you wrap up: write the handover

Into the **description** of the ticket the work belongs to, as a clearly
separated agent block. Label the ticket `AI edited`.

**Scale it.** One substantial handover on the project or parent ticket, short
pointers on the leaves. The same essay repeated on eight tickets is noise, not
context.

**The reversals are the payload.** A summary of what shipped is the least
valuable section — the PR already carries the diff and the ticket already carries
the state. What only this block can carry is the thing that was built and then
deliberately removed, and why: without it the next session rebuilds it, argues
the same argument, and reaches the same verdict a week later. Write the reversals
first and the summary last; if you are short of room, cut the summary.

The rest of what earns its place, and the paste-ready shape, is
[`references/handover-template.md`](references/handover-template.md): decisions
and why, how the human steered (quoted), the tools and recipes that reproduce the
state, the traps, and what is left open.

### Two mechanics, or the handover damages what it lands in

**Write it with a `patch` `append` op, never by re-sending the description.**
A full rewrite is how "never rewrite the human's prose" fails in practice, and it
also flattens the inline `<user>` / `<linear-comment>` elements Linear stores
inside a description — which no diff will show you afterwards. Use `patch` with
`replace` and an exact `old_string` to correct your own block later.

**Attach files and images; never paste an upload URL.** Linear's uploaded-file
URLs are **signed and expire in about five minutes**, so a pasted image link is
already dead by the time any agent — or human — opens the ticket. Go through
`prepare_attachment_upload` + `create_attachment_from_upload`. This has cost real
context twice: one piece of review feedback is permanently unactionable because
the screenshot it pointed at was an expired signed URL. Long analyses belong in an
attached `.md` for the same reason a description has a readable length.

## The labels, and the one note the policy does not carry

The permitted shapes, the label for each, the marking-in-text requirement and the
human-only list are all in
[`linear-agent-writes`](../linear-agent-writes/SKILL.md). If this file disagrees
with it, this file is the bug.

One thing specific to *reading* history: **`AI edited` is the filter that
matters.** Post-context lives in descriptions, so that is the label that finds
prior reasoning. `AI commented` only tells you an agent said something to a human
on a particular day, usually stale by the time you read it.

## No Linear access

Say so, name the step you could not complete, and hand back the content ready to
paste — the rule and the wording are in
[`linear-agent-writes`](../linear-agent-writes/SKILL.md) → *When there is no
Linear connection*. Never reconstruct a feature's history from the code alone and
present it as recovered context.
