---
name: detect-prod-regressions
description: |
  Proactively detect production regressions in Langfuse by comparing recent
  Datadog errors, error logs, error spans, and API route latency signals against
  baseline benchmarks or traces across prod-us, prod-eu, prod-hipaa, and
  prod-jp. Use when asked to sweep production for new bugs, catch regressions
  early, catch low-occurrence coding bugs or edge cases, compare recent changes
  to Datadog measurements, or prepare measured production evidence for human
  review before any optional Linear handoff.
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

4. **API route latencies**
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
- Recent window measurement.
- Baseline measurement.
- Delta / regression summary.
- Key evidence links.
- Recommended Linear action (`comment existing`, `create new`, or `none`).

Use a concrete markdown table shaped like this:

```markdown
| Candidate | Envs | Service / Route | Recent Window | Baseline | Delta | Evidence | Proposed Linear Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Public scores latency regression | prod-us | `web` `GET /api/public/v2/scores/index` | p95 `7.44s`, p99 `12.77s`, count `71,448` | p95 `4.34s`, p99 `6.60s`, count `26,024` | p95 `+72%`, p99 `+94%`, volume `+174%` | [metrics](https://app.datadoghq.com/) [spans](https://app.datadoghq.com/) [trace](https://app.datadoghq.com/) | comment existing |
| ClickHouse socket hang up cluster | prod-us | `web-iso` `POST /` | errors `14,088` | errors `6,026` | `+134%` errors | [spans](https://app.datadoghq.com/) [trace](https://app.datadoghq.com/) | comment existing |
| Ingestion DLQ monitor noise | prod-eu | `worker-cpu` `langfuse.queue.ingestion.dlq_length` | max `150` | max `150` | flat | [metrics](https://app.datadoghq.eu/) | none |
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
- The findings table shown to the human.
- Whether the human approved sharing findings in Linear.
- New Linear issues created, with links, only if approval was granted.
- Existing Linear issues commented on, with links, only if approval was
  granted.
- Candidate signals skipped with "No measurements found".
- A compact "no new bugs found" statement when no issue-worthy regressions were
  measured.
