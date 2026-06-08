---
name: detect-prod-regressions
description: |
  Proactively detect production regressions in Langfuse by comparing recent
  Datadog errors, error logs, error spans, API route latency signals, and queue
  consumer health signals against baseline benchmarks or traces across prod-us,
  prod-eu, prod-hipaa, and prod-jp. Use when asked to sweep production for new
  bugs, catch regressions early, catch low-occurrence coding bugs or edge
  cases, find slow degradation that may not alert, compare recent changes to
  Datadog measurements, or compile source-linked production findings for human
  review.
---

# Detect Prod Regressions

Run this skill as an evidence-first production sweep. The deliverable is a
source-linked findings table plus a short summary of what was checked. Always
produce a markdown findings table in the chat response, even when the table is
empty or all candidates end in `none`.

## Required Scope

Always review all production environments unless the user explicitly narrows the
scope:

- `prod-us`
- `prod-eu`
- `prod-hipaa`
- `prod-jp`

Use the Datadog site that owns the environment:

- `datadog-us`: `prod-us`, `prod-hipaa`
- `datadog-eu`: `prod-eu`, `prod-jp`

If a query unexpectedly returns no data, verify with a small count/facet query
before declaring `No measurements found`.

## Measurement Rules

- Ground every bug claim in a measurable signal: counts, rates, p50/p95/p99
  duration, trace samples, flamegraphs, monitor thresholds, or benchmark
  comparisons.
- If a requested measurement is missing or unavailable, write exactly
  "No measurements found" for that signal.
- Treat a bug as new only when a recent window shows a new or materially worse
  error cluster or latency regression versus a baseline.
- Do not rely only on top-volume clusters. Also inspect new low-occurrence
  errors that look like coding bugs or edge cases, such as invariant failures,
  unexpected null/undefined values, validation surprises, unhandled promise
  rejections, serialization failures, impossible enum states, or one-off 500s
  on uncommon routes.
- For latency, error-rate, throughput, saturation, or performance findings,
  focus on how the signal worsened over time: recent versus preceding window,
  recent versus same window 7 days earlier, and post-change versus pre-change
  when deployment markers are available.
- Prefer high-level aggregations before individual events; drill into example
  logs, spans, traces, or flamegraphs only after a cluster is identified.
- Do not infer customer impact, root cause, or severity beyond what the
  measurements support.

## Investigation Phases

For broad sweeps, do not start root-causing the first interesting spike while
the data universe is still incomplete.

1. **Phase 1: Retrieve all candidate data.** Query every environment and every
   requested surface first. Capture recent and baseline measurements for
   errors, latency, throughput, saturation, queue backlog, queue delay, and
   worker failures. Rank findings only after the full cross-env pass is done.
2. **Phase 2: Investigate each finding.** For every ranked finding, run a
   focused root-cause pass using
   [`debug-issue-with-datadog`](../debug-issue-with-datadog/SKILL.md): cluster
   exceptions, inspect slow spans/dependencies, sample traces when needed, map
   the result to code, and classify the likely driver. Distinguish exception
   spikes, slow databases, slow ClickHouse, upstream API failures, blob/storage
   failures, worker capacity contention, and instrumentation gaps.
3. **Phase 3: Cross-reference incident.io and Linear.** After Datadog findings
   exist, query incident.io and Linear before proposing any new action. Look for
   already-accepted incidents, incident follow-ups, linked Datadog alerts,
   existing bug tickets, duplicate reports, and recently fixed issues that match
   the same env/service/route/queue/error/dependency. Treat this as read-only
   enrichment unless the user explicitly approves writes.

The final answer must separate these phases: first say what data was retrieved
and ranked, then give the in-depth investigation for each finding, then explain
whether incident.io or Linear already tracks each finding.

## Markdown Evidence Artifact

For every run that queries Datadog or produces ranked findings, create a
Markdown evidence artifact before the first Datadog query and keep it updated
throughout the run. Use a timestamped local path under the ignored
`.codex-artifacts/` directory unless the user requests another location, for
example:

```text
.codex-artifacts/production-regression-sweeps/<YYYY-MM-DD-HHMM>-<scope>.md
```

The artifact is the durable working memory for the sweep. Append to it after
each phase and after each per-finding drilldown so intermediate results survive
context compaction, subprocess loss, or a long investigation. Do not wait until
the end to write the file.

Include these sections as they become available:

- Scope, local and UTC windows, Datadog sites queried, and assumptions.
- Phase 1 raw retrieval notes: every query family run, filters used, envs
  checked, metric/span/log groups returned, and `No measurements found` entries.
