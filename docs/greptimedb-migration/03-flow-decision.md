# 03 Decision: Defer Standalone Flow, Fold Aggregation into 04 (confirmed by codex)

## Decision

Langfuse has already **dropped all pre-aggregation layers** (`_amt`/MV, migrations `0027_drop_project_environments_mvs`/`0028_drop_traces_null_mvs`/`0029_drop_traces_null_and_amt_tables`); the current state is pure query-time CTE aggregation (most likely because CH ReplacingMergeTree+AMT MV consistency is hard to maintain). Therefore **there is no active pre-aggregation layer for Flow to replicate**.

- trace rollup (total_cost/usage/latency/observation_ids/score_ids), daily-metrics, dashboards, environments → **keep query-time CTE** on GreptimeDB; the design belongs to the **04 read path**. Reuse `repositories/traces.ts buildTracesBaseQuery`, `daily-metrics.ts`, `dashboards.ts`, `environments.ts`.
- analytics_* views: ops-only, not referenced by the app, can be ignored for the migration.
- **Flow is deferred for now**.

## Flow Optimization Trigger Conditions (later, benchmark-driven)

Benchmark after 04 is implemented: if the GreptimeDB query-time trace rollup (join + aggregation over all observations) does not meet the p95 target → introduce Flow to pre-aggregate the trace-level rollup. Before introducing it, first validate: **whether Flow can continuously aggregate from a merge_mode source table (observations projection, last_non_null), and its incremental semantics for merge updates** (the key unknown for using GreptimeDB Flow in this scenario).

codex independently confirmed that this decision is consistent with the facts in the Langfuse code, and is correct.
