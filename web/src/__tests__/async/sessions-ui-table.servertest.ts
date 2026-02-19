import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createObservation,
  createObservationsCh,
  createOrgProjectAndApiKey,
  createScoresCh,
  createSessionScore,
  createTracesCh,
  getSessionsWithMetrics,
  getSessionMetricsFromEvents,
  getSessionsTable,
  getSessionsTableFromEvents,
  createEvent,
  createEventsCh,
  type TraceRecordInsertType,
  type ObservationRecordInsertType,
  type EventRecordInsertType,
} from "@langfuse/shared/src/server";
import { createTrace } from "@langfuse/shared/src/server";
import { type FilterState } from "@langfuse/shared";
import { env } from "@/src/env.mjs";

const isEventsPath = env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true";

// Pick the right listing function based on env flag
const sessionsTable = isEventsPath
  ? getSessionsTableFromEvents
  : getSessionsTable;

// Adapter for metrics: legacy takes filter/orderBy, events-based takes sessionIds
async function sessionsWithMetrics(props: {
  projectId: string;
  filter: FilterState;
}) {
  if (!isEventsPath) {
    return getSessionsWithMetrics(props);
  }
  const idFilter = props.filter.find(
    (f): f is Extract<FilterState[number], { column: "id" }> =>
      f.column === "id",
  );
  const sessionIds =
    idFilter && "value" in idFilter ? (idFilter.value as string[]) : [];
  return getSessionMetricsFromEvents({
    projectId: props.projectId,
    sessionIds,
  });
}

/**
 * Derive v2 events from v1 traces + observations.
 * Reused from dashboard-v1-v2-consistency.servertest.ts.
 *
 * One root event per trace (parent_span_id = ''), plus one event per
 * observation with trace-level fields denormalized.
 * Timestamps are converted from ms to µs (* 1000).
 */
function buildMatchingEvents(
  traces: TraceRecordInsertType[],
  observations: ObservationRecordInsertType[],
): EventRecordInsertType[] {
  const traceMap = new Map(traces.map((t) => [t.id, t]));
  const events: EventRecordInsertType[] = [];

  // Root events — one per trace.
  for (const t of traces) {
    events.push(
      createEvent({
        id: `t-${t.id}`,
        span_id: `t-${t.id}`,
        trace_id: t.id,
        project_id: t.project_id,
        parent_span_id: "",
        name: t.name ?? "",
        type: "SPAN",
        environment: t.environment,
        trace_name: t.name ?? "",
        user_id: t.user_id ?? "",
        session_id: t.session_id ?? null,
        tags: t.tags ?? [],
        release: t.release ?? null,
        version: t.version ?? null,
        public: t.public,
        bookmarked: t.bookmarked,
        input: t.input ?? null,
        output: t.output ?? null,
        metadata: t.metadata ?? {},
        start_time: t.timestamp * 1000,
        end_time: null,
        cost_details: {},
        provided_cost_details: {},
        usage_details: {},
        provided_usage_details: {},
        created_at: t.created_at * 1000,
        updated_at: t.updated_at * 1000,
        event_ts: t.event_ts * 1000,
      }),
    );
  }

  // Observation events.
  for (const o of observations) {
    const traceId = o.trace_id!;
    const t = traceMap.get(traceId)!;
    events.push(
      createEvent({
        id: o.id,
        span_id: o.id,
        trace_id: traceId,
        project_id: o.project_id,
        parent_span_id: o.parent_observation_id ?? `t-${traceId}`,
        name: o.name ?? "",
        type: o.type as string,
        environment: o.environment,
        trace_name: t.name ?? "",
        user_id: t.user_id ?? "",
        session_id: t.session_id ?? undefined,
        tags: t.tags ?? [],
        release: t.release ?? null,
        version: o.version ?? null,
        level: o.level ?? "DEFAULT",
        status_message: o.status_message ?? null,
        provided_model_name: o.provided_model_name ?? null,
        model_parameters: o.model_parameters ?? "{}",
        input: o.input ?? null,
        output: o.output ?? null,
        metadata: { ...(t.metadata ?? {}), ...(o.metadata ?? {}) },
        provided_usage_details: o.provided_usage_details ?? {},
        usage_details: o.usage_details ?? {},
        provided_cost_details: o.provided_cost_details ?? {},
        cost_details: o.cost_details ?? {},
        prompt_id: o.prompt_id ?? null,
        prompt_name: o.prompt_name ?? null,
        prompt_version: o.prompt_version ? String(o.prompt_version) : null,
        tool_definitions: o.tool_definitions ?? {},
        tool_calls: o.tool_calls ?? [],
        tool_call_names: o.tool_call_names ?? [],
        start_time: o.start_time * 1000,
        end_time: o.end_time ? o.end_time * 1000 : null,
        completion_start_time: o.completion_start_time
          ? o.completion_start_time * 1000
          : null,
        created_at: o.created_at * 1000,
        updated_at: o.updated_at * 1000,
        event_ts: o.event_ts * 1000,
      }),
    );
  }

  return events;
}

/**
 * Seed both legacy tables (traces + observations) and events table.
 * This ensures the same test data is available for both code paths.
 */
async function seedSessionData(
  traces: TraceRecordInsertType[],
  observations?: ObservationRecordInsertType[],
) {
  await createTracesCh(traces);
  if (observations?.length) await createObservationsCh(observations);

  if (isEventsPath) {
    const events = buildMatchingEvents(traces, observations ?? []);
    await createEventsCh(events);
  }
}

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

      await seedSessionData(traces);

      const uiSessions = await sessionsTable({
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

    await seedSessionData(traces);

    const uiSessions = await sessionsTable({
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

    await seedSessionData(traces, observations);

    const uiSessions = await sessionsTable({
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
        timestamp: new Date("2024-01-01T00:00:00Z").getTime(),
      }),
      createTrace({
        session_id: sessionId2,
        project_id: projectId,
        timestamp: new Date("2024-01-01T00:00:00Z").getTime(),
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

    await seedSessionData(traces, observations);

    const uiSessions = await sessionsTable({
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

    await seedSessionData(traces, observations);

    const sessions = await sessionsWithMetrics({
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

    await seedSessionData(traces, observations);

    const sessions = await sessionsWithMetrics({
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
    expect(parseInt(sessions[0]?.duration as any)).toBe(1);
  });

  it("should GET correct session data with filters", async () => {
    const project_id = v4();
    const trace_id_with_score = v4();
    const session_id_with_score = v4();
    const trace_id_without_score = v4();
    const session_id_without_score = v4();

    const filterState: FilterState = [
      {
        type: "numberObject",
        column: "Scores (numeric)",
        key: "test",
        operator: ">",
        value: 0,
      },
    ];

    const trace_with_score = createTrace({
      id: trace_id_with_score,
      project_id,
      session_id: session_id_with_score,
    });
    const trace_without_score = createTrace({
      id: trace_id_without_score,
      project_id,
      session_id: session_id_without_score,
    });
    await seedSessionData([trace_with_score, trace_without_score]);

    const score = createSessionScore({
      project_id,
      session_id: session_id_with_score,
      name: "test",
      value: 1,
      data_type: "NUMERIC",
    });
    await createScoresCh([score]);

    const tableRows = await sessionsTable({
      projectId: project_id,
      filter: filterState,
      limit: 10,
      page: 0,
    });

    expect(tableRows).toHaveLength(1);
    expect(tableRows[0].session_id).toEqual(session_id_with_score);
  });
});