- Candidate ranking table with recent/baseline measurements and deltas.
- Phase 2 per-finding drilldowns: exception clusters, slow dependency evidence,
  representative trace/log IDs or links, code paths inspected, confidence, and
  rejected hypotheses.
- Phase 3 incident.io and Linear enrichment: records searched, matches found,
  duplicates/recent fixes, and gaps.
- Final findings table and proposed actions.

Keep sensitive values out of the artifact. Prefer Datadog/incident/Linear links,
stable IDs, route/queue names, counts, timings, and normalized error classes
over raw payloads or secrets.

## Baseline Window

Use the user's stated window when provided. Otherwise:

1. Compare the most recent 24 hours with the preceding 24 hours.
2. Add a same-day or same-hour historical baseline, usually the matching window
   7 days earlier, when Datadog data is available.
3. If release or deployment markers, service versions, git SHAs, or change
   timestamps are visible, compare post-change versus pre-change windows.

Include the recent window and baseline window in the evidence artifact and final
findings table.

## Datadog Sweep

Before querying Datadog, load the relevant Datadog MCP guidance for logs,
traces, metrics, and visualizations. Use the existing
[`debug-issue-with-datadog`](../debug-issue-with-datadog/SKILL.md) playbook
when you need query syntax, repo mapping, or trace drill-down patterns.

For each environment, check:

1. **Datadog errors**
   - Use Datadog Error Tracking to review error groups, new issues,
     regressions, affected services, and occurrence timelines. Also check the
     EU Datadog site equivalent when environment data is stored there.
   - Aggregate error counts and rates by `env`, `service`, route/resource,
     status code, `error.type`, and `error.message`.
   - Compare recent counts/rates to the baseline.
   - Include low-occurrence new error groups when the stack, message, route, or
     affected code path suggests a coding bug or edge case, even if occurrence
     counts are too small for top-N dashboards.

2. **Datadog error logs**
   - Aggregate `status:error` logs by service, route/resource, source,
     `error.message`, tenant/project identifiers when present, and environment.
   - Open representative logs only for clusters with measurable increase.

3. **Datadog error spans**
   - Aggregate error spans by `env`, `service`, `resource_name`, `http.route`,
     `error.type`, and `error.message`.
   - Fetch representative traces only after grouping identifies a candidate
     regression.

4. **API route latencies and errors**
   - Start from `operation_name:http.server`; when sweeping APIs and queues
     together, use `operation_name:(http.server OR bullmq.consumer)`.
   - Focus on p50, p95, p99, error counts/rates, and request volume by
     route/resource, service, and environment.
   - For tRPC APIs, filter and group `/api/trpc` traffic separately.
   - For public APIs, derive route families from `web/src/pages/api/public/**`
     and related Fern/API sources instead of relying only on Datadog's raw
     high-cardinality resource names. Include route variants such as `/index`
     when Next.js Pages Router instrumentation emits them.
   - Treat `web-ingestion` as ingestion-only traffic: legacy ingestion API,
     OTEL ingestion, and media. Do not mix it with regular public API route
     conclusions.
   - Rank candidates by worsening over time, not only by absolute latency:
     recent versus baseline deltas, slope, and newly introduced tail latency.
   - Use trace samples or flamegraphs for routes whose latency materially
     regressed.

5. **Queue consumer health**
   - Discover queue consumers from `operation_name:bullmq.consumer
     service:(worker OR worker-cpu)`, grouped by `@peer.messaging.destination`
     or `resource_name` when the destination facet is missing.
   - Prioritize queue backlog, queue delay, failures, errors, and request rate
     before consumer processing latency. Processing latency is useful for
     root-cause context, but a queue can degrade because jobs wait too long even
     when the handler itself is fast.
   - For each queue/environment, collect recent and baseline values for:
     `langfuse.queue.<queue>.length`,
     `langfuse.queue.<queue>.dlq_length`,
     `langfuse.queue.<queue>.wait_time.95percentile`,
     `langfuse.queue.<queue>.error`,
     `langfuse.queue.<queue>.failed`, and
     `langfuse.queue.<queue>.request`.
   - Use the queue metric naming convention from
     `packages/shared/src/server/instrumentation/index.ts`: queue names are
     lowercased, hyphens become underscores, and a trailing `_queue` is removed.
   - Also check special non-queue backlog/delay metrics when relevant, such as
     event propagation partition backlog/delay and experiment backfill delay.

Keep Datadog links for every query, trace, dashboard, or flamegraph used as
evidence.

## In-Depth Finding Drilldown

After Phase 1 ranks the candidates, investigate each finding independently.
Use this minimum drilldown unless the data makes a step irrelevant:

1. Aggregate the affected span/metric/log cluster in the recent window by
   `env`, `service`, `resource_name`, status, count, and p95/p99 duration.
