import {
  createObservation,
  createTraceScore,
  createScoresCh,
  createTrace,
  createOrgProjectAndApiKey,
  createObservationsCh,
  createTracesCh,
  makeZodVerifiedAPICall,
  makeZodVerifiedAPICallSilent,
  GetTracesV1Response,
  randomUUID,
  env,
  createTraceWithObservations,
} from "./traces-api.fixtures";

describe("/api/public/traces API Endpoint", () => {
  let projectId: string;
  let auth: string;

  beforeEach(async () => {
    const fixture = await createOrgProjectAndApiKey();
    projectId = fixture.projectId;
    auth = fixture.auth;
  });

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
            undefined,
            auth,
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

          await Promise.all([
            createTraceWithObservations(useEventsTable, createdTrace, []),
            createTraceWithObservations(useEventsTable, dummyTrace, []),
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`userId=${userId}`),
            undefined,
            auth,
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
            undefined,
            auth,
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
            undefined,
            auth,
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

          await Promise.all(
            traces.map((trace) =>
              createTraceWithObservations(useEventsTable, trace, []),
            ),
          );

          const [page1, page2] = await Promise.all([
            makeZodVerifiedAPICall(
              GetTracesV1Response,
              "GET",
              buildUrl(`page=1&limit=2`),
              undefined,
              auth,
            ),
            makeZodVerifiedAPICall(
              GetTracesV1Response,
              "GET",
              buildUrl(`page=2&limit=2`),
              undefined,
              auth,
            ),
          ]);

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

          await Promise.all([
            createTraceWithObservations(useEventsTable, traceInRange, []),
            createTraceWithObservations(useEventsTable, traceOutOfRange, []),
          ]);

          const traces = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(
              `fromTimestamp=${yesterday.toISOString()}&toTimestamp=${tomorrow.toISOString()}`,
            ),
            undefined,
            auth,
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
            undefined,
            auth,
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

          await Promise.all(
            traces.map((trace) =>
              createTraceWithObservations(useEventsTable, trace, []),
            ),
          );

          const result = await makeZodVerifiedAPICall(
            GetTracesV1Response,
            "GET",
            buildUrl(`name=count-test-${prefix}`),
            undefined,
            auth,
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
    if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true") {
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
        undefined,
        auth,
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
        undefined,
        auth,
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
        undefined,
        auth,
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

      await Promise.all([
        createTracesCh([createdTrace]),
        createObservationsCh([observation]),
        createScoresCh([score]),
      ]);

      const response = await makeZodVerifiedAPICall(
        GetTracesV1Response,
        "GET",
        "/api/public/traces",
        undefined,
        auth,
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
        undefined,
        auth,
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
});
