# ClickHouse analyzer/query-plan reproductions

This directory contains three self-contained optimizer reproductions extracted
from Langfuse customer reports. Docker only selects and isolates ClickHouse
versions; every database setup, trigger query, and mitigation is plain SQL.

The version column below means **the highest official Docker build directly
tested failing**, not an inferred affected range.

| Issue class | Combinations of flags to mitigate, least broad impact first | Last ClickHouse version reproduced on |
| --- | --- | --- |
| `FINAL` + preserved-side `LEFT JOIN` + `ORDER BY/LIMIT`: `topKThroughJoin` and filter push-down leave lazy materialization with a dangling predicate input (`NOT_FOUND_COLUMN_IN_BLOCK`) | `query_plan_top_k_through_join=0` (recommended); or per query `query_plan_max_limit_for_lazy_materialization < LIMIT`; or `query_plan_filter_push_down=0`; or `query_plan_optimize_lazy_materialization=0`; or `query_plan_enable_optimizations=0`; broad fallback: `enable_analyzer=0` / `allow_experimental_analyzer=0` | **26.7.1.1315** (first tested working: 26.7.2.59) |
| Lightweight-update patch parts + lazy materialization lose internal `_block_number` during an in-order read (`NOT_FOUND_COLUMN_IN_BLOCK`) | Per query `query_plan_max_limit_for_lazy_materialization < LIMIT`; or `query_plan_optimize_lazy_materialization=0`; broad fallback: `enable_analyzer=0` / `allow_experimental_analyzer=0` | **26.3.17.110** (first tested working: 26.4.1.1141) |
| `Distributed` table + shared-subexpression `ALIAS` columns + `ORDER BY`: remote and initiator projection headers differ, then positional mapping casts a `UInt64` into `Map(String, Decimal(38,12))` (`TYPE_MISMATCH`) | No narrow flag found. Least-impact workaround is a query rewrite: project in an inner query, then apply `ORDER BY`/`LIMIT BY`/`LIMIT` in an outer query block. Flag fallback: `enable_analyzer=0` / `allow_experimental_analyzer=0` | **26.6.1.1193** (first tested working: 26.6.2.81) |

## Run a reproduction

Each command starts isolated official ClickHouse containers, runs a setup SQL
file, verifies the baseline result, verifies every effective mitigation, and
removes its containers again.

```bash
./scripts/clickhouse-analyzer-repro/run.sh scores 26.7.1.1315 fail
./scripts/clickhouse-analyzer-repro/run.sh patch-parts 26.3.17.110 fail
./scripts/clickhouse-analyzer-repro/run.sh distributed 26.6.1.1193 fail
```

Use `pass` instead of `fail` for a fixed-version control:

```bash
./scripts/clickhouse-analyzer-repro/run.sh scores 26.7.2.59 pass
./scripts/clickhouse-analyzer-repro/run.sh patch-parts 26.4.1.1141 pass
./scripts/clickhouse-analyzer-repro/run.sh distributed 26.6.2.81 pass
```

Run every version boundary used in this report:

```bash
./scripts/clickhouse-analyzer-repro/verify-matrix.sh
```

The SQL can also be run manually. For a single-node case, run its `*-setup.sql`
and then `*-repro.sql` in the same server. For the distributed case, start two
servers with `distributed-cluster.xml`, run `distributed-node2-setup.sql` on
node 2, then `distributed-node1-setup.sql` and `distributed-repro.sql` on node
1. The `*-mitigations.sql` files are passing controls.

## Setting isolation

### 1. Scores / top-K-through-join class

The minimal SQL is `scores-setup.sql` + `scores-repro.sql`.

All of these independently make the failing query succeed on 26.7.1.1315:

