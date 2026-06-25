---
name: infra-scaling
description: Tune Langfuse infrastructure autoscaling safely across web, web-iso, and web-ingestion. Use when Codex needs to review or change Terraform scale settings, RPM targets, scale-up/scale-down boundaries, min/max task counts, cost/performance tradeoffs, dashboard scaling markers, Datadog event-loop metrics, trace/span evidence, GitHub pull requests, or Linear follow-up tickets for `web`, `web-iso`, or `web-ingestion` containers in the langfuse/infrastructure repository.
---

# Langfuse Infra Scaling

Use this skill for Langfuse `web-ingestion`, `web`, and `web-iso` autoscaling work in `langfuse/infrastructure`.

## Goal

Optimize the cost/performance tradeoff: run the smallest reliable container footprint that preserves acceptable latency, error rate, CPU/memory headroom, event-loop health, and burst capacity. Treat both idle overprovisioning and insufficient headroom as problems. Recommendations should say which side of the tradeoff they optimize and why.

## Core Rules

- Read the current branch and files first. Do not rely on remembered values.
- Do not optimize only for cost or only for latency. Prefer changes that reduce waste when health is green, and preserve or add headroom when snappy routes, errors, CPU/memory, event-loop delay, or autoscaler load show risk.
- Keep `web_ingestion_cpu = 2048` unless the user explicitly overrides it. These Node.js containers reserve one CPU for the event loop and one for background work.
- Treat `web_ingestion_instances` as the autoscaler minimum. In `terraform/modules/ecs_service/resources.tf`, the autoscaler target uses `min_capacity = var.instances`.
- For prod web-ingestion, keep the minimum container count at `3`.
- Preserve burst capacity when lowering the minimum: `max_capacity = web_ingestion_instances * web_ingestion_autoscaler_max_capacity_multiplier`.
- Distinguish cost levers: if a service usually sits at its minimum task count, raising RPM targets will not save money; lower the minimum after validating HA/compliance floors, and raise the max-capacity multiplier if needed to preserve burst ceiling.
- Update dashboard markers whenever RPM target or boundary changes.
- Use exact OpenTofu math for markers. Do not mental-math `ceil(target * boundary)` because Terraform float behavior can produce off-by-one results.
- For `web` and `web-iso`, do not reduce RPM per container solely because service latency is high. First inspect full APM traces, including ClickHouse spans, to distinguish container saturation from database-bound requests.
- If slow `web-iso` traces are dominated by ClickHouse child spans, do not lower RPM targets as the primary fix. Lowering RPM changes web-container scaling and request distribution, but it does not reduce ClickHouse query cost, total query workload, or an individual long-running query duration.
- If scaling should be adjusted, create or update a GitHub PR. For Linear follow-ups, prepare a human-review table first and wait for explicit human approval before creating, updating, commenting on, or assigning tickets. Do not create or assign Linear tickets for Valeriy.

## Files

Service scaling values live in:

```text
terraform/environments/services/env-prod-us.tfvars
terraform/environments/services/env-prod-eu.tfvars
terraform/environments/services/env-prod-hipaa.tfvars
terraform/environments/services/env-prod-jp.tfvars
```

Dashboard marker values live in:

```text
terraform/environments/monitoring/env-prod-us.tfvars
terraform/environments/monitoring/env-prod-eu.tfvars
terraform/environments/monitoring/env-prod-hipaa.tfvars
terraform/environments/monitoring/env-prod-jp.tfvars
```

Autoscaler implementation:

```text
terraform/environments/services/web_ingestion.tf
terraform/environments/services/web.tf
terraform/environments/services/web_isolated.tf
terraform/modules/ecs_service/resources.tf
terraform/modules/ecs_autoscaler/resources.tf
```

Important implementation facts:

- RPM scale-up threshold is `rpm_target + ceil(rpm_target * rpm_boundary)`.
- RPM scale-down threshold is `rpm_target - ceil(rpm_target * rpm_boundary)`.
- Web ingestion uses `autoscaler_up_eval_periods = 1`, `autoscaler_step_size = 2`, and the default scale-down evaluation periods of `5`.
- Scale-down removes `1` task per step; scale-up adds `2`.
- `web-iso` uses `autoscaler_up_eval_periods = 1` and `autoscaler_step_size = 2`.
- `web` and `web-iso` RPM autoscalers do not use processed-bytes weighting; `web-ingestion` does.
- Use autoscaler-aligned ALB target group filters. For `web-ingestion`, use exact `targetgroup:targetgroup/${env}-web-ingestion/*`. For `web`, use exact `targetgroup:targetgroup/${env}-web/*`. For `web-iso`, use `targetgroup:targetgroup/${env}-web-iso*/*`. Avoid broad `web-*` filters because they can mix `web`, `web-iso`, and `web-ingestion`.

