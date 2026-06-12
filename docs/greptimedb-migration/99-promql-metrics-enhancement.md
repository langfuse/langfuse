# Enhancement (bonus phase): PromQL / metrics surface

> Status: future enhancement, **not** part of the core migration (00–04). Captured here as the
> differentiation story that goes _beyond_ the OpenSearch-vs-Elasticsearch analogy. Lands as an
> add-on to the P3 dashboard builder plus a new outward-facing metrics surface — never a replacement
> for the existing query path.

## Why Langfuse has no PromQL concept (it's structural, not a missing switch)

Langfuse's whole query surface is built on SQL over event/span semantics:

- The frontend sends a structured **filter-state** (`column` / `operator` / `value`) + `orderBy`,
  which our factory translates to SQL (ClickHouse before, GreptimeDB now).
- The dashboard layer (P3 universal dashboard builder) has its own query model — `date_bin`
  bucketing, `count`/`sum`, `uddsketch` quantiles, `group by` — and still emits **SQL**, not
  PromQL/TQL.
- The data model is `trace` / `observation` / `score` (event/span semantics), **not** the
  Prometheus `(metric_name, labels, timestamp, value)` sample shape.

So "no PromQL" is structural: there is no mental model anywhere in the product for _select a time
series by metric + label, then `rate` / `irate` / `histogram_quantile` / aggregate over time_. It
isn't one feature flag away.

## The opportunity (real differentiation — but pick the landing spot, don't force it)

1. **LLM-observability metrics layer.** Materialize observation `cost` / `usage` / `latency` /
   `error` into Prometheus-style **metric tables** in GreptimeDB (or via Flow aggregation). Then
   `histogram_quantile(0.99, ...)` for p99 latency, `rate(token_cost[5m])`, and aggregation by
   `model` / `project` labels are far more natural in PromQL/TQL than hand-writing the two-level
   `group by` + `uddsketch` the dashboard builder assembles today. Ops/trend dashboards get much
   shorter to express.
2. **Expose a PromQL / metrics endpoint.** Let users point **Grafana** straight at it and pull LLM
   app token/cost/latency/error in as ordinary metrics inside their existing monitoring. This is a
   concrete "plug Langfuse into my existing SRE stack" selling point — something a pure ClickHouse
   fork structurally cannot offer.
3. **Alerting.** PromQL threshold alerts (p99 latency breach, error-rate rise, cost spike) are far
   less work than building an in-product alerting DSL.

## Boundaries (so it doesn't get over-applied)

- **The core read path stays SQL.** Trace list, trace detail, arbitrary-dimension filtering, score
  reads — these are point/detail/ad-hoc-filter queries where PromQL is awkward. Keep them on our
  SQL translation layer (04). PromQL fits **only** the "aggregate time series" class.
- **It needs a real metrics-materialization layer.** The EAV / flattened columns from 01 are not
  enough; PromQL wants actual metric tables with label columns and a proper time index, or it runs
  awkwardly (semantics and performance) over the raw span tables. This is genuine extra engineering,
  not free.
- **Positioning:** a P3-dashboard _enhancement_ + a new outward-facing metrics surface. Additive,
  not a replacement for the existing query model.

## In one line

PromQL is not here to replace Langfuse's existing queries — it adds a capability Langfuse inherently
lacks and GreptimeDB is natively good at: a metrics / trend / alerting surface with direct Grafana
connectivity. That's the extra differentiation story on top of the OpenSearch-vs-Elasticsearch
framing.
