import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createOrgProjectAndApiKey,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { createTrace, getSessionsTable } from "@langfuse/shared/src/server";

describe("trpc.sessions", () => {
  describe("GET sessions.all", () => {
    it("should GET all session", async () => {
      const { projectId } = await createOrgProjectAndApiKey();
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

      const uiSessions = await getSessionsTable({
        projectId: projectId,
        filter: [],
        orderBy: null,
        limit: 10000,
        page: 0,
      });

      expect(uiSessions.length).toBe(1);
      expect(uiSessions[0].session_id).toBe(sessionId);
      expect(uiSessions[0].trace_count).toBe(2);
      expect(uiSessions[0].trace_tags).toEqual(["doe", "john"]);
      expect(uiSessions[0].total_observations).toBe(0);
    });
  });

  it("should GET all session filtered by trace attribute only", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
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

    const uiSessions = await getSessionsTable({
      projectId: projectId,
      filter: [],
      orderBy: null,
      limit: 10000,
      page: 0,
    });

    expect(uiSessions.length).toBe(1);
    expect(uiSessions[0].session_id).toBe(sessionId);
    expect(uiSessions[0].trace_count).toBe(2);
    expect(uiSessions[0].trace_tags).toEqual(["doe", "john"]);
    expect(uiSessions[0].total_observations).toBe(0);
  });
});
