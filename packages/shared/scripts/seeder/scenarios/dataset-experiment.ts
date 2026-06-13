import { prisma } from "../../../src/db";
import {
  createDatasetRunItem,
  createObservation,
  createTrace,
  createTraceScore,
  DatasetRunItemRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  TraceRecordInsertType,
} from "../../../src/server";
import { jitter, utcDayStartMs } from "./rng";
import {
  ScenarioContext,
  ScenarioDefinition,
  SeedError,
  SeedSummary,
} from "./types";
import {
  greptimeCountRows,
  writeRecordsToGreptime,
} from "../utils/greptime-writer";

/**
 * A dataset with several runs (experiments), each evaluating every item against a freshly seeded
 * trace. Exercises the P4 read path end to end: the dataset Runs table (cost/latency/scores per run),
 * run-items lists, multi-run compare, and the Experiments comparison charts (experiment = dataset
 * run). Each run item is a trace-level item (observation_id null) so the metrics use the trace
 * aggregate. Later runs score higher and cost a bit more, so the comparison shows a visible trend.
 *
 * Writes BOTH stores: Postgres (Dataset / DatasetItem / DatasetRuns / DatasetRunItems — what the UI
 * routes and lists need) and GreptimeDB (traces / observations / scores / dataset_run_items — the P4
 * analytics read path). Deterministic and idempotent: ids derive from --id-prefix, randomness from
 * the seeded Rng / stateless jitter, time anchors from utcDayStartMs(); a re-run upserts/merges.
 */

const RUN_LABELS = [
  "baseline",
  "candidate",
  "tuned",
  "rc1",
  "rc2",
  "final",
] as const;

const ITEM_QUESTIONS = [
  "What is the capital of France?",
  "Summarize the refund policy.",
  "Classify the sentiment of this review.",
  "Extract the invoice total.",
  "Translate 'hello' to Spanish.",
  "What is 17 * 23?",
  "Who wrote Hamlet?",
  "Is this email spam?",
] as const;

