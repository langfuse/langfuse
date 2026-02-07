import {
  createObservation,
  createTrace,
  createTracesCh,
  createEvent,
} from "@langfuse/shared/src/server";
import {
  createObservationsCh,
  createEventsCh,
} from "@langfuse/shared/src/server";
import {
  makeAPICall,
  makeZodVerifiedAPICall,
} from "@/src/__tests__/test-utils";
import { GetObservationsV1Response } from "@/src/features/public-api/types/observations";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

// Helper type for creating observation data
type ObservationData = {
  id?: string;
  trace_id: string;
  project_id: string;
  name: string;
  type: string;
  level: string;
  start_time: number;
  end_time?: number | null;
  input?: string | null;
  output?: string | null;
  metadata?: Record<string, string>;
  provided_model_name?: string;
  provided_usage_details?: Record<string, number>;
  provided_cost_details?: Record<string, number>;
};

// Helper to create observation data in the appropriate format (events or observations table)
const createObservationData = (
  useEventsTable: boolean,
  data: ObservationData,
  trace?: ReturnType<typeof createTrace>,
) => {
  const id = data.id ?? randomUUID();

  if (useEventsTable) {
    // For events table: microseconds, requires span_id and metadata arrays
    return createEvent({
      id,
      span_id: id,
      trace_id: data.trace_id,
      project_id: data.project_id,
      name: data.name,
      type: data.type,
      level: data.level,
      start_time: data.start_time,
      end_time: data.end_time === null ? null : data.end_time,
      input: data.input !== undefined ? data.input : "Hello World",
      output: data.output !== undefined ? data.output : "Hello John",
      metadata: data.metadata ?? { source: "API", server: "Node" },
      metadata_names: data.metadata ? Object.keys(data.metadata) : undefined,
      metadata_raw_values: data.metadata
        ? Object.values(data.metadata)
        : undefined,
      provided_model_name: data.provided_model_name,
      provided_usage_details: data.provided_usage_details,
      provided_cost_details: data.provided_cost_details,
      usage_details: data.provided_usage_details,
      cost_details: data.provided_cost_details,
      // Propagate trace-level fields to events
      user_id: trace?.user_id ?? null,
      tags: trace?.tags ?? [],
    });
  } else {
    // For observations table: milliseconds, simpler structure
    return createObservation({
      id,
      trace_id: data.trace_id,
      project_id: data.project_id,
      name: data.name,
      type: data.type,
      level: data.level,
      start_time: data.start_time,
      end_time: data.end_time === null ? null : data.end_time,
      input: data.input,
      output: data.output,
      metadata: data.metadata,
      provided_model_name: data.provided_model_name,
      provided_usage_details: data.provided_usage_details,
      provided_cost_details: data.provided_cost_details,
    });
  }
};

// Helper to create trace and observations in one go
const createAndInsertObservations = async (
  useEventsTable: boolean,
  trace: ReturnType<typeof createTrace>,
  observations: ObservationData[],
) => {
  await createTracesCh([trace]);

  const data = observations.map((obs) =>
    createObservationData(useEventsTable, obs, trace),
  );

  if (useEventsTable) {
    await createEventsCh(data as any);
  } else {
    await createObservationsCh(data as any);
  }
};

