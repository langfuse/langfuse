/** @jest-environment node */

import { v4 as uuidv4 } from "uuid";

import {
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import { ModelUsageUnit } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  GetObservationV1Response,
  GetObservationsV1Response,
} from "@/src/features/public-api/types/observations";

describe("/api/public/observations API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should fetch all observations", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    await prisma.trace.create({
      data: {
        id: traceId,
        name: "trace-name",
        userId: "user-1",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    });

    const model = await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000010",
        outputPrice: "0.0000020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        projectId: null,
        unit: ModelUsageUnit.Tokens,
      },
    });

    const prompt = await prisma.prompt.create({
      data: {
        name: "prompt-name",
        prompt: "prompt-one",
        isActive: false,
        version: 1,
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        createdBy: "user-1",
      },
    });

    await prisma.observation.create({
      data: {
        id: uuidv4(),
        traceId: traceId,
        name: "generation-name",
        startTime: new Date("2021-01-01T00:00:00.000Z"),
        endTime: new Date("2021-01-01T00:00:00.000Z"),
        model: "gpt-3.5-turbo",
        modelParameters: { key: "value" },
        input: { key: "input" },
        output: { key: "output" },
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        version: "2.0.0",
        type: "GENERATION",
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
        internalModel: "gpt-3.5-turbo",
        unit: ModelUsageUnit.Tokens,
        promptId: prompt.id,
      },
    });

    const fetchedObservations = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      "/api/public/observations",
      undefined,
    );

    expect(fetchedObservations.status).toBe(200);

    expect(fetchedObservations.body.data.length).toBe(1);
    expect(fetchedObservations.body.data[0]?.traceId).toBe(traceId);
    expect(fetchedObservations.body.data[0]?.input).toEqual({ key: "input" });
    expect(fetchedObservations.body.data[0]?.output).toEqual({ key: "output" });
    expect(fetchedObservations.body.data[0]?.model).toEqual("gpt-3.5-turbo");
    expect(fetchedObservations.body.data[0]?.modelId).toEqual(model.id);
    expect(
      fetchedObservations.body.data[0]?.calculatedInputCost,
    ).toBeGreaterThan(0);
    expect(
      fetchedObservations.body.data[0]?.calculatedOutputCost,
    ).toBeGreaterThan(0);
    expect(
      fetchedObservations.body.data[0]?.calculatedTotalCost,
    ).toBeGreaterThan(0);
    expect(fetchedObservations.body.data[0]?.promptId).toBe(prompt.id);
    expect(fetchedObservations.body.data[0]?.promptName).toBe(prompt.name);
    expect(fetchedObservations.body.data[0]?.promptVersion).toBe(
      prompt.version,
    );
  });
  it("should fetch all observations, filtered by generations", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    await prisma.trace.create({
      data: {
        id: traceId,
        name: "trace-name",
        userId: "user-1",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    });

    await prisma.model.create({
      data: {
        id: "model-1",
        modelName: "gpt-3.5-turbo",
        inputPrice: "0.0000010",
        outputPrice: "0.0000020",
        totalPrice: "0.1",
        matchPattern: "(.*)(gpt-)(35|3.5)(-turbo)?(.*)",
        projectId: null,
        unit: ModelUsageUnit.Tokens,
      },
    });

    await prisma.observation.create({
      data: {
        id: uuidv4(),
        traceId: traceId,
        name: "generation-name",
        startTime: new Date("2021-01-01T00:00:00.000Z"),
        endTime: new Date("2021-01-01T00:00:00.000Z"),
        model: "gpt-3.5-turbo",
        internalModel: "gpt-3.5-turbo",
        modelParameters: { key: "value" },
        input: { key: "input" },
        output: { key: "output" },
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        version: "2.0.0",
        unit: ModelUsageUnit.Tokens,
        type: "GENERATION",
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
      },
    });

    await prisma.observation.create({
      data: {
        id: uuidv4(),
        traceId: traceId,
        name: "generation-name",
        startTime: new Date("2021-01-01T00:00:00.000Z"),
        endTime: new Date("2021-01-01T00:00:00.000Z"),
        modelParameters: { key: "value" },
        input: { key: "input" },
        output: { key: "output" },
        version: "2.0.0",
        type: "SPAN",
        project: {
          connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
        },
      },
    });

    const fetchedObservations = await makeZodVerifiedAPICall(
      GetObservationsV1Response,
      "GET",
      "/api/public/observations?type=GENERATION",
      undefined,
    );

    console.log(fetchedObservations.body);

    expect(fetchedObservations.status).toBe(200);

    expect(fetchedObservations.body.data.length).toBe(1);
    expect(fetchedObservations.body.data[0]?.traceId).toBe(traceId);
    expect(fetchedObservations.body.data[0]?.input).toEqual({ key: "input" });
    expect(fetchedObservations.body.data[0]?.output).toEqual({ key: "output" });
    expect(fetchedObservations.body.data[0]?.type).toEqual("GENERATION");
  });
});

