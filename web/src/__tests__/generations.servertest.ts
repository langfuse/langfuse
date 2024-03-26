/** @jest-environment node */

import { v4 as uuidv4 } from "uuid";

import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { ModelUsageUnit } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";

describe("/api/public/generations API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());

  [
    {
      usage: {
        input: 100,
        output: 200,
        total: 100,
        unit: ModelUsageUnit.Characters,
      },
      expectedUnit: ModelUsageUnit.Characters,
      expectedPromptTokens: 100,
      expectedCompletionTokens: 200,
      expectedTotalTokens: 100,
    },
    {
      usage: {
        total: 100,
        unit: ModelUsageUnit.Characters,
      },
      expectedUnit: ModelUsageUnit.Characters,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 100,
    },
    {
      usage: {
        total: 100,
      },
      expectedUnit: null,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 100,
    },
    {
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 100,
      },
      expectedPromptTokens: 100,
      expectedCompletionTokens: 200,
      expectedTotalTokens: 100,
      expectedUnit: ModelUsageUnit.Tokens,
    },
    {
      usage: {
        totalTokens: 100,
      },
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 100,
      expectedUnit: ModelUsageUnit.Tokens,
    },
    {
      usage: undefined,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 0,
      expectedUnit: null,
    },
    {
      usage: null,
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 0,
      expectedUnit: null,
    },
    {
      usage: {},
      expectedPromptTokens: 0,
      expectedCompletionTokens: 0,
      expectedTotalTokens: 0,
      expectedUnit: null,
    },
  ].forEach((testConfig) => {
    it(`should create generation after trace 1 ${JSON.stringify(
      testConfig,
    )}`, async () => {
      await pruneDatabase();

      const traceId = uuidv4();

      await makeAPICall("POST", "/api/public/traces", {
        id: traceId,
        name: "trace-name",
        userId: "user-1",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      });

      const dbTrace = await prisma.trace.findMany({
        where: {
          id: traceId,
        },
      });

      expect(dbTrace.length).toBeGreaterThan(0);
      expect(dbTrace[0]?.id).toBe(traceId);

      const generationId = uuidv4();
      const createGeneration = await makeAPICall(
        "POST",
        "/api/public/generations",
        {
          id: generationId,
          traceId: traceId,
          name: "generation-name",
          startTime: "2021-01-01T00:00:00.000Z",
          endTime: "2021-01-01T00:00:00.000Z",
          model: "model-name",
          modelParameters: { key: "value" },
          prompt: { key: "value" },
          metadata: { key: "value" },
          version: "2.0.0",
          usage: testConfig.usage,
        },
      );

      expect(createGeneration.status).toBe(200);
      const dbGeneration = await prisma.observation.findUnique({
        where: {
          id: generationId,
        },
      });

      expect(dbGeneration?.id).toBe(generationId);
      expect(dbGeneration?.traceId).toBe(traceId);
      expect(dbGeneration?.name).toBe("generation-name");
      expect(dbGeneration?.startTime).toEqual(
        new Date("2021-01-01T00:00:00.000Z"),
      );
      expect(dbGeneration?.endTime).toEqual(
        new Date("2021-01-01T00:00:00.000Z"),
      );
      expect(dbGeneration?.model).toBe("model-name");
      expect(dbGeneration?.modelParameters).toEqual({ key: "value" });
      expect(dbGeneration?.input).toEqual({ key: "value" });
      expect(dbGeneration?.metadata).toEqual({ key: "value" });
      expect(dbGeneration?.version).toBe("2.0.0");
      expect(dbGeneration?.unit).toBe(testConfig.expectedUnit);
      expect(dbGeneration?.promptTokens).toBe(testConfig.expectedPromptTokens);
      expect(dbGeneration?.completionTokens).toBe(
        testConfig.expectedCompletionTokens,
      );
      expect(dbGeneration?.totalTokens).toBe(testConfig.expectedTotalTokens);
    });
  });

  it("should create generation before trace", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    const generationId = uuidv4();
    const createGeneration = await makeAPICall(
      "POST",
      "/api/public/generations",
      {
        id: generationId,
        traceId: traceId,
        name: "generation-name",
        startTime: "2021-01-01T00:00:00.000Z",
        endTime: "2021-01-01T00:00:00.000Z",
        model: "model-name",
        modelParameters: { key: "value" },
        prompt: { key: "value" },
        metadata: { key: "value" },
        version: "2.0.0",
      },
    );

    expect(createGeneration.status).toBe(200);
    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration?.id).toBe(generationId);
    expect(dbGeneration?.traceId).toBe(traceId);
    expect(dbGeneration?.name).toBe("generation-name");
    expect(dbGeneration?.startTime).toEqual(
      new Date("2021-01-01T00:00:00.000Z"),
    );
    expect(dbGeneration?.endTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbGeneration?.model).toBe("model-name");
    expect(dbGeneration?.modelParameters).toEqual({ key: "value" });
    expect(dbGeneration?.input).toEqual({ key: "value" });
    expect(dbGeneration?.metadata).toEqual({ key: "value" });
    expect(dbGeneration?.version).toBe("2.0.0");

    await makeAPICall("POST", "/api/public/traces", {
      id: traceId,
      name: "trace-name",
      userId: "user-1",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);
  });

  it("should create generation after trace ignoring externalId", async () => {
    const traceId = uuidv4();

    const response = await makeAPICall("POST", "/api/public/traces", {
      externalId: traceId,
      name: "trace-name",
      userId: "user-1",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    expect(response.status).toBe(200);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.externalId).toBeNull();
    expect(dbTrace[0]?.id).not.toBe(traceId);

    const generationId = uuidv4();
    const createGeneration = await makeAPICall(
      "POST",
      "/api/public/generations",
      {
        id: generationId,
        traceIdType: "EXTERNAL",
        traceId: traceId,
        name: "generation-name",
        startTime: "2021-01-01T00:00:00.000Z",
        endTime: "2021-01-01T00:00:00.000Z",
        model: "model-name",
        modelParameters: { key: "value" },
        prompt: { key: "value" },
        metadata: { key: "value" },
        version: "2.0.0",
      },
    );

    expect(createGeneration.status).toBe(200);
    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration?.id).toBe(generationId);
    expect(dbGeneration?.traceId).toBe(traceId);
    expect(dbGeneration?.name).toBe("generation-name");
    expect(dbGeneration?.startTime).toEqual(
      new Date("2021-01-01T00:00:00.000Z"),
    );
    expect(dbGeneration?.endTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbGeneration?.model).toBe("model-name");
    expect(dbGeneration?.modelParameters).toEqual({ key: "value" });
    expect(dbGeneration?.input).toEqual({ key: "value" });
    expect(dbGeneration?.metadata).toEqual({ key: "value" });
    expect(dbGeneration?.version).toBe("2.0.0");
  });

  it("should create trace when creating generation without existing trace", async () => {
    const generationName = uuidv4();

    const generationId = uuidv4();
    const createGeneration = await makeAPICall(
      "POST",
      "/api/public/generations",
      {
        id: generationId,
        name: generationName,
        startTime: "2021-01-01T00:00:00.000Z",
        endTime: "2021-01-01T00:00:00.000Z",
        model: "model-name",
        modelParameters: { key: "value" },
        prompt: { key: "value" },
        metadata: { key: "value" },
        version: "2.0.0",
      },
    );

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: generationName,
      },
    });

    expect(dbTrace.length).toBe(1);
    expect(dbTrace[0]?.name).toBe(generationName);

    expect(createGeneration.status).toBe(200);
    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration?.id).toBe(generationId);
    expect(dbGeneration?.traceId).toBe(dbTrace[0]?.id);
    expect(dbGeneration?.name).toBe(generationName);
    expect(dbGeneration?.startTime).toEqual(
      new Date("2021-01-01T00:00:00.000Z"),
    );
    expect(dbGeneration?.endTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbGeneration?.model).toBe("model-name");
    expect(dbGeneration?.modelParameters).toEqual({ key: "value" });
    expect(dbGeneration?.input).toEqual({ key: "value" });
    expect(dbGeneration?.metadata).toEqual({ key: "value" });
    expect(dbGeneration?.version).toBe("2.0.0");
  });

  it("should create nested generations", async () => {
    const generationName = uuidv4();

    const generationId = uuidv4();
    const createGeneration = await makeAPICall(
      "POST",
      "/api/public/generations",
      {
        id: generationId,
        name: generationName,
        startTime: "2021-01-01T00:00:00.000Z",
        endTime: "2021-01-01T00:00:00.000Z",
        model: "model-name",
        modelParameters: { key: "value" },
        prompt: { key: "value" },
        metadata: { key: "value" },
        version: "2.0.0",
      },
    );

    expect(createGeneration.status).toBe(200);
    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration?.id).toBe(generationId);

    const generationId2 = uuidv4();
    const generationName2 = uuidv4();

    const createGeneration2 = await makeAPICall(
      "POST",
      "/api/public/generations",
      {
        id: generationId2,
        name: generationName2,
        startTime: "2021-01-01T00:00:00.000Z",
        endTime: "2021-01-01T00:00:00.000Z",
        model: "model-name",
        modelParameters: { key: "value" },
        prompt: { key: "value" },
        metadata: { key: "value" },
        version: "2.0.0",
        parentObservationId: generationId,
      },
    );
    expect(createGeneration2.status).toBe(200);

    const dbGeneration2 = await prisma.observation.findUnique({
      where: {
        id: generationId2,
      },
    });

    expect(dbGeneration2?.id).toBe(generationId2);
    expect(dbGeneration2?.parentObservationId).toBe(generationId);
  });

  it("should not create trace when creating generation without existing trace with externalId", async () => {
    const generationName = uuidv4();

    const generationId = uuidv4();
    const externalTraceId = uuidv4();
    const createGeneration = await makeAPICall(
      "POST",
      "/api/public/generations",
      {
        id: generationId,
        traceIdType: "EXTERNAL",
        traceId: externalTraceId,
        name: generationName,
        startTime: "2021-01-01T00:00:00.000Z",
        endTime: "2021-01-01T00:00:00.000Z",
        model: "model-name",
        modelParameters: { key: "value" },
        prompt: { key: "value" },
        metadata: { key: "value" },
        version: "2.0.0",
      },
    );

    expect(createGeneration.status).toBe(200);

    const dbGeneration = await prisma.observation.findFirstOrThrow({
      where: {
        name: generationName,
      },
    });
    expect(dbGeneration.id).toBe(generationId);
    expect(dbGeneration.traceId).toBe(externalTraceId);

    const dbTraces = await prisma.trace.findMany();
    expect(dbTraces.length).toBe(0);
  });

  it("should create trace when creating generation without existing trace without traceId", async () => {
    const generationName = uuidv4();

    const generationId = uuidv4();
    const createGeneration = await makeAPICall(
      "POST",
      "/api/public/generations",
      {
        id: generationId,
        name: generationName,
        startTime: "2021-01-01T00:00:00.000Z",
        endTime: "2021-01-01T00:00:00.000Z",
        model: "model-name",
        modelParameters: { key: "value" },
        prompt: { key: "value" },
        metadata: { key: "value" },
        version: "2.0.0",
      },
    );

    const dbGeneration = await prisma.observation.findFirstOrThrow({
      where: {
        name: generationName,
      },
    });

    const dbTrace = await prisma.trace.findMany({
      where: {
        id: dbGeneration.traceId!,
      },
    });

    expect(dbTrace.length).toBe(1);
    expect(dbTrace[0]?.name).toBe(generationName);

    expect(createGeneration.status).toBe(200);

    expect(dbGeneration.id).toBe(generationId);
    expect(dbGeneration.traceId).toBe(dbTrace[0]?.id);
    expect(dbGeneration.name).toBe(generationName);
    expect(dbGeneration.startTime).toEqual(
      new Date("2021-01-01T00:00:00.000Z"),
    );
    expect(dbGeneration.endTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbGeneration.model).toBe("model-name");
    expect(dbGeneration.modelParameters).toEqual({ key: "value" });
    expect(dbGeneration.input).toEqual({ key: "value" });
    expect(dbGeneration.metadata).toEqual({ key: "value" });
    expect(dbGeneration.version).toBe("2.0.0");
  });

  it("should update generation", async () => {
    const generationName = uuidv4();

    const generationId = uuidv4();
    const createGeneration = await makeAPICall(
      "POST",
      "/api/public/generations",
      {
        id: generationId,
        name: generationName,
        startTime: "2021-01-01T00:00:00.000Z",
        endTime: "2021-01-01T00:00:00.000Z",
        model: "model-name",
        modelParameters: { key: "value" },
        prompt: { key: "value" },
        metadata: { key: "value" },
        version: "2.0.0",
      },
    );

    expect(createGeneration.status).toBe(200);

    const updateGeneration = await makeAPICall(
      "PATCH",
      "/api/public/generations",
      {
        generationId: generationId,
        completion: "this is a great gpt response",
      },
    );
    expect(updateGeneration.status).toBe(200);

    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration?.id).toBe(generationId);
    expect(dbGeneration?.name).toBe(generationName);
    expect(dbGeneration?.startTime).toEqual(
      new Date("2021-01-01T00:00:00.000Z"),
    );
    expect(dbGeneration?.endTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbGeneration?.model).toBe("model-name");
    expect(dbGeneration?.modelParameters).toEqual({ key: "value" });
    expect(dbGeneration?.input).toEqual({ key: "value" });
    expect(dbGeneration?.output).toEqual("this is a great gpt response");
    expect(dbGeneration?.metadata).toEqual({ key: "value" });
    expect(dbGeneration?.version).toBe("2.0.0");
  });

  it("should accept objects as i/o", async () => {
    const generationName = uuidv4();

    const generationId = uuidv4();
    const createGeneration = await makeAPICall(
      "POST",
      "/api/public/generations",
      {
        id: generationId,
        name: generationName,
        prompt: { key: "value" },
        completion: [
          {
            foo: "bar",
          },
        ],
        metadata: [
          {
            tags: ["example tag", "second tag"],
          },
        ],
      },
    );

    expect(createGeneration.status).toBe(200);

    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration?.id).toBe(generationId);
    expect(dbGeneration?.name).toBe(generationName);
    expect(dbGeneration?.input).toEqual({ key: "value" });
    expect(dbGeneration?.output).toEqual([
      {
        foo: "bar",
      },
    ]);
    expect(dbGeneration?.metadata).toEqual([
      {
        tags: ["example tag", "second tag"],
      },
    ]);
  });

  it("should not succeed update if generation does not exist", async () => {
    const generationId = uuidv4();

    const updateGeneration = await makeAPICall(
      "PATCH",
      "/api/public/generations",
      {
        generationId: generationId,
        completion: "this is a great gpt response",
      },
    );
    expect(updateGeneration.status).toBe(404);

    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration).toBeNull();
  });
});
