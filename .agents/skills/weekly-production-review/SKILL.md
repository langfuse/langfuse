---
name: weekly-production-review
description: |
  Prepare Langfuse weekly production reviews that explain what broke, what was
  fixed, what remains open, and where alerting or tracking needs cleanup. Use
  when asked for a production review, "what broke last week", fixed/open bugs,
  Datadog alerted monitors/pages, Datadog error log patterns, incident.io
  incidents or pager load, or an engineering-team overview that combines
  Datadog, incident.io, and Linear production signals.
---

# Weekly Production Review

Use this skill to produce a source-grounded production review across Datadog,
incident.io, and Linear. The report should help engineering understand the
week while keeping each source's evidence easy to audit.

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
2. Gather public incidents from incident.io. Prefer incident.io for accepted
   incidents, public incident visibility, and follow-ups. Always produce the
   incident.io public incident table below, even when no rows are found.
3. Gather Datadog alert/page signals for the window. Use incident.io alerts or
   escalations when they represent pages; use Datadog monitor/event data when
   available. Always produce the incident.io pager-load day/night table below,
   even when escalation data is unavailable; in that case, follow the section's
   `No measurements found` fallback. First build the exhaustive alert universe
   by paginating through Datadog events until no more results remain for the
   window; do not rely on a truncated first page, sampled titles, or a few spot
   checks. Cover all prod envs in scope even when one site is noisy or one env
   looks quiet. After the full pass, group repeated firings of the same monitor
   instead of counting every notification as a separate event. If the user also
   asks for unalerted API route or queue consumer degradation, run that
   proactive Datadog sweep as a separate phased pass inside this review:
   retrieve all recent/baseline route and queue measurements across environments
   first, perform a focused root-cause investigation for each ranked finding,
   then cross-reference incident.io and Linear.
4. For each Datadog alert/page signal row, perform a deeper investigation
   before writing the final report. Do not stop at the monitor title or
   top-level count. Inspect matching APM spans, representative traces, related
   logs, error records, exception details, and dependency spans. For failed
   traces, explicitly query the related Datadog logs and errors to find the
   underlying issue; do not infer root cause from span status or monitor title
   alone. For API routes and failed queue jobs, use the Datadog Issue Deep
   Dives section below. Even
   `expected/test` and `monitor noise` rows need a concise verification deep
   dive explaining why they are classified that way.
5. Gather Datadog error log patterns for the window. Use logs with
   `status:error`, scope to production environments, and group by clustered
   message pattern plus service/env where available. Always produce the Datadog
   Error Log Pattern Review section below, even when no rows are found.
6. Gather Linear bugs from the `bug` label first. Include all `bug`-labeled
   tickets created, updated, completed, or still-open with production evidence
   during the window. Inspect likely production bugs with issue details and
   comments when status, owner, or evidence is unclear. Use Linear as the
   source of truth for deduplication and follow-up ownership: search existing
   issues, comments, and linked source URLs before treating a signal as new.
7. Classify each bug, alert, and error-log pattern. Separate production
   breakage from staging, self-hosted, internal-only, duplicate, canceled, test,
   or monitor-noise signals.
8. Cross-reference the source tables. Link Datadog rows to matching incident.io
   incidents or Linear bugs when evidence supports the relationship. Link
   incident.io rows to Datadog alerts/monitors and Linear follow-ups when
   present. Link Linear rows to Datadog or incident.io evidence when available.
   If a relationship is inferential, say so in the row.
9. Present source-focused sections only. Do not create a synthesized
   cross-source summary table.

## Cross-Source Linking

Keep Datadog, incident.io, and Linear as separate output sections. Use links
inside each source table to show relationships instead of synthesizing a
separate cross-source table.

Use Linear as the source of truth for deduplication across weeks and workflows.
Before reporting a bug, security finding, cost concern, or alert as new, search
Linear for matching issue keys, titles, source URLs, and comments. If an
existing issue covers it, link to that issue and mark the review row as already
tracked instead of reporting it again as fresh work.

Use this table to decide what each source should link to:

| Source Row | Should Link To | How To Represent In Review |
| --- | --- | --- |
| Datadog alert/page | incident.io incident/follow-up, Linear issue, monitor/query/log/span links | Datadog row with `incident.io / Linear Link` populated when known |
| Datadog error-log pattern | matching Datadog alert/page deep dive, incident.io incident, Linear issue, representative logs | log pattern row with `Related Signal / Link` populated when known |
| incident.io incident | Datadog alert/monitor/query links, Linear follow-ups | incident.io row with linked source URLs |
| Linear production bug | Datadog monitor/query/trace/log links, incident.io incident if any | Linear row with production evidence links |

