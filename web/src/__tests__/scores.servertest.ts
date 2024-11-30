/** @jest-environment node */

import { prisma } from "@langfuse/shared/src/db";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";
import { DeleteScoreResponse, GetScoreResponse } from "@langfuse/shared";
import { PostTracesV1Response } from "@/src/features/public-api/types/traces";

const traceId = "de98afa2-89dc-47e9-9924-33f1490fdaf4";

describe("/api/public/scores API Endpoint", () => {
  let should_prune_db = true;
  beforeEach(async () => {
    if (should_prune_db) await pruneDatabase();

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        id: traceId,
        name: "trace-name",
        userId: "user-1",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
    );
  }, 10000);
  afterEach(async () => {
    if (should_prune_db) await pruneDatabase();
  });

  it("should create score for a trace", async () => {
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
    const fetchedScore = await makeZodVerifiedAPICall(
      GetScoreResponse,
      "GET",
      `/api/public/scores/${scoreId}`,
    );

    expect(fetchedScore.body?.id).toBe(scoreId);
    expect(fetchedScore.body?.traceId).toBe(traceId);
    expect(fetchedScore.body?.name).toBe("score-name");
    expect(fetchedScore.body?.value).toBe(100.5);
    expect(fetchedScore.body?.observationId).toBeNull();
    expect(fetchedScore.body?.comment).toBe("comment");
    expect(fetchedScore.body?.source).toBe("API");
    expect(fetchedScore.body?.projectId).toBe(
      "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    );
  });

  it("should create score for a trace with int", async () => {
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
    const fetchedScore = await makeZodVerifiedAPICall(
      GetScoreResponse,
      "GET",
      `/api/public/scores/${scoreId}`,
    );

    expect(fetchedScore.body?.id).toBe(scoreId);
    expect(fetchedScore.body?.traceId).toBe(traceId);
    expect(fetchedScore.body?.name).toBe("score-name");
    expect(fetchedScore.body?.value).toBe(100);
    expect(fetchedScore.body?.observationId).toBeNull();
  });

  it("should create score for a generation", async () => {
    await pruneDatabase();

    const generationId = uuidv4();

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/generations",
      {
        id: generationId,
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

    const dbGeneration = await prisma.observation.findMany({
      where: {
        id: generationId,
      },
    });

    expect(dbGeneration.length).toBeGreaterThan(0);
    expect(dbGeneration[0]?.id).toBe(generationId);

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "score-name",
      value: 100,
      traceId: dbGeneration[0]!.traceId!,
      observationId: dbGeneration[0]!.id,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(200);
    const fetchedScore = await makeZodVerifiedAPICall(
      GetScoreResponse,
      "GET",
      `/api/public/scores/${scoreId}`,
    );

    expect(fetchedScore.body).toMatchObject(scoreData);
  });

  it("should create numeric score if value is integer and no data type is passed", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: 1,
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(200);
    const fetchedScore = await makeZodVerifiedAPICall(
      GetScoreResponse,
      "GET",
      `/api/public/scores/${scoreId}`,
    );

    expect(fetchedScore.body).toMatchObject({
      ...scoreData,
      dataType: "NUMERIC",
    });
  });

  it("should create categorical score if value is string and no data type is passed", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: "Good",
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(200);
    const fetchedScore = await makeZodVerifiedAPICall(
      GetScoreResponse,
      "GET",
      `/api/public/scores/${scoreId}`,
    );

    expect(fetchedScore.body).toMatchObject({
      ...scoreData,
      value: null,
      stringValue: "Good",
      dataType: "CATEGORICAL",
    });
  });

  it("should create boolean score if boolean data type is passed", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "score-name",
      value: 1,
      dataType: "BOOLEAN",
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(200);

    const fetchedScore = await makeZodVerifiedAPICall(
      GetScoreResponse,
      "GET",
      `/api/public/scores/${scoreId}`,
    );

    expect(fetchedScore.body).toMatchObject({
      ...scoreData,
      stringValue: "True",
    });
  });

  it("should infer boolean data type from boolean score config", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: "BOOLEAN",
    });

    const dbScoreConfig = await prisma.scoreConfig.findMany({
      where: {
        name: "accuracy",
      },
    });

    expect(dbScoreConfig.length).toBeGreaterThan(0);
    expect(dbScoreConfig[0]?.name).toBe("accuracy");

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: 1,
      configId: dbScoreConfig[0].id,
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(200);
    const fetchedScore = await makeZodVerifiedAPICall(
      GetScoreResponse,
      "GET",
      `/api/public/scores/${scoreId}`,
    );

    expect(fetchedScore.body).toMatchObject({
      ...scoreData,
      stringValue: "True",
      dataType: "BOOLEAN",
    });
  });

  it("should NOT create categorical score if numeric data type is passed", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: 1,
      dataType: "CATEGORICAL",
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(400);
    expect(createScore.body).toMatchObject({
      message: "Invalid request data",
      error: [
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received number",
          path: ["value"],
          received: "number",
        },
      ],
    });
  });

  it("should NOT create numeric score if categorical data type is passed incl numeric config", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: "NUMERIC",
    });

    const dbScoreConfig = await prisma.scoreConfig.findMany({
      where: {
        name: "accuracy",
      },
    });

    expect(dbScoreConfig.length).toBeGreaterThan(0);
    expect(dbScoreConfig[0]?.name).toBe("accuracy");

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: "Good",
      configId: dbScoreConfig[0].id,
      dataType: "CATEGORICAL",
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(400);
    expect(createScore.body).toMatchObject({
      message:
        "Data type mismatch based on config: expected NUMERIC, got CATEGORICAL",
    });
  });

  it("should NOT create numeric score if config and passed data type mismatch", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: "CATEGORICAL",
      categories: [
        { label: "One", value: 1 },
        { label: "Zero", value: 0 },
      ],
    });

    const dbScoreConfig = await prisma.scoreConfig.findMany({
      where: {
        name: "accuracy",
      },
    });

    expect(dbScoreConfig.length).toBeGreaterThan(0);
    expect(dbScoreConfig[0]?.name).toBe("accuracy");

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: 1,
      configId: dbScoreConfig[0].id,
      dataType: "NUMERIC",
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(400);
    expect(createScore.body).toMatchObject({
      message:
        "Data type mismatch based on config: expected CATEGORICAL, got NUMERIC",
    });
  });

  it("should NOT create boolean score if string value is passed", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: "BOOLEAN",
    });

    const dbScoreConfig = await prisma.scoreConfig.findMany({
      where: {
        name: "accuracy",
      },
    });

    expect(dbScoreConfig.length).toBeGreaterThan(0);
    expect(dbScoreConfig[0]?.name).toBe("accuracy");

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: "True",
      configId: dbScoreConfig[0].id,
      dataType: "BOOLEAN",
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(400);
    expect(createScore.body).toMatchObject({
      message: "Invalid request data",
      error: [
        {
          code: "invalid_type",
          expected: "number",
          message: "Expected number, received string",
          path: ["value"],
          received: "string",
        },
      ],
    });
  });

  it("should NOT create boolean score with value other than 1 | 0", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: "BOOLEAN",
    });

    const dbScoreConfig = await prisma.scoreConfig.findMany({
      where: {
        name: "accuracy",
      },
    });

    expect(dbScoreConfig.length).toBeGreaterThan(0);
    expect(dbScoreConfig[0]?.name).toBe("accuracy");

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: 0.5,
      configId: dbScoreConfig[0].id,
      dataType: "BOOLEAN",
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(400);
    expect(createScore.body).toMatchObject({
      message: "Invalid request data",
      error: [
        {
          code: "custom",
          message:
            "Value must be a number equal to either 0 or 1 for data type BOOLEAN",
          path: ["value"],
        },
      ],
    });
  });

  it("should NOT create categorical score with value not defined in config.categories", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: "CATEGORICAL",
      categories: [
        { label: "One", value: 1 },
        { label: "Zero", value: 0 },
      ],
    });

    const dbScoreConfig = await prisma.scoreConfig.findMany({
      where: {
        name: "accuracy",
      },
    });

    expect(dbScoreConfig.length).toBeGreaterThan(0);
    expect(dbScoreConfig[0]?.name).toBe("accuracy");

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: 1,
      configId: dbScoreConfig[0].id,
      dataType: "CATEGORICAL",
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(400);
    expect(createScore.body).toMatchObject({
      message: "Invalid request data",
      error: [
        {
          code: "invalid_type",
          expected: "string",
          message: "Expected string, received number",
          path: ["value"],
          received: "number",
        },
      ],
    });
  });

  it("should NOT create numeric score outside of defined range", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: "NUMERIC",
      maxValue: 0,
    });

    const dbScoreConfig = await prisma.scoreConfig.findMany({
      where: {
        name: "accuracy",
      },
    });

    expect(dbScoreConfig.length).toBeGreaterThan(0);
    expect(dbScoreConfig[0]?.name).toBe("accuracy");

    const scoreId = uuidv4();
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: 0.5,
      configId: dbScoreConfig[0].id,
      dataType: "NUMERIC",
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(400);
    expect(createScore.body).toMatchObject({
      message:
        "Ingested score body not valid against provided config:  - Value exceeds maximum value of 0 defined in config",
    });
  });

  it("should upsert a score", async () => {
    const dbTrace = await prisma.trace.findMany({
      where: {
        id: traceId,
      },
    });

    expect(dbTrace.length).toBeGreaterThan(0);
    expect(dbTrace[0]?.id).toBe(traceId);

    const generationId = uuidv4();
    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/generations",
      {
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
      },
    );

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

    const fetchedScore = await makeZodVerifiedAPICall(
      GetScoreResponse,
      "GET",
      `/api/public/scores/${scoreId}`,
    );

    expect(fetchedScore.body?.id).toBe(scoreId);
    expect(fetchedScore.body?.traceId).toBe(traceId);
    expect(fetchedScore.body?.name).toBe("score-name-updated");
    expect(fetchedScore.body?.value).toBe(200);
    expect(fetchedScore.body?.comment).toBe("comment-updated");
    expect(fetchedScore.body?.observationId).toBe(dbGeneration[0]!.id);
  });

  it("should delete a score", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        id: traceId,
      },
    );

    const scoreId = uuidv4();
    const createScore = await makeAPICall("POST", "/api/public/scores", {
      id: scoreId,
      name: "score-name",
      value: 100.5,
      traceId: traceId,
      comment: "comment",
    });

    expect(createScore.status).toBe(200);
    const fetchedScore = await makeZodVerifiedAPICall(
      GetScoreResponse,
      "GET",
      `/api/public/scores/${scoreId}`,
    );
    expect(fetchedScore.body.id).toBe(scoreId);

    const deleteScore = await makeZodVerifiedAPICall(
      DeleteScoreResponse,
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
});
