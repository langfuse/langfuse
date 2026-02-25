import {
  createObservation,
  createTraceScore,
  createSessionScore,
  createScoresCh,
  createTrace,
  getTraceById,
  createEvent,
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

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

// Helper type for creating observation/event data
// Times are always in milliseconds, conversion handled internally
type ObservationEventData = {
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
const createObservationOrEvent = (
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

// Helper to create trace with observations/events
const createTraceWithObservations = async (
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
      metadata: trace.metadata ?? {},
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

describe("/api/public/traces API Endpoint", () => {
  it("should create and get a trace via /traces", async () => {
    const createdTrace = createTrace({
      name: "trace-name",
      user_id: "user-1",
      project_id: projectId,
      metadata: { key: "value" },
      release: "1.0.0",
      version: "2.0.0",
    });

    const observations = [
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 1000,
        input: "input",
        output: "output",
      }),
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name-2",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 100000,
        input: "input-2",
        output: "output-2",
      }),
    ];

    await createTracesCh([createdTrace]);
    await createObservationsCh(observations);

    const trace = await makeZodVerifiedAPICall(
      GetTraceV1Response,
      "GET",
      "/api/public/traces/" + createdTrace.id,
    );

    expect(trace.body.name).toBe("trace-name");
    expect(trace.body.release).toBe("1.0.0");
    expect(trace.body.externalId).toBeNull();
    expect(trace.body.version).toBe("2.0.0");
    expect(trace.body.projectId).toBe(projectId);
    expect(trace.body.latency).toBeCloseTo(100, 2);
    expect(trace.body.observations.length).toBe(2);
    expect(trace.body.scores.length).toBe(0);
    expect(trace.body.observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "observation-name-2",
          input: "input-2",
          output: "output-2",
        }),
        expect.objectContaining({
          name: "observation-name",
          input: "input",
          output: "output",
        }),
      ]),
    );
  });

  it("should fetch all traces", async () => {
    const timestamp = new Date();
    const createdTrace = createTrace({
      name: "trace-name",
      user_id: "user-1",
      timestamp: timestamp.getTime(),
      project_id: projectId,
      metadata: { key: "value", jsonKey: JSON.stringify({ foo: "bar" }) },
      release: "1.0.0",
      version: "2.0.0",
    });

    const observations = [
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name",
        end_time: timestamp.getTime(),
        start_time: timestamp.getTime() - 1000,
        input: "input",
        output: "output",
      }),
      createObservation({
        trace_id: createdTrace.id,
        project_id: createdTrace.project_id,
        name: "observation-name-2",
        end_time: timestamp.getTime(),
        start_time: timestamp.getTime() - 100000,
        input: "input-2",
        output: "output-2",
      }),
    ];

    await createTracesCh([createdTrace]);
    await createObservationsCh(observations);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      "/api/public/traces",
    );

    expect(traces.body.meta.totalItems).toBeGreaterThanOrEqual(1);
    expect(traces.body.data.length).toBeGreaterThanOrEqual(1);
    const trace = traces.body.data.find((t) => t.id === createdTrace.id);
    expect(trace).toBeTruthy();
    if (!trace) {
      return; // to satisfy TypeScript
    }
    expect(trace.name).toBe("trace-name");
    expect(trace.release).toBe("1.0.0");
    expect(trace.metadata.key).toBe("value");
    expect(trace.metadata.jsonKey).toEqual({ foo: "bar" });
    expect(trace.externalId).toBeNull();
    expect(trace.version).toBe("2.0.0");
    expect(trace.projectId).toBe(projectId);
    expect(trace.latency).toBe(100);
    expect(trace.observations?.length).toBe(2);
    expect(trace.scores?.length).toBe(0);
    expect(trace.timestamp).toBe(timestamp.toISOString());
  });

  it.each([
    ["userId", randomUUID()],
    ["sessionId", randomUUID()],
    ["release", randomUUID()],
    ["version", randomUUID()],
    ["name", randomUUID()],
    ["environment", randomUUID()],
  ])(
    "should fetch all traces filtered by a value (%s, %s)",
    async (prop: string, value: string) => {
      const createdTrace = createTrace({
        [snakeCase(prop)]: value,
        project_id: projectId,
        metadata: { key: "value" },
      });

      // Create a trace in the project that should not be returned
      const dummyTrace = createTrace({
        project_id: projectId,
        metadata: { key: "value" },
      });

      await createTracesCh([createdTrace, dummyTrace]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        `/api/public/traces?${prop}=${value}`,
      );

      expect(traces.body.meta.totalItems).toBe(1);
      expect(traces.body.data.length).toBe(1);
      const trace = traces.body.data[0];
      expect(trace.projectId).toBe(projectId);
      expect((trace as any)[prop]).toBe(value);
    },
  );

  it("should fetch all traces, observations, and scores filtered by environment", async () => {
    const environment = randomUUID();
    const traceId = randomUUID();
    const createdTrace = createTrace({
      id: traceId,
      name: "trace-name",
      project_id: projectId,
      metadata: { key: "value" },
      environment,
    });

    await createTracesCh([createdTrace]);

    await createObservationsCh([
      createObservation({
        trace_id: traceId,
        environment,
        project_id: projectId,
      }),
      // Create one that does not belong to the same environment
      createObservation({
        trace_id: traceId,
        environment: "default",
        project_id: projectId,
      }),
    ]);

    await createScoresCh([
      createTraceScore({
        trace_id: traceId,
        environment,
        project_id: projectId,
      }),
      // Create one that does not belong to the same environment
      createTraceScore({
        trace_id: traceId,
        environment: "default",
        project_id: projectId,
      }),
    ]);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?environment=${environment}`,
    );

    expect(traces.body.meta.totalItems).toBe(1);
    expect(traces.body.data.length).toBe(1);
    const trace = traces.body.data[0];
    expect(trace.projectId).toBe(projectId);
    expect(trace.observations?.length).toBe(1);
    expect(trace.scores?.length).toBe(1);
  });

  it("should fetch traces with trace scores only", async () => {
    const environment = randomUUID();
    const traceId = randomUUID();
    const createdTrace = createTrace({
      id: traceId,
      name: "trace-name",
      project_id: projectId,
      metadata: { key: "value" },
      environment,
    });

    await createTracesCh([createdTrace]);

    await createObservationsCh([
      createObservation({
        trace_id: traceId,
        environment,
        project_id: projectId,
      }),
      // Create one that does not belong to the same environment
      createObservation({
        trace_id: traceId,
        environment: "default",
        project_id: projectId,
      }),
    ]);

    await createScoresCh([
      createTraceScore({
        trace_id: traceId,
        environment,
        project_id: projectId,
      }),
      // Create one that does not belong to the same environment
      createTraceScore({
        trace_id: traceId,
        environment: "default",
        project_id: projectId,
      }),
      createSessionScore({
        session_id: randomUUID(),
        environment,
        project_id: projectId,
      }),
    ]);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?environment=${environment}`,
    );

    expect(traces.body.meta.totalItems).toBe(1);
    expect(traces.body.data.length).toBe(1);
    const trace = traces.body.data[0];
    expect(trace.projectId).toBe(projectId);
    expect(trace.observations?.length).toBe(1);
    // Despite having the correct environment, the session score is not included in the response
    expect(trace.scores?.length).toBe(1);
  });

  it("should fetch all traces filtered by a tag", async () => {
    const tag = randomUUID();
    const createdTrace = createTrace({
      name: "trace-name",
      project_id: projectId,
      metadata: { key: "value" },
      tags: [tag],
    });

    await createTracesCh([createdTrace]);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?tags=${[tag]}`,
    );

    expect(traces.body.meta.totalItems).toBe(1);
    expect(traces.body.data.length).toBe(1);
    const trace = traces.body.data[0];
    expect(trace.projectId).toBe(projectId);
  });

  it("should fetch all traces with pagination", async () => {
    const tag = randomUUID();
    const createdTrace1 = createTrace({
      name: "trace-name",
      project_id: projectId,
      metadata: { key: "value" },
      tags: [tag],
    });
    const createdTrace2 = createTrace({
      name: "trace-name",
      project_id: projectId,
      metadata: { key: "value" },
      tags: [tag],
    });
    const createdTrace3 = createTrace({
      name: "trace-name",
      project_id: projectId,
      metadata: { key: "value" },
      tags: [tag],
    });

    await createTracesCh([createdTrace1, createdTrace2, createdTrace3]);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?tags=${[tag]}&limit=1&offset=1`,
    );

    expect(traces.body.meta.totalItems).toBe(3);
    expect(traces.body.data.length).toBe(1);
    expect(traces.body.meta.totalPages).toBe(3);
    const trace = traces.body.data[0];
    expect(trace.projectId).toBe(projectId);
  });

  it("should fetch all traces with custom order", async () => {
    const tag = randomUUID();
    const createdTrace1 = createTrace({
      name: "trace-name1",
      project_id: projectId,
      metadata: { key: "value" },
      tags: [tag],
    });
    const createdTrace2 = createTrace({
      name: "trace-name2",
      project_id: projectId,
      metadata: { key: "value" },
      tags: [tag],
    });

    await createTracesCh([createdTrace1, createdTrace2]);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces?tags=${[tag]}&orderBy=name.desc`,
    );

    expect(traces.body.meta.totalItems).toBe(2);
    expect(traces.body.data.length).toBe(2);
    const trace1 = traces.body.data[0];
    expect(trace1.name).toBe("trace-name2");
    const trace2 = traces.body.data[1];
    expect(trace2.name).toBe("trace-name1");
  });

  it("should return 400 error when page=0", async () => {
    const response = await makeZodVerifiedAPICallSilent(
      GetTracesV1Response,
      "GET",
      "/api/public/traces?page=0&limit=10",
    );

    expect(response.status).toBe(400);
  });

  it("should return 400 error when page=0", async () => {
    const response = await makeZodVerifiedAPICallSilent(
      GetTracesV1Response,
      "GET",
      "/api/public/traces?page=0&limit=10",
    );

    expect(response.status).toBe(400);
  });

  it("LFE-3699: should fetch a single trace with unescaped metadata via traces list", async () => {
    const traceId = randomUUID();
    const trace = createTrace({
      id: traceId,
      name: "trace-name1",
      project_id: projectId,
      metadata: { key: JSON.stringify({ foo: "bar" }) },
      input: JSON.stringify({
        args: [
          {
            foo: "bar",
          },
        ],
      }),
    });

    await createTracesCh([trace]);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      `/api/public/traces`,
    );

    const traceResponse = traces.body.data.find((t) => t.id === traceId);
    expect(traceResponse).toBeDefined();
    expect(traceResponse!.name).toBe("trace-name1");
    expect(traceResponse!.metadata).toEqual({ key: { foo: "bar" } });
    expect(traceResponse!.input).toEqual({
      args: [
        {
          foo: "bar",
        },
      ],
    });
  });

  it("LFE-3699: should fetch a single trace with unescaped metadata via single trace endpoint", async () => {
    const traceId = randomUUID();
    const trace = createTrace({
      id: traceId,
      name: "trace-name1",
      project_id: projectId,
      metadata: { key: JSON.stringify({ foo: "bar" }) },
      input: JSON.stringify({
        args: [
          {
            foo: "bar",
          },
        ],
      }),
    });

    await createTracesCh([trace]);

    const traceResponse = await makeZodVerifiedAPICall(
      GetTraceV1Response,
      "GET",
      `/api/public/traces/${traceId}`,
    );

    expect(traceResponse.body.name).toBe("trace-name1");
    expect(traceResponse.body.metadata).toEqual({ key: { foo: "bar" } });
    expect(traceResponse.body.input).toEqual({
      args: [
        {
          foo: "bar",
        },
      ],
    });
  });

  it("should return 5XX if observations are too large when fetching single trace", async () => {
    // See LFE-4882 for context
    const traceId = randomUUID();
    const trace = createTrace({
      id: traceId,
      name: "trace-name1",
      project_id: projectId,
      metadata: { key: JSON.stringify({ foo: "bar" }) },
      input: JSON.stringify({
        args: [
          {
            foo: "bar",
          },
        ],
      }),
    });

    await createTracesCh([trace]);
    await createObservationsCh([
      createObservation({
        trace_id: traceId,
        project_id: projectId,
        input: "a".repeat(30e6),
        output: "b".repeat(30e6),
        metadata: {
          foo: "c".repeat(30e6),
        },
      }),
    ]);
    await createObservationsCh([
      createObservation({
        trace_id: traceId,
        project_id: projectId,
        input: "a".repeat(30e6),
        output: "b".repeat(30e6),
        metadata: {
          foo: "c".repeat(30e6),
        },
      }),
    ]);

    await expect(
      makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${traceId}`,
      ),
    ).rejects.toThrow(
      "Observations in trace are too large: 90.00MB exceeds limit of 80.00MB",
    );
  });

  it("should delete a single trace via DELETE /traces/:traceId", async () => {
    // Setup
    const createdTrace = createTrace({
      name: "trace-to-delete",
      project_id: projectId,
    });
    await createTracesCh([createdTrace]);

    // When
    const deleteResponse = await makeZodVerifiedAPICall(
      DeleteTraceV1Response,
      "DELETE",
      `/api/public/traces/${createdTrace.id}`,
    );

    // Then
    expect(deleteResponse.status).toBe(200);
    await waitForExpect(async () => {
      const trace = await getTraceById({ traceId: createdTrace.id, projectId });
      expect(trace).toBeUndefined();
    }, 10_000);
  }, 10_000);

  it("should delete multiple traces via DELETE /traces", async () => {
    // Setup
    const createdTrace1 = createTrace({
      name: "trace-to-delete-1",
      project_id: projectId,
    });
    const createdTrace2 = createTrace({
      name: "trace-to-delete-2",
      project_id: projectId,
    });
    await createTracesCh([createdTrace1, createdTrace2]);

    // When
    const deleteResponse = await makeZodVerifiedAPICall(
      DeleteTracesV1Response,
      "DELETE",
      `/api/public/traces`,
      {
        traceIds: [createdTrace1.id, createdTrace2.id],
      },
    );

    // Then
    expect(deleteResponse.status).toBe(200);
    await waitForExpect(async () => {
      const trace1 = await getTraceById({
        traceId: createdTrace1.id,
        projectId,
      });
      expect(trace1).toBeUndefined();
      const trace2 = await getTraceById({
        traceId: createdTrace2.id,
        projectId,
      });
      expect(trace2).toBeUndefined();
    }, 40_000);
  }, 60_000);

  describe("Fields Filtering", () => {
    it("should fetch traces with all fields by default", async () => {
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

      await createTracesCh([createdTrace]);
      await createObservationsCh([observation]);
      await createScoresCh([score]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces",
      );

      const trace = traces.body.data.find((t) => t.id === traceId);
      expect(trace).toBeTruthy();
      if (!trace) return;

      // All fields should be present by default
      expect(trace.input).toEqual({ prompt: "test" });
      expect(trace.output).toEqual({ response: "test response" });
      expect(trace.metadata).toEqual({ key: "value" });
      expect(trace.observations).toHaveLength(1);
      expect(trace.scores).toHaveLength(1);
      expect(trace.totalCost).toBeDefined();
      expect(trace.latency).toBeCloseTo(1);
    });

    it("should fetch traces with only core fields when fields=core", async () => {
      const traceId = randomUUID();
      const createdTrace = createTrace({
        id: traceId,
        name: "trace-core-only",
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
      });

      const score = createTraceScore({
        trace_id: traceId,
        project_id: projectId,
        name: "test-score",
        value: 0.8,
      });

      await createTracesCh([createdTrace]);
      await createObservationsCh([observation]);
      await createScoresCh([score]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core",
      );

      const trace = traces.body.data.find((t) => t.id === traceId);
      expect(trace).toBeTruthy();
      if (!trace) return;

      // Core fields should be present
      expect(trace.id).toBe(traceId);
      expect(trace.name).toBe("trace-core-only");
      expect(trace.userId).toBe("user-1");
      expect(trace.projectId).toBe(projectId);
      expect(trace.release).toBe("1.0.0");
      expect(trace.version).toBe("2.0.0");

      // Non-core fields should have default values
      expect(trace.input).toBeNull();
      expect(trace.output).toBeNull();
      expect(trace.metadata).toEqual({});
      expect(trace.observations).toEqual([]);
      expect(trace.scores).toEqual([]);
      expect(trace.totalCost).toBe(-1);
      expect(trace.latency).toBe(-1);
    });

    it("should fetch traces with IO fields when fields=core,io", async () => {
      const traceId = randomUUID();
      const createdTrace = createTrace({
        id: traceId,
        name: "trace-with-io",
        user_id: "user-1",
        project_id: projectId,
        metadata: { key: "value" },
        input: JSON.stringify({ prompt: "test" }),
        output: JSON.stringify({ response: "test response" }),
      });

      await createTracesCh([createdTrace]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core,io",
      );

      const trace = traces.body.data.find((t) => t.id === traceId);
      expect(trace).toBeTruthy();
      if (!trace) return;

      // Core and IO fields should be present
      expect(trace.id).toBe(traceId);
      expect(trace.name).toBe("trace-with-io");
      expect(trace.input).toEqual({ prompt: "test" });
      expect(trace.output).toEqual({ response: "test response" });
      expect(trace.metadata).toEqual({ key: "value" });

      // Other fields should have default values
      expect(trace.observations).toEqual([]);
      expect(trace.scores).toEqual([]);
      expect(trace.totalCost).toBe(-1);
      expect(trace.latency).toBe(-1);
    });

    it("should fetch traces with scores when fields=core,scores", async () => {
      const traceId = randomUUID();
      const createdTrace = createTrace({
        id: traceId,
        name: "trace-with-scores",
        project_id: projectId,
      });

      const score = createTraceScore({
        trace_id: traceId,
        project_id: projectId,
        name: "test-score",
        value: 0.8,
      });

      await createTracesCh([createdTrace]);
      await createScoresCh([score]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core,scores",
      );

      const trace = traces.body.data.find((t) => t.id === traceId);
      expect(trace).toBeTruthy();
      if (!trace) return;

      // Core fields and scores should be present
      expect(trace.id).toBe(traceId);
      expect(trace.scores).toHaveLength(1);

      // Other fields should have default values
      expect(trace.input).toBeNull();
      expect(trace.output).toBeNull();
      expect(trace.metadata).toEqual({});
      expect(trace.observations).toEqual([]);
      expect(trace.totalCost).toBe(-1);
      expect(trace.latency).toBe(-1);
    });

    it("should fetch traces with observations when fields=core,observations", async () => {
      const traceId = randomUUID();
      const createdTrace = createTrace({
        id: traceId,
        name: "trace-with-observations",
        project_id: projectId,
      });

      const observation = createObservation({
        trace_id: traceId,
        project_id: projectId,
        name: "test-observation",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 1000,
      });

      await createTracesCh([createdTrace]);
      await createObservationsCh([observation]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core,observations",
      );

      const trace = traces.body.data.find((t) => t.id === traceId);
      expect(trace).toBeTruthy();
      if (!trace) return;

      // Core fields and observations should be present
      expect(trace.id).toBe(traceId);
      expect(trace.observations).toHaveLength(1);

      // Other fields should have default values
      expect(trace.input).toBeNull();
      expect(trace.output).toBeNull();
      expect(trace.metadata).toEqual({});
      expect(trace.scores).toEqual([]);
      expect(trace.totalCost).toBe(-1);
      expect(trace.latency).toBe(-1);
    });

    it("should fetch traces with metrics when fields=core,metrics", async () => {
      const traceId = randomUUID();
      const createdTrace = createTrace({
        id: traceId,
        name: "trace-with-metrics",
        project_id: projectId,
      });

      const observation = createObservation({
        trace_id: traceId,
        project_id: projectId,
        name: "test-observation",
        end_time: new Date().getTime(),
        start_time: new Date().getTime() - 1000,
        total_cost: 0.05,
      });

      await createTracesCh([createdTrace]);
      await createObservationsCh([observation]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core,metrics",
      );

      const trace = traces.body.data.find((t) => t.id === traceId);
      expect(trace).toBeTruthy();
      if (!trace) return;

      // Core fields and metrics should be present
      expect(trace.id).toBe(traceId);
      expect(trace.totalCost).toBe(0.05);
      expect(trace.latency).toBeCloseTo(1);

      // Other fields should have default values
      expect(trace.input).toBeNull();
      expect(trace.output).toBeNull();
      expect(trace.metadata).toEqual({});
      expect(trace.observations).toEqual([]);
      expect(trace.scores).toEqual([]);
    });

    it("should handle invalid field names gracefully", async () => {
      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core,invalid,scores",
      );

      // Should still work, just ignoring invalid field names
      expect(traces.status).toBe(200);
      expect(traces.body.data).toBeDefined();
    });

    it("should handle empty fields parameter", async () => {
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

      await createTracesCh([createdTrace]);
      await createObservationsCh([observation]);
      await createScoresCh([score]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=",
      );

      // Should default to all fields when empty
      expect(traces.status).toBe(200);
      expect(traces.body.data).toBeDefined();

      const trace = traces.body.data.find((t) => t.id === traceId);
      expect(trace).toBeTruthy();
      if (!trace) return;

      // All fields should be present
      expect(trace.input).toEqual({ prompt: "test" });
      expect(trace.output).toEqual({ response: "test response" });
      expect(trace.metadata).toEqual({ key: "value" });
      expect(trace.observations).toHaveLength(1);
      expect(trace.scores).toHaveLength(1);
      expect(trace.totalCost).toBeDefined();
      expect(trace.latency).toBeDefined();
    });
  });

  describe("Advanced Filtering - Dual Path Tests", () => {
    const runTestSuite = (useEventsTable: boolean) => {
      const suiteName = useEventsTable
        ? "with events table"
        : "with traces table";
      const basePath = "/api/public/traces";
      const buildUrl = (params: string) => {
        if (!params) return basePath;
        const prefix = useEventsTable
          ? `${basePath}?useEventsTable=true&`
          : `${basePath}?`;
        return prefix + params;
      };

      describe(`${suiteName}`, () => {
        const testTraceId = randomUUID();
        const testTraceId2 = randomUUID();

        beforeAll(async () => {
          // Create test traces with different metadata for filtering
          const trace1 = createTrace({
            id: testTraceId,
            name: "filter-test-trace-1",
            user_id: "filter-user-1",
            project_id: projectId,
            metadata: {
              environment: "production",
              model: "gpt-4",
              priority: "high",
            },
            tags: ["important", "customer-facing"],
            environment: "production",
            release: "v1.0.0",
            version: "1.0.0",
            timestamp: new Date("2024-01-01T00:00:00Z").getTime(),
          });

          const trace2 = createTrace({
            id: testTraceId2,
            name: "filter-test-trace-2",
            user_id: "filter-user-2",
            project_id: projectId,
            metadata: {
              environment: "staging",
              model: "gpt-3.5-turbo",
              priority: "low",
            },
            tags: ["test", "internal"],
            environment: "staging",
            release: "v0.9.0",
            version: "0.9.0",
            timestamp: new Date("2024-01-02T00:00:00Z").getTime(),
          });

          await createTraceWithObservations(useEventsTable, trace1, []);
          await createTraceWithObservations(useEventsTable, trace2, []);

          // Simple wait to ensure data is available
          await new Promise((resolve) => setTimeout(resolve, 100));
        }, 10000);

        it("should support basic metadata filtering", async () => {
          const filterParam = JSON.stringify([
            {
              type: "stringObject",
              column: "metadata",
              key: "environment",
              operator: "=",
              value: "production",
            },
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=${encodeURIComponent(filterParam)}`),
          );

          expect(traces.status).toBe(200);
          const matchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId,
          );
          const nonMatchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId2,
          );

          expect(matchingTrace).toBeTruthy();
          expect(nonMatchingTrace).toBeFalsy();
        });

        it("should support multiple metadata filters with AND logic", async () => {
          const filterParam = JSON.stringify([
            {
              type: "stringObject",
              column: "metadata",
              key: "environment",
              operator: "=",
              value: "production",
            },
            {
              type: "stringObject",
              column: "metadata",
              key: "model",
              operator: "contains",
              value: "gpt-4",
            },
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=${encodeURIComponent(filterParam)}`),
          );

          expect(traces.status).toBe(200);
          const matchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId,
          );
          const nonMatchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId2,
          );

          expect(matchingTrace).toBeTruthy();
          expect(nonMatchingTrace).toBeFalsy();
        });

        it("should support array tag filtering", async () => {
          // Skip for events table - tags are always empty in the events table
          if (useEventsTable) {
            return;
          }

          const filterParam = JSON.stringify([
            {
              type: "arrayOptions",
              column: "tags",
              operator: "any of",
              value: ["important", "customer-facing"],
            },
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=${encodeURIComponent(filterParam)}`),
          );

          expect(traces.status).toBe(200);
          const matchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId,
          );

          expect(matchingTrace).toBeTruthy();
          if (matchingTrace) {
            expect(matchingTrace.tags).toContain("important");
          }
        });

        it("should support backward compatibility with simple parameters", async () => {
          // Test multiple simple parameters
          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`userId=filter-user-1&environment=production`),
          );

          expect(traces.status).toBe(200);
          const matchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId,
          );
          const nonMatchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId2,
          );

          expect(matchingTrace).toBeTruthy();
          expect(nonMatchingTrace).toBeFalsy();
        });

        it("should give precedence to advanced filter over simple parameters", async () => {
          // simple param would match trace2, but filter should match trace1
          const filterParam = JSON.stringify([
            {
              type: "string",
              column: "userId",
              operator: "=",
              value: "filter-user-1",
            },
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(
              `userId=filter-user-2&filter=${encodeURIComponent(filterParam)}`,
            ),
          );

          expect(traces.status).toBe(200);
          const matchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId,
          );
          const nonMatchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId2,
          );

          // Should match trace1 (filter takes precedence) not trace2 (simple param)
          expect(matchingTrace).toBeTruthy();
          expect(nonMatchingTrace).toBeFalsy();
        });

        it("should merge non-conflicting simple and advanced filters", async () => {
          // simple environment + advanced metadata filter
          const filterParam = JSON.stringify([
            {
              type: "stringObject",
              column: "metadata",
              key: "model",
              operator: "contains",
              value: "gpt-4",
            },
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(
              `userId=filter-user-1&filter=${encodeURIComponent(filterParam)}`,
            ),
          );

          expect(traces.status).toBe(200);
          const matchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId,
          );
          const nonMatchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId2,
          );

          expect(matchingTrace).toBeTruthy();
          expect(nonMatchingTrace).toBeFalsy();
        });

        it("should return validation error for malformed filter JSON", async () => {
          const malformedFilter = "invalid-json";

          const traces = await makeZodVerifiedAPICallSilent(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=${encodeURIComponent(malformedFilter)}`),
          );

          expect(traces.status).toBe(400);
        });

        it("should return validation error for invalid filter schema", async () => {
          const invalidFilterParam = JSON.stringify([
            {
              type: "invalid-type", // Invalid filter type
              column: "metadata",
              operator: "=",
              value: "test",
            },
          ]);

          const traces = await makeZodVerifiedAPICallSilent(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=${encodeURIComponent(invalidFilterParam)}`),
          );

          expect(traces.status).toBe(400);
        });

        it("should return validation error for empty string as filter", async () => {
          const traces = await makeZodVerifiedAPICallSilent(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=`),
          );

          expect(traces.status).toBe(200); // Empty string should be treated as undefined
        });

        it("should return validation error for invalid FilterState structure", async () => {
          const invalidStructure = JSON.stringify([
            {
              // Missing required fields for a valid FilterState condition
              column: "userId",
              value: "test",
              // Missing type and operator
            },
          ]);

          const traces = await makeZodVerifiedAPICallSilent(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=${encodeURIComponent(invalidStructure)}`),
          );

          expect(traces.status).toBe(400);
        });

        it("should return validation error for FilterState with invalid operator", async () => {
          const invalidOperator = JSON.stringify([
            {
              type: "string",
              column: "userId",
              operator: "invalid-operator", // Invalid operator
              value: "test",
            },
          ]);

          const traces = await makeZodVerifiedAPICallSilent(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=${encodeURIComponent(invalidOperator)}`),
          );

          expect(traces.status).toBe(400);
        });

        it("should support advanced timestamp filtering with multiple operators", async () => {
          // Test range filter (>= AND <) - should match only trace1
          const filterRange = JSON.stringify([
            {
              type: "datetime",
              column: "timestamp",
              operator: ">=",
              value: "2024-01-01T00:00:00Z",
            },
            {
              type: "datetime",
              column: "timestamp",
              operator: "<",
              value: "2024-01-01T24:00:00Z",
            },
          ]);

          const tracesRange = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=${encodeURIComponent(filterRange)}`),
          );

          expect(tracesRange.status).toBe(200);
          const matchingRange = tracesRange.body.data.find(
            (t) => t.id === testTraceId,
          );
          const nonMatchingRange = tracesRange.body.data.find(
            (t) => t.id === testTraceId2,
          );
          expect(matchingRange).toBeTruthy();
          expect(nonMatchingRange).toBeFalsy();
        });

        it("should give precedence to advanced timestamp filter over simple fromTimestamp/toTimestamp parameters", async () => {
          // simple params would match none of the traces (2023 dates)
          // But advanced filter should match trace2 (timestamp >= 2024-01-01T12:00:00Z)
          const filterParam = JSON.stringify([
            {
              type: "datetime",
              column: "timestamp",
              operator: ">=",
              value: "2024-01-01T12:00:00Z",
            },
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(
              `orderBy=timestamp.asc&fromTimestamp=2023-01-01T00:00:00Z&toTimestamp=2023-01-02T00:00:00Z&filter=${encodeURIComponent(filterParam)}`,
            ),
          );

          expect(traces.status).toBe(200);
          const matchingTrace = traces.body.data.find(
            (t) => t.id === testTraceId2,
          );
          // Should match trace2 (advanced filter wins)
          expect(matchingTrace).toBeTruthy();
        });

        it("should filter aggregated fields correctly", async () => {
          // Skip for traces table - this test is specific to events table aggregation
          if (!useEventsTable) {
            return;
          }

          // This test verifies that filtering on trace-levevel fields works correctly.
          // E.g. version field is defined as: argMaxIf(version, event_ts, version <> '')

          const traceWithVersionChange = randomUUID();
          const baseTimestamp = Date.now();
          const trace = createTrace({
            id: traceWithVersionChange,
            name: "version-aggregation-test",
            project_id: projectId,
            timestamp: baseTimestamp,
            version: "1.0",
            environment: "test",
          });

          // Create multiple events for the same trace with different versions
          // at increasing timestamps. The latest event has version="2.0"
          const events = [
            {
              trace_id: traceWithVersionChange,
              parent_span_id: traceWithVersionChange,
              project_id: projectId,
              name: "event-1",
              type: "GENERATION" as const,
              start_time: baseTimestamp,
              end_time: baseTimestamp + 100,
              version: "1.0",
              environment: "test",
              event_ts: baseTimestamp * 1000 + 1000000,
            },
            {
              trace_id: traceWithVersionChange,
              parent_span_id: traceWithVersionChange,
              project_id: projectId,
              name: "event-3",
              type: "GENERATION" as const,
              start_time: baseTimestamp + 400,
              end_time: baseTimestamp + 500,
              version: "2.0",
              environment: "test",
              event_ts: baseTimestamp * 1000 + 5000000,
            },
          ];

          await createTraceWithObservations(useEventsTable, trace, events);

          // Simple wait to ensure data is available
          await new Promise((resolve) => setTimeout(resolve, 100));

          // The trace should NOT be returned because after aggregation,
          // it has version=2.0 (from the latest event)
          const filterParam = JSON.stringify([
            {
              type: "string",
              column: "version",
              operator: "=",
              value: "1.0",
            },
            {
              type: "datetime",
              column: "timestamp",
              operator: ">=",
              value: new Date(baseTimestamp).toISOString(),
            },
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=${encodeURIComponent(filterParam)}`),
          );

          expect(traces.status).toBe(200);
          const matchingTrace = traces.body.data.find(
            (t) => t.id === traceWithVersionChange,
          );

          // The trace should NOT be found because its aggregated version is 2.0, not 1.0
          expect(matchingTrace).toBeUndefined();

          // Verify that filtering by version=2.0 DOES return the trace
          const filterParam2 = JSON.stringify([
            {
              type: "string",
              column: "version",
              operator: "=",
              value: "2.0",
            },
            {
              type: "datetime",
              column: "timestamp",
              operator: ">=",
              value: new Date(baseTimestamp).toISOString(),
            },
          ]);

          const traces2 = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=${encodeURIComponent(filterParam2)}`),
          );

          expect(traces2.status).toBe(200);
          const matchingTrace2 = traces2.body.data.find(
            (t) => t.id === traceWithVersionChange,
          );

          // The trace SHOULD be found because its aggregated version is 2.0
          expect(matchingTrace2).toBeTruthy();
          expect(matchingTrace2?.version).toBe("2.0");
        });

        it("should filter by latency without requesting metrics field group", async () => {
          // Filtering by latency should work even without requesting the "metrics" field group
          const baseTimestamp = Date.now();
          const traceWithLatency1 = randomUUID();
          const traceWithLatency2 = randomUUID();
          const traceWithLatency3 = randomUUID();

          // Create trace 1 with observations that result in ~0.5 second latency
          const trace1 = createTrace({
            id: traceWithLatency1,
            name: "trace-latency-1",
            project_id: projectId,
            timestamp: baseTimestamp,
            environment: "test-latency",
          });

          const observations1: ObservationEventData[] = [
            {
              trace_id: traceWithLatency1,
              project_id: projectId,
              name: "obs-1",
              start_time: baseTimestamp,
              end_time: baseTimestamp + 500, // 0.5 seconds
            },
          ];

          // Create trace 2 with observations that result in ~1.5 second latency
          const trace2 = createTrace({
            id: traceWithLatency2,
            name: "trace-latency-2",
            project_id: projectId,
            timestamp: baseTimestamp,
            environment: "test-latency",
          });

          const observations2: ObservationEventData[] = [
            {
              trace_id: traceWithLatency2,
              project_id: projectId,
              name: "obs-2",
              start_time: baseTimestamp,
              end_time: baseTimestamp + 1500, // 1.5 seconds
            },
          ];

          // Create trace 3 with observations that result in ~2.5 second latency
          const trace3 = createTrace({
            id: traceWithLatency3,
            name: "trace-latency-3",
            project_id: projectId,
            timestamp: baseTimestamp,
            environment: "test-latency",
          });

          const observations3: ObservationEventData[] = [
            {
              trace_id: traceWithLatency3,
              project_id: projectId,
              name: "obs-3",
              start_time: baseTimestamp,
              end_time: baseTimestamp + 2500, // 2.5 seconds
            },
          ];

          await createTraceWithObservations(
            useEventsTable,
            trace1,
            observations1,
          );
          await createTraceWithObservations(
            useEventsTable,
            trace2,
            observations2,
          );
          await createTraceWithObservations(
            useEventsTable,
            trace3,
            observations3,
          );

          // Simple wait to ensure data is available
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Test filtering by latency range (>= 0 and <= 1.9 seconds)
          // This should return trace1 and trace2, but not trace3
          // Note: We're NOT requesting the "metrics" field group
          const filterParam = JSON.stringify([
            {
              type: "number",
              column: "latency",
              operator: ">=",
              value: 0,
            },
            {
              type: "number",
              column: "latency",
              operator: "<=",
              value: 1.9,
            },
            {
              type: "stringOptions",
              column: "id",
              operator: "any of",
              value: [traceWithLatency1, traceWithLatency2, traceWithLatency3],
            },
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`fields=core&filter=${encodeURIComponent(filterParam)}`),
          );

          expect(traces.status).toBe(200);
          const trace1Result = traces.body.data.find(
            (t) => t.id === traceWithLatency1,
          );
          const trace2Result = traces.body.data.find(
            (t) => t.id === traceWithLatency2,
          );
          const trace3Result = traces.body.data.find(
            (t) => t.id === traceWithLatency3,
          );

          // Trace 1 (0.5s) and Trace 2 (1.5s) should be found
          expect(trace1Result).toBeTruthy();
          expect(trace2Result).toBeTruthy();
          // Trace 3 (2.5s) should NOT be found
          expect(trace3Result).toBeUndefined();

          expect(traces.body.meta.totalItems).toBeGreaterThanOrEqual(2);
        });

        it("should filter by score_categories without requesting scores field group", async () => {
          // Filtering by score fields should work even without requesting the "scores" field group
          // This test verifies that score_stats CTE is created when filters reference scores table
          const baseTimestamp = Date.now();
          const traceWithScore1 = randomUUID();
          const traceWithScore2 = randomUUID();

          // Create trace 1 with categorical score "good"
          const trace1 = createTrace({
            id: traceWithScore1,
            name: "trace-score-1",
            project_id: projectId,
            timestamp: baseTimestamp,
          });

          const score1 = createTraceScore({
            trace_id: traceWithScore1,
            project_id: projectId,
            name: "quality",
            string_value: "good",
            data_type: "CATEGORICAL",
            timestamp: baseTimestamp,
            observation_id: null, // Must be null for trace-level scores
          });

          // Create trace 2 with categorical score "bad"
          const trace2 = createTrace({
            id: traceWithScore2,
            name: "trace-score-2",
            project_id: projectId,
            timestamp: baseTimestamp,
          });

          const score2 = createTraceScore({
            trace_id: traceWithScore2,
            project_id: projectId,
            name: "quality",
            string_value: "bad",
            data_type: "CATEGORICAL",
            timestamp: baseTimestamp,
            observation_id: null, // Must be null for trace-level scores
          });

          await createTraceWithObservations(useEventsTable, trace1, []);
          await createTraceWithObservations(useEventsTable, trace2, []);
          await createScoresCh([score1, score2]);

          // Test filtering by score_categories (check for "good" score)
          // This should return trace1 only
          // Note: We're NOT requesting the "scores" field group
          const filterParam = JSON.stringify([
            {
              type: "stringOptions",
              column: "score_categories",
              operator: "any of",
              value: ["quality:good"],
            },
            {
              type: "stringOptions",
              column: "id",
              operator: "any of",
              value: [traceWithScore1, traceWithScore2],
            },
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`fields=core&filter=${encodeURIComponent(filterParam)}`),
          );

          expect(traces.status).toBe(200);
          expect(traces.body.data.map((d) => d.id)).toEqual([traceWithScore1]);
          expect(traces.body.meta.totalItems).toBe(1);
        });
      });
    };

    // Run test suite twice - once for each implementation
    runTestSuite(false); // old traces table
    if (env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true") {
      runTestSuite(true); // Events table
    }
  });

  // Dual-path tests for events table migration
  describe("GET /api/public/traces - Events Table Migration Tests", () => {
    const runTestSuite = (useEventsTable: boolean) => {
      const suiteName = useEventsTable
        ? "with events table"
        : "with traces table";
      const basePath = "/api/public/traces";
      const buildUrl = (params: string) => {
        if (!params) return basePath;
        const prefix = useEventsTable
          ? `${basePath}?useEventsTable=true&`
          : `${basePath}?`;
        return prefix + params;
      };

      describe(`${suiteName}`, () => {
        it("should fetch traces with all field groups", async () => {
          const timestamp = new Date();
          const traceId = randomUUID();
          const createdTrace = createTrace({
            id: traceId,
            name: "test-trace-fields",
            user_id: "user-field-test",
            session_id: "session-field-test",
            timestamp: timestamp.getTime(),
            project_id: projectId,
            metadata: { testKey: "testValue" },
            release: "1.0.0",
            version: "2.0.0",
            environment: "production",
          });

          // Create observations/events with cost to test metrics
          await createTraceWithObservations(useEventsTable, createdTrace, [
            {
              trace_id: traceId,
              project_id: projectId,
              name: "generation-1",
              type: "GENERATION",
              start_time: timestamp.getTime(),
              end_time: timestamp.getTime() + 1000,
              input: "What is the capital of France?",
              output: "The capital of France is Paris.",
              cost_details: {
                total: 0.05,
              },
              total_cost: 0.05,
              metadata: { testKey: "testValue" },
            },
            {
              trace_id: traceId,
              project_id: projectId,
              name: "span-1",
              type: "SPAN",
              start_time: timestamp.getTime() + 500,
              end_time: timestamp.getTime() + 2000,
              cost_details: {
                total: 0.03,
              },
              total_cost: 0.03,
              metadata: { testKey: "testValue" },
            },
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`fields=core,io,observations,metrics`),
          );

          const trace = traces.body.data.find((t) => t.id === traceId);
          expect(trace).toBeTruthy();
          if (!trace) return;

          // Core fields
          expect(trace.name).toBe("test-trace-fields");
          expect(trace.userId).toBe("user-field-test");
          expect(trace.sessionId).toBe("session-field-test");
          expect(trace.version).toBe("2.0.0");
          expect(trace.environment).toBe("production");

          // IO fields
          expect(trace.metadata).toMatchObject({ testKey: "testValue" });

          // Events table aggregates observation_ids
          expect(trace.observations).toBeDefined();
          expect(trace.observations?.length).toBeGreaterThan(0);
          expect(trace.totalCost).toBeCloseTo(0.08, 2); // 0.05 + 0.03
          expect(trace.latency).toBeGreaterThan(0);
        });

        it("should filter traces by userId", async () => {
          const userId = randomUUID();
          const traceId = randomUUID();
          const createdTrace = createTrace({
            id: traceId,
            name: "user-filter-test",
            user_id: userId,
            project_id: projectId,
          });

          // Create dummy trace that should not be returned
          const dummyTraceId = randomUUID();
          const dummyTrace = createTrace({
            id: dummyTraceId,
            name: "dummy-trace",
            user_id: "other-user",
            project_id: projectId,
          });

          await createTraceWithObservations(useEventsTable, createdTrace, []);
          await createTraceWithObservations(useEventsTable, dummyTrace, []);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`userId=${userId}`),
          );

          expect(traces.body.meta.totalItems).toBeGreaterThanOrEqual(1);
          const matchingTrace = traces.body.data.find((t) => t.id === traceId);
          const nonMatchingTrace = traces.body.data.find(
            (t) => t.id === dummyTraceId,
          );

          expect(matchingTrace).toBeTruthy();
          expect(nonMatchingTrace).toBeUndefined();
          expect(matchingTrace?.userId).toBe(userId);
        });

        it("should filter traces by name", async () => {
          const traceName = `test-trace-${randomUUID()}`;
          const traceId = randomUUID();
          const createdTrace = createTrace({
            id: traceId,
            name: traceName,
            project_id: projectId,
          });

          await createTraceWithObservations(useEventsTable, createdTrace, []);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`name=${traceName}`),
          );

          const matchingTrace = traces.body.data.find((t) => t.id === traceId);
          expect(matchingTrace).toBeTruthy();
          expect(matchingTrace?.name).toBe(traceName);
        });

        it("should filter traces by environment", async () => {
          const environment = `env-${randomUUID()}`;
          const traceId = randomUUID();
          const createdTrace = createTrace({
            id: traceId,
            name: "env-test",
            environment,
            project_id: projectId,
          });

          await createTraceWithObservations(useEventsTable, createdTrace, []);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`environment=${environment}`),
          );

          const matchingTrace = traces.body.data.find((t) => t.id === traceId);
          expect(matchingTrace).toBeTruthy();
          expect(matchingTrace?.environment).toBe(environment);
        });

        it("should support pagination", async () => {
          const traceIds = Array.from({ length: 5 }, () => randomUUID());
          const traces = traceIds.map((id, index) =>
            createTrace({
              id,
              name: `pagination-test-${index}`,
              project_id: projectId,
              timestamp: new Date().getTime() + index,
            }),
          );

          for (const trace of traces) {
            await createTraceWithObservations(useEventsTable, trace, []);
          }

          // Get page 1
          const page1 = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`page=1&limit=2`),
          );

          // Get page 2
          const page2 = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`page=2&limit=2`),
          );

          expect(page1.body.data.length).toBeLessThanOrEqual(2);
          expect(page2.body.data.length).toBeLessThanOrEqual(2);

          // Ensure pages are different
          const page1Ids = page1.body.data.map((t) => t.id);
          const page2Ids = page2.body.data.map((t) => t.id);
          const intersection = page1Ids.filter((id) => page2Ids.includes(id));
          expect(intersection.length).toBe(0);
        }, 10_000);

        it("should filter traces by timestamp range", async () => {
          const now = new Date();
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

          const traceInRange = createTrace({
            id: randomUUID(),
            name: "in-range-trace",
            project_id: projectId,
            timestamp: now.getTime(),
          });

          const traceOutOfRange = createTrace({
            id: randomUUID(),
            name: "out-of-range-trace",
            project_id: projectId,
            timestamp: yesterday.getTime() - 24 * 60 * 60 * 1000,
          });

          await createTraceWithObservations(useEventsTable, traceInRange, []);
          await createTraceWithObservations(
            useEventsTable,
            traceOutOfRange,
            [],
          );

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(
              `fromTimestamp=${yesterday.toISOString()}&toTimestamp=${tomorrow.toISOString()}`,
            ),
          );

          const inRangeFound = traces.body.data.find(
            (t) => t.id === traceInRange.id,
          );
          const outOfRangeFound = traces.body.data.find(
            (t) => t.id === traceOutOfRange.id,
          );

          expect(inRangeFound).toBeTruthy();
          expect(outOfRangeFound).toBeUndefined();
        });

        it("should handle field group: scores", async () => {
          const traceId = randomUUID();
          const createdTrace = createTrace({
            id: traceId,
            name: "scores-test",
            project_id: projectId,
          });

          await createTraceWithObservations(useEventsTable, createdTrace, []);

          // Create trace-level score
          const score = createTraceScore({
            trace_id: traceId,
            project_id: projectId,
            name: "quality",
            value: 0.9,
          });

          await createScoresCh([score]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`fields=core,scores`),
          );

          const trace = traces.body.data.find((t) => t.id === traceId);
          expect(trace).toBeTruthy();
          expect(trace?.scores).toBeDefined();
        });

        it("should count traces correctly", async () => {
          const prefix = randomUUID();
          const traceIds = Array.from({ length: 3 }, () => randomUUID());
          const traces = traceIds.map((id) =>
            createTrace({
              id,
              name: `count-test-${prefix}`,
              project_id: projectId,
            }),
          );

          for (const trace of traces) {
            await createTraceWithObservations(useEventsTable, trace, []);
          }

          const result = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`name=count-test-${prefix}`),
          );

          expect(result.body.meta.totalItems).toBeGreaterThanOrEqual(3);
          const matchingTraces = result.body.data.filter((t) =>
            t.name?.startsWith("count-test-"),
          );
          expect(matchingTraces.length).toBeGreaterThanOrEqual(3);
        });
      });
    };

    // Run test suite twice - once for each implementation
    runTestSuite(false); // Good old traces table
    if (env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true") {
      runTestSuite(true); // Events table
    }
  });

  describe.skip("GET /api/public/traces env var controls", () => {
    const originalRejectNoDateRange =
      env.LANGFUSE_API_TRACES_REJECT_NO_DATE_RANGE;
    const originalDefaultDateRangeDays =
      env.LANGFUSE_API_TRACES_DEFAULT_DATE_RANGE_DAYS;
    const originalDefaultFields = env.LANGFUSE_API_TRACES_DEFAULT_FIELDS;

    afterEach(() => {
      (env as any).LANGFUSE_API_TRACES_REJECT_NO_DATE_RANGE =
        originalRejectNoDateRange;
      (env as any).LANGFUSE_API_TRACES_DEFAULT_DATE_RANGE_DAYS =
        originalDefaultDateRangeDays;
      (env as any).LANGFUSE_API_TRACES_DEFAULT_FIELDS = originalDefaultFields;
    });

    it("should return 400 when REJECT_NO_DATE_RANGE=true and no fromTimestamp", async () => {
      (env as any).LANGFUSE_API_TRACES_REJECT_NO_DATE_RANGE = "true";

      const response = await makeZodVerifiedAPICallSilent(
        GetTracesV1Response,
        "GET",
        "/api/public/traces",
      );

      expect(response.status).toBe(400);
    });

    it("should allow request when REJECT_NO_DATE_RANGE=true and fromTimestamp is provided", async () => {
      (env as any).LANGFUSE_API_TRACES_REJECT_NO_DATE_RANGE = "true";

      const fromTimestamp = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const response = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        `/api/public/traces?fromTimestamp=${fromTimestamp}`,
      );

      expect(response.status).toBe(200);
    });

    it("should reject even when DEFAULT_DATE_RANGE_DAYS is also set (rejection takes precedence)", async () => {
      (env as any).LANGFUSE_API_TRACES_REJECT_NO_DATE_RANGE = "true";
      (env as any).LANGFUSE_API_TRACES_DEFAULT_DATE_RANGE_DAYS = 7;

      const response = await makeZodVerifiedAPICallSilent(
        GetTracesV1Response,
        "GET",
        "/api/public/traces",
      );

      expect(response.status).toBe(400);
    });

    it("should apply DEFAULT_FIELDS when no fields query param is provided", async () => {
      (env as any).LANGFUSE_API_TRACES_DEFAULT_FIELDS = "core";

      const traceId = randomUUID();
      const createdTrace = createTrace({
        id: traceId,
        name: "default-fields-test",
        project_id: projectId,
        input: JSON.stringify({ prompt: "test" }),
        output: JSON.stringify({ response: "test response" }),
      });

      const observation = createObservation({
        trace_id: traceId,
        project_id: projectId,
        name: "test-obs",
        start_time: new Date().getTime() - 1000,
        end_time: new Date().getTime(),
      });

      const score = createTraceScore({
        trace_id: traceId,
        project_id: projectId,
        name: "test-score",
        value: 0.8,
      });

      await createTracesCh([createdTrace]);
      await createObservationsCh([observation]);
      await createScoresCh([score]);

      const response = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces",
      );

      const trace = response.body.data.find((t) => t.id === traceId);
      expect(trace).toBeTruthy();
      if (!trace) return;

      // With core only, IO/scores/observations/metrics should be defaults
      expect(trace.input).toBeNull();
      expect(trace.output).toBeNull();
      expect(trace.observations).toEqual([]);
      expect(trace.scores).toEqual([]);
      expect(trace.totalCost).toBe(-1);
      expect(trace.latency).toBe(-1);
    });

    it("should override DEFAULT_FIELDS when explicit fields param is provided", async () => {
      (env as any).LANGFUSE_API_TRACES_DEFAULT_FIELDS = "core";

      const traceId = randomUUID();
      const createdTrace = createTrace({
        id: traceId,
        name: "explicit-fields-test",
        project_id: projectId,
        input: JSON.stringify({ prompt: "test" }),
        output: JSON.stringify({ response: "test response" }),
      });

      await createTracesCh([createdTrace]);

      const response = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core,io",
      );

      const trace = response.body.data.find((t) => t.id === traceId);
      expect(trace).toBeTruthy();
      if (!trace) return;

      // Explicit fields=core,io should override the env default of core-only
      expect(trace.input).toEqual({ prompt: "test" });
      expect(trace.output).toEqual({ response: "test response" });
    });
  });

  // Comprehensive filter column tests - verify all documented filter columns don't crash
  describe("Filter Columns - Doesn't Fail Tests", () => {
    const runFilterTests = (useEventsTable: boolean) => {
      const suiteName = useEventsTable
        ? "with events table"
        : "with traces table";
      const queryParam = useEventsTable ? "?useEventsTable=true&" : "?";

      describe(suiteName, () => {
        // Aggregated Metrics (from observations)
        const metricsFilters = [
          { column: "latency", type: "number", operator: ">=", value: 0 },
          { column: "inputTokens", type: "number", operator: ">=", value: 0 },
          { column: "outputTokens", type: "number", operator: ">=", value: 0 },
          { column: "totalTokens", type: "number", operator: ">=", value: 0 },
          { column: "inputCost", type: "number", operator: ">=", value: 0 },
          { column: "outputCost", type: "number", operator: ">=", value: 0 },
          { column: "totalCost", type: "number", operator: ">=", value: 0 },
        ];

        metricsFilters.forEach(({ column, type, operator, value }) => {
          it(`should not fail when filtering by ${column}`, async () => {
            const filterParam = JSON.stringify([
              { type, column, operator, value },
            ]);
            const response = await makeZodVerifiedAPICall(
              GetTracesV1Response,
              "GET",
              `/api/public/traces${queryParam}filter=${encodeURIComponent(filterParam)}`,
            );
            expect(response.status).toBe(200);
            expect(response.body.data).toBeDefined();
            expect(response.body.meta).toBeDefined();
          });
        });

        // Observation Level Aggregations
        const observationAggFilters = [
          { column: "level", type: "string", operator: "=", value: "ERROR" },
          { column: "warningCount", type: "number", operator: ">=", value: 0 },
          { column: "errorCount", type: "number", operator: ">=", value: 0 },
          { column: "defaultCount", type: "number", operator: ">=", value: 0 },
          { column: "debugCount", type: "number", operator: ">=", value: 0 },
        ];

        observationAggFilters.forEach(({ column, type, operator, value }) => {
          it(`should not fail when filtering by ${column}`, async () => {
            const filterParam = JSON.stringify([
              { type, column, operator, value },
            ]);
            const response = await makeZodVerifiedAPICall(
              GetTracesV1Response,
              "GET",
              `/api/public/traces${queryParam}filter=${encodeURIComponent(filterParam)}`,
            );
            expect(response.status).toBe(200);
            expect(response.body.data).toBeDefined();
            expect(response.body.meta).toBeDefined();
          });
        });

        // Scores (should not crash, filters are ignored per our fix)
        const scoreFilters = [
          {
            column: "scores_avg",
            type: "numberObject",
            key: "quality",
            operator: ">=",
            value: 0.5,
          },
          {
            column: "score_categories",
            type: "stringOptions",
            operator: "any of",
            value: ["good", "bad"],
          },
        ];

        scoreFilters.forEach((filterDef) => {
          it(`should not fail when filtering by ${filterDef.column}`, async () => {
            const filterParam = JSON.stringify([filterDef]);
            const response = await makeZodVerifiedAPICall(
              GetTracesV1Response,
              "GET",
              `/api/public/traces${queryParam}filter=${encodeURIComponent(filterParam)}`,
            );
            expect(response.status).toBe(200);
            expect(response.body.data).toBeDefined();
            expect(response.body.meta).toBeDefined();
          });
        });
      });
    };

    // Run for both table implementations
    runFilterTests(false);
    if (env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true") {
      runFilterTests(true);
    }
  });
});
