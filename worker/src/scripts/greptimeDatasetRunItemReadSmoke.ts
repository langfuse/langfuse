/**
 * Smoke test for the GreptimeDB dataset-run-items READ path (04-read-path.md, P4).
 * Run from the worker package:
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeDatasetRunItemReadSmoke.ts
 *
 * Seeds dataset_run_items + observations + scores directly via GreptimeWriter, then asserts the
 * domain results of the migrated read functions against the local openfuse database:
 *   - dedup contract: a logical item written under TWO ids collapses to one (count + rows).
 *   - runs metrics: countRunItems / avgLatency / totalCost / aggScores (trace-level join).
 *   - multi-run intersection, by-trace lookup, hasAny, count-by-interval.
 *   - per-entity delete by dataset_run_id.
 *   - dashboard experiment relation: the DISTINCT dataset_run_items join groups cost by experiment
 *     WITHOUT fan-out double-counting (the duplicate-id item must not double the run's cost).
 *
 * Idempotent: deletes its own fixture (project_id = SMOKE_PROJECT) before and after.
 */
import {
  greptimeQuery,
  closeGreptimeConnections,
  getDatasetRunsTableMetricsCh,
  getDatasetRunsTableCountCh,
  getDatasetRunsTableRowsCh,
  getDatasetRunItemsCh,
  getDatasetRunItemsCountCh,
  getDatasetItemIdsWithRunData,
  getDatasetItemIdsByTraceIdCh,
  hasAnyDatasetRunItem,
  getDatasetRunItemCountsByProjectInCreationInterval,
  deleteDatasetRunItemsByDatasetRunIds,
  type DatasetRunItemRecordInsertType,
  type ObservationRecordInsertType,
  type ScoreRecordInsertType,
} from "@langfuse/shared/src/server";
import { GreptimeWriter, GreptimeTable } from "../services/GreptimeWriter";

const SMOKE_PROJECT = "smoke-dri-read-0001";
const DS = "ds-read-1";
const RUN1 = "run-read-1";
const RUN2 = "run-read-2";
const now = Date.UTC(2026, 5, 10, 8, 0, 0);

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined && !ok ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cleanup = async () => {
  for (const table of [
    "dataset_run_items",
    "observations",
    "scores",
    "traces",
  ]) {
    await greptimeQuery({
      query: `DELETE FROM \`${table}\` WHERE \`project_id\` = ?`,
      params: [SMOKE_PROJECT],
    });
  }
};

const dri = (
  o: Partial<DatasetRunItemRecordInsertType> & {
    id: string;
    dataset_run_id: string;
    dataset_item_id: string;
    trace_id: string;
  },
): DatasetRunItemRecordInsertType => ({
  project_id: SMOKE_PROJECT,
  observation_id: undefined,
  dataset_id: DS,
  dataset_run_name: o.dataset_run_id === RUN1 ? "run-one" : "run-two",
  dataset_run_description: "smoke",
  dataset_run_metadata: { kind: "smoke" },
  dataset_item_input: JSON.stringify({ q: "x" }),
  dataset_item_expected_output: JSON.stringify({ a: "y" }),
  dataset_item_metadata: { d: "easy" },
  is_deleted: 0,
  error: undefined,
  created_at: now,
  updated_at: now,
  event_ts: now,
  dataset_run_created_at: now,
  dataset_item_version: now,
  ...o,
});

const obs = (
  id: string,
  traceId: string,
  cost: number,
): ObservationRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  trace_id: traceId,
  type: "GENERATION",
  environment: "default",
  name: "gen",
  level: "DEFAULT",
  start_time: now,
  end_time: now + 1000,
  metadata: {},
  provided_model_name: "gpt-4o",
  internal_model_id: "m1",
  model_parameters: "{}",
  provided_usage_details: { input: 10, output: 20 },
  usage_details: { input: 10, output: 20, total: 30 },
  provided_cost_details: {},
  cost_details: { input: cost / 2, output: cost / 2, total: cost },
  total_cost: cost,
  input: "{}",
  output: "{}",
  tool_definitions: {},
  tool_calls: [],
  tool_call_names: [],
  created_at: now,
  updated_at: now,
  event_ts: now,
  is_deleted: 0,
});

