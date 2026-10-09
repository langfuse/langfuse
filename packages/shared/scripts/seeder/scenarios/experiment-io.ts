import { Prisma, prisma } from "../../../src/db";
import {
  createEvent,
  createEventsCh,
  toClickhouseDateTime,
} from "../../../src/server";
import { jitter, utcDayStartMs } from "./rng";
import { ScenarioDefinition, SeedError, SeedSummary } from "./types";
import { countRows } from "./verify";

const ITEMS: {
  name: string;
  input: Prisma.InputJsonValue;
  expectedOutput: Prisma.InputJsonValue;
  output: Prisma.InputJsonValue;
}[] = [
  {
    name: "chat",
    input: [
      { role: "system", content: "Answer with a short Markdown checklist." },
      { role: "user", content: "How should I prepare for a weekend hike?" },
    ],
    expectedOutput: { essentials: ["water", "map", "rain jacket"] },
    output: [
      {
        role: "assistant",
        content:
          "## Hiking checklist\n- Bring **water** and snacks.\n- Download a map.\n- Pack a rain jacket.",
      },
    ],
  },
  {
    name: "retrieval",
    input: {
      query: "How do I change the display theme?",
      filters: { collections: ["help", "settings"], language: "en" },
      options: { limit: 2, includeSources: true },
    },
    expectedOutput: { answer: "Open Settings, then Appearance." },
    output: {
      answer: "Open **Settings → Appearance** and choose a theme.",
      sources: [
        { title: "Appearance", section: { heading: "Theme", page: 2 } },
        { title: "Preferences", section: { heading: "Display", page: 1 } },
      ],
      confidence: 0.96,
    },
  },
  {
    name: "planning",
    input: {
      task: "Plan a quiet afternoon indoors.",
      preferences: { interests: ["reading", "cooking"], availableHours: 3 },
      constraints: { budget: { amount: 20, currency: "EUR" }, travel: false },
    },
    expectedOutput: { activities: ["read", "cook"], fitsBudget: true },
    output: {
      plan: [
        {
          activity: "Read a book",
          durationMinutes: 90,
          supplies: ["book", "tea"],
        },
        {
          activity: "Cook soup",
          durationMinutes: 60,
          supplies: ["vegetables", "stock"],
        },
      ],
      totals: { durationMinutes: 150, estimatedCost: 12.5 },
      notes: null,
    },
  },
];

/** Long enough that the Large preset still clips it, short of the 1000-character list truncation. */
const LONG_CHAT_OUTPUT = [
  {
    role: "assistant",
    content: [
      "## Hiking checklist",
      "",
      "A weekend in the hills needs more than a water bottle. Pack this before you leave, then read it once more at the trailhead. The point of writing it down is that you can check every line without opening another screen.",
      "",
      "- Bring two liters of water and a salty snack.",
      "- Download the map while you still have a signal.",
      "- Pack a rain jacket even when the morning looks clear.",
      "- Tell someone your route and when you expect to be back.",
      "- Wear boots you have already walked in.",
      "- Carry a small light in case the return runs long.",
      "- Keep a spare layer at the top of the bag.",
      "- Turn back if the weather changes faster than the forecast.",
      "- Leave the summit when you still have daylight for the descent.",
      "- Note the last water source on the way up, not on the way down.",
      "- Start down while you can still see the trail markers.",
      "- Empty your pockets of trash before you reach the car.",
    ].join("\n"),
  },
];

