import { type GreptimeColumnMappings } from "./columnMappings";

/**
 * GreptimeDB column mappings for the dataset-run-items UI tables (04-read-path.md, P4). Mirror the
 * ClickHouse `mapDatasetRunItemsTable` / `mapDatasetRunsTable` UI mappings, but emit GreptimeDB
 * `dataset_run_items` projection columns.
 *
 * Two grains:
 *   - DATASET RUN ITEMS (alias `dri`): one filterable/orderable row per run item. Plain columns map
 *     to the projection directly; the score-rollup columns route to a correlated score-grain EXISTS
 *     by `trace_id` (each item row has a non-null trace_id), exactly like the traces/observations
 *     rollup mappings.
 *   - DATASET RUNS (alias `drm`): one row per run, produced by the `dataset_run_metrics` aggregation
 *     CTE which has NO per-row trace_id, so score filters cannot use a row-level trace-grain EXISTS.
 *     The runs reader handles score filters with a dedicated run-level EXISTS (scores joined to the
 *     run's traces via `dataset_run_items`); this mapping only carries the plain orderable columns.
 *
 * `eventTs` has no GreptimeDB projection column (`event_ts` only existed on the ClickHouse table as a
 * dedup tiebreak; the merged projection drops it) and maps to `created_at`.
 */
export const datasetRunItemsTableGreptimeColumnDefinitions: GreptimeColumnMappings =
  [
    { uiTableName: "Dataset Run ID", uiTableId: "datasetRunId", greptimeTableName: "dataset_run_items", greptimeSelect: "dataset_run_id", queryPrefix: "dri" }, // prettier-ignore
    { uiTableName: "Created At", uiTableId: "createdAt", greptimeTableName: "dataset_run_items", greptimeSelect: "created_at", queryPrefix: "dri" }, // prettier-ignore
    { uiTableName: "Event Timestamp", uiTableId: "eventTs", greptimeTableName: "dataset_run_items", greptimeSelect: "created_at", queryPrefix: "dri" }, // prettier-ignore
    { uiTableName: "Dataset Item ID", uiTableId: "datasetItemId", greptimeTableName: "dataset_run_items", greptimeSelect: "dataset_item_id", queryPrefix: "dri" }, // prettier-ignore
    { uiTableName: "Dataset", uiTableId: "datasetId", greptimeTableName: "dataset_run_items", greptimeSelect: "dataset_id", queryPrefix: "dri" }, // prettier-ignore
    { uiTableName: "Scores (numeric)", uiTableId: "agg_scores_avg", greptimeTableName: "scores", greptimeSelect: "trace_id", scoreGrain: { scoresColumn: "trace_id", outerPrefix: "dri", outerColumn: "trace_id" } }, // prettier-ignore
    { uiTableName: "Scores (categorical)", uiTableId: "agg_score_categories", greptimeTableName: "scores", greptimeSelect: "trace_id", scoreGrain: { scoresColumn: "trace_id", outerPrefix: "dri", outerColumn: "trace_id" } }, // prettier-ignore
  ];

export const datasetRunsTableGreptimeColumnDefinitions: GreptimeColumnMappings =
  [
    { uiTableName: "Dataset Run ID", uiTableId: "id", greptimeTableName: "dataset_run_items", greptimeSelect: "dataset_run_id", queryPrefix: "drm" }, // prettier-ignore
    { uiTableName: "Created At", uiTableId: "createdAt", greptimeTableName: "dataset_run_items", greptimeSelect: "dataset_run_created_at", queryPrefix: "drm" }, // prettier-ignore
  ];

/**
 * Experiments LIST pre-aggregation filter columns (experiment == dataset run). Bare columns (no
 * queryPrefix) so the filter factory emits unqualified predicates that resolve inside the single-table
 * `dataset_run_items` dedup-CTE scope. `metadata` and the score-aggregation columns are NOT here — the
 * LIST reader handles `dataset_run_metadata` as a JSON predicate and score filters as a run-level
 * EXISTS (the DRI projection has no metadata EAV / per-row score array).
 */
export const experimentsListGreptimeColumnDefinitions: GreptimeColumnMappings =
  [
    { uiTableName: "ID", uiTableId: "id", greptimeTableName: "dataset_run_items", greptimeSelect: "dataset_run_id" }, // prettier-ignore
    { uiTableName: "Name", uiTableId: "name", greptimeTableName: "dataset_run_items", greptimeSelect: "dataset_run_name" }, // prettier-ignore
    { uiTableName: "Description", uiTableId: "description", greptimeTableName: "dataset_run_items", greptimeSelect: "dataset_run_description" }, // prettier-ignore
    { uiTableName: "Dataset ID", uiTableId: "experimentDatasetId", greptimeTableName: "dataset_run_items", greptimeSelect: "dataset_id" }, // prettier-ignore
    { uiTableName: "Start Time", uiTableId: "startTime", greptimeTableName: "dataset_run_items", greptimeSelect: "dataset_run_created_at" }, // prettier-ignore
  ];

/**
 * Experiment ITEMS qualification score-filter columns (per-item, over the `item_dedup` CTE alias
 * `dd`). obs-level scores correlate to the item's ROOT observation (`observation_id`), trace-level to
 * the item's `trace_id` — both as self-contained score-grain EXISTS. `itemMetadata` (dataset item
 * metadata, JSON) and `eventMetadata` (root observation metadata EAV) are handled outside the factory
 * by the items reader, not here.
 */
export const experimentItemsGreptimeColumnDefinitions: GreptimeColumnMappings =
  [
    { uiTableName: "Scores (numeric)", uiTableId: "obs_scores_avg", greptimeTableName: "scores", greptimeSelect: "observation_id", scoreGrain: { scoresColumn: "observation_id", outerPrefix: "dd", outerColumn: "observation_id" } }, // prettier-ignore
    { uiTableName: "Scores (categorical)", uiTableId: "obs_score_categories", greptimeTableName: "scores", greptimeSelect: "observation_id", scoreGrain: { scoresColumn: "observation_id", outerPrefix: "dd", outerColumn: "observation_id" } }, // prettier-ignore
    { uiTableName: "Trace Scores (numeric)", uiTableId: "trace_scores_avg", greptimeTableName: "scores", greptimeSelect: "trace_id", scoreGrain: { scoresColumn: "trace_id", outerPrefix: "dd", outerColumn: "trace_id" } }, // prettier-ignore
    { uiTableName: "Trace Scores (categorical)", uiTableId: "trace_score_categories", greptimeTableName: "scores", greptimeSelect: "trace_id", scoreGrain: { scoresColumn: "trace_id", outerPrefix: "dd", outerColumn: "trace_id" } }, // prettier-ignore
  ];
