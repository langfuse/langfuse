---
name: linear-work-rhythm
description: |
  Answer "what should I do today" for a Langfuse maintainer, from the tracker
  rather than from memory: which projects you lead, which owe an update before
  the Monday engineering weekly, what shipped but is not finished, what waits
  on your decision, and what colleagues are working on that overlaps. Use on "what
  should I do today", "what's on my plate", "what should I work on next", "prep
  my Monday update", "what did I say last week", "who else is working on this",
  "who should review this", and whenever someone hands over a bare link — a
  ticket, a pull request, a Slack permalink — and expects you to take it from
  there.
---

# The working rhythm, read live

**Answer from the tracker, never from recall.** Ownership, health and dates
change daily, and a plausible answer assembled from memory is worse than no
answer because nobody can tell it is stale.

Who the person is comes from `~/.config/langfuse/me.md`. If it is not there,
**ask** — their name and what they work on, in one question — and write the file
so it is answered for good. Do not send a colleague of a year through onboarding
to find out their name; that skill is for people who are new. Do not guess, and
do not answer this question for an outside contributor, who owns none of it.

**The rules behind every check below are the working agreement**, published in
`content/handbook/tools-and-processes/using-linear.mdx` in
`langfuse/langfuse-docs`. Read it rather than trusting this file for *what* is
required; this file is only the set of queries that reveal where you stand
against it. When the two disagree, the handbook wins and this file is the bug.

Read it from `origin/main` — `git fetch -q origin main` then
`git show origin/main:<path>` — because a docs checkout is usually parked on an
old branch, and quoting a stale agreement is worse than not quoting one.

**Read these before ranking anything.** They say how the team decides what to
work on, and this file deliberately does not restate them:

| Page | What you need from it |
| --- | --- |
| `content/handbook/product-engineering/how-we-work/how-we-ship.mdx` | Prioritisation, the P0–P3 levels and their timelines, daily response times, the project-update rhythm |
| `content/handbook/product-engineering/principles.mdx` | What product engineers do and explicitly do not do |
| `content/handbook/how-we-work/ownership.mdx` | That product areas are split between engineers by direct ownership |
| `content/handbook/tools-and-processes/using-linear.mdx` | The working agreement: primitives, project lifecycle, definition of done |

If what you are about to say contradicts one of them, the handbook wins.

## Do not hand-maintain the responsibility zone

Derive it. What someone owns is exactly "the projects where they are lead", and
that answer is one call old:

```
list_projects(member: "me", state: "started",
              fields: [name, status, lead, targetDate, priority, labels, teams, url])
```

A local list of someone's projects is stale within a week — this repo has been
burned by exactly that. `me.md` holds only the durable half: name, role, and the
focus they described in their own words.

## What ranking actually means here

Product engineers set their own priorities. The handbook is explicit — *"everyone
manages their own priorities and escalates to their lead when work piles up"* —
so you are not issuing a to-do list. You are making the state of the week
visible so somebody else can decide.

**A P0 outranks everything, including this ordering.** The handbook defines it
as drop-everything — a security incident, ingestion delay, the traces table not
loading. If one exists, it is the answer and the rest of the list can wait; do
not bury it under a blocked review.

With no P0 open, rank by the handbook's own balance: *"we balance busy work with
making progress on the most important project we're driving forward."*

1. **What moves the project they are driving.** A blocked review, a decision
   waiting on someone else, work sitting one approval away from shipping.
2. **P1** — same-week by definition, so it competes with the project rather than
   deferring behind it. Use the handbook's levels, not adjectives you invent.
3. **Busy work, bounded.** Bug fixes and support are capped at roughly two hours
   a day by the same page. Reviews turn around inside 24 hours. Present these as
   the budget they are, not as the plan.

**Never present admin as the work.** Drafting an update, merging `main` into a
stale branch, clearing a queue: those are chores you can offer to take off
someone, and offering is useful. Ranking them as what to do today is not — it
reads as though you did not find the real work. If the honest answer is that
nothing is blocked and the week is clear, say that in one line.

## The six checks

### 1. Updates the engineering weekly will read

**Monday is the engineering weekly**, and the team reads project updates
together in it and plans the week from them. So an update has to exist *before*
Monday — written Friday or Monday morning, it does not matter which. An
out-of-date project is a gap in that plan, which is why this is the heaviest
recurring obligation and the easiest to miss: nothing notifies you.

Today's date decides how you say it. Before Monday, this is a deadline
approaching. On Monday, it is late. Mid-week, it is a commitment nobody has
closed out — see below.

```
get_status_updates(type: "project", user: "me")
```

**Do not put a lower bound on that window.** A cutoff drops exactly the projects
that need reporting: one last updated five weeks ago returns nothing, so you can
say only "older than the window" — not how stale it is, and not what its last
"next step" was. Take the newest update per project from an unbounded query
instead, and page if you have to.

**Which projects owe one:** every in-progress project they lead whose newest
update predates the last Monday. That is the cutoff — the weekly reads what is
there, so anything that missed the previous round is still outstanding. A project
with **no update at all** is the worst case, not an absent row.

Use the cutoff to *select*, then use the framing below to *say it*. The two are
not in tension: which projects are outstanding is a date question, and what to
say about each one is not.

**Do not report this as staleness.** "Five updates are 11 days stale" is a
number nobody committed to and a word that means nothing — it sounds like a
metric and carries no information about the work. What is real is the *last thing
they said they would do*. Every update ends with a next step, so quote it back
and ask about that:

> On 24 Aug you said Front End Perf's next step was checking whether we should
> use react-compiler. Did that happen, or has it been overtaken?

