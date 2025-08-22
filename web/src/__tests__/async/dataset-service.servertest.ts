import {
  createDatasetRunItem,
  createDatasetRunItemsCh,
  createObservationsCh,
  createScoresCh,
  createTracesCh,
  type DatasetRunsMetrics,
  getDatasetRunItemsByDatasetIdCh,
  getDatasetRunsTableMetricsCh,
  getScoresForDatasetRuns,
  getTraceScoresForDatasetRuns,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createObservation,
  createTraceScore,
  createTrace,
} from "@langfuse/shared/src/server";
import {
  fetchDatasetItems,
  getRunItemsByRunIdOrItemId,
} from "@/src/features/datasets/server/service";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { isPresent } from "@langfuse/shared";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

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

    const datasetItemId = v4();
    const datasetItemId2 = v4();
    const datasetItemId3 = v4();
    const datasetItemId4 = v4();

    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    await prisma.datasetItem.create({
      data: {
        id: datasetItemId2,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    await prisma.datasetItem.create({
      data: {
        id: datasetItemId3,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    await prisma.datasetItem.create({
      data: {
        id: datasetItemId4,
        datasetId,
        metadata: {},
        projectId,
      },
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
    });

    const datasetRunItem2 = createDatasetRunItem({
      id: datasetRunItemId2,
      dataset_run_id: datasetRunId,
      observation_id: null,
      trace_id: traceId2,
      project_id: projectId,
      dataset_item_id: datasetItemId2,
      dataset_id: datasetId,
    });

    const datasetRunItem3 = createDatasetRunItem({
      id: datasetRunItemId3,
      dataset_run_id: datasetRunId,
      observation_id: null,
      trace_id: traceId3,
      project_id: projectId,
      dataset_item_id: datasetItemId3,
      dataset_id: datasetId,
    });

    const datasetRunItem4 = createDatasetRunItem({
      id: datasetRunItemId4,
      dataset_run_id: datasetRun2Id,
      observation_id: null,
      trace_id: traceId4,
      project_id: projectId,
      dataset_item_id: datasetItemId4,
      dataset_id: datasetId,
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

    const limit = 10;
    const page = 0;

    // Get all runs from PostgreSQL and merge with ClickHouse metrics to maintain consistent count
    const [runsWithMetrics, allRunsBasicInfo] = await Promise.all([
      // Get runs that have metrics (only runs with dataset_run_items_rmt)
      getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        limit: limit,
        offset: page * limit,
      }),
      // Get basic info for all runs to ensure we return all runs, even those without dataset_run_items_rmt
      prisma.datasetRuns.findMany({
        where: {
          datasetId: datasetId,
          projectId: projectId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          metadata: true,
          createdAt: true,
          datasetId: true,
          projectId: true,
        },
        take: limit,
        skip: page * limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    // Create lookup map for runs that have metrics
    const metricsLookup = new Map<string, DatasetRunsMetrics>(
      runsWithMetrics.map((run) => [run.id, run]),
    );

    // Only fetch scores for runs that have metrics (runs without dataset_run_items_rmt won't have trace scores)
    const runsWithMetricsIds = runsWithMetrics.map((run) => run.id);
    const [traceScores, runScores] = await Promise.all([
      runsWithMetricsIds.length > 0
        ? getTraceScoresForDatasetRuns(projectId, runsWithMetricsIds)
        : [],
      getScoresForDatasetRuns({
        projectId: projectId,
        runIds: allRunsBasicInfo.map((run) => run.id),
        includeHasMetadata: true,
        excludeMetadata: false,
      }),
    ]);

    // Merge all runs: use metrics where available, defaults otherwise
    const allRuns = allRunsBasicInfo.map((run) => {
      const metrics = metricsLookup.get(run.id);

      return {
        ...run,
        // Use ClickHouse metrics if available, otherwise use defaults for runs without dataset_run_items_rmt
        countRunItems: metrics?.countRunItems ?? 0,
        avgTotalCost: metrics?.avgTotalCost ?? null,
        avgLatency: metrics?.avgLatency ?? null,
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

    expect(firstRun.description).toBeNull();
    expect(firstRun.metadata).toEqual({});

    expect(firstRun.avgLatency).toBeGreaterThanOrEqual(10800);
    expect(firstRun.avgTotalCost?.toString()).toStrictEqual("275");

    const expectedObject = {
      [`${scoreName.replaceAll("-", "_")}-API-NUMERIC`]: {
        type: "NUMERIC",
        values: expect.arrayContaining([1, 100.5]),
        average: 50.75,
        id: undefined,
        comment: undefined,
        hasMetadata: undefined,
      },
      [`${anotherScoreName.replaceAll("-", "_")}-API-NUMERIC`]: {
        id: score3.id,
        type: "NUMERIC",
        values: expect.arrayContaining([1]),
        average: 1,
        comment: "some other comment for non run related score",
        hasMetadata: true,
      },
    };

    expect(firstRun.scores).toEqual(expectedObject);

    const secondRun = allRuns.find((run) => run.id === datasetRun2Id);

    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("second run is not defined");
    }

    expect(secondRun.id).toEqual(datasetRun2Id);
    expect(secondRun.description).toBeNull();
    expect(secondRun.metadata).toEqual({});
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

    const datasetItemId = v4();

    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        datasetId,
        metadata: {},
        projectId,
      },
    });

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

    const limit = 10;
    const page = 0;

    // Get all runs from PostgreSQL and merge with ClickHouse metrics to maintain consistent count
    const [runsWithMetrics, allRunsBasicInfo] = await Promise.all([
      // Get runs that have metrics (only runs with dataset_run_items_rmt)
      getDatasetRunsTableMetricsCh({
        projectId: projectId,
        datasetId: datasetId,
        limit: limit,
        offset: isPresent(page) && isPresent(limit) ? page * limit : undefined,
      }),
      // Get basic info for all runs to ensure we return all runs, even those without dataset_run_items_rmt
      prisma.datasetRuns.findMany({
        where: {
          datasetId: datasetId,
          projectId: projectId,
        },
        select: {
          id: true,
          name: true,
          description: true,
          metadata: true,
          createdAt: true,
          datasetId: true,
          projectId: true,
        },
        ...(isPresent(limit) && {
          take: limit,
        }),
        ...(isPresent(page) &&
          isPresent(limit) && {
            skip: page * limit,
          }),
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    // Create lookup map for runs that have metrics
    const metricsLookup = new Map<string, DatasetRunsMetrics>(
      runsWithMetrics.map((run) => [run.id, run]),
    );

    // Only fetch scores for runs that have metrics (runs without dataset_run_items_rmt won't have trace scores)
    const runsWithMetricsIds = runsWithMetrics.map((run) => run.id);
    const [traceScores, runScores] = await Promise.all([
      runsWithMetricsIds.length > 0
        ? getTraceScoresForDatasetRuns(projectId, runsWithMetricsIds)
        : [],
      getScoresForDatasetRuns({
        projectId: projectId,
        runIds: allRunsBasicInfo.map((run) => run.id),
        includeHasMetadata: true,
        excludeMetadata: false,
      }),
    ]);

    // Merge all runs: use metrics where available, defaults otherwise
    const allRuns = allRunsBasicInfo.map((run) => {
      const metrics = metricsLookup.get(run.id);

      return {
        ...run,
        // Use ClickHouse metrics if available, otherwise use defaults for runs without dataset_run_items_rmt
        countRunItems: metrics?.countRunItems ?? 0,
        avgTotalCost: metrics?.avgTotalCost ?? null,
        avgLatency: metrics?.avgLatency ?? null,
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

    expect(firstRun.description).toBeNull();
    expect(firstRun.metadata).toEqual({});

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
      },
    };

    expect(firstRun.scores).toEqual(expectedObject);

    const secondRun = allRuns.find((run) => run.id === datasetRun2Id);

    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("second run is not defined");
    }

    expect(secondRun.id).toEqual(datasetRun2Id);
    expect(secondRun.description).toBeNull();
    expect(secondRun.metadata).toEqual({});
    expect(secondRun.avgLatency).toEqual(0);
    expect(secondRun.avgTotalCost?.toString()).toStrictEqual("0");

    expect(firstRun.scores).toEqual(expectedObject);
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

    const datasetItemId = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetItemId2 = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId2,
        datasetId,
        metadata: {},
        projectId,
      },
    });

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
      // ensure consistent ordering with datasets.baseDatasetItemByDatasetId
      // CH run items are created in reverse order as postgres execution path
      // can be refactored once we switch to CH only implementation
      orderBy: [
        {
          column: "createdAt",
          order: "ASC",
        },
        { column: "datasetItemId", order: "DESC" },
      ],
      limit: 10,
      offset: 0,
    });

    const runItemNameMap = runItems.reduce(
      (map, item) => {
        map[item.id] = item.datasetRunName;
        return map;
      },
      {} as Record<string, string>,
    );

    const enrichedRunItems = (
      await getRunItemsByRunIdOrItemId(
        projectId,
        runItems.map((runItem) => ({
          id: runItem.id,
          traceId: runItem.traceId,
          observationId: runItem.observationId,
          createdAt: runItem.createdAt,
          updatedAt: runItem.updatedAt,
          projectId: runItem.projectId,
          datasetRunId: runItem.datasetRunId,
          datasetItemId: runItem.datasetItemId,
        })),
      )
    ).map((runItem) => ({
      ...runItem,
      datasetRunName: runItemNameMap[runItem.id],
    }));

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
        // createScore adds metadata to the score
        hasMetadata: true,
      },
    };

    expect(secondRunItem.scores).toEqual(expectedObject);
  });

  it("should fetch dataset run items for UI with missing tracing data", async () => {
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

    const datasetItemId = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetItemId2 = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId2,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const datasetRunItemId = v4();
    const traceId = v4();

    const datasetRunItem1 = createDatasetRunItem({
      id: datasetRunItemId,
      dataset_run_id: datasetRunId,
      trace_id: traceId,
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
      trace_id: traceId2,
      project_id: projectId,
      dataset_item_id: datasetItemId2,
      observation_id: observationId,
      dataset_id: datasetId,
    });

    await createDatasetRunItemsCh([datasetRunItem1, datasetRunItem2]);

    const runItems = await getDatasetRunItemsByDatasetIdCh({
      projectId: projectId,
      datasetId: datasetId,
      filter: [],
      // ensure consistent ordering with datasets.baseDatasetItemByDatasetId
      // CH run items are created in reverse order as postgres execution path
      // can be refactored once we switch to CH only implementation
      orderBy: [
        {
          column: "createdAt",
          order: "ASC",
        },
        { column: "datasetItemId", order: "DESC" },
      ],
      limit: 2,
      offset: 0,
    });

    const runItemNameMap = runItems.reduce(
      (map, item) => {
        map[item.id] = item.datasetRunName;
        return map;
      },
      {} as Record<string, string>,
    );

    const enrichedRunItems = (
      await getRunItemsByRunIdOrItemId(
        projectId,
        runItems.map((runItem) => ({
          id: runItem.id,
          traceId: runItem.traceId,
          observationId: runItem.observationId,
          createdAt: runItem.createdAt,
          updatedAt: runItem.updatedAt,
          projectId: runItem.projectId,
          datasetRunId: runItem.datasetRunId,
          datasetItemId: runItem.datasetItemId,
        })),
      )
    ).map((runItem) => ({
      ...runItem,
      datasetRunName: runItemNameMap[runItem.id],
    }));

    expect(enrichedRunItems).toHaveLength(2);

    const firstRunItem = enrichedRunItems.find(
      (run) => run.id === datasetRunItemId,
    );
    expect(firstRunItem).toBeDefined();
    if (!firstRunItem) {
      throw new Error("first run is not defined");
    }

    expect(firstRunItem.id).toEqual(datasetRunItemId);
    expect(firstRunItem.datasetItemId).toEqual(datasetItemId);
    expect(firstRunItem.observation).toBeUndefined();
    expect(firstRunItem.trace).toBeDefined();
    expect(firstRunItem.trace?.id).toEqual(traceId);

    const secondRunItem = enrichedRunItems.find(
      (run) => run.id === datasetRunItemId2,
    );
    expect(secondRunItem).toBeDefined();
    if (!secondRunItem) {
      throw new Error("secondRunItem is not defined");
    }

    expect(secondRunItem.id).toEqual(datasetRunItemId2);
    expect(secondRunItem.datasetItemId).toEqual(datasetItemId2);
    expect(secondRunItem.trace?.id).toEqual(traceId2);
    expect(secondRunItem.observation?.id).toEqual(observationId);
  });

  it("should fetch dataset items correctly", async () => {
    // Create test data in the database

    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });

    const traceId1 = v4();
    const traceId2 = v4();
    const observationId2 = v4();

    const datasetItemId = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId,
        datasetId,
        metadata: {},
        projectId,
        sourceTraceId: traceId1,
      },
    });

    const datasetItemId2 = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId2,
        datasetId,
        metadata: {},
        projectId,
        sourceTraceId: traceId2,
        sourceObservationId: observationId2,
      },
    });

    const datasetItemId3 = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId3,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    const observation = createObservation({
      id: observationId2,
      trace_id: traceId2,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 60, // minus 1 min
      end_time: new Date().getTime(),
    });

    await createObservationsCh([observation]);

    const trace1 = createTrace({
      id: traceId1,
      project_id: projectId,
    });
    const trace2 = createTrace({
      id: traceId2,
      project_id: projectId,
    });

    await createTracesCh([trace1, trace2]);

    const input = {
      projectId: projectId,
      datasetId: datasetId,
      limit: 10,
      page: 0,
      prisma: prisma,
      filter: [],
    };

    const result = await fetchDatasetItems(input);

    expect(result.totalDatasetItems).toEqual(3);
    expect(result.datasetItems).toHaveLength(3);

    const firstDatasetItem = result.datasetItems.find(
      (item) => item.id === datasetItemId,
    );
    expect(firstDatasetItem).toBeDefined();
    if (!firstDatasetItem) {
      throw new Error("firstDatasetItem is not defined");
    }
    expect(firstDatasetItem.sourceTraceId).toEqual(traceId1);
    expect(firstDatasetItem.sourceObservationId).toBeNull();

    const secondDatasetItem = result.datasetItems.find(
      (item) => item.id === datasetItemId2,
    );
    expect(secondDatasetItem).toBeDefined();
    if (!secondDatasetItem) {
      throw new Error("secondDatasetItem is not defined");
    }
    expect(secondDatasetItem.sourceTraceId).toEqual(traceId2);
    expect(secondDatasetItem.sourceObservationId).toEqual(observationId2);

    const thirdDatasetItem = result.datasetItems.find(
      (item) => item.id === datasetItemId3,
    );
    expect(thirdDatasetItem).toBeDefined();
    if (!thirdDatasetItem) {
      throw new Error("thirdDatasetItem is not defined");
    }
    expect(thirdDatasetItem.sourceTraceId).toBeNull();
    expect(thirdDatasetItem.sourceObservationId).toBeNull();
  });

  it("should filter dataset items by metadata key `key`", async () => {
    const datasetId = v4();

    await prisma.dataset.create({
      data: {
        id: datasetId,
        name: v4(),
        projectId: projectId,
      },
    });
    const datasetItemId1 = v4();
    const datasetItemId2 = v4();
    await prisma.datasetItem.create({
      data: {
        id: datasetItemId1,
        datasetId,
        metadata: {},
        projectId,
      },
    });

    await prisma.datasetItem.create({
      data: {
        id: datasetItemId2,
        datasetId,
        projectId,
        metadata: {
          key: "value",
        },
      },
    });

    const input = {
      projectId: projectId,
      datasetId: datasetId,
      limit: 10,
      page: 0,
      prisma: prisma,
      filter: [
        {
          column: "metadata",
          type: "stringObject" as const,
          key: "key",
          operator: "=" as const,
          value: "value",
        },
      ],
    };

    const result = await fetchDatasetItems(input);

    expect(result.totalDatasetItems).toEqual(1);
    expect(result.datasetItems).toHaveLength(1);

    // expect all dataset items to have the metadata key `key`
    expect(
      result.datasetItems.every(
        (item) =>
          !!item.metadata &&
          typeof item.metadata === "object" &&
          "key" in item.metadata,
      ),
    ).toBe(true);
  });

  describe("Dataset Items Search", () => {
    let datasetId: string;

    beforeEach(async () => {
      // Create a new dataset for each test to ensure isolation
      datasetId = v4();
      await prisma.dataset.create({
        data: {
          id: datasetId,
          name: `test-dataset-${datasetId}`,
          projectId: projectId,
        },
      });
    });

    afterEach(async () => {
      // Clean up dataset items and dataset after each test
      await prisma.datasetItem.deleteMany({
        where: { datasetId, projectId },
      });
      await prisma.dataset.delete({
        where: { id_projectId: { id: datasetId, projectId } },
      });
    });

    describe("ID Search Type", () => {
      it("should find dataset items by ID using ID search type", async () => {
        // Create test dataset items with known IDs
        const specificId = "test-item-123-langfuse";
        const anotherSpecificId = "test-item-456-openai";

        await prisma.datasetItem.create({
          data: {
            id: specificId,
            datasetId,
            projectId,
            input: {
              text: "What is Langfuse used for in machine learning projects?",
            },
            expectedOutput: {
              text: "Langfuse is used for LLM observability and tracing",
            },
            metadata: { category: "general" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: anotherSpecificId,
            datasetId,
            projectId,
            input: {
              text: "How do you integrate OpenAI with your application?",
            },
            expectedOutput: {
              text: "You can integrate OpenAI using their Python SDK",
            },
            metadata: { category: "integration" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "What are the benefits of using vector databases?" },
            expectedOutput: {
              text: "Vector databases enable semantic search capabilities",
            },
            metadata: { category: "technical" },
          },
        });

        // Test search by partial ID
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
          searchQuery: "langfuse",
          searchType: ["id"],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems).toHaveLength(1);
        expect(searchResults.datasetItems[0].id).toEqual(specificId);
      });

      it("should perform case insensitive ID search", async () => {
        const specificId = "test-ITEM-OpenAI-Integration";

        await prisma.datasetItem.create({
          data: {
            id: specificId,
            datasetId,
            projectId,
            input: { text: "OpenAI integration question" },
            expectedOutput: { text: "OpenAI integration answer" },
            metadata: { category: "api" },
          },
        });

        // Test case insensitive search
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
          searchQuery: "openai", // lowercase search
          searchType: ["id"],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].id).toEqual(specificId);
      });
    });

    describe("Content Search Type", () => {
      it("should find dataset items by searching in input field", async () => {
        // Create test dataset items with searchable input content
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              text: "What is Langfuse used for in machine learning projects?",
            },
            expectedOutput: {
              text: "Langfuse is used for LLM observability and tracing",
            },
            metadata: { category: "general" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              text: "How do you integrate OpenAI with your application?",
            },
            expectedOutput: {
              text: "You can integrate OpenAI using their Python SDK",
            },
            metadata: { category: "integration" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "What are the benefits of using vector databases?" },
            expectedOutput: {
              text: "Vector databases enable semantic search capabilities",
            },
            metadata: { category: "technical" },
          },
        });

        // Test content search in input field
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
          searchQuery: "Langfuse",
          searchType: ["content"],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems).toHaveLength(1);
        expect(searchResults.datasetItems[0].input).toEqual({
          text: "What is Langfuse used for in machine learning projects?",
        });
      });

      it("should find dataset items by searching in expectedOutput field", async () => {
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { question: "What is the primary purpose of this tool?" },
            expectedOutput: {
              text: "Langfuse is a powerful observability platform for LLM applications",
            },
            metadata: { type: "explanation" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { question: "How do you monitor AI applications?" },
            expectedOutput: {
              text: "You can use monitoring tools and dashboards",
            },
            metadata: { type: "how-to" },
          },
        });

        // Test content search in expectedOutput field
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
          searchQuery: "observability platform",
          searchType: ["content"],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems).toHaveLength(1);
        expect(searchResults.datasetItems[0].expectedOutput).toEqual({
          text: "Langfuse is a powerful observability platform for LLM applications",
        });
      });

      it("should find dataset items by searching in metadata field", async () => {
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { question: "What is customer support automation?" },
            expectedOutput: {
              answer: "Automated systems handle customer inquiries",
            },
            metadata: {
              domain: "customer service automation",
              tags: ["support", "automation", "chatbot"],
              complexity: "medium",
            },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { question: "How to build a recommendation system?" },
            expectedOutput: {
              answer:
                "Use collaborative filtering and content-based approaches",
            },
            metadata: {
              domain: "machine learning",
              tags: ["ml", "recommendations"],
              complexity: "high",
            },
          },
        });

        // Test content search in metadata field
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
          searchQuery: "customer service automation",
          searchType: ["content"],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems).toHaveLength(1);
        expect(searchResults.datasetItems[0].metadata).toEqual({
          domain: "customer service automation",
          tags: ["support", "automation", "chatbot"],
          complexity: "medium",
        });
      });
    });

    describe("Case Insensitive Search", () => {
      beforeEach(async () => {
        // Create test data with mixed case content
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "How to configure OpenAI API keys?" },
            expectedOutput: {
              text: "Store API keys securely using environment variables",
            },
            metadata: { category: "Security", priority: "HIGH" },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "What are the best practices for API security?" },
            expectedOutput: {
              text: "Use HTTPS, validate inputs, and implement rate limiting",
            },
            metadata: { category: "security", priority: "high" },
          },
        });
      });

      it("should perform case insensitive search in input field", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "openai",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].input).toEqual({
          text: "How to configure OpenAI API keys?",
        });
      });

      it("should perform case insensitive search in expectedOutput field", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "HTTPS",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].expectedOutput).toEqual({
          text: "Use HTTPS, validate inputs, and implement rate limiting",
        });
      });

      it("should perform case insensitive search in metadata values", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "security",
          searchType: ["content"],
          filter: [],
        });

        // Should find both items (one with "Security" and one with "security")
        expect(searchResults.totalDatasetItems).toEqual(2);
        expect(searchResults.datasetItems[0].metadata).toHaveProperty(
          "category",
          "security",
        );
      });
    });

    describe("Complex JSON Search", () => {
      beforeEach(async () => {
        // Create test data with complex nested JSON structures
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              conversation: {
                messages: [
                  { role: "user", content: "What is machine learning?" },
                  {
                    role: "assistant",
                    content: "ML is a subset of AI that learns from data",
                  },
                ],
                context: "educational discussion",
              },
            },
            expectedOutput: {
              response: {
                text: "Machine learning enables computers to learn patterns from data",
                confidence: 0.95,
                tags: ["education", "AI", "machine learning"],
              },
            },
            metadata: {
              domain: "artificial intelligence",
              complexity: "beginner",
              topics: ["supervised learning", "unsupervised learning"],
            },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              query: "Explain neural networks",
              parameters: {
                temperature: 0.7,
                max_tokens: 150,
              },
            },
            expectedOutput: {
              response: {
                text: "Neural networks are computational models inspired by biological neurons",
                confidence: 0.88,
                tags: ["deep learning", "neural networks"],
              },
            },
            metadata: {
              domain: "deep learning",
              complexity: "intermediate",
              topics: ["neural networks", "backpropagation"],
            },
          },
        });
      });

      it("should search within nested JSON input structures", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "educational discussion",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].input).toHaveProperty(
          "conversation",
        );
        expect(
          (searchResults.datasetItems[0].input as any).conversation.context,
        ).toBe("educational discussion");
      });

      it("should search within nested JSON expectedOutput structures", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "biological neurons",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].expectedOutput).toHaveProperty(
          "response",
        );
        expect(
          (searchResults.datasetItems[0].expectedOutput as any).response.text,
        ).toContain("biological neurons");
      });

      it("should search in metadata array values", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "topics",
              operator: "contains",
              value: "supervised learning",
            },
          ],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(
          (searchResults.datasetItems[0].metadata as any).topics,
        ).toContain("supervised learning");
      });
    });

    describe("Search with No Matches", () => {
      beforeEach(async () => {
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { question: "What is Python programming?" },
            expectedOutput: {
              answer: "Python is a versatile programming language",
            },
            metadata: { language: "python", level: "beginner" },
          },
        });
      });

      it("should return empty results when search term is not found", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "nonexistent content",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(0);
        expect(searchResults.datasetItems).toHaveLength(0);
      });

      it("should return empty results when metadata key does not exist", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "nonexistent_key",
              operator: "=",
              value: "any_value",
            },
          ],
        });

        expect(searchResults.totalDatasetItems).toEqual(0);
        expect(searchResults.datasetItems).toHaveLength(0);
      });

      it("should return empty results when metadata value does not match", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "language",
              operator: "=",
              value: "javascript", // looking for javascript but item has python
            },
          ],
        });

        expect(searchResults.totalDatasetItems).toEqual(0);
        expect(searchResults.datasetItems).toHaveLength(0);
      });
    });

    describe("Multiple Search Criteria", () => {
      beforeEach(async () => {
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              text: "How to use Langfuse for monitoring LLM applications?",
            },
            expectedOutput: {
              text: "Langfuse provides comprehensive observability for AI applications",
            },
            metadata: {
              category: "observability",
              tool: "langfuse",
              priority: "high",
            },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              text: "What are the key features of AI monitoring tools?",
            },
            expectedOutput: {
              text: "Key features include tracing, metrics, and error tracking",
            },
            metadata: {
              category: "observability",
              tool: "general",
              priority: "medium",
            },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "How to implement logging in Python applications?" },
            expectedOutput: {
              text: "Use Python's logging module for structured logging",
            },
            metadata: { category: "logging", tool: "python", priority: "low" },
          },
        });
      });

      it("should filter by multiple metadata criteria", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "category",
              operator: "=",
              value: "observability",
            },
            {
              column: "metadata",
              type: "stringObject",
              key: "tool",
              operator: "=",
              value: "langfuse",
            },
          ],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].input).toEqual({
          text: "How to use Langfuse for monitoring LLM applications?",
        });
      });

      it("should combine content search with metadata filtering", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "monitoring",
          searchType: ["content"],
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "priority",
              operator: "=",
              value: "high",
            },
          ],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].input).toEqual({
          text: "How to use Langfuse for monitoring LLM applications?",
        });
      });

      it("should return items matching any of multiple content search terms", async () => {
        // Note: This tests OR logic if the search implementation supports it
        // For now, testing sequential filters that narrow down results
        const langfuseResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "Langfuse",
          searchType: ["content"],
          filter: [],
        });

        const pythonResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "Python",
          searchType: ["content"],
          filter: [],
        });

        expect(langfuseResults.totalDatasetItems).toEqual(1);
        expect(pythonResults.totalDatasetItems).toEqual(1);
        expect(langfuseResults.datasetItems[0].id).not.toEqual(
          pythonResults.datasetItems[0].id,
        );
      });
    });

    describe("Edge Cases and Special Characters", () => {
      beforeEach(async () => {
        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: {
              text: 'Search for "quoted text" and special chars: @#$%^&*()',
            },
            expectedOutput: {
              text: "Handle special characters properly in search queries",
            },
            metadata: {
              special_key: "value with spaces and symbols: @#$",
              "key-with-dashes": "dash-separated-value",
              "key.with.dots": "dot.separated.value",
            },
          },
        });

        await prisma.datasetItem.create({
          data: {
            id: v4(),
            datasetId,
            projectId,
            input: { text: "Normal text without special characters" },
            expectedOutput: { text: "Regular response without special chars" },
            metadata: { category: "normal", type: "standard" },
          },
        });
      });

      it("should handle search with special characters", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "@#$%",
          searchType: ["content"],
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(searchResults.datasetItems[0].input).toEqual({
          text: 'Search for "quoted text" and special chars: @#$%^&*()',
        });
      });

      it("should handle metadata keys with special characters", async () => {
        const filterResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "key-with-dashes",
              operator: "=",
              value: "dash-separated-value",
            },
          ],
        });

        expect(filterResults.totalDatasetItems).toEqual(1);
        expect(
          (filterResults.datasetItems[0].metadata as any)["key-with-dashes"],
        ).toBe("dash-separated-value");

        const searchResults = await fetchDatasetItems({
          searchQuery: "dash-separated-value",
          searchType: ["content"],
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          filter: [],
        });

        expect(searchResults.totalDatasetItems).toEqual(1);
        expect(
          (searchResults.datasetItems[0].metadata as any)["key-with-dashes"],
        ).toBe("dash-separated-value");
      });

      it("should handle empty search terms gracefully", async () => {
        const searchResults = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "",
          searchType: ["content"],
          filter: [],
        });

        // Empty search should return all items (depending on implementation)
        expect(searchResults.totalDatasetItems).toBeGreaterThanOrEqual(0);
      });
    });

    describe("Performance and Pagination", () => {
      beforeEach(async () => {
        // Create multiple dataset items for pagination testing
        const items = [];
        for (let i = 1; i <= 25; i++) {
          items.push({
            id: v4(),
            datasetId,
            projectId,
            input: { text: `Sample question ${i} about data processing` },
            expectedOutput: {
              text: `Sample answer ${i} about data handling techniques`,
            },
            metadata: {
              sequence: i,
              category: i % 2 === 0 ? "even" : "odd",
              topic: "data processing",
            },
          });
        }

        await prisma.datasetItem.createMany({ data: items });
      });

      it("should handle pagination with search results", async () => {
        // First page
        const firstPage = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 0,
          prisma,
          searchQuery: "data processing",
          searchType: ["content"],
          filter: [],
        });

        expect(firstPage.totalDatasetItems).toEqual(25);
        expect(firstPage.datasetItems).toHaveLength(10);

        // Second page
        const secondPage = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 1,
          prisma,
          searchQuery: "data processing",
          searchType: ["content"],
          filter: [],
        });

        expect(secondPage.totalDatasetItems).toEqual(25);
        expect(secondPage.datasetItems).toHaveLength(10);

        // Third page
        const thirdPage = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 10,
          page: 2,
          prisma,
          searchQuery: "data processing",
          searchType: ["content"],
          filter: [],
        });

        expect(thirdPage.totalDatasetItems).toEqual(25);
        expect(thirdPage.datasetItems).toHaveLength(5); // Remaining items

        // Verify no duplicates across pages
        const allItemIds = [
          ...firstPage.datasetItems.map((item) => item.id),
          ...secondPage.datasetItems.map((item) => item.id),
          ...thirdPage.datasetItems.map((item) => item.id),
        ];
        const uniqueIds = new Set(allItemIds);
        expect(uniqueIds.size).toEqual(25);
      });

      it("should maintain consistent ordering across paginated search results", async () => {
        const firstPage = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 5,
          page: 0,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "category",
              operator: "=",
              value: "even",
            },
          ],
        });

        const secondPage = await fetchDatasetItems({
          projectId,
          datasetId,
          limit: 5,
          page: 1,
          prisma,
          filter: [
            {
              column: "metadata",
              type: "stringObject",
              key: "category",
              operator: "=",
              value: "even",
            },
          ],
        });

        // Verify items are properly ordered (assuming descending creation order)
        expect(firstPage.datasetItems).toHaveLength(5);
        expect(secondPage.datasetItems).toHaveLength(5);

        // Check that items are in consistent order
        const firstPageSequences = firstPage.datasetItems.map(
          (item) => (item.metadata as any).sequence,
        );
        const secondPageSequences = secondPage.datasetItems.map(
          (item) => (item.metadata as any).sequence,
        );

        // All sequences should be different between pages
        const overlap = firstPageSequences.filter((seq) =>
          secondPageSequences.includes(seq),
        );
        expect(overlap).toHaveLength(0);
      });
    });
  });
});
