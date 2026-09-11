---
name: linear-agent-writes
description: |
  The org policy for what an agent may write to Linear, and how it must be
  marked. Read this before creating a ticket, editing a description, or
  commenting on a ticket as an agent — "file this in Linear", "comment on the
  ticket", "create a subticket", "write the handover". Default those writes
  to a short human description; expand with research only when asked. Also
  covers the required Linear connection and what to do when there isn't one.
---

# Linear agent writes

Agents may write to Linear, but **most writes are proposals first**. Show the
text you intend to land, get an explicit go-ahead, then write it yourself. Do
not silently mutate a ticket the human is mid-session with.

The one exception is a **subticket of an existing ticket** — that shape is free,
because planning a stack is useless if every child needs its own yes.

The guardrail is **propose-then-write, plus marking, plus a bounded set of
shapes**: three permitted write shapes, each stamped with a label, each marked
as agent-written in the text. Everything outside those three shapes still
belongs to a human.

This file is the **single authority** for that policy. Other skills and repo
instructions point here; none of them restate the rules. If another document
disagrees with this one, this one wins — fix the other document.

It is maintainer-facing: it binds anyone whose agent can reach the Langfuse issue
tracker, and it has nothing to ask of an outside contributor.

*Provenance: the "Agentic Coding and Linear" RFC (LFE-15914), which replaced the
earlier "Linear is read-only for agents" posture; tightened after feedback that
auto-updating tickets mid-implementation was worse than proposing the update
(LFE-16058).*

## Default length

Ordinary Linear writes are short. A new ticket or subticket is a title and
two to four sentences: what to do, and why in one line if it is not obvious.
Comments stay to the thing the watcher needs today.

Expand — research, file lists — only when they ask ("expand this", "add
context"). Do not invent an implementation-ready brief.

Wrong (they said "create a subticket"): six fields, entry-point files, a
stack position, a research essay.

Right: "Warn sunset event types on POST /ingestion request body. Fern still
lists trace-create as if it works; say those event types stop on Nov 16."

## Why the taboo went away — and why a gate came back for updates

Linear used to be human-only for agents, and every skill that touched it had to
stop and present a review table first. That cost more than it protected: the
expensive thinking in an agent session — the decisions, the reversals, the traps
— evaporated when the session ended, because the one place it could have been
written down was closed.

Breaking the taboo is not removing every boundary. Marking is what stops
misattribution: a human must always be able to tell, at a glance, which text on
a ticket is theirs and which an agent wrote.

**Auto-writing comments and description edits** turned out to be a different
failure mode: the agent lands context the human did not choose, notifies
watchers, and can scramble the description another session is treating as
memory. So updates of an existing ticket are **proposals** — show the block,
get a yes, then write. The content still survives the session; the human
hand-selects what lands.

An explicit ask such as "write the handover", "comment on the ticket", or
"update Linear" **is** the go-ahead for that write. Do not ask twice.

## End of session: ask once whether to preserve on tickets

When a session produced decisions, reversals, or other reasoning that should
survive the chat — and you have not already been told to update Linear —
**close with a clear yes/no ask**, not a silent write and not a buried aside.

Use wording close to:

> Should I update the ticket(s) with the results of this session so they are
> preserved?

If yes, show the exact comment or description block (or the batch table), then
write. If no or unanswered, leave the block in the reply. Skip the ask only when
nothing durable came out of the session, or when they already approved the write
for this wrap-up.

## The three shapes

They compose. Stamp **every** shape you used, so the labels read as a log of what
agents did to the ticket.

### 1. Comment — propose, then post (only when a human must be told something now)

Label `AI commented`. Mark the comment body itself as agent-written.

A comment notifies every watcher. Use one when someone genuinely needs to see
something today: a blocker, a question that stops the work, a finding that
changes their plan.

**Show the comment body in your reply, get a yes, then post it.** Do not post
unsolicited comments.

**Durable post-context does not go here.** A wrap-up handover posted as a comment
sprays every watcher's inbox for something nobody needs to read today, and inbox
spam is how a good practice gets switched off. That goes in the description.

### 2. Edit a description — propose the block, then append

Label `AI edited`. Add a **clearly separated agent block**; never rewrite,
reflow, or "improve" the human's prose around it.

This is the durable half of the practice. `AI edited` is the filter a future
session uses to find prior agent reasoning, so the label is not decoration — it
is the index.

**Show the exact block you would append (and which ticket), get a yes, then
append it.** Do not edit a description unsolicited — including wrap-up
handovers. If the human declines or does not answer, leave the block in your
reply so nothing is lost.

What belongs in such a block, how to append it without destroying the
description, and why an attachment is not optional are
[`linear-context-handover`](../linear-context-handover/SKILL.md).

### 3. Create a ticket — a subticket freely, a top-level one after a yes

Label `AI created`. Say in the description that an agent created it and who it is
for. Default length is the short human ticket in *Default length* above.

**A subticket of an existing ticket needs no permission.** File the short
ticket. "Create a subticket" / "file this" / "add a ticket" is this shape.

**A ticket with no parent needs the human's yes first** — a top-level issue, or
one filed straight into a project. Show the title and the short description you
intend to file, get an explicit go-ahead, then **create it yourself**; do not
hand the text back for them to paste, which is the cost you were meant to remove.

A parentless ticket lands in somebody's triage queue — cost on people who did
not ask for it. A comment or description edit lands on a ticket someone is
already working — cost on their focus and on cross-session context. Both need a
yes. A child of an existing ticket does not.

## What still belongs to a human

Assigning, moving state, closing, estimating, re-prioritising, deleting,
projects, and creating new labels.

Surface these as suggestions in your reply — do not do them, and do not ask for
permission to do them as a way of getting them done. (A gated write is
different: asking is exactly the right move there, and then you perform the
write.)

## Sweeps: ask once for the batch, not once per ticket

A skill that reviews a whole queue — production errors, the alerts that fired
last week, a scaling review — comes back with many findings at once. Parentless
filings need a yes; so do description appends and comments onto tickets that
already exist.

**Ask for the set, in one go.** Present a table with the title and body (or the
append block / comment) you would land for each, and get a single go-ahead — or
a go-ahead for named rows. Then write those rows yourself and report what you
wrote. Asking twelve separate times is worse than the pasting it replaced.

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
**Never print or echo the secret value** (`LINEAR_API_KEY` / `LINEAR_TOKEN` /
`LINEAR_API_TOKEN`) while debugging or reporting the read — say only whether
access worked.

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

## Where preferences live

**Org defaults** for agent behaviour — including this propose-then-write gate —
live in `.agents/skills/**` (and the maintainer handbook that points at them).
Edit the skill when the team wants a different default.

**Personal overrides** (tone, focus areas, “always / never do X for me”) belong
in `.langfuse/me.md`, which is local and not shared. If a preference
should apply to every maintainer’s agent, promote it into a skill instead of
leaving it only in one person’s file. A richer commit-able preferences surface
in-repo is a separate, larger change; until then, skills are the shared source.
