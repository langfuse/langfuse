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
});
