import {
  createTrace,
  createObservation,
  createTraceScore,
  createEvent,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
  createEventsCh,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import waitForExpect from "wait-for-expect";

export interface GeneratedTrace {
  id: string;
  name: string;
  environment: string;
  userId: string;
  sessionId: string;
  release: string;
  version: string;
  tags: string[];
  timestamp: number;
}

interface GeneratedObservation {
  id: string;
  traceId: string;
  type: "SPAN" | "GENERATION" | "EVENT";
  name: string;
  providedModelName: string;
  startTime: number;
  endTime: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
}

interface GeneratedScore {
  id: string;
  traceId: string;
  name: string;
  source: "API" | "ANNOTATION" | "EVAL";
  dataType: "NUMERIC" | "CATEGORICAL";
  value: number;
  stringValue: string;
  timestamp: number;
}

interface GeneratedData {
  traces: GeneratedTrace[];
  observations: GeneratedObservation[];
  scores?: GeneratedScore[];
}

/**
 * Quick insert of generated test data to both v1 and v2 tables
 */
export const insertTestData = async (
  projectId: string,
  data: GeneratedData,
): Promise<void> => {
  const { traces, observations, scores = [] } = data;

  // Convert to v1 trace format
  const v1Traces = traces.map((t) =>
    createTrace({
      id: t.id,
      project_id: projectId,
      name: t.name,
      environment: t.environment,
      user_id: t.userId,
      session_id: t.sessionId,
      release: t.release,
      version: t.version,
      tags: t.tags,
      timestamp: t.timestamp,
      created_at: t.timestamp,
      updated_at: t.timestamp,
      event_ts: t.timestamp,
    }),
  );

  // Convert to v1 observation format
  const v1Observations = observations.map((o) =>
    createObservation({
      id: o.id,
      project_id: projectId,
      trace_id: o.traceId,
      type: o.type,
      name: o.name,
      environment:
        traces.find((t) => t.id === o.traceId)?.environment ?? "default",
      start_time: o.startTime,
      end_time: o.endTime,
      completion_start_time: null,
      prompt_id: null,
      prompt_name: null,
      prompt_version: null,
      provided_model_name: o.providedModelName,
      usage_details: {
        input: o.inputTokens,
        output: o.outputTokens,
        total: o.totalTokens,
      },
      cost_details: {
        input: o.totalCost * 0.3,
        output: o.totalCost * 0.7,
        total: o.totalCost,
      },
      total_cost: o.totalCost,
      created_at: o.startTime,
      updated_at: o.startTime,
      event_ts: o.startTime,
    }),
  );

  // Convert to v2 event format: trace-level events + observation-level events
  // Following production convention from handleEventPropagationJob.ts
  const v2TraceEvents = traces.map((t) =>
    createEvent({
      id: `t-${t.id}`,
      span_id: `t-${t.id}`,
      parent_span_id: "",
      trace_id: t.id,
      project_id: projectId,
      type: "SPAN",
      name: t.name,
      environment: t.environment,
      user_id: t.userId,
      session_id: t.sessionId,
      tags: t.tags,
      release: t.release,
      version: t.version,
      trace_name: t.name,
      provided_model_name: "",
      usage_details: {},
      provided_usage_details: {},
      cost_details: {},
      provided_cost_details: {},
      start_time: t.timestamp * 1000, // ms → µs
      end_time: t.timestamp * 1000,
      created_at: t.timestamp * 1000,
      updated_at: t.timestamp * 1000,
      event_ts: t.timestamp * 1000,
    }),
  );

  const v2ObservationEvents = observations.map((o) => {
    const trace = traces.find((t) => t.id === o.traceId);
    return createEvent({
      id: o.id,
      span_id: o.id,
      parent_span_id: `t-${o.traceId}`,
      trace_id: o.traceId,
      project_id: projectId,
      type: o.type,
      name: o.name,
      environment: trace?.environment ?? "default",
      start_time: o.startTime * 1000, // ms → µs
      end_time: o.endTime * 1000,
      provided_model_name: o.providedModelName,
      user_id: trace?.userId ?? "",
      session_id: trace?.sessionId ?? "",
      tags: trace?.tags ?? [],
      release: trace?.release ?? "",
      version: trace?.version ?? "",
      trace_name: trace?.name ?? "",
      usage_details: {
        input: o.inputTokens,
        output: o.outputTokens,
        total: o.totalTokens,
      },
      cost_details: {
        input: o.totalCost * 0.3,
        output: o.totalCost * 0.7,
        total: o.totalCost,
      },
      total_cost: o.totalCost,
      created_at: o.startTime * 1000,
      updated_at: o.startTime * 1000,
      event_ts: o.startTime * 1000,
    });
  });

  // Convert to score format
  // Note: createTraceScore hardcodes session_id: null after spread,
  // so we override it after the factory call.
  const v1Scores = scores.map((s) => {
    const trace = traces.find((t) => t.id === s.traceId);
    const score = createTraceScore({
      id: s.id,
      project_id: projectId,
      trace_id: s.traceId,
      name: s.name,
      source: s.source,
      data_type: s.dataType,
      value: s.dataType === "NUMERIC" ? s.value : 0,
      string_value: s.dataType === "CATEGORICAL" ? s.stringValue : "",
      timestamp: s.timestamp,
      environment: trace?.environment ?? "default",
      created_at: s.timestamp,
      updated_at: s.timestamp,
      event_ts: s.timestamp,
    });
    return { ...score, session_id: trace?.sessionId ?? null };
  });

  // Account for fast-check shrinking duplicate IDs to the same value
  const uniqueTraceCount = new Set(traces.map((t) => t.id)).size;
  const uniqueEventSpanIds = new Set([
    ...traces.map((t) => `t-${t.id}`),
    ...observations.map((o) => o.id),
  ]).size;
  const uniqueScoreCount = new Set(scores.map((s) => s.id)).size;

  // Insert to ClickHouse (both v1 and v2 tables)
  await Promise.all([
    createTracesCh(v1Traces),
    createObservationsCh(v1Observations),
    createEventsCh([...v2TraceEvents, ...v2ObservationEvents]),
    scores.length > 0 ? createScoresCh(v1Scores) : Promise.resolve(),
  ]);

  // Poll ClickHouse until all data is confirmed ready
  await waitForExpect(
    async () => {
      const [traceResult, eventResult, scoreResult] = await Promise.all([
        queryClickhouse<{ count: string }>({
          query: `SELECT count() as count FROM traces WHERE project_id = {projectId: String}`,
          params: { projectId },
        }),
        queryClickhouse<{ count: string }>({
          query: `SELECT count() as count FROM events_core WHERE project_id = {projectId: String}`,
          params: { projectId },
        }),
        scores.length > 0
          ? queryClickhouse<{ count: string }>({
              query: `SELECT count() as count FROM scores WHERE project_id = {projectId: String}`,
              params: { projectId },
            })
          : Promise.resolve([{ count: "0" }]),
      ]);

      expect(Number(traceResult[0].count)).toBeGreaterThanOrEqual(
        uniqueTraceCount,
      );
      expect(Number(eventResult[0].count)).toBeGreaterThanOrEqual(
        uniqueEventSpanIds,
      );
      if (scores.length > 0) {
        expect(Number(scoreResult[0].count)).toBeGreaterThanOrEqual(
          uniqueScoreCount,
        );
      }
    },
    10000,
    200,
  );
};
