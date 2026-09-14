import { prisma } from "../../../src/db";
import {
  createEvent,
  createEventsCh,
  createScoresCh,
  createTraceScore,
  toClickhouseDateTime,
} from "../../../src/server";
import { jitter, utcDayStartMs } from "./rng";
import { ScenarioDefinition, SeedError, SeedSummary } from "./types";
import { countRows } from "./verify";

const ITEMS = [
  {
    key: "rain",
    input: "What should I pack for a rainy walk?",
    expectedOutput: "Bring a waterproof jacket and shoes with good grip.",
    baseline: {
      output: "Bring a waterproof jacket and shoes with good grip.",
      quality: 0.9,
    },
    candidate: { output: "Bring sunglasses and sandals.", quality: 0.3 },
  },
  {
    key: "theme",
    input: "How do I change the display theme?",
    expectedOutput: "Open Settings, then Appearance, and select a theme.",
    baseline: { output: "Restart your computer.", quality: 0.3 },
    candidate: { output: "Choose a theme in Settings.", quality: 0.6 },
  },
  {
    key: "password",
    input: "Where can I change my password?",
    expectedOutput: "Open Settings, then Security, and select Change password.",
    baseline: { output: "Open your account settings.", quality: 0.6 },
    candidate: { output: "Open your account settings.", quality: 0.6 },
  },
] as const;

const RUNS = [
  { key: "baseline", name: "Baseline A" },
  { key: "candidate", name: "Candidate B" },
] as const;

