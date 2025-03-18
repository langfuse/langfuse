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

  it("should GET sessions ordered by total cost", async () => {
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
      }),
      createTrace({
        session_id: sessionId2,
        project_id: projectId,
      }),
    ];

    const observations = [
      createObservation({
        trace_id: traces[0].id,
        project_id: projectId,
        cost_details: {
          input: 0.1,
          output: 0.2,
          total: 0.3,
        },
        total_cost: 0.3,
      }),
      createObservation({
        trace_id: traces[1].id,
        project_id: projectId,
        cost_details: {
          input: 0.3,
          output: 0.4,
          total: 0.7,
        },
        total_cost: 0.7,
      }),
    ];

    await createTracesCh(traces);
    await createObservationsCh(observations);

    const uiSessions = await getSessionsTable({
      projectId: projectId,
      filter: [],
      orderBy: {
        column: "totalCost",
        order: "DESC" as const,
      },
      limit: 10000,
      page: 0,
    });

    expect(uiSessions.length).toBe(2);
    expect(uiSessions[0].session_id).toBe(sessionId2);
    expect(uiSessions[1].session_id).toBe(sessionId1);
  });

  it("should GET sessions ordered by duration", async () => {
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
      }),
      createTrace({
        session_id: sessionId2,
        project_id: projectId,
      }),
    ];
    const observations = [
      createObservation({
        trace_id: traces[0].id,
        project_id: projectId,
        start_time: new Date("2024-01-01T00:00:00Z").getTime(),
        end_time: new Date("2024-01-01T00:00:10Z").getTime(), // 10 second duration
      }),
      createObservation({
        trace_id: traces[1].id,
        project_id: projectId,
        start_time: new Date("2024-01-01T00:00:00Z").getTime(),
        end_time: new Date("2024-01-01T00:00:20Z").getTime(), // 20 second duration
      }),
    ];

    await createTracesCh(traces);
    await createObservationsCh(observations);

    const uiSessions = await getSessionsTable({
      projectId: projectId,
      filter: [],
      orderBy: {
        column: "sessionDuration",
        order: "DESC" as const,
      },
      limit: 10000,
      page: 0,
    });

    expect(uiSessions.length).toBe(2);
    expect(uiSessions[0].session_id).toBe(sessionId2);
    expect(uiSessions[1].session_id).toBe(sessionId1);
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

    expect(Number(session2?.session_input_cost)).toBeGreaterThan(0);
    expect(Number(session2?.session_output_cost)).toBeGreaterThan(0);
    expect(Number(session2?.session_total_cost)).toBeGreaterThan(0);
    expect(Number(session2?.session_input_usage)).toBeGreaterThan(0);
    expect(Number(session2?.session_output_usage)).toBeGreaterThan(0);
    expect(Number(session2?.session_total_usage)).toBeGreaterThan(0);
  });

  it("LFE-4113: should GET correct metrics for a list of sessions without observations", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const sessionId = v4();

    await prisma.traceSession.createMany({
      data: [
        {
          id: sessionId,
          projectId: projectId,
        },
      ],
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
        user_id: "user3",
      }),
    ];

    await createTracesCh(traces);

    // Only trace 2 has observations
    const observations = [
      createObservation({
        trace_id: traces[1].id,
        project_id: projectId,
        start_time: new Date().getTime() - 1000,
      }),
      createObservation({
        trace_id: traces[1].id,
        project_id: projectId,
        start_time: new Date().getTime(),
      }),
    ];

    await createObservationsCh(observations);

    const sessions = await getSessionsWithMetrics({
      projectId: projectId,
      filter: [
        {
          column: "id",
          type: "stringOptions",
          operator: "any of",
          value: [sessionId],
        },
      ],
    });

    expect(sessions.length).toBe(1);

    expect(sessions[0]).toBeDefined();
    expect(sessions[0]?.trace_count).toBe(2);
    expect(parseInt(sessions[0]?.duration as any)).toBeGreaterThan(995);
    expect(parseInt(sessions[0]?.duration as any)).toBeLessThan(1005);
  });
});
