/** @jest-environment node */

import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@/src/server/db";
import { v4 } from "uuid";

describe("/api/public/ingestion API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());
  // afterEach(async () => await pruneDatabase());

  it("should create trace and generation", async () => {
    const traceId = v4();
    const generationId = v4();
    const spanId = v4();
    const scoreId = v4();

    const request = await makeAPICall("POST", "/api/public/ingestion", [
      {
        id: v4(),
        type: "trace:create",
        body: {
          id: traceId,
          name: "trace-name",
          userId: "user-1",
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
          metadata: { key: "value" },
          release: "1.0.0",
          version: "2.0.0",
        },
      },
      {
        id: v4(),
        type: "generation:create",
        body: {
          id: generationId,
          traceId: traceId,
          name: "generation-name",
          startTime: "2021-01-01T00:00:00.000Z",
          endTime: "2021-01-01T00:00:00.000Z",
          model: "gpt-3.5",
          modelParameters: { key: "value" },
          prompt: { key: "value" },
          metadata: { key: "value" },
          version: "2.0.0",
        },
      },
      {
        id: v4(),
        type: "generation:patch",
        body: {
          generationId: generationId,
          completion: { key: "this is a great gpt output" },
        },
      },
      {
        id: v4(),
        type: "span:create",
        body: {
          id: spanId,
          traceId: traceId,
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
        type: "score:create",
        body: {
          id: scoreId,
          name: "score-name",
          value: 100.5,
          traceId: traceId,
        },
      },
    ]);

    expect(request.status).toBe(201);

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
    expect(dbGeneration?.model).toBe("gpt-3.5");
    expect(dbGeneration?.modelParameters).toEqual({ key: "value" });
    expect(dbGeneration?.input).toEqual({ key: "value" });
    expect(dbGeneration?.metadata).toEqual({ key: "value" });
    expect(dbGeneration?.version).toBe("2.0.0");
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
});
