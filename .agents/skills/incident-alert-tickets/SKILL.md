---
name: incident-alert-tickets
description: |
  Read and record root causes in the Linear `incident-alert` knowledge base. Use
  before and after investigating a named Datadog monitor, incident.io alert or
  incident, or on-call page to find or record root causes.
---

# Incident Alert Tickets

Incident-alert tickets turn on-call debugging into searchable knowledge: one
Linear ticket per production alert/monitor, one dated section per distinct
root cause. This skill owns lookup, comparison, and the human-gated
write-back; calling skills own the investigation itself. The team SOP is the
Linear document titled "Incident Alert Tickets".

## When to Apply

Apply whenever the task is anchored to an **alert identity**:

- a Datadog monitor ID or title,
- an incident.io alert or INC reference,
- an on-call page ("we got paged for X").

Do not try to detect "incident mode" — the presence of a named alert is the
condition, because the monitor is the ticket key. When an alert identity is
present, the lookup is mandatory; recording is offered after the investigation
and gated on human approval. A customer report or code question with no alert
identity skips this skill.

When multiple alerts fire together (a cascade), run lookup, compare, and
classify for **each** alert identity — every monitor has its own ticket. If
one root cause explains several alerts, write the full cause section on the
monitor closest to the cause and propose a short dated section on the other
monitors' tickets that links to it.

## Ticket Contract

- One ticket per monitor (per env when monitors are per-env), titled
  `[ENV] <Monitor title>`, in the Engineering (LFE) team, carrying the
  `incident-alert` label. The label set is the knowledge base.
- Regional twins of one monitor (same metric and threshold per env) may share
  a single ticket titled `[ENV1/ENV2] <Monitor title>` when the causes are
  region-independent; list each env's monitor ID in the alert header.
- The description opens with an alert header: monitor ID, trigger condition,
  and how it surfaces (incident.io urgency, auto-resolve behavior).
- One dated section per distinct root cause, separated by `---`:

  ```markdown
  ## YYYY-MM-DD — <short cause name>

  **Recognize it:** <signals that identify this cause: log patterns, span
  filters, metric shapes, affected routes>

  **How urgent?** <impact, auto-recovery behavior, escalation threshold>

  **Fix:** <positive actions only — every "do not X" needs a working
  alternative; verified levers, not speculation>
  ```

- Cause sections are append-only: never rewrite or delete an existing section;
  new knowledge gets a new dated block.
- The description ends with a `## Your cause is not listed?` trailer: it
  records firings that were never root-caused and tells the next engineer to
  insert new dated sections above it, in the same format.
- Keep each cause section to roughly one screen.
- A distinct problem discovered during the investigation that is *not* a cause
  of this alert gets its own ticket (bug or incident-alert), cross-linked — do
  not mix it into this ticket's cause sections.

## Lookup

1. List Linear issues carrying the `incident-alert` label.
2. Match on monitor ID first (tickets carry it in the alert header), then on
   monitor title and env.
3. Read the matched ticket's cause sections and comments.

## Compare and Classify

Compare the current evidence against each cause section's "Recognize it"
signals and classify:

- **Known cause** — a section matches. Cite the ticket and section in the
  analysis; its "Fix" is the starting recommendation. This may end the
  investigation before any Datadog sweep.
- **New cause on existing ticket** — the monitor has a ticket but no section
  matches the evidence. Propose appending a dated section.
- **No ticket** — no ticket matches the monitor. Propose creating one, and file
  it once that is approved.

Treat a partial match — some "Recognize it" signals fit, others do not — as a
**new cause**, never as a known one: do not recommend a documented "Fix"
whose recognition signals only partially match. Name the near-miss section in
the proposed ticket so the human can judge the overlap.

## Write-Back

Appending a cause section to a ticket that already exists is a description edit,
which agents do autonomously. A monitor with no ticket needs a parentless one,
which is the single write that asks first — see
[`linear-agent-writes`](../linear-agent-writes/SKILL.md) for the policy this
follows, and read it before your first write.

- **Append: do it.** Insert the new `---`-separated dated block after the
  existing cause sections, above the `Your cause is not listed?` trailer; leave
  everything else untouched. Mark the block as agent-written in its own text and
  label the ticket `AI edited`. Never reflow or rewrite the human-written prose
  around it.
- **Create: show it, then file it.** Prepare the issue — title
  `[ENV] <Monitor title>`, the `incident-alert` label, description = alert header,
  the first dated cause section, and the `Your cause is not listed?` trailer —
  show it for a go-ahead, and once you have one, create it yourself and label it
  `AI created`. One go-ahead covers the whole run's proposed tickets.

Report what you did either way:

| ID | Alert / Monitor | Classification | Action | Content |
| --- | --- | --- | --- | --- |

- `Action`: `appended to <key> (AI edited)`, `awaiting your go-ahead`,
  `filed <key> (AI created)`, or `none (known cause)`.
- `Content`: the dated section, or the full ticket body exactly as it will be
  filed — that text is what the go-ahead is given against.

If Linear is unreachable in this environment, say so and return every row as text
ready to paste rather than skipping the write-back silently.

## Division of Labor

- [`linear-bug-triage`](../linear-bug-triage/SKILL.md) owns bug deduplication
  and creation from measured evidence. Incident-alert tickets are per-monitor
  runbook knowledge, not defect reports.
- An alert whose root cause is a code bug gets both: the cause section
  documents recognition and mitigation, and links the bug ticket that tracks
  the durable fix.
