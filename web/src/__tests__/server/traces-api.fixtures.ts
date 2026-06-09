import {
  createObservation,
  createTraceScore,
  createSessionScore,
  createScoresCh,
  createTrace,
  getTraceById,
  createEvent,
  createOrgProjectAndApiKey,
  type EventRecordInsertType,
} from "@langfuse/shared/src/server";
import {
  createObservationsCh,
  createTracesCh,
  createEventsCh,
} from "@langfuse/shared/src/server";
import {
  makeZodVerifiedAPICall,
  makeZodVerifiedAPICallSilent,
} from "@/src/__tests__/test-utils";
import {
  DeleteTracesV1Response,
  DeleteTraceV1Response,
  GetTracesV1Response,
  GetTraceV1Response,
} from "@/src/features/public-api/types/traces";
import { randomUUID } from "crypto";
import snakeCase from "lodash/snakeCase";
import { env } from "@/src/env.mjs";
import waitForExpect from "wait-for-expect";

// Helper type for creating observation/event data
// Times are always in milliseconds, conversion handled internally
export type ObservationEventData = {
  id?: string;
  trace_id: string;
  project_id: string;
  name: string;
  type?: string;
  level?: string;
  start_time: number; // milliseconds
  end_time?: number | null; // milliseconds
  input?: string | null;
  output?: string | null;
  metadata?: Record<string, any>;
  provided_model_name?: string;
  provided_usage_details?: Record<string, number>;
  provided_cost_details?: Record<string, number>;
  usage_details?: Record<string, number>;
  cost_details?: Record<string, number>;
  total_cost?: number;
};

// Helper to create observation/event data in the appropriate format
// Handles time conversion internally: milliseconds -> microseconds for events table
export const createObservationOrEvent = (
  useEventsTable: boolean,
  data: ObservationEventData & Partial<EventRecordInsertType>,
) => {
  const id = data.id ?? randomUUID();
  const timeMultiplier = useEventsTable ? 1000 : 1; // microseconds vs milliseconds

  if (useEventsTable) {
    // For events table: microseconds, requires span_id
    return createEvent({
      ...data,
      id,
      span_id: id,
      parent_span_id: data.trace_id, // Observations have trace as parent
      type: data.type ?? "SPAN",
      level: data.level ?? "DEFAULT",
      start_time: data.start_time * timeMultiplier, // Convert ms to microseconds
      end_time:
        data.end_time === null
          ? null
          : data.end_time
            ? data.end_time * timeMultiplier
            : null,
    });
  } else {
    // For observations table: milliseconds
    return createObservation({
      id,
      trace_id: data.trace_id,
      project_id: data.project_id,
      name: data.name,
      type: data.type ?? "SPAN",
      level: data.level ?? "DEFAULT",
      start_time: data.start_time,
      end_time: data.end_time === null ? null : data.end_time,
      input: data.input,
      output: data.output,
      metadata: data.metadata,
      provided_model_name: data.provided_model_name,
      provided_usage_details: data.provided_usage_details,
      provided_cost_details: data.provided_cost_details,
      total_cost: data.total_cost,
    });
  }
};

export const waitForEventsTable = async (useEventsTable: boolean) => {
  if (useEventsTable) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

export const createFieldsFilteringFixture = (projectId: string) => {
  const traceId = randomUUID();
  const createdTrace = createTrace({
    id: traceId,
    name: "trace-with-all-fields",
    user_id: "user-1",
    project_id: projectId,
    metadata: { key: "value" },
    input: JSON.stringify({ prompt: "test" }),
    output: JSON.stringify({ response: "test response" }),
    release: "1.0.0",
    version: "2.0.0",
  });

  const observation = createObservation({
    trace_id: traceId,
    project_id: projectId,
    name: "test-observation",
    end_time: new Date().getTime(),
    start_time: new Date().getTime() - 1000,
    input: "observation input",
    output: "observation output",
  });

  const score = createTraceScore({
    trace_id: traceId,
    project_id: projectId,
    name: "test-score",
    value: 0.8,
  });

  return { createdTrace, observation, score, traceId };
};

// Helper to create trace with observations/events
export const createTraceWithObservations = async (
  useEventsTable: boolean,
  trace: ReturnType<typeof createTrace>,
  observations: ObservationEventData[],
) => {
  await createTracesCh([trace]);

  if (useEventsTable) {
    // For events table: create root trace event + observation events
    const id = randomUUID();
    const rootTraceEvent = createEvent({
      id: id,
      span_id: id, // Root trace event has no span_id
      parent_span_id: null, // Root trace event - this is key!
      trace_id: trace.id,
      project_id: trace.project_id,
      name: trace.name ?? "trace",
      trace_name: trace.name ?? "trace",
      type: "GENERATION", // Trace events are typically GENERATION type
      start_time: trace.timestamp * 1000, // Convert ms to microseconds
      end_time: null,
      environment: trace.environment ?? "default",
      version: trace.version ?? null,
      session_id: trace.session_id ?? null,
      user_id: trace.user_id ?? null,
      input: trace.input ?? null,
      output: trace.output ?? null,
      metadata_names: Object.keys(trace.metadata ?? {}) ?? [],
      metadata_values: Object.values(trace.metadata ?? {}) ?? [],
      cost_details: {
        total: 0, // Root trace event has no cost
      },
    });

    const observationEvents = observations.map((obs) =>
      createObservationOrEvent(useEventsTable, {
        ...obs,
        environment: rootTraceEvent.environment,
        user_id: rootTraceEvent.user_id,
        session_id: rootTraceEvent.session_id,
        trace_name: rootTraceEvent.name,
      }),
    );

    await createEventsCh([rootTraceEvent, ...observationEvents] as any);
  } else {
    // For observations table: just create observations
    const data = observations.map((obs) =>
      createObservationOrEvent(useEventsTable, obs),
    );
    await createObservationsCh(data as any);
  }
};

export {
  createObservation,
  createTraceScore,
  createSessionScore,
  createScoresCh,
  createTrace,
  getTraceById,
  createEvent,
  createOrgProjectAndApiKey,
  createObservationsCh,
  createTracesCh,
  createEventsCh,
  makeZodVerifiedAPICall,
  makeZodVerifiedAPICallSilent,
  DeleteTracesV1Response,
  DeleteTraceV1Response,
  GetTracesV1Response,
  GetTraceV1Response,
  randomUUID,
  snakeCase,
  env,
  waitForExpect,
};
export type { EventRecordInsertType };
