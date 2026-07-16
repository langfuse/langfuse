---
name: weekly-production-review
description: |
  Prepare Langfuse weekly production reviews that audit what broke, what was
  fixed, what remains open, and where Datadog, incident.io, or Linear tracking
  needs cleanup. Use when asked for a production review, "what broke last week",
  fixed/open production bugs, Datadog alerted monitors/pages, Datadog error log
  patterns, incident.io incidents, incident.io alert load, pager load by
  engineer or time of day, or a source-table engineering review across
  incident.io, Linear bugs, Datadog alerts, and Datadog logs.
---

# Weekly Production Review

Use this skill to produce a source-grounded production review across Datadog,
incident.io, and Linear. Keep the output factual, table-first, and easy to
audit from the linked source rows.

## Scope

- Default "last week" to the previous Monday through Sunday in the user's
  timezone. State both local and UTC query windows in one short scope line.
- Cover all production environments unless the user narrows scope:
  `prod-us`, `prod-eu`, `prod-hipaa`, and `prod-jp`.
- Keep the first pass read-only. Do not create or update Linear issues,
  comments, incident.io records, follow-ups, alerts, Datadog monitors, files,
  Slack messages, or production systems unless the user explicitly asks after
  reviewing the findings.
- For chat-only reviews, avoid creating report artifacts or local analysis
  workspaces unless a required tool workflow explicitly does so or the user asks
  for a file. If incident.io analysis tooling requires a local playbook
  workspace, mention it only when relevant and keep production systems
  unchanged.
- Write `No measurements found` when a requested signal cannot be queried or
  measured.

## Related Skills

- Use [`datadog-query-recipes`](../datadog-query-recipes/SKILL.md) for
  production Datadog query shapes and environment/site routing.
- Use [`linear-bug-triage`](../linear-bug-triage/SKILL.md) only after a human
  explicitly approves a Linear write-back.
- Use [`incident-alert-tickets`](../incident-alert-tickets/SKILL.md) to check
  each Datadog alert cluster against the per-monitor knowledge base and, only
  after explicit human approval, record newly root-caused clusters there.

## Workflow

1. Confirm the review window and timezone. If the user says "last week", use the
   previous calendar week, not a rolling seven-day window.
2. Gather public/customer-facing incidents from incident.io. Prefer incident.io
   for accepted incidents, public incident visibility, follow-ups, and incident
   status. Always produce the incident.io table below, even when no rows are
   found.
3. Gather incident.io alert load for the same review window. Prefer
   incident.io alert or escalation stats for the primary Langfuse escalation
   path/team. If the user provides an incident.io pager-load dashboard URL, use
   its `escalation_path` parameter as a scope hint; use the dashboard date range
   only when the user explicitly scopes the review to that range instead of the
   default weekly window. Group by paged engineer and incident.io time-of-day
   bucket so the table shows working-hours, evening, and night load. Always
   produce the incident.io alert load table below.
4. Gather Linear bugs from the `bug` label first. Include all `bug`-labeled
   tickets created, updated, completed, or still open with production evidence
   during the window. Inspect likely production bugs with issue details and
   comments when status, owner, or evidence is unclear. Always produce the
   Linear bug table below.
5. Gather Datadog alert/page signals for the window. Use incident.io alerts or
   escalations when they represent pages; use Datadog monitor/event data when
   available. Build the exhaustive alert universe by paginating until no more
   results remain for the window. Cover every production environment in scope.
   Group repeated firings by monitor/page title or ID, environment, service/team,
   and trigger reason.
6. For every Datadog alert/page cluster, perform the deep dive before writing the
   final row. Do not stop at the monitor title or count. Check the monitor's
   `incident-alert` ticket first (see
   [`incident-alert-tickets`](../incident-alert-tickets/SKILL.md)); a
   documented cause section may explain the cluster — cite the ticket in the
   `incident.io / Linear Link` column. Inspect matching APM
   spans, representative traces, related logs, error records, exception details,
   failed job logs, dependency spans, queue backlog/delay context, and monitor
   time windows. Put the relevant trace/span evidence and relevant logs/errors
   directly in the Datadog alerts table. Do not create a separate Datadog Issue
   Deep Dives table.
7. Gather Datadog error log patterns for the window. Use logs with
   `status:error`, scope to production environments, and group by the clustered
   `message` pattern plus service/env where available. Always produce the
   Datadog logs table below. Preserve exact Datadog patterns, including wildcard
   tokens, instead of paraphrasing them.
8. Classify each incident, bug, alert, alert-load row, and log pattern. Separate
   production breakage from self-hosted, internal-only, duplicate, canceled,
   expected/test, staging/dev, monitor-noise, or unknown signals.
9. Cross-reference source rows on a best-effort basis. Link Datadog rows to
   matching incident.io incidents or Linear bugs when evidence supports the
   relationship. Link incident.io and Linear rows back to Datadog evidence when
   available. If a relationship is inferential, say so in the row.

