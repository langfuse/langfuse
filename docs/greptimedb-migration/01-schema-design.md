# Detailed Design 01: Schema Design (raw_events + three projection tables)

> Based on `00-feasibility.md` §5. Architecture = Option 2: `raw_events` (append, SoT) → worker enrich → projection tables (merge last_non_null) → Flow second-level aggregation.
> This document covers `raw_events` and the three projection tables `traces/observations/scores`. Flow-derived tables are covered later in 03.

## 0. Design Principles

1. **Three table classes**: `raw_events` (append_mode, source of truth); three projection tables (merge_mode=last_non_null, for reads); Flow-derived tables (second-level aggregation, separate document).
2. **Unified conventions for projection tables**: time index = the entity's immutable logical time; `PRIMARY KEY` includes `(project_id, id)`; `merge_mode='last_non_null'`; `sst_format='flat'` (friendly to high-cardinality id).
3. **Type mapping**:
   - `Decimal64(12)` → `DECIMAL(38, 12)`; `DateTime64(3)` → `TimestampMillisecond`.
   - enum (type/level/source/data_type) → `String` (GreptimeDB has no `LowCardinality`; columnar storage provides dictionary encoding on its own).
   - input/output → `String` (the original may not be valid JSON; columnar storage compresses automatically).
   - For `Map(K,V)`, **common keys are flattened into explicit columns** (e.g. cost/usage); the remainder is stored whole as `JSON` for display/restoration only.
   - `Array(String)` is stored whole as `JSON` for display/restoration only.
4. **Separation of storage and filtering (key constraint)**: GreptimeDB's current JSON filtering performance is weak (pending JSON v2), so:
   - JSON columns are **used only for storage and display; they carry no filtering**.
   - Fields that are filtered frequently must land in **independent indexable columns**: fixed fields are promoted to columns directly; variable-length KV / arrays (metadata / tags) use an **EAV filter sub-table** (§5), where key/value/tag are each independent `String` columns + inverted index.
   - Main-table JSON + EAV sub-table = dual-representation, written by the worker as a dual write. Once JSON v2 is ready, the sub-tables are retired and filtering goes directly through JSON.
5. **NULL semantics are the expressive tool for merge**: each event writes only the fields it carries and leaves the rest NULL. `last_non_null` backfills field by field → use "whether or not a field is written" to control merge behavior (see the created_at/updated_at trick in §2/§3).

---

## 1. `raw_events` table (append_mode, source of truth)

A physical replacement for the S3 event store. It carries all ingestion event types (`eventTypes`: trace-create / span|generation|agent|tool|chain|retriever|evaluator|embedding-create|update / score-create / event-create / sdk-log / dataset-run-item-create / legacy observation-create|update). **Stores raw, un-enriched events.**

```sql
CREATE TABLE raw_events (
    ingested_at  TimestampMillisecond NOT NULL TIME INDEX,   -- ingest time = baseline for append order
    project_id   String NOT NULL,
    entity_type  String NOT NULL,                            -- 'trace'|'observation'|'score'|'dataset_run_item'
    entity_id    String NOT NULL,                            -- business entity id (trace.id/observation.id/score.id)
    event_id     String NOT NULL,                            -- idempotency dedup key (unique id of the ingestion event)
    event_type   String NOT NULL,                            -- 'trace-create'|'generation-update'|...
    event_ts     TimestampMillisecond,                       -- event logical time (timestamp/startTime inside the body)
    body         String NOT NULL,                            -- raw JSON payload, stored verbatim
    PRIMARY KEY (project_id, entity_type, entity_id)
)
WITH (
    'append_mode' = 'true',
    'ttl' = '90d'                                            -- aligned with the current S3 event store retention, configurable
);
```

Design points:
- `PRIMARY KEY = (project_id, entity_type, entity_id)`: physically clusters all events of the same entity together, making **reprocess-by-entity replay efficient** (`WHERE project_id=? AND entity_type=? AND entity_id=?` sequential read).
- `ingested_at` as the time index: an append table stores in arrival order, which matches the reprocess order.
- `event_id` is used for idempotency: duplicate deliveries can be deduplicated on the worker side by `(project_id, event_id)` (an append table does not deduplicate automatically).
- `body` uses `String`, not `JSON`: the SoT must be stored verbatim and must not be rewritten by JSON normalization.
- Large payloads (except long input/output and multimodal) go directly into `body`, removing the need to relay through S3. Large multimodal blobs still go through media S3.