That is a question they can answer in five seconds, and the answer *is* the new
update. An age in days is not. If several projects are in the same position,
give one line each in that shape — the commitment, then the question — rather
than a list of dates.

An update carries health, progress since the last one, next step, blockers or
decisions needed, and any target-date change. The previous next step is where
this week's goal already is, so read it before writing anything new.

### 2. Shipped but not finished

Issues sitting in **Merged** are the staging area between a merged PR and `Done`,
and they exist so follow-ups get captured before the work leaves your view.

```
list_issues(assignee: "me", state: "Merged",
            fields: [title, status, project, labels, updatedAt, url])
```

For each, ask the three questions the agreement puts at this step, and ask them
out loud rather than assuming the answer is no:

- **Does this need a docs page or an edit?** User-visible behaviour usually does.
  The docs live in `langfuse/langfuse-docs` under `content/docs/`. If that repo is
  not checked out, say so and give the clone command — a missing checkout is why
  documentation silently stops happening.
- **Does it need a changelog entry?** `changelog-writing` owns the shape.
- **Did a customer ask for this?** If a customer request is linked, they get told.

Then it can move to `Done` — by a human. Moving tracker state is not an agent's
to do; propose it.

An issue that has been in `Merged` for weeks is the signal this step is not
running. Count them and lead with the number.

### 3. What the rest of the team is doing

The updates you have not read are worth more than the ones you wrote. Colleagues
post weekly on their own projects, and that is where you find out somebody is
already inside the surface you were about to change.

The workspace is shared with the wider organisation, and there is no team filter
on the updates query — so a bare `get_status_updates(type: "project")` returns
whatever is newest across every team and truncates at the limit. Filtering that
page down to Langfuse afterwards silently drops the rows you wanted, and the
answer comes back as "nobody is working on this."

Ask per project instead, so nothing competes for the page:

```
list_projects(team: "<the Langfuse team>", state: "started", fields: [name, lead])
get_status_updates(type: "project", project: "<each one>", limit: 5)
```

Then look for overlap with what this person leads or is about to touch, and
**name the colleague, not the ticket**:

> Trang was reworking that flow last week — worth asking her to review.

That sentence is the whole feature. A list of forty updates is not.

Two places to look beyond project updates: a colleague's `<Name> Housekeeping`
project, which is where people post work that belongs to no single project, and
the `AI edited` label on anything you are about to open — an earlier agent may
have left the reasoning already.

**The roster is what makes a name usable.** `components-mdx/team-members.mdx` in
`langfuse/langfuse-docs` lists everyone with their role and their **GitHub
handle**, which is the only join between the three places a colleague appears:
a display name in the tracker, a handle in `git log` and `git blame`, and a
reviewer on a pull request. Read it from `origin/main`, the same as the handbook.
Mind the direction. `git log` and `git blame` give you an author **name and
email**, not a handle — so the name is what you join on, and the handle is what
you get back, for asking GitHub to add them as a reviewer. If a name does not
match the roster, `gh api repos/langfuse/langfuse/commits/<sha>` carries the
author's login directly.

It is maintained by people adding themselves, so it lags — someone missing from
it is not evidence they are not on the team. When the roster and `git log`
disagree, `git log` is the one that just happened.

### 4. Waiting on your decision

Triage normally gets a decision within one working day. Check the triage state on
your teams, and your own inbox-shaped work: things assigned to you that you have
not moved, and requests routed to you as a feature owner.

### 5. Your open bugs

A weekly look at your own bugs, to catch what is slipping. **Bounded**: bug
fixes and support are capped at roughly two hours a day, so this is a budget
check, not a backlog to work through. If it consistently needs more than that,
the handbook says to escalate rather than absorb it — say so.

```
list_issues(assignee: "me", label: "bug", state: "started")
```

Also check unstarted bugs assigned to you — a bug nobody has begun is the one
that slips.

### 6. Lifecycle compliance, but only where it changes what you do

Report a gap only when fixing it is the next action. In-progress projects need a
*specific* target date; planned ones need owner, priority, a quarter-level target
date, and a pod or function label. Missing labels across every project is one
finding, not eight.

Do not turn this into an audit. One line naming the pattern is more useful than
a per-project table, and the agreement is explicit that this system stays
lightweight.

## Someone hands you a link

A ticket, a pull request, a Slack permalink, a screenshot. Read it, work out what
it is asking for, and propose the next step — do not ask which skill applies.

- **A tracker ticket** → reconstruct its history first
  ([`linear-context-handover`](../linear-context-handover/SKILL.md)), then say
  whether it is one commit or needs planning
  ([`linear-planning`](../linear-planning/SKILL.md)).
- **A Slack permalink** → read the thread if a Slack tool is connected. If it is
  not, say so in one line and ask them to paste it; do not guess from the URL.
  What usually follows is a ticket, so offer to draft one — and remember a
  parentless ticket needs their yes.
- **A pull request** → the review conventions are `git-workflow`, and whether it
  wants a stack is `pr-stack-workflow`.

## Writing anything back

Every write follows [`linear-agent-writes`](../linear-agent-writes/SKILL.md) —
read it first. Two things specific to this skill:

- **A project update is a status update, not a description edit or a comment.**
  It is the owner's voice on their own project. Draft it, show it, and let them
  post it or tell you to. Do not post one as if it were theirs.
- **State changes are theirs**: moving `Merged` to `Done`, re-prioritising,
  changing a target date, reassigning. Surface them as the recommendation they
  are.

## What this does not cover

Clearing the notification inbox, support queues and pull-request review load are
[`housekeeping`](../housekeeping/SKILL.md); this skill is the project-lead layer
above it. For the reasoning behind a specific piece of work rather than its
status, use [`linear-context-handover`](../linear-context-handover/SKILL.md).