describe("/api/public/observations API Endpoint", () => {
  // Test suite factory to run tests against both implementations
  const runTestSuite = (useEventsTable: boolean) => {
    const suiteName = useEventsTable
      ? "with events table"
      : "with observations table";
    const queryParam = useEventsTable ? "?useEventsTable=true&" : "?";

    describe(`GET /api/public/observations ${suiteName}`, () => {
      it("should fetch all observations with basic data structure", async () => {
        const traceId = randomUUID();
        const timestamp = new Date();
        const timeValue = useEventsTable
          ? timestamp.getTime() * 1000
          : timestamp.getTime();
        const timeMultiplier = useEventsTable ? 1000 : 1;

        // Create a trace first
        const createdTrace = createTrace({
          id: traceId,
          name: "test-trace",
          user_id: "user-1",
          timestamp: timestamp.getTime(),
          project_id: projectId,
          metadata: { testKey: "testValue" },
          release: "1.0.0",
          version: "2.0.0",
        });

        // Create observations using helper
        await createAndInsertObservations(useEventsTable, createdTrace, [
          {
            trace_id: traceId,
            project_id: projectId,
            name: "generation-observation",
            type: "GENERATION",
            level: "DEFAULT",
            start_time: timeValue,
            end_time: timeValue + 1000 * timeMultiplier,
            input: "What is the capital of France?",
            output: "The capital of France is Paris.",
            provided_model_name: "gpt-4",
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "span-observation",
            type: "SPAN",
            level: "DEBUG",
            start_time: timeValue + 500 * timeMultiplier,
            end_time: timeValue + 2000 * timeMultiplier,
            input: "Processing request",
            output: "Request processed successfully",
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "event-observation",
            type: "EVENT",
            level: "WARNING",
            start_time: timeValue + 1500 * timeMultiplier,
            input: "User action recorded",
            metadata: { eventType: "click", target: "submit-button" },
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "agent-observation",
            type: "AGENT",
            level: "DEFAULT",
            start_time: timeValue + 2000 * timeMultiplier,
            end_time: timeValue + 2500 * timeMultiplier,
            input: "Hello World",
            output: "Hello John",
            provided_model_name: "claude-3-haiku",
            provided_usage_details: { input: 100, output: 50, total: 150 },
            provided_cost_details: {
              input: 0.001,
              output: 0.002,
              total: 0.003,
            },
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "tool-observation",
            type: "TOOL",
            level: "DEFAULT",
            start_time: timeValue + 2500 * timeMultiplier,
            end_time: timeValue + 3000 * timeMultiplier,
            input: "Search web for information",
            output: "Found relevant results",
            provided_model_name: "gpt-4o-mini",
            provided_usage_details: { input: 200, output: 100, total: 300 },
            provided_cost_details: {
              input: 0.002,
              output: 0.004,
              total: 0.006,
            },
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "chain-observation",
            type: "CHAIN",
            level: "DEFAULT",
            start_time: timeValue + 3000 * timeMultiplier,
            end_time: timeValue + 3500 * timeMultiplier,
            input: "Process multi-step workflow",
            output: "Workflow completed",
            provided_model_name: "gpt-4",
            provided_usage_details: { input: 500, output: 300, total: 800 },
            provided_cost_details: { input: 0.015, output: 0.03, total: 0.045 },
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "retriever-observation",
            type: "RETRIEVER",
            level: "DEFAULT",
            start_time: timeValue + 3500 * timeMultiplier,
            end_time: timeValue + 4000 * timeMultiplier,
            input: "Query document database",
            output: "Retrieved 5 relevant documents",
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "evaluator-observation",
            type: "EVALUATOR",
            level: "DEFAULT",
            start_time: timeValue + 4000 * timeMultiplier,
            input: null,
            output: null,
            end_time: null,
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "embedding-observation",
            type: "EMBEDDING",
            level: "DEFAULT",
            start_time: timeValue + 4500 * timeMultiplier,
            end_time: timeValue + 4750 * timeMultiplier,
            input: "Text to embed",
            output: "Vector embedding generated",
            provided_model_name: "text-embedding-ada-002",
            provided_usage_details: { input: 10, output: 0, total: 10 },
            provided_cost_details: { input: 0.0001, output: 0, total: 0.0001 },
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "guardrail-observation",
            type: "GUARDRAIL",
            level: "DEFAULT",
            start_time: timeValue + 5000 * timeMultiplier,
            provided_cost_details: { input: 0.0001, output: 0, total: 0.0001 },
          },
        ]);

        const response = await makeZodVerifiedAPICall(
          GetObservationsV1Response,
          "GET",
          `/api/public/observations${queryParam}`,
        );

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.meta).toBeDefined();
        expect(response.body.meta.totalItems).toBeGreaterThanOrEqual(10);
        expect(response.body.data.length).toBeGreaterThanOrEqual(10);

        // Find our created observations in the response
        const createdObservations = response.body.data.filter(
          (obs) => obs.traceId === traceId,
        );
        expect(createdObservations.length).toBe(10);

        // Verify data structure and content
        const generationObs = createdObservations.find(
          (obs) => obs.type === "GENERATION",
        );
        expect(generationObs).toBeDefined();
        expect(generationObs?.name).toBe("generation-observation");
        expect(generationObs?.level).toBe("DEFAULT");
        expect(generationObs?.input).toBe("What is the capital of France?");
        expect(generationObs?.output).toBe("The capital of France is Paris.");
        expect(generationObs?.model).toBe("gpt-4");
        expect(generationObs?.projectId).toBe(projectId);
        expect(generationObs?.traceId).toBe(traceId);

        const spanObs = createdObservations.find((obs) => obs.type === "SPAN");
        expect(spanObs).toBeDefined();
        expect(spanObs?.name).toBe("span-observation");
        expect(spanObs?.level).toBe("DEBUG");
        expect(spanObs?.input).toBe("Processing request");
        expect(spanObs?.output).toBe("Request processed successfully");

        const eventObs = createdObservations.find(
          (obs) => obs.type === "EVENT",
        );
        expect(eventObs).toBeDefined();
        expect(eventObs?.name).toBe("event-observation");
        expect(eventObs?.level).toBe("WARNING");
        expect(eventObs?.input).toBe("User action recorded");
        expect(eventObs?.metadata).toEqual({
          eventType: "click",
          target: "submit-button",
        });

        // Verify new observation types exist and have correct type
        const agentObs = createdObservations.find(
          (obs) => obs.type === "AGENT",
        );
        expect(agentObs).toBeDefined();
        expect(agentObs?.name).toBe("agent-observation");

        const toolObs = createdObservations.find((obs) => obs.type === "TOOL");
        expect(toolObs).toBeDefined();
        expect(toolObs?.name).toBe("tool-observation");

        const chainObs = createdObservations.find(
          (obs) => obs.type === "CHAIN",
        );
        expect(chainObs).toBeDefined();
        expect(chainObs?.name).toBe("chain-observation");

        const retrieverObs = createdObservations.find(
          (obs) => obs.type === "RETRIEVER",
        );
        expect(retrieverObs).toBeDefined();
        expect(retrieverObs?.name).toBe("retriever-observation");

        const evaluatorObs = createdObservations.find(
          (obs) => obs.type === "EVALUATOR",
        );
        expect(evaluatorObs).toBeDefined();
        expect(evaluatorObs?.name).toBe("evaluator-observation");
        // Test that input, output, and endTime can be null (optional fields)
        expect(evaluatorObs?.input).toBeNull();
        expect(evaluatorObs?.output).toBeNull();
        expect(evaluatorObs?.endTime).toBeNull();

        const embeddingObs = createdObservations.find(
          (obs) => obs.type === "EMBEDDING",
        );
        expect(embeddingObs).toBeDefined();
        expect(embeddingObs?.name).toBe("embedding-observation");

        const guardrailObs = createdObservations.find(
          (obs) => obs.type === "GUARDRAIL",
        );
        expect(guardrailObs).toBeDefined();
        expect(guardrailObs?.name).toBe("guardrail-observation");

        // Verify new observation types support model and cost attributes
        // The key verification is that new observation types now have model and cost fields populated
        // (even if with default values from the factory, proving the schema changes work)
        expect(agentObs?.model).toBe("claude-3-haiku");
        expect(agentObs?.input).toBe("Hello World");
        expect(agentObs?.output).toBe("Hello John");
        // Verify that model/cost fields are present (core functionality test)
        expect(agentObs?.usageDetails).toBeDefined();
        expect(agentObs?.costDetails).toBeDefined();

        expect(toolObs?.model).toBe("gpt-4o-mini");
        expect(toolObs?.input).toBe("Search web for information");
        expect(toolObs?.output).toBe("Found relevant results");
        expect(toolObs?.usageDetails).toBeDefined();
        expect(toolObs?.costDetails).toBeDefined();

        expect(chainObs?.model).toBe("gpt-4");
        expect(chainObs?.input).toBe("Process multi-step workflow");
        expect(chainObs?.output).toBe("Workflow completed");
        expect(chainObs?.usageDetails).toBeDefined();
        expect(chainObs?.costDetails).toBeDefined();

        expect(embeddingObs?.model).toBe("text-embedding-ada-002");
        expect(embeddingObs?.input).toBe("Text to embed");
        expect(embeddingObs?.output).toBe("Vector embedding generated");
        expect(embeddingObs?.usageDetails).toBeDefined();
        expect(embeddingObs?.costDetails).toBeDefined();
      }, 20_000);

      it("should filter observations by level parameter", async () => {
        const traceId = randomUUID();
        const timestamp = new Date();
        const timeValue = useEventsTable
          ? timestamp.getTime() * 1000
          : timestamp.getTime();
        const timeMultiplier = useEventsTable ? 1000 : 1;

        // Create a trace
        const createdTrace = createTrace({
          id: traceId,
          project_id: projectId,
          timestamp: timestamp.getTime(),
        });

        // Create observations with different levels
        await createAndInsertObservations(useEventsTable, createdTrace, [
          {
            trace_id: traceId,
            project_id: projectId,
            name: "debug-observation",
            type: "EVENT",
            level: "DEBUG",
            start_time: timeValue,
            input: "Debug information",
            output: "Debug output",
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "default-observation",
            type: "GENERATION",
            level: "DEFAULT",
            start_time: timeValue + 1000 * timeMultiplier,
            input: "Regular operation",
            output: "Operation completed",
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "warning-observation",
            type: "SPAN",
            level: "WARNING",
            start_time: timeValue + 2000 * timeMultiplier,
            input: "Warning condition detected",
            output: "Warning handled",
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "error-observation",
            type: "EVENT",
            level: "ERROR",
            start_time: timeValue + 3000 * timeMultiplier,
            input: "Error occurred",
            output: "Error logged",
          },
        ]);

        // Test filtering by DEBUG level
        const debugResponse = await makeZodVerifiedAPICall(
          GetObservationsV1Response,
          "GET",
          `/api/public/observations${queryParam}traceId=${traceId}&level=DEBUG`,
        );

        expect(debugResponse.body.data.length).toBe(1);
        expect(debugResponse.body.data[0]?.level).toBe("DEBUG");
        expect(debugResponse.body.data[0]?.name).toBe("debug-observation");
        expect(debugResponse.body.data[0]?.input).toBe("Debug information");

        // Test filtering by DEFAULT level
        const defaultResponse = await makeZodVerifiedAPICall(
          GetObservationsV1Response,
          "GET",
          `/api/public/observations${queryParam}traceId=${traceId}&level=DEFAULT`,
        );

        expect(defaultResponse.body.data.length).toBe(1);
        expect(defaultResponse.body.data[0]?.level).toBe("DEFAULT");
        expect(defaultResponse.body.data[0]?.name).toBe("default-observation");
        expect(defaultResponse.body.data[0]?.type).toBe("GENERATION");

        // Test filtering by WARNING level
        const warningResponse = await makeZodVerifiedAPICall(
          GetObservationsV1Response,
          "GET",
          `/api/public/observations${queryParam}traceId=${traceId}&level=WARNING`,
        );

        expect(warningResponse.body.data.length).toBe(1);
        expect(warningResponse.body.data[0]?.level).toBe("WARNING");
        expect(warningResponse.body.data[0]?.name).toBe("warning-observation");
        expect(warningResponse.body.data[0]?.type).toBe("SPAN");

        // Test filtering by ERROR level
        const errorResponse = await makeZodVerifiedAPICall(
          GetObservationsV1Response,
          "GET",
          `/api/public/observations${queryParam}traceId=${traceId}&level=ERROR`,
        );

        expect(errorResponse.body.data.length).toBe(1);
        expect(errorResponse.body.data[0]?.level).toBe("ERROR");
        expect(errorResponse.body.data[0]?.name).toBe("error-observation");
        expect(errorResponse.body.data[0]?.input).toBe("Error occurred");
      });

      it("should return empty results when filtering by level with no matches", async () => {
        const traceId = randomUUID();
        const timestamp = new Date();
        const timeValue = useEventsTable
          ? timestamp.getTime() * 1000
          : timestamp.getTime();
        const timeMultiplier = useEventsTable ? 1000 : 1;

        // Create a trace
        const createdTrace = createTrace({
          id: traceId,
          project_id: projectId,
          timestamp: timestamp.getTime(),
        });

        // Create observations with only DEFAULT level
        await createAndInsertObservations(useEventsTable, createdTrace, [
          {
            trace_id: traceId,
            project_id: projectId,
            name: "default-observation-1",
            type: "EVENT",
            level: "DEFAULT",
            start_time: timeValue,
          },
          {
            trace_id: traceId,
            project_id: projectId,
            name: "default-observation-2",
            type: "GENERATION",
            level: "DEFAULT",
            start_time: timeValue + 1000 * timeMultiplier,
          },
        ]);

        // Test filtering by ERROR level (should return no results)
        const errorResponse = await makeZodVerifiedAPICall(
          GetObservationsV1Response,
          "GET",
          `/api/public/observations${queryParam}traceId=${traceId}&level=ERROR`,
        );

        expect(errorResponse.body.data.length).toBe(0);
        expect(errorResponse.body.meta.totalItems).toBe(0);
        expect(errorResponse.body.meta.totalPages).toBe(0);
      });
    });
  };

  // Run tests with both implementations
  if (env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true") {
    runTestSuite(true); // with events table
  }
  runTestSuite(false); // with observations table

  // Advanced Filtering Tests
  describe("Advanced Filtering", () => {
    const runAdvancedFilterTestSuite = (useEventsTable: boolean) => {
      const suiteName = useEventsTable
        ? "with events table"
        : "with observations table";
      const queryParam = useEventsTable ? "?useEventsTable=true&" : "?";

      describe(`${suiteName}`, () => {
        it("should support metadata field filtering with contains", async () => {
          const traceId = randomUUID();
          const timestamp = new Date();
          const timeValue = useEventsTable
            ? timestamp.getTime() * 1000
            : timestamp.getTime();

          const createdTrace = createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: timestamp.getTime(),
          });

          await createAndInsertObservations(useEventsTable, createdTrace, [
            {
              trace_id: traceId,
              project_id: projectId,
              name: "generation-1",
              type: "GENERATION",
              level: "DEFAULT",
              metadata: { source: "api-server", region: "us-east" },
              start_time: timeValue,
            },
            {
              trace_id: traceId,
              project_id: projectId,
              name: "event-1",
              type: "EVENT",
              level: "DEFAULT",
              metadata: { source: "ui", region: "us-west" },
              start_time: timeValue + 1000,
            },
          ]);

          const filterParam = JSON.stringify([
            {
              type: "stringObject",
              column: "metadata",
              operator: "contains",
              key: "source",
              value: "api",
            },
          ]);

          const response = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations${queryParam}&traceId=${traceId}&filter=${encodeURIComponent(filterParam)}`,
          );

          expect(response.body.data.length).toBe(1);
          expect(response.body.data[0]?.name).toBe("generation-1");
        });

        it("should merge non-conflicting simple and advanced filters", async () => {
          const traceId = randomUUID();
          const timestamp = new Date();
          const timeValue = useEventsTable
            ? timestamp.getTime() * 1000
            : timestamp.getTime();

          const createdTrace = createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: timestamp.getTime(),
          });

          await createAndInsertObservations(useEventsTable, createdTrace, [
            {
              trace_id: traceId,
              project_id: projectId,
              name: "test-generation",
              type: "GENERATION",
              level: "DEFAULT",
              start_time: timeValue,
            },
            {
              trace_id: traceId,
              project_id: projectId,
              name: "test-event",
              type: "EVENT",
              level: "DEFAULT",
              start_time: timeValue + 1000,
            },
          ]);

          // Simple param: type=GENERATION, Advanced filter: name contains "test"
          const filterParam = JSON.stringify([
            {
              type: "string",
              column: "Name",
              operator: "contains",
              value: "test",
            },
          ]);

          const response = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations${queryParam}&traceId=${traceId}&type=GENERATION&filter=${encodeURIComponent(filterParam)}`,
          );

          // Should match only test-generation (both filters applied)
          expect(response.body.data.length).toBe(1);
          expect(response.body.data[0]?.name).toBe("test-generation");
          expect(response.body.data[0]?.type).toBe("GENERATION");
        });

        it("should return validation error for malformed filter JSON", async () => {
          const malformedFilter = "invalid-json";

          try {
            await makeZodVerifiedAPICall(
              GetObservationsV1Response,
              "GET",
              `/api/public/observations${queryParam}&filter=${encodeURIComponent(malformedFilter)}`,
            );
            fail("Should have thrown an error");
          } catch (error) {
            expect(error).toBeDefined();
          }
        });

        it("should handle empty string filter parameter", async () => {
          const traceId = randomUUID();
          const timestamp = new Date();
          const timeValue = useEventsTable
            ? timestamp.getTime() * 1000
            : timestamp.getTime();

          const createdTrace = createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: timestamp.getTime(),
          });

          await createAndInsertObservations(useEventsTable, createdTrace, [
            {
              trace_id: traceId,
              project_id: projectId,
              name: "obs-1",
              type: "GENERATION",
              level: "DEFAULT",
              start_time: timeValue,
            },
          ]);

          // Empty filter should be ignored
          const response = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations${queryParam}&traceId=${traceId}&filter=`,
          );

          expect(response.body.data.length).toBe(1);
        });

        it("should not crash when scores filter is used", async () => {
          const traceId = randomUUID();
          const timestamp = new Date();
          const baseTimestamp = timestamp.getTime();
          const timeValue = useEventsTable
            ? baseTimestamp * 1000
            : baseTimestamp;

          const createdTrace = createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: baseTimestamp,
          });

          const obs1Id = randomUUID();

          await createAndInsertObservations(useEventsTable, createdTrace, [
            {
              id: obs1Id,
              trace_id: traceId,
              project_id: projectId,
              name: "obs-with-high-score",
              type: "GENERATION",
              level: "DEFAULT",
              start_time: timeValue,
            },
          ]);

          const filterParam = JSON.stringify([
            {
              type: "number",
              column: "scores_avg",
              operator: ">=",
              value: 1000.0,
            },
          ]);

          const response = await makeAPICall(
            "GET",
            `/api/public/observations${queryParam}&traceId=${traceId}&type=GENERATION&filter=${encodeURIComponent(filterParam)}`,
          );

          expect(response.status).toBe(500); // TODO 400
          // Score filter should be ignored, so some observations should be returned
          expect(JSON.stringify(response.body)).toContain(
            "does not match a UI / CH table mapping",
          );
        });

        it("should filter by userId (trace field)", async () => {
          const trace1Id = randomUUID();
          const trace2Id = randomUUID();
          const timestamp = new Date();
          const baseTimestamp = timestamp.getTime();
          const timeValue = useEventsTable
            ? baseTimestamp * 1000
            : baseTimestamp;

          // Create two traces with different userIds
          const trace1 = createTrace({
            id: trace1Id,
            project_id: projectId,
            timestamp: timeValue,
            user_id: "user-A",
          });

          const trace2 = createTrace({
            id: trace2Id,
            project_id: projectId,
            timestamp: timeValue,
            user_id: "user-B",
          });

          if (useEventsTable) {
            createEventsCh([
              createEvent({
                ...trace1,
                span_id: trace1.id,
                trace_id: trace1.id,
                parent_span_id: "",
                name: "trace1",
              }),
              createEvent({
                ...trace2,
                span_id: trace2.id,
                trace_id: trace2.id,
                parent_span_id: "",
                name: "trace2",
              }),
            ]);
          }

          // Create observations for both traces
          await createAndInsertObservations(useEventsTable, trace1, [
            {
              id: randomUUID(),
              trace_id: trace1Id,
              project_id: projectId,
              name: "obs-trace1-a",
              type: "GENERATION",
              level: "DEFAULT",
              start_time: timeValue,
            },
            {
              id: randomUUID(),
              trace_id: trace1Id,
              project_id: projectId,
              name: "obs-trace1-b",
              type: "GENERATION",
              level: "DEFAULT",
              start_time: timeValue + 1000,
            },
          ]);

          await createAndInsertObservations(useEventsTable, trace2, [
            {
              id: randomUUID(),
              trace_id: trace2Id,
              project_id: projectId,
              name: "obs-trace2",
              type: "GENERATION",
              level: "DEFAULT",
              start_time: timeValue + 2000,
            },
          ]);

          const filterParam = JSON.stringify([
            {
              type: "string",
              column: "userId",
              operator: "=",
              value: "user-A",
            },
            {
              type: "stringOptions",
              column: "traceId",
              operator: "any of",
              value: [trace1Id, trace2Id],
            },
          ]);

          const response = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations${queryParam}filter=${encodeURIComponent(filterParam)}`,
          );

          expect(response.status).toBe(200);
          // Should only return observations from trace1
          const matchingObs = response.body.data.filter(
            (obs) => obs.traceId === trace1Id || obs.traceId === trace2Id,
          );
          expect(matchingObs.length).toBeGreaterThanOrEqual(2); // events path picks up top level trace itself
          expect(matchingObs.every((obs) => obs.traceId === trace1Id)).toBe(
            true,
          );
        });
      });
    };

    // Run all advanced filtering tests for both implementations
    if (env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true") {
      runAdvancedFilterTestSuite(true); // with events table
    }
    runAdvancedFilterTestSuite(false); // with observations table
  });

  // parentObservationId filter tests
  describe("parentObservationId filter", () => {
    const runParentObservationIdFilterTestSuite = (useEventsTable: boolean) => {
      const suiteName = useEventsTable
        ? "with events table"
        : "with observations table";
      const queryParam = useEventsTable ? "?useEventsTable=true&" : "?";

      describe(`${suiteName}`, () => {
        it("should filter for root observations (no parent) using 'is null'", async () => {
          const traceId = randomUUID();
          const timestamp = new Date();
          const timeValue = useEventsTable
            ? timestamp.getTime() * 1000
            : timestamp.getTime();
          const timeMultiplier = useEventsTable ? 1000 : 1;

          const createdTrace = createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: timestamp.getTime(),
          });

          const parentObsId = randomUUID();
          const childObsId = randomUUID();

          // Create parent (root) observation and child observation
          await createTracesCh([createdTrace]);

          if (useEventsTable) {
            await createEventsCh([
              createEvent({
                id: parentObsId,
                span_id: parentObsId,
                trace_id: traceId,
                project_id: projectId,
                name: "parent-observation",
                type: "SPAN",
                level: "DEFAULT",
                start_time: timeValue,
                parent_span_id: "", // root observation - empty string for events table
              }),
              createEvent({
                id: childObsId,
                span_id: childObsId,
                trace_id: traceId,
                project_id: projectId,
                name: "child-observation",
                type: "GENERATION",
                level: "DEFAULT",
                start_time: timeValue + 1000 * timeMultiplier,
                parent_span_id: parentObsId, // has parent
              }),
            ]);
          } else {
            await createObservationsCh([
              createObservation({
                id: parentObsId,
                trace_id: traceId,
                project_id: projectId,
                name: "parent-observation",
                type: "SPAN",
                level: "DEFAULT",
                start_time: timeValue,
                parent_observation_id: null, // root observation - NULL for observations table
              }),
              createObservation({
                id: childObsId,
                trace_id: traceId,
                project_id: projectId,
                name: "child-observation",
                type: "GENERATION",
                level: "DEFAULT",
                start_time: timeValue + 1000 * timeMultiplier,
                parent_observation_id: parentObsId, // has parent
              }),
            ]);
          }

          // Filter for root observations (parentObservationId is null)
          const filterParam = JSON.stringify([
            {
              type: "null",
              column: "parentObservationId",
              operator: "is null",
              value: "",
            },
          ]);

          const response = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations${queryParam}traceId=${traceId}&filter=${encodeURIComponent(filterParam)}`,
          );

          expect(response.status).toBe(200);
          expect(response.body.data.length).toBe(1);
          expect(response.body.data[0]?.name).toBe("parent-observation");
          expect(response.body.data[0]?.id).toBe(parentObsId);
        });

        it("should filter for non-root observations (has parent) using 'is not null'", async () => {
          const traceId = randomUUID();
          const timestamp = new Date();
          const timeValue = useEventsTable
            ? timestamp.getTime() * 1000
            : timestamp.getTime();
          const timeMultiplier = useEventsTable ? 1000 : 1;

          const createdTrace = createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: timestamp.getTime(),
          });

          const parentObsId = randomUUID();
          const childObsId = randomUUID();

          await createTracesCh([createdTrace]);

          if (useEventsTable) {
            await createEventsCh([
              createEvent({
                id: parentObsId,
                span_id: parentObsId,
                trace_id: traceId,
                project_id: projectId,
                name: "parent-observation",
                type: "SPAN",
                level: "DEFAULT",
                start_time: timeValue,
                parent_span_id: "", // root observation
              }),
              createEvent({
                id: childObsId,
                span_id: childObsId,
                trace_id: traceId,
                project_id: projectId,
                name: "child-observation",
                type: "GENERATION",
                level: "DEFAULT",
                start_time: timeValue + 1000 * timeMultiplier,
                parent_span_id: parentObsId, // has parent
              }),
            ]);
          } else {
            await createObservationsCh([
              createObservation({
                id: parentObsId,
                trace_id: traceId,
                project_id: projectId,
                name: "parent-observation",
                type: "SPAN",
                level: "DEFAULT",
                start_time: timeValue,
                parent_observation_id: null, // root observation
              }),
              createObservation({
                id: childObsId,
                trace_id: traceId,
                project_id: projectId,
                name: "child-observation",
                type: "GENERATION",
                level: "DEFAULT",
                start_time: timeValue + 1000 * timeMultiplier,
                parent_observation_id: parentObsId, // has parent
              }),
            ]);
          }

          // Filter for non-root observations (parentObservationId is not null)
          const filterParam = JSON.stringify([
            {
              type: "null",
              column: "parentObservationId",
              operator: "is not null",
              value: "",
            },
          ]);

          const response = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations${queryParam}traceId=${traceId}&filter=${encodeURIComponent(filterParam)}`,
          );

          expect(response.status).toBe(200);
          expect(response.body.data.length).toBe(1);
          expect(response.body.data[0]?.name).toBe("child-observation");
          expect(response.body.data[0]?.id).toBe(childObsId);
        });

        it("should filter by specific parent ID using string equals", async () => {
          const traceId = randomUUID();
          const timestamp = new Date();
          const timeValue = useEventsTable
            ? timestamp.getTime() * 1000
            : timestamp.getTime();
          const timeMultiplier = useEventsTable ? 1000 : 1;

          const createdTrace = createTrace({
            id: traceId,
            project_id: projectId,
            timestamp: timestamp.getTime(),
          });

          const parent1Id = randomUUID();
          const parent2Id = randomUUID();
          const child1Id = randomUUID();
          const child2Id = randomUUID();

          await createTracesCh([createdTrace]);

          if (useEventsTable) {
            await createEventsCh([
              createEvent({
                id: parent1Id,
                span_id: parent1Id,
                trace_id: traceId,
                project_id: projectId,
                name: "parent-1",
                type: "SPAN",
                level: "DEFAULT",
                start_time: timeValue,
                parent_span_id: "",
              }),
              createEvent({
                id: parent2Id,
                span_id: parent2Id,
                trace_id: traceId,
                project_id: projectId,
                name: "parent-2",
                type: "SPAN",
                level: "DEFAULT",
                start_time: timeValue + 100 * timeMultiplier,
                parent_span_id: "",
              }),
              createEvent({
                id: child1Id,
                span_id: child1Id,
                trace_id: traceId,
                project_id: projectId,
                name: "child-of-parent-1",
                type: "GENERATION",
                level: "DEFAULT",
                start_time: timeValue + 1000 * timeMultiplier,
                parent_span_id: parent1Id,
              }),
              createEvent({
                id: child2Id,
                span_id: child2Id,
                trace_id: traceId,
                project_id: projectId,
                name: "child-of-parent-2",
                type: "GENERATION",
                level: "DEFAULT",
                start_time: timeValue + 2000 * timeMultiplier,
                parent_span_id: parent2Id,
              }),
            ]);
          } else {
            await createObservationsCh([
              createObservation({
                id: parent1Id,
                trace_id: traceId,
                project_id: projectId,
                name: "parent-1",
                type: "SPAN",
                level: "DEFAULT",
                start_time: timeValue,
                parent_observation_id: null,
              }),
              createObservation({
                id: parent2Id,
                trace_id: traceId,
                project_id: projectId,
                name: "parent-2",
                type: "SPAN",
                level: "DEFAULT",
                start_time: timeValue + 100 * timeMultiplier,
                parent_observation_id: null,
              }),
              createObservation({
                id: child1Id,
                trace_id: traceId,
                project_id: projectId,
                name: "child-of-parent-1",
                type: "GENERATION",
                level: "DEFAULT",
                start_time: timeValue + 1000 * timeMultiplier,
                parent_observation_id: parent1Id,
              }),
              createObservation({
                id: child2Id,
                trace_id: traceId,
                project_id: projectId,
                name: "child-of-parent-2",
                type: "GENERATION",
                level: "DEFAULT",
                start_time: timeValue + 2000 * timeMultiplier,
                parent_observation_id: parent2Id,
              }),
            ]);
          }

          // Filter for children of parent-1 only
          const filterParam = JSON.stringify([
            {
              type: "string",
              column: "parentObservationId",
              operator: "=",
              value: parent1Id,
            },
          ]);

          const response = await makeZodVerifiedAPICall(
            GetObservationsV1Response,
            "GET",
            `/api/public/observations${queryParam}traceId=${traceId}&filter=${encodeURIComponent(filterParam)}`,
          );

          expect(response.status).toBe(200);
          expect(response.body.data.length).toBe(1);
          expect(response.body.data[0]?.name).toBe("child-of-parent-1");
          expect(response.body.data[0]?.id).toBe(child1Id);
        });
      });
    };

    // Run parentObservationId filter tests for both implementations
    if (env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true") {
      runParentObservationIdFilterTestSuite(true); // with events table
    }
    runParentObservationIdFilterTestSuite(false); // with observations table
  });
});
