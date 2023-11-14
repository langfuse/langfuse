/** @jest-environment node */

import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@/src/server/db";
import { v4 } from "uuid";

describe("/api/public/ingestion API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());

  it("should create trace and generation", async () => {
    const traceId = v4();
    const generationId = v4();
    const spanId = v4();
    const scoreId = v4();

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
            id: generationId,
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
        {
          id: v4(),
          type: "observation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            type: "GENERATION",
            output: { key: "this is a great gpt output" },
            usage: { promptTokens: 400, completionTokens: 1000 },
          },
        },
        {
          id: v4(),
          type: "observation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: spanId,
            traceId: traceId,
            type: "SPAN",
            name: "span-name",
            startTime: "2021-01-01T00:00:00.000Z",
            endTime: "2021-01-01T00:00:00.000Z",
            input: { input: "value" },
            metadata: { meta: "value" },
            version: "2.0.0",
          },
        },
        {
          id: v4(),
          type: "score-create",
          timestamp: new Date().toISOString(),
          body: {
            id: scoreId,
            name: "score-name",
            value: 100.5,
            traceId: traceId,
          },
        },
      ],
    });

    expect(response.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.name).toBe("trace-name");
    expect(dbTrace[0]?.release).toBe("1.0.0");
    expect(dbTrace[0]?.externalId).toBeNull();
    expect(dbTrace[0]?.version).toBe("2.0.0");
    expect(dbTrace[0]?.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");

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
    expect(dbGeneration?.model).toBeNull();
    expect(dbGeneration?.modelParameters).toEqual({ key: "value" });
    expect(dbGeneration?.input).toEqual({ key: "value" });
    expect(dbGeneration?.metadata).toEqual({ key: "value" });
    expect(dbGeneration?.version).toBe("2.0.0");
    expect(dbGeneration?.promptTokens).toEqual(400);
    expect(dbGeneration?.completionTokens).toEqual(1000);
    expect(dbGeneration?.output).toEqual({
      key: "this is a great gpt output",
    });

    const dbSpan = await prisma.observation.findUnique({
      where: {
        id: spanId,
      },
    });

    expect(dbSpan?.id).toBe(spanId);
    expect(dbSpan?.name).toBe("span-name");
    expect(dbSpan?.startTime).toEqual(new Date("2021-01-01T00:00:00.000Z"));
    expect(dbSpan?.endTime).toEqual(new Date("2021-01-:00:00.000Z"));
    expect(dbSpan?.input).toEqual({ input: "value" });
    expect(dbSpan?.metadata).toEqual({ meta: "value" });
    expect(dbSpan?.version).toBe("2.0.0");

    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore?.id).toBe(scoreId);
    expect(dbScore?.traceId).toBe(traceId);
    expect(dbScore?.name).toBe("score-name");
    expect(dbScore?.value).toBe(100.5);
    expect(dbScore?.observationId).toBeNull();
  });

  it("should upsert threats", async () => {
    const traceId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
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
      ],
    });
    expect(responseOne.status).toBe(207);

    const responseTwo = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-2",
          },
        },
      ],
    });

    expect(responseTwo.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.name).toBe("trace-name");
    expect(dbTrace[0]?.userId).toBe("user-2");
    expect(dbTrace[0]?.release).toBe("1.0.0");
    expect(dbTrace[0]?.externalId).toBeNull();
    expect(dbTrace[0]?.version).toBe("2.0.0");
    expect(dbTrace[0]?.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
  });

  it("should fail for wrong event formats", async () => {
    const traceId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: "invalid-event",
        },
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
      ],
    });
    expect(responseOne.status).toBe(207);

    expect("errors" in responseOne.body).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(responseOne.body?.errors.length).toBe(1);
    expect("successes" in responseOne.body).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(responseOne.body?.successes.length).toBe(1);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toBe(1);
  });

  it("should update all token counts if update does not contain model name", async () => {
    const traceId = v4();
    const generationId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
          },
        },
        {
          id: v4(),
          type: "observation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            input: { key: "value" },
            model: "gpt-3.5",
          },
        },
        {
          id: v4(),
          type: "observation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            type: "GENERATION",
            output: { key: "this is a great gpt output" },
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toEqual(1);

    const observation = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(observation?.output).toEqual({
      key: "this is a great gpt output",
    });
    expect(observation?.input).toEqual({ key: "value" });
    expect(observation?.model).toEqual("gpt-3.5");
    expect(observation?.output).toEqual({ key: "this is a great gpt output" });
    expect(observation?.promptTokens).toEqual(5);
    expect(observation?.completionTokens).toEqual(11);
  });

  it("should update all token counts if update does not contain model name and events come in wrong order", async () => {
    const traceId = v4();
    const generationId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
          },
        },
        {
          id: v4(),
          type: "observation-update",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            type: "GENERATION",
            output: { key: "this is a great gpt output" },
          },
        },
        {
          id: v4(),
          type: "observation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            input: { key: "value" },
            model: "gpt-3.5",
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toEqual(1);

    const observation = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(observation?.output).toEqual({
      key: "this is a great gpt output",
    });
    expect(observation?.input).toEqual({ key: "value" });
    expect(observation?.model).toEqual("gpt-3.5");
    expect(observation?.output).toEqual({ key: "this is a great gpt output" });
    expect(observation?.promptTokens).toEqual(5);
    expect(observation?.completionTokens).toEqual(11);
  });

  it("null does not override set values", async () => {
    const traceId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
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
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
            userId: "user-1",
            metadata: { key: "value" },
            release: null,
            version: null,
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace.length).toEqual(1);
    expect(dbTrace[0]?.release).toBe("1.0.0");
    expect(dbTrace[0]?.version).toBe("2.0.0");
  });

  [
    {
      inputs: [{ a: "a" }, { b: "b" }],
      output: { a: "a", b: "b" },
    },
    {
      inputs: [[{ a: "a" }], [{ b: "b" }]],
      output: [{ a: "a", b: "b" }],
    },
    {
      inputs: [
        {
          a: {
            "1": 1,
          },
        },
        {
          b: "b",
          a: {
            "2": 2,
          },
        },
      ],
      output: { a: { "1": 1, "2": 2 }, b: "b" },
    },
    {
      inputs: [{ a: "a" }, undefined],
      output: { a: "a" },
    },
    {
      inputs: [undefined, { b: "b" }],
      output: { b: "b" },
    },
  ].forEach(({ inputs, output }) => {
    it(`merges metadata ${JSON.stringify(inputs)}, ${JSON.stringify(
      output,
    )}`, async () => {
      const traceId = v4();
      const generationId = v4();

      const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
        batch: [
          {
            id: v4(),
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: {
              id: traceId,
              name: "trace-name",
              userId: "user-1",
              metadata: inputs[0],
            },
          },
          {
            id: v4(),
            type: "trace-create",
            timestamp: new Date().toISOString(),
            body: {
              id: traceId,
              name: "trace-name",
              metadata: inputs[1],
            },
          },
          {
            id: v4(),
            type: "observation-create",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              traceId: traceId,
              type: "GENERATION",
              name: "generation-name",
              metadata: inputs[0],
            },
          },
          {
            id: v4(),
            type: "observation-update",
            timestamp: new Date().toISOString(),
            body: {
              id: generationId,
              traceId: traceId,
              type: "GENERATION",
              metadata: inputs[1],
            },
          },
        ],
      });
      expect(responseOne.status).toBe(207);

      const dbTrace = await prisma.trace.findMany({
        where: {
          name: "trace-name",
        },
      });

      expect(dbTrace.length).toEqual(1);
      expect(dbTrace[0]?.metadata).toEqual(output);

      const dbGeneration = await prisma.observation.findMany({
        where: {
          name: "generation-name",
        },
      });

      expect(dbGeneration.length).toEqual(1);
      expect(dbGeneration[0]?.metadata).toEqual(output);
    });
  });

  it("additional fields do not fail the API to support users sending traceidtype Langfuse", async () => {
    const traceId = v4();
    const generationId = v4();

    const responseOne = await makeAPICall("POST", "/api/public/ingestion", {
      batch: [
        {
          id: v4(),
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traceId,
            name: "trace-name",
          },
        },
        {
          id: v4(),
          type: "observation-create",
          timestamp: new Date().toISOString(),
          body: {
            id: generationId,
            traceId: traceId,
            type: "GENERATION",
            name: "generation-name",
            traceIdType: "LANGFUSE",
          },
        },
      ],
    });
    expect(responseOne.status).toBe(207);

    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toEqual(1);

    const dbGeneration = await prisma.observation.findUnique({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration).toBeTruthy();
  });
});
