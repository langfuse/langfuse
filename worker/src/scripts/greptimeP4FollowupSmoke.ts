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
  getObservationsWithPromptName,
  getObservationMetricsForPrompts,
  getObservationsGroupedByTraceId,
  getCostByEvaluatorIds,
  getAgentGraphData,
  getExperimentNamesFromEvents,
  getExperimentMetricsFromEvents,
  getExperimentItemsFilterOptions,
  getExperimentScoreOptions,
  getExperimentItemsBatchIO,
  getExperimentsFromEvents,
  getExperimentsCountFromEvents,
  getExperimentItemsFromEvents,
  getExperimentItemsCountFromEvents,
  type DatasetRunItemRecordInsertType,
  type ScoreRecordInsertType,
  type ObservationRecordInsertType,
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
  extra: { observationId?: string; datasetRunId?: string } = {},
): ScoreRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  trace_id: traceId,
  observation_id: extra.observationId ?? null,
  dataset_run_id: extra.datasetRunId,
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

const genObs = (id: string, traceId: string): ObservationRecordInsertType => ({
  id,
  project_id: SMOKE_PROJECT,
  trace_id: traceId,
  type: "GENERATION",
  environment: "default",
  name: "gen",
  level: "DEFAULT",
  start_time: now,
  end_time: now + 1000,
  metadata: {
    job_configuration_id: "ev1",
    langgraph_node: "n1",
    langgraph_step: "2",
  },
  provided_model_name: "gpt-4o",
  internal_model_id: "m1",
  model_parameters: "{}",
  prompt_id: "p1",
  prompt_name: "greet",
  prompt_version: 1,
  provided_usage_details: { input: 10, output: 20 },
  usage_details: { input: 10, output: 20, total: 30 },
  provided_cost_details: {},
  cost_details: { input: 0.1, output: 0.2, total: 0.3 },
  total_cost: 0.3,
  // Distinct from DRI dataset_item_input ({q:"x"}) so BatchIO input must come from the root obs.
  input: JSON.stringify({ root: "input" }),
  output: JSON.stringify({ root: "output" }),
  tool_definitions: {},
  tool_calls: [],
  tool_call_names: [],
  created_at: now,
  updated_at: now,
  event_ts: now,
  is_deleted: 0,
});