## Workflow

1. Inspect local context:

```bash
git status --short --branch
rg -n "web_ingestion_instances|web_ingestion_autoscaler_rpm_target|web_ingestion_autoscaler_rpm_boundary|web_ingestion_autoscaler_max_capacity_multiplier" terraform/environments/services/*.tfvars
```

2. Gather current production evidence before changing thresholds. Load the Datadog metrics skill before querying Datadog.

Use Datadog US for `prod-us` and `prod-hipaa`; use Datadog EU for `prod-eu` and `prod-jp`.

Useful 7-day queries:

```text
avg:aws.ecs.cpuutilization{servicename:prod-us-web-ingestion,environment:prod-us}.rollup(avg,60)
max:aws.ecs.cpuutilization{servicename:prod-us-web-ingestion,environment:prod-us}.rollup(max,60)
max:aws.ecs.service.running{servicename:prod-us-web-ingestion,environment:prod-us}.rollup(avg,60)
sum:aws.applicationelb.request_count_per_target{environment:prod-us,targetgroup:targetgroup/prod-us-web-ingestion/*}.as_count().rollup(sum,60)
sum:aws.applicationelb.processed_bytes{environment:prod-us}.as_count().rollup(sum,60)
```

Use this formula for the autoscaler's weighted per-container load:

```text
(request_count_per_target + (processed_bytes * 0.000005)) / running_tasks
```

Also check latency and errors before raising per-container load:

```text
p95:trace.http.server{resource_name:post_/api/public/ingestion,service:web-ingestion,env:prod-us}.rollup(avg,300)
p99:trace.http.server{resource_name:post_/api/public/ingestion,service:web-ingestion,env:prod-us}.rollup(avg,300)
sum:trace.http.server.errors{resource_name:post_/api/public/ingestion,service:web-ingestion,env:prod-us}.as_count().rollup(sum,300)
```

Change `prod-us` to the target environment.

For `web` and `web-iso`, also check event-loop metrics and full trace shape before changing RPM:

```text
max:aws.ecs.service.running{servicename:prod-us-web,environment:prod-us}.rollup(avg,60)
sum:aws.applicationelb.request_count_per_target{environment:prod-us,targetgroup:targetgroup/prod-us-web/*}.as_count().rollup(sum,60)
avg:runtime.node.event_loop.delay.max{env:prod-us,service:web}.rollup(avg,60)
max:runtime.node.event_loop.delay.max{env:prod-us,service:web}.rollup(max,60)
max:runtime.node.event_loop.delay.count{env:prod-us,service:web}.as_count().rollup(sum,60)

max:aws.ecs.service.running{servicename:prod-us-web-iso,environment:prod-us}.rollup(avg,60)
sum:aws.applicationelb.request_count_per_target{environment:prod-us,targetgroup:targetgroup/prod-us-web-iso*/*}.as_count().rollup(sum,60)
avg:runtime.node.event_loop.delay.max{env:prod-us,service:web-iso}.rollup(avg,60)
max:runtime.node.event_loop.delay.max{env:prod-us,service:web-iso}.rollup(max,60)
max:runtime.node.event_loop.delay.count{env:prod-us,service:web-iso}.as_count().rollup(sum,60)
```

For `web` and `web-iso`, compare request count per target to running tasks to determine whether the service is above its minimum or floor-bound. If floor-bound, changing RPM target or boundary will not reduce task count.

Use route-level latency for snappy paths instead of broad service p99:

```text
p95:trace.http.server{(resource_name:get_/api/auth* OR resource_name:post_/api/auth*) AND service:web AND env:prod-us}.rollup(avg,300)
p99:trace.http.server{env:prod-us AND service:web AND resource_name:get_/api/trpc/dashboard*}.rollup(avg,300)
```

Load the Datadog traces skill and inspect slow `web`/`web-iso` traces when latency looks bad:

