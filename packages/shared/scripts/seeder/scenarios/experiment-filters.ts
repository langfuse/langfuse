import { prisma } from "../../../src/db";
import {
  createEvent,
  createEventsCh,
  createScoresCh,
  createTraceScore,
  EventRecordInsertType,
  ScoreRecordInsertType,
  toClickhouseDateTime,
} from "../../../src/server";
import { jitter, utcDayStartMs } from "./rng";
import { chunk, ScenarioDefinition, SeedError, SeedSummary } from "./types";
import { countRows } from "./verify";

const RUN_NAMES = ["Filter A", "Filter B", "Filter C"];
const LEVELS = ["DEFAULT", "WARNING", "ERROR"] as const;
const QUALITY = [0.2, 0.45, 0.65, 0.85, 0.95, null];
const VERDICTS = ["pass", "review", "fail"];

export const experimentFiltersScenario: ScenarioDefinition = {
  name: "experiment-filters",
  description:
    "Three v4 experiments over 60 items, with shifted numeric, categorical and boolean scores, status and metadata. Filter C misses every sixth item; each run omits every sixth quality score.",
  supportsV4: true,
  flags: [
    {
      flag: "items",
      type: "number",
      default: 60,
      description: "dataset item count (use a fresh id-prefix when changing)",
    },
    {
      flag: "extra-score-names",
      type: "number",
      default: 0,
      description:
        "distinct additional score names for suggestion cardinality tests",
    },
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "write v4 events (required by experiment results)",
    },
  ],
  run: async (ctx, params): Promise<SeedSummary> => {
    const startedAt = Date.now();
    const itemCount = Number(params.items);
    const extraScoreNames = Number(params["extra-score-names"]);
    if (
      !Number.isInteger(itemCount) ||
      itemCount < 1 ||
      !Number.isInteger(extraScoreNames) ||
      extraScoreNames < 0
    ) {
      throw new SeedError(
        "items must be positive and extra-score-names nonnegative integers",
      );
    }
    const timestamp = utcDayStartMs();
    const validFrom = new Date(0);
    const datasetId = `${ctx.idPrefix}-dataset`;
    const experimentIds = RUN_NAMES.map(
      (_, index) => `${ctx.idPrefix}-run-${index + 1}`,
    );
    const items = Array.from({ length: itemCount }, (_, index) => ({
      id: `${ctx.idPrefix}-item-${String(index + 1).padStart(2, "0")}`,
      projectId: ctx.projectId,
      datasetId,
      validFrom,
      input: { question: `Synthetic question ${index + 1}`, index },
      expectedOutput: { answer: `Expected answer ${index + 1}` },
      metadata: {
        category: index % 2 === 0 ? "general" : "special",
        cohort: `group-${index % 6}`,
      },
    }));
    const events: EventRecordInsertType[] = [];
    const scores: ScoreRecordInsertType[] = [];

    for (const [runIndex, experimentId] of experimentIds.entries()) {
      for (const [itemIndex, item] of items.entries()) {
        if (runIndex === 2 && itemIndex % 6 === 5) continue;

        const rowIndex = runIndex * itemCount + itemIndex;
        const startTime =
          timestamp + rowIndex * 1000 + jitter(ctx.seed, rowIndex, 100);
        const traceId = `${experimentId}-trace-${itemIndex + 1}`;
        const spanId = `${traceId}-root`;
        const input = JSON.stringify(item.input);
        const output = JSON.stringify({
          answer: `Answer ${itemIndex + 1} from ${RUN_NAMES[runIndex]}`,
        });
        const level = LEVELS[(itemIndex + runIndex) % LEVELS.length];
        const approved = (itemIndex + runIndex) % 2 === 0;
        const verdictIndex = (itemIndex + runIndex) % VERDICTS.length;
        const quality = QUALITY[(itemIndex + runIndex * 2) % QUALITY.length];
        events.push(
          createEvent({
            id: spanId,
            span_id: spanId,
            trace_id: traceId,
            parent_span_id: "",
            project_id: ctx.projectId,
            environment: ctx.environment,
            name: `answer-${itemIndex + 1}`,
            trace_name: `answer-${itemIndex + 1}`,
            type: "SPAN",
            level,
            status_message:
              level === "ERROR" ? "Synthetic evaluation error" : null,
            input,
            output,
            provided_model_name: null,
            provided_usage_details: {},
            usage_details: {},
            provided_cost_details: {},
            cost_details: {},
            metadata_names: ["region", "variant"],
            metadata_values: [approved ? "eu" : "us", RUN_NAMES[runIndex]],
            experiment_id: experimentId,
            experiment_name: RUN_NAMES[runIndex],
            experiment_dataset_id: datasetId,
            experiment_item_id: item.id,
            experiment_item_version: toClickhouseDateTime(validFrom),
            experiment_item_root_span_id: spanId,
            experiment_item_expected_output: JSON.stringify(
              item.expectedOutput,
            ),
            experiment_item_metadata_names: ["category", "cohort"],
            experiment_item_metadata_values: [
              item.metadata.category,
              item.metadata.cohort,
            ],
            start_time: startTime,
            end_time: startTime + 300 + runIndex * 100,
            created_at: startTime,
            updated_at: startTime,
            event_ts: startTime,
            event_bytes: Buffer.byteLength(input) + Buffer.byteLength(output),
          }),
        );
        const scoreBase = {
          project_id: ctx.projectId,
          trace_id: traceId,
          observation_id: spanId,
          environment: ctx.environment,
          source: "EVAL" as const,
          comment: null,
          metadata: {},
          timestamp: startTime,
          created_at: startTime,
          updated_at: startTime,
          event_ts: startTime,
        };
        if (extraScoreNames > 0) {
          scores.push(
            createTraceScore({
              ...scoreBase,
              id: `${spanId}-extra`,
              observation_id: runIndex === 1 ? null : spanId,
              name: `metric-${String(itemIndex % extraScoreNames).padStart(4, "0")}`,
              value: (itemIndex % 100) / 100,
              data_type: "NUMERIC",
            }),
          );
        }
        if (quality !== null) {
          scores.push(
            createTraceScore({
              ...scoreBase,
              id: `${spanId}-quality`,
              name: "quality",
              value: quality,
              data_type: "NUMERIC",
            }),
          );
        }
        scores.push(
          createTraceScore({
            ...scoreBase,
            id: `${spanId}-approved`,
            name: "approved",
            value: approved ? 1 : 0,
            string_value: approved ? "True" : "False",
            data_type: "BOOLEAN",
          }),
          createTraceScore({
            ...scoreBase,
            id: `${spanId}-verdict`,
            name: "verdict",
            value: verdictIndex,
            string_value: VERDICTS[verdictIndex],
            data_type: "CATEGORICAL",
          }),
        );
      }
    }

    const counts = {
      datasets: 1,
      experiments: experimentIds.length,
      datasetItems: items.length,
      events: events.length,
      scores: scores.length,
    };
    const traceIds = events.map((event) => event.trace_id);
    const verified: Record<string, number> = {};
    if (!ctx.dryRun) {
      ctx.log(
        `writing ${counts.experiments} experiments over ${items.length} items`,
      );
      await prisma.$transaction(
        async (tx) => {
          const dataset = {
            id: datasetId,
            projectId: ctx.projectId,
            name: `seed/experiment-filters/${ctx.idPrefix}`,
            description: `Synthetic filters: ${itemCount} items, three variants, shifted scores and missing results.`,
          };
          await tx.dataset.upsert({
            where: {
              id_projectId: { id: datasetId, projectId: ctx.projectId },
            },
            create: dataset,
            update: dataset,
          });
          for (const [index, id] of experimentIds.entries()) {
            const experiment = {
              id,
              projectId: ctx.projectId,
              datasetId,
              name: RUN_NAMES[index],
            };
            await tx.datasetRuns.upsert({
              where: { id_projectId: { id, projectId: ctx.projectId } },
              create: experiment,
              update: experiment,
            });
          }
          for (const batch of chunk(items, 1000)) {
            await tx.datasetItem.createMany({
              data: batch,
              skipDuplicates: true,
            });
          }
        },
        { timeout: 60_000 },
      );
      for (const batch of chunk(events, 10_000)) await createEventsCh(batch);
      for (const batch of chunk(scores, 10_000)) await createScoresCh(batch);
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
        "project_id = {projectId: String} AND experiment_id IN {experimentIds: Array(String)} AND span_id = experiment_item_root_span_id",
        { projectId: ctx.projectId, experimentIds },
        "uniqExact(span_id)",
      );
      verified.scores = await countRows(
        "scores",
        "project_id = {projectId: String} AND startsWith(trace_id, {tracePrefix: String})",
        { projectId: ctx.projectId, tracePrefix: `${ctx.idPrefix}-run-` },
        "uniqExact(id)",
      );
      for (const [entity, expected] of Object.entries(counts)) {
        if (verified[entity] !== expected) {
          throw new SeedError(
            `Readback mismatch: expected ${expected} ${entity}, found ${verified[entity]}`,
          );
        }
      }
      for (const [runIndex, experimentId] of experimentIds.entries()) {
        const expectedQualityMatches = items.filter((_, itemIndex) => {
          if (runIndex === 2 && itemIndex % 6 === 5) return false;
          const quality = QUALITY[(itemIndex + runIndex * 2) % QUALITY.length];
          return quality !== null && quality > 0.8;
        }).length;
        const matches = await countRows(
          "scores",
          "project_id = {projectId: String} AND startsWith(trace_id, {tracePrefix: String}) AND name = 'quality' AND value > 0.8",
          { projectId: ctx.projectId, tracePrefix: `${experimentId}-trace-` },
          "uniqExact(id)",
        );
        if (matches !== expectedQualityMatches) {
          throw new SeedError(
            `Readback mismatch: expected ${expectedQualityMatches} quality > 0.8 matches in ${RUN_NAMES[runIndex]}, found ${matches}`,
          );
        }
        ctx.log(`${RUN_NAMES[runIndex]}: ${matches} quality > 0.8 matches`);
      }
    }

    const comparison = new URLSearchParams({ baseline: experimentIds[0] });
    comparison.append("c", experimentIds[1]);
    comparison.append("c", experimentIds[2]);
    return {
      scenario: "experiment-filters",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: traceIds.slice(0, 5),
      sessionIds: [],
      counts,
      verified,
      links: [
        `${ctx.baseUrl}/project/${ctx.projectId}/experiments/results?${comparison}`,
      ],
      dryRun: ctx.dryRun,
      durationMs: Date.now() - startedAt,
    };
  },
};