Do not write links, create follow-ups, or update external systems unless the
user explicitly asks for changes after reviewing the report.

### Proposed Link Titles

When proposing or later creating links, use short stable titles:

- `Datadog monitor: <monitor name>`
- `Datadog logs: <env/service/symptom>`
- `Datadog spans: <env/route/symptom>`
- `Datadog trace: <trace id or route>`
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

## Datadog Alert/Page Signals

Use this table as the evidence layer:

| Monitor/Page Signal | Env | Count / Window | Why It Alerted | Verdict | incident.io / Linear Link |
| --- | --- | ---: | --- | --- | --- |

The Datadog table answers "what alerted or paged?" Use these verdicts:

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
in the full Datadog alert/event pass, including clusters later classified as
`expected/test`, `monitor noise`, or `unknown/no measurements`.

Before finalizing the review, perform a completeness check:

1. Compare the final Datadog table against the full paginated Datadog
   alert/event sweep.
2. Confirm every production monitor title seen during the window appears in the
   table or is explicitly excluded as non-prod.
3. If a known title is missing, add it before writing the narrative summary.

`incident.io / Linear Link` should contain the matching incident.io reference,
Linear issue key, or explicit disposition such as `monitor noise` or
`unknown/no measurements`. Do not leave a real page as `none` unless the next
action is to classify the alert.

## Datadog Issue Deep Dives

Use this section for every row in the Datadog Alert/Page Signals table. There
must be a one-to-one mapping: each monitor/page signal row has exactly one
corresponding deep-dive row with the same signal name or ID. If repeated
firings were grouped into one alert/page cluster above, create one deep dive for
that cluster. If the user asks for individual firings instead of clusters,
create one deep dive per firing.

Include confirmed bugs, customer incidents, infra/dependency issues, unknowns
that need classification, and concise verification rows for `expected/test` or
`monitor noise`.

For API route and queue consumer errors, start from APM spans matching:

```text
operation_name:(http.server OR bullmq.consumer) status:error env:<prod-env>
```

Then narrow by `service`, `resource_name`, route, queue, consumer, status code,
error type, or monitor time window. For each failed trace sample, explicitly
query related Datadog logs and error records using the trace ID, span ID,
service, resource name, environment, and same time window. Use those logs and
errors to identify the underlying issue, such as application exceptions,
database errors, downstream timeouts, retry exhaustion, validation failures,
capacity pressure, or deploy regressions. If no related logs or error records
are found, state `No measurements found`.

For queue jobs, include failed job logs, exception class/message, queue name,
consumer service, backlog or delay context, and whether retries succeeded. For
API routes, include HTTP method/status, route/resource, exception class/message,
slow or failed database/downstream spans, and whether failures are
customer-facing or internal.

Use this table:

| Datadog Issue | Scope | Trace / Span Evidence | Logs / Error Details | Likely Cause | Links / Next Action |
| --- | --- | --- | --- | --- | --- |

Column rules:

- `Datadog Issue`: same monitor/page signal name, monitor ID, route, queue
  consumer, or measured regression used in the Datadog Alert/Page Signals row.
- `Scope`: env, service, route/resource, queue, and time window.
- `Trace / Span Evidence`: representative trace links, error counts, latency,
  status codes, dependency spans, or `No measurements found`.
- `Logs / Error Details`: exception class/message, failed job IDs when visible,
  stack/log summary, or `No measurements found`.
- `Likely Cause`: use a grounded class such as `application exception`,
  `slow database`, `downstream dependency`, `queue backlog`, `capacity`,
  `deploy/regression`, `monitor noise`, or `unknown`.
- `Links / Next Action`: incident.io incident, Linear issue, Datadog trace/log
  links, or concrete follow-up such as `needs owner review`.

## Datadog Error Log Pattern Review

Use this section to review the most frequent production error-log patterns from
the review window. This is a broad log-health pass and is separate from the
alert/page deep dives above.

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

Use this table:

| Error Log Pattern | Env / Service | Count / Share | Representative Error | Related Signal / Link | Disposition |
| --- | --- | ---: | --- | --- | --- |

Column rules:

- `Error Log Pattern`: clustered message pattern or concise normalized error.
- `Env / Service`: affected production envs and services.
- `Count / Share`: count in the review window and share if available.
- `Representative Error`: one short representative message, exception class,
  or stack/log summary. Do not paste long stack traces.
