import {
  createDatasetRunItemsCh,
  createObservationsCh,
  createScoresCh,
  getDatasetRunsTableMetricsCh,
  getScoresForExperiments,
  getTraceScoresForDatasetRuns,
  createDatasetRunItem,
  createDatasetItem,
  createManyDatasetItems,
  v4,
  prisma,
  createObservation,
  createTraceScore,
  aggregateScores,
  projectId,
} from "./dataset-service.fixtures";

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
      getScoresForExperiments({
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
      getScoresForExperiments({
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
});
