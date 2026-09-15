import {
  createEvent,
  createEventsCh,
  createOrgProjectAndApiKey,
  createTraceScore,
  createScoresCh,
  getExperimentsFromEvents,
  getExperimentScoreOptions,
  getExperimentItemsCountFromEvents,
  getExperimentItemsFilterOptions,
} from "@langfuse/shared/src/server";
import { type FilterState } from "@langfuse/shared";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";

const maybeEventTables =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
    ? describe
    : describe.skip;

/**
 * One experiment, one item, and one score placed at the level the caller asks
 * for. Observation level means the score points at the item's root span;
 * trace level means it points only at the trace.
 */
const seedExperimentWithScore = async ({
  projectId,
  experimentName,
  startTimeMs,
  level,
  scoreName,
  value,
  stringValue,
  dataType = "NUMERIC",
}: {
  projectId: string;
  experimentName: string;
  startTimeMs: number;
  level: "observation" | "trace";
  scoreName: string;
  value: number;
  stringValue?: string;
  dataType?: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
}) => {
  const spanId = randomUUID();
  const traceId = randomUUID();
  const experimentId = `exp-${randomUUID()}`;

  await createEventsCh([
    createEvent({
      id: spanId,
      span_id: spanId,
      trace_id: traceId,
      project_id: projectId,
      name: `${experimentName}-root`,
      type: "SPAN",
      start_time: startTimeMs * 1000,
      end_time: (startTimeMs + 100) * 1000,
      experiment_id: experimentId,
      experiment_name: experimentName,
      experiment_dataset_id: "dataset-score-levels",
      experiment_item_id: randomUUID(),
      experiment_item_root_span_id: spanId,
    }),
  ]);

  await createScoresCh([
    createTraceScore({
      project_id: projectId,
      trace_id: traceId,
      observation_id: level === "observation" ? spanId : null,
      name: scoreName,
      value,
      string_value: stringValue ?? null,
      data_type: dataType,
      timestamp: startTimeMs,
    }),
  ]);

  return { experimentId, experimentName, spanId, traceId };
};