---

## 2. `traces` projection table

Maps `TraceDomain` (`packages/shared/src/domain/traces.ts`).

```sql
CREATE TABLE traces (
    timestamp    TimestampMillisecond NOT NULL TIME INDEX,   -- entity logical time (immutable)
    project_id   String NOT NULL,
    id           String NOT NULL,
    name         String,
    environment  String,
    session_id   String,
    user_id      String,
    release      String,
    version      String,
    tags         JSON,                                       -- storage/display only; filtering goes through the traces_tags sub-table (§5)
    metadata     JSON,                                       -- storage/display only; filtering goes through the traces_metadata sub-table (§5)
    bookmarked   Boolean,
    public       Boolean,
    input        String,                                     -- auto-compressed
    output       String,
    created_at   TimestampMillisecond,                       -- written only on the create event → last_non_null equivalent to min
    updated_at   TimestampMillisecond,                       -- written as now on every write → last_non_null equivalent to max
    is_deleted   Boolean DEFAULT false,
    PRIMARY KEY (project_id, id)
)
WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');
```

Field merge semantics (worker write conventions):

| Field | Write convention | last_non_null effect |
|---|---|---|
| name/session_id/user_id/release/version/bookmarked/public/input/output/metadata/tags | written if carried by the event, otherwise NULL | keeps the latest non-NULL per field, equivalent to CH argMax |
| timestamp | written on the create event, immutable | time index, does not participate in field merge |
| created_at | **written only on the create event**, left NULL on update | backfilled to the earliest value ≈ min ✅ |
| updated_at | **written as now on every event** | takes the last write ≈ max ✅ |
| is_deleted | written true on the delete event | see §5 open question (field vs OpType::Delete) |

---

## 3. `observations` projection table (the most complex)

Maps `ObservationSchema` (`packages/shared/src/domain/observations.ts`). Upside: the domain layer **already maintains flattened cost/usage aggregate columns**, which land directly in explicit columns; the long-tail map goes into JSON.

```sql
CREATE TABLE observations (
    start_time              TimestampMillisecond NOT NULL TIME INDEX,
    project_id              String NOT NULL,
    id                      String NOT NULL,
    type                    String,                          -- SPAN|GENERATION|AGENT|TOOL|...
    trace_id                String,
    parent_observation_id   String,
    environment             String,
    name                    String,
    level                   String,                          -- DEBUG|DEFAULT|WARNING|ERROR
    status_message          String,
    version                 String,
    end_time                TimestampMillisecond,
    completion_start_time   TimestampMillisecond,
    -- model
    provided_model_name     String,
    internal_model_id       String,
    model_parameters        JSON,
    -- io
    input                   String,
    output                  String,
    metadata                JSON,                            -- storage/display only; filtering goes through the observations_metadata sub-table (§5)
    -- flattened cost/usage (already present in domain)
    input_cost              DECIMAL(38, 12),
    output_cost             DECIMAL(38, 12),
    total_cost              DECIMAL(38, 12),
    input_usage             BIGINT,
    output_usage            BIGINT,
    total_usage             BIGINT,
    -- long-tail map kept in full (exact restoration + sumMap fallback)
    usage_details           JSON,
    cost_details            JSON,
    provided_usage_details  JSON,
    provided_cost_details   JSON,
    -- pricing tier
    usage_pricing_tier_id   String,
    usage_pricing_tier_name String,
    -- prompt
    prompt_id               String,
    prompt_name             String,
    prompt_version          INT,
    -- tools
    tool_definitions        JSON,                            -- Map(String,String) → JSON
    tool_calls              JSON,                            -- Array → JSON
    tool_call_names         JSON,
    created_at              TimestampMillisecond,            -- written only on create ≈ min
    updated_at              TimestampMillisecond,            -- written on every write ≈ max
    is_deleted              Boolean DEFAULT false,
    PRIMARY KEY (project_id, id)
)
WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');
```