| Option | Result | Scope |
| --- | --- | --- |
| `query_plan_top_k_through_join=0` | passes | Directly disables the optimization that creates the bad plan; narrowest robust setting. |
| `query_plan_max_limit_for_lazy_materialization=4` with query `LIMIT 5` | passes | Avoids lazy materialization for this query shape; useful only as a per-query threshold. A value equal to the limit still fails. |
| `query_plan_filter_push_down=0` | passes | Disables a broader plan transformation involved in the interaction. |
| `query_plan_optimize_lazy_materialization=0` | passes | Disables lazy materialization for the whole query. |
| `query_plan_enable_optimizations=0` | passes | Much broader than needed. |
| `enable_analyzer=0` or `allow_experimental_analyzer=0` | passes | Broadest fallback. |

Tested individually with **no effect**: `query_plan_read_in_order=0`,
`optimize_read_in_order=0`, `query_plan_execute_functions_after_sorting=0`,
`query_plan_push_down_limit=0`, `query_plan_merge_expressions=0`,
`query_plan_merge_filters=0`, `query_plan_remove_unused_columns=0`,
`query_plan_split_filter=0`, `optimize_move_to_prewhere=0`, and
`query_plan_optimize_prewhere=0`. Changing join algorithm/strictness also did
not remove the class.

Removing any of `FINAL`, the `LEFT JOIN`, `ORDER BY`, or `LIMIT` avoids the
failure; so does changing the join to `INNER`. Those are trigger-isolation
controls, not generally equivalent application rewrites.

Version observations:

| Docker/server version | Baseline |
| --- | --- |
| 26.5.5.8 | fails |
| 26.6.1.1193 | fails |
| 26.6.2.81 | fails |
| 26.7.1.1315 | fails |
| 26.7.2.59 | passes |

Upstream provenance:

