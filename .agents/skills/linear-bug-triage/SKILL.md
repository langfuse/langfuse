---
name: linear-bug-triage
description: |
  Use this skill after a bug or regression candidate has measured evidence to document
  them within linear.
---

# Linear Bug Triage

Use this skill after a bug or regression candidate has measured evidence. This
skill owns Linear search, deduplication, evidence comments, and filing new
issues once a human says yes; the calling skill owns deciding whether the signal
is issue-worthy.

## What This Skill May Write

Every write carries a label and is marked as agent-written in the text, and only
three write shapes are permitted at all. The `linear-agent-writes` skill in the
private `langfuse/langfuse-internal-skills` plugin is the authority for that
policy; read it before your first write and prefer it over this summary wherever
they differ.

For this skill it resolves to:

- **An evidence comment on an issue that already exists: just do it.** Label that
  issue `AI commented` and say in the comment body that an agent wrote it. This
  is the common case and needs nobody's permission.
- **A new top-level issue: ask once, then file it.** A bug cluster surfaced by a
  review has no parent, and a parentless ticket is the one shape that needs a
  go-ahead. Take one go-ahead for the whole set, or for named rows — never one
  question per candidate.

So present the findings table either way: it is what the go-ahead is given
against, and it is the report afterwards. One row per candidate:

- Candidate / cluster name.
- Environments.
- Service and route/resource.
- Recent window measurement.
- Baseline measurement.
- Delta / regression summary.
- Key evidence links — the ones *Required Evidence* below asks for.
- Action: `commented <issue key>` for what you already did, `filed <issue key>`
  once a row is approved and created, or `awaiting your go-ahead`.

Never present an `awaiting your go-ahead` row without the exact title and body
you intend to file underneath it — that text is what is being approved.
Deduplicate first, so comments land on the right issue.

If Linear is unreachable in this environment, say so plainly and return every row
as text ready to paste. Do not skip the handoff silently.

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

Always, before writing anything:

1. Search Linear for related open issues using exact error text, route/resource,
   service, environment, monitor name, and observability link keywords.
2. Search recently closed or canceled issues if the error is recurring or the
   wording is distinctive.
3. If a related issue exists, add a concise evidence comment to it and label it
   `AI commented`.
4. If no related issue exists, prepare the issue in the format below and put it
   in the findings table as `awaiting your go-ahead`. File it once the go-ahead
   comes, and update the row to `filed <issue key>`.

## Existing Issue Comments

For related existing issues, add only:

- Recent window and baseline window.
- Measured delta or `No measurements found` for unavailable signals.
- Affected environments, services, routes/resources, and top error messages.
- The evidence links from *Required Evidence*.

Do not add fix suggestions, root-cause guesses, implementation notes, owner
assignments, or next steps.

## New Issue Format

The shape to prepare, show for the go-ahead, and then file:

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
