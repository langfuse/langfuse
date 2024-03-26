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

    const runItem = await makeAPICall("POST", "/api/public/dataset-run-items", {
      datasetItemId: "dataset-item-id",
      observationId: observationId,
      runName: "run-name",
      metadata: { key: "value" },
    });
    const dbRun = await prisma.datasetRuns.findFirst({
      where: {
        name: "run-name",
      },
    });
    expect(dbRun).not.toBeNull();
    expect(dbRun?.datasetId).toBe(dataset.body.id);
    expect(dbRun?.metadata).toMatchObject({ key: "value" });
    expect(runItem.status).toBe(200);
    expect(runItem.body).toMatchObject({
      datasetItemId: "dataset-item-id",
      observationId: observationId,
      datasetRunId: dbRun?.id,
    });
  });
});
