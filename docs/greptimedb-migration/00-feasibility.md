# Migrating Langfuse's Storage Backend from ClickHouse to GreptimeDB: Feasibility Study

> Status: Study complete, moving into detailed design.
> Positioning: hard fork (analogous to OpenSearch vs Elasticsearch), strip out EE, switch the storage layer from ClickHouse to GreptimeDB.

## 1. Conclusion at a Glance

- **Legal/license: fully feasible, and cleaner than OpenSearch/ES.** Core is MIT Expat — no SSPL, no "offer as a service" restriction, no trademark clause. `ee/` is commercially licensed but physically isolated and runtime soft-gated; deleting it is enough.
- **Technical: feasible, but it's a "rewrite the analytics layer" level of work, not a "swap the driver".** There is no protocol-compatible path — GreptimeDB does not speak the ClickHouse protocol and does not accept the ClickHouse SQL dialect.
- **Two structural advantages**: (1) S3 is the source of truth and ClickHouse is only a rebuildable projection, so the migration can "replay history" rather than "move data online"; (2) the existing query-builder + filter DSL + converter abstractions are already in place, and the CH coupling is concentrated in `packages/shared/src/server/queries/clickhouse-sql/` and the repositories.
- **#1 item to investigate precisely: update / insert-replace semantics** (see §5.1). High-cardinality primary keys are **not a bottleneck** since GreptimeDB primary keys default to the flat format; this has been ruled out.

## 2. Protocol / License Feasibility

| Item | Conclusion |
|---|---|
| Core license | MIT Expat, no modification/distribution/SaaS restriction |
| `ee/` license | Commercial, redistribution prohibited; `/LICENSE` explicitly states EE does not apply to the core, and the core can run independently |
| Runtime gating | `isEnterpriseLicenseAvailable()` is a soft check; with no key it defaults to the `oss` plan and does not hard fail |
| Only hard dependency | `web/src/features/entitlements/server/getPlan.ts` has a single import of the Stripe catalogue; stub it to `() => null` |
| ClickHouse code location | 100% in the MIT core (`packages/shared/`), touches no EE code |
| CLA | Only constrains contributions back upstream, does not constrain a fork |

Hard fork operation: delete `ee/` + `web/src/ee/` + `worker/src/ee/`, stub one import, remove the enterprise/cloud branches of entitlement. The entire storage replacement stays within the MIT core.

## 3. Current Architecture (Factual Baseline)

Data flow:
```
Public API → validation (Zod) → upload to S3 (event store, source of truth)
  → enqueue in BullMQ (Redis) → Worker downloads/parses/enriches (prompt, model, cost)
  → ClickhouseWriter batched async insert → ClickHouse
Read path: Repository → Filter DSL → SQL generation → ClickHouse
```

Data distribution:
- PostgreSQL (Prisma): users/orgs/projects/api keys/prompts/datasets/dashboards definitions and other configuration metadata
- ClickHouse (sole store): traces / observations / scores / dataset_run_items / blob_storage_file_log; the actual payloads of trace/observation/score are not in Postgres

Coupling scale:
- `queryClickhouse()` call sites: ~339 (shared 231 / web 60 / worker 48)
- ClickHouse migrations: 34 (one clustered and one unclustered set each)
- No backend-agnostic storage abstraction, but there are three layers of abstraction: query-builder (`EventsQueryBuilder` etc.), filter DSL (`clickhouse-filter.ts`), and converter (`*_converters.ts`)

Key CH schema tables: traces / observations / scores are all `ReplicatedReplacingMergeTree(event_ts, is_deleted)`, monthly partitioned, PK = `(project_id, [type,] toDate(time), id[, name])`; plus multi-layer `AggregatingMergeTree` aggregations (traces_all/7d/30d_amt) + analytics_* views + project_environments.

## 4. Capability Mapping (Verified Against GreptimeDB Source/Docs)

| ClickHouse usage | Frequency | GreptimeDB equivalent | Difficulty |
|---|---|---|---|
| `ReplacingMergeTree(event_ts,is_deleted)` + `FINAL` | Core | `merge_mode='last_non_null'` + primary key + time index, FINAL implicit | Medium (semantic differences, see §5.1) |
| `argMax/argMaxIf` | 15+ | No `arg_max`; `last_value(... ORDER BY event_ts)` or `ROW_NUMBER() OVER` | High |
| `LIMIT BY` | 5-10 | `ROW_NUMBER() OVER (PARTITION BY ...)` + filter | High |
| `Map(K,V)` + `sumMap`/`mapKeys`/`mapValues` | Core | No first-class Map column; JSON column or flattened explicit columns | Highest |
| `Array(String)` + `has()` | tags | No first-class Array column; JSON array or normalized child table | High |
| `groupArray/groupArrayIf` | 10+ | `array_agg` (DataFusion) | Medium |
| Full-text search (FTS) | Growing | fulltext index + `matches_term()` | Medium |
| `AggregatingMergeTree` + materialized views | analytics_*, *_amt | Flow (`CREATE FLOW` continuous aggregation) | Medium (Flow is relatively new) |
| `date_diff`/`toStartOf*`/`multiIf`/`uniq` | Many | `date_bin`/`date_trunc`/`CASE WHEN`/`approx_count_distinct` | Low |
| `Decimal64(12)` | cost | `decimal(38,12)` | Low |
| `DateTime64(3)` | time columns | `TimestampMillisecond` + time index | Low |
| bloom_filter / monthly partition / TTL | indexing & partitioning | skipping/inverted index + automatic time partitioning + `PARTITION ON` + TTL | Low-Medium |
| `@clickhouse/client` (HTTP/JSONEachRow) | connection | No official Node SDK; MySQL/PG wire (`mysql2`/`pg`) or HTTP `/v1/sql`; for high throughput use line protocol/gRPC | Medium |

