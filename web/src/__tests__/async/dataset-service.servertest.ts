import {
  createObservations,
  createScores,
  createTraces,
} from "@/src/__tests__/server/repositories/clickhouse-helpers";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createObservation,
  createScore,
  createTrace,
} from "@/src/__tests__/fixtures/tracing-factory";
import {
  createDatasetRunsTable,
  fetchDatasetItems,
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
    await createObservations([
      observation,
      observation2,
      observation3,
      observation4,
      observation5,
    ]);
    const score = createScore({
      id: scoreId,
      observation_id: observationId,
      trace_id: traceId,
      project_id: projectId,
      name: scoreName,
    });
    await createScores([score]);

    const runs = await createDatasetRunsTable({
      projectId,
      datasetId,
      queryClickhouse: false,
      page: 0,
      limit: 10,
    });

    console.log("runs", JSON.stringify(runs));

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

    const expectedObject = JSON.stringify({
      [`${scoreName.replaceAll("-", "_")}-API-NUMERIC`]: {
        type: "NUMERIC",
        values: [100.5],
        average: 100.5,
        comment: "comment",
      },
    });

    expect(JSON.stringify(firstRun.scores)).toEqual(expectedObject);

    const secondRun = runs.find((run) => run.run_id === datasetRun2Id);

    expect(secondRun).toBeDefined();
    if (!secondRun) {
      throw new Error("second run is not defined");
    }

    expect(secondRun.run_id).toEqual(datasetRun2Id);
    expect(secondRun.run_description).toBeNull();
    expect(secondRun.run_metadata).toEqual({});
    expect(secondRun.avgLatency).toEqual(1);
    expect(secondRun.avgTotalCost.toString()).toStrictEqual("300");

    expect(JSON.stringify(secondRun.scores)).toEqual(JSON.stringify({}));
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

    const observation = createObservation({
      id: observationId2,
      trace_id: traceId2,
      project_id: projectId,
      start_time: new Date().getTime() - 1000 * 60 * 60, // minus 1 min
      end_time: new Date().getTime(),
    });

    await createObservations([observation]);

    const trace1 = createTrace({
      id: traceId1,
      project_id: projectId,
    });
    const trace2 = createTrace({
      id: traceId2,
      project_id: projectId,
    });

    await createTraces([trace1, trace2]);

    const input = {
      projectId: projectId,
      datasetId: datasetId,
      limit: 10,
      page: 0,
      prisma: prisma,
    };

    const result = await fetchDatasetItems(input);

    expect(result.totalDatasetItems).toEqual(2);
    expect(result.datasetItems).toHaveLength(2);

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
  });
});
