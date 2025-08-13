import {
  createObservation,
  createTrace,
  createTracesCh,
} from "@langfuse/shared/src/server";
import { createObservationsCh } from "@langfuse/shared/src/server";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetObservationsV1Response } from "@/src/features/public-api/types/observations";
import { randomUUID } from "crypto";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/observations API Endpoint", () => {
  describe("GET /api/public/observations", () => {
    it("should fetch all observations with basic data structure", async () => {
      const traceId = randomUUID();
      const timestamp = new Date();

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

      // Create multiple observations with different types and levels
      const observations = [
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "generation-observation",
          type: "GENERATION",
          level: "DEFAULT",
          start_time: timestamp.getTime(),
          end_time: timestamp.getTime() + 1000,
          input: "What is the capital of France?",
          output: "The capital of France is Paris.",
          provided_model_name: "gpt-4",
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "span-observation",
          type: "SPAN",
          level: "DEBUG",
          start_time: timestamp.getTime() + 500,
          end_time: timestamp.getTime() + 2000,
          input: "Processing request",
          output: "Request processed successfully",
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "event-observation",
          type: "EVENT",
          level: "WARNING",
          start_time: timestamp.getTime() + 1500,
          input: "User action recorded",
          metadata: { eventType: "click", target: "submit-button" },
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "agent-observation",
          type: "AGENT",
          level: "DEFAULT",
          start_time: timestamp.getTime() + 2000,
          end_time: timestamp.getTime() + 2500,
          provided_model_name: "claude-3-haiku",
          provided_usage_details: { input: 100, output: 50, total: 150 },
          provided_cost_details: { input: 0.001, output: 0.002, total: 0.003 },
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "tool-observation",
          type: "TOOL",
          level: "DEFAULT",
          start_time: timestamp.getTime() + 2500,
          end_time: timestamp.getTime() + 3000,
          input: "Search web for information",
          output: "Found relevant results",
          provided_model_name: "gpt-4o-mini",
          provided_usage_details: { input: 200, output: 100, total: 300 },
          provided_cost_details: { input: 0.002, output: 0.004, total: 0.006 },
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "chain-observation",
          type: "CHAIN",
          level: "DEFAULT",
          start_time: timestamp.getTime() + 3000,
          end_time: timestamp.getTime() + 3500,
          input: "Process multi-step workflow",
          output: "Workflow completed",
          provided_model_name: "gpt-4",
          provided_usage_details: { input: 500, output: 300, total: 800 },
          provided_cost_details: { input: 0.015, output: 0.03, total: 0.045 },
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "retriever-observation",
          type: "RETRIEVER",
          level: "DEFAULT",
          start_time: timestamp.getTime() + 3500,
          end_time: timestamp.getTime() + 4000,
          input: "Query document database",
          output: "Retrieved 5 relevant documents",
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "evaluator-observation",
          type: "EVALUATOR",
          level: "DEFAULT",
          start_time: timestamp.getTime() + 4000,
          input: null,
          output: null,
          end_time: null,
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "embedding-observation",
          type: "EMBEDDING",
          level: "DEFAULT",
          start_time: timestamp.getTime() + 4500,
          end_time: timestamp.getTime() + 4750,
          input: "Text to embed",
          output: "Vector embedding generated",
          provided_model_name: "text-embedding-ada-002",
          provided_usage_details: { input: 10, output: 0, total: 10 },
          provided_cost_details: { input: 0.0001, output: 0, total: 0.0001 },
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "guardrail-observation",
          type: "GUARDRAIL",
          level: "DEFAULT",
          start_time: timestamp.getTime() + 5000,
          provided_cost_details: { input: 0.0001, output: 0, total: 0.0001 },
        }),
      ];

      await createTracesCh([createdTrace]);
      await createObservationsCh(observations);

      const response = await makeZodVerifiedAPICall(
        GetObservationsV1Response,
        "GET",
        "/api/public/observations",
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

      const eventObs = createdObservations.find((obs) => obs.type === "EVENT");
      expect(eventObs).toBeDefined();
      expect(eventObs?.name).toBe("event-observation");
      expect(eventObs?.level).toBe("WARNING");
      expect(eventObs?.input).toBe("User action recorded");
      expect(eventObs?.metadata).toEqual({
        eventType: "click",
        target: "submit-button",
      });

      // Verify new observation types exist and have correct type
      const agentObs = createdObservations.find((obs) => obs.type === "AGENT");
      expect(agentObs).toBeDefined();
      expect(agentObs?.name).toBe("agent-observation");

      const toolObs = createdObservations.find((obs) => obs.type === "TOOL");
      expect(toolObs).toBeDefined();
      expect(toolObs?.name).toBe("tool-observation");

      const chainObs = createdObservations.find((obs) => obs.type === "CHAIN");
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

      // Create a trace
      const createdTrace = createTrace({
        id: traceId,
        project_id: projectId,
        timestamp: timestamp.getTime(),
      });

      // Create observations with different levels
      const observations = [
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "debug-observation",
          type: "EVENT",
          level: "DEBUG",
          start_time: timestamp.getTime(),
          input: "Debug information",
          output: "Debug output",
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "default-observation",
          type: "GENERATION",
          level: "DEFAULT",
          start_time: timestamp.getTime() + 1000,
          input: "Regular operation",
          output: "Operation completed",
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "warning-observation",
          type: "SPAN",
          level: "WARNING",
          start_time: timestamp.getTime() + 2000,
          input: "Warning condition detected",
          output: "Warning handled",
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "error-observation",
          type: "EVENT",
          level: "ERROR",
          start_time: timestamp.getTime() + 3000,
          input: "Error occurred",
          output: "Error logged",
        }),
      ];

      await createTracesCh([createdTrace]);
      await createObservationsCh(observations);

      // Test filtering by DEBUG level
      const debugResponse = await makeZodVerifiedAPICall(
        GetObservationsV1Response,
        "GET",
        `/api/public/observations?traceId=${traceId}&level=DEBUG`,
      );

      expect(debugResponse.body.data.length).toBe(1);
      expect(debugResponse.body.data[0]?.level).toBe("DEBUG");
      expect(debugResponse.body.data[0]?.name).toBe("debug-observation");
      expect(debugResponse.body.data[0]?.input).toBe("Debug information");

      // Test filtering by DEFAULT level
      const defaultResponse = await makeZodVerifiedAPICall(
        GetObservationsV1Response,
        "GET",
        `/api/public/observations?traceId=${traceId}&level=DEFAULT`,
      );

      expect(defaultResponse.body.data.length).toBe(1);
      expect(defaultResponse.body.data[0]?.level).toBe("DEFAULT");
      expect(defaultResponse.body.data[0]?.name).toBe("default-observation");
      expect(defaultResponse.body.data[0]?.type).toBe("GENERATION");

      // Test filtering by WARNING level
      const warningResponse = await makeZodVerifiedAPICall(
        GetObservationsV1Response,
        "GET",
        `/api/public/observations?traceId=${traceId}&level=WARNING`,
      );

      expect(warningResponse.body.data.length).toBe(1);
      expect(warningResponse.body.data[0]?.level).toBe("WARNING");
      expect(warningResponse.body.data[0]?.name).toBe("warning-observation");
      expect(warningResponse.body.data[0]?.type).toBe("SPAN");

      // Test filtering by ERROR level
      const errorResponse = await makeZodVerifiedAPICall(
        GetObservationsV1Response,
        "GET",
        `/api/public/observations?traceId=${traceId}&level=ERROR`,
      );

      expect(errorResponse.body.data.length).toBe(1);
      expect(errorResponse.body.data[0]?.level).toBe("ERROR");
      expect(errorResponse.body.data[0]?.name).toBe("error-observation");
      expect(errorResponse.body.data[0]?.input).toBe("Error occurred");
    });

    it("should return empty results when filtering by level with no matches", async () => {
      const traceId = randomUUID();
      const timestamp = new Date();

      // Create a trace
      const createdTrace = createTrace({
        id: traceId,
        project_id: projectId,
        timestamp: timestamp.getTime(),
      });

      // Create observations with only DEFAULT level
      const observations = [
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "default-observation-1",
          type: "EVENT",
          level: "DEFAULT",
          start_time: timestamp.getTime(),
        }),
        createObservation({
          id: randomUUID(),
          trace_id: traceId,
          project_id: projectId,
          name: "default-observation-2",
          type: "GENERATION",
          level: "DEFAULT",
          start_time: timestamp.getTime() + 1000,
        }),
      ];

      await createTracesCh([createdTrace]);
      await createObservationsCh(observations);

      // Test filtering by ERROR level (should return no results)
      const errorResponse = await makeZodVerifiedAPICall(
        GetObservationsV1Response,
        "GET",
        `/api/public/observations?traceId=${traceId}&level=ERROR`,
      );

      expect(errorResponse.body.data.length).toBe(0);
      expect(errorResponse.body.meta.totalItems).toBe(0);
      expect(errorResponse.body.meta.totalPages).toBe(0);
    });
  });
});