## Output Contract

Return one short scope line followed by exactly these five source tables, in
this order:

1. incident.io
2. incident.io Alert Load
3. Linear Bugs
4. Datadog Alerts
5. Datadog Logs

Do not add an executive summary, narrative summary, event-centric view, summary
table, source synthesis table, or separate Datadog Issue Deep Dives table. Put
counts and classifications inside the source tables.

If a table has no rows, keep the table heading and write one row or sentence
with `No rows found` or `No measurements found` plus the scoped source/query.
If a row is unclear, classify it as `unclear` or `unknown/no measurements`
instead of dropping it.

## Cross-Source Linking

Keep incident.io incidents, incident.io alert load, Linear, Datadog alerts, and
Datadog logs as separate output tables. Use links inside each table to show
relationships instead of synthesizing a separate cross-source table.

Use Linear as the source of truth for deduplication across weeks and workflows.
Before reporting a bug, security finding, cost concern, or alert as new, search
Linear for matching issue keys, titles, source URLs, and comments — covering
both the `bug` label set and the `incident-alert` label set. If an
existing issue covers it, link to that issue and mark the row as already
tracked instead of reporting it again as fresh work.

Use short stable link labels:

- `Datadog monitor: <monitor name>`
- `Datadog logs: <env/service/symptom>`
- `Datadog spans: <env/route/symptom>`
- `Datadog trace: <trace id or route>`
- `incident.io: <INC reference>`
- `incident.io alert load: <escalation path or team>`
- `Linear: <issue key>`

Do not write links, create follow-ups, or update external systems unless the
user explicitly asks for changes after reviewing the report.

## incident.io Table

Use this table for incident.io incidents with public or customer-facing impact
in the review window. Query incident.io with `incident_list` scoped to the
review window and relevant team when known. Include `summary`, `roles`,
`custom_fields`, `timestamps`, `durations`, and `escalation_urgency` when the
tool supports them. If the tool cannot filter by visibility server-side, list
the scoped incidents and include only rows where `visibility` is `public` or
the evidence supports customer-facing impact.

| Incident | Severity / Status | Start / End / Duration | Impact | Linked Sources | Follow-ups / Notes |
| --- | --- | --- | --- | --- | --- |

Column rules:

- `Incident`: incident.io reference linked to the incident.
- `Severity / Status`: severity and current lifecycle status.
- `Start / End / Duration`: reported, identified, resolved, and duration when
  available.
- `Impact`: short impact statement grounded in the incident summary.
- `Linked Sources`: Datadog alerts/pages, Datadog logs/spans, Linear issues, or
  `none found`.
- `Follow-ups / Notes`: follow-up count/status or `none found`.

## incident.io Alert Load Table

Use this table for incident.io alert and pager load in the review window.
Prefer incident.io alert or escalation stats filtered to the Langfuse escalation
path or team. If the user provides a pager-load dashboard URL, parse and apply
the `escalation_path[one_of]` filter when available. Count alerts when the
source returns alert counts; otherwise count escalations/pages and label the
count source in `Source / Notes`.

incident.io time-of-day buckets are UTC:

- `working_hours`: 09:00-18:00 Monday-Friday.
- `late_evening`: 18:00-23:00 any day plus weekend daytime.
- `overnight`: 23:00-09:00.

Render one row per paged engineer, sorted by total descending, and include a
final `All engineers` row when measurements exist. If user identity is missing,
use `Unassigned / no responder`. Do not collapse this table into a narrative
summary.

| Engineer | Working Hours | Late Evening | Overnight | Total Alerts / Pages | Share | Source / Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |

Column rules:

- `Engineer`: paged user or escalation target. Use the engineer's display name
  when available.
- `Working Hours`: count in the `working_hours` bucket.
- `Late Evening`: count in the `late_evening` bucket.
- `Overnight`: count in the `overnight` bucket.
- `Total Alerts / Pages`: row total. Label pages versus alerts in
  `Source / Notes` when the source does not expose alert counts directly.
- `Share`: row total divided by the measured alert/page total.
- `Source / Notes`: source query, escalation path/team filter, dashboard link,
  or `No measurements found`.

## Linear Bugs Table

Start from all Linear tickets with the `bug` label that were touched by the
window. Do not rely only on text searches for `prod`, `incident`, or `Datadog`;
those searches are useful for enrichment but are not the source universe. This
table is the Linear source inventory. A Linear bug can be classified as
non-production, duplicate, canceled, or no-action.

| Linear | Title | Summary | Owner | Status | Touched Last Week Because | Production Evidence | Classification | Counted? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Column rules:

- `Linear`: issue key linked to Linear, such as `LFE-123`.
- `Title`: Linear issue title in a separate column.
- `Summary`: one operational sentence based on the issue body, comments, and
  evidence. Avoid fix guesses.