it("GET /observations with timestamp filters and pagination", async () => {
  await prisma.trace.create({
    data: {
      id: "trace-id",
      name: "trace-name",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    },
  });
  await prisma.observation.createMany({
    data: [
      {
        id: "observation-2021-01-01",
        traceId: "trace-id",
        name: "generation-name",
        startTime: new Date("2021-01-01T00:00:00.000Z"),
        endTime: new Date("2021-01-01T00:00:00.000Z"),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        type: "GENERATION",
      },
      {
        id: "observation-2021-02-01",
        traceId: "trace-id",
        name: "generation-name",
        startTime: new Date("2021-02-01T00:00:00.000Z"),
        endTime: new Date("2021-02-01T00:00:00.000Z"),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        type: "SPAN",
      },
      {
        id: "observation-2021-03-01",
        traceId: "trace-id",
        name: "generation-name",
        startTime: new Date("2021-03-01T00:00:00.000Z"),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        type: "EVENT",
      },
      {
        id: "observation-2021-04-01",
        traceId: "trace-id",
        name: "generation-name",
        startTime: new Date("2021-04-01T00:00:00.000Z"),
        endTime: new Date("2021-04-01T00:00:00.000Z"),
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        type: "GENERATION",
      },
    ],
  });

  const fromTimestamp = "2021-02-01T00:00:00.000Z";
  const toTimestamp = "2021-04-01T00:00:00.000Z";

  // Test with both fromTimestamp and toTimestamp
  let fetchedObservations = await makeZodVerifiedAPICall(
    GetObservationsV1Response,
    "GET",
    `/api/public/observations?fromStartTime=${fromTimestamp}&toStartTime=${toTimestamp}`,
    undefined,
  );

  expect(fetchedObservations.body.data.length).toBe(2);
  expect(fetchedObservations.body.data[0]?.id).toBe("observation-2021-03-01");
  expect(fetchedObservations.body.data[1]?.id).toBe("observation-2021-02-01");
  expect(fetchedObservations.body.meta.totalItems).toBe(2);

  // Test with only fromTimestamp
  fetchedObservations = await makeZodVerifiedAPICall(
    GetObservationsV1Response,
    "GET",
    `/api/public/observations?fromStartTime=${fromTimestamp}`,
    undefined,
  );

  expect(fetchedObservations.body.data.length).toBe(3);
  expect(fetchedObservations.body.data[0]?.id).toBe("observation-2021-04-01");
  expect(fetchedObservations.body.data[1]?.id).toBe("observation-2021-03-01");
  expect(fetchedObservations.body.data[2]?.id).toBe("observation-2021-02-01");
  expect(fetchedObservations.body.meta.totalItems).toBe(3);

  // Test with only toTimestamp
  fetchedObservations = await makeZodVerifiedAPICall(
    GetObservationsV1Response,
    "GET",
    `/api/public/observations?toStartTime=${toTimestamp}`,
    undefined,
  );

  expect(fetchedObservations.body.data.length).toBe(3);
  expect(fetchedObservations.body.data[0]?.id).toBe("observation-2021-03-01");
  expect(fetchedObservations.body.data[1]?.id).toBe("observation-2021-02-01");
  expect(fetchedObservations.body.data[2]?.id).toBe("observation-2021-01-01");
  expect(fetchedObservations.body.meta.totalItems).toBe(3);

  // test pagination only
  fetchedObservations = await makeZodVerifiedAPICall(
    GetObservationsV1Response,
    "GET",
    `/api/public/observations?limit=1&page=2`,
    undefined,
  );

  expect(fetchedObservations.body.data.length).toBe(1);
  expect(fetchedObservations.body.data[0]?.id).toBe("observation-2021-03-01");
  expect(fetchedObservations.body.meta).toMatchObject({
    totalItems: 4,
    totalPages: 4,
    page: 2,
    limit: 1,
  });
});