export const experimentIoScenario: ScenarioDefinition = {
  name: "experiment-io",
  description:
    "One v4 experiment with three structured I/O items: chat messages, retrieval results, and a nested plan, for the Formatted/JSON display switch.",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "write v4 events (required by experiment results)",
    },
    {
      flag: "compare",
      type: "boolean",
      default: false,
      description:
        "write a second run on the same dataset whose chat output is long enough to need a taller comparison row",
    },
  ],
  run: async (ctx, params): Promise<SeedSummary> => {
    const startedAt = Date.now();
    const timestamp = utcDayStartMs();
    const compare = params.compare === true;
    const datasetId = `${ctx.idPrefix}-dataset`;
    const experimentId = `${ctx.idPrefix}-experiment`;
    const comparisonExperimentId = `${ctx.idPrefix}-experiment-b`;
    const experimentName = `Structured I/O (${ctx.idPrefix})`;
    const runs = compare
      ? [
          { id: experimentId, name: experimentName },
          {
            id: comparisonExperimentId,
            name: `${experimentName} long output`,
          },
        ]
      : [{ id: experimentId, name: experimentName }];
    const traceIds = runs.flatMap((_, runIndex) =>
      ITEMS.map(
        (item) =>
          `${ctx.idPrefix}-trace-${runIndex === 0 ? "" : "b-"}${item.name}`,
      ),
    );
    // A fixed version lets re-runs update these synthetic items in place.
    const validFrom = new Date(0);
    const counts = {
      datasets: 1,
      experiments: runs.length,
      datasetItems: ITEMS.length,
      events: ITEMS.length * runs.length,
    };
    const baselineId = compare ? comparisonExperimentId : experimentId;
    const links = [
      `${ctx.baseUrl}/project/${ctx.projectId}/experiments/results?baseline=${encodeURIComponent(baselineId)}${compare ? `&c=${encodeURIComponent(experimentId)}&layout=grid` : ""}`,
    ];
    const verified: Record<string, number> = {};

    if (!ctx.dryRun) {
      ctx.log(
        compare
          ? "writing two experiments on one dataset, one with a long chat output"
          : "writing one experiment with three structured I/O items",
      );
      await prisma.$transaction(async (tx) => {
        const dataset = {
          id: datasetId,
          projectId: ctx.projectId,
          name: `seed/experiment-io/${ctx.idPrefix}`,
          description: "Synthetic chat and nested JSON examples.",
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
            id: `${ctx.idPrefix}-item-${item.name}`,
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

      const events = runs.flatMap((run, runIndex) =>
        ITEMS.map((item, index) => {
          const spanId = `${ctx.idPrefix}-span-${runIndex === 0 ? "" : "b-"}${item.name}`;
          const input = JSON.stringify(item.input);
          const output = JSON.stringify(
            compare && runIndex === 1 && item.name === "chat"
              ? LONG_CHAT_OUTPUT
              : item.output,
          );
          const startTime =
            timestamp +
            runIndex * 60_000 +
            index * 1000 +
            jitter(ctx.seed, runIndex * ITEMS.length + index, 100);
          return createEvent({
            id: spanId,
            span_id: spanId,
            trace_id: traceIds[runIndex * ITEMS.length + index],
            parent_span_id: "",
            project_id: ctx.projectId,
            environment: ctx.environment,
            name: `experiment-io-${item.name}`,
            trace_name: `experiment-io-${item.name}`,
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
            experiment_item_id: `${ctx.idPrefix}-item-${item.name}`,
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
        }),
      );
      await createEventsCh(events);

      verified.datasets = await prisma.dataset.count({
        where: { id: datasetId, projectId: ctx.projectId },
      });
      verified.experiments = await prisma.datasetRuns.count({
        where: {
          id: { in: runs.map((run) => run.id) },
          projectId: ctx.projectId,
        },
      });
      verified.datasetItems = await prisma.datasetItem.count({
        where: { datasetId, projectId: ctx.projectId, validFrom },
      });
      verified.events = await countRows(
        "events_full",
        "project_id = {projectId: String} AND experiment_id IN {experimentIds: Array(String)} AND span_id = experiment_item_root_span_id AND isValidJSON(input) AND isValidJSON(output)",
        {
          projectId: ctx.projectId,
          experimentIds: runs.map((run) => run.id),
        },
        "uniqExact(span_id)",
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
      scenario: "experiment-io",
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
