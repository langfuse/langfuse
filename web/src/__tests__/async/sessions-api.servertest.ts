import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createTracesCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { createTrace } from "@langfuse/shared/src/server";
import {
  GetSessionsV1Response,
  GetSessionV1Response,
} from "@/src/features/public-api/types/sessions";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/sessions API Endpoint", () => {
  describe("GET /api/public/sessions/:sessionId", () => {
    it("should GET a session", async () => {
      const sessionId = v4();

      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId: projectId,
        },
      });

      const traces = [
        createTrace({ session_id: sessionId, project_id: projectId }),
        createTrace({ session_id: sessionId, project_id: projectId }),
      ];

      await createTracesCh(traces);

      const getScore = await makeZodVerifiedAPICall(
        GetSessionV1Response,
        "GET",
        `/api/public/sessions/${sessionId}`,
      );

      expect(getScore.status).toBe(200);
      expect(getScore.body).toMatchObject({
        id: sessionId,
        projectId,
        environment: "default",
        createdAt: expect.any(String),
      });

      expect(getScore.body.traces.map((t) => t.id)).toEqual(
        expect.arrayContaining(traces.map((trace) => trace.id)),
      );
    });
  });

  describe("GET /api/public/sessions API Endpoint", () => {
    let projectId: string;
    let auth: string;

    beforeAll(async () => {
      const { projectId: newProjectId, auth: newAuth } =
        await createOrgProjectAndApiKey();
      projectId = newProjectId;
      auth = newAuth;

      await prisma.traceSession.createMany({
        data: [
          {
            id: "session-2021-01-01",
            createdAt: new Date("2021-01-01T00:00:00Z"),
            projectId: projectId,
          },
          {
            id: "session-2021-02-01",
            createdAt: new Date("2021-02-01T00:00:00Z"),
            projectId: projectId,
          },
          {
            id: "session-2021-03-01",
            createdAt: new Date("2021-03-01T00:00:00Z"),
            projectId: projectId,
          },
          {
            id: "session-2021-04-01",
            createdAt: new Date("2021-04-01T00:00:00Z"),
            projectId: projectId,
          },
          {
            id: "session-2021-05-01",
            createdAt: new Date("2021-05-01T00:00:00Z"),
            projectId: projectId,
            environment: "production",
          },
        ],
      });
    });

    it("should return all sessions", async () => {
      const sessions = await makeZodVerifiedAPICall(
        GetSessionsV1Response,
        "GET",
        "/api/public/sessions",
        undefined,
        auth,
      );
      expect(sessions.body.data.length).toEqual(5);
      expect(sessions.body.data.map((session) => session.id)).toEqual(
        expect.arrayContaining([
          "session-2021-01-01",
          "session-2021-02-01",
          "session-2021-03-01",
          "session-2021-04-01",
          "session-2021-05-01",
        ]),
      );
    });

    it("should return sessions with environment", async () => {
      const sessions = await makeZodVerifiedAPICall(
        GetSessionsV1Response,
        "GET",
        "/api/public/sessions",
        undefined,
        auth,
      );
      expect(sessions.body.data.length).toEqual(5);
      expect(sessions.body.data.map((session) => session.environment)).toEqual(
        expect.arrayContaining([
          "default",
          "default",
          "default",
          "default",
          "production",
        ]),
      );
    });

    it("should filter sessions by environment", async () => {
      const sessions = await makeZodVerifiedAPICall(
        GetSessionsV1Response,
        "GET",
        "/api/public/sessions?environment=production",
        undefined,
        auth,
      );
      expect(sessions.body.data.length).toEqual(1);
      expect(sessions.body.data[0].environment).toEqual("production");
    });

    it("should return paginated sessions with limit and page number", async () => {
      const limit = 2;
      const page = 2;

      const sessions = await makeZodVerifiedAPICall(
        GetSessionsV1Response,
        "GET",
        `/api/public/sessions?limit=${limit}&page=${page}`,
        undefined,
        auth,
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
        undefined,
        auth,
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
        undefined,
        auth,
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
        undefined,
        auth,
      );

      expect(sessions.body.data).toHaveLength(2);
      expect(sessions.body.data.map((session) => session.id)).toEqual([
        "session-2021-02-01",
        "session-2021-01-01",
      ]);
      expect(sessions.body.meta.totalItems).toBe(2);
    });
  });
});
