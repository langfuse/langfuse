import { prisma } from "../../../src/db";
import {
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  createEventsCh,
  type TraceRecordInsertType,
  type ObservationRecordInsertType,
} from "../../../src/server";
import { assembleTranscript } from "../../../src/server/transcript/transcript";
import { orderObservations } from "../../../src/server/transcript/ordering";
import { observationToEvent, traceToEvent } from "./event-mirror";
import { type ScenarioDefinition, SeedError } from "./types";
import { countRows, sessionLink } from "./verify";
import { utcDayStartMs } from "./rng";

export const sessionThreadsScenario: ScenarioDefinition = {
  name: "session-threads",
  description:
    "Session header fixtures: single-thread traces, multi-thread traces, and both in one session. Verifies visible thread counts before writing.",
  supportsV4: true,
  flags: [
    {
      flag: "v4",
      type: "boolean",
      default: true,
      description: "mirror observations into v4 events tables",
    },
  ],
  run: async (ctx, params) => {
    const startedAt = Date.now();
    const sessions = [
      {
        shape: "single",
        traces: [
          { name: "Answer order status question", threadCount: 1 },
          { name: "Confirm delivery date", threadCount: 1 },
        ],
      },
      {
        shape: "multiple",
        traces: [
          { name: "Compare travel options", threadCount: 2 },
          { name: "Build weekend itinerary", threadCount: 3 },
        ],
      },
      {
        shape: "mixed",
        traces: [
          { name: "Triage billing issue", threadCount: 1 },
          { name: "Investigate duplicate charge", threadCount: 2 },
          { name: "Explain refund policy", threadCount: 1 },
          { name: "Resolve billing dispute", threadCount: 3 },
        ],
      },
    ];
    const sessionIds = sessions.map(({ shape }) => `${ctx.idPrefix}-${shape}`);
    const traces: TraceRecordInsertType[] = [];
    const observations: ObservationRecordInsertType[] = [];
    const threadCounts: Record<string, number> = {};
    const sessionStart = utcDayStartMs() - 30 * 60 * 1000;

    for (const [sessionIndex, session] of sessions.entries()) {
      const sessionId = sessionIds[sessionIndex]!;
      for (const [
        traceIndex,
        { name, threadCount },
      ] of session.traces.entries()) {
        const traceId = `${sessionId}-trace-${traceIndex + 1}`;
        const timestamp = sessionStart + traceIndex * 60_000;
        const trace = createTrace({
          id: traceId,
          project_id: ctx.projectId,
          environment: ctx.environment,
          session_id: sessionId,
          timestamp,
          name,
          user_id: `user-${ctx.idPrefix}`,
          release: null,
          version: null,
          tags: ["seed", "session-threads", session.shape],
          public: false,
          bookmarked: false,
          metadata: {
            scenario: "session-threads",
            threads: String(threadCount),
          },
          input: null,
          output: null,
          created_at: startedAt,
          updated_at: startedAt,
          event_ts: startedAt,
        });
        traces.push(trace);

        // No replayed history: each generation starts an independent thread.
        // Root generations keep every thread visible when nested ones are hidden.
        const generations = Array.from({ length: threadCount }, (_, index) => {
          const input = [
            {
              role: "user",
              content: `For ${traceId}, independently summarize topic ${index + 1}.`,
            },
          ];
          const output = [
            {
              role: "assistant",
              content: `Topic ${index + 1}: this is conversation ${index + 1} of ${threadCount} in this trace.`,
            },
          ];
          const startTime = timestamp + index * 2000;
          const name = `independent-conversation-${index + 1}`;
          const observation = createObservation({
            id: `${traceId}-generation-${index + 1}`,
            trace_id: traceId,
            project_id: ctx.projectId,
            environment: ctx.environment,
            type: "GENERATION",
            parent_observation_id: null,
            name,
            start_time: startTime,
            end_time: startTime + 1000,
            completion_start_time: startTime + 200,
            level: "DEFAULT",
            status_message: null,
            version: null,
            input: JSON.stringify(input),
            output: JSON.stringify(output),
            metadata: { scenario: "session-threads" },
            provided_model_name: "gpt-5.4",
            internal_model_id: null,
            model_parameters: "{}",
            provided_usage_details: {},
            usage_details: {},
            provided_cost_details: {},
            cost_details: {},
            total_cost: null,
            prompt_id: null,
            prompt_name: null,
            prompt_version: null,
            created_at: startedAt,
            updated_at: startedAt,
            event_ts: startedAt,
          });
          observations.push(observation);
          return {
            id: observation.id,
            traceId,
            parentObservationId: null,
            type: "GENERATION" as const,
            name,
            startTime: new Date(startTime),
            endTime: new Date(startTime + 1000),
            input,
            output,
            metadata: {},
          };
        });
        const transcript = assembleTranscript(orderObservations(generations));
        const visibleThreads = transcript?.threads.filter(
          ({ currentTurn }) => currentTurn.nestingLevel === 0,
        );
        if (visibleThreads?.length !== threadCount) {
          throw new SeedError(
            `${traceId}: expected ${threadCount} visible threads, got ${visibleThreads?.length ?? 0}`,
          );
        }
        threadCounts[traceId] = visibleThreads.length;
      }
    }

    const events = [];
    if (params["v4"]) {
      events.push(...traces.map(traceToEvent));
      for (const observation of observations) {
        const trace = traces.find(({ id }) => id === observation.trace_id)!;
        events.push(observationToEvent(observation, trace));
      }
    }
    const verified: Record<string, number> = {};
    if (!ctx.dryRun) {
      // Session detail routes also require the Postgres session row.
      for (const sessionId of sessionIds) {
        await prisma.traceSession.upsert({
          where: { id_projectId: { id: sessionId, projectId: ctx.projectId } },
          update: {},
          create: {
            id: sessionId,
            projectId: ctx.projectId,
            environment: ctx.environment,
            createdAt: new Date(sessionStart),
          },
        });
      }
      await createTracesCh(traces);
      await createObservationsCh(observations);
      if (events.length > 0) await createEventsCh(events);
      for (const [table, expected, column] of [
        ["traces", traces.length, "id"],
        ["observations", observations.length, "id"],
        ["events_full", events.length, "span_id"],
      ] as const) {
        if (table === "events_full" && !params["v4"]) continue;
        const actual = await countRows(
          table,
          `project_id = {projectId: String} AND ${table === "traces" ? "id" : "trace_id"} IN {traceIds: Array(String)}`,
          { projectId: ctx.projectId, traceIds: traces.map(({ id }) => id) },
          `uniqExact(${column})`,
        );
        verified[table] = actual;
        if (actual < expected) {
          throw new SeedError(
            `${table}: expected ${expected} rows, got ${actual}`,
          );
        }
      }
    }
    ctx.log(
      `Verified visible threads per trace: ${JSON.stringify(threadCounts)}`,
    );
    return {
      scenario: "session-threads",
      target: "clickhouse",
      params,
      projectId: ctx.projectId,
      environment: ctx.environment,
      traceIds: traces.map(({ id }) => id),
      sessionIds,
      counts: {
        sessions: sessionIds.length,
        traces: traces.length,
        observations: observations.length,
        events: events.length,
      },
      verified,
      links: sessionIds.map((id) => sessionLink(ctx, id)),
      dryRun: ctx.dryRun,
      durationMs: Date.now() - startedAt,
    };
  },
};
