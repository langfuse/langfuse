---
name: weekly-production-review
description: |
  Prepare Langfuse weekly production reviews that explain what broke, what was
  fixed, what remains open, and where alerting or tracking needs cleanup. Use
  when asked for a production review, "what broke last week", fixed/open bugs,
  Datadog alerted monitors/pages, status-page incidents, incident.io incidents,
  or an engineering-team overview that combines Linear, Datadog, and customer
  incident signals.
---

# Weekly Production Review

Use this skill to produce a source-grounded, event-centric production review.
The report should help engineering understand the week, not just list tool
output.

## Scope

- Default "last week" to the previous Monday through Sunday in the user's
  timezone. State both local and UTC query windows.
- Cover all production environments unless the user narrows scope:
  `prod-us`, `prod-eu`, `prod-hipaa`, and `prod-jp`.
- Keep the first pass read-only. Do not create or update Linear issues,
  comments, incident.io records, follow-ups, alerts, or Datadog monitors unless
  the user explicitly asks after reviewing the findings.
- For chat-only reviews, avoid creating report artifacts or local analysis
  workspaces unless a required tool workflow explicitly does so or the user asks
  for a file. If incident.io analysis tooling requires a local playbook
  workspace, mention it briefly inline when relevant and keep production systems
  unchanged.
- Write `No measurements found` when a requested signal cannot be queried or
  measured.

## Related Skills

- Use [`datadog-query-recipes`](../datadog-query-recipes/SKILL.md) for
  production Datadog query shapes and environment/site routing.
- Use [`linear-bug-triage`](../linear-bug-triage/SKILL.md) only after a human
  explicitly approves a Linear write-back.

## Workflow

1. Confirm the review window and timezone. If the user says "last week", use the
   previous calendar week, not a rolling seven-day window.
2. Gather customer-facing incidents from the public status page and incident.io
   if available. Prefer incident.io for internal accepted incidents and
   follow-ups; use the status page as the customer-facing source of truth.
3. Gather Datadog alert/page signals for the window. Use incident.io alerts or
   escalations when they represent pages; use Datadog monitor/event data when
   available. First build the exhaustive alert universe by paginating through
   Datadog events until no more results remain for the window; do not rely on a
   truncated first page, sampled titles, or a few spot checks. Cover all prod
   envs in scope even when one site is noisy or one env looks quiet. After the
   full pass, group repeated firings of the same monitor instead of counting
   every notification as a separate event.
4. Gather Linear bugs from the `bug` label first. Include all `bug`-labeled
   tickets created, updated, completed, or still-open with production evidence
   during the window. Inspect likely production bugs with issue details and
   comments when status, owner, or evidence is unclear. Use Linear as the
   source of truth for deduplication and follow-up ownership: search existing
   issues, comments, and linked source URLs before treating a signal as new.
5. Classify each bug and alert. Separate production breakage from staging,
   self-hosted, internal-only, duplicate, canceled, test, or monitor-noise
   signals.
6. Build the event/evidence model below. One event row can cite multiple
   status incidents, Datadog pages, Linear bugs, and follow-ups. One evidence
   row can also be classified as non-production, noise, or no-action.
7. Synthesize the event-centric view first, then keep the raw source tables as
   evidence sections. Lead with conclusions, not tool output.

## Event and Evidence Model

The report has one main engineering view and three evidence sections:

- `Event-Centric View`: one row per distinct production issue to discuss in
  engineering review. This is the main narrative and the event count.
- `Customer Incident Table`: customer-facing incident records from the status
  page or incident.io. These can support an event row but are not a separate
  event count.
- `Linear Bug Table`: the `bug`-labeled issue universe touched by the window.
  This explains fixed/open bug counts and dedupe decisions.
- `Datadog Alert/Page Signals`: monitor and page clusters. These are evidence
  and measurement, not production events by themselves.

Use Linear as the source of truth for deduplication across weeks and workflows.
Before reporting a bug, security finding, cost concern, or alert as new, search
Linear for matching issue keys, titles, source URLs, and comments. If an
existing issue covers it, link to that issue and mark the review row as already
tracked instead of reporting it again as fresh work.

Anchor each event row with the most durable reference available:

- Use an incident.io incident when there is customer impact, status-page
  communication, coordinated response, or post-incident follow-up.
- Use a Linear bug when production behavior broke but the issue did not become
  an incident.
- Use an explicit alert disposition when the signal is `expected/test`,
  `monitor noise`, or `unknown/no measurements` and no incident or Linear bug
  should be created yet.

Treat Datadog as evidence, not ownership. Treat the public status page as the
customer-facing record, not the engineering source of truth. Keep source links
in the evidence section where they originated and cite the relevant evidence in
the event row.

For a healthy review, each real production event should satisfy one of:

```text
Event anchor = incident.io incident
OR event anchor = Linear production bug
OR event anchor = explicit alert disposition
```

### Proposed Link Titles

When proposing or later creating links, use short stable titles:

- `Datadog monitor: <monitor name>`
- `Datadog logs: <env/service/symptom>`
- `Datadog spans: <env/route/symptom>`
- `Datadog trace: <trace id or route>`
- `Status incident: <status title>`
- `incident.io: <INC reference>`
- `Linear follow-up: <issue key>`

Do not write any of these links unless the user explicitly asks for changes
after reviewing the report.

## Output Table Rules

Use the tables defined below as the default output contract. Keep the table
names, column names, and section order stable across runs so reviewers can scan
the same shape every week. Do not add extra source-specific tables unless the
user asks or the existing columns cannot represent an important finding.

If a section has no rows, keep the section and write `No rows found` or
`No measurements found` with the query/source that was checked. If a row is
unclear, classify it as `unclear` or `unknown/no measurements` instead of
dropping it.

