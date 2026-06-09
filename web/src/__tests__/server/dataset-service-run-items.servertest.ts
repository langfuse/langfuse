import {
  createDatasetRunItemsCh,
  createObservationsCh,
  createScoresCh,
  createTracesCh,
  getDatasetRunItemsByDatasetIdCh,
  createDatasetRunItem,
  createDatasetItem,
  v4,
  prisma,
  createObservation,
  createTraceScore,
  createTrace,
  getRunItemsByRunIdOrItemId,
  projectId,
} from "./dataset-service.fixtures";

describe("Fetch datasets for UI presentation", () => {
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
});