- `Related Signal / Link`: related Datadog alert/page deep dive, trace, log
  query, incident.io incident, Linear issue, or `none found`.
- `Disposition`: `known incident`, `tracked bug`, `needs investigation`,
  `expected/test`, `monitor noise`, or `unknown`.

If a high-volume pattern maps to a failed API route or queue consumer, ensure
the matching Datadog Issue Deep Dive includes the trace/log/error investigation.
If a high-volume pattern has no alert/page row, keep it in this table anyway and
mark it `needs investigation` or `unknown` based on evidence.

## incident.io Public Incident Table

Use this section for incident.io incidents with public visibility in the review
window. Query incident.io with `incident_list` scoped to the review window and
relevant team when known. Include `summary`, `roles`, `custom_fields`,
`timestamps`, `durations`, and `escalation_urgency` when the tool supports
them. If the tool cannot filter by visibility server-side, list the scoped
incidents and include only rows where `visibility` is `public`.

| Incident | Severity / Status | Start / End / Duration | Impact | Linked Sources |
| --- | --- | --- | --- | --- |

Lead each incident summary with its incident.io reference or URL. Preserve
uncertainty when timestamps, severity, linked alerts, or Linear follow-ups are
missing. If no public incident.io incidents are found, write one sentence with
the scoped query window and `No measurements found`.

## Pager-Load Day/Night Table

Use this section for incident.io escalation/page volume by time of day. Prefer
`escalation_stats` filtered to the relevant escalation path or team-owned path.
Group by `time_of_day`; add `status` and `priority` groupings when useful for
context.

incident.io `time_of_day` buckets are UTC:

- `working_hours`: 09:00-18:00 Monday-Friday.
- `late_evening`: 18:00-23:00 any day plus weekend daytime.
- `overnight`: 23:00-09:00.

For the headline split, calculate `day/evening` as `working_hours +
late_evening` and `night` as `overnight`. Be explicit that this is pager-load
from escalations, not raw alert volume, unless the source tool provides raw
alert day/night breakdowns.

| Bucket | Count | Share | Priority / Outcome | Notes |
| --- | ---: | ---: | --- | --- |

Include rows for `working_hours`, `late_evening`, `overnight`, `day/evening
total`, and `night total` when measurements exist. If incident.io escalation
stats are unavailable, write `No measurements found` and fall back to Datadog
monitor/page clusters without inventing a day/night split.

## Linear Bug Table

Start from all Linear tickets with the `bug` label that were touched by the
window. Do not rely only on text searches for `prod`, `incident`, or `Datadog`;
those searches are useful for enrichment but are not the source universe. This
table is the Linear source inventory, not a cross-source summary. A Linear bug
can be classified as non-production, duplicate, canceled, or no-action.

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
- `Production Evidence`: prod env, customer impact, incident.io incident,
  Datadog link, measured logs/spans/errors, or `No measurements found`.
- `Classification`: use one of `production/customer-impacting`,
  `internal-only`, `self-hosted`, `staging/dev`, `duplicate/canceled/no-action`,
  or `unclear`.
- `Counted?`: `yes` only when the bug label and production/customer-impacting
  evidence support including it in fixed/open production bug counts. Do not use
  this field as a cross-source issue count.

For headline counts, report fixed and open production bugs separately from the
total number of bug-labeled tickets reviewed.

## Executive Summary

Start the final report with:

- Review window and environments checked.
- Number of incident.io public incidents.
- Pager-load total with day/evening versus night split.
- Number of Datadog alert/page clusters, plus noisy/test clusters if relevant.
- Number of Datadog issues deep-dived and the top likely cause classes.
- Number of Datadog error-log patterns reviewed and the highest-volume pattern.
- Number of `bug`-labeled Linear tickets reviewed.
- Production bug count split by fixed and open.
- Highest open risk and why.

Then present sections in this order:

1. Datadog Alert/Page Signals.
2. Datadog Issue Deep Dives.
3. Datadog Error Log Pattern Review.
4. incident.io Public Incident Table.
5. Pager-Load Day/Night Table.
6. Linear Bug Table.

## Output Format

Return valid Markdown only.

- Use valid Markdown syntax for headings, bullets, links, and tables.
- Include a space after list markers such as `-`, `*`, and `1.`.
- Close links and parentheses correctly.
- Do not emit malformed tables, dangling backticks, or partially opened code
  fences.
- If a section would be fragile to format, prefer a plain paragraph over broken
  Markdown.