Verified to exist: `merge_mode` (last_row/last_non_null), `append_mode`, fulltext + `matches_term()`, `CREATE FLOW`, JSON type (experimental), `decimal(38,n)`, Vector type, table-/database-level TTL. Verified to **not exist**: `arg_max` (substitute with last_value/window functions), no first-class Array/Map column storage types.

## 5. Key Design Decisions

### 5.0 Target Architecture (Option 2, decided)

GreptimeDB serves as a single store covering both source of truth and projection, **removing the S3 event store**. Decision owner: Dennis (GreptimeDB lead).

```
API receives event
  ├─ write raw_events table (append_mode)        ← source of truth, replaces the S3 event store, directly absorbs large payloads
  └─ enqueue a lightweight reference message in BullMQ (project_id, entity_ref)
        ↓
Worker consumes → reads that entity's events from raw_events → enriches (cost/model/prompt, queries Postgres)
        ↓ writes
  projection tables traces/observations/scores (merge_mode=last_non_null)
        ↓ Flow continuously derives
  secondary aggregations: observation→trace cost/usage rollup, analytics_*, project_environments
Read path queries the projection tables; reprocess = re-read raw_events, re-run enrich, rewrite projections
```

- **`raw_events`** (append_mode, fully retains the original **un-enriched** events, JSON body column): physically replaces the S3 event store, TTL controls cost.
- **Projection tables** (merge_mode=last_non_null, §5.1): written by the worker after enrichment (enrich needs to join Postgres, which Flow cannot express, so it cannot be pushed down).
- **Flow's role = secondary aggregation only** (decided): only downstream derivations, does not take on entity merge. The Flow dependency is kept as light and stable as possible.
- **Kept**: BullMQ (async load-shedding/retry, messages degraded to lightweight references), media/export S3 (large blobs do not enter the OLAP store).
- **Removed**: the entire `LANGFUSE_S3_EVENT_UPLOAD_*` chain.

### 5.1 update / insert-replace Semantics (Precise Conclusion After Reading the Source)

**Mechanism (`src/mito2/src/read/dedup.rs` + `memtable/time_series.rs:1115`)**: within a region the mito engine sorts by `(primary key ASC, timestamp ASC, sequence DESC)`. `sequence` is a region-level monotonically increasing internal write counter; the later the write, the larger it is. When deduplicating by `(primary key, timestamp)`:
- **`last_row`**: keeps the entire row with the largest sequence (last written) → equivalent to ClickHouse whole-row replace.
- **`last_non_null`**: takes the row with the largest sequence as the base, and back-fills each NULL field with the value of the "next larger sequence that is non-NULL" → per-field last-write-wins by write order. `OpType::Delete` tombstones are handled correctly.

**Essential difference from CH**: CH `ReplacingMergeTree(event_ts)` takes the **max of the value column `event_ts`**; GreptimeDB takes last by **write sequence**. It does not support a user-specified version column.

**Chosen modeling**:
- time index = the entity's immutable logical time (`trace.timestamp` / `observation.start_time` / `score.timestamp`)
- primary key = `(project_id, id)`
- `merge_mode = last_non_null`
- FINAL disappears (implicit merge at read time / compaction), the explicit `event_ts` version column is no longer needed

**Architectural benefit**: Langfuse currently does read-merge-write in the worker (`IngestionService` reads the existing row + merges the partial-update field by field + writes the whole row back). After switching to `last_non_null`, that per-field merge is pushed down to the storage engine, and the worker degrades to **append-only writes of partial rows**, eliminating a large chunk of merge logic.

**Nuances the detailed design must nail down (not blockers)**:
1. **Write order vs value order**: a late-written old event has a larger sequence and will overwrite newer fields. Mitigations: per-entity sharding to guarantee ordered writes; replay history from S3 in `event_ts` order; `IngestionService` keeps a lightweight version guard (skip if `event_ts` is older than the largest already seen). Need to validate retry / concurrent reprocess / out-of-order replay edge cases.
2. **Fields with non-last-non-null semantics**: `timestamp/created_at` take min, `updated_at/end_time` take max, usage/cost accumulate — `last_non_null` cannot cover these, so they need app-side handling or aggregation at query time. Decide per field.
3. **soft delete**: either truly delete via `OpType::Delete` (handled by filter_deleted) or keep an `is_deleted` field — pick one.