maybeEventTables("level-agnostic experiment score filters", () => {
  it("matches an experiment whose score sits at either level", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const startTimeMs = Date.now();
    const scoreName = `accuracy-${randomUUID().slice(0, 8)}`;

    const observationLevel = await seedExperimentWithScore({
      projectId,
      experimentName: "obs-level-run",
      startTimeMs,
      level: "observation",
      scoreName,
      value: 0.9,
    });
    const traceLevel = await seedExperimentWithScore({
      projectId,
      experimentName: "trace-level-run",
      startTimeMs,
      level: "trace",
      scoreName,
      value: 0.9,
    });
    // Same score name, below the threshold: proves the filter compares values
    // rather than merely detecting the name's presence.
    const belowThreshold = await seedExperimentWithScore({
      projectId,
      experimentName: "low-score-run",
      startTimeMs,
      level: "trace",
      scoreName,
      value: 0.1,
    });

    const filter: FilterState = [
      {
        type: "numberObject",
        column: "scores_avg",
        key: scoreName,
        operator: ">",
        value: 0.5,
      },
    ];

    const rows = await getExperimentsFromEvents({ projectId, filter });
    const matchedIds = rows.map((row) => row.id);

    expect(matchedIds).toContain(observationLevel.experimentId);
    expect(matchedIds).toContain(traceLevel.experimentId);
    expect(matchedIds).not.toContain(belowThreshold.experimentId);
  });

  it("keeps matching through the legacy obs_scores_avg column", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const startTimeMs = Date.now();
    const scoreName = `legacy-${randomUUID().slice(0, 8)}`;

    const observationLevel = await seedExperimentWithScore({
      projectId,
      experimentName: "legacy-obs-run",
      startTimeMs,
      level: "observation",
      scoreName,
      value: 0.9,
    });

    // A second run without that score, so a silently dropped column would show
    // up as an extra row rather than passing by having nothing to exclude.
    await seedExperimentWithScore({
      projectId,
      experimentName: "legacy-unscored-run",
      startTimeMs,
      level: "observation",
      scoreName: `other-${randomUUID().slice(0, 8)}`,
      value: 0.9,
    });

    // Saved views and bookmarked URLs still carry the old column id. An
    // unresolved column is dropped silently, which would widen the result set
    // instead of failing loudly - so assert the filter still bites.
    const rows = await getExperimentsFromEvents({
      projectId,
      filter: [
        {
          type: "numberObject",
          column: "obs_scores_avg",
          key: scoreName,
          operator: ">",
          value: 0.5,
        },
      ],
    });

    expect(rows.map((row) => row.id)).toEqual([observationLevel.experimentId]);
  });

  it("excludes a categorical value at whichever level it sits", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const startTimeMs = Date.now();
    const scoreName = `verdict-${randomUUID().slice(0, 8)}`;

    const traceLevel = await seedExperimentWithScore({
      projectId,
      experimentName: "trace-verdict-run",
      startTimeMs,
      level: "trace",
      scoreName,
      value: 0,
      stringValue: "bad",
      dataType: "CATEGORICAL",
    });
    const keptRun = await seedExperimentWithScore({
      projectId,
      experimentName: "kept-verdict-run",
      startTimeMs,
      level: "observation",
      scoreName,
      value: 0,
      stringValue: "good",
      dataType: "CATEGORICAL",
    });

    const rows = await getExperimentsFromEvents({
      projectId,
      filter: [
        {
          type: "categoryOptions",
          column: "score_categories",
          key: scoreName,
          operator: "none of",
          value: ["bad"],
        },
      ],
    });
    const matchedIds = rows.map((row) => row.id);

    expect(matchedIds).toContain(keptRun.experimentId);
    expect(matchedIds).not.toContain(traceLevel.experimentId);
  });

  it("offers each score name once, tagged with the levels it exists at", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const startTimeMs = Date.now();
    const bothLevels = `both-${randomUUID().slice(0, 8)}`;
    const traceOnly = `trace-only-${randomUUID().slice(0, 8)}`;

    const first = await seedExperimentWithScore({
      projectId,
      experimentName: "options-obs-run",
      startTimeMs,
      level: "observation",
      scoreName: bothLevels,
      value: 0.5,
    });
    const second = await seedExperimentWithScore({
      projectId,
      experimentName: "options-trace-run",
      startTimeMs,
      level: "trace",
      scoreName: bothLevels,
      value: 0.5,
    });
    const third = await seedExperimentWithScore({
      projectId,
      experimentName: "options-trace-only-run",
      startTimeMs,
      level: "trace",
      scoreName: traceOnly,
      value: 0.5,
    });

    const options = await getExperimentScoreOptions({
      projectId,
      experimentIds: [
        first.experimentId,
        second.experimentId,
        third.experimentId,
      ],
    });

    expect(options.scores_avg.filter((name) => name === bothLevels)).toEqual([
      bothLevels,
    ]);
    expect(options.scores_avg).toContain(traceOnly);
    expect(options.score_name_levels_numeric[bothLevels]).toEqual([
      "observation",
      "trace",
    ]);
    expect(options.score_name_levels_numeric[traceOnly]).toEqual(["trace"]);
  });
});

