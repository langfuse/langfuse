/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 } from "uuid";

describe("/api/public/datasets and /api/public/dataset-items API Endpoints", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should create and get a dataset", async () => {
    await makeAPICall("POST", "/api/public/datasets", {
      name: "dataset-name",
      description: "dataset-description",
    });

    const dbDataset = await prisma.dataset.findMany({
      where: {
        name: "dataset-name",
      },
    });

    expect(dbDataset.length).toBeGreaterThan(0);

    const getDataset = await makeAPICall(
      "GET",
      `/api/public/datasets/dataset-name`,
    );

    expect(getDataset.status).toBe(200);
    expect(getDataset.body).toMatchObject({
      name: "dataset-name",
      description: "dataset-description",
    });
  });

  it("GET datasets", async () => {
    await makeAPICall("POST", "/api/public/datasets", {
      name: "dataset-name-1",
    });

    await makeAPICall("POST", "/api/public/datasets", {
      name: "dataset-name-2",
    });

    const datasetItemId = v4();

    await makeAPICall("POST", "/api/public/dataset-items", {
      datasetName: "dataset-name-2",
      input: { key: "value" },
      expectedOutput: { key: "value" },
      id: datasetItemId,
    });

    const traceId = v4();
    const observationId = v4();

    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        },
        {
          id: v4(),
          type: "observation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: observationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            startTime: "2021-01-01T00:00:00.000Z",
            endTime: "2021-01-01T00:00:00.000Z",
            modelParameters: { key: "value" },
            input: { key: "value" },
            metadata: { key: "value" },
            version: "2.0.0",
          },
        },
      ],
    });
    expect(response.status).toBe(207);

    await makeAPICall("POST", "/api/public/dataset-run-items", {
      datasetItemId: datasetItemId,
      observationId: observationId,
      runName: "test-run",
      metadata: { key: "value" },
    });

    const getDatasets = await makeAPICall("GET", `/api/public/datasets`);

    expect(getDatasets.status).toBe(200);
    expect(getDatasets.body).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          name: "dataset-name-1",
          items: [],
          runs: [],
        }),
        expect.objectContaining({
          name: "dataset-name-2",
          items: [datasetItemId],
          runs: ["test-run"],
        }),
      ]),
      meta: expect.objectContaining({
        totalItems: 2,
        page: 1,
      }),
    });
  });

  it("should create and get a dataset item (via datasets and individually)", async () => {
    await makeAPICall("POST", "/api/public/datasets", {
      name: "dataset-name",
    });
    await makeAPICall("POST", "/api/public/dataset-items", {
      datasetName: "dataset-name",
      input: { key: "value" },
      expectedOutput: { key: "value" },
    });
    const dbDatasetItem = await prisma.datasetItem.findFirst({
      where: {
        dataset: {
          name: "dataset-name",
        },
      },
    });

    expect(dbDatasetItem).not.toBeNull();

    const getDataset = await makeAPICall(
      "GET",
      `/api/public/datasets/dataset-name`,
    );
    expect(getDataset.status).toBe(200);
    expect(getDataset.body).toMatchObject({
      name: "dataset-name",
      items: [
        {
          id: dbDatasetItem!.id,
          input: { key: "value" },
          expectedOutput: { key: "value" },
        },
      ],
    });

    const getDatasetItem = await makeAPICall(
      "GET",
      `/api/public/dataset-items/${dbDatasetItem!.id}`,
    );
    expect(getDatasetItem.status).toBe(200);
    expect(getDatasetItem.body).toMatchObject({
      id: dbDatasetItem!.id,
      input: { key: "value" },
      expectedOutput: { key: "value" },
    });
  });

  it("should upsert a dataset item", async () => {
    await makeAPICall("POST", "/api/public/datasets", {
      name: "dataset-name",
    });

    const item1 = await makeAPICall("POST", "/api/public/dataset-items", {
      id: "dataset-item-id",
      datasetName: "dataset-name",
      input: { key: "value" },
    });
    expect(item1.status).toBe(200);
    expect(item1.body).toMatchObject({
      id: "dataset-item-id",
    });

    const item2 = await makeAPICall("POST", "/api/public/dataset-items", {
      id: "dataset-item-id",
      datasetName: "dataset-name",
      input: { key: "value2" },
    });
    expect(item2.status).toBe(200);
    expect(item2.body).toMatchObject({
      id: "dataset-item-id",
      input: { key: "value2" },
    });

    const dbDatasetItem = await prisma.datasetItem.findFirst({
      where: { id: "dataset-item-id" },
    });
    expect(dbDatasetItem).not.toBeNull();
    expect(dbDatasetItem?.input).toMatchObject({ key: "value2" });
  });

  it("should create and get a dataset run", async () => {
    const dataset = await makeAPICall<{ id: string }>(
      "POST",
      "/api/public/datasets",
      {
        name: "dataset-name",
      },
    );
    expect(dataset.status).toBe(200);
    expect(dataset.body).toMatchObject({
      name: "dataset-name",
    });
    await makeAPICall("POST", "/api/public/dataset-items", {
      datasetName: "dataset-name",
      id: "dataset-item-id",
      input: { key: "value" },
      expectedOutput: { key: "value" },
    });
    const traceId = v4();
    const observationId = v4();
    const response = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
            metadata: { key: "value" },
            release: "1.0.0",
            version: "2.0.0",
          },
        },
        {
          id: v4(),
          type: "observation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: observationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            startTime: "2021-01-01T00:00:00.000Z",
            endTime: "2021-01-01T00:00:00.000Z",
            modelParameters: { key: "value" },
            input: { key: "value" },
            metadata: { key: "value" },
            version: "2.0.0",
          },
        },
      ],
    });
    expect(response.status).toBe(207);

    const runItemObservation = await makeAPICall(
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: "dataset-item-id",
        observationId: observationId,
        runName: "run-only-observation",
        runDescription: "run-description",
        metadata: { key: "value" },
      },
    );
    const dbRunObservation = await prisma.datasetRuns.findFirst({
      where: {
        name: "run-only-observation",
      },
      include: {
        datasetRunItems: true,
      },
    });
    expect(dbRunObservation).not.toBeNull();
    expect(dbRunObservation?.datasetId).toBe(dataset.body.id);
    expect(dbRunObservation?.metadata).toMatchObject({ key: "value" });
    expect(dbRunObservation?.description).toBe("run-description");
    expect(runItemObservation.status).toBe(200);
    expect(dbRunObservation?.datasetRunItems[0]).toMatchObject({
      datasetItemId: "dataset-item-id",
      observationId: observationId,
      traceId: traceId,
    });

    const getRunAPI = await makeAPICall(
      "GET",
      `/api/public/datasets/dataset-name/runs/run-only-observation`,
    );
    expect(getRunAPI.status).toBe(200);
    expect(getRunAPI.body).toMatchObject({
      name: "run-only-observation",
      description: "run-description",
      metadata: { key: "value" },
      datasetId: dataset.body.id,
      datasetName: "dataset-name",
      datasetRunItems: expect.arrayContaining([
        expect.objectContaining({
          datasetItemId: "dataset-item-id",
          observationId: observationId,
          traceId: traceId,
        }),
      ]),
    });

    const runItemTrace = await makeAPICall(
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: "dataset-item-id",
        traceId: traceId,
        runName: "run-only-trace",
        metadata: { key: "value" },
      },
    );
    const dbRunTrace = await prisma.datasetRuns.findFirst({
      where: {
        name: "run-only-trace",
      },
      include: {
        datasetRunItems: true,
      },
    });
    expect(dbRunTrace).not.toBeNull();
    expect(dbRunTrace?.datasetId).toBe(dataset.body.id);
    expect(dbRunTrace?.metadata).toMatchObject({ key: "value" });
    expect(runItemTrace.status).toBe(200);
    expect(dbRunTrace?.datasetRunItems[0]).toMatchObject({
      datasetItemId: "dataset-item-id",
      traceId: traceId,
      observationId: null,
    });

    const runItemBoth = await makeAPICall(
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: "dataset-item-id",
        observationId: observationId,
        traceId: traceId,
        runName: "run-name-both",
        metadata: { key: "value" },
      },
    );
    const dbRunBoth = await prisma.datasetRuns.findFirst({
      where: {
        name: "run-name-both",
      },
      include: {
        datasetRunItems: true,
      },
    });
    expect(dbRunBoth).not.toBeNull();
    expect(dbRunBoth?.datasetId).toBe(dataset.body.id);
    expect(dbRunBoth?.metadata).toMatchObject({ key: "value" });
    expect(runItemBoth.status).toBe(200);
    expect(dbRunBoth?.datasetRunItems[0]).toMatchObject({
      datasetItemId: "dataset-item-id",
      observationId: observationId,
      traceId: traceId,
    });
  });

  it("dataset-run-items should fail when neither trace nor observation provided", async () => {
    const response = await makeAPICall(
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: "dataset-item-id",
        runName: "run-fail",
      },
    );
    expect(response.status).toBe(400);
  });
});
