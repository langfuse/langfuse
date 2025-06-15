import {
  createObservationsCh,
  createScoresCh,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createObservation,
  createTraceScore,
  createTrace,
} from "@langfuse/shared/src/server";
import {
  createDatasetRunsTable,
  fetchDatasetItems,
  getRunItemsByRunIdOrItemId,
} from "@/src/features/datasets/server/service";

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

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId,
        datasetRunId: datasetRunId,
        observationId: observationId,
        traceId: traceId,
        projectId,
        datasetItemId,
      },
    });

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId2,
        datasetRunId: datasetRunId,
        traceId: traceId2,
        projectId,
        datasetItemId,
      },
    });

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId3,
        datasetRunId: datasetRunId,
        traceId: traceId3,
        projectId,
        datasetItemId,
      },
    });

    // linked to the second run
    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId4,
        datasetRunId: datasetRun2Id,
        observationId: null,
        traceId: traceId4,
        projectId,
        datasetItemId,
      },
    });

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
    await createObservationsCh([
      observation,
      observation2,
      observation3,
      observation4,
      observation5,
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

    const runs = await createDatasetRunsTable({
      projectId,
      datasetId,
      page: 0,
      limit: 10,
    });

    expect(runs).toHaveLength(2);

    const firstRun = runs.find((run) => run.run_id === datasetRunId);
    expect(firstRun).toBeDefined();
    if (!firstRun) {
      throw new Error("first run is not defined");
    }
    expect(firstRun.run_id).toEqual(datasetRunId);

    expect(firstRun.run_description).toBeNull();
    expect(firstRun.run_metadata).toEqual({});

    expect(firstRun.avgLatency).toBeGreaterThanOrEqual(10800);
    expect(firstRun.avgTotalCost.toString()).toStrictEqual("275");

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

    const secondRun = runs.find((run) => run.run_id === datasetRun2Id);

    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("second run is not defined");
    }

    expect(secondRun.run_id).toEqual(datasetRun2Id);
    expect(secondRun.run_description).toBeNull();
    expect(secondRun.run_metadata).toEqual({});
    expect(secondRun.avgLatency).toBeGreaterThanOrEqual(1);
    expect(secondRun.avgLatency).toBeLessThanOrEqual(1.002);
    expect(secondRun.avgTotalCost.toString()).toStrictEqual("300");

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

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId,
        datasetRunId: datasetRunId,
        traceId: traceId,
        projectId,
        datasetItemId,
      },
    });

    // linked to the second run
    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId2,
        datasetRunId: datasetRun2Id,
        observationId: null,
        traceId: traceId,
        projectId,
        datasetItemId,
      },
    });

    const scoreName = v4();
    const score = createTraceScore({
      id: scoreId,
      observation_id: null,
      trace_id: traceId,
      project_id: projectId,
      name: scoreName,
    });

    await createScoresCh([score]);

    const runs = await createDatasetRunsTable({
      projectId,
      datasetId,
      page: 0,
      limit: 10,
    });

    expect(runs).toHaveLength(2);

    const firstRun = runs.find((run) => run.run_id === datasetRunId);
    expect(firstRun).toBeDefined();
    if (!firstRun) {
      throw new Error("first run is not defined");
    }
    expect(firstRun.run_id).toEqual(datasetRunId);

    expect(firstRun.run_description).toBeNull();
    expect(firstRun.run_metadata).toEqual({});

    expect(firstRun.avgLatency).toBeGreaterThanOrEqual(0);
    expect(firstRun.avgTotalCost.toString()).toStrictEqual("0");

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

    const secondRun = runs.find((run) => run.run_id === datasetRun2Id);

    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("second run is not defined");
    }

    expect(secondRun.run_id).toEqual(datasetRun2Id);
    expect(secondRun.run_description).toBeNull();
    expect(secondRun.run_metadata).toEqual({});
    expect(secondRun.avgLatency).toEqual(0);
    expect(secondRun.avgTotalCost.toString()).toStrictEqual("0");

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

    const datasetRunItemId = v4();
    const traceId = v4();

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId,
        datasetRunId: datasetRunId,
        traceId: traceId,
        projectId,
        datasetItemId,
      },
    });

    const traceId2 = v4();
    const observationId = v4();
    const datasetRunItemId2 = v4();

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId2,
        datasetRunId: datasetRunId,
        traceId: traceId2,
        projectId,
        datasetItemId,
        observationId,
      },
    });

    const trace1 = createTrace({
      id: traceId,
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
      trace_id: traceId,
    });

    await createObservationsCh([observation]);

    const score = createTraceScore({
      observation_id: observation2.id,
      trace_id: traceId2,
      project_id: projectId,
    });

    await createScoresCh([score]);

    const runs = await getRunItemsByRunIdOrItemId(
      projectId,
      // fetch directly from the db to have realistic data.
      await prisma.datasetRunItems.findMany({
        where: {
          id: {
            in: [datasetRunItemId, datasetRunItemId2],
          },
        },
      }),
    );

    expect(runs).toHaveLength(2);

    const firstRun = runs.find((run) => run.id === datasetRunItemId);
    expect(firstRun).toBeDefined();
    if (!firstRun) {
      throw new Error("first run is not defined");
    }

    expect(firstRun.id).toEqual(datasetRunItemId);
    expect(firstRun.datasetItemId).toEqual(datasetItemId);
    expect(firstRun.observation).toBeUndefined();
    expect(firstRun.trace).toBeDefined();
    expect(firstRun.trace?.id).toEqual(traceId);

    const secondRun = runs.find((run) => run.id === datasetRunItemId2);
    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("secondRun is not defined");
    }

    expect(secondRun.id).toEqual(datasetRunItemId2);
    expect(secondRun.datasetItemId).toEqual(datasetItemId);
    expect(secondRun.trace?.id).toEqual(traceId2);
    expect(secondRun.observation?.id).toEqual(observationId);

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

    expect(secondRun.scores).toEqual(expectedObject);
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

    const datasetRunItemId = v4();
    const traceId = v4();

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId,
        datasetRunId: datasetRunId,
        traceId: traceId,
        projectId,
        datasetItemId,
      },
    });

    const traceId2 = v4();
    const observationId = v4();
    const datasetRunItemId2 = v4();

    await prisma.datasetRunItems.create({
      data: {
        id: datasetRunItemId2,
        datasetRunId: datasetRunId,
        traceId: traceId2,
        projectId,
        datasetItemId,
        observationId,
      },
    });

    const runs = await getRunItemsByRunIdOrItemId(
      projectId,
      // fetch directly from the db to have realistic data.
      await prisma.datasetRunItems.findMany({
        where: {
          id: {
            in: [datasetRunItemId, datasetRunItemId2],
          },
        },
      }),
    );

    expect(runs).toHaveLength(2);

    const firstRun = runs.find((run) => run.id === datasetRunItemId);
    expect(firstRun).toBeDefined();
    if (!firstRun) {
      throw new Error("first run is not defined");
    }

    expect(firstRun.id).toEqual(datasetRunItemId);
    expect(firstRun.datasetItemId).toEqual(datasetItemId);
    expect(firstRun.observation).toBeUndefined();
    expect(firstRun.trace).toBeDefined();
    expect(firstRun.trace?.id).toEqual(traceId);

    const secondRun = runs.find((run) => run.id === datasetRunItemId2);
    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("secondRun is not defined");
    }

    expect(secondRun.id).toEqual(datasetRunItemId2);
    expect(secondRun.datasetItemId).toEqual(datasetItemId);
    expect(secondRun.trace?.id).toEqual(traceId2);
    expect(secondRun.observation?.id).toEqual(observationId);
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
});