const run = async (
  ctx: ScenarioContext,
  params: Record<string, string | number | boolean>,
): Promise<SeedSummary> => {
  const startedAt = Date.now();
  const runCount = params["runs"] as number;
  const itemCount = params["items"] as number;

  if (runCount < 1 || runCount > RUN_LABELS.length) {
    throw new SeedError(
      `--runs must be between 1 and ${RUN_LABELS.length}, got ${runCount}`,
      `pass e.g. --runs 2`,
    );
  }
  if (itemCount < 1 || itemCount > ITEM_QUESTIONS.length) {
    throw new SeedError(
      `--items must be between 1 and ${ITEM_QUESTIONS.length}, got ${itemCount}`,
      `pass e.g. --items 4`,
    );
  }

  const anchor = utcDayStartMs();
  const datasetId = `${ctx.idPrefix}-dataset`;
  const datasetName = `Seed Experiment Dataset (${ctx.idPrefix})`;

  const itemIds = Array.from(
    { length: itemCount },
    (_, i) => `${ctx.idPrefix}-item-${i}`,
  );
  const runIds = Array.from(
    { length: runCount },
    (_, r) => `${ctx.idPrefix}-run-${r}`,
  );

  if (ctx.dryRun) {
    return {
      scenario: "dataset-experiment",
      target: "greptime",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: [],
      sessionIds: [],
      counts: {
        datasets: 1,
        datasetItems: itemCount,
        datasetRuns: runCount,
        datasetRunItems: runCount * itemCount,
        traces: runCount * itemCount,
        observations: runCount * itemCount * 2,
        scores: runCount * itemCount * 2,
      },
      verified: {},
      links: [datasetLink(ctx, datasetId)],
      dryRun: true,
      durationMs: Date.now() - startedAt,
    };
  }

  // ---- Postgres: dataset + items + runs ----
  await prisma.dataset.upsert({
    where: { id_projectId: { id: datasetId, projectId: ctx.projectId } },
    create: {
      id: datasetId,
      projectId: ctx.projectId,
      name: datasetName,
      description:
        "Seeded dataset for exercising the P4 dataset-run read path.",
      metadata: { scenario: "dataset-experiment", seed: String(ctx.seed) },
    },
    update: { name: datasetName },
  });

  const itemValidFrom = new Date(anchor);
  for (let i = 0; i < itemCount; i++) {
    await prisma.datasetItem.upsert({
      where: {
        id_projectId_validFrom: {
          id: itemIds[i],
          projectId: ctx.projectId,
          validFrom: itemValidFrom,
        },
      },
      create: {
        id: itemIds[i],
        projectId: ctx.projectId,
        datasetId,
        validFrom: itemValidFrom,
        input: { question: ITEM_QUESTIONS[i] },
        expectedOutput: { answer: `expected-answer-${i}` },
        metadata: { topic: i % 2 === 0 ? "qa" : "classification" },
      },
      update: {},
    });
  }

  for (let r = 0; r < runCount; r++) {
    const runCreatedAt = new Date(anchor + r * 3_600_000);
    await prisma.datasetRuns.upsert({
      where: { id_projectId: { id: runIds[r], projectId: ctx.projectId } },
      create: {
        id: runIds[r],
        projectId: ctx.projectId,
        datasetId,
        name: RUN_LABELS[r],
        description: `Experiment run "${RUN_LABELS[r]}"`,
        metadata: { variant: RUN_LABELS[r] },
        createdAt: runCreatedAt,
        updatedAt: runCreatedAt,
      },
      update: { name: RUN_LABELS[r] },
    });
  }

  // ---- per (run, item): a trace with observations + scores, plus the run-item link ----
  const traces: TraceRecordInsertType[] = [];
  const observations: ObservationRecordInsertType[] = [];
  const scores: ScoreRecordInsertType[] = [];
  const datasetRunItems: DatasetRunItemRecordInsertType[] = [];
  const traceIds: string[] = [];

  for (let r = 0; r < runCount; r++) {
    const runCreatedAtMs = anchor + r * 3_600_000;
    for (let i = 0; i < itemCount; i++) {
      const traceId = `${ctx.idPrefix}-r${r}-i${i}-trace`;
      traceIds.push(traceId);
      const traceTs = runCreatedAtMs + 1000 + jitter(ctx.seed, r * 31 + i, 500);

      traces.push(
        createTrace({
          id: traceId,
          project_id: ctx.projectId,
          environment: ctx.environment,
          name: `${RUN_LABELS[r]} / item-${i}`,
          timestamp: traceTs,
          user_id: `experiment-runner`,
          session_id: null,
          tags: ["seed", "dataset-experiment", RUN_LABELS[r]],
          metadata: { run: RUN_LABELS[r], item: String(i) },
          input: JSON.stringify({ question: ITEM_QUESTIONS[i] }),
          output: JSON.stringify({ answer: `answer-${r}-${i}` }),
          created_at: runCreatedAtMs,
          updated_at: runCreatedAtMs,
          event_ts: runCreatedAtMs,
        }),
      );

      // GENERATION carries usage/cost; later runs cost a little more.
      const inTok = 200 + jitter(ctx.seed, r * 13 + i, 300);
      const outTok = 80 + jitter(ctx.seed, r * 17 + i, 200);
      const costScale = 1 + r * 0.15;
      const inCost = inTok * 2e-6 * costScale;
      const outCost = outTok * 6e-6 * costScale;
      const genStart = traceTs + 20;
      const genLatency = 400 + r * 120 + jitter(ctx.seed, r * 19 + i, 600);

      observations.push(
        createObservation({
          id: `${ctx.idPrefix}-r${r}-i${i}-gen`,
          trace_id: traceId,
          project_id: ctx.projectId,
          environment: ctx.environment,
          type: "GENERATION",
          name: "answer-generation",
          start_time: genStart,
          end_time: genStart + genLatency,
          completion_start_time: genStart + Math.floor(genLatency / 3),
          level: "DEFAULT",
          provided_model_name: "gpt-4o",
          model_parameters: JSON.stringify({ temperature: 0.2 }),
          provided_usage_details: {
            input: inTok,
            output: outTok,
            total: inTok + outTok,
          },
          usage_details: {
            input: inTok,
            output: outTok,
            total: inTok + outTok,
          },
          provided_cost_details: { input: inCost, output: outCost },
          cost_details: {
            input: inCost,
            output: outCost,
            total: inCost + outCost,
          },
          total_cost: inCost + outCost,
          input: JSON.stringify({ prompt: ITEM_QUESTIONS[i] }),
          output: JSON.stringify({ completion: `answer-${r}-${i}` }),
          created_at: runCreatedAtMs,
          updated_at: runCreatedAtMs,
          event_ts: runCreatedAtMs,
        }),
        createObservation({
          id: `${ctx.idPrefix}-r${r}-i${i}-span`,
          trace_id: traceId,
          project_id: ctx.projectId,
          environment: ctx.environment,
          type: "SPAN",
          name: "retrieve-context",
          start_time: traceTs,
          end_time: traceTs + 50 + jitter(ctx.seed, r * 23 + i, 120),
          level: "DEFAULT",
          model_parameters: "{}",
          provided_usage_details: {},
          usage_details: {},
          provided_cost_details: {},
          cost_details: {},
          total_cost: null,
          input: null,
          output: null,
          created_at: runCreatedAtMs,
          updated_at: runCreatedAtMs,
          event_ts: runCreatedAtMs,
        }),
      );

      // quality climbs with later runs; correctness is a categorical pass/fail.
      const quality = Math.min(
        0.99,
        0.55 + r * 0.12 + jitter(ctx.seed, r * 29 + i, 10) / 100,
      );
      const passed = quality > 0.7;
      scores.push(
        createTraceScore({
          id: `${ctx.idPrefix}-r${r}-i${i}-quality`,
          project_id: ctx.projectId,
          trace_id: traceId,
          environment: ctx.environment,
          name: "quality",
          value: Math.round(quality * 100) / 100,
          data_type: "NUMERIC",
          source: "EVAL",
          comment: null,
          metadata: {},
          timestamp: traceTs,
        }),
        createTraceScore({
          id: `${ctx.idPrefix}-r${r}-i${i}-correctness`,
          project_id: ctx.projectId,
          trace_id: traceId,
          environment: ctx.environment,
          name: "correctness",
          value: passed ? 1 : 0,
          string_value: passed ? "correct" : "incorrect",
          data_type: "CATEGORICAL",
          source: "EVAL",
          comment: null,
          metadata: {},
          timestamp: traceTs,
        }),
      );

      const driId = `${ctx.idPrefix}-r${r}-i${i}-dri`;
      datasetRunItems.push(
        createDatasetRunItem({
          id: driId,
          project_id: ctx.projectId,
          trace_id: traceId,
          observation_id: null,
          dataset_id: datasetId,
          dataset_run_id: runIds[r],
          dataset_item_id: itemIds[i],
          dataset_run_name: RUN_LABELS[r],
          dataset_run_description: `Experiment run "${RUN_LABELS[r]}"`,
          dataset_run_metadata: { variant: RUN_LABELS[r] },
          dataset_item_input: JSON.stringify({ question: ITEM_QUESTIONS[i] }),
          dataset_item_expected_output: JSON.stringify({
            answer: `expected-answer-${i}`,
          }),
          dataset_item_metadata: {
            topic: i % 2 === 0 ? "qa" : "classification",
          },
          dataset_run_created_at: runCreatedAtMs,
          created_at: runCreatedAtMs,
          updated_at: runCreatedAtMs,
          event_ts: runCreatedAtMs,
        }),
      );

      // Postgres link row (UI routes/lists the run items from here).
      await prisma.datasetRunItems.upsert({
        where: { id_projectId: { id: driId, projectId: ctx.projectId } },
        create: {
          id: driId,
          projectId: ctx.projectId,
          datasetRunId: runIds[r],
          datasetItemId: itemIds[i],
          traceId,
          createdAt: new Date(runCreatedAtMs),
          updatedAt: new Date(runCreatedAtMs),
        },
        update: { traceId },
      });
    }
  }

  ctx.log(
    `writing ${runCount} runs x ${itemCount} items = ${datasetRunItems.length} run items ` +
      `(${traces.length} traces, ${observations.length} observations, ${scores.length} scores)`,
  );
  await writeRecordsToGreptime({
    traces,
    observations,
    scores,
    datasetRunItems,
  });

  const verified: Record<string, number> = {
    datasetRunItems: await greptimeCountRows(
      "dataset_run_items",
      `project_id = :projectId AND dataset_id = :datasetId AND is_deleted = false`,
      { projectId: ctx.projectId, datasetId },
      "count(distinct id)",
    ),
    traces: await greptimeCountRows(
      "traces",
      `project_id = :projectId AND is_deleted = false`,
      { projectId: ctx.projectId },
      "count(distinct id)",
    ),
  };
  if (verified.datasetRunItems < runCount * itemCount) {
    throw new SeedError(
      `Readback mismatch: expected ${runCount * itemCount} dataset_run_items, found ${verified.datasetRunItems}`,
    );
  }

  return {
    scenario: "dataset-experiment",
    target: "greptime",
    params,
    projectId: ctx.projectId,
    environment: ctx.environment,
    traceIds,
    sessionIds: [],
    counts: {
      datasets: 1,
      datasetItems: itemCount,
      datasetRuns: runCount,
      datasetRunItems: datasetRunItems.length,
      traces: traces.length,
      observations: observations.length,
      scores: scores.length,
    },
    verified,
    links: [datasetLink(ctx, datasetId)],
    dryRun: false,
    durationMs: Date.now() - startedAt,
  };
};

const datasetLink = (ctx: ScenarioContext, datasetId: string): string =>
  `${ctx.baseUrl}/project/${ctx.projectId}/datasets/${datasetId}`;

export const datasetExperimentScenario: ScenarioDefinition = {
  name: "dataset-experiment",
  description:
    "A dataset with several runs (experiments), each evaluating every item against a seeded trace (cost/latency/scores). Exercises the P4 dataset Runs table, run-items, compare, and the Experiments charts. Writes Postgres (dataset/items/runs/run-items) + GreptimeDB (traces/observations/scores/dataset_run_items).",
  supportsV4: false,
  flags: [
    {
      flag: "runs",
      type: "number",
      default: 2,
      description: `number of runs/experiments (1-${RUN_LABELS.length})`,
    },
    {
      flag: "items",
      type: "number",
      default: 4,
      description: `dataset items per run (1-${ITEM_QUESTIONS.length})`,
    },
  ],
  run,
};