async function main() {
  await cleanup();
  const writer = GreptimeWriter.getInstance();

  // run-1: item-1(t1) written under TWO ids (dedup), item-2(t2). run-2: item-1(t3).
  writer.addToQueue(GreptimeTable.DatasetRunItems, dri({ id: "d1a", dataset_run_id: RUN1, dataset_item_id: "item-1", trace_id: "t1", observation_id: "op1" })); // prettier-ignore
  writer.addToQueue(GreptimeTable.DatasetRunItems, dri({ id: "d1b", dataset_run_id: RUN1, dataset_item_id: "item-1", trace_id: "t1", observation_id: "op1", created_at: now + 5000, dataset_item_version: now + 5000 })); // prettier-ignore
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
  // observation-level score on root op1 (t1) + run-level score on RUN1.
  writer.addToQueue(
    GreptimeTable.Scores,
    score("sc_obs", "t1", "helpfulness", null, "high", {
      observationId: "op1",
    }),
  );
  writer.addToQueue(
    GreptimeTable.Scores,
    score("sc_run", "", "overall", 0.8, null, { datasetRunId: RUN1 }),
  );

  // observations on t1: two GENERATION rows (prompt p1 v1, evaluator ev1, langgraph node/step).
  writer.addToQueue(GreptimeTable.Observations, genObs("op1", "t1"));
  writer.addToQueue(GreptimeTable.Observations, genObs("op2", "t1"));
  // an ERROR span on RUN1's item-2 trace (t2) -> experiment error_count=1 (span-level per-trace scan).
  writer.addToQueue(GreptimeTable.Observations, {
    ...genObs("oerr", "t2"),
    type: "SPAN",
    level: "ERROR",
    prompt_id: undefined,
    prompt_name: undefined,
    prompt_version: undefined,
    total_cost: 0,
    cost_details: {},
    usage_details: {},
    metadata: {},
  });

  await writer.flushAll(true);
  await sleep(500);

  // --- getTraceScoresForDatasetRuns ---
  const run1Scores = await getTraceScoresForDatasetRuns(SMOKE_PROJECT, [RUN1]);
  check(
    "traceScoresForDatasetRuns run1: 3 scores (sc1/sc2/sc_obs on t1, no dedup double-count)",
    run1Scores.length === 3,
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
    "traceScoresForDatasetRuns run1+run2: 4 rows (3 run1 + sc3 run2)",
    bothRuns.length === 4 &&
      bothRuns.some((s) => s.id === "sc3" && s.datasetRunId === RUN2),
    bothRuns.map((s) => `${s.id}:${s.datasetRunId}`),
  );

  // --- getScoresForExperimentItems (experiment_id == dataset_run_id) ---
  const expScores = await getScoresForExperimentItems(SMOKE_PROJECT, [RUN1]);
  check(
    "scoresForExperimentItems run1: 3 scores tagged experimentId=RUN1",
    expScores.length === 3 &&
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
    "Bug2 datasetRunItemRunIds=[RUN1]: {quality, sentiment, helpfulness}",
    new Set(byRun1.map((r) => r.name)).size === 3 &&
      byRun1.every((r) =>
        ["quality", "sentiment", "helpfulness"].includes(r.name),
      ),
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
    "Bug2 datasetId=[DS]: {quality, sentiment, helpfulness}",
    new Set(byDataset.map((r) => r.name)).size === 3,
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

  // --- B class: scattered observation reads ---
  const withPrompt = await getObservationsWithPromptName(SMOKE_PROJECT, [
    "greet",
  ]);
  check(
    "getObservationsWithPromptName greet: count distinct = 2",
    withPrompt.length === 1 && withPrompt[0].count === 2,
    withPrompt,
  );

  const promptMetrics = await getObservationMetricsForPrompts(SMOKE_PROJECT, [
    "p1",
  ]);
  // uddsketch medians are approximate (~1% relative error for (128, 0.01)).
  const rel = (a: number, b: number) => Math.abs(a - b) / b < 0.03;
  check(
    "getObservationMetricsForPrompts p1: count=2, median input/output/cost/latency ~ 10/20/0.3/1000",
    promptMetrics.length === 1 &&
      promptMetrics[0].count === 2 &&
      rel(promptMetrics[0].medianInputUsage, 10) &&
      rel(promptMetrics[0].medianOutputUsage, 20) &&
      rel(promptMetrics[0].medianTotalCost, 0.3) &&
      rel(promptMetrics[0].medianLatencyMs, 1000),
    promptMetrics,
  );

  const grouped = await getObservationsGroupedByTraceId(SMOKE_PROJECT, ["t1"]);
  const t1Obs = grouped.get("t1") ?? [];
  check(
    "getObservationsGroupedByTraceId t1: 2 tuples, total cost 0.3",
    t1Obs.length === 2 && t1Obs.every((o) => o[2] === "0.3" && o[5] === 1000),
    t1Obs,
  );

  const evalCost = await getCostByEvaluatorIds(SMOKE_PROJECT, ["ev1"]);
  check(
    "getCostByEvaluatorIds ev1: sum = 0.6",
    evalCost.length === 1 &&
      evalCost[0].evaluatorId === "ev1" &&
      Math.abs(evalCost[0].totalCost - 0.6) < 1e-6,
    evalCost,
  );

  const graph = await getAgentGraphData({
    projectId: SMOKE_PROJECT,
    traceId: "t1",
    chMinStartTime: new Date(now - ONE_DAY).toISOString(),
    chMaxStartTime: new Date(now + ONE_DAY).toISOString(),
  });
  check(
    "getAgentGraphData t1: 2 rows with node=n1 step=2",
    graph.length === 2 &&
      graph.every(
        (g) => g.node === "n1" && g.step === "2" && g.type === "GENERATION",
      ),
    graph,
  );

  // --- A2: experiment Names + Metrics ---
  const names = await getExperimentNamesFromEvents({
    projectId: SMOKE_PROJECT,
  });
  check(
    "getExperimentNames: 2 distinct names (run-one, run-two)",
    names.length === 2 &&
      new Set(names.map((n) => n.experimentName)).size === 2,
    names,
  );

  const metrics = await getExperimentMetricsFromEvents({
    projectId: SMOKE_PROJECT,
    experimentIds: [RUN1, RUN2],
  });
  const m1 = metrics.find((m) => m.id === RUN1);
  const m2 = metrics.find((m) => m.id === RUN2);
  check(
    "getExperimentMetrics run1: totalCost=0.6 (t1 2 obs), latencyAvg~1000 (root op1)",
    !!m1 &&
      Math.abs((m1.totalCost ?? 0) - 0.6) < 1e-6 &&
      m1.latencyAvg != null &&
      Math.abs(m1.latencyAvg - 1000) < 1,
    m1,
  );
  check(
    "getExperimentMetrics run2: no obs -> totalCost null, latencyAvg null",
    !!m2 && m2.totalCost == null && m2.latencyAvg == null,
    m2,
  );

  // --- A2: item + run score filter options ---
  const itemOpts = await getExperimentItemsFilterOptions({
    projectId: SMOKE_PROJECT,
    experimentIds: [RUN1],
  });
  check(
    "getExperimentItemsFilterOptions: trace numeric=[quality], trace cat=[sentiment:positive], obs cat=[helpfulness:high]",
    itemOpts.trace_scores_avg.includes("quality") &&
      itemOpts.trace_score_categories.some(
        (c) => c.label === "sentiment" && c.values.includes("positive"),
      ) &&
      itemOpts.obs_score_categories.some(
        (c) => c.label === "helpfulness" && c.values.includes("high"),
      ),
    itemOpts,
  );

  const scoreOpts = await getExperimentScoreOptions({
    projectId: SMOKE_PROJECT,
    experimentIds: [RUN1],
  });
  check(
    "getExperimentScoreOptions: experiment-run numeric=[overall], obs cat=[helpfulness]",
    scoreOpts.experiment_scores_avg.includes("overall") &&
      scoreOpts.obs_score_categories.some((c) => c.label === "helpfulness"),
    scoreOpts,
  );

  // --- A2: batch IO (input from ROOT obs, not DRI item input; expected from DRI) ---
  const batchIO = await getExperimentItemsBatchIO({
    projectId: SMOKE_PROJECT,
    itemIds: ["item-1", "item-2"],
    baseExperimentId: RUN1,
    compExperimentIds: [RUN2],
  });
  const bio1 = batchIO.find((b) => b.itemId === "item-1");
  check(
    "getExperimentItemsBatchIO item-1: input from root obs (not DRI), expected from DRI, RUN2 output null",
    !!bio1 &&
      (bio1.input ?? "").includes('"root":"input"') &&
      !(bio1.input ?? "").includes('"q":"x"') &&
      (bio1.expectedOutput ?? "").includes('"a":"y"') &&
      bio1.outputs.some(
        (o) =>
          o.experimentId === RUN1 &&
          (o.output ?? "").includes('"root":"output"'),
      ) &&
      bio1.outputs.some((o) => o.experimentId === RUN2 && o.output == null),
    bio1,
  );

  // --- A2: experiments LIST ---
  const experiments = await getExperimentsFromEvents({
    projectId: SMOKE_PROJECT,
    filter: [],
  });
  const e1 = experiments.find((e) => e.id === RUN1);
  const e2 = experiments.find((e) => e.id === RUN2);
  check(
    "getExperimentsFromEvents: 2 experiments (run-one, run-two)",
    experiments.length === 2 && !!e1 && !!e2,
    experiments.map((e) => `${e.id}:${e.name}`),
  );
  check(
    "experiments LIST run1: itemCount=2, errorCount=1 (ERROR span on t2), prompts=[[greet,1]], metadata.kind=smoke",
    !!e1 &&
      e1.itemCount === 2 &&
      e1.errorCount === 1 &&
      e1.name === "run-one" &&
      e1.prompts.length === 1 &&
      e1.prompts[0][0] === "greet" &&
      e1.prompts[0][1] === 1 &&
      (e1.metadata as any).kind === "smoke",
    e1,
  );
  check(
    "experiments LIST run2: itemCount=1, errorCount=0",
    !!e2 && e2.itemCount === 1 && e2.errorCount === 0,
    e2,
  );

  const expCount = await getExperimentsCountFromEvents({
    projectId: SMOKE_PROJECT,
    filter: [],
  });
  check("getExperimentsCountFromEvents: 2", expCount === 2, expCount);

  // LIST with datasetId filter (experimentDatasetId) -> still both (same dataset).
  const filtered = await getExperimentsFromEvents({
    projectId: SMOKE_PROJECT,
    filter: [
      {
        column: "experimentDatasetId",
        operator: "any of",
        value: [DS],
        type: "stringOptions",
      },
    ],
  });
  check(
    "experiments LIST datasetId filter: 2 (both in DS)",
    filtered.length === 2,
    filtered.map((e) => e.id),
  );
  const filteredNone = await getExperimentsFromEvents({
    projectId: SMOKE_PROJECT,
    filter: [
      {
        column: "experimentDatasetId",
        operator: "any of",
        value: ["nonexistent-ds"],
        type: "stringOptions",
      },
    ],
  });
  check(
    "experiments LIST datasetId filter (none): empty",
    filteredNone.length === 0,
    filteredNone,
  );

  // --- A2: experiment items (qualification + per-(item,experiment) data) ---
  const items = await getExperimentItemsFromEvents({
    projectId: SMOKE_PROJECT,
    baseExperimentId: RUN1,
    compExperimentIds: [RUN2],
    filterByExperiment: [],
    config: { requireBaselinePresence: false },
  });
  const it1 = items.find((i) => i.itemId === "item-1");
  const it2 = items.find((i) => i.itemId === "item-2");
  check(
    // C6: rows with no root observation are omitted (no epoch-0 sentinel) — RUN2 item-1 (t3, no obs)
    // and RUN1 item-2 (t2, no root obs) both drop out, matching the CH events root-span semantics.
    "getExperimentItemsFromEvents: item-1 has only RUN1 (root op1); item-2 has no root-obs experiments",
    items.length === 2 &&
      !!it1 &&
      it1.experiments.length === 1 &&
      it1.experiments[0].experimentId === RUN1 &&
      it1.experiments[0].level === "DEFAULT" &&
      Math.abs((it1.experiments[0].totalCost ?? 0) - 0.3) < 1e-6 &&
      Math.abs((it1.experiments[0].latencyMs ?? 0) - 1000) < 1 &&
      !!it2 &&
      it2.experiments.length === 0,
    items.map(
      (i) =>
        `${i.itemId}:[${i.experiments.map((e) => e.experimentId).join(",")}]`,
    ),
  );

  const itemsCount = await getExperimentItemsCountFromEvents({
    projectId: SMOKE_PROJECT,
    baseExperimentId: RUN1,
    compExperimentIds: [RUN2],
    filterByExperiment: [],
    config: { requireBaselinePresence: false },
  });
  check("getExperimentItemsCountFromEvents: 2", itemsCount === 2, itemsCount);

  // baseline-only + trace-score filter on RUN1 (quality >= 0.85) -> only item-1 (t1 quality 0.9).
  const filteredItems = await getExperimentItemsFromEvents({
    projectId: SMOKE_PROJECT,
    baseExperimentId: RUN1,
    compExperimentIds: [RUN2],
    filterByExperiment: [
      {
        experimentId: RUN1,
        filters: [
          {
            column: "trace_scores_avg",
            key: "quality",
            operator: ">=",
            value: 0.85,
            type: "numberObject",
          },
        ],
      },
    ],
    config: { requireBaselinePresence: true },
  });
  check(
    "getExperimentItems trace-score filter quality>=0.85 (baseline): only item-1",
    filteredItems.length === 1 && filteredItems[0].itemId === "item-1",
    filteredItems.map((i) => i.itemId),
  );

  // baseline-only + obs-score filter on RUN1 (helpfulness on root op1) -> only item-1.
  const filteredObs = await getExperimentItemsFromEvents({
    projectId: SMOKE_PROJECT,
    baseExperimentId: RUN1,
    compExperimentIds: [],
    filterByExperiment: [
      {
        experimentId: RUN1,
        filters: [
          {
            column: "obs_score_categories",
            key: "helpfulness",
            operator: "any of",
            value: ["high"],
            type: "categoryOptions",
          },
        ],
      },
    ],
    config: { requireBaselinePresence: true },
  });
  check(
    "getExperimentItems obs-score categoryOptions helpfulness=high: only item-1 (root op1)",
    filteredObs.length === 1 && filteredObs[0].itemId === "item-1",
    filteredObs.map((i) => i.itemId),
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
