# Detailed Design 04: Read Path ClickHouse → GreptimeDB

> Based on 00/01/02. Scope: **all** of the read path, **hard swap** (repository/service
> internals move CH → GreptimeDB in place, keeping public signatures; correctness backed by a
> CH-vs-GreptimeDB parity harness, not a long-lived product dual-read switch).
>
> **Status (2026-06-13): P0–P2 implemented and merged/in-PR. P3–P4 remaining.**
>
> | Phase | Scope | State |
> |---|---|---|
> | P0a | Read-path inventory (this doc) | done |
> | P0b | Dialect + row contract (`greptime/sql/*`, streaming, FTS) | done |
> | P1 | Core entity reads (traces/observations/scores ~50 fns) | merged (PR #3) |
> | P2 | UI rollup reads: traces/sessions/observations tables + dashboards + environments | PR #4 |
> | P3 | events V4 (`*FromEvents`) + `dashboard.executeQuery` (V2 widgets) | TODO |
> | P4 | dataset-run-items reads, daily-metrics, GAP-INFRA tables | TODO |
> | P7 | CH-client cutover (delete CH reads per call-site inventory) | TODO |
>
> The CH-vs-GreptimeDB parity harness mentioned below was **superseded**: GreptimeDB is the
> source of truth (fresh install only, no CH upgrade), so verification is seed → assert domain
> results + unit tests + live smokes (`worker/src/scripts/greptime*Smoke.ts`), not CH parity.
> **Known narrowing:** dashboard cost/usage **by-type** is limited to the `input/output/total`
> known keys (GreptimeDB cannot enumerate dynamic JSON map keys in SQL).

## P0a — Read Path Inventory

### Routing: how the app picks legacy tables vs the v4 event-log

There are **two parallel CH read architectures**, selected **per call-site** (no single switch):
- **(A) legacy normalized tables** `traces`/`observations`/`scores`, merged on read via
  `FINAL` / `ORDER BY event_ts DESC LIMIT 1 BY id` / `argMaxIf`.
- **(B) v4 event-log** `events_full` (immutable full-fidelity span rows) + `events_core`
  (truncated query-optimized projection via materialized view), driven by
  `clickhouse-sql/event-query-builder.ts` (`EventsQueryBuilder` …) and `query-fragments.ts`.

Selection (3 layers):
1. env `LANGFUSE_MIGRATION_V4_WRITE_MODE` ∈ `{legacy, dual, events_only}`
   (`packages/shared/src/env.ts:286`, `web/src/env.mjs:429`, `worker/src/env.ts:463`),
   gated by `LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN`.
2. per-user `User.v4BetaEnabled`.
3. resolver `web/src/server/auth.ts:855-860` → forced `true` in `events_only`, user choice in
   `dual`, else `false`. Default live path = **(A) legacy**; v4 endpoints are opt-in/preview.

Per-surface routing edge (the boolean is passed down; no in-query branch): public API v1
observations `web/src/pages/api/public/observations/index.ts:49` (`if query.useEventsTable`);
public API v2 observations **always events** `…/v2/observations/index.ts:52`; sessions tRPC
parallel `*FromEvents` procedures (`web/src/server/api/routers/sessions.ts:162,234,330,439`);
comments `…/routers/comments.ts:316,355`; dashboards `dataModel.ts:322,1386` base CTE =
`events_core`; health `health-service.ts:49` (env-driven).

### Core conclusion

**No user-facing read surface needs `raw_events`-replay or a new event-grained GreptimeDB
projection.** Every `events_core`/`events_full` consumer — including batch export, evals,
public v2 observations, and all three Codex-flagged sites — reads **merged current state**,
which the GreptimeDB `traces`/`observations`/`scores` projection (+ `*_metadata`/`*_tags` EAV)
already serves. `raw_events` stays a write-side / source-of-truth concern. The (B) event-log is
collapsed onto the merged projection, not ported.

Targets: **projection** = read merged GreptimeDB table, drop `FINAL`/`LIMIT 1 BY`/`argMax`;
**projection+EAV** = + project-scoped `EXISTS` metadata/tag semi-join; **GAP** = needs new
GreptimeDB schema/work; **infra** = operational table outside the analytics projection.

### Read surface → target (representative; full call-site list below the table)

| Surface | Representative files (file:line) | CH source | Target |
|---|---|---|---|
| Trace detail by id | `repositories/traces.ts:267,604`; events `events.ts:1055` | A `traces` / B agg | projection |
| Trace list / UI table | `services/traces-ui-table-service.ts:206,468,537`; events via `dataModel.ts:322` | A `traces`+joins FINAL / B events_core | projection+EAV |
| Trace groupings (name/session/user/tags) | `repositories/traces.ts:675,752,829,885` | A `traces` | projection (+EAV for tags) |
| Observation detail by id | `repositories/observations.ts:446,516`; events `events.ts:935` | A `observations` / B | projection |
| Observations for trace | `repositories/observations.ts:194`; `eventsRouter.ts:271` | A/B | projection |
| Observation list / UI table | `repositories/observations.ts:872`; events `events.ts:1378`, `eventsService.ts:115,234` | A/B split | projection+EAV |
| Observation groupings / cost-latency rollups | `repositories/observations.ts:918-1177,1235,1577,1621,1693` | A `observations` (some FINAL) | projection |
| Scores list / UI | `repositories/scores.ts:1243`; events `:1448` | A `scores` / B | projection+EAV |
| Scores for traces/obs/sessions, groupings, histogram | `repositories/scores.ts:269,557,696,838-2009` | A `scores` (some FINAL) | projection |
| Sessions list/metrics | `services/sessions-ui-table-service.ts:407`; events `sessions-ui-table-events-service.ts:89,338` | A/B agg | projection |
| Dashboards (repo) | `repositories/dashboards.ts:77,162,260` | A | projection |
| Dashboards (universal builder) | `features/query/server/queryExecutor.ts:112,128`; `dataModel.ts:322,1386,893,900` | B events_core base CTE | projection+EAV |
| Daily metrics / environments / score-analytics | `daily-metrics.ts:121,199`; `environments.ts:34`; `score-analytics/.../buildEstimateQuery.ts:95` (CH `SAMPLE`) | A | projection (no `SAMPLE` equiv) |
| Public API v1 obs/traces | `repositories/observations.ts:2203,2246`; `events.ts:1417,1474,1734` | A/B (flag) | projection+EAV |
| Public API v2 observations | `…/v2/observations/index.ts:52` → `events.ts:1474` (field groups + expandMetadata) | B split | projection+EAV |
| Public API scores v1/v3, trace count | `scores.ts:2512,2611,2999`; `traces.ts:2129,2223` | A | projection |
| Evals / experiments | `events.ts:856`; `repositories/experiments.ts:200,364,467,678,1058,1202` | A/B | projection+EAV |
| Blob/analytics export streams | `traces.ts:1428,1493`; `observations.ts:1860,1943`; `scores.ts:2065,2150`; events `events.ts:3501` | A streams (FINAL) / B | projection(+EAV) via `greptimeQueryStream` |
| Batch export events stream | `worker/.../database-read-stream/event-stream.ts:148` (EventsQueryBuilder, full IO+metadata) | B events_full | projection+EAV (merged span IO/metadata + scores join) |
| Health recency probe | `health-service.ts:61,92,108` | A/B | projection (or `raw_events.event_ts`) |
| **Dataset runs / items** | `dataset-run-items.ts:480,886,1034,1094,1220`; `dataset-items.ts:1727`; `worker/.../experimentServiceClickhouse.ts:55` | A `dataset_run_items_rmt`,`dataset_run_metrics` | **GAP** (no GreptimeDB table — P4-DRI) |
| Blob-storage log / S3 refs | `repositories/blobStorageLog.ts:*` (`blob_storage_file_log`, `event_log`) | A | **infra** (keep / separate decision) |
| Worker cleaners, query tracking | retention/project/deleted-mask cleaners; `clickhouse/queryTracking.ts` (`system.*`) | A/B + CH system | **infra** (TTL/`deletion.ts` replace; CH-mechanics dead) |

The three Codex-flagged sites all resolve to **projection+EAV**, not raw_events:
- `event-stream.ts:148` — `EventsQueryBuilder("export")` with full IO + expanded metadata +
  scores join + `limitBy(span_id)`; the `limitBy` dedup is free from the merged projection.
- `health-service.ts:49` — pure "any row in last 3 min" recency probe; the `events_only`
  branch exists only because legacy tables aren't written in that mode — on GreptimeDB the
  projection is always written, so the branch collapses.
- `v2/observations/index.ts:52` — field-group + `expandMetadata` selection over the
  events_core→events_full split (an IO optimization); maps to projection columns +
  `observations_metadata`.

### Write / delete inventory (drives P7 cutover + surfaces a NEW gap)

Ingestion writes already dual-write GreptimeDB (`GreptimeWriter`) and are
**dead-after-read-swap**: `ClickhouseWriter` (`worker/src/services/ClickhouseWriter/index.ts`),
`IngestionService` CH projection writes (`…/IngestionService/index.ts:407,609,693,898,906`),
the events_full MV-fill `eventPropagation/handleEventPropagationJob.ts:134,179`,
`deleted-mask-cleaner` (CH lightweight-delete mask mechanics), and the batch retention/project
cleaners (replaced by `raw_events` TTL + `greptime/deletion.ts`).

**GAP-MUT (new, correctness-blocking — not in the approved plan).** `GreptimeWriter` covers
only the **ingestion** path. The tRPC **mutation** writes have **no GreptimeDB path**:
- `upsertTrace` (`repositories/traces.ts:213`) — bookmark / public toggle
  (`web/src/server/api/routers/traces.ts:524-533,590-599`, read-merge-write to CH `traces`).
- `updateEvents` (`repositories/events.ts:1849`) — ALTER `events_full`/`events_core`
  for the same toggles.
- `upsertScore` (`repositories/scores.ts:170`) — manual / annotation score CRUD
  (`web/.../routers/scores.ts:588,714,817,1004`).
Under a hard read-swap these write soon-to-be-deleted CH and never reach the GreptimeDB
projection → UI edits silently lost. **Resolution options (decision needed):** (a) emit a
synthetic `*-update` event into `raw_events` and let the existing merge/replay rebuild the
projection (keeps the SoT complete + replay-consistent — preferred, reuses 02); (b) write the
projection (+EAV) directly via `GreptimeWriter`; (c) route the UI mutation through the normal
ingestion event flow. This is its own workstream, gating the swap of any surface whose state is
mutated post-ingestion.

**Deletion-wiring gaps to verify** (`ingestionFileDeletion.ts` only tombstones trace+score in
GreptimeDB): observations-under-deleted-trace and scores-by-trace GreptimeDB cleanup must be
confirmed invoked (the comment claims "own deletion path") — else stale projection rows.

**Still-needed / not-dead:** `blob_storage_file_log` / `event_log` S3 ref bookkeeping
(`blobStorageLog.ts`, gated by `LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG`); the internal-tracing
writer object + root-event-record callback (`internal-tracing/createInternalEventsWriter.ts:46`,
load-bearing for experiment eval scheduling even when its CH write is off — repoint to
GreptimeDB, don't delete); `batch-trace-deletion-cleaner` orchestrator (Postgres-driven).

**CH-client deletion blockers (P7):** all remaining are **reads** still on CH —
`experimentServiceClickhouse.ts:55`, `handleExperimentBackfill.ts` (3 reads),
`queryTracking.ts` (`system.*` introspection) — plus the GAP-MUT mutation writes. Delete the CH
client only when the inventory hits zero CH reads **by call-site**, never by module name.

### GAP summary

1. **GAP-DRI** — dataset-run-items (`dataset_run_items_rmt`/`dataset_run_metrics`): no GreptimeDB
   table or write path (02 excluded it). **DECIDED + WRITE PATH DONE (mini-02):** GreptimeDB
   `dataset_run_items` projection (`greptime/migrations/0003_dataset_run_items.sql`, applied to
   `openfuse`; merge_mode=last_non_null, PK (project_id,id), TIME INDEX = `dataset_run_created_at`
   for replay stability, metadata as JSON / no EAV) + `GreptimeTable.DatasetRunItems` writer
   branch (`GreptimeWriter/index.ts`) + `processDatasetRunItemEventList` `greptimeWriter?.addToQueue`
   (`IngestionService/index.ts:500`) + `deleteProjectFromGreptime` wipe (`deletion.ts`). raw_events
   already carries the event (`rawEvents.ts:17`). Verified: `greptimeDatasetRunItemSmoke.ts` 10/10.
   **Remaining (P4):** migrate dataset-run-items *reads* off CH; per-entity DRI deletion follow-up.
2. **GAP-MUT** — post-ingestion mutation writes (bookmark/public/manual-score). **DECIDED:
   faithful replica of current CH semantics** = direct projection(+EAV) write via `GreptimeWriter`
   (immediate read-after-write visibility) **+** a `raw_events` append of the same full-row
   `*-create`-type synthetic event (SoT / replay durability). This mirrors exactly what
   `upsertClickhouse` does today (`clickhouse.ts:182-205`: S3 event-store append + direct CH
   insert). The pure async synthetic-event path is rejected — it would regress immediate
   visibility to eventual consistency.
3. **GAP-DEL** — verify observation/score-by-trace GreptimeDB deletion is wired.
4. **GAP-INFRA** — `blob_storage_file_log`, `event_log`, `system.*`, CH `SAMPLE`
   (score-analytics estimate): operational; keep, replace, or drop out of analytics scope.
5. **GAP-SEED** — the seeder (`packages/shared/scripts/seeder/`) has **zero** GreptimeDB
   awareness (direct CH inserts, bypasses `IngestionService`). The P0c parity harness needs it
   to emit a `raw_events` stream and drive `IngestionService.mergeAndWrite(rebuildFromHistory)`
   so GreptimeDB projections are built by production code, not a third hand-written mapping.

### Inventory impact on the plan

- (B) event-log handling in P3/P5 is **collapse-onto-projection**, confirmed not a port.
- **GAP-MUT is new scope** and should land as its own pre-/co-requisite workstream (likely
  before P1 surfaces whose state is user-mutated), not silently inside a read phase.
- P0c parity harness depends on GAP-SEED being addressed first.
- P4-DRI and the GAP-INFRA tables stay explicitly scoped (decide, don't drift).
