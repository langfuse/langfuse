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
      expect(response.body.meta.totalItems).toBeGreaterThanOrEqual(3);
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);

      // Find our created observations in the response
      const createdObservations = response.body.data.filter(
        (obs) => obs.traceId === traceId,
      );
      expect(createdObservations.length).toBe(3);

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
    }, 15_000);

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
