---
name: incident-alert-tickets
description: |
  Look up, compare against, and (after human approval) update the Linear
  incident-alert knowledge base: one ticket per production alert/monitor,
  labeled `incident-alert`, with one dated cause section per distinct root
  cause. Use whenever an investigation is anchored to a named alert identity —
  a Datadog monitor ID or title, an incident.io alert/INC reference, or an
  on-call page — both before debugging from scratch (a documented cause may
  already answer it) and after establishing a new root cause (record it).
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
- **No ticket** — no ticket matches the monitor. Propose creating one.

Treat a partial match — some "Recognize it" signals fit, others do not — as a
**new cause**, never as a known one: do not recommend a documented "Fix"
whose recognition signals only partially match. Name the near-miss section in
the draft so the human can judge the overlap.

## Write-Back (Human Approval Gate)

Never create or update a ticket without explicit human approval. Present the
proposal first:

| ID | Alert / Monitor | Classification | Proposed Action | Draft Content | Human Decision |
| --- | --- | --- | --- | --- | --- |

- `Proposed Action`: `append cause section to LFE-XXXX`, `create ticket`, or
  `none (known cause)`.
- `Draft Content`: the dated section (or full ticket body) exactly as it would
  be written.
- `Human Decision`: leave blank for the human to choose.

Wait for the human to select row IDs and actions before writing. On approval:

- **Append**: insert the new `---`-separated dated block after the existing
  cause sections, above the `Your cause is not listed?` trailer; leave
  everything else untouched.
- **Create**: new Engineering (LFE) issue titled `[ENV] <Monitor title>` with
  the `incident-alert` label; description = alert header, the first dated
  cause section, and the `Your cause is not listed?` trailer.

## Division of Labor

- [`linear-bug-triage`](../linear-bug-triage/SKILL.md) owns bug deduplication
  and creation from measured evidence. Incident-alert tickets are per-monitor
  runbook knowledge, not defect reports.
- An alert whose root cause is a code bug gets both: the cause section
  documents recognition and mitigation, and links the bug ticket that tracks
  the durable fix.
