---
name: detect-prod-regressions
description: Sweep Datadog production regressions in Langfuse across monitors, errors, logs, spans, API latency, baselines, prod regions, paging alerts, and Linear handoff evidence.
---

# Detect Prod Regressions

Run this skill as an evidence-first production sweep. The deliverable is a set
of measured candidate bugs summarized for a human reviewer in a compact table,
plus a short summary of what was checked. Do not touch Linear automatically.

## Required Scope

Always review all production environments unless the user explicitly narrows the
scope:

- `prod-us`
- `prod-eu`
- `prod-hipaa`
- `prod-jp`

Query both Datadog sites when needed. Default to the EU site for `prod-eu` and
the US site for the other production envs, but verify by querying facets or
running a small count query rather than assuming where a tag lives.

## Measurement Rules

- Ground every bug claim in a measurable signal: counts, rates, p50/p95/p99
  duration, trace samples, flamegraphs, monitor thresholds, or benchmark
  comparisons.
- Treat paging alerts from monitors outside the SLO/burn-rate set as triage
  leads. Capture which monitors paged and why, then validate candidate
  regressions with the underlying metric, log, span, trace, or event
  measurements before calling them bugs.
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

## Baseline Window

Use the user's stated window when provided. Otherwise:

1. Compare the most recent 24 hours with the preceding 24 hours.
2. Add a same-day or same-hour historical baseline, usually the matching window
   7 days earlier, when Datadog data is available.
3. If release or deployment markers, service versions, git SHAs, or change
   timestamps are visible, compare post-change versus pre-change windows.

Include the recent window and baseline window in any later handoff to
`linear-bug-triage` after the human explicitly approves sharing findings in
Linear.

## Datadog Sweep

Before querying Datadog, load the relevant Datadog MCP guidance for logs,
traces, metrics, and visualizations. Use the existing
[`datadog-query-recipes`](../datadog-query-recipes/SKILL.md) skill for query
syntax, production environment coverage, tenant/public API usage, and queue
consumer measurements. Use
[`debug-issue-with-datadog`](../debug-issue-with-datadog/SKILL.md) when a
candidate regression becomes an incident-style root-cause analysis.

For each environment, check:

1. **Paging monitors outside the SLO/burn-rate set**
   - Query Datadog monitor and event history for the recent window across both
     Datadog sites as needed. Focus on monitors that notified paging routes,
     escalation policies, PagerDuty/Opsgenie-style integrations, or on-call
     alert channels.
   - Exclude clearly SLO-backed monitors from the primary paging sweep, such as
     monitors with SLO monitor types, `slo`/`burn rate` names, SLO tags, or SLO
     queries. If a monitor is ambiguous, keep it and mark the SLO status as
     uncertain instead of silently dropping it.
   - Group repeated alert events by monitor ID, monitor name, environment,
     service/team owner, group key, and trigger reason so renotifications or
     flapping do not look like separate regressions.
   - For each alerting monitor, capture the monitor URL, alert start/recovery
     time, duration, notified paging target, current state, threshold, observed
     value, group tags, no-data status when relevant, and the exact reason the
     monitor entered alert.
   - Explain the issue that paged engineers in operational terms: metric breach,
     error cluster, queue backlog, saturation, no-data gap, host/task health,
     failed job, or other monitor source. Then connect it to logs, spans,
     traces, metrics, deployment markers, or dashboards that show whether the
     signal is new or materially worse than baseline.
   - Include monitor-driven candidates even when they are not top-volume error
     or latency clusters. Conversely, mark noisy, flat, expected, SLO-only, or
     non-regressing monitor pages as `none` with the measurements that justify
     that decision.

2. **Datadog errors**
   - Use Datadog Error Tracking to review error groups, new issues,
     regressions, affected services, and occurrence timelines. Also check the
     EU Datadog site equivalent when environment data is stored there.
   - Aggregate error counts and rates by `env`, `service`, route/resource,
     status code, `error.type`, and `error.message`.
   - Compare recent counts/rates to the baseline.
   - Include low-occurrence new error groups when the stack, message, route, or
     affected code path suggests a coding bug or edge case, even if occurrence
     counts are too small for top-N dashboards.