- Whether `type` belongs in the PRIMARY KEY: CH puts `type` in second position of the ORDER BY (frequent filtering by type). GreptimeDB favors a lean pk, so the recommendation is to keep `type` as a regular column + skipping index and keep the pk as `(project_id, id)`. To be decided after a PoC validates filter-by-type performance. See §5.
- `latency`/`time_to_first_token`: in CH these are computed at query time via `date_diff` and not stored; the projection table likewise computes them at query time (`end_time - start_time`) rather than landing them in columns.

---

## 4. `scores` projection table

Maps `ScoreSchema` (`packages/shared/src/domain/scores.ts`).

```sql
CREATE TABLE scores (
    timestamp          TimestampMillisecond NOT NULL TIME INDEX,
    project_id         String NOT NULL,
    id                 String NOT NULL,
    name               String,
    environment        String,
    source             String,                               -- API|EVAL|ANNOTATION
    data_type          String,                               -- NUMERIC|CATEGORICAL|BOOLEAN|CORRECTION|TEXT
    value              DOUBLE,
    string_value       String,
    long_string_value  String,
    comment            String,
    metadata           JSON,                                 -- storage/display only; filtering goes through the scores_metadata sub-table (§5)
    -- references
    trace_id           String,
    observation_id     String,
    session_id         String,
    dataset_run_id     String,
    execution_trace_id String,
    author_user_id     String,
    config_id          String,
    queue_id           String,
    created_at         TimestampMillisecond,
    updated_at         TimestampMillisecond,
    is_deleted         Boolean DEFAULT false,
    PRIMARY KEY (project_id, id)
)
WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');
```

- Whether `name` belongs in the pk: CH puts `name` in the PRIMARY KEY (frequent grouping by name). Same as observations' type, the recommendation is to keep it as a regular column + index and keep the pk as `(project_id, id)`, to be decided after a PoC.

---

## 5. EAV filter sub-tables (metadata / tags)

Per §0.4, metadata/tags use dual-representation: the main table stores/displays as `JSON`, while filtering goes through the EAV sub-tables (independent indexable `String` columns).

Filter shapes (`clickhouse-filter.ts`): metadata = `=`/`contains`/`starts with`/`ends with` on the value of a given key; tags = `any of`/`none of`.

```sql
-- metadata sub-table (one each for traces/observations/scores; entity_id points to the corresponding entity id)
CREATE TABLE traces_metadata (
    timestamp   TimestampMillisecond NOT NULL TIME INDEX,   -- inherits the entity's logical time
    project_id  String NOT NULL,
    entity_id   String NOT NULL,
    "key"       String NOT NULL INVERTED INDEX,
    value       String SKIPPING INDEX,                       -- =/contains/starts/ends: index + LIKE
    is_deleted  Boolean DEFAULT false,
    PRIMARY KEY (project_id, entity_id, "key")
) WITH ('merge_mode'='last_non_null', 'sst_format'='flat');

-- tags sub-table
CREATE TABLE traces_tags (
    timestamp   TimestampMillisecond NOT NULL TIME INDEX,
    project_id  String NOT NULL,
    entity_id   String NOT NULL,
    tag         String NOT NULL INVERTED INDEX,
    is_deleted  Boolean DEFAULT false,
    PRIMARY KEY (project_id, entity_id, tag)
) WITH ('merge_mode'='last_non_null', 'sst_format'='flat');
```

- Filtering = semi-join: `... WHERE id IN (SELECT entity_id FROM traces_metadata WHERE "key"=? AND value LIKE ?)`.
- **Writes are fanned out by a GreptimeDB pipeline at ingest time** (VRL returns an array of objects to implement 1→N, splitting the metadata map / tags array into multiple rows; VRL experimental); the worker does not hand-write multi-table writes (see §6).
- Sub-table soft-delete follows the main table; the write amplification (one row per entry/tag) needs evaluation.
- The `value` index type is to be decided after a PoC: `=` uses equality lookup, `contains` may need `FULLTEXT INDEX`.
- tool_call_names (filtering by tool name): same pattern as tags, sub-tabled on demand, low priority.

