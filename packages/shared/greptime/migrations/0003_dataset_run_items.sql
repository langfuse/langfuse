-- GreptimeDB projection for dataset_run_items (04-read-path.md, GAP-DRI mini-02).
--
-- 02 deliberately scoped the write path to trace/observation/score. dataset_run_items already
-- flow through ingestion as `dataset_run_item-create` events and land in raw_events
-- (entity_type='dataset_run_item'), but had no projection table and no GreptimeWriter branch, so
-- their reads could not leave ClickHouse. This adds the merge projection so 04 can migrate them
-- and ClickHouse can be cut entirely.
--
-- Mirrors the ClickHouse `dataset_run_items_rmt` table
-- (clickhouse/migrations/*/0024_dataset_run_items.up.sql), enriched from Postgres at write time
-- (IngestionService.processDatasetRunItemEventList: run name/description/metadata + item
-- input/expected_output/metadata).
--
-- Conventions (same as 0001_init.sql):
--   - merge_mode=last_non_null + sst_format=flat; one row per (project_id, id).
--   - PRIMARY KEY = (project_id, id). CH ORDER BY also carried dataset_id/dataset_run_id for query
--     locality; here those are regular columns (filtered via index, not PK).
--   - TIME INDEX = dataset_run_created_at: the run's immutable Postgres creation time. It is stable
--     across replays (the run does not change), satisfying the projection's single-time-index
--     invariant (02 invariant 2) — unlike created_at, which falls back to now() when the event body
--     omits it and would diverge per replay.
--   - metadata is stored as JSON for display only. dataset-run-item reads filter by
--     run/item/trace ids, not metadata keys, so no EAV subtable is created here; add one later if a
--     metadata-key filter surfaces in 04.
--
-- Apply: mysql -h127.0.0.1 -P4002 -uroot openfuse < 0003_dataset_run_items.sql

CREATE TABLE IF NOT EXISTS dataset_run_items (
    `dataset_run_created_at`       TIMESTAMP(3) NOT NULL TIME INDEX,  -- immutable run creation time
    `project_id`                   STRING NOT NULL,
    `id`                           STRING NOT NULL,
    -- DRI reads filter heavily by dataset / run / item / trace id (repositories/dataset-run-items.ts);
    -- the lean PK (project_id,id) alone would force project-wide scans, so these get skipping (bloom)
    -- indexes to prune granules on equality filters (CH had ORDER BY (project_id,dataset_id,
    -- dataset_run_id,id) + a dataset_item_id bloom index).
    `dataset_id`                   STRING SKIPPING INDEX,
    `dataset_run_id`               STRING SKIPPING INDEX,
    `dataset_item_id`              STRING SKIPPING INDEX,
    `trace_id`                     STRING SKIPPING INDEX,
    `observation_id`               STRING,
    `error`                        STRING,
    -- denormalized run fields (immutable)
    `dataset_run_name`             STRING,
    `dataset_run_description`      STRING,
    `dataset_run_metadata`         JSON,
    -- denormalized item fields (snapshot at run time)
    `dataset_item_input`           STRING,
    `dataset_item_expected_output` STRING,
    `dataset_item_metadata`        JSON,
    `dataset_item_version`         TIMESTAMP(3),                      -- item validFrom snapshot
    `created_at`                   TIMESTAMP(3),
    `updated_at`                   TIMESTAMP(3),
    `is_deleted`                   BOOLEAN DEFAULT false,
    PRIMARY KEY (`project_id`, `id`)
)
WITH ('merge_mode' = 'last_non_null', 'sst_format' = 'flat');