### 5.2 Map/Array Remodeling (Largest Workload)
- `metadata Map` → JSON column, filtering goes through JSON functions + optional fulltext
- `usage_details/cost_details Map` → hybrid: common keys (input/output/total tokens, cost) flattened into explicit `decimal/uint` columns to support efficient aggregation, long-tail custom keys go into a JSON overflow; `sumMap` degrades to `SUM(column)`
- `tags Array` → JSON array or normalized `*_tags` child table

Ripple scope: ingestion enrich transform, `*_converters.ts`, filter DSL, query builder.

### 5.3 Write Path
Replace `worker/src/services/ClickhouseWriter/`. Writes use the **official TS SDK `@greptime/ingester`** (`/Users/dennis/programming/javascript/greptimedb-ingester-ts`, v0.1.0, three paths: gRPC row + streaming + Arrow Flight bulk). The read path goes through MySQL/PG wire or HTTP `/v1/sql`. Per §5.0 Option 2: the API writes `raw_events` (append) + enqueues; the worker writes projection tables after enrich. reprocess = re-read `raw_events` and re-run enrich. Combined with §5.1, projection table writes are per-field appends (partial rows), with the merge handed to the storage engine.

### 5.4 Analytics/Aggregation
Per §5.0, Flow only takes on **secondary aggregation**: observation→trace cost/usage rollup, analytics_*, project_environments, daily-metrics. Dynamic queries for score-analytics/dashboard prefer query-time aggregation; complex aggregations that Flow cannot validate are downgraded to query-time aggregation.

## 6. Risks and Maintenance Cost

1. **Permanent divergence**: the rewritten `queries/`, writer, migrations, converters are exactly Langfuse's high-frequency iteration areas, so every rebase conflicts with upstream. This is the intrinsic cost of a hard fork and requires dedicated long-term investment.
2. **GreptimeDB maturity**: JSON is experimental, Flow is relatively new. At Greptime this is instead an advantage that reverse-drives the product.
3. ~~No first-class Node SDK~~ (ruled out): the official `@greptime/ingester` TS SDK exists (v0.1.0; the early version's stability needs validation).
4. **EE feature trade-offs**: after deleting EE, by default you lose Stripe billing, Cloud SSO, audit log, RBAC, UI customization, in-app agent, data retention, etc. The **important** ones will be **clean-room re-implemented** in the OSS fork (without referencing `ee/` code, keeping the license clean). See §8.

## 7. Ruled Out / Corrected

- ❌ (ruled out) high-cardinality primary key bottleneck: not a bottleneck since GreptimeDB primary keys default to the flat format.
- ✅ (corrected a sub-study misjudgment) GreptimeDB has a ReplacingMergeTree equivalent (merge_mode), has FTS (matches_term), and has a materialized-view mechanism (Flow).

## 8. EE Feature Trade-offs: Clean-room Re-implementation

Principle: only pick the important ones; implement them directly in the OSS fork, **without referencing `ee/` / `web/src/ee/` code** (keeping the license clean).

The full entitlement set (`web/src/features/entitlements/constants/entitlements.ts`) has 13 binary features + 6 limits. The limit ones are already unlimited in the OSS plan, so they need no action. Among the binary features, only 3 are worth doing:

| feature | Importance | With GreptimeDB | Implementation layer |
|---|---|---|---|
| `data-retention` | High (must-have for self-hosting) | **Directly backed by GreptimeDB OSS TTL** (table-/database-level TTL, per-project per-table TTL) — the best fit | Storage + thin app layer |
| `rbac-project-roles` | High (foundation for team self-hosting) | Storage-agnostic, Postgres + tRPC middleware | App layer |
| `audit-logs` | Medium-high (compliance audit) | append-only time series, **naturally fits GreptimeDB** | App layer (optionally stored in GreptimeDB) |

Secondary optional: `admin-api`, `prompt-protected-labels`.
Explicitly skipped: `cloud-billing`, `cloud-spend-alerts`, `cloud-multi-tenant-sso`, `in-app-agent`, `self-host-ui-customization`, `self-host-allowed-organization-creators` (basic OIDC/OAuth SSO is already in the MIT core's NextAuth).

**Clean-room prerequisite judgment**: for each feature, first locate where its code belongs —
- Implementation already in the **MIT core** (merely soft-gated by entitlement) → just lift the gate, no clean-room concern.
- Implementation in **`ee/`** → only then does it need to be redesigned and reimplemented from the feature concept / public docs (RBAC/retention/audit are all industry-standard concepts; a clean rewrite has no legal risk — the risk is only in line-by-line copying).

## 9. Next Step: Enter Detailed Design

The detailed design must cover:
1. **Precise investigation of update/replace semantics** (§5.1) — the foundation of the approach, settle it first
2. Per-table schema mapping DDL (starting with traces/observations/scores)
3. Field-level plan for Map/Array remodeling + converter/filter DSL rework
4. GreptimeWriter write-protocol selection (`@greptime/ingester`) + S3 replay backfill PoC
5. Read-path query-builder rewrite strategy (argMax/LIMIT BY/sumMap substitution patterns)
6. Flow continuous-aggregation plan
7. EE three items (retention/RBAC/audit) code-ownership location + lift-gate or clean-room decision