export const experimentComparisonScenario: ScenarioDefinition = {
  name: "experiment-comparison",
  description:
    "Two v4 experiments on three shared items with numeric quality scores: Baseline A averages 0.60, Candidate B 0.50, with one higher, one lower, and one equal item.",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "write v4 events (required by experiment results)",
    },
  ],
  run: async (ctx, params): Promise<SeedSummary> => {
    const startedAt = Date.now();
    const timestamp = utcDayStartMs();
    const datasetId = `${ctx.idPrefix}-dataset`;
    const runs = RUNS.map((run) => ({
      ...run,
      id: `${ctx.idPrefix}-${run.key}`,
    }));
    const validFrom = new Date(0);
    const runItems = runs.flatMap((run, runIndex) =>
      ITEMS.map((item, itemIndex) => ({
        run,
        item,
        result: item[run.key],
        itemId: `${ctx.idPrefix}-item-${item.key}`,
        spanId: `${run.id}-span-${item.key}`,
        traceId: `${run.id}-trace-${item.key}`,
        startTime:
          timestamp +
          runIndex * 60_000 +
          itemIndex * 1000 +
          jitter(ctx.seed, runIndex * ITEMS.length + itemIndex, 100),
      })),
    );
    const traceIds = runItems.map((item) => item.traceId);
    const counts = {
      datasets: 1,
      experiments: runs.length,
      datasetItems: ITEMS.length,
      events: runItems.length,
      scores: runItems.length,
    };
    const comparisonUrl = `${ctx.baseUrl}/project/${ctx.projectId}/experiments/results?baseline=${encodeURIComponent(runs[0].id)}&c=${encodeURIComponent(runs[1].id)}&diff=comparison`;
    const links = ["list", "grid", "matrix"].map(
      (layout) => `${comparisonUrl}&layout=${layout}`,
    );
    const verified: Record<string, number> = {};

    if (!ctx.dryRun) {
      ctx.log(
        "writing two experiments, three shared items, and six quality scores",
      );
      await prisma.$transaction(async (tx) => {
        const dataset = {
          id: datasetId,
          projectId: ctx.projectId,
          name: `seed/experiment-comparison/${ctx.idPrefix}`,
          description: "Synthetic examples for reading experiment comparisons.",
        };
        await tx.dataset.upsert({
          where: { id_projectId: { id: datasetId, projectId: ctx.projectId } },
          create: dataset,
          update: dataset,
        });
        for (const run of runs) {
          const experiment = {
            id: run.id,
            projectId: ctx.projectId,
            datasetId,
            name: run.name,
          };
          await tx.datasetRuns.upsert({
            where: {
              id_projectId: { id: run.id, projectId: ctx.projectId },
            },
            create: experiment,
            update: experiment,
          });
        }
        for (const item of ITEMS) {
          const data = {
            id: `${ctx.idPrefix}-item-${item.key}`,
            projectId: ctx.projectId,
            datasetId,
            input: item.input,
            expectedOutput: item.expectedOutput,
            validFrom,
          };
          await tx.datasetItem.upsert({
            where: {
              id_projectId_validFrom: {
                id: data.id,
                projectId: ctx.projectId,
                validFrom,
              },
            },
            create: data,
            update: data,
          });
        }
      });

      const events = runItems.map(
        ({ run, item, result, itemId, spanId, traceId, startTime }) => {
          const input = JSON.stringify(item.input);
          const output = JSON.stringify(result.output);
          return createEvent({
            id: spanId,
            span_id: spanId,
            trace_id: traceId,
            parent_span_id: "",
            project_id: ctx.projectId,
            environment: ctx.environment,
            name: `experiment-comparison-${item.key}`,
            trace_name: `experiment-comparison-${item.key}`,
            type: "SPAN",
            input,
            output,
            provided_model_name: null,
            provided_usage_details: {},
            usage_details: {},
            provided_cost_details: {},
            cost_details: {},
            experiment_id: run.id,
            experiment_name: run.name,
            experiment_dataset_id: datasetId,
            experiment_item_id: itemId,
            experiment_item_version: toClickhouseDateTime(validFrom),
            experiment_item_root_span_id: spanId,
            experiment_item_expected_output: JSON.stringify(
              item.expectedOutput,
            ),
            start_time: startTime,
            end_time: startTime + 500,
            created_at: startTime,
            updated_at: startTime,
            event_ts: startTime,
            event_bytes: Buffer.byteLength(input) + Buffer.byteLength(output),
          });
        },
      );
      const scores = runItems.map(({ result, spanId, traceId, startTime }) =>
        createTraceScore({
          id: `${spanId}-quality`,
          project_id: ctx.projectId,
          trace_id: traceId,
          observation_id: spanId,
          environment: ctx.environment,
          name: "quality",
          value: result.quality,
          data_type: "NUMERIC",
          source: "EVAL",
          comment: null,
          metadata: {},
          timestamp: startTime,
          created_at: startTime,
          updated_at: startTime,
          event_ts: startTime,
        }),
      );
      await createEventsCh(events);
      await createScoresCh(scores);

      const experimentIds = runs.map((run) => run.id);
      verified.datasets = await prisma.dataset.count({
        where: { id: datasetId, projectId: ctx.projectId },
      });
      verified.experiments = await prisma.datasetRuns.count({
        where: { id: { in: experimentIds }, projectId: ctx.projectId },
      });
      verified.datasetItems = await prisma.datasetItem.count({
        where: { datasetId, projectId: ctx.projectId, validFrom },
      });
      verified.events = await countRows(
        "events_full",
        "project_id = {projectId: String} AND experiment_id IN {experimentIds: Array(String)} AND span_id = experiment_item_root_span_id AND isValidJSON(input) AND isValidJSON(output)",
        { projectId: ctx.projectId, experimentIds },
        "uniqExact(span_id)",
      );
      verified.scores = await countRows(
        "scores",
        "project_id = {projectId: String} AND trace_id IN {traceIds: Array(String)} AND observation_id IN {spanIds: Array(String)} AND name = 'quality' AND data_type = 'NUMERIC'",
        {
          projectId: ctx.projectId,
          traceIds,
          spanIds: runItems.map((item) => item.spanId),
        },
        "uniqExact(id)",
      );
      for (const [entity, expected] of Object.entries(counts)) {
        if (verified[entity] !== expected) {
          throw new SeedError(
            `Readback mismatch: expected ${expected} ${entity}, found ${verified[entity]}`,
          );
        }
      }
    }

    return {
      scenario: "experiment-comparison",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds,
      sessionIds: [],
      counts,
      verified,
      links,
      dryRun: ctx.dryRun,
      durationMs: Date.now() - startedAt,
    };
  },
};