const score = (
  id: string,
  traceId: string,
  name: string,
  numeric: number | null,
  categorical: string | null,
): ScoreRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  trace_id: traceId,
  observation_id: null,
  timestamp: now,
  name,
  value: numeric ?? 0,
  source: "API",
  data_type: categorical ? "CATEGORICAL" : "NUMERIC",
  environment: "default",
  string_value: categorical,
  long_string_value: "",
  comment: null,
  metadata: {},
  created_at: now,
  updated_at: now,
  event_ts: now,
  is_deleted: 0,
});

async function main() {
  await cleanup();
  const writer = GreptimeWriter.getInstance();

  // dataset_run_items: run-1 has item-1(t1) + item-2(t2); run-2 has item-1(t3).
  // dedup duplicate: item-1 of run-1 written under a second id with a newer created_at.
  writer.addToQueue(
    GreptimeTable.DatasetRunItems,
    dri({
      id: "dri-1a",
      dataset_run_id: RUN1,
      dataset_item_id: "item-1",
      trace_id: "t1",
    }),
  );
  writer.addToQueue(
    GreptimeTable.DatasetRunItems,
    dri({
      id: "dri-1b",
      dataset_run_id: RUN1,
      dataset_item_id: "item-1",
      trace_id: "t1",
      created_at: now + 5000,
    }),
  );
  writer.addToQueue(
    GreptimeTable.DatasetRunItems,
    dri({
      id: "dri-2",
      dataset_run_id: RUN1,
      dataset_item_id: "item-2",
      trace_id: "t2",
    }),
  );
  writer.addToQueue(
    GreptimeTable.DatasetRunItems,
    dri({
      id: "dri-3",
      dataset_run_id: RUN2,
      dataset_item_id: "item-1",
      trace_id: "t3",
    }),
  );

  // observations: one per trace (trace-level latency 1s, cost 0.10/0.20/0.30).
  writer.addToQueue(GreptimeTable.Observations, obs("o1", "t1", 0.1));
  writer.addToQueue(GreptimeTable.Observations, obs("o2", "t2", 0.2));
  writer.addToQueue(GreptimeTable.Observations, obs("o3", "t3", 0.3));

  // scores on t1: numeric quality=0.9 + categorical sentiment=positive.
  writer.addToQueue(
    GreptimeTable.Scores,
    score("sc1", "t1", "quality", 0.9, null),
  );
  writer.addToQueue(
    GreptimeTable.Scores,
    score("sc2", "t1", "sentiment", null, "positive"),
  );

  await writer.flushAll(true);
  await sleep(500);

  // 1. dedup: distinct logical (run,item) = 3 (the duplicate id collapses).
  const itemCount = await getDatasetRunItemsCountCh({
    projectId: SMOKE_PROJECT,
    datasetId: DS,
    filter: [],
  });
  check("item count dedup = 3 (not 4)", itemCount === 3, itemCount);

  const items = await getDatasetRunItemsCh({
    projectId: SMOKE_PROJECT,
    datasetId: DS,
    filter: [],
  });
  check("item rows dedup = 3", items.length === 3, items.length);
  // JSON metadata + string IO must survive passing through the ROW_NUMBER dedup subquery
  // (the inner subquery selects the bare JSON column; the outer json_to_string serializes it).
  const item2 = items.find((i) => i.datasetItemId === "item-2");
  check(
    "item datasetRunMetadata round-trips through dedup subquery",
    (item2?.datasetRunMetadata as Record<string, unknown> | null)?.kind ===
      "smoke",
    item2?.datasetRunMetadata,
  );
  check(
    "item datasetItemInput string round-trips through dedup subquery",
    typeof item2?.datasetItemInput === "string" &&
      (item2.datasetItemInput as string).includes("x"),
    item2?.datasetItemInput,
  );

  // 2. runs metrics
  const metrics = await getDatasetRunsTableMetricsCh({
    projectId: SMOKE_PROJECT,
    datasetId: DS,
    filter: [],
  });
  check("two runs in metrics", metrics.length === 2, metrics.length);
  const run1 = metrics.find((m) => m.id === RUN1);
  const run2 = metrics.find((m) => m.id === RUN2);
  check(
    "run-1 countRunItems = 2",
    run1?.countRunItems === 2,
    run1?.countRunItems,
  );
  check(
    "run-1 totalCost = 0.30 (no fan-out from duplicate)",
    approx(run1?.totalCost.toNumber() ?? -1, 0.3),
    run1?.totalCost.toString(),
  );
  check(
    "run-1 avgLatency = 1.0s",
    approx(run1?.avgLatency ?? -1, 1.0, 1e-3),
    run1?.avgLatency,
  );
  check(
    "run-1 aggScoresAvg has quality 0.9",
    (run1?.aggScoresAvg ?? []).some(
      ([n, v]) => n === "quality" && approx(v, 0.9),
    ),
    run1?.aggScoresAvg,
  );
  check(
    "run-1 aggScoreCategories has sentiment:positive",
    (run1?.aggScoreCategories ?? []).includes("sentiment:positive"),
    run1?.aggScoreCategories,
  );
  check(
    "run-2 countRunItems = 1",
    run2?.countRunItems === 1,
    run2?.countRunItems,
  );

  // 3. rows + count
  const runRows = await getDatasetRunsTableRowsCh({
    projectId: SMOKE_PROJECT,
    datasetId: DS,
    filter: [],
  });
  check("runs rows = 2", runRows.length === 2, runRows.length);
  check(
    "run-1 row name + metadata",
    runRows.some(
      (r) =>
        r.id === RUN1 && r.name === "run-one" && r.metadata.includes("smoke"),
    ),
    runRows.find((r) => r.id === RUN1),
  );
  const runCount = await getDatasetRunsTableCountCh({
    projectId: SMOKE_PROJECT,
    datasetId: DS,
    filter: [],
  });
  check("runs count = 2", runCount === 2, runCount);

  // 4. multi-run intersection: item-1 in BOTH runs, item-2 only run-1.
  const intersection = await getDatasetItemIdsWithRunData({
    projectId: SMOKE_PROJECT,
    datasetId: DS,
    runIds: [RUN1, RUN2],
    filterByRun: [],
  });
  check(
    "intersection = [item-1] only",
    intersection.length === 1 && intersection[0] === "item-1",
    intersection,
  );

  // 5. by-trace lookup
  const byTrace = await getDatasetItemIdsByTraceIdCh({
    projectId: SMOKE_PROJECT,
    traceId: "t1",
    filter: [{ column: "datasetId", operator: "=", value: DS, type: "string" }],
  });
  check(
    "by-trace t1 -> item-1",
    byTrace.length === 1 && byTrace[0].id === "item-1",
    byTrace,
  );

  // 6. existence + analytics
  check("hasAny = true", (await hasAnyDatasetRunItem(SMOKE_PROJECT)) === true);
  const interval = await getDatasetRunItemCountsByProjectInCreationInterval({
    start: new Date(now - 60_000),
    end: new Date(now + 60_000),
  });
  const projCount = interval.find((r) => r.projectId === SMOKE_PROJECT);
  check("count-by-interval = 3", projCount?.count === 3, projCount);

  // 7. dashboard experiment relation: cost grouped by experiment WITHOUT fan-out double-count.
  const expRows = await greptimeQuery<{
    entity_dimension: string;
    sum_totalcost: string | number;
  }>({
    query: `
      SELECT dri.experiment_name AS entity_dimension, sum(o.total_cost) AS sum_totalCost
      FROM observations o
      INNER JOIN (SELECT DISTINCT project_id, trace_id, dataset_run_id AS experiment_id,
        dataset_run_name AS experiment_name, dataset_id AS experiment_dataset_id
        FROM dataset_run_items WHERE is_deleted = false) dri
        ON o.project_id = dri.project_id AND o.trace_id = dri.trace_id
      WHERE o.project_id = :projectId AND o.is_deleted = false
      GROUP BY dri.experiment_name`,
    params: { projectId: SMOKE_PROJECT },
    readOnly: true,
  });
  const expOne = expRows.find((r) => r.entity_dimension === "run-one");
  check(
    "experiment run-one cost = 0.30 (DISTINCT join, no fan-out)",
    approx(Number(expOne?.sum_totalcost ?? -1), 0.3),
    expRows,
  );

  // 8. per-entity delete by dataset_run_id
  await deleteDatasetRunItemsByDatasetRunIds({
    projectId: SMOKE_PROJECT,
    datasetId: DS,
    datasetRunIds: [RUN2],
  });
  await sleep(300);
  const afterDelete = await getDatasetRunsTableCountCh({
    projectId: SMOKE_PROJECT,
    datasetId: DS,
    filter: [],
  });
  check("after delete run-2: runs count = 1", afterDelete === 1, afterDelete);

  await cleanup();
  await writer.shutdown();
  await closeGreptimeConnections();

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
