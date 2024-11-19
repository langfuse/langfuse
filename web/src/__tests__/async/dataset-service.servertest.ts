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
import { createDatasetRunsTable } from "@/src/features/datasets/server/service";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("dataset service", () => {
  it("should be able to fetch data for dataset run UI", async () => {
    const datasetId = v4();
    console.log("datasetId", datasetId);
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
    const observationId = v4();
    const traceId = v4();
    const scoreId = v4();

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

    const trace = createTrace({ id: traceId, project_id: projectId });
    createTraces([trace]);
    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
    });
    createObservations([observation]);
    const score = createScore({
      id: scoreId,
      observation_id: observationId,
      trace_id: traceId,
      project_id: projectId,
    });
    createScores([score]);

    const { scores } = await createDatasetRunsTable({
      projectId,
      datasetId,
      queryClickhouse: false,
      page: 0,
      limit: 10,
    });

    expect(scores).toHaveLength(1);
    expect(scores[0].id).toEqual(scoreId);
    expect(scores[0].traceId).toEqual(traceId);
    expect(scores[0].observationId).toEqual(observationId);
    expect(scores[0].projectId).toEqual(projectId);
  });
});
