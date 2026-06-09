import {
  createObservation,
  createTraceScore,
  createScoresCh,
  createTrace,
  createOrgProjectAndApiKey,
  createObservationsCh,
  createTracesCh,
  makeZodVerifiedAPICall,
  GetTracesV1Response,
  randomUUID,
  createFieldsFilteringFixture,
} from "./traces-api.fixtures";

describe("/api/public/traces API Endpoint", () => {
  let projectId: string;
  let auth: string;

  beforeEach(async () => {
    const fixture = await createOrgProjectAndApiKey();
    projectId = fixture.projectId;
    auth = fixture.auth;
  });

  describe("Fields Filtering", () => {
    it("should fetch traces with all fields by default", async () => {
      const { createdTrace, observation, score, traceId } =
        createFieldsFilteringFixture(projectId);

      await Promise.all([
        createTracesCh([createdTrace]),
        createObservationsCh([observation]),
        createScoresCh([score]),
      ]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces",
        undefined,
        auth,
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

      await Promise.all([
        createTracesCh([createdTrace]),
        createObservationsCh([observation]),
        createScoresCh([score]),
      ]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core",
        undefined,
        auth,
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
        undefined,
        auth,
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

      await Promise.all([
        createTracesCh([createdTrace]),
        createScoresCh([score]),
      ]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core,scores",
        undefined,
        auth,
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

      await Promise.all([
        createTracesCh([createdTrace]),
        createObservationsCh([observation]),
      ]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core,observations",
        undefined,
        auth,
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

      await Promise.all([
        createTracesCh([createdTrace]),
        createObservationsCh([observation]),
      ]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=core,metrics",
        undefined,
        auth,
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
        undefined,
        auth,
      );

      // Should still work, just ignoring invalid field names
      expect(traces.status).toBe(200);
      expect(traces.body.data).toBeDefined();
    });

    it("should handle empty fields parameter", async () => {
      const { createdTrace, observation, score, traceId } =
        createFieldsFilteringFixture(projectId);

      await Promise.all([
        createTracesCh([createdTrace]),
        createObservationsCh([observation]),
        createScoresCh([score]),
      ]);

      const traces = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces?fields=",
        undefined,
        auth,
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
