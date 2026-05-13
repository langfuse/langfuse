---
name: datadog-query-recipes
description: |
  Langfuse-specific Datadog query recipes for production telemetry research.
  Use when asked to investigate tenant or project activity, public API endpoint
  usage, queue consumer behavior, spans, logs, metrics, or ad hoc production
  questions across prod-us, prod-eu, prod-hipaa, and prod-jp. This skill is for
  reusable query shapes and measured research; pair it with
  debug-issue-with-datadog when the task is an incident or root-cause analysis.
---

# Datadog Query Recipes

Use this skill for Langfuse production telemetry research where the main work is
finding the right Datadog data path. Keep findings evidence-based and include
the exact Datadog links or query shapes that support the answer.

## Required Scope

Unless the user explicitly narrows the scope, cover every production
environment:

- `prod-us`
- `prod-eu`
- `prod-hipaa`
- `prod-jp`

Query both Datadog sites when needed. Default to the EU site for `prod-eu` and
the US site for the other prod environments, but verify with a small count or
facet query before concluding an environment has no data.

Before querying live Datadog, load the relevant Datadog MCP guidance for the
data domain you need: traces, logs, metrics, and visualizations.

## Workflow

1. Identify the entity and signal: tenant ID, org ID, project ID, route, queue,
   service, error class, or metric.
2. Read only the relevant reference:
   - Prod environment/site routing:
     [`references/environments.md`](references/environments.md)
   - Public API tenant or legacy endpoint usage:
     [`references/public-api-tenant-usage.md`](references/public-api-tenant-usage.md)
   - Queue inventory, queue consumers, and queue metrics:
     [`references/queue-consumers.md`](references/queue-consumers.md)
3. Start with aggregate queries, grouped by environment, service, route,
   queue, project, org, status, or error facets as appropriate.
4. Fetch raw spans, logs, or traces only after aggregation identifies the
   cluster or sample you need.
5. For tenant-specific HTTP usage, prefer trace correlation over single-span
   queries when tenant tags and route tags live on different spans.
6. Report the windows, environments, sites, query links, and any sampling or
   missing-data caveats.

## When To Use Other Skills

- Use [`debug-issue-with-datadog`](../debug-issue-with-datadog/SKILL.md) when a
  Linear issue, GitHub issue, incident report, or monitor needs root-cause
  analysis and patch recommendations.
- Use [`detect-prod-regressions`](../detect-prod-regressions/SKILL.md) when the
  user asks for a proactive production sweep or baseline comparison.
- Use [`linear-bug-triage`](../linear-bug-triage/SKILL.md) only after a human
  approves sharing measured findings in Linear.

## Output Expectations

Summarize what was checked, including:

- Datadog site and `env` values covered.
- Time windows.
- Core filters or metrics used.
- Count, rate, latency, queue depth, trace sample, or "No measurements found".
- Datadog links or trace IDs that let the human rerun the query.
