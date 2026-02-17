import {
  createTrace,
  createObservation,
  createTraceScore,
  createEvent,
  createTracesCh,
  createObservationsCh,
  createScoresCh,
  createEventsCh,
} from "@langfuse/shared/src/server";

interface GeneratedTrace {
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

  // Convert to v2 event format
  const v2Events = observations.map((o) => {
    const trace = traces.find((t) => t.id === o.traceId);
    return createEvent({
      id: o.id,
      span_id: o.id,
      trace_id: o.traceId,
      project_id: projectId,
      type: o.type,
      name: o.name,
      environment: trace?.environment ?? "default",
      start_time: o.startTime * 1000, // microseconds
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
  const v1Scores = scores.map((s) =>
    createTraceScore({
      id: s.id,
      project_id: projectId,
      trace_id: s.traceId,
      name: s.name,
      source: s.source,
      data_type: s.dataType,
      value: s.dataType === "NUMERIC" ? s.value : 0,
      string_value: s.dataType === "CATEGORICAL" ? s.stringValue : "",
      timestamp: s.timestamp,
      environment:
        traces.find((t) => t.id === s.traceId)?.environment ?? "default",
      created_at: s.timestamp,
      updated_at: s.timestamp,
      event_ts: s.timestamp,
    }),
  );

  // Insert to ClickHouse (both v1 and v2 tables)
  await Promise.all([
    createTracesCh(v1Traces),
    createObservationsCh(v1Observations),
    createEventsCh(v2Events),
    scores.length > 0 ? createScoresCh(v1Scores) : Promise.resolve(),
  ]);

  // Small wait for ClickHouse to process
  await new Promise((resolve) => setTimeout(resolve, 100));
};
