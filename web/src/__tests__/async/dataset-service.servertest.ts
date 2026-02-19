import {
  createDatasetRunItemsCh,
  createObservationsCh,
  createScoresCh,
  createTracesCh,
  getDatasetRunItemsByDatasetIdCh,
  getDatasetRunsTableMetricsCh,
  getScoresForDatasetRuns,
  getTraceScoresForDatasetRuns,
  getDatasetRunItemsWithoutIOByItemIds,
  createDatasetRunItem,
  getDatasetItemIdsWithRunData,
  createDatasetItem,
  createManyDatasetItems,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createObservation,
  createTraceScore,
  createTrace,
} from "@langfuse/shared/src/server";
import {
  enrichAndMapToDatasetItemId,
  getRunItemsByRunIdOrItemId,
} from "@/src/features/datasets/server/service";
import {
  aggregateScores,
  composeAggregateScoreKey,
} from "@/src/features/scores/lib/aggregateScores";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
  "true";
process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION = "true";

describe("Fetch datasets for UI presentation", () => {
  it("should fetch dataset runs for UI", async () => {
    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });
    const datasetRunId = v4();
    const datasetRun2Id = v4();
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    await prisma.datasetRuns.create({
      data: {
        id: datasetRunId,
        name: "run1",
        datasetId,
        metadata: {},
        projectId,
        createdAt: now,
      },
    });

    await prisma.datasetRuns.create({
      data: {
        id: datasetRun2Id,
        name: "run2",
        datasetId,
        metadata: {},
        projectId,
        createdAt: oneMinuteAgo,
      },
    });

    const datasetItemId = v4();
    const datasetItemId2 = v4();
    const datasetItemId3 = v4();
    const datasetItemId4 = v4();

    await createManyDatasetItems({
      projectId,
      items: [
        { id: datasetItemId, datasetId, metadata: {} },
        { id: datasetItemId2, datasetId, metadata: {} },
        { id: datasetItemId3, datasetId, metadata: {} },
        { id: datasetItemId4, datasetId, metadata: {} },
      ],
    });

    const datasetRunItemId = v4();
    const datasetRunItemId2 = v4();
    const datasetRunItemId3 = v4();
    const datasetRunItemId4 = v4();
    const observationId = v4();
    const traceId = v4();
    const traceId2 = v4();
    const traceId3 = v4();
    const traceId4 = v4();
    const scoreId = v4();
    const scoreId2 = v4();
    const scoreId3 = v4();
    const scoreName = v4();

    const datasetRunItem1 = createDatasetRunItem({
      id: datasetRunItemId,
      dataset_run_id: datasetRunId,
      observation_id: observationId,
      trace_id: traceId,
      project_id: projectId,
      dataset_item_id: datasetItemId,
      dataset_id: datasetId,
      dataset_run_name: "run1",
      dataset_run_created_at: now.getTime(),
    });

    const datasetRunItem2 = createDatasetRunItem({
      id: datasetRunItemId2,
      dataset_run_id: datasetRunId,
      observation_id: null,
      trace_id: traceId2,
      project_id: projectId,
      dataset_item_id: datasetItemId2,
      dataset_id: datasetId,
      dataset_run_name: "run1",
      dataset_run_created_at: now.getTime(),
    });

    const datasetRunItem3 = createDatasetRunItem({
      id: datasetRunItemId3,
      dataset_run_id: datasetRunId,
      observation_id: null,
      trace_id: traceId3,
      project_id: projectId,
      dataset_item_id: datasetItemId3,
      dataset_id: datasetId,
      dataset_run_name: "run1",
      dataset_run_created_at: now.getTime(),
    });

    const datasetRunItem4 = createDatasetRunItem({
      id: datasetRunItemId4,
      dataset_run_id: datasetRun2Id,
      observation_id: null,
      trace_id: traceId4,
      project_id: projectId,
      dataset_item_id: datasetItemId4,
      dataset_id: datasetId,
      dataset_run_name: "run2",
      dataset_run_created_at: oneMinuteAgo.getTime(),
    });

    await createDatasetRunItemsCh([
      datasetRunItem1,
      datasetRunItem2,
      datasetRunItem3,
      datasetRunItem4,
    ]);

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 60, // minus 1 min
      end_time: new Date().getTime(),
    });
    const observation2 = createObservation({
      trace_id: traceId2,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 60, // minus 1 min
      end_time: new Date().getTime(),
    });
    const observation3 = createObservation({
      trace_id: traceId2,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 30,
      end_time: new Date().getTime(),
      total_cost: 200,
    });
    const observation4 = createObservation({
      trace_id: traceId3,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 300,
      end_time: new Date().getTime(),
      total_cost: 50,
    });
    const observation5 = createObservation({
      trace_id: traceId4,
      project_id: projectId,
      start_time: new Date().getTime() - 1000,
      end_time: new Date().getTime(),
    });
    const observation6 = createObservation({
      trace_id: traceId,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 60, // minus 1 min
      end_time: new Date().getTime(),
    });
    await createObservationsCh([
      observation,
      observation2,
      observation3,
      observation4,
      observation5,
      observation6,
    ]);
    const score = createTraceScore({
      id: scoreId,
      observation_id: observationId,
      trace_id: traceId,
      project_id: projectId,
      name: scoreName,
    });
    const score2 = createTraceScore({
      id: scoreId2,
      observation_id: null,
      trace_id: traceId,
      project_id: projectId,
      name: scoreName,
      value: 1,
      comment: "some other comment",
    });
    const observationId2 = v4(); // this one is not related to a run
    const anotherScoreName = v4();

    const score3 = createTraceScore({
      id: scoreId3,
      observation_id: observationId2,
      trace_id: traceId,
      project_id: projectId,
      name: anotherScoreName,
      value: 1,
      comment: "some other comment for non run related score",
    });
    await createScoresCh([score, score2, score3]);

    // Get runs that have metrics (only runs with dataset_run_items_rmt)
    const runsWithMetrics = await getDatasetRunsTableMetricsCh({
      projectId: projectId,
      datasetId: datasetId,
      runIds: [datasetRunId, datasetRun2Id],
      filter: [],
    });

    // Only fetch scores for runs that have metrics (runs without dataset_run_items_rmt won't have trace scores)
    const runsWithMetricsIds = runsWithMetrics.map((run) => run.id);
    const [traceScores, runScores] = await Promise.all([
      runsWithMetricsIds.length > 0
        ? getTraceScoresForDatasetRuns(projectId, runsWithMetricsIds)
        : [],
      getScoresForDatasetRuns({
        projectId: projectId,
        runIds: runsWithMetrics.map((run) => run.id),
        includeHasMetadata: true,
        excludeMetadata: false,
      }),
    ]);

    // Merge all runs: use metrics where available, defaults otherwise
    const allRuns = runsWithMetrics.map((run) => {
      return {
        id: run.id,
        name: run.name,
        // Use ClickHouse metrics if available, otherwise use defaults for runs without dataset_run_items_rmt
        countRunItems: run.countRunItems ?? 0,
        avgTotalCost: run.avgTotalCost ?? null,
        totalCost: run.totalCost ?? null,
        avgLatency: run.avgLatency ?? null,
        scores: aggregateScores(
          traceScores.filter((s) => s.datasetRunId === run.id),
        ),
        runScores: aggregateScores(
          runScores.filter((s) => s.datasetRunId === run.id),
        ),
      };
    });

    expect(allRuns).toHaveLength(2);

    // Verify runs are returned in chronological order (oldest first, most recent last)
    expect(allRuns[0].id).toEqual(datasetRunId); // First run (older)
    expect(allRuns[1].id).toEqual(datasetRun2Id); // Second run (more recent)
    expect(allRuns[0].name).toEqual("run1");
    expect(allRuns[1].name).toEqual("run2");

    const firstRun = allRuns.find((run) => run.id === datasetRunId);
    expect(firstRun).toBeDefined();
    if (!firstRun) {
      throw new Error("first run is not defined");
    }
    expect(firstRun.id).toEqual(datasetRunId);

    expect(firstRun.avgLatency).toBeGreaterThanOrEqual(10800);
    expect(firstRun.avgTotalCost?.toString()).toStrictEqual("275");
    expect(firstRun.totalCost?.toString()).toStrictEqual("550");

    const expectedObject = {
      [`${scoreName.replaceAll("-", "_")}-API-NUMERIC`]: {
        type: "NUMERIC",
        values: expect.arrayContaining([1, 100.5]),
        average: 50.75,
        id: undefined,
        comment: undefined,
        hasMetadata: undefined,
        timestamp: undefined,
      },
      [`${anotherScoreName.replaceAll("-", "_")}-API-NUMERIC`]: {
        id: score3.id,
        type: "NUMERIC",
        values: expect.arrayContaining([1]),
        average: 1,
        comment: "some other comment for non run related score",
        hasMetadata: true,
        timestamp: expect.any(Date),
      },
    };

    expect(firstRun.scores).toEqual(expectedObject);

    const secondRun = allRuns.find((run) => run.id === datasetRun2Id);

    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("second run is not defined");
    }

    expect(secondRun.id).toEqual(datasetRun2Id);
    expect(secondRun.avgLatency).toBeGreaterThanOrEqual(1);
    expect(secondRun.avgLatency).toBeLessThanOrEqual(1.002);
    expect(secondRun.avgTotalCost?.toString()).toStrictEqual("300");

    expect(JSON.stringify(secondRun.scores)).toEqual(JSON.stringify({}));
  });

  it("should test that dataset runs can link to the same traces", async () => {
    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });
    const datasetRunId = v4();
    const datasetRun2Id = v4();
    await prisma.datasetRuns.create({
      data: {
        id: datasetRunId,
        name: v4(),
        datasetId,
        metadata: {},
        projectId,
      },
    });

    await prisma.datasetRuns.create({
      data: {
        id: datasetRun2Id,
        name: v4(),
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const res = await createDatasetItem({
      datasetId,
      metadata: {},
      projectId,
    });
    if (!res.success) {
      throw new Error("Failed to create dataset item");
    }
    const datasetItemId = res.datasetItem.id;

    const datasetRunItemId = v4();
    const datasetRunItemId2 = v4();
    const traceId = v4();
    const scoreId = v4();

    const datasetRunItem1 = createDatasetRunItem({
      id: datasetRunItemId,
      dataset_run_id: datasetRunId,
      observation_id: null,
      trace_id: traceId,
      project_id: projectId,
      dataset_item_id: datasetItemId,
      dataset_id: datasetId,
    });

    const datasetRunItem2 = createDatasetRunItem({
      id: datasetRunItemId2,
      dataset_run_id: datasetRun2Id,
      observation_id: null,
      trace_id: traceId,
      project_id: projectId,
      dataset_item_id: datasetItemId,
      dataset_id: datasetId,
    });

    await createDatasetRunItemsCh([datasetRunItem1, datasetRunItem2]);

    const scoreName = v4();
    const score = createTraceScore({
      id: scoreId,
      observation_id: null,
      trace_id: traceId,
      project_id: projectId,
      name: scoreName,
    });

    await createScoresCh([score]);

    // Get runs that have metrics (only runs with dataset_run_items_rmt)
    const runsWithMetrics = await getDatasetRunsTableMetricsCh({
      projectId: projectId,
      datasetId: datasetId,
      runIds: [datasetRunId, datasetRun2Id],
      filter: [],
    });

    // Only fetch scores for runs that have metrics (runs without dataset_run_items_rmt won't have trace scores)
    const runsWithMetricsIds = runsWithMetrics.map((run) => run.id);
    const [traceScores, runScores] = await Promise.all([
      runsWithMetricsIds.length > 0
        ? getTraceScoresForDatasetRuns(projectId, runsWithMetricsIds)
        : [],
      getScoresForDatasetRuns({
        projectId: projectId,
        runIds: runsWithMetrics.map((run) => run.id),
        includeHasMetadata: true,
        excludeMetadata: false,
      }),
    ]);

    // Merge all runs: use metrics where available, defaults otherwise
    const allRuns = runsWithMetrics.map((run) => {
      return {
        id: run.id,
        name: run.name,
        // Use ClickHouse metrics if available, otherwise use defaults for runs without dataset_run_items_rmt
        countRunItems: run.countRunItems ?? 0,
        avgTotalCost: run.avgTotalCost ?? null,
        totalCost: run.totalCost ?? null,
        avgLatency: run.avgLatency ?? null,
        scores: aggregateScores(
          traceScores.filter((s) => s.datasetRunId === run.id),
        ),
        runScores: aggregateScores(
          runScores.filter((s) => s.datasetRunId === run.id),
        ),
      };
    });

    expect(allRuns).toHaveLength(2);

    const firstRun = allRuns.find((run) => run.id === datasetRunId);
    expect(firstRun).toBeDefined();
    if (!firstRun) {
      throw new Error("first run is not defined");
    }
    expect(firstRun.id).toEqual(datasetRunId);

    expect(firstRun.avgLatency).toBeGreaterThanOrEqual(0);
    expect(firstRun.avgTotalCost?.toString()).toStrictEqual("0");

    const expectedObject = {
      [`${scoreName.replaceAll("-", "_")}-API-NUMERIC`]: {
        id: score.id,
        type: "NUMERIC",
        values: expect.arrayContaining([100.5]),
        average: 100.5,
        comment: "comment",
        // createScore adds metadata to the score
        hasMetadata: true,
        timestamp: expect.any(Date),
      },
    };

    expect(firstRun.scores).toEqual(expectedObject);

    const secondRun = allRuns.find((run) => run.id === datasetRun2Id);

    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("second run is not defined");
    }

    expect(secondRun.id).toEqual(datasetRun2Id);
    expect(secondRun.avgLatency).toEqual(0);
    expect(secondRun.avgTotalCost?.toString()).toStrictEqual("0");

    expect(firstRun.scores).toEqual(expectedObject);
  });

  describe("Dataset Run Score Filtering", () => {
    it("should filter dataset runs by numeric scores", async () => {
      const datasetId = v4();

      await prisma.dataset.create({
        data: {
          id: datasetId,
          name: v4(),
          projectId: projectId,
        },
      });

      // Create dataset runs
      const highScoreRunId = v4();
      const lowScoreRunId = v4();
      const noScoreRunId = v4();

      await prisma.datasetRuns.create({
        data: {
          id: highScoreRunId,
          name: "high-accuracy-run",
          datasetId,
          metadata: {},
          projectId,
        },
      });

      await prisma.datasetRuns.create({
        data: {
          id: lowScoreRunId,
          name: "low-accuracy-run",
          datasetId,
          metadata: {},
          projectId,
        },
      });

      await prisma.datasetRuns.create({
        data: {
          id: noScoreRunId,
          name: "no-score-run",
          datasetId,
          metadata: {},
          projectId,
        },
      });

      // Create dataset items
      const itemId1 = v4();
      const itemId2 = v4();
      const itemId3 = v4();

      await createManyDatasetItems({
        projectId,
        items: [
          { id: itemId1, datasetId, metadata: {} },
          { id: itemId2, datasetId, metadata: {} },
          { id: itemId3, datasetId, metadata: {} },
        ],
      });

      // Create traces and observations
      const traceId1 = v4();
      const traceId2 = v4();
      const traceId3 = v4();

      // Create dataset run items
      const runItem1 = createDatasetRunItem({
        id: v4(),
        dataset_run_id: highScoreRunId,
        trace_id: traceId1,
        project_id: projectId,
        dataset_item_id: itemId1,
        dataset_id: datasetId,
        dataset_run_name: "high-accuracy-run",
      });

      const runItem2 = createDatasetRunItem({
        id: v4(),
        dataset_run_id: lowScoreRunId,
        trace_id: traceId2,
        project_id: projectId,
        dataset_item_id: itemId2,
        dataset_id: datasetId,
        dataset_run_name: "low-accuracy-run",
      });

      const runItem3 = createDatasetRunItem({
        id: v4(),
        dataset_run_id: noScoreRunId,
        trace_id: traceId3,
        project_id: projectId,
        dataset_item_id: itemId3,
        dataset_id: datasetId,
        dataset_run_name: "no-score-run",
      });

      await createDatasetRunItemsCh([runItem1, runItem2, runItem3]);

      // Create observations for latency calculation
      const observation1 = createObservation({
        trace_id: traceId1,
        project_id: projectId,
        start_time: new Date().getTime() - 2000,
        end_time: new Date().getTime() - 1000,
      });

      const observation2 = createObservation({
        trace_id: traceId2,
        project_id: projectId,
        start_time: new Date().getTime() - 3000,
        end_time: new Date().getTime() - 1000,
      });

      const observation3 = createObservation({
        trace_id: traceId3,
        project_id: projectId,
        start_time: new Date().getTime() - 1000,
        end_time: new Date().getTime(),
      });

      await createObservationsCh([observation1, observation2, observation3]);

      // Create scores with different values for the same score name
      const highAccuracyScore = createTraceScore({
        id: v4(),
        trace_id: traceId1,
        project_id: projectId,
        name: "accuracy",
        value: 0.95, // High accuracy
      });

      const lowAccuracyScore = createTraceScore({
        id: v4(),
        trace_id: traceId2,
        project_id: projectId,
        name: "accuracy",
        value: 0.65, // Low accuracy
      });

      const highPrecisionScore = createTraceScore({
        id: v4(),
        trace_id: traceId1,
        project_id: projectId,
        name: "precision",
        value: 0.88,
      });

      // No scores for traceId3 to test filtering behavior

      await createScoresCh([
        highAccuracyScore,
        lowAccuracyScore,
        highPrecisionScore,
      ]);

      // Test 1: Filter for runs with accuracy > 0.8
      const highAccuracyRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [highScoreRunId, lowScoreRunId, noScoreRunId],
        filter: [
          {
            type: "numberObject" as const,
            column: "agg_scores_avg",
            key: "accuracy",
            operator: ">" as const,
            value: 0.8,
          },
        ],
      });

      expect(highAccuracyRuns).toHaveLength(1);
      expect(highAccuracyRuns[0].id).toEqual(highScoreRunId);
      expect(highAccuracyRuns[0].name).toEqual("high-accuracy-run");

      // Test 2: Filter for runs with accuracy >= 0.65 (should include both)
      const mediumAccuracyRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [highScoreRunId, lowScoreRunId, noScoreRunId],
        filter: [
          {
            type: "numberObject" as const,
            column: "agg_scores_avg",
            key: "accuracy",
            operator: ">=" as const,
            value: 0.65,
          },
        ],
      });

      expect(mediumAccuracyRuns).toHaveLength(2);
      const runIds = mediumAccuracyRuns.map((run) => run.id);
      expect(runIds).toContain(highScoreRunId);
      expect(runIds).toContain(lowScoreRunId);

      // Test 3: Filter for runs with precision = 0.88
      const precisionRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [highScoreRunId, lowScoreRunId, noScoreRunId],
        filter: [
          {
            type: "numberObject" as const,
            column: "agg_scores_avg",
            key: "precision",
            operator: "=" as const,
            value: 0.88,
          },
        ],
      });

      expect(precisionRuns).toHaveLength(1);
      expect(precisionRuns[0].id).toEqual(highScoreRunId);
    });

    it("should filter dataset runs by categorical scores", async () => {
      const datasetId = v4();

      await prisma.dataset.create({
        data: {
          id: datasetId,
          name: v4(),
          projectId: projectId,
        },
      });

      // Create dataset runs
      const excellentRunId = v4();
      const goodRunId = v4();
      const poorRunId = v4();

      await prisma.datasetRuns.createMany({
        data: [
          {
            id: excellentRunId,
            name: "excellent-quality-run",
            datasetId,
            metadata: {},
            projectId,
          },
          {
            id: goodRunId,
            name: "good-quality-run",
            datasetId,
            metadata: {},
            projectId,
          },
          {
            id: poorRunId,
            name: "poor-quality-run",
            datasetId,
            metadata: {},
            projectId,
          },
        ],
      });

      // Create dataset items and traces
      const itemIds = [v4(), v4(), v4()];
      const traceIds = [v4(), v4(), v4()];

      await createManyDatasetItems({
        projectId,
        items: itemIds.map((id) => ({
          id,
          datasetId,
          metadata: {},
        })),
      });

      // Create dataset run items
      const runItems = [
        createDatasetRunItem({
          id: v4(),
          dataset_run_id: excellentRunId,
          trace_id: traceIds[0],
          project_id: projectId,
          dataset_item_id: itemIds[0],
          dataset_id: datasetId,
          dataset_run_name: "excellent-quality-run",
        }),
        createDatasetRunItem({
          id: v4(),
          dataset_run_id: goodRunId,
          trace_id: traceIds[1],
          project_id: projectId,
          dataset_item_id: itemIds[1],
          dataset_id: datasetId,
          dataset_run_name: "good-quality-run",
        }),
        createDatasetRunItem({
          id: v4(),
          dataset_run_id: poorRunId,
          trace_id: traceIds[2],
          project_id: projectId,
          dataset_item_id: itemIds[2],
          dataset_id: datasetId,
          dataset_run_name: "poor-quality-run",
        }),
      ];

      await createDatasetRunItemsCh(runItems);

      // Create observations for each trace
      const observations = traceIds.map((traceId) =>
        createObservation({
          trace_id: traceId,
          project_id: projectId,
          start_time: new Date().getTime() - 1000,
          end_time: new Date().getTime(),
        }),
      );

      await createObservationsCh(observations);

      // Create categorical scores
      const qualityScores = [
        createTraceScore({
          id: v4(),
          trace_id: traceIds[0],
          project_id: projectId,
          name: "quality",
          data_type: "CATEGORICAL",
          string_value: "excellent",
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[1],
          project_id: projectId,
          name: "quality",
          data_type: "CATEGORICAL",
          string_value: "good",
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[2],
          project_id: projectId,
          name: "quality",
          data_type: "CATEGORICAL",
          string_value: "poor",
        }),
      ];

      // Add sentiment scores for more complex filtering
      const sentimentScores = [
        createTraceScore({
          id: v4(),
          trace_id: traceIds[0],
          project_id: projectId,
          name: "sentiment",
          data_type: "CATEGORICAL",
          string_value: "positive",
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[1],
          project_id: projectId,
          name: "sentiment",
          data_type: "CATEGORICAL",
          string_value: "neutral",
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[2],
          project_id: projectId,
          name: "sentiment",
          data_type: "CATEGORICAL",
          string_value: "negative",
        }),
      ];

      await createScoresCh([...qualityScores, ...sentimentScores]);

      // Test: Filter for high quality runs (excellent or good)
      const highQualityRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [excellentRunId, goodRunId, poorRunId],
        filter: [
          {
            type: "categoryOptions" as const,
            column: "agg_score_categories",
            key: "quality",
            operator: "any of" as const,
            value: ["excellent", "good"],
          },
        ],
      });

      expect(highQualityRuns).toHaveLength(2);
      const highQualityIds = highQualityRuns.map((run) => run.id);
      expect(highQualityIds).toContain(excellentRunId);
      expect(highQualityIds).toContain(goodRunId);

      // Test: Filter for runs that are NOT poor quality
      const notPoorRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [excellentRunId, goodRunId, poorRunId],
        filter: [
          {
            type: "categoryOptions" as const,
            column: "agg_score_categories",
            key: "quality",
            operator: "none of" as const,
            value: ["poor"],
          },
        ],
      });

      expect(notPoorRuns).toHaveLength(2);
      const notPoorIds = notPoorRuns.map((run) => run.id);
      expect(notPoorIds).toContain(excellentRunId);
      expect(notPoorIds).toContain(goodRunId);

      // Test: Filter for positive sentiment
      const positiveSentimentRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [excellentRunId, goodRunId, poorRunId],
        filter: [
          {
            type: "categoryOptions" as const,
            column: "agg_score_categories",
            key: "sentiment",
            operator: "any of" as const,
            value: ["positive"],
          },
        ],
      });

      expect(positiveSentimentRuns).toHaveLength(1);
      expect(positiveSentimentRuns[0].id).toEqual(excellentRunId);
    });

    it("should combine score filters with other filters", async () => {
      const datasetId = v4();

      await prisma.dataset.create({
        data: {
          id: datasetId,
          name: v4(),
          projectId: projectId,
        },
      });

      // Create dataset runs with specific names and times
      const recentRunId = v4();
      const oldRunId = v4();

      const recentDate = new Date();
      const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      await prisma.datasetRuns.create({
        data: {
          id: recentRunId,
          name: "recent-high-accuracy",
          datasetId,
          metadata: { version: "2.0" },
          projectId,
          createdAt: recentDate,
        },
      });

      await prisma.datasetRuns.create({
        data: {
          id: oldRunId,
          name: "old-high-accuracy",
          datasetId,
          metadata: { version: "1.0" },
          projectId,
          createdAt: oldDate,
        },
      });

      // Create dataset items and traces
      const itemIds = [v4(), v4()];
      const traceIds = [v4(), v4()];

      await createManyDatasetItems({
        projectId,
        items: itemIds.map((id) => ({
          id,
          datasetId,
          metadata: {},
        })),
      });

      // Create dataset run items
      const runItems = [
        createDatasetRunItem({
          id: v4(),
          dataset_run_id: recentRunId,
          trace_id: traceIds[0],
          project_id: projectId,
          dataset_item_id: itemIds[0],
          dataset_id: datasetId,
          dataset_run_name: "recent-high-accuracy",
          created_at: recentDate.getTime(),
        }),
        createDatasetRunItem({
          id: v4(),
          dataset_run_id: oldRunId,
          trace_id: traceIds[1],
          project_id: projectId,
          dataset_item_id: itemIds[1],
          dataset_id: datasetId,
          dataset_run_name: "old-high-accuracy",
          created_at: oldDate.getTime(),
        }),
      ];

      await createDatasetRunItemsCh(runItems);

      // Create observations with different costs
      const observations = [
        createObservation({
          trace_id: traceIds[0],
          project_id: projectId,
          start_time: new Date().getTime() - 1000,
          end_time: new Date().getTime(),
          total_cost: 100, // Higher cost
        }),
        createObservation({
          trace_id: traceIds[1],
          project_id: projectId,
          start_time: new Date().getTime() - 1000,
          end_time: new Date().getTime(),
          total_cost: 50, // Lower cost
        }),
      ];

      await createObservationsCh(observations);

      // Create high accuracy scores for both runs
      const scores = [
        createTraceScore({
          id: v4(),
          trace_id: traceIds[0],
          project_id: projectId,
          name: "accuracy",
          value: 0.92,
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[1],
          project_id: projectId,
          name: "accuracy",
          value: 0.94,
        }),
        createTraceScore({
          id: v4(),
          trace_id: traceIds[0],
          project_id: projectId,
          name: "sentiment",
          data_type: "CATEGORICAL",
          string_value: "positive",
        }),
      ];

      await createScoresCh(scores);

      // Test: Combine numeric score filter with category filter
      const recentHighAccuracyRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [recentRunId, oldRunId],
        filter: [
          {
            type: "numberObject" as const,
            column: "agg_scores_avg",
            key: "accuracy",
            operator: ">=" as const,
            value: 0.9,
          },
          {
            type: "categoryOptions" as const,
            column: "agg_score_categories",
            key: "sentiment",
            operator: "any of" as const,
            value: ["positive"],
          },
        ],
      });

      expect(recentHighAccuracyRuns).toHaveLength(1);
      expect(recentHighAccuracyRuns[0].id).toEqual(recentRunId);
      expect(recentHighAccuracyRuns[0].name).toEqual("recent-high-accuracy");

      // Test: All high accuracy runs (should return both)
      const allHighAccuracyRuns = await getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        runIds: [recentRunId, oldRunId],
        filter: [
          {
            type: "numberObject" as const,
            column: "agg_scores_avg",
            key: "accuracy",
            operator: ">=" as const,
            value: 0.9,
          },
        ],
      });

      expect(allHighAccuracyRuns).toHaveLength(2);
      const allIds = allHighAccuracyRuns.map((run) => run.id);
      expect(allIds).toContain(recentRunId);
      expect(allIds).toContain(oldRunId);
    });
  });

  it("should fetch dataset run items for UI", async () => {
    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });
    const datasetRunId = v4();
    await prisma.datasetRuns.create({
      data: {
        id: datasetRunId,
        name: v4(),
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const res = await createDatasetItem({
      datasetId,
      metadata: {},
      projectId,
    });

    const res2 = await createDatasetItem({
      datasetId,
      metadata: {},
      projectId,
    });

    if (!res.success || !res2.success) {
      throw new Error("Failed to create dataset item");
    }
    const datasetItemId = res.datasetItem.id;
    const datasetItemId2 = res2.datasetItem.id;
    const datasetRunItemId1 = v4();
    const traceId1 = v4();

    const datasetRunItem1 = createDatasetRunItem({
      id: datasetRunItemId1,
      dataset_run_id: datasetRunId,
      observation_id: null,
      trace_id: traceId1,
      project_id: projectId,
      dataset_item_id: datasetItemId,
      dataset_id: datasetId,
    });

    const traceId2 = v4();
    const observationId = v4();
    const datasetRunItemId2 = v4();

    const datasetRunItem2 = createDatasetRunItem({
      id: datasetRunItemId2,
      dataset_run_id: datasetRunId,
      observation_id: observationId,
      trace_id: traceId2,
      project_id: projectId,
      dataset_item_id: datasetItemId2,
      dataset_id: datasetId,
    });

    await createDatasetRunItemsCh([datasetRunItem1, datasetRunItem2]);

    const trace1 = createTrace({
      id: traceId1,
      project_id: projectId,
    });

    const trace2 = createTrace({
      id: traceId2,
      project_id: projectId,
    });

    await createTracesCh([trace1, trace2]);

    const observation = createObservation({
      id: observationId,
      trace_id: traceId2,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 60, // minus 1 min
      end_time: new Date().getTime(),
    });

    const observation2 = createObservation({
      trace_id: traceId1,
    });

    await createObservationsCh([observation]);

    const score = createTraceScore({
      observation_id: observation2.id,
      trace_id: traceId2,
      project_id: projectId,
    });

    await createScoresCh([score]);

    const runItems = await getDatasetRunItemsByDatasetIdCh({
      projectId: projectId,
      datasetId: datasetId,
      filter: [],
      orderBy: [
        {
          column: "createdAt",
          order: "ASC",
        },
      ],
      limit: 10,
      offset: 0,
    });

    const enrichedRunItems = await getRunItemsByRunIdOrItemId(
      projectId,
      runItems,
    );

    expect(enrichedRunItems).toHaveLength(2);

    const firstRunItem = enrichedRunItems.find(
      (runItem) => runItem.id === datasetRunItemId1,
    );
    expect(firstRunItem).toBeDefined();
    if (!firstRunItem) {
      throw new Error("first run item is not defined");
    }

    expect(firstRunItem.id).toEqual(datasetRunItemId1);
    expect(firstRunItem.datasetItemId).toEqual(datasetItemId);
    expect(firstRunItem.observation).toBeUndefined();
    expect(firstRunItem.trace).toBeDefined();
    expect(firstRunItem.trace?.id).toEqual(traceId1);

    const secondRunItem = enrichedRunItems.find(
      (runItem) => runItem.id === datasetRunItemId2,
    );
    expect(secondRunItem).toBeDefined();
    if (!secondRunItem) {
      throw new Error("second run item is not defined");
    }

    expect(secondRunItem.id).toEqual(datasetRunItemId2);
    expect(secondRunItem.datasetItemId).toEqual(datasetItemId2);
    expect(secondRunItem.trace?.id).toEqual(traceId2);
    expect(secondRunItem.observation?.id).toEqual(observationId);

    const expectedObject = {
      [`${score.name.replaceAll("-", "_")}-API-NUMERIC`]: {
        id: score.id,
        type: "NUMERIC",
        values: expect.arrayContaining([100.5]),
        average: 100.5,
        comment: "comment",
        timestamp: expect.any(Date),
        // createScore adds metadata to the score
        hasMetadata: true,
      },
    };

    expect(secondRunItem.scores).toEqual(expectedObject);
  });

  describe("Dataset Run Item Compare Data", () => {
    describe("Compare data without filters", () => {
      let datasetId: string;
      let run1Id: string;
      let run2Id: string;
      let run3Id: string;
      let itemIds: string[];
      let traceIds: string[];

      const accuracyKey = composeAggregateScoreKey({
        name: "accuracy",
        source: "API",
        dataType: "NUMERIC",
      });
      const relevanceKey = composeAggregateScoreKey({
        name: "relevance",
        source: "API",
        dataType: "NUMERIC",
      });

      beforeEach(async () => {
        datasetId = v4();
        run1Id = v4();
        run2Id = v4();
        run3Id = v4();
        itemIds = [v4(), v4(), v4(), v4()];
        traceIds = [v4(), v4(), v4(), v4()];

        // Create dataset
        await prisma.dataset.create({
          data: {
            id: datasetId,
            name: `compare-test-dataset-${datasetId}`,
            projectId: projectId,
          },
        });

        // Create dataset runs
        await prisma.datasetRuns.createMany({
          data: [
            {
              id: run1Id,
              name: "run-1",
              datasetId,
              metadata: { purpose: "baseline" },
              projectId,
              createdAt: new Date("2024-01-01T00:00:00Z"),
            },
            {
              id: run2Id,
              name: "run-2",
              datasetId,
              metadata: { purpose: "experiment" },
              projectId,
              createdAt: new Date("2024-01-02T00:00:00Z"),
            },
            {
              id: run3Id,
              name: "run-3",
              datasetId,
              metadata: { purpose: "validation" },
              projectId,
              createdAt: new Date("2024-01-03T00:00:00Z"),
            },
          ],
        });

        // Create dataset items with same timestamp but different IDs for pagination testing
        await createManyDatasetItems({
          projectId,
          items: itemIds.map((id, index) => ({
            id,
            datasetId,
            input: { prompt: `Test input ${index + 1}` },
            expectedOutput: { response: `Expected output ${index + 1}` },
            metadata: {
              category: index < 2 ? "category-a" : "category-b",
              difficulty: index % 2 === 0 ? "easy" : "hard",
            },
          })),
        });

        // Create traces
        const traces = traceIds.map((traceId, index) =>
          createTrace({
            id: traceId,
            project_id: projectId,
            name: `trace-${index + 1}`,
            timestamp: new Date().getTime() - (4 - index) * 1000,
            metadata: { test: `trace-${index + 1}` },
          }),
        );

        await createTracesCh(traces);

        // Create observations for some traces (mix of trace-level and observation-level linkage)
        const parentObsId = v4();
        const childObs1Id = v4();
        const childObs2Id = v4();

        const observations = [
          // First trace: parent observation with 2 children
          createObservation({
            id: parentObsId,
            trace_id: traceIds[0],
            project_id: projectId,
            type: "GENERATION",
            name: "parent-generation",
            parent_observation_id: null,
            start_time: new Date().getTime() - 3500,
            end_time: new Date().getTime() - 2500,
            metadata: { model: "gpt-4" },
            cost_details: { total: 0 }, // Parent has no direct cost
          }),
          createObservation({
            id: childObs1Id,
            trace_id: traceIds[0],
            project_id: projectId,
            type: "GENERATION",
            name: "child-generation-1",
            parent_observation_id: parentObsId,
            start_time: new Date().getTime() - 3400,
            end_time: new Date().getTime() - 3000,
            cost_details: { total: 0.005 }, // Child 1 cost
          }),
          createObservation({
            id: childObs2Id,
            trace_id: traceIds[0],
            project_id: projectId,
            type: "GENERATION",
            name: "child-generation-2",
            parent_observation_id: parentObsId,
            start_time: new Date().getTime() - 3000,
            end_time: new Date().getTime() - 2600,
            cost_details: { total: 0.008765 }, // Child 2 cost (total = 0.013765)
          }),
          createObservation({
            trace_id: traceIds[1],
            project_id: projectId,
            type: "GENERATION",
            name: "generation-2",
            start_time: new Date().getTime() - 2500,
            end_time: new Date().getTime() - 1500,
            metadata: { model: "gpt-3.5" },
          }),
          // Third trace has observation but run item will link to trace (trace-level linkage)
          createObservation({
            trace_id: traceIds[2],
            project_id: projectId,
            type: "GENERATION",
            name: "generation-3",
            start_time: new Date().getTime() - 1500,
            end_time: new Date().getTime() - 500,
            metadata: { model: "claude" },
          }),
          // Fourth trace: no observation (trace-level linkage only)
        ];

        await createObservationsCh(observations);

        // Create dataset run items - mix of trace-level and observation-level linkage
        const runItems = [
          // Run 1: All items, mix of trace and observation linkage
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run1Id,
            dataset_item_id: itemIds[0],
            trace_id: traceIds[0],
            observation_id: parentObsId, // Link to parent observation (has children)
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-1",
          }),
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run1Id,
            dataset_item_id: itemIds[1],
            trace_id: traceIds[1],
            observation_id: null, // Trace-level linkage
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-1",
          }),
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run1Id,
            dataset_item_id: itemIds[2],
            trace_id: traceIds[2],
            observation_id: null, // Trace-level linkage
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-1",
          }),

          // Run 2: Partial items, observation-level linkage
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run2Id,
            dataset_item_id: itemIds[0],
            trace_id: traceIds[0],
            observation_id: observations[0].id, // Observation-level linkage
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-2",
          }),
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run2Id,
            dataset_item_id: itemIds[3],
            trace_id: traceIds[3],
            observation_id: null, // Trace-level linkage (no observation exists)
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-2",
          }),

          // Run 3: Single item, trace-level linkage
          createDatasetRunItem({
            id: v4(),
            dataset_run_id: run3Id,
            dataset_item_id: itemIds[1],
            trace_id: traceIds[1],
            observation_id: null, // Trace-level linkage
            project_id: projectId,
            dataset_id: datasetId,
            dataset_run_name: "run-3",
          }),
        ];

        await createDatasetRunItemsCh(runItems);

        // Create scores for traces
        const scores = [
          createTraceScore({
            id: v4(),
            trace_id: traceIds[0],
            project_id: projectId,
            name: "accuracy",
            value: 0.95,
            source: "API",
          }),
          createTraceScore({
            id: v4(),
            trace_id: traceIds[0],
            project_id: projectId,
            name: "relevance",
            value: 0.88,
            source: "API",
          }),
          createTraceScore({
            id: v4(),
            trace_id: traceIds[1],
            project_id: projectId,
            name: "accuracy",
            value: 0.72,
            source: "API",
          }),
          createTraceScore({
            id: v4(),
            trace_id: traceIds[2],
            project_id: projectId,
            name: "accuracy",
            value: 0.81,
            source: "API",
          }),
          createTraceScore({
            id: v4(),
            trace_id: traceIds[3],
            project_id: projectId,
            name: "relevance",
            value: 0.65,
            source: "API",
          }),
        ];

        await createScoresCh(scores);
      });

      it("should return correct data structure with no pagination", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Should be a record, not an array
        expect(typeof result).toBe("object");
        expect(Array.isArray(result)).toBe(false);

        // Should have the correct nested structure: datasetItemId -> runId -> enriched data
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining(itemIds),
        );

        // Check specific dataset items have the correct run data
        // Item 0: Should have data from run1 and run2
        expect(result.get(itemIds[0])).toBeDefined();
        expect(Object.keys(result.get(itemIds[0]) ?? {})).toEqual(
          expect.arrayContaining([run1Id, run2Id]),
        );
        expect(result.get(itemIds[0])?.[run3Id]).toBeUndefined(); // Not in run3

        // Item 1: Should have data from run1 and run3
        expect(result.get(itemIds[1])).toBeDefined();
        expect(Object.keys(result.get(itemIds[1]) ?? {})).toEqual(
          expect.arrayContaining([run1Id, run3Id]),
        );
        expect(result.get(itemIds[1])?.[run2Id]).toBeUndefined(); // Not in run2

        // Item 2: Should have data from run1 only
        expect(result.get(itemIds[2])).toBeDefined();
        expect(Object.keys(result.get(itemIds[2]) ?? {})).toEqual([run1Id]);

        // Item 3: Should have data from run2 only
        expect(result.get(itemIds[3])).toBeDefined();
        expect(Object.keys(result.get(itemIds[3]) ?? {})).toEqual([run2Id]);
      });

      it("should include correct enriched data (scores, latency, costs)", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Test enriched data for item 0, run 1 (has observation-level linkage + scores)
        const item0Run1 = result.get(itemIds[0])?.[run1Id];
        expect(item0Run1).toBeDefined();
        expect(item0Run1?.datasetRunId).toBe(run1Id);
        expect(item0Run1?.datasetItemId).toBe(itemIds[0]);

        // Should have observation data (observation-level linkage)
        expect(item0Run1?.observation).toBeDefined();
        expect(item0Run1?.observation?.latency).toBeDefined();
        expect(typeof item0Run1?.observation?.latency).toBe("number");
        expect(item0Run1?.observation?.calculatedTotalCost).toBeDefined();
        // Should calculate recursive cost (parent + 2 children: 0 + 0.005 + 0.008765 = 0.013765)
        expect(
          item0Run1?.observation?.calculatedTotalCost?.toNumber(),
        ).toBeCloseTo(0.013765, 6);

        // Should have trace data
        expect(item0Run1?.trace).toBeDefined();
        expect(item0Run1?.trace?.id).toBe(traceIds[0]);
        expect(typeof item0Run1?.trace?.duration).toBe("number");
        expect(typeof item0Run1?.trace?.totalCost).toBe("number");

        // Should have scores (accuracy: 0.95, relevance: 0.88)
        expect(item0Run1?.scores).toBeDefined();

        expect(item0Run1?.scores?.[accuracyKey]).toBeDefined();
        expect((item0Run1?.scores?.[accuracyKey] as any)?.average).toBe(0.95);
        expect(item0Run1?.scores?.[relevanceKey]).toBeDefined();
        expect((item0Run1?.scores?.[relevanceKey] as any)?.average).toBe(0.88);
      });

      it("should handle trace-level vs observation-level linkage correctly", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Item 0, Run 1: Observation-level linkage (should have observation data)
        const item0Run1 = result.get(itemIds[0])?.[run1Id];
        expect(item0Run1?.observation).toBeDefined();
        expect(item0Run1?.observation?.id).toBeDefined();

        // Item 1, Run 1: Trace-level linkage (should not have observation data)
        const item1Run1 = result.get(itemIds[1])?.[run1Id];
        expect(item1Run1?.observation).toBeUndefined();

        // But should still have trace data
        expect(item1Run1?.trace).toBeDefined();
        expect(item1Run1?.trace?.id).toBe(traceIds[1]);

        // Item 3, Run 2: Trace-level linkage, no observation exists for this trace
        const item3Run2 = result.get(itemIds[3])?.[run2Id];
        expect(item3Run2?.observation).toBeUndefined();
        expect(item3Run2?.trace).toBeDefined();
        expect(item3Run2?.trace?.id).toBe(traceIds[3]);
      });

      it("should include correct scores for different traces", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Trace 0: accuracy: 0.95, relevance: 0.88
        const item0Run1 = result.get(itemIds[0])?.[run1Id];
        expect((item0Run1?.scores?.[accuracyKey] as any)?.average).toBe(0.95);
        expect((item0Run1?.scores?.[relevanceKey] as any)?.average).toBe(0.88);

        // Trace 1: accuracy: 0.72
        const item1Run1 = result.get(itemIds[1])?.[run1Id];
        expect((item1Run1?.scores?.[accuracyKey] as any)?.average).toBe(0.72);
        expect(item1Run1?.scores?.[relevanceKey]).toBeUndefined();

        // Trace 2: accuracy: 0.81
        const item2Run1 = result.get(itemIds[2])?.[run1Id];
        expect((item2Run1?.scores?.[accuracyKey] as any)?.average).toBe(0.81);

        // Trace 3: relevance: 0.65
        const item3Run2 = result.get(itemIds[3])?.[run2Id];
        expect((item3Run2?.scores?.[relevanceKey] as any)?.average).toBe(0.65);
        expect(item3Run2?.scores?.[accuracyKey]).toBeUndefined();
      });

      it("should handle latency calculations correctly", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Test observation-level latency (should be based on observation start/end time)
        const item0Run1 = result.get(itemIds[0])?.[run1Id];
        expect(item0Run1?.observation?.latency).toBeDefined();
        // Observation 1: 3500ms - 2500ms = 1000ms latency, which translates to 1 second
        expect(item0Run1?.observation?.latency).toBeCloseTo(1);

        const item0Run2 = result.get(itemIds[0])?.[run2Id];
        expect(item0Run2?.observation?.latency).toBeDefined();
        expect(item0Run2?.observation?.latency).toBeCloseTo(1); // Same observation

        // Test trace-level latency (calculated from trace timestamps and observations)
        const item1Run1 = result.get(itemIds[1])?.[run1Id];
        expect(item1Run1?.trace?.duration).toBeDefined();
        expect(typeof item1Run1?.trace?.duration).toBe("number");
      });

      it("should handle cost calculations correctly", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Test that cost fields are present and properly typed
        result.forEach((runData) => {
          Object.values(runData).forEach((enrichedItem) => {
            // Trace costs
            expect(typeof enrichedItem?.trace?.totalCost).toBe("number");

            // Observation costs (if observation exists)
            if (enrichedItem?.observation) {
              expect(
                enrichedItem?.observation?.calculatedTotalCost,
              ).toBeDefined();
              expect(
                enrichedItem?.observation?.calculatedTotalCost?.constructor
                  ?.name,
              ).toBe("Decimal");
            }
          });
        });
      });

      it("should filter by specific runs correctly", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id], // Only first two runs
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Should not have any data from run3 across all dataset items
        for (const datasetItemToRunData of result.values()) {
          for (const runId of Object.keys(datasetItemToRunData)) {
            expect(runId).not.toBe(run3Id);
          }
        }

        // But should have data from run1 and run2 where applicable
        expect(result.get(itemIds[0])?.[run1Id]).toBeDefined();
        expect(result.get(itemIds[0])?.[run2Id]).toBeDefined();
        expect(result.get(itemIds[1])?.[run1Id]).toBeDefined();
        expect(result.get(itemIds[1])?.[run2Id]).toBeUndefined(); // Item 1 not in run 2
      });

      it("should handle empty dataset item list", async () => {
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds: [], // Empty list
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        expect(result).toEqual(new Map());
      });

      it("should handle non-existent dataset items", async () => {
        const nonExistentItemId = v4();
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds: [nonExistentItemId],
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        expect(result).toEqual(new Map());
      });

      it("should handle non-existent runs", async () => {
        const nonExistentRunId = v4();

        const itemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId: datasetId,
          runIds: [nonExistentRunId],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId,
          datasetId,
          runIds: [nonExistentRunId],
          datasetItemIds: itemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        expect(result).toEqual(new Map());
      });

      it("should preserve created timestamps and metadata", async () => {
        const itemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [],
          limit: 100,
          offset: 0,
        });

        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId,
          datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds: itemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Test that timestamps are preserved
        result.forEach((runData) => {
          Object.values(runData).forEach((enrichedItem) => {
            expect(enrichedItem.createdAt).toBeInstanceOf(Date);
            expect(enrichedItem.id).toBeDefined();
            expect(typeof enrichedItem.id).toBe("string");
            expect(enrichedItem.datasetItemId).toBeDefined();
            expect(enrichedItem.datasetRunId).toBeDefined();
          });
        });
      });
    });

    describe("Compare data with filters", () => {
      let datasetId: string;
      let run1Id: string;
      let run2Id: string;
      let run3Id: string;
      let itemIds: string[];
      let run1TraceIds: string[];
      let run2TraceIds: string[];
      let run3TraceIds: string[];

      const accuracyKey = composeAggregateScoreKey({
        name: "accuracy",
        source: "API",
        dataType: "NUMERIC",
      });
      const relevanceKey = composeAggregateScoreKey({
        name: "relevance",
        source: "API",
        dataType: "NUMERIC",
      });

      beforeEach(async () => {
        datasetId = v4();
        run1Id = v4();
        run2Id = v4();
        run3Id = v4();
        itemIds = [v4(), v4(), v4(), v4(), v4()];
        run1TraceIds = [v4(), v4(), v4(), v4(), v4()];
        run2TraceIds = [v4(), v4(), v4(), v4(), v4()];
        run3TraceIds = [v4(), v4(), v4(), v4(), v4()];

        // Create dataset
        await prisma.dataset.create({
          data: {
            id: datasetId,
            name: `filtered-compare-test-dataset-${datasetId}`,
            projectId: projectId,
          },
        });

        // Create dataset runs
        await prisma.datasetRuns.createMany({
          data: [
            {
              id: run1Id,
              name: "high-accuracy-run",
              datasetId,
              metadata: { model: "gpt-4" },
              projectId,
              createdAt: new Date("2024-01-01T00:00:00Z"),
            },
            {
              id: run2Id,
              name: "mixed-performance-run",
              datasetId,
              metadata: { model: "gpt-3.5" },
              projectId,
              createdAt: new Date("2024-01-02T00:00:00Z"),
            },
            {
              id: run3Id,
              name: "quality-focused-run",
              datasetId,
              metadata: { model: "claude" },
              projectId,
              createdAt: new Date("2024-01-03T00:00:00Z"),
            },
          ],
        });

        // Create dataset items
        await createManyDatasetItems({
          projectId,
          items: itemIds.map((id, index) => ({
            id,
            datasetId,
            input: { prompt: `Test prompt ${index + 1}` },
            expectedOutput: { response: `Expected response ${index + 1}` },
            metadata: { category: `category-${index % 3}` },
          })),
        });

        // Create traces
        const traces = [...run1TraceIds, ...run2TraceIds, ...run3TraceIds].map(
          (traceId, index) =>
            createTrace({
              id: traceId,
              project_id: projectId,
              name: `filtered-trace-${index + 1}`,
              timestamp: new Date().getTime() - (5 - index) * 1000,
            }),
        );
        await createTracesCh(traces);

        // Create observations for latency calculations
        const observations = [
          ...run1TraceIds,
          ...run2TraceIds,
          ...run3TraceIds,
        ].map((traceId, index) =>
          createObservation({
            trace_id: traceId,
            project_id: projectId,
            type: "GENERATION",
            start_time: new Date().getTime() - (index + 1) * 2000,
            end_time: new Date().getTime() - (index + 1) * 1000,
            total_cost: (index + 1) * 10,
          }),
        );
        await createObservationsCh(observations);

        // Create dataset run items - ALL runs have ALL 5 items
        const runItems = [
          // Run 1: All 5 items (high accuracy run)
          ...itemIds.map((itemId, index) =>
            createDatasetRunItem({
              id: v4(),
              dataset_run_id: run1Id,
              dataset_item_id: itemId,
              trace_id: run1TraceIds[index],
              observation_id: null,
              project_id: projectId,
              dataset_id: datasetId,
              dataset_run_name: "high-accuracy-run",
            }),
          ),
          // Run 2: All 5 items (mixed performance)
          ...itemIds.map((itemId, index) =>
            createDatasetRunItem({
              id: v4(),
              dataset_run_id: run2Id,
              dataset_item_id: itemId,
              trace_id: run2TraceIds[index],
              observation_id: null,
              project_id: projectId,
              dataset_id: datasetId,
              dataset_run_name: "mixed-performance-run",
            }),
          ),
          // Run 3: All 5 items (quality focused)
          ...itemIds.map((itemId, index) =>
            createDatasetRunItem({
              id: v4(),
              dataset_run_id: run3Id,
              dataset_item_id: itemId,
              trace_id: run3TraceIds[index],
              observation_id: null,
              project_id: projectId,
              dataset_id: datasetId,
              dataset_run_name: "quality-focused-run",
            }),
          ),
        ];

        await createDatasetRunItemsCh(runItems);

        // Create scores with different patterns for filtering
        const scores: any[] = [];
        const runs = [
          { id: run1Id, traceIds: run1TraceIds },
          { id: run2Id, traceIds: run2TraceIds },
          { id: run3Id, traceIds: run3TraceIds },
        ];

        runs.forEach((run, runIndex) => {
          const traceSubset = run.traceIds; // Use all 5 traces for each run

          // Add accuracy scores for each run with different base values
          const accuracyBase = 0.6 + runIndex * 0.15; // 0.6, 0.75, 0.9
          traceSubset.forEach((traceId, traceIndex) => {
            scores.push(
              createTraceScore({
                id: v4(),
                trace_id: traceId,
                project_id: projectId,
                name: "accuracy",
                value: accuracyBase + traceIndex * 0.05, // Incremental within run
                source: "API",
              }),
            );
          });

          // Add secondary numeric scores with variation per run
          const secondaryScores = ["relevance", "precision", "fluency"];
          const secondaryBase = 0.5 + runIndex * 0.1; // 0.5, 0.6, 0.7
          traceSubset.forEach((traceId, traceIndex) => {
            scores.push(
              createTraceScore({
                id: v4(),
                trace_id: traceId,
                project_id: projectId,
                name: secondaryScores[runIndex],
                value: secondaryBase + traceIndex * 0.08,
                source: "API",
              }),
            );
          });

          // Add categorical scores with different categories per run
          const categoricalConfigs = [
            {
              name: "quality",
              values: ["excellent", "good", "average", "good", "excellent"],
            },
            {
              name: "sentiment",
              values: [
                "positive",
                "neutral",
                "negative",
                "positive",
                "neutral",
              ],
            },
            {
              name: "language",
              values: ["formal", "casual", "technical", "formal", "casual"],
            },
          ];

          traceSubset.forEach((traceId, traceIndex) => {
            scores.push(
              createTraceScore({
                id: v4(),
                trace_id: traceId,
                project_id: projectId,
                name: categoricalConfigs[runIndex].name,
                data_type: "CATEGORICAL",
                string_value: categoricalConfigs[runIndex].values[traceIndex],
                source: "API",
              }),
            );
          });
        });
        await createScoresCh(scores);
      });

      it("should return intersection of items across runs with different filters (intersection complexity)", async () => {
        // Test case 1: Filter run1 for high accuracy items, filter run2 for specific items
        // Should only return items that exist in both runs AND meet both filter criteria
        // Step 1: Return dataset item ids for which the run items match the filters
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.65,
                },
              ],
            },
            {
              runId: run2Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.8,
                },
              ],
            },
          ],
          limit: 100,
          offset: 0,
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id],
          datasetItemIds: datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Run1 has items 0,1,2,3,4 with accuracy 0.6,0.65,0.7,0.75,0.8 - filter >= 0.65 includes items 1,2,3,4
        // Run2 has items 0,1,2,3,4 with accuracy 0.75,0.8,0.85,0.9,0.95 - filter >= 0.8 includes items 1,2,3,4
        // Intersection: items that exist in BOTH runs AND meet BOTH criteria = items 1,2,3,4
        expect(Array.from(result.keys())).toHaveLength(4);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([
            itemIds[1],
            itemIds[2],
            itemIds[3],
            itemIds[4],
          ]),
        );

        // Verify each item has data from both runs
        result.forEach((runData) => {
          expect(Object.keys(runData)).toHaveLength(2);
          expect(Object.keys(runData)).toEqual(
            expect.arrayContaining([run1Id, run2Id]),
          );
        });

        // Verify accuracy values meet filter criteria
        const item1Run1 = result.get(itemIds[1])?.[run1Id];
        const item1Run2 = result.get(itemIds[1])?.[run2Id];
        expect(
          (item1Run1?.scores?.[accuracyKey] as any)?.average,
        ).toBeGreaterThanOrEqual(0.65);
        expect(
          (item1Run2?.scores?.[accuracyKey] as any)?.average,
        ).toBeGreaterThanOrEqual(0.8);
      });

      it("should return empty result when intersection is empty (no items meet all run filter criteria)", async () => {
        // Test case: Apply very strict filters that have no intersection
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.8, // Only item 4 in run1
                },
              ],
            },
            {
              runId: run2Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.85, // Items 2,3 in run2
                },
              ],
            },
            {
              runId: run3Id,
              filters: [
                {
                  type: "categoryOptions" as const,
                  column: "agg_score_categories",
                  key: "language",
                  operator: "any of" as const,
                  value: ["technical"], // Only item 2 in run3
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Run1 accuracy >= 0.8: only item 4 (accuracy 0.8)
        // Run2 accuracy >= 0.85: items 2,3,4 (accuracy 0.85, 0.9, 0.95)
        // Run3 language = "technical": only item 2 (language "technical")
        // Intersection: no item meets ALL three criteria
        expect(result).toEqual(new Map());
      });

      it("should handle intersection with mixed filter types across runs", async () => {
        // Test case: Combine numeric, categorical, and empty filters across multiple runs
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.65, // Items 1,2,3,4 meet this
                },
              ],
            },
            {
              runId: run2Id,
              filters: [], // No filters - all items in run2 qualify (items 0,1,2,3)
            },
            {
              runId: run3Id,
              filters: [
                {
                  type: "categoryOptions" as const,
                  column: "agg_score_categories",
                  key: "language",
                  operator: "none of" as const,
                  value: ["technical"], // Exclude item 2, so items 0,1 qualify
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Intersection analysis:
        // Run1 qualifies: items 1,2,3,4 (accuracy >= 0.65: 0.65, 0.7, 0.75, 0.8)
        // Run2 qualifies: items 0,1,2,3,4 (no filter - all items)
        // Run3 qualifies: items 0,1,3,4 (language != "technical": excludes item 2 which is "technical")
        // Intersection: items 1,3,4 (items that exist in ALL runs AND meet ALL criteria)
        expect(Array.from(result.keys())).toHaveLength(3);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([itemIds[1], itemIds[3], itemIds[4]]),
        );

        // Verify each qualifying item has data from all three runs
        result.forEach((runData) => {
          expect(Object.keys(runData)).toHaveLength(3);
          expect(Object.keys(runData)).toEqual(
            expect.arrayContaining([run1Id, run2Id, run3Id]),
          );
        });
      });

      it("should handle intersection with partially overlapping runs (some runs have items, others don't)", async () => {
        // Test case: Create scenario where some runs have certain items and others don't
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [], // No filters - all items qualify (items 0,1,2,3,4)
            },
            {
              runId: run2Id,
              filters: [], // No filters - all items qualify (items 0,1,2,3)
            },
            {
              runId: run3Id,
              filters: [], // No filters - all items qualify (items 0,1,2)
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // All items exist in ALL three runs now: items 0,1,2,3,4
        expect(Array.from(result.keys())).toHaveLength(5);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([
            itemIds[0],
            itemIds[1],
            itemIds[2],
            itemIds[3],
            itemIds[4],
          ]),
        );

        // Verify each qualifying item has data from all three runs
        result.forEach((runData) => {
          expect(Object.keys(runData)).toHaveLength(3);
          expect(Object.keys(runData)).toEqual(
            expect.arrayContaining([run1Id, run2Id, run3Id]),
          );
        });
      });

      it("should properly paginate intersection results", async () => {
        // Test case: Verify that pagination works correctly with intersection logic
        const firstPageDatasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 2,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            { runId: run1Id, filters: [] },
            { runId: run2Id, filters: [] },
          ],
        });

        const secondPageDatasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 2,
          offset: 2,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            { runId: run1Id, filters: [] },
            { runId: run2Id, filters: [] },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItemsFirstPage =
          await getDatasetRunItemsWithoutIOByItemIds({
            projectId: projectId,
            datasetId: datasetId,
            runIds: [run1Id, run2Id, run3Id],
            datasetItemIds: firstPageDatasetItemIds,
          });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItemsSecondPage =
          await getDatasetRunItemsWithoutIOByItemIds({
            projectId: projectId,
            datasetId: datasetId,
            runIds: [run1Id, run2Id, run3Id],
            datasetItemIds: secondPageDatasetItemIds,
          });

        const firstPageResult = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItemsFirstPage,
        );
        const secondPageResult = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItemsSecondPage,
        );

        // Check actual counts - pagination test uses all 3 runs (all have 5 items, no filters)
        expect(Array.from(firstPageResult.keys())).toHaveLength(2);
        expect(Array.from(secondPageResult.keys())).toHaveLength(2); // Second page: offset=2, limit=2
      });

      it("should filter single run with single numeric filter", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 1000,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.7,
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Should only return items where accuracy >= 0.7 in run1
        expect(Array.from(result.keys())).toHaveLength(3);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([itemIds[2], itemIds[3], itemIds[4]]),
        );

        // Verify the returned data
        const item2Data = result.get(itemIds[2])?.[run1Id];
        expect(item2Data).toBeDefined();
        expect((item2Data?.scores?.[accuracyKey] as any)?.average).toBe(0.7);

        const item4Data = result.get(itemIds[4])?.[run1Id];
        expect(item4Data).toBeDefined();
        expect((item4Data?.scores?.[accuracyKey] as any)?.average).toBe(0.8);
      });

      it("should filter multiple runs with different numeric filters", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.7,
                },
              ],
            },
            {
              runId: run2Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.75,
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Run 1: Items 2, 3, 4 (accuracy >= 0.7: 0.7, 0.75, 0.8)
        // Run 2: Items 0, 1, 2, 3, 4 (accuracy >= 0.75: 0.75, 0.8, 0.85, 0.9, 0.95)
        // Intersection: items 2, 3, 4 (meet both criteria)
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([itemIds[2], itemIds[3], itemIds[4]]),
        );

        // Check run1 data (items 2, 3, 4)
        expect(result.get(itemIds[2])?.[run1Id]).toBeDefined();
        expect(result.get(itemIds[3])?.[run1Id]).toBeDefined();
        expect(result.get(itemIds[4])?.[run1Id]).toBeDefined();

        // Check run2 data (items 2, 3, 4 should have run2 data)
        expect(result.get(itemIds[2])?.[run2Id]).toBeDefined();
        expect(result.get(itemIds[3])?.[run2Id]).toBeDefined();
        expect(result.get(itemIds[4])?.[run2Id]).toBeDefined();

        // Verify accuracy values
        expect(
          (result.get(itemIds[2])?.[run1Id]?.scores?.[accuracyKey] as any)
            ?.average,
        ).toBe(0.7);
        expect(
          (result.get(itemIds[2])?.[run2Id]?.scores?.[accuracyKey] as any)
            ?.average,
        ).toBe(0.85);
      });

      it("should filter single run with multiple numeric filters (AND condition)", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.75,
                },
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "relevance",
                  operator: ">=" as const,
                  value: 0.74,
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Should only return items where accuracy >= 0.75 AND relevance >= 0.74
        // Run1 accuracy: 0.6, 0.65, 0.7, 0.75, 0.8 (items 3, 4 meet accuracy >= 0.75)
        // Run1 relevance: 0.5, 0.58, 0.66, 0.74, 0.82 (items 3, 4 meet relevance >= 0.74)
        expect(Array.from(result.keys())).toHaveLength(2);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([itemIds[3], itemIds[4]]),
        );

        // Verify both conditions are met
        const item3Data = result.get(itemIds[3])?.[run1Id];
        expect((item3Data?.scores?.[accuracyKey] as any)?.average).toBe(0.75);
        expect((item3Data?.scores?.[relevanceKey] as any)?.average).toBe(0.74);

        const item4Data = result.get(itemIds[4])?.[run1Id];
        expect((item4Data?.scores?.[accuracyKey] as any)?.average).toBe(0.8);
        expect((item4Data?.scores?.[relevanceKey] as any)?.average).toBeCloseTo(
          0.82,
        );
      });

      it("should filter multiple runs with multiple filters each", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 0.75,
                },
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "relevance",
                  operator: ">=" as const,
                  value: 0.74,
                },
              ],
            },
            {
              runId: run3Id,
              filters: [
                {
                  type: "categoryOptions" as const,
                  column: "agg_score_categories",
                  key: "language",
                  operator: "any of" as const,
                  value: ["formal", "casual"],
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Run 1: Items where accuracy >= 0.75 AND relevance >= 0.74 (items 3, 4)
        // Run 2: No filter - all items qualify (items 0, 1, 2, 3, 4)
        // Run 3: Items where language is "formal" or "casual" (items 0, 1, 3, 4)
        // Intersection: items 3, 4 (items that meet ALL criteria across ALL runs)
        expect(Array.from(result.keys())).toHaveLength(2);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([itemIds[3], itemIds[4]]),
        );
      });

      it("should filter with categorical filters", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id], // All runs for intersection
          filterByRun: [
            {
              runId: run3Id,
              filters: [
                {
                  type: "categoryOptions" as const,
                  column: "agg_score_categories",
                  key: "language",
                  operator: "none of" as const,
                  value: ["technical"],
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Intersection logic: items must exist in ALL runs AND meet filter criteria
        // Run1: no filter → items 0,1,2,3,4 qualify
        // Run2: no filter → items 0,1,2,3,4 qualify
        // Run3: language != "technical" → items 0,1,3,4 qualify (excludes item 2 with "technical")
        // Intersection: items 0,1,3,4 (4 items)
        expect(Array.from(result.keys())).toHaveLength(4);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([
            itemIds[0],
            itemIds[1],
            itemIds[3],
            itemIds[4],
          ]),
        );
        expect(result.get(itemIds[2])).toBeUndefined(); // Has "technical" language, excluded by run3 filter
      });

      it("should handle filters that match no items", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: ">=" as const,
                  value: 1.0, // No scores are this high
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        expect(result).toEqual(new Map());
      });

      it("should handle filters with non-existent score names", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "nonexistent_score",
                  operator: ">=" as const,
                  value: 0.5,
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        expect(result).toEqual(new Map());
      });

      it("should handle empty filter list for a run", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [], // Empty filters should return all items
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Should return intersection of all runs (items that exist in ALL runs)
        // Run1: 5 items (0-4), Run2: 5 items (0-4), Run3: 5 items (0-4)
        // Intersection: all items 0, 1, 2, 3, 4 (5 items)
        expect(Array.from(result.keys())).toHaveLength(5);
        expect(Array.from(result.keys())).toEqual(
          expect.arrayContaining([
            itemIds[0],
            itemIds[1],
            itemIds[2],
            itemIds[3],
            itemIds[4],
          ]),
        );

        // Verify each item has data from all three runs
        result.forEach((runData) => {
          expect(Object.keys(runData)).toHaveLength(3);
          expect(Object.keys(runData)).toEqual(
            expect.arrayContaining([run1Id, run2Id, run3Id]),
          );
        });
      });

      it("should maintain data integrity during complex intersection filtering", async () => {
        const datasetItemIds = await getDatasetItemIdsWithRunData({
          projectId,
          datasetId,
          limit: 100,
          offset: 0,
          runIds: [run1Id, run2Id, run3Id],
          filterByRun: [
            {
              runId: run1Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: "=" as const,
                  value: 0.7,
                },
              ],
            },
            {
              runId: run2Id,
              filters: [
                {
                  type: "numberObject" as const,
                  column: "agg_scores_avg",
                  key: "accuracy",
                  operator: "=" as const,
                  value: 0.85,
                },
              ],
            },
          ],
        });

        // Step 2: Given dataset item ids, lookup dataset run items in clickhouse
        // Note: for each unique dataset item id and dataset run id combination, we will retrieve a dataset run item
        const datasetRunItems = await getDatasetRunItemsWithoutIOByItemIds({
          projectId: projectId,
          datasetId: datasetId,
          runIds: [run1Id, run2Id, run3Id],
          datasetItemIds,
        });

        const result = await enrichAndMapToDatasetItemId(
          projectId,
          datasetRunItems,
        );

        // Verify that the intersection logic preserves correct data for matching items
        const item2Run1 = result.get(itemIds[2])?.[run1Id];
        const item2Run2 = result.get(itemIds[2])?.[run2Id];

        expect(item2Run1).toBeDefined();
        expect(item2Run2).toBeDefined();

        // Verify accuracy scores match filter exactly (intersection requirement)
        expect((item2Run1?.scores?.[accuracyKey] as any)?.average).toBe(0.7);
        expect((item2Run2?.scores?.[accuracyKey] as any)?.average).toBe(0.85);

        // Verify run metadata is correct for intersected data
        expect(item2Run1?.datasetRunId).toBe(run1Id);
        expect(item2Run2?.datasetRunId).toBe(run2Id);

        // Verify trace data is preserved across intersection
        expect(item2Run1?.trace?.id).toBe(run1TraceIds[2]);
        expect(item2Run2?.trace?.id).toBe(run2TraceIds[2]);

        // Verify that only item 2 is returned (the only one meeting both filters)
        expect(Array.from(result.keys())).toEqual([itemIds[2]]);

        // Verify intersection logic: item must exist in ALL specified runs with their respective filters
        expect(Array.from(result.keys())).toHaveLength(1);
      });
    });
  });
});