- `Owner`: assignee if present; otherwise owning team if clear; otherwise
  `Unassigned`.
- `Status`: Linear status or state, plus completion timing when useful.
- `Touched Last Week Because`: `created`, `updated`, `completed`, or
  `open production bug`.
- `Production Evidence`: prod env, customer impact, incident.io incident,
  Datadog link, measured logs/spans/errors, or `No measurements found`.
- `Classification`: use `production/customer-impacting`, `internal-only`,
  `self-hosted`, `staging/dev`, `duplicate/canceled/no-action`, or `unclear`.
- `Counted?`: `yes` only when the bug label and production/customer-impacting
  evidence support including it in fixed/open production bug counts.

## Datadog Alerts Table

Use this table for every production Datadog alert/page cluster found in the full
paginated alert/event pass, including clusters later classified as
`expected/test`, `monitor noise`, or `unknown/no measurements`.

| Monitor / Page Signal | Env / Service | Count / Window | Why It Alerted | Trace / Span Evidence | Relevant Logs / Errors | Verdict | incident.io / Linear Link |
| --- | --- | ---: | --- | --- | --- | --- | --- |

Column rules:

- `Monitor / Page Signal`: monitor/page title or stable ID.
- `Env / Service`: production env and service/team labels.
- `Count / Window`: grouped firing/page count and relevant time window.
- `Why It Alerted`: monitor threshold, trigger condition, route, queue, status
  code, latency, or backlog signal.
- `Trace / Span Evidence`: representative trace/span links, error counts,
  latency, status codes, dependency spans, or `No measurements found`.
- `Relevant Logs / Errors`: explicit exception class/message, exact or
  normalized log message, failed job IDs when visible, DB/downstream errors,
  retry exhaustion, validation failures, or `No measurements found`.
- `Verdict`: use `customer incident`, `confirmed bug`, `infra/dependency`,
  `expected/test`, `monitor noise`, or `unknown/no measurements`.
- `incident.io / Linear Link`: matching incident.io reference, Linear issue key,
  explicit disposition, or `none found`.

For API route and queue consumer errors, start from APM spans matching:

```text
operation_name:(http.server OR bullmq.consumer) status:error env:<prod-env>
```

Then narrow by `service`, `resource_name`, route, queue, consumer, status code,
error type, or monitor time window. For failed trace samples, explicitly query
related Datadog logs and error records using the trace ID, span ID, service,
resource name, environment, and same time window. If no related logs or error
records are found, write `No measurements found`.

Before finalizing, compare the final Datadog alerts table against the full
paginated alert/event sweep. Confirm every production monitor title seen during
the window appears in the table or is explicitly excluded as non-prod.

## Datadog Logs Table

Use this table for the most frequent production error-log patterns from the
review window. This is a broad log-health pass and is separate from the alert
cluster rows above, though rows should cross-link when possible.

Start from a Datadog Logs query shaped like:

```text
status:error
```

Scope it to the review window and production environments in scope. Prefer the
Datadog pattern/clustering view using the log `message` field as the clustering
pattern field. Group or facet by `service`, `env`, and `status` when available,
and sort by count descending. Review at least the top 10 patterns overall, plus
any additional top pattern per production environment when the global top 10 is
dominated by one env or service.

| Exact Log Pattern | Env / Service | Count / Share | Representative Error | Related Signal / Link | Disposition |
| --- | --- | ---: | --- | --- | --- |

Column rules:

- `Exact Log Pattern`: exact Datadog clustered pattern or exact raw log message.
  Preserve Datadog wildcard syntax such as `[wildcard]...[/wildcard]`. Do not
  paraphrase this column.
- `Env / Service`: affected production envs and services.
- `Count / Share`: count in the review window and share if available.
- `Representative Error`: one exact short representative message, exception
  class, or stack/log summary. Avoid long stack traces.
- `Related Signal / Link`: related Datadog alert row, trace, log query,
  incident.io incident, Linear issue, or `none found`.
- `Disposition`: use `known incident`, `tracked bug`, `needs investigation`,
  `expected/test`, `monitor noise`, or `unknown`.

If a high-volume pattern maps to a failed API route or queue consumer, ensure
the matching Datadog alert row includes the trace/log/error investigation. If a
high-volume pattern has no alert/page row, keep it in this table anyway and
mark it `needs investigation` or `unknown` based on evidence.

## Output Format

Return valid Markdown only.

- Use valid Markdown syntax for headings, links, and tables.
- Include a space after list markers such as `-`, `*`, and `1.`.
- Close links and parentheses correctly.
- Do not emit malformed tables, dangling backticks, or partially opened code
  fences.
- Escape table pipes inside log patterns or error messages when needed.
- If a section would be fragile to format, prefer a plain paragraph over broken
  Markdown.
