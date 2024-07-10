/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import { PostGenerationsV1Response } from "@/src/features/public-api/types/generations";
import { PostScoresResponse } from "@/src/features/public-api/types/scores";
import {
  GetTraceV1Response,
  GetTracesV1Response,
  PostTracesV1Response,
} from "@/src/features/public-api/types/traces";
import { prisma } from "@langfuse/shared/src/db";
import { v4 as uuidv4 } from "uuid";

describe("/api/public/traces API Endpoint", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should create and get a trace via /traces", async () => {
    await pruneDatabase();

    const traceCreate = await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        userId: "user-1",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
      undefined,
      false,
    );

    const trace = await makeZodVerifiedAPICall(
      GetTraceV1Response,
      "GET",
      "/api/public/traces/" + traceCreate.body.id,
    );

    expect(trace.body.name).toBe("trace-name");
    expect(trace.body.release).toBe("1.0.0");
    expect(trace.body.externalId).toBeNull();
    expect(trace.body.version).toBe("2.0.0");
    expect(trace.body.projectId).toBe("7a88fb47-b4e2-43b8-a06c-a5ce950dc53a");
  });

  it("should upsert second trace", async () => {
    await pruneDatabase();

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        id: "trace-id",
        name: "trace-name",
        userId: "user-1",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
        public: true,
      },
      undefined,
      false,
    );

    const dbTrace1 = await prisma.trace.findFirst({
      where: {
        id: "trace-id",
      },
    });

    expect(dbTrace1).not.toBeNull();
    expect(dbTrace1).toMatchObject({
      name: "trace-name",
      release: "1.0.0",
      externalId: null,
      version: "2.0.0",
      public: true,
      userId: "user-1",
    });

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        id: "trace-id",
        metadata: { key: "value" },
        timestamp: "2021-01-01T00:00:00.000Z",
        release: "1.0.0",
        version: "5.0.0",
        public: false,
      },
      undefined,
      false,
    );

    const dbTrace2 = await prisma.trace.findFirst({
      where: {
        name: "trace-name",
      },
    });

    expect(dbTrace2).not.toBeNull();
    expect(dbTrace2).toMatchObject({
      name: "trace-name",
      release: "1.0.0",
      externalId: null,
      version: "5.0.0",
      public: false,
      userId: "user-1",
      timestamp: new Date("2021-01-01T00:00:00.000Z"),
    });
  });

  it("should use tags correctly on POST and GET", async () => {
    await pruneDatabase();

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        id: "trace-1",
        tags: ["tag-1", "tag-2", "tag-3"],
      },
      undefined,
      false,
    );

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        id: "trace-2",
        tags: ["tag-1"],
      },
      undefined,
      false,
    );

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        id: "trace-3",
        tags: ["tag-2", "tag-3"],
      },
      undefined,
      false,
    );

    // multiple tags
    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      "/api/public/traces?tags=tag-2&tags=tag-3",
    );
    const traceIds = traces.body.data.map((t) => t.id);
    // check for equality ok as ordered by timestamp
    expect(traceIds).toEqual(["trace-3", "trace-1"]);

    // single tag
    const traces2 = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      "/api/public/traces?tags=tag-1",
    );
    const traceIds2 = traces2.body.data.map((t) => t.id);
    // check for equality ok as ordered by timestamp
    expect(traceIds2).toEqual(["trace-2", "trace-1"]);

    // wrong tag
    const traces3 = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      "/api/public/traces?tags=tag-10",
    );
    const traceIds3 = traces3.body.data.map((t) => t.id);
    // check for equality ok as ordered by timestamp
    expect(traceIds3).toEqual([]);

    // no tag
    const traces4 = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      "/api/public/traces?tags=",
    );
    const traceIds4 = traces4.body.data.map((t) => t.id);
    // check for equality ok as ordered by timestamp
    expect(traceIds4).toEqual(["trace-3", "trace-2", "trace-1"]);
  });

  it("should handle metrics correctly on GET traces and GET trace", async () => {
    await pruneDatabase();

    // Create a trace with some observations that have costs and latencies
    const traceId = uuidv4();
    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        id: traceId,
        name: "trace-with-costs",
        userId: "user-costs",
        projectId: "project-costs",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "2.0.0",
      },
      undefined,
      false,
    );
    console.log(traceId);

    // Simulate observations with costs and latencies
    const generationId = uuidv4();
    await makeZodVerifiedAPICall(
      PostGenerationsV1Response,
      "POST",
      "/api/public/generations",
      {
        traceId: traceId,
        id: generationId,
        name: "Generation1",
        usage: { totalCost: 10.5 },
        startTime: "2021-01-01T00:00:00.000Z",
        endTime: "2021-01-01T00:10:00.000Z",
      },
      undefined,
      false,
    );
    await makeZodVerifiedAPICall(
      PostGenerationsV1Response,
      "POST",
      "/api/public/generations",
      {
        traceId: traceId,
        usage: { totalCost: 5.25 },
        startTime: "2021-01-01T00:10:00.000Z",
        endTime: "2021-01-01T00:20:00.000Z",
      },
      undefined,
      false,
    );

    // Simulate scores on the trace
    const scoreId1 = uuidv4();
    await makeZodVerifiedAPICall(
      PostScoresResponse,
      "POST",
      "/api/public/scores",
      {
        id: scoreId1,
        name: "score-1",
        value: 75.0,
        traceId: traceId,
        comment: "First score",
      },
      undefined,
      false,
    );
    const scoreId2 = uuidv4();
    await makeZodVerifiedAPICall(
      PostScoresResponse,
      "POST",
      "/api/public/scores",
      {
        id: scoreId2,
        name: "score-2",
        value: 85.5,
        traceId: traceId,
        comment: "Second score",
      },
      undefined,
      false,
    );
    const scoreId3 = uuidv4();
    await makeZodVerifiedAPICall(
      PostScoresResponse,
      "POST",
      "/api/public/scores",
      {
        id: scoreId3,
        name: "score-3",
        value: 95.0,
        traceId: traceId,
        comment: "Third score",
      },
      undefined,
      false,
    );

    // GET traces
    // Retrieve the trace with totalCost and latency
    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces`,
    );
    const traceData = traces.body.data[0];
    if (!traceData) throw new Error("traceData is undefined");

    // Check if the totalCost and latency are calculated correctly
    expect(traceData.totalCost).toBeCloseTo(15.75); // Sum of costs
    expect(traceData.latency).toBeCloseTo(1200); // Difference in seconds between min startTime and max endTime
    expect(traceData.id).toBe(traceId);
    expect(traceData.htmlPath).toContain(`/traces/${traceId}`);
    expect(traceData.htmlPath).toContain(`/project/`); // do not know the projectId

    // GET trace
    // Retrieve the trace with total
    const trace = await makeZodVerifiedAPICall(
      GetTraceV1Response,
      "GET",
      `/api/public/traces/${traceId}`,
    );
    console.log(trace.body);
    expect(trace.body.totalCost).toBeCloseTo(15.75);
    expect(trace.body.id).toBe(traceId);
    expect(trace.body.id).toBe(traceId);
    expect(trace.body.htmlPath).toContain(`/traces/${traceId}`);
    expect(trace.body.htmlPath).toContain(`/project/`); // do not know the projectId
    expect(trace.body.scores).toHaveLength(3);
    expect(trace.body.scores[0].id).toBe(scoreId3);
    expect(trace.body.scores[0].name).toBe("score-3");
    expect(trace.body.observations).toHaveLength(2);
    expect(trace.body.observations[0].id).toBe(generationId);
    expect(trace.body.observations[0].name).toBe("Generation1");
  });

  it("should filter traces by session ID", async () => {
    const sessionId = "test-session-id";
    const anotherSessionId = "another-session-id";

    // Create traces with different session IDs
    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        id: "trace-1",
        name: "test-trace-1",
        sessionId,
        userId: "user-1",
        projectId: "project-1",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "1.0.0",
      },
      undefined,
      false,
    );

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        id: "trace-2",
        name: "test-trace-2",
        sessionId: anotherSessionId,
        userId: "user-2",
        projectId: "project-1",
        metadata: { key: "value" },
        release: "1.0.0",
        version: "1.0.0",
      },
      undefined,
      false,
    );

    // Filter by session ID
    const tracesBySessionId = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?sessionId=${sessionId}`,
    );

    expect(tracesBySessionId.status).toBe(200);
    expect(tracesBySessionId.body.data).toHaveLength(1);
    expect(tracesBySessionId.body.data[0].id).toBe("trace-1");

    // Filter by another session ID
    const tracesByAnotherSessionId = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?sessionId=${anotherSessionId}`,
    );

    expect(tracesByAnotherSessionId.status).toBe(200);
    expect(tracesByAnotherSessionId.body.data).toHaveLength(1);
    expect(tracesByAnotherSessionId.body.data[0].id).toBe("trace-2");

    // Filter by non-existent session ID
    const tracesByNonExistentSessionId = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?sessionId=non-existent-session-id`,
    );

    expect(tracesByNonExistentSessionId.status).toBe(200);
    expect(tracesByNonExistentSessionId.body.data).toHaveLength(0);
  });
});
