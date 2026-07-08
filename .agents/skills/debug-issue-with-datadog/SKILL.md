---
name: debug-issue-with-datadog
description: |
  Debug a user-reported issue, Linear ticket, or incident report by combining
  Datadog (APM, logs, metrics) with the Langfuse repo to establish a
  root cause. Use when given a Linear issue URL/ID (e.g. LFE-XXXX), a GitHub
  issue, or a pasted error/report and asked to investigate, root-cause, or
  triage. Produces a structured analysis — error breakdown, hypothesis-by-class,
  suggested patches with code references.
---

# Debug Issue with Datadog

Use this skill whenever the task is **investigative** rather than
implementational: a user, customer, or oncall has surfaced a problem and you
need to figure out *what is actually happening in production* and *where in the
code it lives*. The deliverable is an analysis, not a patch — though the
analysis should make the right patch obvious.

## When to Apply

- A Linear issue (typically with an `LFE-XXXX` ID) describes a production
  failure, error spike, or customer report.
- A GitHub issue or pasted incident/error report needs triage.
- A monitor alerted and you need to understand *why* before deciding what to
  fix.
- Existing tickets under the "Make monitoring useful again" project (parent
  `LFE-8837`) and similar — these expect the structured analysis output below.

If the task is "implement this fix" rather than "figure out what's broken",
this is the wrong skill — go to `backend-dev-guidelines` or the relevant
package guide.

## Workflow

Read the inputs first, then plan the Datadog sweep, then read the code, then
write the analysis. Do not skip ahead to suggested patches before the data
supports them.

1. **Intake.** Pull every signal already available in the report. See
   [`references/intake.md`](references/intake.md). For a Linear URL/ID, fetch
   the issue *and* its comments via the Linear MCP — the description is often
   updated inline as triage proceeds. For a GitHub issue, use `gh issue view`.
   For pasted text, treat it as the description.

2. **Scope the sweep.** From the intake, pick the affected subsystem and time
   window. Use [`references/repo-debug-map.md`](references/repo-debug-map.md)
   to translate "PostHog integration", "ingestion failures", "evals stuck",
   etc. into the Datadog filters and source files you should be looking at.

3. **Run the broad Datadog sweep.** Default to the full sweep in
   [`references/datadog-playbook.md`](references/datadog-playbook.md): APM
   spans, error logs, metrics, and monitors — split across `prod-eu`
   and `prod-us` (and `prod-hipaa` / `prod-jp` when relevant). Always check
   regional disparity first; it usually rules whole hypotheses in or out.
   Use [`datadog-query-recipes`](../datadog-query-recipes/SKILL.md) for
   reusable tenant, public API, queue consumer, and cross-environment query
   shapes.

4. **Cluster the errors.** Group by `(projectId, error.message)` or
   `(error.type, error.message)`. Treat each distinct cluster as its own
   hypothesis — Langfuse incidents commonly have *multiple* coexisting root
   causes, not one.

5. **Map clusters to code.** For each cluster, open the relevant handler file
   from the repo-debug map and read enough of it to confirm or refute the
   hypothesis. Cite specific files and line ranges in the output.

6. **Write the analysis** using
   [`references/output-template.md`](references/output-template.md).

7. **Deliver.** Default: print the analysis in chat. If the user asked for it,
   also save under the workflow they specified (file, Linear comment via, etc.).

## Datadog MCP Usage Notes

Two Datadog MCP servers are typically available — one bound to the EU site
(`datadoghq.eu`) and one to the US site (`datadoghq.com`). Always run
region-relevant queries against **both** unless intake clearly localizes the
incident. The `prod-eu` / `prod-us` env tags live on each side respectively.

- Span search filter pattern:
  `service:worker resource_name:"process posthog-integration-project" status:error`
- Log search filter pattern:
  `service:worker env:prod-eu @langfuse.project.id:cm1r6u… status:error`
- For high-volume queries, prefer `aggregate_spans` / `aggregate_events`
  grouped by `(error.message, projectId)` over fetching individual traces.
- Always link to the Datadog UI for the queries you ran (final section of the
  output template).

See [`references/datadog-playbook.md`](references/datadog-playbook.md) for the
full set of starter queries and parameter shapes.

## Output Expectations

From the output template:

- Header: data source, time window, region split (EU vs US table).
- Hotspots: per-`projectId` (or per-cluster) error counts.
- Root cause by error class: each cluster gets a short hypothesis with
  reasoning, distinguishing primary causes from symptoms.
- Suggested patches: P0/P1/P2 grouped, with concrete file paths and short code
  sketches. Reference the actual handler in `worker/src/features/**` or
  `web/src/**`.
- Dashboards: paste the Datadog query URLs at the end.

Findings come first, recommendations last. If the data is thin, say so
explicitly and propose what would need to be true to confirm each hypothesis —
do not invent root causes.

## Cross-References

- Production telemetry query recipes, tenant/public API usage, and queue
  consumer measurements:
  [`datadog-query-recipes`](../datadog-query-recipes/SKILL.md)
- Backend layout, queue contracts, instrumentation patterns:
  [`backend-dev-guidelines`](../backend-dev-guidelines/SKILL.md)
- ClickHouse-related findings (memory ceilings, JOIN spills, slow queries):
  [`clickhouse-best-practices`](../clickhouse-best-practices/SKILL.md)
- Once a fix is identified and you switch to implementation, hand off to the
  package `AGENTS.md` for the affected directory.
