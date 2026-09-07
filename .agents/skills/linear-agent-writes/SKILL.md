---
name: linear-agent-writes
description: |
  The org policy for what an agent may write to Linear, and how it must be
  marked. Read this before creating a ticket, editing a description, or
  commenting on a ticket as an agent — "file this in Linear", "comment on the
  ticket", "create subtickets for this plan", "write the handover". Also covers
  the required Linear connection and what to do when there isn't one.
---

# Linear agent writes

Agents write to Linear directly. There is **one** gate, for **one** shape: a
ticket with no parent. Everything else — comments, description edits, subtickets
— you just do.

The guardrail is **marking plus a bounded set of shapes**: three permitted write
shapes, each stamped with a label, each marked as agent-written in the text.
Everything outside those three shapes still belongs to a human.

This file is the **single authority** for that policy. Other skills and repo
instructions point here; none of them restate the rules. If another document
disagrees with this one, this one wins — fix the other document.

It is maintainer-facing: it binds anyone whose agent can reach the Langfuse issue
tracker, and it has nothing to ask of an outside contributor.

*Provenance: the "Agentic Coding and Linear" RFC (LFE-15914), which replaced the
earlier "Linear is read-only for agents" posture.*

## Why the taboo went away

Linear used to be human-only for agents, and every skill that touched it had to
stop and present a review table first. That cost more than it protected: the
expensive thinking in an agent session — the decisions, the reversals, the traps
— evaporated when the session ended, because the one place it could have been
written down was closed.

Breaking the taboo is not removing the boundary. Marking is what replaces the
gate: a human must always be able to tell, at a glance, which text on a ticket is
theirs and which an agent wrote.

## The three shapes

They compose. Stamp **every** shape you used, so the labels read as a log of what
agents did to the ticket.

### 1. Comment — only when a human must be told something now

Label `AI commented`. Mark the comment body itself as agent-written.

A comment notifies every watcher. Use one when someone genuinely needs to see
something today: a blocker, a question that stops the work, a finding that
changes their plan.

**Durable post-context does not go here.** A wrap-up handover posted as a comment
sprays every watcher's inbox for something nobody needs to read today, and inbox
spam is how a good practice gets switched off. That goes in the description.

### 2. Edit a description — where post-context belongs

Label `AI edited`. Add a **clearly separated agent block**; never rewrite,
reflow, or "improve" the human's prose around it.

This is the durable half of the practice. `AI edited` is the filter a future
session uses to find prior agent reasoning, so the label is not decoration — it
is the index.

What belongs in such a block, how to append it without destroying the
description, and why an attachment is not optional are
[`linear-context-handover`](../linear-context-handover/SKILL.md).

### 3. Create a ticket — a subticket freely, a top-level one after a yes

Label `AI created`. Say in the description that an agent created it and who it is
for.

**A subticket of an existing ticket needs no permission.** The intended use is
planning: one subticket per PR in an intended stack, created up front so the plan
is visible before any branch exists, with enough context in each that an agent
could implement it from the ticket alone —
[`linear-planning`](../linear-planning/SKILL.md) is how.

**A ticket with no parent needs the human's yes first** — a top-level issue, or
one filed straight into a project. Show the title and the description you intend
to file, get an explicit go-ahead, then **create it yourself**; do not hand the
text back for them to paste, which is the cost you were meant to remove.

This is the only gate in this policy, and it exists because a parentless ticket
lands in somebody's triage queue. It is the one shape whose cost falls on people
who did not ask for it.

## What still belongs to a human

Assigning, moving state, closing, estimating, re-prioritising, deleting,
projects, and creating new labels.

Surface these as suggestions in your reply — do not do them, and do not ask for
permission to do them as a way of getting them done. (A top-level ticket is
different: asking is exactly the right move there, and then you file it.)

## Sweeps: ask once for the batch, not once per ticket

A skill that reviews a whole queue — production errors, the alerts that fired
last week, a scaling review — comes back with many findings at once, and the ones
that have no ticket yet are parentless. So they need the yes.

**Ask for the set, in one go.** Present the findings as a table with the title
and body you would file for each, and get a single go-ahead — or a go-ahead for
named rows. Then file them yourself and report what you filed. Asking twelve
separate times is worse than the pasting it replaced.

Evidence onto tickets that already exist is a comment or a description edit
(shapes 1 and 2), so it is never part of that ask — do it as you go.

## You need a Linear connection

The practice only works if your agent can actually reach Linear — reading history
before you start, writing the handover when you finish. In this repo the server is
already declared for you: `.agents/config.json` lists `linear` as an HTTP MCP
server, and `scripts/agents/sync-agent-shims.mjs` projects it into each tool's
config on `pnpm install`. Those generated files are gitignored build artifacts —
never hand-edit them.

What is left per developer is **authorizing** it, which the first connection
prompts for. On a headless surface there is nobody to approve that prompt, and a
remote MCP can report itself connected before any token exists — so prove access
with a real read rather than trusting an indicator, and use a token in an
`Authorization` header there instead of the interactive flow. Do not commit that
header: an unset variable is passed through literally and fails with no fallback.

## When there is no Linear connection: say so, loudly

If the Linear tools are absent, **do not silently skip the reconstruct or the
handover.** Silent non-compliance is indistinguishable from compliance, and that
is how a practice quietly dies.

Say, in your reply, in plain language:

- that this environment has no Linear access;
- which step you could not complete (history reconstruction, the handover, the
  subtickets);
- and then **the content itself**, ready to paste — the handover block, the
  subticket bodies, the comment.

The work is not lost that way, and the missing configuration becomes visible
instead of invisible.

```text
No Linear access in this environment, so the handover was not written.
Here is the block that should go on the parent ticket's description
(label it `AI edited`):

<the handover block>
```

Never guess at a ticket's history from the code alone and present it as
recovered context. Say the history could not be read.

## Marking in the text, not only the label

The Linear MCP writes as the **authenticated human**, not as a bot. An unmarked
agent block reads as that person's own words to everyone who sees it. The label
is for filtering; the in-text marking is what stops the misattribution. Do both,
every time.