## Linear Bug Table

Start from all Linear tickets with the `bug` label that were touched by the
window. Do not rely only on text searches for `prod`, `incident`, or `Datadog`;
those searches are useful for enrichment but are not the source universe. This
table is the Linear source inventory, not the event count. Multiple Linear bugs
can support one event row, and one bug can be classified as non-production,
duplicate, canceled, or no-action.

Use this table for the bug section:

| Linear | Title | Summary | Owner | Status | Touched Last Week Because | Production Evidence | Classification | Counted? |
| ------ | ----- | ------- | ----- | ------ | ------------------------- | ------------------- | -------------- | -------- |

Column rules:

- `Linear`: the issue key linked to Linear, such as `LFE-123`.
- `Title`: the Linear issue title in a separate column. Do not collapse the
  title into the `Linear` link because reviewers need to scan IDs and titles
  independently.
- `Summary`: one operational sentence based on issue body, comments, and
  evidence. Avoid fix guesses.
- `Owner`: assignee if present; otherwise owning team if clear; otherwise
  `Unassigned`.
- `Status`: the Linear status or state, plus completion timing when useful
  such as `Done May 18`, `Todo`, `Triage`, or `Canceled`.
- `Touched Last Week Because`: `created`, `updated`, `completed`, or
  `open production bug`.
- `Production Evidence`: prod env, customer impact, status incident, Datadog
  link, measured logs/spans/errors, or `No measurements found`.
- `Classification`: use one of `production/customer-impacting`,
  `internal-only`, `self-hosted`, `staging/dev`, `duplicate/canceled/no-action`,
  or `unclear`.
- `Counted?`: `yes` only when the bug label and production/customer-impacting
  evidence support including it in fixed/open production bug counts. Do not use
  this field as the production event count.

For headline counts, report fixed and open production bugs separately from the
total number of bug-labeled tickets reviewed.

## Datadog Alert/Page Signals

Use this table as the Datadog evidence layer. It answers "what alerted or
paged?" and then links each alert cluster to an event row or an explicit
disposition.

| Monitor/Page Signal | Env | Count / Window | Why It Alerted | Verdict | Linked Event |
| ------------------- | --- | -------------: | -------------- | ------- | ------------ |

The Datadog table is monitor-centric, not the primary narrative. Use these
verdicts:

- `customer incident`
- `confirmed bug`
- `infra/dependency`
- `expected/test`
- `monitor noise`
- `unknown/no measurements`

Group repeated pages by monitor name or ID, environment, service/team, and
trigger reason. Exclude or clearly mark SLO/burn-rate monitors, test monitors,
and maintenance-window noise when the review is about actionable breakage.
The table must still account for every production Datadog alert cluster found
in the full event pass, including clusters later classified as `expected/test`,
`monitor noise`, or `unknown/no measurements`.

Before finalizing the review, perform a completeness check:

1. Compare the final Datadog table against the full paginated event sweep.
2. Confirm every production monitor title seen during the window appears in the
   table or is explicitly excluded as non-prod.
3. If a known title is missing, add it before writing the narrative summary.

`Linked Event` should be the event row name, incident.io reference, Linear issue
key, or explicit disposition. Use `expected/test`, `monitor noise`,
`unknown/no measurements`, or `non-prod` when no engineering event should be
created. Do not leave a real production page as `none` unless the next action is
to classify the alert.

## Event-Centric View

Use this as the main engineering narrative:

| Event | Impact | Sources | State | Owner / Team | Next Action |
| ----- | ------ | ------- | ----- | ------------ | ----------- |

The event-centric view answers "what actually broke and what should engineering
discuss?" It deduplicates the evidence sections into production issues. Combine
related status incidents, Datadog pages, Linear bugs, and follow-ups into one
row when the evidence supports it. If correlation is inferential, say so.

Good event rows:

- Name the affected product surface or system behavior.
- State impact only as far as sources support it.
- Use the incident.io reference, Linear issue key, or alert disposition in the
  event name or sources.
- Link source IDs such as status incident IDs, incident.io references, Datadog
  monitor IDs, and Linear issue keys.
- Mark state as `fixed`, `mitigated`, `open`, `monitoring`, `noise`, or
  `unknown`.
- Prefer a concrete next action: fix owner, monitor tuning, correlation cleanup,
  close stale ticket, or no action.

## Customer Incident Table

Use this section for public status-page incidents and accepted incident.io
incidents. This table preserves the customer-facing incident record and its
timing; it does not replace the event-centric view.

| Incident | Severity / Status | Start / End / Duration | Impact | Linked Sources |
| -------- | ----------------- | ---------------------- | ------ | -------------- |

Lead each incident summary with its reference or URL. Preserve uncertainty when
status-page timezone, severity, linked alerts, or Linear follow-ups are missing.

## Executive Summary

Start the final report with:

- Review window and environments checked.
- Number of customer-facing incidents.
- Number of Datadog alert/page clusters, plus noisy/test clusters if relevant.
- Number of `bug`-labeled Linear tickets reviewed.
- Production bug count split by fixed and open.
- Highest open risk and why.

Then present sections in this order:

1. Event-Centric View.
2. Customer Incident Table.
3. Linear Bug Table.
4. Datadog Alert/Page Signals.

## Output Format

Return valid Markdown only.

- Use valid Markdown syntax for headings, bullets, links, and tables.
- Include a space after list markers such as `-`, `*`, and `1.`.
- Close links and parentheses correctly.
- Do not emit malformed tables, dangling backticks, or partially opened code
  fences.
- If a section would be fragile to format, prefer a plain paragraph over broken
  Markdown.
