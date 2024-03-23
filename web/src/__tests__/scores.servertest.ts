/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";

describe("/api/public/scores API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should create score for a trace", async () => {
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

    const scoreId = uuidv4();
    const createScore = await makeAPICall("POST", "/api/public/scores", {
      id: scoreId,
      name: "score-name",
      value: 100.5,
      traceId: traceId,
      comment: "comment",
    });

    expect(createScore.status).toBe(200);
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
    expect(dbScore?.comment).toBe("comment");
    expect(dbScore?.source).toBe("API");
  });

  it("should create score for a trace with int", async () => {
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

    const scoreId = uuidv4();
    const createScore = await makeAPICall("POST", "/api/public/scores", {
      id: scoreId,
      name: "score-name",
      value: 100,
      traceId: traceId,
    });

    expect(createScore.status).toBe(200);
    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore?.id).toBe(scoreId);
    expect(dbScore?.traceId).toBe(traceId);
    expect(dbScore?.name).toBe("score-name");
    expect(dbScore?.value).toBe(100);
    expect(dbScore?.observationId).toBeNull();
  });

  it("should create score for a generation", async () => {
    await pruneDatabase();

    const generationId = uuidv4();

    await makeAPICall("POST", "/api/public/generations", {
      id: generationId,
      name: "generation-name",
      startTime: "2021-01-01T00:00:00.000Z",
      endTime: "2021-01-01T00:00:00.000Z",
      model: "model-name",
      modelParameters: { key: "value" },
      prompt: { key: "value" },
      metadata: { key: "value" },
      version: "2.0.0",
    });

    const dbGeneration = await prisma.observation.findMany({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration.length).toBeGreaterThan(0);
    expect(dbGeneration[0]?.id).toBe(generationId);

    const scoreId = uuidv4();
    const createScore = await makeAPICall("POST", "/api/public/scores", {
      id: scoreId,
      name: "score-name",
      value: 100,
      traceId: dbGeneration[0]!.traceId!,
      observationId: dbGeneration[0]!.id,
    });

    expect(createScore.status).toBe(200);
    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore?.id).toBe(scoreId);
    expect(dbScore?.traceId).toBe(dbGeneration[0]!.traceId);
    expect(dbScore?.observationId).toBe(dbGeneration[0]!.id);
    expect(dbScore?.name).toBe("score-name");
    expect(dbScore?.value).toBe(100);
  });

  it("should upsert a score", async () => {
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
    await makeAPICall("POST", "/api/public/generations", {
      id: generationId,
      name: "generation-name",
      traceId,
      startTime: "2021-01-01T00:00:00.000Z",
      endTime: "2021-01-01T00:00:00.000Z",
      model: "model-name",
      modelParameters: { key: "value" },
      prompt: { key: "value" },
      metadata: { key: "value" },
      version: "2.0.0",
    });

    const dbGeneration = await prisma.observation.findMany({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration.length).toBeGreaterThan(0);
    expect(dbGeneration[0]?.id).toBe(generationId);

    const scoreId = uuidv4();
    const createScore = await makeAPICall("POST", "/api/public/scores", {
      id: scoreId,
      name: "score-name",
      value: 100,
      traceId: traceId,
      comment: "comment",
    });
    expect(createScore.status).toBe(200);

    const upsertScore = await makeAPICall("POST", "/api/public/scores", {
      id: scoreId,
      traceId: traceId,
      name: "score-name-updated",
      value: 200,
      comment: "comment-updated",
      observationId: dbGeneration[0]!.id,
    });
    expect(upsertScore.status).toBe(200);

    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore?.id).toBe(scoreId);
    expect(dbScore?.traceId).toBe(traceId);
    expect(dbScore?.name).toBe("score-name-updated");
    expect(dbScore?.value).toBe(200);
    expect(dbScore?.comment).toBe("comment-updated");
    expect(dbScore?.observationId).toBe(dbGeneration[0]!.id);
  });

  it("should delete a score", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    await makeAPICall("POST", "/api/public/traces", {
      id: traceId,
    });

    const scoreId = uuidv4();
    const createScore = await makeAPICall("POST", "/api/public/scores", {
      id: scoreId,
      name: "score-name",
      value: 100.5,
      traceId: traceId,
      comment: "comment",
    });

    expect(createScore.status).toBe(200);
    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });
    expect(dbScore?.id).toBe(scoreId);

    const deleteScore = await makeAPICall(
      "DELETE",
      `/api/public/scores/${scoreId}`,
    );
    expect(deleteScore.status).toBe(200);
    const deletedScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });
    expect(deletedScore).toBeNull();
  });

  it("should GET a score", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    await makeAPICall("POST", "/api/public/traces", {
      id: traceId,
    });
    const generationId = uuidv4();
    await makeAPICall("POST", "/api/public/generations", {
      id: generationId,
    });

    const scoreId = uuidv4();
    await makeAPICall("POST", "/api/public/scores", {
      id: scoreId,
      observationId: generationId,
      name: "score-name",
      value: 100.5,
      traceId: traceId,
      comment: "comment",
    });

    const getScore = await makeAPICall<{
      id: string;
      name: string;
      value: number;
      comment: string;
      traceId: string;
      observationId: string;
      source: string;
    }>("GET", `/api/public/scores/${scoreId}`);

    expect(getScore.status).toBe(200);
    expect(getScore.body).toMatchObject({
      id: scoreId,
      name: "score-name",
      value: 100.5,
      comment: "comment",
      source: "API",
      traceId,
      observationId: generationId,
    });
  });
});