```text
search spans: env:prod-us service:web-iso @duration:>5000000000
get trace: include db.*, ch.*, http.*, peer.*, langfuse.* fields
aggregate: env:prod-us service:web-iso resource_name:"clickhouse - query" with @duration percentiles
```

Trace interpretation rules:

- If the root span is slow and ClickHouse child spans account for most of the time, treat it as DB-bound. Do not lower RPM per container as the main change.
- If Redis/auth spans are sub-ms and ClickHouse spans are multi-second, changing web-container count or RPM targets is unlikely to fix latency unless there is separate evidence of container-local saturation, queueing, or event-loop delay.
- If snappy API routes are slow without dominant DB spans and event-loop delay/CPU rises with per-container RPM, then reducing the RPM target or increasing min capacity can make sense.
- Service-wide `web` or `web-iso` p99 can be misleading because public traces/observations routes may be intentionally heavy or DB-bound. Prefer route-specific and trace-backed evidence.

3. Choose the scaling adjustment:

- If CPU is low and latency/errors look healthy, prefer increasing `web_ingestion_autoscaler_rpm_target` or narrowing `web_ingestion_autoscaler_rpm_boundary`.
- For `web` and `web-iso`, optimize cost when snappy routes, errors, CPU, memory, and event-loop delay are healthy. If the service is floor-bound, reduce `web_instances` or `web_iso_instances`; if it regularly scales above the floor, increase the RPM target or widen/narrow boundaries based on churn.
- Before lowering `web_instances` or `web_iso_instances`, check whether the current minimum is an intentional HA, isolation, enterprise, or compliance floor. If it is not intentional, lower the minimum conservatively and preserve the old maximum by adjusting `*_autoscaler_max_capacity_multiplier`.
- When no higher HA/compliance floor is needed, `3` is an acceptable prod minimum for `web` and `web-iso`.
- ClickHouse-bound p99 latency should not automatically block a cost-floor reduction when container-local health is green. Document it separately as a database/query-path risk and keep route-level/event-loop monitoring in the rollout notes.
- Prefer `0.3` boundaries when container fluctuation is a concern. Use `0.2` only when data shows scale-down is too slow or the user explicitly wants tighter tracking.
- Avoid `0.1` in prod unless the user explicitly asks and data shows low churn risk.
- Widening from `0.2` to `0.3` lowers the scale-down threshold and raises the scale-up threshold, reducing churn at the cost of more hysteresis.
- Be conservative in `prod-jp`: normal traffic may sit at the HA floor, but spikes can be sharp.
- For `web-iso`, only reduce RPM targets when the evidence points to container-local saturation. Keep the current target when slow spans are ClickHouse-dominated.

Known settings from the May 10, 2026 tuning pass are point-in-time snapshots only. Always supersede these values with the live file reads from step 1 before making recommendations or edits:

```text
prod-us:    min 3, cpu 2048, target 2000, boundary 0.3, markers down 1400 / up 2600, max 90
prod-eu:    min 3, cpu 2048, target 1700, boundary 0.3, markers down 1189 / up 2211, max 42
prod-hipaa: min 3, cpu 2048, target 1300, boundary 0.3, markers down 909  / up 1691, max 42
prod-jp:    min 3, cpu 2048, target 490,  boundary 0.3, markers down 343  / up 637,  max 42
```

Known `web`/`web-iso` learning from the May 10, 2026 trace pass:

- A follow-up draft PR lowered `prod-us` and `prod-eu` `web_iso_autoscaler_rpm_target`, then was reversed and closed after full trace inspection.
- Representative slow `prod-us` `web-iso` trace: root `GET /api/public/traces/index` was about 11.3s, and the main `clickhouse - query` was also about 11.3s, reading about 2.75M rows / 5.6GB.
- Representative slow `prod-eu` `web-iso` trace: public traces request was about 10s while an expanded handler had a `clickhouse - query` around 16.0s, reading about 15.9M rows / 28.6GB.
- Conclusion: keep `web-iso` RPM settings unchanged when public traces/observations latency is ClickHouse-bound; investigate query shape or ClickHouse capacity instead.
- Cost tradeoff learning: ClickHouse-bound latency is not a reason by itself to lower RPM targets, but it also should not prevent reducing accidental idle floors if snappy routes and container-local health are green.
- Churn learning: if `0.2` RPM boundaries cause too much container fluctuation, move them back to `0.3` and update dashboard markers with exact OpenTofu math. Normalize narrower accidental prod boundaries, such as `0.1`, to `0.3` when the stated goal is less fluctuation.
- `prod-hipaa` example: `web_instances` was an accidental floor at `20` with multiplier `1`; reduce to `3` and set multiplier `7` to keep at least the old max (`21`). `web_iso_instances` was an accidental floor at `40` with multiplier `1`; reduce to `3` and set multiplier `14` to keep at least the old max (`42`).

