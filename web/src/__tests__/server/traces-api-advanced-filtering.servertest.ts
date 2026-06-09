import {
  createTraceScore,
  createScoresCh,
  createTrace,
  createOrgProjectAndApiKey,
  makeZodVerifiedAPICall,
  makeZodVerifiedAPICallSilent,
  GetTracesV1Response,
  randomUUID,
  env,
  waitForEventsTable,
  createTraceWithObservations,
} from "./traces-api.fixtures";
import type { ObservationEventData } from "./traces-api.fixtures";

describe("/api/public/traces API Endpoint", () => {
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
        let projectId: string;
        let auth: string;
        const testTraceId = randomUUID();
        const testTraceId2 = randomUUID();

        beforeAll(async () => {
          const fixture = await createOrgProjectAndApiKey();
          projectId = fixture.projectId;
          auth = fixture.auth;

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

          await Promise.all([
            createTraceWithObservations(useEventsTable, trace1, []),
            createTraceWithObservations(useEventsTable, trace2, []),
          ]);

          await waitForEventsTable(useEventsTable);
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
            undefined,
            auth,
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
            undefined,
            auth,
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
            undefined,
            auth,
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
            undefined,
            auth,
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
            undefined,
            auth,
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
            undefined,
            auth,
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
            undefined,
            auth,
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
            undefined,
            auth,
          );

          expect(traces.status).toBe(400);
        });

        it("should return validation error for empty string as filter", async () => {
          const traces = await makeZodVerifiedAPICallSilent(
            GetTracesV1Response,
            "GET",
            buildUrl(`filter=`),
            undefined,
            auth,
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
            undefined,
            auth,
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
            undefined,
            auth,
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
            undefined,
            auth,
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
            undefined,
            auth,
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
          await waitForEventsTable(useEventsTable);

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
            undefined,
            auth,
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
            undefined,
            auth,
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

          await Promise.all([
            createTraceWithObservations(useEventsTable, trace1, observations1),
            createTraceWithObservations(useEventsTable, trace2, observations2),
            createTraceWithObservations(useEventsTable, trace3, observations3),
          ]);

          await waitForEventsTable(useEventsTable);

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
            undefined,
            auth,
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

          await Promise.all([
            createTraceWithObservations(useEventsTable, trace1, []),
            createTraceWithObservations(useEventsTable, trace2, []),
            createScoresCh([score1, score2]),
          ]);

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
            undefined,
            auth,
          );

          expect(traces.status).toBe(200);
          expect(traces.body.data.map((d) => d.id)).toEqual([traceWithScore1]);
          expect(traces.body.meta.totalItems).toBe(1);
        });
      });
    };

    // Run test suite twice - once for each implementation
    runTestSuite(false); // old traces table
    if (env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true") {
      runTestSuite(true); // Events table
    }
  });

  // Dual-path tests for events table migration
});