it("Get a single EVENT from /observations/:id", async () => {
  const traceId = uuidv4();
  await prisma.trace.create({
    data: {
      id: traceId,
      name: "trace-name",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    },
  });

  // EVENT
  const eventId = uuidv4();
  await prisma.observation.create({
    data: {
      id: eventId,
      traceId: traceId,
      name: "generation-name",
      startTime: new Date("2021-01-01T00:00:00.000Z"),
      type: "EVENT",
      project: {
        connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
      },
    },
  });
  const getEventRes = await makeZodVerifiedAPICall(
    GetObservationV1Response,
    "GET",
    "/api/public/observations/" + eventId,
  );
  expect(getEventRes.body).toMatchObject({
    id: eventId,
    traceId: traceId,
    type: "EVENT",
  });
});
it("Get a single GENERATION from /observations/:id", async () => {
  const traceId = uuidv4();
  await prisma.trace.create({
    data: {
      id: traceId,
      name: "trace-name",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    },
  });

  const generationId = uuidv4();
  await prisma.observation.create({
    data: {
      id: generationId,
      traceId: traceId,
      name: "generation-name",
      startTime: new Date("2021-01-01T00:00:00.000Z"),
      endTime: new Date("2021-01-01T00:00:00.000Z"),
      model: "gpt-3.5-turbo",
      internalModel: "gpt-3.5-turbo",
      modelParameters: { key: "value" },
      input: { key: "input" },
      output: { key: "output" },
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      version: "2.0.0",
      unit: ModelUsageUnit.Tokens,
      type: "GENERATION",
      project: {
        connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
      },
    },
  });
  const getGenerationRes = await makeZodVerifiedAPICall(
    GetObservationV1Response,
    "GET",
    "/api/public/observations/" + generationId,
  );
  expect(getGenerationRes.body).toMatchObject({
    id: generationId,
    traceId: traceId,
    input: { key: "input" },
    output: { key: "output" },
    type: "GENERATION",
  });
});
it("Get a single SPAN from /observations/:id", async () => {
  const traceId = uuidv4();
  await prisma.trace.create({
    data: {
      id: traceId,
      name: "trace-name",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    },
  });

  const spanId = uuidv4();
  await prisma.observation.create({
    data: {
      id: spanId,
      traceId: traceId,
      name: "generation-name",
      startTime: new Date("2021-01-01T00:00:00.000Z"),
      endTime: new Date("2021-01-01T00:00:00.000Z"),
      modelParameters: { key: "value" },
      input: { key: "input" },
      output: { key: "output" },
      version: "2.0.0",
      type: "SPAN",
      project: {
        connect: { id: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a" },
      },
    },
  });
  const getSpanRes = await makeZodVerifiedAPICall(
    GetObservationV1Response,
    "GET",
    "/api/public/observations/" + spanId,
  );
  expect(getSpanRes.body).toMatchObject({
    id: spanId,
    traceId: traceId,
    input: { key: "input" },
    output: { key: "output" },
    type: "SPAN",
  });
});
