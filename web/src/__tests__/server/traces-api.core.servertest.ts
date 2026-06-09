import {
  createObservation,
  createTraceScore,
  createSessionScore,
  createScoresCh,
  createTrace,
  getTraceById,
  createOrgProjectAndApiKey,
  createObservationsCh,
  createTracesCh,
  makeZodVerifiedAPICall,
  makeZodVerifiedAPICallSilent,
  DeleteTracesV1Response,
  DeleteTraceV1Response,
  GetTracesV1Response,
  GetTraceV1Response,
  randomUUID,
  snakeCase,
  waitForExpect,
} from "./traces-api.fixtures";

describe("/api/public/traces API Endpoint", () => {
  let projectId: string;
  let auth: string;

  beforeEach(async () => {
    const fixture = await createOrgProjectAndApiKey();
    projectId = fixture.projectId;
    auth = fixture.auth;
  });

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

    await Promise.all([
      createTracesCh([createdTrace]),
      createObservationsCh(observations),
    ]);

    const trace = await makeZodVerifiedAPICall(
      GetTraceV1Response,
      "GET",
      "/api/public/traces/" + createdTrace.id,
      undefined,
      auth,
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

  it("should fetch a trace with core-only fields when fields=core", async () => {
    const traceId = randomUUID();
    const createdTrace = createTrace({
      id: traceId,
      name: "trace-core-only",
      user_id: "user-1",
      project_id: projectId,
      metadata: { key: "value" },
      input: JSON.stringify({ prompt: "test" }),
      output: JSON.stringify({ response: "test response" }),
    });

    const observation = createObservation({
      trace_id: traceId,
      project_id: projectId,
      name: "test-observation",
      end_time: new Date().getTime(),
      start_time: new Date().getTime() - 1000,
      cost_details: { input: 0.02, output: 0.03, total: 0.05 },
    });

    const score = createTraceScore({
      trace_id: traceId,
      project_id: projectId,
      name: "test-score",
      value: 0.8,
    });

    await Promise.all([
      createTracesCh([createdTrace]),
      createObservationsCh([observation]),
      createScoresCh([score]),
    ]);

    const trace = await makeZodVerifiedAPICall(
      GetTraceV1Response,
      "GET",
      `/api/public/traces/${traceId}?fields=core`,
      undefined,
      auth,
    );

    expect(trace.body.id).toBe(traceId);
    expect(trace.body.input).toBeNull();
    expect(trace.body.output).toBeNull();
    expect(trace.body.metadata).toEqual({});
    expect(trace.body.observations).toEqual([]);
    expect(trace.body.scores).toEqual([]);
    expect(trace.body.totalCost).toBe(-1);
    expect(trace.body.latency).toBe(-1);
  });

  it("should fetch a trace with core,scores,metrics fields", async () => {
    const traceId = randomUUID();
    const createdTrace = createTrace({
      id: traceId,
      name: "trace-with-scores-metrics",
      project_id: projectId,
      input: JSON.stringify({ prompt: "test" }),
      output: JSON.stringify({ response: "test response" }),
    });

    const observation = createObservation({
      trace_id: traceId,
      project_id: projectId,
      name: "test-observation",
      end_time: new Date().getTime(),
      start_time: new Date().getTime() - 1000,
      cost_details: { input: 0.02, output: 0.03, total: 0.05 },
      input: "observation input",
      output: "observation output",
    });

    const score = createTraceScore({
      trace_id: traceId,
      project_id: projectId,
      name: "test-score",
      value: 0.8,
    });

    await Promise.all([
      createTracesCh([createdTrace]),
      createObservationsCh([observation]),
      createScoresCh([score]),
    ]);

    const trace = await makeZodVerifiedAPICall(
      GetTraceV1Response,
      "GET",
      `/api/public/traces/${traceId}?fields=core,scores,metrics`,
      undefined,
      auth,
    );

    expect(trace.body.id).toBe(traceId);
    expect(trace.body.input).toBeNull();
    expect(trace.body.output).toBeNull();
    expect(trace.body.observations).toEqual([]);
    expect(trace.body.scores).toHaveLength(1);
    expect(trace.body.totalCost).toBe(0.05);
    expect(trace.body.latency).toBeCloseTo(1);
  });

  it("should return all fields when fields param contains only invalid groups", async () => {
    const traceId = randomUUID();
    const createdTrace = createTrace({
      id: traceId,
      name: "trace-invalid-fields",
      project_id: projectId,
      input: JSON.stringify({ prompt: "test" }),
      output: JSON.stringify({ response: "test response" }),
      metadata: { key: "value" },
    });

    const observation = createObservation({
      trace_id: traceId,
      project_id: projectId,
      name: "test-observation",
      end_time: new Date().getTime(),
      start_time: new Date().getTime() - 1000,
      cost_details: { input: 0.01, output: 0.02, total: 0.03 },
    });

    await Promise.all([
      createTracesCh([createdTrace]),
      createObservationsCh([observation]),
    ]);

    const trace = await makeZodVerifiedAPICall(
      GetTraceV1Response,
      "GET",
      `/api/public/traces/${traceId}?fields=invalid_group,also_invalid`,
      undefined,
      auth,
    );

    // All invalid fields should fall back to returning all field groups
    expect(trace.body.id).toBe(traceId);
    expect(trace.body.input).not.toBeNull();
    expect(trace.body.output).not.toBeNull();
    expect(trace.body.observations).toHaveLength(1);
    expect(trace.body.totalCost).toBeGreaterThanOrEqual(0);
    expect(trace.body.latency).toBeGreaterThanOrEqual(0);
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

    await Promise.all([
      createTracesCh([createdTrace]),
      createObservationsCh(observations),
    ]);

    const traces = await makeZodVerifiedAPICall(
      GetTracesV1Response,
      "GET",
      "/api/public/traces",
      undefined,
      auth,
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
        undefined,
        auth,
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
      undefined,
      auth,
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
      undefined,
      auth,
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
      undefined,
      auth,
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
      undefined,
      auth,
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
      undefined,
      auth,
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
      undefined,
      auth,
    );

    expect(response.status).toBe(400);
  });

  it("LFE-3699: should fetch a single trace with unescaped metadata via traces list", async () => {
    const traceId = randomUUID();
    const traceName = `trace-name-${traceId}`;
    const trace = createTrace({
      id: traceId,
      name: traceName,
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
      `/api/public/traces?name=${encodeURIComponent(traceName)}&limit=1`,
      undefined,
      auth,
    );

    const traceResponse = traces.body.data.find((t) => t.id === traceId);
    expect(traceResponse).toBeDefined();
    expect(traceResponse!.name).toBe(traceName);
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
      undefined,
      auth,
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
        input: "a".repeat(28e6),
        output: "b".repeat(28e6),
        metadata: {
          foo: "c".repeat(28e6),
        },
      }),
    ]);

    await expect(
      makeZodVerifiedAPICall(
        GetTraceV1Response,
        "GET",
        `/api/public/traces/${traceId}`,
        undefined,
        auth,
      ),
    ).rejects.toThrow(
      /Observations in trace are too large: .* exceeds limit of 80\.00MB/,
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
      undefined,
      auth,
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
      auth,
    );

    // Then
    expect(deleteResponse.status).toBe(200);
    await waitForExpect(async () => {
      const [trace1, trace2] = await Promise.all([
        getTraceById({
          traceId: createdTrace1.id,
          projectId,
        }),
        getTraceById({
          traceId: createdTrace2.id,
          projectId,
        }),
      ]);
      expect(trace1).toBeUndefined();
      expect(trace2).toBeUndefined();
    }, 40_000);
  }, 60_000);
});