2. For errors, group by `error.type`, normalized `error.message`, status code,
   route/queue, and tenant/project identifiers when present.
3. For latency or backlog, inspect dependency spans before naming a cause:
   Prisma/Postgres, ClickHouse, Redis, blob storage/S3/Azure, LLM providers,
   PostHog, or other upstream APIs.
4. Fetch representative traces only after the aggregate identifies a specific
   route, queue, dependency, or error class.
5. Map the finding to the owning code path using the repo map in
   `debug-issue-with-datadog`, then cite files in the response.
6. Label confidence as `high`, `medium`, or `low`. Use `medium` or `low` when
   logs are fragmented, sampling is thin, or the likely cause is inferred from
   capacity/correlation rather than directly visible in a trace.

## incident.io and Linear Enrichment

After Datadog has produced one or more candidate findings, query incident.io and
Linear before recommending new tickets, alert changes, or follow-ups.

For incident.io:

- Search incidents, alerts, escalations, and follow-ups in the recent window and
  a small surrounding buffer when handoff/timeline timing might differ.
- Match by environment, service, route/resource, queue name, monitor title,
  dependency, error class, customer impact, and Datadog alert or trace links.
- Record whether the finding is already an accepted incident, linked to an
  incident follow-up, alert-only/noise, or not represented.
- Do not create incidents, follow-ups, or comments unless the user explicitly
  asks.

For Linear:

- Search existing bugs and recently completed issues using the route/queue,
  service, error type/message, dependency name, monitor title, and likely owning
  code path.
- Include the `bug` label universe when the task is a production bug sweep; use
  text search only as enrichment, not as the only source.
- Mark each finding as `existing issue`, `existing follow-up`, `recently fixed`,
  `duplicate/no action`, or `new candidate`.

## Compiled Findings List

End every non-empty sweep with one compiled list of final findings. This list
is the authoritative summary after Datadog retrieval, per-finding drilldown,
and incident.io/Linear enrichment.

Every finding must have a canonical link. Prefer links in this order:

1. **Linear issue** when an existing or newly approved bug/follow-up tracks the
   work.
2. **incident.io incident or follow-up** when the finding is already part of an
   incident response or accepted follow-up.
3. **Datadog monitor, alert, or metric graph** when no Linear or incident.io
   object exists yet. Link the most representative metric/alert for the measured
   regression, such as queue length/wait time, route latency, error rate, or the
   monitor/page that fired.

Do not leave findings orphaned. If a finding is real but not represented in
Linear or incident.io, use the Datadog metric/alert link as the canonical link
and set the proposed action to `none`, `monitor`, or `needs owner review` based
on the evidence.

## Findings Table

Render the measured candidates in a markdown table in the main response. This
table is required output for every run so the human can quickly review what was
checked.

Use this structure unless the sweep needs one extra evidence column:

| ID | Finding | Canonical Link | Link Type | Envs | Service / Resource | Recent Window | Baseline Window | Delta / Regression Summary | Key Datadog Evidence | incident.io / Linear Status | Proposed Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | Concise bug or regression label | Linear issue, incident/follow-up, or Datadog metric/alert link | `Linear`, `incident.io`, or `Datadog` | `prod-hipaa` | `web-iso` / `clickhouse - query` | Counts, rates, or latency for the recent window | Matching baseline measurement or `No measurements found` | One-line comparison grounded in the measurements | Logs / spans / trace / dashboard links | Existing incident/follow-up/issue or `none found` | `monitor`, `needs owner review`, `link to existing issue`, `link to incident`, or `none` |

Rules:

- Include one row per issue-worthy candidate and one row for notable
  non-actionable signals when they explain why no follow-up is proposed.
- Fill `Canonical Link` for every row. It must point to a Linear issue,
  incident.io incident/follow-up, or Datadog monitor/alert/metric graph.
- Use exact absolute windows with timezone somewhere immediately above or below
  the table.
- Fill `incident.io / Linear Status` after querying both systems, or write
  `Unavailable: <reason>` or `Not queried: <reason>` if a system cannot be
  checked.
- Write `No measurements found` in the relevant cells when a requested signal is
  unavailable.
- If no issue-worthy regressions are measured, still render the table with a
  single row whose proposed action is `none`.

## Final Response

Summarize:

- The required compiled findings table, with a canonical Linear, incident.io,
  or Datadog link for every finding.
- The Markdown evidence artifact path.
- The windows compared and all prod environments checked.
- The incident.io and Linear records checked for each finding, including
  `none found` where applicable.
- Candidate signals skipped with "No measurements found".
- A compact "no new bugs found" statement when no issue-worthy regressions were
  measured.
