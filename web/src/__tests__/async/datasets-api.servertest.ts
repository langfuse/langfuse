/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import { v4 } from "uuid";
import {
  GetDatasetItemV1Response,
  GetDatasetItemsV1Response,
  GetDatasetRunV1Response,
  GetDatasetRunsV1Response,
  GetDatasetV1Response,
  GetDatasetV2Response,
  GetDatasetsV1Response,
  GetDatasetsV2Response,
  PostDatasetItemsV1Response,
  PostDatasetRunItemsV1Response,
  PostDatasetsV1Response,
  PostDatasetsV2Response,
} from "@/src/features/public-api/types/datasets";
import { v4 as uuidv4 } from "uuid";
import {
  createObservation,
  createObservationsCh,
  createTrace,
  createTracesCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

describe("/api/public/datasets and /api/public/dataset-items API Endpoints", () => {
  const traceId = v4();
  const observationId = v4();
  let auth: string;
  let projectId: string;

  beforeEach(async () => {
    const { auth: newAuth, projectId: newProjectId } =
      await createOrgProjectAndApiKey();
    auth = newAuth;
    projectId = newProjectId;
    const trace = createTrace({
      id: traceId,
      name: "trace-name",
      user_id: "user-1",
      project_id: projectId,
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "GENERATION",
      name: "generation-name",
      start_time: new Date("2021-01-01T00:00:00.000Z").getTime(),
      end_time: new Date("2021-01-01T00:00:00.000Z").getTime(),
      model_parameters: JSON.stringify({ key: "value" }),
      input: JSON.stringify({ key: "value" }),
      metadata: { key: "value" },
      version: "2.0.0",
    });

    await createTracesCh([trace]);
    await createObservationsCh([observation]);
  });

  it("should create and get a dataset (v1), include special characters", async () => {
    const createRes = await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      {
        name: "dataset + name",
        description: "dataset-description",
        metadata: { foo: "bar" },
      },
      auth,
    );
    expect(createRes.status).toBe(200);
    expect(createRes.body).toMatchObject({
      name: "dataset + name",
      description: "dataset-description",
      metadata: { foo: "bar" },
      items: [],
      runs: [],
    });

    const dbDataset = await prisma.dataset.findMany({
      where: {
        name: "dataset + name",
      },
    });
    expect(dbDataset.length).toBeGreaterThan(0);

    // get dataset (v1) excluding items and runs
    const getDatasetV1 = await makeZodVerifiedAPICall(
      GetDatasetV1Response,
      "GET",
      `/api/public/datasets/${encodeURIComponent("dataset + name")}`,
      undefined,
      auth,
    );
    expect(getDatasetV1.status).toBe(200);
    expect(getDatasetV1.body).toMatchObject({
      name: "dataset + name",
      description: "dataset-description",
      metadata: { foo: "bar" },
      items: [],
      runs: [],
    });
  });

  it("should create and get a dataset (v2), include special characters", async () => {
    const createRes = await makeZodVerifiedAPICall(
      PostDatasetsV2Response,
      "POST",
      "/api/public/v2/datasets",
      {
        name: "dataset + name + v2",
        description: "dataset-description",
        metadata: { foo: "bar" },
      },
      auth,
    );
    expect(createRes.status).toBe(200);
    expect(createRes.body).toMatchObject({
      name: "dataset + name + v2",
      description: "dataset-description",
      metadata: { foo: "bar" },
    });

    const dbDataset = await prisma.dataset.findMany({
      where: {
        name: "dataset + name + v2",
      },
    });
    expect(dbDataset.length).toBeGreaterThan(0);

    // get dataset (v2) excluding items and runs
    const getDatasetV2 = await makeZodVerifiedAPICall(
      GetDatasetV2Response,
      "GET",
      `/api/public/v2/datasets/${encodeURIComponent("dataset + name + v2")}`,
      undefined,
      auth,
    );
    expect(getDatasetV2.status).toBe(200);
    expect(getDatasetV2.body).toMatchObject({
      name: "dataset + name + v2",
      description: "dataset-description",
      metadata: { foo: "bar" },
    });
    expect(getDatasetV2.body).not.toHaveProperty("items");
    expect(getDatasetV2.body).not.toHaveProperty("runs");
  });

  it("should not return ARCHIVED dataset items when getting a dataset", async () => {
    // Create dataset
    await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      {
        name: "dataset-with-archived",
        description: "dataset with archived items",
      },
      auth,
    );

    // Create an archived dataset item
    const archivedItem = await makeZodVerifiedAPICall(
      PostDatasetItemsV1Response,
      "POST",
      "/api/public/dataset-items",
      {
        datasetName: "dataset-with-archived",
        id: "archived-item-id",
        input: { key: "value" },
        status: "ARCHIVED",
      },
      auth,
    );
    expect(archivedItem.status).toBe(200);

    // Create an active dataset item
    const activeItem = await makeZodVerifiedAPICall(
      PostDatasetItemsV1Response,
      "POST",
      "/api/public/dataset-items",
      {
        datasetName: "dataset-with-archived",
        id: "active-item-id",
        input: { key: "value" },
        status: "ACTIVE",
      },
      auth,
    );
    expect(activeItem.status).toBe(200);

    // Get dataset and verify only active item is returned
    const getDataset = await makeZodVerifiedAPICall(
      GetDatasetV1Response,
      "GET",
      `/api/public/datasets/${encodeURIComponent("dataset-with-archived")}`,
      undefined,
      auth,
    );

    expect(getDataset.status).toBe(200);
    expect(getDataset.body.items).toHaveLength(1);
    expect(getDataset.body.items[0].id).toEqual("active-item-id");
  });

  it("GET datasets (v1 & v2)", async () => {
    // v1 post
    await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      {
        name: "dataset-name-1",
        description: "dataset-description-1",
        metadata: { key: "value" },
      },
      auth,
    );
    // v2 post
    await makeZodVerifiedAPICall(
      PostDatasetsV2Response,
      "POST",
      "/api/public/v2/datasets",
      {
        name: "dataset-name-2",
      },
      auth,
    );

    const datasetItemId = v4();

    const createItemRes = await makeZodVerifiedAPICall(
      PostDatasetItemsV1Response,
      "POST",
      "/api/public/dataset-items",
      {
        datasetName: "dataset-name-2",
        input: { key: "value" },
        expectedOutput: { key: "value" },
        metadata: { key: "value-dataset-item" },
        id: datasetItemId,
      },
      auth,
    );

    expect(createItemRes.status).toBe(200);
    expect(createItemRes.body).toMatchObject({
      datasetName: "dataset-name-2", // not included in db table
    });

    await makeZodVerifiedAPICall(
      PostDatasetRunItemsV1Response,
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: datasetItemId,
        observationId: observationId,
        runName: "test-run",
        metadata: { key: "value" },
      },
      auth,
    );

    const getDatasetsV1 = await makeZodVerifiedAPICall(
      GetDatasetsV1Response,
      "GET",
      `/api/public/datasets`,
      undefined,
      auth,
    );

    expect(getDatasetsV1.status).toBe(200);
    expect(getDatasetsV1.body).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          name: "dataset-name-1",
          description: "dataset-description-1",
          metadata: { key: "value" },
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

    const getDatasetsV2 = await makeZodVerifiedAPICall(
      GetDatasetsV2Response,
      "GET",
      `/api/public/v2/datasets`,
      undefined,
      auth,
    );

    expect(getDatasetsV2.status).toBe(200);
    expect(getDatasetsV2.body).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          name: "dataset-name-1",
          description: "dataset-description-1",
          metadata: { key: "value" },
        }),
        expect.objectContaining({
          name: "dataset-name-2",
          description: null,
          metadata: null,
        }),
      ]),
      meta: expect.objectContaining({
        totalItems: 2,
        page: 1,
      }),
    });
  });

  it("should create and get a dataset items (via datasets (v1), individually, and as a list)", async () => {
    await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      {
        name: "dataset-name",
      },
      auth,
    );
    for (let i = 0; i < 5; i++) {
      await makeZodVerifiedAPICall(
        PostDatasetItemsV1Response,
        "POST",
        "/api/public/dataset-items",
        {
          datasetName: "dataset-name",
          input: { key: "value" },
          expectedOutput: { key: "value" },
          metadata: { key: "value-dataset-item" },
          sourceTraceId: i % 2 === 0 ? traceId : undefined,
          sourceObservationId: i % 2 === 0 ? observationId : undefined,
        },
        auth,
      );
    }
    const dbDatasetItems = await prisma.datasetItem.findMany({
      where: {
        projectId: projectId,
        dataset: {
          name: "dataset-name",
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    expect(dbDatasetItems.length).toBe(5);
    const dbDatasetItemsApiResponseFormat = dbDatasetItems.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ projectId, ...item }) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        datasetName: "dataset-name",
      }),
    );

    // add another dataset to test the list endpoint
    await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      {
        name: "dataset-name-other",
      },
      auth,
    );
    await makeZodVerifiedAPICall(
      PostDatasetItemsV1Response,
      "POST",
      "/api/public/dataset-items",
      {
        datasetName: "dataset-name-other",
        input: { key: "value" },
        expectedOutput: { key: "value" },
      },
      auth,
    );
    const dbDatasetItemsOther = await prisma.datasetItem.findMany({
      where: {
        projectId: projectId,
        dataset: {
          name: "dataset-name-other",
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    expect(dbDatasetItemsOther.length).toBe(1);
    const dbDatasetItemsOtherApiResponseFormat = dbDatasetItemsOther.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ projectId, ...item }) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        datasetName: "dataset-name-other",
      }),
    );
    const dbDatasetItemsAllApiResponseFormat = [
      ...dbDatasetItemsApiResponseFormat,
      ...dbDatasetItemsOtherApiResponseFormat,
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // createdAt desc

    // Get dataset (v1) includes list of items
    const getDataset = await makeZodVerifiedAPICall(
      GetDatasetV1Response,
      "GET",
      `/api/public/datasets/dataset-name`,
      undefined,
      auth,
    );
    expect(getDataset.status).toBe(200);
    expect(getDataset.body).toMatchObject({
      name: "dataset-name",
      items: dbDatasetItemsApiResponseFormat,
    });

    // Get List
    const getDatasetItemsAll = await makeZodVerifiedAPICall(
      GetDatasetItemsV1Response,
      "GET",
      `/api/public/dataset-items`,
      undefined,
      auth,
    );
    expect(getDatasetItemsAll.status).toBe(200);
    expect(getDatasetItemsAll.body).toMatchObject({
      data: dbDatasetItemsAllApiResponseFormat,
      meta: expect.objectContaining({
        totalItems: 6,
        page: 1,
      }),
    });
    // Get List, check pagination
    const getDatasetItemsAllPage2 = await makeZodVerifiedAPICall(
      GetDatasetItemsV1Response,
      "GET",
      `/api/public/dataset-items?page=2&limit=1`,
      undefined,
      auth,
    );
    expect(getDatasetItemsAllPage2.status).toBe(200);
    expect(getDatasetItemsAllPage2.body).toMatchObject({
      data: dbDatasetItemsAllApiResponseFormat.slice(1, 2),
      meta: expect.objectContaining({
        totalItems: 6,
        page: 2,
        totalPages: 6,
        limit: 1,
      }),
    });
    // Get filtered list by datasetName
    const getDatasetItems = await makeZodVerifiedAPICall(
      GetDatasetItemsV1Response,
      "GET",
      `/api/public/dataset-items?datasetName=dataset-name`,
      undefined,
      auth,
    );
    expect(getDatasetItems.status).toBe(200);
    expect(getDatasetItems.body).toMatchObject({
      data: dbDatasetItemsApiResponseFormat,
      meta: expect.objectContaining({
        totalItems: 5,
        page: 1,
      }),
    });
    // Get filtered list by sourceTraceId
    const getDatasetItemsTrace = await makeZodVerifiedAPICall(
      GetDatasetItemsV1Response,
      "GET",
      `/api/public/dataset-items?sourceTraceId=${traceId}`,
      undefined,
      auth,
    );
    expect(getDatasetItemsTrace.status).toBe(200);
    expect(getDatasetItemsTrace.body).toMatchObject({
      data: dbDatasetItemsApiResponseFormat.filter(
        (item) => item.sourceTraceId === traceId,
      ),
      meta: expect.objectContaining({
        totalItems: 3,
        page: 1,
      }),
    });
    // Get filtered list by sourceObservationId
    const getDatasetItemsObservation = await makeZodVerifiedAPICall(
      GetDatasetItemsV1Response,
      "GET",
      `/api/public/dataset-items?sourceObservationId=${observationId}`,
      undefined,
      auth,
    );
    expect(getDatasetItemsObservation.status).toBe(200);
    expect(getDatasetItemsObservation.body).toMatchObject({
      data: dbDatasetItemsApiResponseFormat.filter(
        (item) => item.sourceObservationId === observationId,
      ),
      meta: expect.objectContaining({
        totalItems: 3,
        page: 1,
      }),
    });

    // Get single item
    const singleItem = dbDatasetItemsApiResponseFormat[0];
    const getDatasetItem = await makeZodVerifiedAPICall(
      GetDatasetItemV1Response,
      "GET",
      `/api/public/dataset-items/${singleItem.id}`,
      undefined,
      auth,
    );
    expect(getDatasetItem.status).toBe(200);
    expect(getDatasetItem.body).toMatchObject(singleItem);
  });

  it("should upsert a dataset item", async () => {
    await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      {
        name: "dataset-name",
      },
      auth,
    );

    const item1 = await makeZodVerifiedAPICall(
      PostDatasetItemsV1Response,
      "POST",
      "/api/public/dataset-items",
      {
        id: "dataset-item-id",
        datasetName: "dataset-name",
        input: { key: "value" },
        metadata: { key: "value-dataset-item" },
      },
      auth,
    );
    expect(item1.status).toBe(200);
    expect(item1.body).toMatchObject({
      id: "dataset-item-id",
    });

    const item2 = await makeZodVerifiedAPICall(
      PostDatasetItemsV1Response,
      "POST",
      "/api/public/dataset-items",
      {
        id: "dataset-item-id",
        datasetName: "dataset-name",
        input: { key: "value2" },
        metadata: ["hello-world"],
        status: "ARCHIVED",
      },
      auth,
    );
    expect(item2.status).toBe(200);
    expect(item2.body).toMatchObject({
      id: "dataset-item-id",
      input: { key: "value2" },
      metadata: ["hello-world"],
      status: "ARCHIVED",
    });

    const dbDatasetItem = await prisma.datasetItem.findFirst({
      where: { id: "dataset-item-id" },
    });
    expect(dbDatasetItem).not.toBeNull();
    expect(dbDatasetItem?.input).toMatchObject({ key: "value2" });
    expect(dbDatasetItem?.metadata).toMatchObject(["hello-world"]);
    expect(dbDatasetItem?.status).toBe("ARCHIVED");
  });

  it("should create and get a dataset run, include special characters", async () => {
    const dataset = await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      {
        name: "dataset name",
      },
      auth,
    );
    expect(dataset.status).toBe(200);
    expect(dataset.body).toMatchObject({
      name: "dataset name",
    });
    await makeZodVerifiedAPICall(
      PostDatasetItemsV1Response,
      "POST",
      "/api/public/dataset-items",
      {
        datasetName: "dataset name",
        id: "dataset-item-id",
        input: { key: "value" },
        expectedOutput: { key: "value" },
      },
      auth,
    );
    const traceId = v4();
    const observationId = v4();
    const trace = createTrace({
      id: traceId,
      name: "trace-name",
      user_id: "user-1",
      project_id: projectId,
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "GENERATION",
      name: "generation-name",
      start_time: new Date("2021-01-01T00:00:00.000Z").getTime(),
      end_time: new Date("2021-01-01T00:00:00.000Z").getTime(),
      model_parameters: JSON.stringify({ key: "value" }),
      input: JSON.stringify({ key: "value" }),
      metadata: { key: "value" },
      version: "2.0.0",
    });

    await createTracesCh([trace]);
    await createObservationsCh([observation]);

    const runItemObservation = await makeZodVerifiedAPICall(
      PostDatasetRunItemsV1Response,
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: "dataset-item-id",
        observationId: observationId,
        runName: "run + only + observation",
        runDescription: "run-description",
        metadata: { key: "value" },
      },
      auth,
    );
    const dbRunObservation = await prisma.datasetRuns.findFirst({
      where: {
        projectId,
        name: "run + only + observation",
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

    const getRunAPI = await makeZodVerifiedAPICall(
      GetDatasetRunV1Response,
      "GET",
      `/api/public/datasets/${encodeURIComponent("dataset name")}/runs/${encodeURIComponent("run + only + observation")}`,
      undefined,
      auth,
    );
    expect(getRunAPI.status).toBe(200);
    expect(getRunAPI.body).toMatchObject({
      name: "run + only + observation",
      description: "run-description",
      metadata: { key: "value" },
      datasetId: dataset.body.id,
      datasetName: "dataset name",
      datasetRunItems: expect.arrayContaining([
        expect.objectContaining({
          datasetItemId: "dataset-item-id",
          observationId: observationId,
          traceId: traceId,
          datasetRunName: "run + only + observation",
        }),
      ]),
    });

    const runItemTrace = await makeZodVerifiedAPICall(
      PostDatasetRunItemsV1Response,
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: "dataset-item-id",
        traceId: traceId,
        runName: "run-only-trace",
        metadata: { key: "value" },
      },
      auth,
    );

    expect(runItemTrace.status).toBe(200);
    expect(runItemTrace.body).toMatchObject({
      datasetRunName: "run-only-trace", // not included in db table
    });

    const dbRunTrace = await prisma.datasetRuns.findFirst({
      where: {
        projectId,
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

    const runItemBoth = await makeZodVerifiedAPICall(
      PostDatasetRunItemsV1Response,
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: "dataset-item-id",
        observationId: observationId,
        traceId: traceId,
        runName: "run-name-both",
        metadata: { key: "value" },
      },
      auth,
    );
    const dbRunBoth = await prisma.datasetRuns.findFirst({
      where: {
        projectId,
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

  it("GET /api/public/datasets/{datasetName}/runs", async () => {
    // create multiple runs
    await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      {
        name: "dataset-name",
      },
      auth,
    );
    await makeZodVerifiedAPICall(
      PostDatasetItemsV1Response,
      "POST",
      "/api/public/dataset-items",
      {
        datasetName: "dataset-name",
        id: "dataset-item-id",
        input: { key: "value" },
        expectedOutput: { key: "value" },
      },
      auth,
    );
    const traceId = v4();
    const observationId = v4();
    const trace = createTrace({
      id: traceId,
      name: "trace-name",
      user_id: "user-1",
      project_id: projectId,
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    const observation = createObservation({
      id: observationId,
      trace_id: traceId,
      project_id: projectId,
      type: "GENERATION",
      name: "generation-name",
      start_time: new Date("2021-01-01T00:00:00.000Z").getTime(),
      end_time: new Date("2021-01-01T00:00:00.000Z").getTime(),
      model_parameters: JSON.stringify({ key: "value" }),
      input: JSON.stringify({ key: "value" }),
      metadata: { key: "value" },
      version: "2.0.0",
    });

    await createTracesCh([trace]);
    await createObservationsCh([observation]);

    await makeZodVerifiedAPICall(
      PostDatasetRunItemsV1Response,
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: "dataset-item-id",
        traceId: traceId,
        observationId: observationId,
        runName: "run-1",
      },
      auth,
    );
    await makeZodVerifiedAPICall(
      PostDatasetRunItemsV1Response,
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: "dataset-item-id",
        traceId: traceId,
        observationId: observationId,
        runName: "run-2",
      },
      auth,
    );
    await makeZodVerifiedAPICall(
      PostDatasetRunItemsV1Response,
      "POST",
      "/api/public/dataset-run-items",
      {
        datasetItemId: "dataset-item-id",
        traceId: traceId,
        observationId: observationId,
        runName: "run-3",
      },
      auth,
    );

    // check runs in db
    const dbRuns = await prisma.datasetRuns.findMany({
      where: {
        projectId: projectId,
        dataset: { name: "dataset-name" },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    expect(dbRuns.length).toBe(3);
    const dbRunsApiResponseFormat = dbRuns.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ projectId, ...run }) => ({
        ...run,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
        datasetName: "dataset-name",
      }),
    );

    // test get runs
    const getRuns = await makeZodVerifiedAPICall(
      GetDatasetRunsV1Response,
      "GET",
      `/api/public/datasets/dataset-name/runs`,
      undefined,
      auth,
    );
    expect(getRuns.status).toBe(200);
    expect(getRuns.body).toMatchObject({
      data: dbRunsApiResponseFormat,
      meta: expect.objectContaining({
        totalItems: 3,
        page: 1,
      }),
    });

    // test runs with pagination
    const getRunsPage2 = await makeZodVerifiedAPICall(
      GetDatasetRunsV1Response,
      "GET",
      `/api/public/datasets/dataset-name/runs?page=2&limit=1`,
      undefined,
      auth,
    );
    expect(getRunsPage2.status).toBe(200);
    expect(getRunsPage2.body).toMatchObject({
      data: dbRunsApiResponseFormat.slice(1, 2),
      meta: expect.objectContaining({
        totalItems: 3,
        page: 2,
        totalPages: 3,
        limit: 1,
      }),
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

  it("dataset item ids should be reusable across projects", async () => {
    const otherProject = await prisma.project.create({
      data: {
        name: "other-project",
        organization: {
          connectOrCreate: {
            where: { id: "other-org" },
            create: { name: "other-org", id: "other-org" },
          },
        },
      },
    });

    // dataset ids are always generated
    const datasetBody = {
      name: "dataset-name",
    };
    // dataset, id is generated
    const apiDataset = await makeZodVerifiedAPICall(
      PostDatasetsV1Response,
      "POST",
      "/api/public/datasets",
      { ...datasetBody, metadata: "api-dataset" },
    );
    const otherProjDbDataset = await prisma.dataset.create({
      data: {
        ...datasetBody,
        projectId: otherProject.id,
        id: apiDataset.body.id, // use the same id, not possible via api, done to check security of this
      },
    });
    const getApiDataset = await makeZodVerifiedAPICall(
      GetDatasetV1Response,
      "GET",
      `/api/public/datasets/${encodeURIComponent(datasetBody.name)}`,
    );
    expect(getApiDataset.body.metadata).toBe("api-dataset");

    // item ids can be set by the user
    const datasetItemBody = {
      input: "item-input",
      id: uuidv4(),
    };
    await prisma.datasetItem.create({
      data: {
        ...datasetItemBody,
        expectedOutput: "other-proj",
        projectId: otherProject.id,
        datasetId: otherProjDbDataset.id,
      },
    });

    // dataset item, id is set
    await makeZodVerifiedAPICall(
      PostDatasetItemsV1Response,
      "POST",
      "/api/public/dataset-items",
      {
        ...datasetItemBody,
        expectedOutput: "api-item",
        datasetName: datasetBody.name,
        metadata: "api-item",
      },
    );
    const getApiDatasetItem = await makeZodVerifiedAPICall(
      GetDatasetItemV1Response,
      "GET",
      `/api/public/dataset-items/${datasetItemBody.id}`,
    );
    expect(getApiDatasetItem.body.metadata).toBe("api-item");
    const dbItems = await prisma.datasetItem.findMany({
      where: { id: datasetItemBody.id },
    });
    expect(dbItems.length).toBe(2);
    expect(dbItems).toHaveLength(2);
    expect(dbItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: "api-item",
          projectId: apiDataset.body.projectId,
          id: datasetItemBody.id,
        }),
        expect.objectContaining({
          metadata: null,
          projectId: otherProject.id,
          id: datasetItemBody.id,
        }),
      ]),
    );
  });
});
