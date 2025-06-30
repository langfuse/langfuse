import {
  createObservation,
  createTraceScore,
  createSessionScore,
  createScoresCh,
  createTrace,
  getTraceById,
} from "@langfuse/shared/src/server";
import {
  createObservationsCh,
  createTracesCh,
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
import { snakeCase } from "lodash";
import waitForExpect from "wait-for-expect";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

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
      expect(trace.observations).toBeUndefined();
      expect(trace.scores).toBeUndefined();
      expect(trace.totalCost).toBeUndefined();
      expect(trace.latency).toBeUndefined();
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
      expect(trace.observations).toBeUndefined();
      expect(trace.scores).toBeUndefined();
      expect(trace.totalCost).toBeUndefined();
      expect(trace.latency).toBeUndefined();
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
      expect(trace.observations).toBeUndefined();
      expect(trace.totalCost).toBeUndefined();
      expect(trace.latency).toBeUndefined();
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
      expect(trace.scores).toBeUndefined();
      expect(trace.totalCost).toBeUndefined();
      expect(trace.latency).toBeUndefined();
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
      expect(trace.observations).toBeUndefined();
      expect(trace.scores).toBeUndefined();
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
});
