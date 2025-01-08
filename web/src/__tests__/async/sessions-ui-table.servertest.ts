import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createTracesCh,
  getSessionsWithMetrics,
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
      createTrace({
        session_id: sessionId,
        project_id: projectId,
        user_id: "user1",
      }),
      createTrace({
        session_id: sessionId,
        project_id: projectId,
        user_id: undefined,
      }),
    ];

    await createTracesCh(traces);

    const uiSessions = await getSessionsTable({
      projectId: projectId,
      filter: [
        {
          column: "userIds",
          type: "stringOptions",
          operator: "any of",
          value: ["user1"],
        },
      ],
      orderBy: null,
      limit: 10000,
      page: 0,
    });

    expect(uiSessions.length).toBe(1);
    expect(uiSessions[0].session_id).toBe(sessionId);
    expect(uiSessions[0].trace_count).toBe(2);
    expect(uiSessions[0].trace_tags).toEqual(["doe", "john"]);
    expect(uiSessions[0].user_ids).toEqual(["user1"]);
  });

  it("should GET metrics for a list of sessions", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const sessionId1 = v4();
    const sessionId2 = v4();

    await prisma.traceSession.createMany({
      data: [
        {
          id: sessionId1,
          projectId: projectId,
        },
        {
          id: sessionId2,
          projectId: projectId,
        },
      ],
    });

    const traces = [
      createTrace({
        session_id: sessionId1,
        project_id: projectId,
        user_id: "user1",
      }),
      createTrace({
        session_id: sessionId1,
        project_id: projectId,
        user_id: "user2",
      }),
      createTrace({
        session_id: sessionId2,
        project_id: projectId,
        user_id: "user3",
      }),
    ];

    const observations = traces.flatMap((trace) => [
      createObservation({
        trace_id: trace.id,
        project_id: projectId,
      }),
      createObservation({
        trace_id: trace.id,
        project_id: projectId,
      }),
    ]);

    await createObservationsCh(observations);

    await createTracesCh(traces);

    const sessions = await getSessionsWithMetrics({
      projectId: projectId,
      filter: [
        {
          column: "id",
          type: "stringOptions",
          operator: "any of",
          value: [sessionId1, sessionId2],
        },
      ],
    });

    expect(sessions.length).toBe(2);

    // Session 1 checks
    const session1 = sessions.find((s) => s.session_id === sessionId1);
    expect(session1).toBeDefined();
    expect(session1?.trace_count).toBe(2);
    expect(session1?.user_ids).toEqual(
      expect.arrayContaining(["user1", "user2"]),
    );
    expect(session1?.trace_tags).toEqual(["doe", "john"]);
    expect(session1?.total_observations).toEqual(4);
    expect(session1?.duration).toBe("0");
    expect(Number(session1?.session_input_cost)).toBeGreaterThan(0);
    expect(Number(session1?.session_output_cost)).toBeGreaterThan(0);
    expect(Number(session1?.session_total_cost)).toBeGreaterThan(0);
    expect(Number(session1?.session_input_usage)).toBeGreaterThan(0);
    expect(Number(session1?.session_output_usage)).toBeGreaterThan(0);
    expect(Number(session1?.session_total_usage)).toBeGreaterThan(0);

    // Session 2 checks
    const session2 = sessions.find((s) => s.session_id === sessionId2);
    expect(session2).toBeDefined();
    expect(session2?.trace_count).toBe(1);
    expect(session2?.user_ids).toEqual(["user3"]);
    expect(session2?.trace_tags).toEqual(["doe", "john"]);
    expect(session2?.total_observations).toEqual(2);
    expect(session2?.duration).toBe("0");
    expect(Number(session2?.session_input_cost)).toBeGreaterThan(0);
    expect(Number(session2?.session_output_cost)).toBeGreaterThan(0);
    expect(Number(session2?.session_total_cost)).toBeGreaterThan(0);
    expect(Number(session2?.session_input_usage)).toBeGreaterThan(0);
    expect(Number(session2?.session_output_usage)).toBeGreaterThan(0);
    expect(Number(session2?.session_total_usage)).toBeGreaterThan(0);
  });
});
