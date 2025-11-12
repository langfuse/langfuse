import {
  createTrace,
  createTracesCh,
  createEvent,
  createEventsCh,
} from "@langfuse/shared/src/server";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetObservationsV2Response } from "@/src/features/public-api/types/observations";
import { randomUUID } from "crypto";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("/api/public/v2/observations API Endpoint", () => {
  describe("GET /api/public/v2/observations", () => {
    it("should fetch observations with only requested fields", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000; // microseconds for events table

      // Create a trace
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

      await createTracesCh([createdTrace]);

      // Create observation
      const observation = createEvent({
        id: observationId,
        span_id: observationId,
        trace_id: traceId,
        project_id: projectId,
        name: "test-observation",
        type: "GENERATION",
        level: "DEFAULT",
        start_time: timeValue,
        end_time: timeValue + 1000 * 1000,
        input: "What is the capital of France?",
        output: "The capital of France is Paris.",
        metadata: { source: "API" },
        metadata_names: ["source"],
        metadata_raw_values: ["API"],
        provided_model_name: "gpt-4",
      });

      await createEventsCh([observation]);

      // Request only specific fields
      const requestedFields = ["id", "name", "type", "traceId"];
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?fields=${requestedFields.join(",")}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.meta).toBeDefined();
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      // Find our created observation
      const createdObs = response.body.data.find(
        (obs: any) => obs.id === observationId,
      );
      expect(createdObs).toBeDefined();

      // Verify only requested fields are present
      const returnedFields = Object.keys(createdObs || {});
      expect(returnedFields.sort()).toEqual(requestedFields.sort());

      // Verify field values
      expect(createdObs?.id).toBe(observationId);
      expect(createdObs?.name).toBe("test-observation");
      expect(createdObs?.type).toBe("GENERATION");
      expect(createdObs?.traceId).toBe(traceId);

      // Verify fields not requested are not present
      expect(createdObs?.input).toBeUndefined();
      expect(createdObs?.output).toBeUndefined();
      expect(createdObs?.metadata).toBeUndefined();
      expect(createdObs?.model).toBeUndefined();
    });

    it("should filter to only top-level observations when topLevelOnly=true", async () => {
      const traceId = randomUUID();
      const parentObsId = randomUUID();
      const childObsId = randomUUID();
      const uniqueName = `toplevel-test-${randomUUID().substring(0, 8)}`;
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create trace
      const createdTrace = createTrace({
        id: traceId,
        name: "test-trace",
        user_id: "user-1",
        timestamp: timestamp.getTime(),
        project_id: projectId,
      });

      await createTracesCh([createdTrace]);

      // Create parent observation (top-level) with unique name
      const parentObs = createEvent({
        id: parentObsId,
        span_id: parentObsId,
        trace_id: traceId,
        project_id: projectId,
        name: `${uniqueName}-parent`,
        type: "SPAN",
        level: "DEFAULT",
        start_time: timeValue,
        end_time: timeValue + 5000 * 1000,
        parent_span_id: "", // Empty string for top-level spans
      });

      // Create child observation (nested) with unique name
      const childObs = createEvent({
        id: childObsId,
        span_id: childObsId,
        trace_id: traceId,
        project_id: projectId,
        name: `${uniqueName}-child`,
        type: "GENERATION",
        level: "DEFAULT",
        start_time: timeValue + 1000 * 1000,
        end_time: timeValue + 2000 * 1000,
        parent_span_id: parentObsId,
      });

      await createEventsCh([parentObs, childObs]);

      // Small delay to ensure ClickHouse has processed the inserts
      await new Promise((resolve) => setTimeout(resolve, 100));

      // First, verify both observations exist without topLevelOnly filter
      const allResponse = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?fields=id,name,parentObservationId&traceId=${traceId}`,
      );

      expect(allResponse.status).toBe(200);
      const allObs = allResponse.body.data.filter((obs: any) =>
        obs.name?.includes(uniqueName),
      );

      // Both observations should be present
      expect(allObs.length).toBe(2);

      // Now test with topLevelOnly=true
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?fields=id,name,parentObservationId&topLevelOnly=true&traceId=${traceId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();

      // Find observations from our trace
      const traceObservations = response.body.data.filter((obs: any) =>
        obs.name?.includes(uniqueName),
      );

      // Should only have parent (top-level) observation
      expect(traceObservations.length).toBe(1);
      expect(traceObservations[0].id).toBe(parentObsId);
      expect(traceObservations[0].name).toBe(`${uniqueName}-parent`);
      // parentObservationId is null for top-level observations (converted from empty string)
      expect(traceObservations[0].parentObservationId).toBeNull();

      // Child observation should not be in results
      const childInResults = traceObservations.find(
        (obs: any) => obs.id === childObsId,
      );
      expect(childInResults).toBeUndefined();
    });

    it("should return input/output as strings by default (parseIoAsJson=false)", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create trace
      const createdTrace = createTrace({
        id: traceId,
        name: "test-trace",
        timestamp: timestamp.getTime(),
        project_id: projectId,
      });

      await createTracesCh([createdTrace]);

      // Create observation with JSON input/output
      const jsonInput = JSON.stringify({ question: "What is 2+2?" });
      const jsonOutput = JSON.stringify({ answer: 4 });

      const observation = createEvent({
        id: observationId,
        span_id: observationId,
        trace_id: traceId,
        project_id: projectId,
        name: "test-observation",
        type: "GENERATION",
        level: "DEFAULT",
        start_time: timeValue,
        end_time: timeValue + 1000 * 1000,
        input: jsonInput,
        output: jsonOutput,
      });

      await createEventsCh([observation]);

      // Request with parseIoAsJson=false (default)
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?fields=id,input,output&traceId=${traceId}&parseIoAsJson=false`,
      );

      expect(response.status).toBe(200);
      const obs = response.body.data.find((o: any) => o.id === observationId);
      expect(obs).toBeDefined();

      // Input and output should be strings, not parsed objects
      expect(typeof obs?.input).toBe("string");
      expect(typeof obs?.output).toBe("string");
      expect(obs?.input).toBe(jsonInput);
      expect(obs?.output).toBe(jsonOutput);
    });

    it("should parse input/output as JSON when parseIoAsJson=true", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create trace
      const createdTrace = createTrace({
        id: traceId,
        name: "test-trace",
        timestamp: timestamp.getTime(),
        project_id: projectId,
      });

      await createTracesCh([createdTrace]);

      // Create observation with JSON input/output
      const inputData = { question: "What is 2+2?" };
      const outputData = { answer: 4 };

      const observation = createEvent({
        id: observationId,
        span_id: observationId,
        trace_id: traceId,
        project_id: projectId,
        name: "test-observation",
        type: "GENERATION",
        level: "DEFAULT",
        start_time: timeValue,
        end_time: timeValue + 1000 * 1000,
        input: JSON.stringify(inputData),
        output: JSON.stringify(outputData),
      });

      await createEventsCh([observation]);

      // Request with parseIoAsJson=true
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?fields=id,input,output&traceId=${traceId}&parseIoAsJson=true`,
      );

      expect(response.status).toBe(200);
      const obs = response.body.data.find((o: any) => o.id === observationId);
      expect(obs).toBeDefined();

      // Input and output should be parsed as objects
      expect(typeof obs?.input).toBe("object");
      expect(typeof obs?.output).toBe("object");
      expect(obs?.input).toEqual(inputData);
      expect(obs?.output).toEqual(outputData);
    });

    it("should respect limit parameter with default of 50", async () => {
      // Test default limit
      const response1 = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        "/api/public/v2/observations?fields=id",
      );

      expect(response1.status).toBe(200);
      expect(response1.body.data.length).toBeLessThanOrEqual(50);

      // Test custom limit
      const response2 = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        "/api/public/v2/observations?fields=id&limit=5",
      );

      expect(response2.status).toBe(200);
      expect(response2.body.data.length).toBeLessThanOrEqual(5);
    });

    it("should support standard filters (name, type, level, etc.)", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create trace
      const createdTrace = createTrace({
        id: traceId,
        name: "test-trace",
        timestamp: timestamp.getTime(),
        project_id: projectId,
      });

      await createTracesCh([createdTrace]);

      // Create observation with specific attributes
      const observation = createEvent({
        id: observationId,
        span_id: observationId,
        trace_id: traceId,
        project_id: projectId,
        name: "unique-observation-name",
        type: "GENERATION",
        level: "WARNING",
        start_time: timeValue,
      });

      await createEventsCh([observation]);

      // Test filtering by name
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?fields=id,name,type,level&name=unique-observation-name`,
      );

      expect(response.status).toBe(200);
      const obs = response.body.data.find((o: any) => o.id === observationId);
      expect(obs).toBeDefined();
      expect(obs?.name).toBe("unique-observation-name");
      expect(obs?.type).toBe("GENERATION");
      expect(obs?.level).toBe("WARNING");
    });
  });
});