4. Compute markers exactly:

```bash
tmpdir=$(mktemp -d)
cd "$tmpdir"
printf '2000 + ceil(2000 * 0.3)\n2000 - ceil(2000 * 0.3)\n' | tofu console
```

Use the output values in the matching monitoring tfvars. Repeat for each target/boundary pair.

5. Edit only the relevant service and monitoring tfvars. Keep unrelated scale settings untouched.

6. Validate:

```bash
tofu fmt -check <changed .tfvars files>
git diff --check
git diff main..HEAD --stat
```

Run a full plan only when credentials and workspace setup are available or the user requests it. Otherwise rely on Atlantis to plan the PR.

7. Summarize the outcome:

- List final target, boundary, scale-down marker, scale-up marker, min, max, and CPU for each changed region.
- Always include a Markdown recommendation table with one row per reviewed region/container, not only changed rows. Use columns: `Region`, `Container`, `Recommended change`, and `Reasoning`. In `Recommended change`, say exactly what to change or `No change`. In `Reasoning`, cite the deciding evidence, such as CPU/load, latency/errors, event-loop metrics, and whether slow traces were ClickHouse-bound. Also state the cost/performance tradeoff, such as `saves idle floor cost while preserving burst max`, `keeps extra headroom because event-loop risk is elevated`, or `no cost lever because already at HA floor`.
- Mention Datadog evidence used.
- Mention checks run and whether a full plan was not run.
- Return valid Markdown. Use valid headings, lists, links, tables, and code fences; include spaces after list markers; close every link, parenthesis, and code fence; and check for malformed tables before returning.

8. Create a GitHub PR and prepare human-reviewed Linear follow-ups when scaling should be adjusted:

- Trigger this when the recommendation table contains at least one concrete scaling change, or when Terraform scaling settings were edited. Do not create a ticket for an all-`No change` review unless the user explicitly asks.
- Ensure there is a GitHub PR for the scaling change. If no PR exists yet, create one. Include the recommendation summary, validation, and rollout risks in the PR body.
- Before any Linear write, present a review table and ask the human which row IDs and actions to approve:

| ID | Finding | Evidence | Impact / Scope | Existing Ticket Match | Proposed Linear Action | Confidence | Human Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | Scaling adjustment summary | Measured Datadog evidence, trace links, PR URL, or `No measurements found` | Affected env, service, route, customer segment, or blast radius supported by evidence | Existing issue key/link, duplicate candidate, or `None found` | Create new ticket, add evidence comment, update status/labels, or no action | High/medium/low plus one short reason | Leave blank for the human to choose |

- Do not create Linear tickets, comment on tickets, edit ticket fields, add evidence, or assign an owner until the human explicitly selects one or more row IDs and actions. If the user asks for an automated sweep, still pause at this review table before writing to Linear.
- After approval, use the Linear skill or Linear app tools. Create one ticket for the scaling adjustment, not one ticket per region, unless the user requests separate tickets.
- Assign the ticket only when the user explicitly names an assignee. Otherwise leave it unassigned. Do not create or assign tickets for Valeriy.
- Include the full skill output in the ticket description: recommendation table, Datadog evidence, trace interpretation, proposed or applied Terraform changes, marker math, validation results, plan status, PR URL, and known rollout risks.
- Link the artifacts both ways after approval: put the PR URL in the Linear ticket, and put the Linear issue URL or identifier in the PR body or a PR comment. If one artifact is created after the other, update the first artifact once the second URL exists.
- If GitHub PR creation or approved Linear ticket creation is unavailable, report that blocker and provide the exact PR body or ticket title/body that should be created manually.

## PR Handling

When working on an existing PR branch:

- Commit with a conventional commit message.
- Push the branch if the user is asking you to update the PR.
- If sandboxing blocks `git add`, `git commit`, or `git push`, request escalation instead of working around it.
