---
name: linear-bug-triage
description: |
  Deduplicate measured bug or regression evidence against Linear, then either
  add evidence comments to related existing issues or create concise Linear bug
  issues in Triage. Use when Codex has confirmed evidence from Datadog,
  benchmarks, traces, timings, flamegraphs, logs, or production measurements and
  needs Linear search, comments, labels, Datadog links, or bug ticket creation
  without fix suggestions, but only after a human has approved sharing the
  findings in Linear.
---

# Linear Bug Triage

Use this skill after a bug or regression candidate has measured evidence. This
skill owns Linear search, deduplication, evidence comments, and ticket creation;
the calling skill owns deciding whether the signal is issue-worthy.

## Human Approval Gate

Before doing anything in Linear, first show the findings to the human in a
compact markdown table and ask for explicit permission to share them in Linear.
The table should include one row per candidate with:

- Candidate / cluster name.
- Environments.
- Service and route/resource.
- Recent window measurement.
- Baseline measurement.
- Delta / regression summary.
- Key Datadog evidence links.
- Proposed Linear action (`comment existing`, `create new`, or `none`).

If the human does not explicitly approve, stop after presenting the table. Do
not search Linear, do not comment on issues, and do not create issues.

If this skill was invoked by `detect-prod-regressions` and that calling skill
already showed the findings table and obtained explicit human approval for a
Linear handoff, skip this gate and proceed directly to deduplication.

## Required Evidence

For each candidate, gather:

- Recent window and baseline window as absolute time ranges with timezone.
- Measured signal: counts, rates, p50/p95/p99 latency, trace samples,
  flamegraphs, monitor thresholds, or benchmark deltas.
- Affected environments, services, routes/resources, status codes, and top error
  messages.
- Datadog links for logs, spans, traces, metrics, dashboards, or flamegraphs
  used as evidence.
- The exact text `No measurements found` for requested measurements that are
  unavailable.

Do not create or comment based on guesses, unsupported impact claims, or missing
measurements alone.

## Deduplication

After the human explicitly approves, before creating a new issue:

1. Search Linear for related open issues using exact error text, route/resource,
   service, environment, monitor name, and Datadog link keywords.
2. Search recently closed or canceled issues if the error is recurring or the
   wording is distinctive.
3. If a related issue exists, add a concise evidence comment instead of creating
   a duplicate.
4. If no related issue exists, create one Linear issue in the `Triage` state for
   each distinct bug cluster.

## Existing Issue Comments

For related existing issues, add only:

- Recent window and baseline window.
- Measured delta or `No measurements found` for unavailable signals.
- Affected environments, services, routes/resources, and top error messages.
- Datadog links.

Do not add fix suggestions, root-cause guesses, implementation notes, owner
assignments, or next steps.

## New Issue Format

Create new issues with:

- State/status `Triage`; pass the Linear state explicitly on creation and do not
  rely on workspace defaults.
- Label `bug`.
- Additional existing labels that match the evidence, such as affected service,
  environment, API, ingestion, latency, ClickHouse, Postgres, integrations, or
  observability labels. Query labels first and use the repository/team's exact
  label names.
- Concise title: `bug: <service or route> <measured symptom> in <envs>`.
- Concise body, evidence-only:

```markdown
Recent window: <absolute time range and timezone>
Baseline: <absolute time range and timezone>

Signal:
- <count/rate/latency delta with env/service/route>
- <"No measurements found" for missing requested measurements>

Evidence:
- Datadog logs: <url>
- Datadog spans/traces: <url>
- Datadog metrics, dashboard, or latency graph: <url>

Related Linear search:
- <brief search terms used and result>
```

Do not include fix suggestions, root-cause guesses, implementation notes, owner
assignments, or next steps unless the user explicitly asks outside the Linear
issue or comment.