3. **Datadog error logs**
   - Aggregate `status:error` logs by service, route/resource, source,
     `error.message`, tenant/project identifiers when present, and environment.
   - Open representative logs only for clusters with measurable increase.

4. **Datadog error spans**
   - Aggregate error spans by `env`, `service`, `resource_name`, `http.route`,
     `error.type`, and `error.message`.
   - Fetch representative traces only after grouping identifies a candidate
     regression.

5. **API route latencies**
   - Focus on `service:web` HTTP spans and metrics such as
     `trace.http_request.duration` when available.
   - Compare p50, p95, and p99 by route/resource and environment.
   - Rank candidates by worsening over time, not only by absolute latency:
     recent versus baseline deltas, slope, and newly introduced tail latency.
   - Use trace samples or flamegraphs for routes whose latency materially
     regressed.

Keep Datadog links for every query, trace, dashboard, or flamegraph used as
evidence.

## Linear Handoff

Before doing anything in Linear, show the human reviewer a findings table in
chat and ask for permission to share the findings in Linear. The table should
include one row per candidate with:

- Candidate / cluster name.
- Environments.
- Service and route/resource.
- Monitor / page signal, including the paging monitor name, alert reason, and
  notified route when applicable.
- Recent window measurement.
- Baseline measurement.
- Delta / regression summary.
- Key evidence links.
- Recommended Linear action (`comment existing`, `create new`, or `none`).

Use a concrete markdown table shaped like this:

```markdown
| Candidate | Envs | Service / Route | Monitor / Page Signal | Recent Window | Baseline | Delta | Evidence | Proposed Linear Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Public scores latency regression | prod-us | `web` `GET /api/public/v2/scores/index` | Paging monitor `Public API p95 latency` alerted `pagerduty-web`; observed p95 crossed `5s` threshold | p95 `7.44s`, p99 `12.77s`, count `71,448` | p95 `4.34s`, p99 `6.60s`, count `26,024` | p95 `+72%`, p99 `+94%`, volume `+174%` | [monitor](https://app.datadoghq.com/) [metrics](https://app.datadoghq.com/) [spans](https://app.datadoghq.com/) [trace](https://app.datadoghq.com/) | comment existing |
| ClickHouse socket hang up cluster | prod-us | `web-iso` `POST /` | Paging monitor `web-iso 5xx rate` alerted `pagerduty-web-iso`; grouped on `error.message:socket hang up` | errors `14,088` | errors `6,026` | `+134%` errors | [monitor](https://app.datadoghq.com/) [spans](https://app.datadoghq.com/) [trace](https://app.datadoghq.com/) | comment existing |
| Ingestion DLQ monitor noise | prod-eu | `worker-cpu` `langfuse.queue.ingestion.dlq_length` | Paging monitor `Ingestion DLQ length` alerted `pagerduty-ingestion`; threshold breach but no increase versus baseline | max `150` | max `150` | flat | [monitor](https://app.datadoghq.eu/) [metrics](https://app.datadoghq.eu/) | none |
```

If a requested signal is unavailable, write `No measurements found` in the
relevant cell instead of leaving it blank.

Only if the human explicitly approves, use
[`linear-bug-triage`](../linear-bug-triage/SKILL.md) for Linear search,
deduplication, evidence comments, Triage issue creation, labels, and ticket
formatting. Treat that skill as the source of truth for Linear behavior once
approval is granted.

Hand off:

- Recent window and baseline window.
- Measured deltas or `No measurements found` for unavailable signals.
- Affected environments, services, routes/resources, status codes, and top error
  messages.
- Datadog links for every query, trace, dashboard, metric graph, or flamegraph
  used as evidence.

## Final Response

Summarize:

- The windows compared and all prod environments checked.
- Which paging monitors outside the SLO/burn-rate set alerted engineers, why
  they alerted, and which pages did or did not map to measured regressions.
- The findings table shown to the human.
- Whether the human approved sharing findings in Linear.
- New Linear issues created, with links, only if approval was granted.
- Existing Linear issues commented on, with links, only if approval was
  granted.
- Candidate signals skipped with "No measurements found".
- A compact "no new bugs found" statement when no issue-worthy regressions were
  measured.
