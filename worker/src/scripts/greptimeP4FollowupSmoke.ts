/**
 * Smoke test for the P4 systemic-gap follow-up reads (dataset/experiment + scattered CH-only UI
 * reads migrated to GreptimeDB). Run from the worker package:
 *   dotenv -e ../.env -- npx tsx src/scripts/greptimeP4FollowupSmoke.ts
 *
 * A1 coverage (this file grows with B / A2):
 *   - getTraceScoresForDatasetRuns / getScoresForExperimentItems: scores correlated to runs via DRI
 *     trace_id, no fan-out double count (a duplicate-id DRI must not duplicate a score).
 *   - getDatasetVersionTimestampsGreptime: max(created_at) / max(dataset_item_version).
 *   - getExperimentDatasetIdsGreptime: distinct dataset ids with optional start-time bound.
 *   - Bug2: scores datasetRunItemRunIds / datasetId / datasetItemIds filter -> reverse DRI EXISTS.
 *
 * Idempotent: deletes its own fixture (project_id = SMOKE_PROJECT) before and after.
 */
import {
  greptimeQuery,
  closeGreptimeConnections,
  getTraceScoresForDatasetRuns,
  getScoresForExperimentItems,
  getDatasetVersionTimestampsGreptime,
  getExperimentDatasetIds,
  getScoresGroupedByNameSourceType,
  type DatasetRunItemRecordInsertType,
  type ScoreRecordInsertType,
} from "@langfuse/shared/src/server";
import { GreptimeWriter, GreptimeTable } from "../services/GreptimeWriter";

const SMOKE_PROJECT = "smoke-p4-followup-0001";
const DS = "ds-p4f-1";
const RUN1 = "run-p4f-1";
const RUN2 = "run-p4f-2";
const now = Date.UTC(2026, 5, 11, 8, 0, 0);