## 6. GreptimeDB Pipeline (ingest-time ETL)

Make full use of the pipeline to declaratively express the worker's "format conversion / multi-table writes / EAV splitting / index building"; the worker keeps only the enrich that cannot be pushed down.

Capabilities (verified against `reference/pipeline/pipeline-config.md`):
- Field extraction: `json_path` / `simple_extract` / `json_parse` / `dissect` / `regex`
- Timestamps: `date` / `epoch`
- Type conversion + index declaration: `transform` (type + index: `inverted` / `skipping` / `fulltext`)
- **Field-based routing to multiple tables**: `dispatcher` (field → `table_suffix` + child pipeline)
- **1→N fan-out**: a `vrl` script returns an array of objects, one row per element (experimental)
- Complex logic: `vrl` (experimental)

Boundaries (what the pipeline cannot do): enrich that queries Postgres (cost/model/prompt) → worker; cross-record aggregation → Flow.

Two landing points:
1. **raw_events writes**: API raw event → pipeline extracts `entity_type/entity_id/event_type/event_ts` + stores `body` → `raw_events`.
2. **projection writes** (after worker enrich): enriched event → pipeline:
   - `dispatcher` routes by `event_type` to traces / observations / scores
   - `json_path`/`vrl` extract fields into projection-table columns + `transform` declares the index
   - `vrl` fan-out splits the metadata map / tags array into `*_metadata` / `*_tags` sub-table rows
   - writes the merge projection table

Layering result:
```
worker     : enrich only (queries Postgres, cannot be pushed down)
pipeline   : JSON→column extraction / type conversion / index building / routing by type / EAV fan-out
Flow       : cross-record second-level aggregation
storage engine : last_non_null merge / TTL / compaction
```

Risks: `vrl` + fan-out are experimental; debug with `dryrun_pipeline`. Pending 02 to confirm whether `@greptime/ingester` goes through the pipeline endpoint or HTTP log ingestion.

## 7. Open Questions (to be resolved by PoC / later detailed design)

1. **Whether the PRIMARY KEY includes type/name**: observations.type and scores.name are in CH's sort key. The trade-off between GreptimeDB's lean pk vs filter acceleration needs a benchmark.
2. **Index strategy**: id/trace_id/parent_observation_id use inverted/skipping index; full-text search on input/output/metadata uses `FULLTEXT INDEX WITH(analyzer=..., backend=...)` (analyzer/backend options TBD); how to index metadata key/value filtering (JSON column indexing capability to be validated).
3. **is_deleted: field vs `OpType::Delete`**. Field approach: queries uniformly carry `WHERE is_deleted = false`, simple but takes space. Real-delete approach: write a delete op, `filter_deleted` removes it automatically, more space-efficient but requires the SDK to support issuing delete ops. TBD.
4. **Partitioning**: whether to `PARTITION ON COLUMNS (project_id)` for multi-region horizontal split (large-tenant isolation), or rely only on automatic time partitioning.
5. **JSON experimental fallback**: if JSON filtering performance/stability falls short, metadata/tags degrade to `String` (serialized) + FTS, or key keys are flattened into columns.
6. **Correctness boundary of created_at ≈ min**: depends on "update events not writing created_at". Need to confirm that all worker write paths follow this convention (including reprocess and the OTEL path).
7. **enum column dictionary encoding**: confirm whether GreptimeDB `String` columnar storage is equivalent to CH `LowCardinality` for compression/filtering of low-cardinality enums.

---

## 8. Next Steps

- 02: detailed design of the ingestion write path (`@greptime/ingester` vs pipeline endpoint, pipeline config (dispatcher/transform/vrl fan-out), partial-row write conventions, reprocess, idempotency).
- 03: Flow second-level aggregation design (observation→trace cost/usage rollup, analytics_*, project_environments).
- 04: read-path query-builder rewrite (argMax→last_value, LIMIT BY→window, sumMap→flattened columns/JSON, FTS).
- PoC: create these tables + load data, validate 1/2/5/7 of §5.