- [ClickHouse #109210](https://github.com/ClickHouse/ClickHouse/issues/109210)
  is the exact minimized bug report.
- [PR #104268](https://github.com/ClickHouse/ClickHouse/pull/104268)
  introduced `query_plan_top_k_through_join` in 26.5.1.651.
- [PR #110722](https://github.com/ClickHouse/ClickHouse/pull/110722) fixes
  the dangling filter input. It landed in 26.7.1.1334 and was backported to
  26.7.2.11, 26.6.2.108, and 26.5.6.70.

### 2. Patch-parts class

The minimal SQL is `patch-parts-setup.sql` + `patch-parts-repro.sql`.

| Option | Result on 26.3.17.110 | Scope |
| --- | --- | --- |
| `query_plan_max_limit_for_lazy_materialization=4` with query `LIMIT 5` | passes | Least broad per-query setting. |
| `query_plan_optimize_lazy_materialization=0` | passes | Robust setting workaround for all patch-part query shapes. |
| `enable_analyzer=0` or `allow_experimental_analyzer=0` | passes | Broad fallback. |
| `query_plan_enable_optimizations=0` | **still fails** | The lazy-materialization pass is not suppressed by this umbrella flag in the tested build. |
| `query_plan_filter_push_down=0`, `query_plan_read_in_order=0`, or `optimize_read_in_order=0` | **still fails** | Not causal. |

Version observations:

| Docker/server version | Baseline |
| --- | --- |
| 25.12.11.4 | fails |
| 26.2.19.43 | fails |
| 26.3.17.110 | fails |
| 26.4.1.1141 | passes |

[ClickHouse PR #102904](https://github.com/ClickHouse/ClickHouse/pull/102904)
is both the upstream reproduction and fix: skip lazy materialization whenever
the mutation snapshot has patch parts. It merged in 26.4.1.1005. Automated
backport PRs to [25.8](https://github.com/ClickHouse/ClickHouse/pull/106432)
and [26.3](https://github.com/ClickHouse/ClickHouse/pull/106433) were closed
without merging, consistent with the tested failures.

### 3. Distributed output-column-order class

The minimal two-node SQL is `distributed-node1-setup.sql`,
`distributed-node2-setup.sql`, and `distributed-repro.sql`.

| Option or rewrite | Result on 26.6.1.1193 |
| --- | --- |
| Move `ORDER BY` and the row limit/dedup operation to an outer query block | passes; recommended workaround because unrelated optimizer features stay enabled |
| `enable_analyzer=0` or `allow_experimental_analyzer=0` | passes; broad fallback |
| `query_plan_optimize_lazy_materialization=0` | **still fails** |
| `query_plan_enable_optimizations=0` | **still fails** |
| `distributed_push_down_limit=0` | **still fails** |
| `query_plan_filter_push_down=0` | **still fails** |
| `query_plan_read_in_order=0` or `optimize_read_in_order=0` | **still fails** |
| `query_plan_execute_functions_after_sorting=0` | **still fails** |
| `serialize_query_plan=0` or `serialize_query_plan=1` | **still fails** |

Removing `ORDER BY`, reading the local table, or replacing the table `ALIAS`
columns with ordinary SELECT expressions avoids the failure. Removing only
`LIMIT` does **not** avoid it. Wrapping the already-sorted query also does not
help: the sort must move into the outer query block.

Version observations:

| Docker/server version | Baseline |
| --- | --- |
| 25.12.8.9 | fails |
| 26.6.1.1193 | fails |
| 26.6.2.81 | passes |
| 26.7.1.1315 | passes |

The direct upstream lineage is
[ClickHouse #79916](https://github.com/ClickHouse/ClickHouse/issues/79916),
[#81631](https://github.com/ClickHouse/ClickHouse/issues/81631), and
[#97899](https://github.com/ClickHouse/ClickHouse/issues/97899), fixed by
[PR #107675](https://github.com/ClickHouse/ClickHouse/pull/107675). The fix
preserves projection-output order before the initiator's positional mapping.
It landed in 26.7.1.245 and was backported to 26.6.2.46, 26.5.6.28,
26.4.5.115, 26.3.17.34, and 25.8.29.10. No 25.12 backport is listed.

## Related Langfuse issues, classified

| Langfuse issue/PR | Classification |
| --- | --- |
| [#13809](https://github.com/langfuse/langfuse/issues/13809), [#14065](https://github.com/langfuse/langfuse/issues/14065), [#14156](https://github.com/langfuse/langfuse/issues/14156), [#14349](https://github.com/langfuse/langfuse/issues/14349), [#14496](https://github.com/langfuse/langfuse/issues/14496), [#14792](https://github.com/langfuse/langfuse/issues/14792), [#15125](https://github.com/langfuse/langfuse/issues/15125), [#15977](https://github.com/langfuse/langfuse/issues/15977) | Same Scores/top-K/lazy-plan class. Reports blaming `none of`, serialized sets, or `and()` syntax are observing an internal analyzer expression in the exception, not malformed generated SQL. |
| [PR #13693](https://github.com/langfuse/langfuse/pull/13693) | Added the global lazy-materialization workaround for the separate patch-parts class. It later happened to mitigate the Scores class too. |
| [PR #14187](https://github.com/langfuse/langfuse/pull/14187) | Added automatic ClickHouse version detection, but models all affected versions as one open-ended lazy-materialization band. It cannot mitigate the Distributed class. |
| [#14431](https://github.com/langfuse/langfuse/issues/14431) | Distributed projection-order class. The customer explicitly confirmed `query_plan_optimize_lazy_materialization=0` did not help. |
| [#12545](https://github.com/langfuse/langfuse/issues/12545) / [PR #12546](https://github.com/langfuse/langfuse/pull/12546) | Performance issue and query-shape change that exposed #14431 by replacing `FINAL` with `ORDER BY ... LIMIT 1 BY`; not the ClickHouse defect itself. |
| [PR #14432](https://github.com/langfuse/langfuse/pull/14432) | Open application-side workaround for #14431 that moves ordering/deduplication to an outer query block. The minimal SQL here validates that exact boundary. |
| [#15529](https://github.com/langfuse/langfuse/issues/15529) | Intermittent timeout/load report. No deterministic analyzer exception or matching SQL trigger; excluded from these optimizer classes. |

## Scope note

The patch-parts setup intentionally uses two tiny inserts, a lightweight
`UPDATE`, and `OPTIMIZE ... FINAL` solely to manufacture the internal storage
state needed for the bug. It is a regression fixture, not production ingestion
or mutation guidance.
