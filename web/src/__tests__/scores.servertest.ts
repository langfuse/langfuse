/** @jest-environment node */

import { ScoreDataType, prisma } from "@langfuse/shared/src/db";
import { makeAPICall, pruneDatabase } from "@/src/__tests__/test-utils";
import { v4 as uuidv4 } from "uuid";

describe("/api/public/scores API Endpoint", () => {
  let should_prune_db = true;
  beforeEach(async () => {
    if (should_prune_db) await pruneDatabase();
  });
  afterEach(async () => {
    if (should_prune_db) await pruneDatabase();
  });

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
    expect(dbScore?.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
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
    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore).toMatchObject(scoreData);
  });

  it("should create numeric score if value is integer and no data type is passed", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    await makeAPICall("POST", "/api/public/traces", {
      id: traceId,
      name: "trace-name",
      userId: "user-1",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: {
        key: "value",
      },
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
    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore).toMatchObject({
      ...scoreData,
      dataType: ScoreDataType.NUMERIC,
    });
  });

  it("should create categorical score if value is string and no data type is passed", async () => {
    await pruneDatabase();

    const traceId = uuidv4();

    await makeAPICall("POST", "/api/public/traces", {
      id: traceId,
      name: "trace-name",
      userId: "user-1",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      metadata: {
        key: "value",
      },
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
    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore).toMatchObject({
      ...scoreData,
      value: null,
      stringValue: "Good",
      dataType: ScoreDataType.CATEGORICAL,
    });
  });

  it("should create boolean score if boolean data type is passed", async () => {
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
    const scoreData = {
      id: scoreId,
      name: "score-name",
      value: 1,
      dataType: ScoreDataType.BOOLEAN,
      traceId,
    };
    const createScore = await makeAPICall(
      "POST",
      "/api/public/scores",
      scoreData,
    );

    expect(createScore.status).toBe(200);
    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore).toMatchObject({ ...scoreData, stringValue: "True" });
  });

  it("should infer boolean data type from boolean score config", async () => {
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

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: ScoreDataType.BOOLEAN,
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
    const dbScore = await prisma.score.findUnique({
      where: {
        id: scoreId,
      },
    });

    expect(dbScore).toMatchObject({ ...scoreData, stringValue: "True" });
  });

  it("should NOT create categorical score if numeric data type is passed", async () => {
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
    const scoreData = {
      id: scoreId,
      name: "accuracy",
      value: 1,
      dataType: ScoreDataType.CATEGORICAL,
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
      error:
        "Categorical scores should define a string value not a number, received: 1",
    });
  });

  it("should NOT create numeric score if categorical data type is passed incl numeric config", async () => {
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

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: ScoreDataType.NUMERIC,
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
      dataType: ScoreDataType.CATEGORICAL,
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
      error:
        "Data type mismatch based on config: expected NUMERIC, got CATEGORICAL",
    });
  });

  it("should NOT create boolean score if string value is passed", async () => {
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

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: ScoreDataType.BOOLEAN,
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
      dataType: ScoreDataType.BOOLEAN,
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
      error:
        "You may only pass a string value for categorical scores, received: True",
    });
  });

  it("should NOT create boolean score with value other than 1 | 0", async () => {
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

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: ScoreDataType.BOOLEAN,
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
      dataType: ScoreDataType.BOOLEAN,
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
      error: "Boolean scores should have value of 0 or 1, received: 0.5",
    });
  });

  it("should NOT create categorical score with value not defined in config.categories", async () => {
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

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: ScoreDataType.CATEGORICAL,
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
      dataType: ScoreDataType.CATEGORICAL,
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
      error:
        "Categorical scores should define a string value not a number, received: 1",
    });
  });

  it("should NOT create numeric score outside of defined range", async () => {
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

    await makeAPICall("POST", "/api/public/score-configs", {
      name: "accuracy",
      dataType: ScoreDataType.NUMERIC,
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
      dataType: ScoreDataType.NUMERIC,
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
      error: "Value exceeds maximum value of 0",
    });
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

  describe("should Filter scores", () => {
    let configId = "";
    const userId = "user-name";
    const scoreName = "score-name";
    const queryUserName = `userId=${userId}&name=${scoreName}`;
    const traceId = uuidv4();
    const generationId = uuidv4();
    const scoreId_1 = uuidv4();
    const scoreId_2 = uuidv4();
    const scoreId_3 = uuidv4();
    interface GetScoresAPIResponse {
      data: [
        {
          id: string;
          name: string;
          value: number;
        },
      ];
      meta: object;
    }

    beforeAll(async () => {
      should_prune_db = false;
      await pruneDatabase();

      await makeAPICall("POST", "/api/public/traces", {
        id: traceId,
        userId: userId,
      });
      await makeAPICall("POST", "/api/public/generations", {
        id: generationId,
      });

      await makeAPICall("POST", "/api/public/score-configs", {
        name: scoreName,
        dataType: ScoreDataType.NUMERIC,
        maxValue: 100,
      });

      const config = await prisma.scoreConfig.findFirst({
        where: {
          name: scoreName,
        },
      });
      configId = config?.id ?? "";

      await makeAPICall("POST", "/api/public/scores", {
        id: scoreId_1,
        observationId: generationId,
        name: scoreName,
        value: 10.5,
        traceId: traceId,
        comment: "comment",
        configId,
      });
      await makeAPICall("POST", "/api/public/scores", {
        id: scoreId_2,
        observationId: generationId,
        name: scoreName,
        value: 50.5,
        traceId: traceId,
        comment: "comment",
      });
      await makeAPICall("POST", "/api/public/scores", {
        id: scoreId_3,
        observationId: generationId,
        name: scoreName,
        value: 100.8,
        traceId: traceId,
        comment: "comment",
      });
    });
    afterAll(async () => {
      await pruneDatabase();
    });

    it("get all scores", async () => {
      const getAllScore = await makeAPICall<{
        data: [
          {
            traceId: string;
            observationId: string;
          },
        ];
        meta: object;
      }>("GET", `/api/public/scores?${queryUserName}`);
      expect(getAllScore.status).toBe(200);
      expect(getAllScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 3,
        totalPages: 1,
      });
      for (const val of getAllScore.body.data) {
        expect(val).toMatchObject({
          traceId: traceId,
          observationId: generationId,
        });
      }
    });

    it("get all scores for config", async () => {
      const getAllScore = await makeAPICall<{
        data: [
          {
            traceId: string;
            observationId: string;
            configId?: string;
          },
        ];
        meta: object;
      }>("GET", `/api/public/scores?configId=${configId}`);

      expect(getAllScore.status).toBe(200);
      expect(getAllScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 3,
        totalPages: 1,
      });
      for (const val of getAllScore.body.data) {
        expect(val).toMatchObject({
          traceId: traceId,
          observationId: generationId,
          configId: configId,
        });
      }
    });

    it("test only operator", async () => {
      const getScore = await makeAPICall<GetScoresAPIResponse>(
        "GET",
        `/api/public/scores?${queryUserName}&operator=<`,
      );
      expect(getScore.status).toBe(200);
      expect(getScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 3,
        totalPages: 1,
      });
    });

    it("test only value", async () => {
      const getScore = await makeAPICall<GetScoresAPIResponse>(
        "GET",
        `/api/public/scores?${queryUserName}&value=0.8`,
      );
      expect(getScore.status).toBe(200);
      expect(getScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 3,
        totalPages: 1,
      });
    });

    it("test operator <", async () => {
      const getScore = await makeAPICall<GetScoresAPIResponse>(
        "GET",
        `/api/public/scores?${queryUserName}&operator=<&value=50`,
      );
      expect(getScore.status).toBe(200);
      expect(getScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 1,
        totalPages: 1,
      });
      expect(getScore.body.data).toMatchObject([
        {
          id: scoreId_1,
          name: scoreName,
          value: 10.5,
        },
      ]);
    });
    it("test operator >", async () => {
      const getScore = await makeAPICall<GetScoresAPIResponse>(
        "GET",
        `/api/public/scores?${queryUserName}&operator=>&value=100`,
      );
      expect(getScore.status).toBe(200);
      expect(getScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 1,
        totalPages: 1,
      });
      expect(getScore.body.data).toMatchObject([
        {
          id: scoreId_3,
          name: scoreName,
          value: 100.8,
        },
      ]);
    });
    it("test operator <=", async () => {
      const getScore = await makeAPICall<GetScoresAPIResponse>(
        "GET",
        `/api/public/scores?${queryUserName}&operator=<=&value=50.5`,
      );
      expect(getScore.status).toBe(200);
      expect(getScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 2,
        totalPages: 1,
      });
      expect(getScore.body.data).toMatchObject([
        {
          id: scoreId_2,
          name: scoreName,
          value: 50.5,
        },
        {
          id: scoreId_1,
          name: scoreName,
          value: 10.5,
        },
      ]);
    });
    it("test operator >=", async () => {
      const getScore = await makeAPICall<GetScoresAPIResponse>(
        "GET",
        `/api/public/scores?${queryUserName}&operator=>=&value=50.5`,
      );
      expect(getScore.status).toBe(200);
      expect(getScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 2,
        totalPages: 1,
      });
      expect(getScore.body.data).toMatchObject([
        {
          id: scoreId_3,
          name: scoreName,
          value: 100.8,
        },
        {
          id: scoreId_2,
          name: scoreName,
          value: 50.5,
        },
      ]);
    });
    it("test operator !=", async () => {
      const getScore = await makeAPICall<GetScoresAPIResponse>(
        "GET",
        `/api/public/scores?${queryUserName}&operator=!=&value=50.5`,
      );
      expect(getScore.status).toBe(200);
      expect(getScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 2,
        totalPages: 1,
      });
      expect(getScore.body.data).toMatchObject([
        {
          id: scoreId_3,
          name: scoreName,
          value: 100.8,
        },
        {
          id: scoreId_1,
          name: scoreName,
          value: 10.5,
        },
      ]);
    });
    it("test operator =", async () => {
      const getScore = await makeAPICall<GetScoresAPIResponse>(
        "GET",
        `/api/public/scores?${queryUserName}&operator==&value=50.5`,
      );
      expect(getScore.status).toBe(200);
      expect(getScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 1,
        totalPages: 1,
      });
      expect(getScore.body.data).toMatchObject([
        {
          id: scoreId_2,
          name: scoreName,
          value: 50.5,
        },
      ]);
    });
    it("test invalid operator", async () => {
      const getScore = await makeAPICall(
        "GET",
        `/api/public/scores?${queryUserName}&operator=op&value=50.5`,
      );
      expect(getScore.status).toBe(400);
      expect(getScore.body).toMatchObject({
        message: "Invalid request data",
      });
    });
    it("test invalid value", async () => {
      const getScore = await makeAPICall(
        "GET",
        `/api/public/scores?${queryUserName}&operator=<&value=myvalue`,
      );
      expect(getScore.status).toBe(400);
      expect(getScore.body).toMatchObject({
        message: "Invalid request data",
      });
    });

    it("should filter scores by score IDs", async () => {
      const getScore = await makeAPICall<{
        data: [
          {
            id: string;
            name: string;
            value: number;
          },
        ];
        meta: object;
      }>("GET", `/api/public/scores?scoreIds=${scoreId_1},${scoreId_2}`);
      expect(getScore.status).toBe(200);
      expect(getScore.body.meta).toMatchObject({
        page: 1,
        limit: 50,
        totalItems: 2,
        totalPages: 1,
      });
      expect(getScore.body.data).toMatchObject([
        {
          id: scoreId_2,
          name: scoreName,
          value: 50.5,
        },
        {
          id: scoreId_1,
          name: scoreName,
          value: 10.5,
        },
      ]);
    });
  });
});