maybeEventTables("level-agnostic experiment ITEM score filters", () => {
  const filterFor = (
    experimentId: string,
    filters: FilterState,
  ): { experimentId: string; filters: FilterState }[] => [
    { experimentId, filters },
  ];

  it("qualifies an item whose score sits at either level", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const startTimeMs = Date.now();
    const scoreName = `item-accuracy-${randomUUID().slice(0, 8)}`;

    const observationLevel = await seedExperimentWithScore({
      projectId,
      experimentName: "item-obs-level",
      startTimeMs,
      level: "observation",
      scoreName,
      value: 0.9,
    });
    const traceLevel = await seedExperimentWithScore({
      projectId,
      experimentName: "item-trace-level",
      startTimeMs,
      level: "trace",
      scoreName,
      value: 0.9,
    });
    const belowThreshold = await seedExperimentWithScore({
      projectId,
      experimentName: "item-low-score",
      startTimeMs,
      level: "trace",
      scoreName,
      value: 0.1,
    });

    const above: FilterState = [
      {
        type: "numberObject",
        column: "scores_avg",
        key: scoreName,
        operator: ">",
        value: 0.5,
      },
    ];

    // Each experiment holds exactly one item, so the count IS "did the item
    // qualify" — separating the levels rather than relying on one mixed run.
    await expect(
      getExperimentItemsCountFromEvents({
        projectId,
        compExperimentIds: [observationLevel.experimentId],
        filterByExperiment: filterFor(observationLevel.experimentId, above),
      }),
    ).resolves.toBe(1);
    await expect(
      getExperimentItemsCountFromEvents({
        projectId,
        compExperimentIds: [traceLevel.experimentId],
        filterByExperiment: filterFor(traceLevel.experimentId, above),
      }),
    ).resolves.toBe(1);
    await expect(
      getExperimentItemsCountFromEvents({
        projectId,
        compExperimentIds: [belowThreshold.experimentId],
        filterByExperiment: filterFor(belowThreshold.experimentId, above),
      }),
    ).resolves.toBe(0);
  });

  it("keeps qualifying through the legacy obs_scores_avg column", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const startTimeMs = Date.now();
    const scoreName = `item-legacy-${randomUUID().slice(0, 8)}`;

    const run = await seedExperimentWithScore({
      projectId,
      experimentName: "item-legacy-obs",
      startTimeMs,
      level: "observation",
      scoreName,
      value: 0.9,
    });

    // An unresolved column is dropped silently, which would let the item
    // qualify for the wrong reason — so assert the threshold still bites.
    await expect(
      getExperimentItemsCountFromEvents({
        projectId,
        compExperimentIds: [run.experimentId],
        filterByExperiment: filterFor(run.experimentId, [
          {
            type: "numberObject",
            column: "obs_scores_avg",
            key: scoreName,
            operator: ">",
            value: 0.5,
          },
        ]),
      }),
    ).resolves.toBe(1);
    await expect(
      getExperimentItemsCountFromEvents({
        projectId,
        compExperimentIds: [run.experimentId],
        filterByExperiment: filterFor(run.experimentId, [
          {
            type: "numberObject",
            column: "obs_scores_avg",
            key: scoreName,
            operator: ">",
            value: 0.95,
          },
        ]),
      }),
    ).resolves.toBe(0);
  });

  it("excludes a categorical value at whichever level it sits", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const startTimeMs = Date.now();
    const scoreName = `item-verdict-${randomUUID().slice(0, 8)}`;

    const traceLevel = await seedExperimentWithScore({
      projectId,
      experimentName: "item-trace-verdict",
      startTimeMs,
      level: "trace",
      scoreName,
      value: 0,
      stringValue: "bad",
      dataType: "CATEGORICAL",
    });
    const kept = await seedExperimentWithScore({
      projectId,
      experimentName: "item-kept-verdict",
      startTimeMs,
      level: "observation",
      scoreName,
      value: 0,
      stringValue: "good",
      dataType: "CATEGORICAL",
    });

    const excludeBad: FilterState = [
      {
        type: "categoryOptions",
        column: "score_categories",
        key: scoreName,
        operator: "none of",
        value: ["bad"],
      },
    ];

    await expect(
      getExperimentItemsCountFromEvents({
        projectId,
        compExperimentIds: [traceLevel.experimentId],
        filterByExperiment: filterFor(traceLevel.experimentId, excludeBad),
      }),
    ).resolves.toBe(0);
    await expect(
      getExperimentItemsCountFromEvents({
        projectId,
        compExperimentIds: [kept.experimentId],
        filterByExperiment: filterFor(kept.experimentId, excludeBad),
      }),
    ).resolves.toBe(1);
  });

  it("offers each item score name once, tagged with its levels", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const startTimeMs = Date.now();
    const bothLevels = `item-both-${randomUUID().slice(0, 8)}`;

    const first = await seedExperimentWithScore({
      projectId,
      experimentName: "item-options-obs",
      startTimeMs,
      level: "observation",
      scoreName: bothLevels,
      value: 0.5,
    });
    const second = await seedExperimentWithScore({
      projectId,
      experimentName: "item-options-trace",
      startTimeMs,
      level: "trace",
      scoreName: bothLevels,
      value: 0.5,
    });

    const options = await getExperimentItemsFilterOptions({
      projectId,
      experimentIds: [first.experimentId, second.experimentId],
    });

    expect(options.scores_avg.filter((name) => name === bothLevels)).toEqual([
      bothLevels,
    ]);
    expect(options.score_name_levels_numeric[bothLevels]).toEqual([
      "observation",
      "trace",
    ]);
  });
});
