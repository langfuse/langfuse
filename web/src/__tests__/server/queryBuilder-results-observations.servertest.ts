import {
  QueryBuilder,
  executeQuery,
  createTrace,
  createObservation,
  createTracesCh,
  createObservationsCh,
  randomUUID,
} from "./queryBuilder.fixtures";
import type { QueryType } from "./queryBuilder.fixtures";

describe("queryBuilder", () => {
  describe("query result correctness", () => {
    describe("observations view", () => {
      it("should calculate p95 timeToFirstToken for each trace name using observations view", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces with observations that have different start/completion start times
        const traces = [];
        const observations = [];

        // Create trace for "gpt-4-turbo" model
        const traceGpt4 = createTrace({
          project_id: projectId,
          name: "gpt-4-completion",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        traces.push(traceGpt4);

        // Create observations for GPT-4-turbo with different time to first token values
        // Add 10 observations with time to first token ranging from 500ms to 1400ms
        for (let i = 0; i < 10; i++) {
          const startTime = new Date();
          // Create increasing TTFT values (500ms to 1400ms)
          const ttft = 500 + i * 100;
          const completionStartTime = new Date(startTime.getTime() + ttft);
          const endTime = new Date(completionStartTime.getTime() + 500); // Add another 500ms for generation

          observations.push(
            createObservation({
              project_id: projectId,
              trace_id: traceGpt4.id,
              type: "generation",
              name: "gpt-4-turbo",
              provided_model_name: "gpt-4-turbo",
              environment: "default",
              start_time: startTime.getTime(),
              completion_start_time: completionStartTime.getTime(),
              end_time: endTime.getTime(),
            }),
          );
        }

        // Create trace for "gpt-3.5-turbo" model
        const traceGpt35 = createTrace({
          project_id: projectId,
          name: "gpt-3.5-completion",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        traces.push(traceGpt35);

        // Create observations for GPT-3.5-turbo with different time to first token values
        // Add 10 observations with time to first token ranging from 200ms to 650ms
        for (let i = 0; i < 10; i++) {
          const startTime = new Date();
          // Create increasing TTFT values (200ms to 650ms)
          const ttft = 200 + i * 50;
          const completionStartTime = new Date(startTime.getTime() + ttft);
          const endTime = new Date(completionStartTime.getTime() + 300); // Add another 300ms for generation

          observations.push(
            createObservation({
              project_id: projectId,
              trace_id: traceGpt35.id,
              type: "generation",
              name: "gpt-3.5-turbo",
              provided_model_name: "gpt-3.5-turbo",
              environment: "default",
              start_time: startTime.getTime(),
              completion_start_time: completionStartTime.getTime(),
              end_time: endTime.getTime(),
            }),
          );
        }

        // Create trace for "claude-3-opus" model
        const traceClaude = createTrace({
          project_id: projectId,
          name: "claude-completion",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        traces.push(traceClaude);

        // Create observations for Claude with different time to first token values
        // Add 10 observations with time to first token ranging from 300ms to 1200ms
        for (let i = 0; i < 10; i++) {
          const startTime = new Date();
          // Create increasing TTFT values (300ms to 1200ms)
          const ttft = 300 + i * 100;
          const completionStartTime = new Date(startTime.getTime() + ttft);
          const endTime = new Date(completionStartTime.getTime() + 400); // Add another 400ms for generation

          observations.push(
            createObservation({
              project_id: projectId,
              trace_id: traceClaude.id,
              type: "generation",
              name: "claude-3-opus",
              provided_model_name: "claude-3-opus",
              environment: "default",
              start_time: startTime.getTime(),
              completion_start_time: completionStartTime.getTime(),
              end_time: endTime.getTime(),
            }),
          );
        }

        await createTracesCh(traces);
        await createObservationsCh(observations);

        // Define query to test p95 timeToFirstToken calculation for each trace using observations view
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "traceName" }],
          metrics: [{ measure: "timeToFirstToken", aggregation: "p95" }],
          filters: [
            {
              column: "type",
              operator: "=",
              value: "generation",
              type: "string",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Assert
        expect(result.data).toHaveLength(3);

        // Get results for each trace
        const gpt4Result = result.data.find(
          (row: any) => row.traceName === "gpt-4-completion",
        );
        const gpt35Result = result.data.find(
          (row: any) => row.traceName === "gpt-3.5-completion",
        );
        const claudeResult = result.data.find(
          (row: any) => row.traceName === "claude-completion",
        );

        // The p95 should be close to the 95th percentile value we generated
        // For GPT-4: the 95th percentile of values from 500-1400 would be around 1350ms
        expect(
          parseInt(gpt4Result.p95_timeToFirstToken),
        ).toBeGreaterThanOrEqual(1300);
        expect(parseInt(gpt4Result.p95_timeToFirstToken)).toBeLessThanOrEqual(
          1400,
        );

        // For GPT-3.5: the 95th percentile of values from 200-650 would be around 625ms
        expect(
          parseInt(gpt35Result.p95_timeToFirstToken),
        ).toBeGreaterThanOrEqual(600);
        expect(parseInt(gpt35Result.p95_timeToFirstToken)).toBeLessThanOrEqual(
          650,
        );

        // For Claude: the 95th percentile of values from 300-1200 would be around 1150ms
        expect(
          parseInt(claudeResult.p95_timeToFirstToken),
        ).toBeGreaterThanOrEqual(1100);
        expect(parseInt(claudeResult.p95_timeToFirstToken)).toBeLessThanOrEqual(
          1200,
        );
      });

      it("should return null streamingLatency and timeToFirstToken when completion_start_time is null", async () => {
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "null-completion-start-time-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        await createTracesCh([trace]);

        // Create observation with NULL completion_start_time
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 1000);
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          type: "generation",
          name: "model-x",
          provided_model_name: "model-x",
          environment: "default",
          start_time: startTime.getTime(),
          completion_start_time: null, // explicitly null
          end_time: endTime.getTime(),
        });
        await createObservationsCh([observation]);

        // Build query selecting metrics per observation
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "name" }],
          metrics: [
            { measure: "timeToFirstToken", aggregation: "max" },
            { measure: "streamingLatency", aggregation: "max" },
          ],
          filters: [
            {
              column: "type",
              operator: "=",
              value: "generation",
              type: "string",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(1);
        const row = result.data[0];
        expect(row.max_timeToFirstToken).toBeNull();
        expect(row.max_streamingLatency).toBeNull();
      });

      it("should return streamingLatency and timeToFirstToken when completion_start_time is present", async () => {
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "null-completion-start-time-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        await createTracesCh([trace]);

        // Create observation with NULL completion_start_time
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 1000);
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          type: "generation",
          name: "model-x",
          provided_model_name: "model-x",
          environment: "default",
          start_time: startTime.getTime(),
          completion_start_time: startTime.getTime() + 200,
          end_time: endTime.getTime(),
        });
        await createObservationsCh([observation]);

        // Build query selecting metrics per observation
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "name" }],
          metrics: [
            { measure: "timeToFirstToken", aggregation: "max" },
            { measure: "streamingLatency", aggregation: "max" },
          ],
          filters: [
            {
              column: "type",
              operator: "=",
              value: "generation",
              type: "string",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(1);
        const row = result.data[0];
        expect(Number(row.max_timeToFirstToken)).toBe(200);
        expect(Number(row.max_streamingLatency)).toBe(800);
      });

      it("should calculate tokens correctly", async () => {
        const projectId = randomUUID();

        // Create trace
        const trace = createTrace({
          project_id: projectId,
          name: "null-completion-start-time-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        await createTracesCh([trace]);

        // Create observation with NULL completion_start_time
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 1000);
        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          type: "generation",
          name: "model-x",
          provided_model_name: "model-x",
          environment: "default",
          start_time: startTime.getTime(),
          completion_start_time: startTime.getTime() + 200,
          end_time: endTime.getTime(),
          usage_details: {
            input_tokens: 100,
            input_cache_tokens: 200,
            output_tokens: 300,
            output_cache_tokens: 400,
            total: 1000,
          },
        });
        await createObservationsCh([observation]);

        // Build query selecting metrics per observation
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "name" }],
          metrics: [
            { measure: "inputTokens", aggregation: "sum" },
            { measure: "outputTokens", aggregation: "sum" },
            { measure: "totalTokens", aggregation: "sum" },
            { measure: "outputTokensPerSecond", aggregation: "avg" },
          ],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(1);
        const row = result.data[0];
        expect(Number(row.sum_inputTokens)).toBe(300);
        expect(Number(row.sum_outputTokens)).toBe(700);
        expect(Number(row.sum_totalTokens)).toBe(1000);
      });

      it("should filter observations by metadata correctly", async () => {
        // Setup
        const projectId = randomUUID();
        const traceId = randomUUID();

        // Create a trace
        const trace = await createTrace({
          id: traceId,
          name: "trace-for-observations",
          project_id: projectId,
        });
        await createTracesCh([trace]);

        // Create observations with different metadata
        const observations = [
          await createObservation({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "observation-premium",
            metadata: { customer: "test1" },
          }),
          await createObservation({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "observation-basic",
            metadata: { customer: "test2" },
          }),
          await createObservation({
            id: randomUUID(),
            trace_id: traceId,
            project_id: projectId,
            name: "observation-no-metadata",
            metadata: undefined,
          }),
        ];

        await createObservationsCh(observations);

        // Define query with metadata filter for observations
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [
            {
              column: "metadata",
              operator: "contains",
              key: "customer",
              value: "test",
              type: "stringObject",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        expect(result.data).toHaveLength(2);
        expect(result.data[0].name).toBe("observation-basic");
        expect(Number(result.data[0].count_count)).toBe(1);
      });

      it("should generate histogram with custom bin count for cost distribution", async () => {
        // Setup
        const projectId = randomUUID();

        // Create traces with observations that have different costs
        const traces = [];
        const observations = [];

        // Create trace for cost distribution test
        const trace = createTrace({
          project_id: projectId,
          name: "cost-distribution-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });
        traces.push(trace);

        // Create observations with varying costs to test histogram with custom bins
        // Generate 30 observations with costs ranging from $0.001 to $1.00
        const costValues = [
          // Low cost cluster ($0.001-$0.01) - 10 observations
          ...Array.from({ length: 10 }, (_, i) => 0.001 + i * 0.001),
          // Medium cost cluster ($0.05-$0.20) - 10 observations
          ...Array.from({ length: 10 }, (_, i) => 0.05 + i * 0.015),
          // High cost cluster ($0.50-$1.00) - 10 observations
          ...Array.from({ length: 10 }, (_, i) => 0.5 + i * 0.05),
        ];

        costValues.forEach((cost, index) => {
          observations.push(
            createObservation({
              project_id: projectId,
              trace_id: trace.id,
              type: "generation",
              name: `cost-observation-${index}`,
              provided_model_name: "gpt-4",
              environment: "default",
              start_time: new Date().getTime(),
              end_time: new Date().getTime() + 1000,
              total_cost: cost,
            }),
          );
        });

        await createTracesCh(traces);
        await createObservationsCh(observations);

        // Test histogram with custom bin count (20 bins)
        const customBinHistogramQuery: QueryType = {
          view: "observations",
          dimensions: [],
          metrics: [
            {
              measure: "totalCost",
              aggregation: "histogram",
            },
          ],
          filters: [
            {
              column: "type",
              operator: "=",
              value: "generation",
              type: "string",
            },
          ],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: null,
          chartConfig: { type: "HISTOGRAM", bins: 20 }, // Custom bin count
        };

        // Execute histogram query with custom bins
        const queryBuilder = new QueryBuilder(
          customBinHistogramQuery.chartConfig,
        );
        const { query: compiledQuery } = await queryBuilder.build(
          customBinHistogramQuery,
          projectId,
        );

        // Verify the generated SQL contains histogram function with custom bins
        expect(compiledQuery).toContain("histogram(20)");
        expect(compiledQuery).toContain("total_cost");

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, customBinHistogramQuery);

        // Assert histogram results with custom bins
        expect(result.data).toHaveLength(1);
        const histogramData = result.data[0].histogram_totalCost;

        // ClickHouse histogram returns array of tuples [lower, upper, height]
        expect(Array.isArray(histogramData)).toBe(true);
        expect(histogramData.length).toBeGreaterThan(0);
        expect(histogramData.length).toBeLessThanOrEqual(20); // Should not exceed requested bins

        // Verify histogram tuple structure and cost ranges
        histogramData.forEach((bin: [number, number, number]) => {
          expect(Array.isArray(bin)).toBe(true);
          expect(bin).toHaveLength(3);
          const [lower, upper, height] = bin;
          expect(typeof lower).toBe("number");
          expect(typeof upper).toBe("number");
          expect(typeof height).toBe("number");
          expect(lower).toBeLessThan(upper);
          expect(height).toBeGreaterThan(0);
          // Cost values should be in expected range
          expect(lower).toBeGreaterThanOrEqual(0);
          expect(upper).toBeLessThanOrEqual(1.1); // Allow some margin for ClickHouse binning
        });

        // Verify total count matches our data
        const totalCount = histogramData.reduce(
          (sum: number, bin: [number, number, number]) => sum + bin[2],
          0,
        );
        expect(totalCount).toBe(30); // Should match our 30 observations
      });

      it("should apply row_limit to query results", async () => {
        // Setup
        const projectId = randomUUID();

        // Create a trace with multiple observations
        const trace = createTrace({
          project_id: projectId,
          name: "test-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });

        // Create 10 observations with different names to test row limiting
        const observations = Array.from({ length: 10 }, (_, i) =>
          createObservation({
            project_id: projectId,
            trace_id: trace.id,
            type: "generation",
            name: `observation-${i}`,
            environment: "default",
            start_time: new Date().getTime() + i * 1000,
          }),
        );

        await createTracesCh([trace]);
        await createObservationsCh(observations);

        // Query with row_limit
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "name" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: new Date(
            new Date().setDate(new Date().getDate() - 1),
          ).toISOString(),
          toTimestamp: new Date(
            new Date().setDate(new Date().getDate() + 1),
          ).toISOString(),
          orderBy: [{ field: "name", direction: "asc" }],
          chartConfig: { type: "TABLE", row_limit: 5 },
        };

        // Verify the generated SQL contains LIMIT clause
        const queryBuilder = new QueryBuilder(query.chartConfig);
        const { query: compiledQuery } = await queryBuilder.build(
          query,
          projectId,
        );
        expect(compiledQuery).toContain("LIMIT 5");

        // Execute query and verify row limit is applied
        const result = await executeQuery(projectId, query);

        // Should return only 5 rows despite having 10 observations
        expect(result).toHaveLength(5);
      });

      it("should format startTimeMonth dimension correctly", async () => {
        // Setup
        const projectId = randomUUID();
        const trace = createTrace({
          project_id: projectId,
          name: "test-trace",
          environment: "default",
          timestamp: new Date().getTime(),
        });

        const observation = createObservation({
          project_id: projectId,
          trace_id: trace.id,
          type: "generation",
          name: "test-observation",
          environment: "default",
          start_time: new Date("2024-03-15T10:00:00Z").getTime(),
        });

        await createTracesCh([trace]);
        await createObservationsCh([observation]);

        // Query with startTimeMonth dimension
        const query: QueryType = {
          view: "observations",
          dimensions: [{ field: "startTimeMonth" }],
          metrics: [{ measure: "count", aggregation: "count" }],
          filters: [],
          timeDimension: null,
          fromTimestamp: "2024-03-01T00:00:00.000Z",
          toTimestamp: "2024-03-31T23:59:59.999Z",
          orderBy: null,
        };

        // Execute query
        const result: { data: Array<any> } = { data: [] };
        result.data = await executeQuery(projectId, query);

        // Verify the month is formatted as YYYY-MM
        expect(result.data).toHaveLength(1);
        expect(result.data[0].startTimeMonth).toBe("2024-03");
      });
    });
  });
});
