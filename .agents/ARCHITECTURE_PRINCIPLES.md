# Underlying Architecture Principles

Langfuse architecture should optimize for high-scale, exploratory observability
on wide, structured event data. These principles are grounded in current
production scale and the reference material below.

## Reference Posts

- [Simplifying Langfuse for Scale](https://langfuse.com/blog/2026-03-10-simplify-langfuse-for-scale)
- [Charity Majors on Observability 2.0](https://charity.wtf/tag/observability-2-0/)
- [All you need is Wide Events, not "Metrics, Logs and Traces"](https://isburmistrov.substack.com/p/all-you-need-is-wide-events-not-metrics)

## Principles

- Model observations as the primary analytical unit. A trace is a correlation
  handle that links related observations, not the only useful entry point.
- Prefer wide, richly attributed events over fragmented metrics, logs, and trace
  records that require later reconstruction.
- Preserve high-cardinality context so users can slice, group, filter, and debug
  unknown unknowns without predefining every future question.
- Favor immutable or append-oriented event records for high-volume telemetry.
  Updates that force read-time deduplication create hidden query costs at scale.
- Denormalize carefully when it removes hot-path joins and makes common filters
  into direct column predicates.
- Design storage and query paths around columnar access patterns: narrow field
  selection, time-bounded scans, useful ordering keys, and data pruning.
- Keep list, dashboard, and aggregate views on compact query-optimized
  representations. Fetch large raw payloads only for focused detail views.
- Make API contracts scale-aware: require time windows where needed, expose field
  selection, use token pagination, and avoid defaults that can scan all history.
- Treat cost and operational simplicity as architectural constraints. Extra
  databases, queues, materialized views, and migrations must earn their long-term
  operational burden.
- Preserve real-time or near-real-time debugging workflows. Batch processing can
  help, but it should not make fresh production behavior invisible.

## Practical Defaults For Agents

- Before adding a metric, ask whether the same question is better answered from
  wide event data.
- Before adding a join, ask whether the attribute should be propagated or
  denormalized onto the observation path.
- Before reading large fields, ask whether the view needs them or can defer them
  until a single-record fetch.
- Before adding an update-heavy design, ask whether immutable events plus
  derived representations would be simpler at production scale.
- Before documenting public behavior, separate stable public contracts from
  private production topology, account details, secret names, and incident
  runbooks.
