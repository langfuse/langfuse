/** @jest-environment node */

import {
  makeZodVerifiedAPICall,
  pruneDatabase,
} from "@/src/__tests__/test-utils";
import {
  GetSessionV1Response,
  GetSessionsV1Response,
} from "@/src/features/public-api/types/sessions";
import { PostTracesV1Response } from "@/src/features/public-api/types/traces";
import { prisma } from "@langfuse/shared/src/db";

describe("Create and get sessions", () => {
  beforeEach(async () => await pruneDatabase());
  afterEach(async () => await pruneDatabase());

  it("should create a session via a trace", async () => {
    await pruneDatabase();

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        sessionId: "session-id",
      },
    );

    const dbSession = await prisma.traceSession.findFirst({
      where: {
        id: "session-id",
      },
    });

    expect(dbSession).not.toBeNull();
    expect(dbSession).toMatchObject({
      id: "session-id",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
    });
  });

  it("should get session including traces", async () => {
    await pruneDatabase();

    await makeZodVerifiedAPICall(
      PostTracesV1Response,
      "POST",
      "/api/public/traces",
      {
        name: "trace-name",
        id: "trace-id",
        input: { hello: "world" },
        output: "hi",
        projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        sessionId: "session-id",
      },
    );

    const response = await makeZodVerifiedAPICall(
      GetSessionV1Response,
      "GET",
      "/api/public/sessions/session-id",
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: "session-id",
      projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
      traces: [
        {
          id: "trace-id",
          input: { hello: "world" },
          output: "hi",
        },
      ],
    });
  });
});

describe("GET /api/public/sessions API Endpoint", () => {
  beforeEach(async () => {
    await pruneDatabase();
    await prisma.traceSession.createMany({
      data: [
        {
          id: "session-2021-01-01",
          createdAt: new Date("2021-01-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        },
        {
          id: "session-2021-02-01",
          createdAt: new Date("2021-02-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        },
        {
          id: "session-2021-03-01",
          createdAt: new Date("2021-03-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        },
        {
          id: "session-2021-04-01",
          createdAt: new Date("2021-04-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        },
        {
          id: "session-2021-05-01",
          createdAt: new Date("2021-05-01T00:00:00Z"),
          projectId: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a",
        },
      ],
    });
  });
  afterEach(async () => await pruneDatabase());

  it("should return all sessions", async () => {
    const sessions = await makeZodVerifiedAPICall(
      GetSessionsV1Response,
      "GET",
      "/api/public/sessions",
    );
    expect(sessions.body.data).toHaveLength(5);
  });

  it("should return paginated sessions with limit and page number", async () => {
    const limit = 2;
    const page = 2;

    const sessions = await makeZodVerifiedAPICall(
      GetSessionsV1Response,
      "GET",
      `/api/public/sessions?limit=${limit}&page=${page}`,
    );

    expect(sessions.body.data).toHaveLength(2);
    expect(sessions.body.data.map((session) => session.id)).toEqual([
      "session-2021-03-01",
      "session-2021-02-01",
    ]);
    expect(sessions.body.meta.totalItems).toBe(5);
    expect(sessions.body.meta.totalPages).toBe(3);
    expect(sessions.body.meta.page).toBe(page);
    expect(sessions.body.meta.limit).toBe(limit);
  });

  it("should return sessions within a specific date range", async () => {
    const fromTimestamp = "2021-02-01T00:00:00Z";
    const toTimestamp = "2021-04-01T00:00:00Z";

    const sessions = await makeZodVerifiedAPICall(
      GetSessionsV1Response,
      "GET",
      `/api/public/sessions?fromTimestamp=${fromTimestamp}&toTimestamp=${toTimestamp}`,
    );

    expect(sessions.body.data).toHaveLength(2);
    expect(sessions.body.data.map((session) => session.id)).toEqual([
      "session-2021-03-01",
      "session-2021-02-01",
    ]);
    expect(sessions.body.meta.totalItems).toBe(2);
  });

  it("should return sessions from a specific date onwards (including the date)", async () => {
    const fromTimestamp = "2021-03-01T00:00:00Z";

    const sessions = await makeZodVerifiedAPICall(
      GetSessionsV1Response,
      "GET",
      `/api/public/sessions?fromTimestamp=${fromTimestamp}`,
    );

    expect(sessions.body.data).toHaveLength(3);
    expect(sessions.body.data.map((session) => session.id)).toEqual([
      "session-2021-05-01",
      "session-2021-04-01",
      "session-2021-03-01",
    ]);
    expect(sessions.body.meta.totalItems).toBe(3);
  });

  it("should return sessions up to a specific date (excluding it)", async () => {
    const toTimestamp = "2021-03-01T00:00:00Z";

    const sessions = await makeZodVerifiedAPICall(
      GetSessionsV1Response,
      "GET",
      `/api/public/sessions?toTimestamp=${toTimestamp}`,
    );

    expect(sessions.body.data).toHaveLength(2);
    expect(sessions.body.data.map((session) => session.id)).toEqual([
      "session-2021-02-01",
      "session-2021-01-01",
    ]);
    expect(sessions.body.meta.totalItems).toBe(2);
  });
});