let failures = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined && !ok ? ` -> ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cleanup = async () => {
  for (const table of [
    "dataset_run_items",
    "scores",
    "traces",
    "observations",
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

  // run-1: item-1(t1) written under TWO ids (dedup), item-2(t2). run-2: item-1(t3).
  writer.addToQueue(GreptimeTable.DatasetRunItems, dri({ id: "d1a", dataset_run_id: RUN1, dataset_item_id: "item-1", trace_id: "t1" })); // prettier-ignore
  writer.addToQueue(GreptimeTable.DatasetRunItems, dri({ id: "d1b", dataset_run_id: RUN1, dataset_item_id: "item-1", trace_id: "t1", created_at: now + 5000, dataset_item_version: now + 5000 })); // prettier-ignore
  writer.addToQueue(GreptimeTable.DatasetRunItems, dri({ id: "d2", dataset_run_id: RUN1, dataset_item_id: "item-2", trace_id: "t2" })); // prettier-ignore
  writer.addToQueue(GreptimeTable.DatasetRunItems, dri({ id: "d3", dataset_run_id: RUN2, dataset_item_id: "item-1", trace_id: "t3" })); // prettier-ignore

  // scores: t1 has quality(0.9)+sentiment(positive); t3 has quality(0.5). t2 has none.
  writer.addToQueue(
    GreptimeTable.Scores,
    score("sc1", "t1", "quality", 0.9, null),
  );
  writer.addToQueue(
    GreptimeTable.Scores,
    score("sc2", "t1", "sentiment", null, "positive"),
  );
  writer.addToQueue(
    GreptimeTable.Scores,
    score("sc3", "t3", "quality", 0.5, null),
  );

  await writer.flushAll(true);
  await sleep(500);

  // --- getTraceScoresForDatasetRuns ---
  const run1Scores = await getTraceScoresForDatasetRuns(SMOKE_PROJECT, [RUN1]);
  check(
    "traceScoresForDatasetRuns run1: 2 scores (no dedup double-count)",
    run1Scores.length === 2,
    run1Scores.map((s) => s.id),
  );
  check(
    "traceScoresForDatasetRuns run1: all tagged datasetRunId=RUN1",
    run1Scores.every((s) => s.datasetRunId === RUN1),
    run1Scores.map((s) => s.datasetRunId),
  );
  const bothRuns = await getTraceScoresForDatasetRuns(SMOKE_PROJECT, [
    RUN1,
    RUN2,
  ]);
  check(
    "traceScoresForDatasetRuns run1+run2: 3 rows (sc3 tagged run2)",
    bothRuns.length === 3 &&
      bothRuns.some((s) => s.id === "sc3" && s.datasetRunId === RUN2),
    bothRuns.map((s) => `${s.id}:${s.datasetRunId}`),
  );

  // --- getScoresForExperimentItems (experiment_id == dataset_run_id) ---
  const expScores = await getScoresForExperimentItems(SMOKE_PROJECT, [RUN1]);
  check(
    "scoresForExperimentItems run1: 2 scores tagged experimentId=RUN1",
    expScores.length === 2 &&
      expScores.every((s: any) => s.experimentId === RUN1),
    expScores.map((s: any) => `${s.id}:${s.experimentId}`),
  );

  // --- getDatasetVersionTimestampsGreptime ---
  const ver = await getDatasetVersionTimestampsGreptime({
    projectId: SMOKE_PROJECT,
    datasetId: DS,
    runId: RUN1,
  });
  check(
    "datasetVersionTimestamps run1: maxCreatedAt = now+5000",
    ver.maxCreatedAt?.getTime() === now + 5000,
    ver.maxCreatedAt?.toISOString(),
  );
  check(
    "datasetVersionTimestamps run1: maxDatasetItemVersion = now+5000",
    ver.maxDatasetItemVersion?.getTime() === now + 5000,
    ver.maxDatasetItemVersion?.toISOString(),
  );

  // --- getExperimentDatasetIds ---
  const dsIds = await getExperimentDatasetIds(SMOKE_PROJECT);
  check(
    "experimentDatasetIds: [DS]",
    dsIds.length === 1 && dsIds[0].experimentDatasetId === DS,
    dsIds,
  );
  const dsIdsBounded = await getExperimentDatasetIds(SMOKE_PROJECT, [
    {
      column: "startTime",
      operator: ">",
      value: new Date(now + ONE_DAY),
      type: "datetime",
    },
  ]);
  check(
    "experimentDatasetIds bounded (> now+1d): empty",
    dsIdsBounded.length === 0,
    dsIdsBounded,
  );

  // --- Bug2: datasetRunItemRunIds / datasetId / datasetItemIds reverse-EXISTS filters ---
  const byRun1 = await getScoresGroupedByNameSourceType({
    projectId: SMOKE_PROJECT,
    filter: [
      {
        column: "datasetRunItemRunIds",
        operator: "any of",
        value: [RUN1],
        type: "stringOptions",
      },
    ],
  });
  check(
    "Bug2 datasetRunItemRunIds=[RUN1]: {quality, sentiment}",
    byRun1.length === 2 &&
      new Set(byRun1.map((r) => r.name)).size === 2 &&
      byRun1.every((r) => ["quality", "sentiment"].includes(r.name)),
    byRun1.map((r) => r.name),
  );
  const byRun2 = await getScoresGroupedByNameSourceType({
    projectId: SMOKE_PROJECT,
    filter: [
      {
        column: "datasetRunItemRunIds",
        operator: "any of",
        value: [RUN2],
        type: "stringOptions",
      },
    ],
  });
  check(
    "Bug2 datasetRunItemRunIds=[RUN2]: {quality} only",
    byRun2.length === 1 && byRun2[0].name === "quality",
    byRun2.map((r) => r.name),
  );
  const byDataset = await getScoresGroupedByNameSourceType({
    projectId: SMOKE_PROJECT,
    filter: [
      {
        column: "datasetId",
        operator: "any of",
        value: [DS],
        type: "stringOptions",
      },
    ],
  });
  check(
    "Bug2 datasetId=[DS]: all 3 score names present",
    new Set(byDataset.map((r) => r.name)).size === 2,
    byDataset.map((r) => r.name),
  );
  const byItem = await getScoresGroupedByNameSourceType({
    projectId: SMOKE_PROJECT,
    filter: [
      {
        column: "datasetItemIds",
        operator: "any of",
        value: ["item-2"],
        type: "stringOptions",
      },
    ],
  });
  check(
    "Bug2 datasetItemIds=[item-2]: none (t2 has no scores)",
    byItem.length === 0,
    byItem.map((r) => r.name),
  );

  await cleanup();
  await closeGreptimeConnections();
  console.log(failures === 0 ? "\nALL GREEN" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

const ONE_DAY = 24 * 60 * 60 * 1000;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
