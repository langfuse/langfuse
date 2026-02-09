import {
  createEvent,
  createEventsCh,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetObservationsV2Response } from "@/src/features/public-api/types/observations";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import waitForExpect from "wait-for-expect";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_V2_APIS === "true"
    ? describe
    : describe.skip;

describe("/api/public/v2/observations API Endpoint", () => {
  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging
    // redis connection when everything else is skipped.
  });

  maybe("GET /api/public/v2/observations", () => {
    it("should fetch observations with only requested field groups", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000; // microseconds for events table

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

      // Request only basic field group (core is always included)
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?fields=basic`,
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

      // Verify core fields are always present
      expect(createdObs?.id).toBe(observationId);
      expect(createdObs?.traceId).toBe(traceId);
      expect(createdObs?.type).toBe("GENERATION");
      expect(createdObs?.startTime).toBeDefined();
      expect(createdObs?.endTime).toBeDefined();
      expect(createdObs?.projectId).toBe(projectId);

      // Verify basic fields are present
      expect(createdObs?.name).toBe("test-observation");
      expect(createdObs?.level).toBe("DEFAULT");

      // Verify fields from non-requested groups are not present
      expect(createdObs?.input).toBeUndefined();
      expect(createdObs?.output).toBeUndefined();
      expect(createdObs?.metadata).toBeUndefined();
      expect(createdObs?.providedModelName).toBeUndefined();
    });

    it("should return input/output as strings by default (parseIoAsJson=false)", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

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
        `/api/public/v2/observations?fields=io&traceId=${traceId}&parseIoAsJson=false`,
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
        `/api/public/v2/observations?fields=io&traceId=${traceId}&parseIoAsJson=true`,
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
        "/api/public/v2/observations",
      );

      expect(response1.status).toBe(200);
      expect(response1.body.data.length).toBeLessThanOrEqual(50);

      // Test custom limit
      const response2 = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        "/api/public/v2/observations?limit=5",
      );

      expect(response2.status).toBe(200);
      expect(response2.body.data.length).toBeLessThanOrEqual(5);
    });

    it("should support standard filters (name, type, level, etc.)", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

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
        `/api/public/v2/observations?fields=basic&name=unique-observation-name`,
      );

      expect(response.status).toBe(200);
      const obs = response.body.data.find((o: any) => o.id === observationId);
      expect(obs).toBeDefined();
      expect(obs?.name).toBe("unique-observation-name");
      expect(obs?.type).toBe("GENERATION");
      expect(obs?.level).toBe("WARNING");
    });

    it("should support filter parameter on various columns without SQL crashes", async () => {
      const traceId = randomUUID();
      const observationId1 = randomUUID();
      const observationId2 = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create observations with trace-level fields that require joins
      const observation1 = createEvent({
        id: observationId1,
        span_id: observationId1,
        trace_id: traceId,
        project_id: projectId,
        name: "filter-test-obs-1",
        type: "GENERATION",
        level: "DEFAULT",
        start_time: timeValue,
        end_time: timeValue + 2000 * 1000,
        provided_model_name: "gpt-4",
        // Trace-level fields (require join to traces table)
        user_id: "test-user-123",
        trace_name: "test-trace",
        tags: ["tag1", "tag2"],
        session_id: "session-abc",
      });

      const observation2 = createEvent({
        id: observationId2,
        span_id: observationId2,
        trace_id: traceId,
        project_id: projectId,
        name: "filter-test-obs-2",
        type: "SPAN",
        level: "WARNING",
        start_time: timeValue + 1000 * 1000,
        end_time: timeValue + 3000 * 1000,
        provided_model_name: "gpt-3.5-turbo",
        // Trace-level fields (require join to traces table)
        user_id: "test-user-456",
        trace_name: "different-trace",
        session_id: "session-xyz",
      });

      await createEventsCh([observation1, observation2]);

      // Wait for ClickHouse to process
      await waitForExpect(
        async () => {
          const result = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM events WHERE project_id = {projectId: String} AND span_id IN ({ids: Array(String)})`,
            params: { projectId, ids: [observationId1, observationId2] },
          });
          expect(Number(result[0]?.count)).toBeGreaterThanOrEqual(2);
        },
        5000,
        10,
      );

      // Focus on testing filter columns that may have complex handling
      // (trace-level fields now read directly from events table: userId, traceName, sessionId, traceTags, traceEnvironment)
      // and score-related columns that may require special handling
      const filterTestCases = [
        // Trace-level fields (now read directly from events table)
        {
          description: "trace field: userId",
          filter: [
            {
              type: "string",
              column: "userId",
              operator: "=",
              value: "test-user-123",
            },
          ],
        },
        {
          description: "trace field: traceName",
          filter: [
            {
              type: "string",
              column: "traceName",
              operator: "contains",
              value: "test",
            },
          ],
        },
        {
          description: "trace field: sessionId",
          filter: [
            {
              type: "string",
              column: "sessionId",
              operator: "=",
              value: "session-abc",
            },
          ],
        },
        {
          description: "trace field: traceEnvironment",
          filter: [
            {
              type: "string",
              column: "traceEnvironment",
              operator: "=",
              value: "production",
            },
          ],
        },
        // Also test a few events table columns to ensure they still work
        {
          description: "events field: name",
          filter: [
            {
              type: "string",
              column: "name",
              operator: "contains",
              value: "filter-test",
            },
          ],
        },
        {
          description: "events field: type",
          filter: [
            {
              type: "string",
              column: "type",
              operator: "=",
              value: "GENERATION",
            },
          ],
        },
      ];

      // Test each filter to ensure no SQL crashes
      for (const testCase of filterTestCases) {
        const filterParam = JSON.stringify(testCase.filter);
        const response = await makeZodVerifiedAPICall(
          GetObservationsV2Response,
          "GET",
          `/api/public/v2/observations?traceId=${traceId}&fields=basic,io,cost,model,metadata&filter=${encodeURIComponent(filterParam)}`,
        );

        // Main assertion: should not crash (200 status)
        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();

        // Response should be an array (even if empty)
        expect(Array.isArray(response.body.data)).toBe(true);
      }

      // Verify a trace-field filter (requires join) returns expected observations
      const userIdFilterParam = JSON.stringify([
        {
          type: "string",
          column: "userId",
          operator: "=",
          value: "test-user-123",
        },
      ]);
      const userIdFilterResponse = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&fields=basic&filter=${encodeURIComponent(userIdFilterParam)}`,
      );

      expect(userIdFilterResponse.status).toBe(200);
      // Only observation1 has user_id: "test-user-123"
      expect(userIdFilterResponse.body.data.length).toEqual(1);
      const userFilteredObs = userIdFilterResponse.body.data.find(
        (obs: any) => obs.id === observationId1,
      );
      expect(userFilteredObs).toBeDefined();

      // Verify trace name filter (requires join)
      const traceNameFilterParam = JSON.stringify([
        {
          type: "string",
          column: "traceName",
          operator: "contains",
          value: "test",
        },
      ]);
      const traceNameResponse = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&fields=basic&filter=${encodeURIComponent(traceNameFilterParam)}`,
      );

      expect(traceNameResponse.status).toBe(200);
      expect(traceNameResponse.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("should support nested metadata field filtering with stringObject", async () => {
      const traceId = randomUUID();
      const observationId1 = randomUUID();
      const observationId2 = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create observations with nested metadata
      const observation1 = createEvent({
        id: observationId1,
        span_id: observationId1,
        trace_id: traceId,
        project_id: projectId,
        name: "nested-metadata-obs-1",
        type: "GENERATION",
        level: "DEFAULT",
        start_time: timeValue,
        // Nested metadata: { scope: { name: "api-server" }, region: "us-east" }
        metadata: { scope: { name: "api-server" }, region: "us-east" },
        metadata_names: ["scope.name", "region"],
        metadata_raw_values: ["api-server", "us-east"],
      });

      const observation2 = createEvent({
        id: observationId2,
        span_id: observationId2,
        trace_id: traceId,
        project_id: projectId,
        name: "nested-metadata-obs-2",
        type: "SPAN",
        level: "DEFAULT",
        start_time: timeValue + 1000 * 1000,
        // Nested metadata: { scope: { name: "ui-client" }, region: "us-west" }
        metadata: { scope: { name: "ui-client" }, region: "us-west" },
        metadata_names: ["scope.name", "region"],
        metadata_raw_values: ["ui-client", "us-west"],
      });

      await createEventsCh([observation1, observation2]);

      // Wait for ClickHouse to process
      await waitForExpect(
        async () => {
          const result = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM events WHERE project_id = {projectId: String} AND span_id IN ({ids: Array(String)})`,
            params: { projectId, ids: [observationId1, observationId2] },
          });
          expect(Number(result[0]?.count)).toBeGreaterThanOrEqual(2);
        },
        5000,
        10,
      );

      // Filter using dot-notation key for nested metadata: scope.name contains "api"
      const filterParam = JSON.stringify([
        {
          type: "stringObject",
          column: "metadata",
          operator: "contains",
          key: "scope.name",
          value: "api",
        },
      ]);

      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&fields=basic,metadata&filter=${encodeURIComponent(filterParam)}`,
      );

      expect(response.status).toBe(200);
      // Only observation1 should match (scope.name contains "api")
      expect(response.body.data.length).toBe(1);
      const matchedObs = response.body.data.find(
        (obs: any) => obs.id === observationId1,
      );
      expect(matchedObs).toBeDefined();
      expect(matchedObs?.name).toBe("nested-metadata-obs-1");
    });
  });

  maybe("Metadata expansion with expandMetadata parameter", () => {
    // Cutoff is 200 chars - values longer than 200 chars are truncated by default
    const METADATA_CUTOFF = 200;

    it("should selectively expand only specified metadata keys", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create two long metadata values
      const longValue1 = "a".repeat(300);
      const longValue2 = "b".repeat(300);

      const observation = createEvent({
        id: observationId,
        span_id: observationId,
        trace_id: traceId,
        project_id: projectId,
        name: "selective-expansion-test",
        type: "GENERATION",
        level: "DEFAULT",
        start_time: timeValue,
        metadata: {
          expandMe: longValue1,
          keepTruncated: longValue2,
          shortKey: "shortValue",
        },
        metadata_names: ["expandMe", "keepTruncated", "shortKey"],
        metadata_raw_values: [longValue1, longValue2, "shortValue"],
      });

      await createEventsCh([observation]);

      // Wait for ClickHouse to process
      await waitForExpect(
        async () => {
          const result = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM events WHERE project_id = {projectId: String} AND span_id = {id: String}`,
            params: { projectId, id: observationId },
          });
          expect(Number(result[0]?.count)).toBeGreaterThanOrEqual(1);
        },
        5000,
        10,
      );

      // Request metadata with expansion for only 'expandMe' key
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&fields=metadata&expandMetadata=expandMe`,
      );

      expect(response.status).toBe(200);
      const obs = response.body.data.find((o: any) => o.id === observationId);
      expect(obs).toBeDefined();

      // 'expandMe' should be full (300 chars)
      expect(obs?.metadata?.expandMe?.length).toBe(300);
      expect(obs?.metadata?.expandMe).toBe(longValue1);

      // 'keepTruncated' should still be truncated (200 chars)
      expect(obs?.metadata?.keepTruncated?.length).toBe(METADATA_CUTOFF);
      expect(obs?.metadata?.keepTruncated).toBe(
        longValue2.substring(0, METADATA_CUTOFF),
      );

      // 'shortValue' should be present as is
      expect(obs?.metadata?.shortKey).toBe("shortValue");
    });

    it("should handle expansion of non-existent metadata key gracefully", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      const observation = createEvent({
        id: observationId,
        span_id: observationId,
        trace_id: traceId,
        project_id: projectId,
        name: "non-existent-key-test",
        type: "GENERATION",
        level: "DEFAULT",
        start_time: timeValue,
        metadata: { existingKey: "value" },
        metadata_names: ["existingKey"],
        metadata_raw_values: ["value"],
      });

      await createEventsCh([observation]);

      // Wait for ClickHouse to process
      await waitForExpect(
        async () => {
          const result = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM events WHERE project_id = {projectId: String} AND span_id = {id: String}`,
            params: { projectId, id: observationId },
          });
          expect(Number(result[0]?.count)).toBeGreaterThanOrEqual(1);
        },
        5000,
        10,
      );

      // Request expansion for a key that doesn't exist
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&fields=metadata&expandMetadata=nonExistentKey`,
      );

      // Should not error, just return metadata without the non-existent key
      expect(response.status).toBe(200);
      const obs = response.body.data.find((o: any) => o.id === observationId);
      expect(obs).toBeDefined();

      // Existing key should still be present
      expect(obs?.metadata?.existingKey).toBe("value");
      // Non-existent key should not be in metadata
      expect(obs?.metadata?.nonExistentKey).toBeUndefined();
    });

    it("should return truncated metadata when expandMetadata is empty string", async () => {
      const traceId = randomUUID();
      const observationId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create a long metadata value (> 200 chars)
      const longValue = "z".repeat(300);

      const observation = createEvent({
        id: observationId,
        span_id: observationId,
        trace_id: traceId,
        project_id: projectId,
        name: "empty-expansion-test",
        type: "GENERATION",
        level: "DEFAULT",
        start_time: timeValue,
        metadata: { longKey: longValue },
        metadata_names: ["longKey"],
        metadata_raw_values: [longValue],
      });

      await createEventsCh([observation]);

      // Wait for ClickHouse to process
      await waitForExpect(
        async () => {
          const result = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM events WHERE project_id = {projectId: String} AND span_id = {id: String}`,
            params: { projectId, id: observationId },
          });
          expect(Number(result[0]?.count)).toBeGreaterThanOrEqual(1);
        },
        5000,
        10,
      );

      // Request metadata with empty expandMetadata - should use truncated
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&fields=metadata&expandMetadata=`,
      );

      expect(response.status).toBe(200);
      const obs = response.body.data.find((o: any) => o.id === observationId);
      expect(obs).toBeDefined();

      // Metadata should still be present but truncated (empty expandMetadata means no expansion)
      expect(obs?.metadata?.longKey).toBeDefined();
      expect(obs?.metadata?.longKey?.length).toBe(METADATA_CUTOFF);
      expect(obs?.metadata?.longKey).toBe(
        longValue.substring(0, METADATA_CUTOFF),
      );
    });
  });

  maybe("Cursor-based pagination", () => {
    it("should apply LIMIT to query even on first request (no cursor)", async () => {
      // This test verifies the bug fix - the v2 API should respect limit
      // even on the first request without a cursor
      const traceId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create more observations than the limit
      const observations = [];
      for (let i = 0; i < 10; i++) {
        const obsId = randomUUID();
        observations.push(
          createEvent({
            id: obsId,
            span_id: obsId,
            trace_id: traceId,
            project_id: projectId,
            name: `limit-test-obs-${i}`,
            type: "GENERATION",
            level: "DEFAULT",
            start_time: timeValue + i * 1000 * 1000,
          }),
        );
      }

      await createEventsCh(observations);

      // Wait for ClickHouse to process
      await waitForExpect(
        async () => {
          const result = await queryClickhouse<{ count: string }>({
            query: `SELECT count() as count FROM events WHERE project_id = {projectId: String} AND trace_id = {traceId: String}`,
            params: { projectId, traceId },
          });
          expect(Number(result[0]?.count)).toBeGreaterThanOrEqual(10);
        },
        5000,
        10,
      );

      // Request with limit=5 - should return exactly 5, not all 10
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&limit=5`,
      );

      expect(response.status).toBe(200);
      // With the bug, this returns all 10 (no LIMIT applied)
      // After fix, this should return exactly 5
      expect(response.body.data.length).toBe(5);
      // Should have cursor since there are more results
      expect(response.body.meta.cursor).toBeDefined();
    });

    it("should return cursor when results equal limit", async () => {
      const traceId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create 3 observations
      const observations = [];
      for (let i = 0; i < 3; i++) {
        const obsId = randomUUID();
        observations.push(
          createEvent({
            id: obsId,
            span_id: obsId,
            trace_id: traceId,
            project_id: projectId,
            name: `cursor-test-obs-${i}`,
            type: "GENERATION",
            level: "DEFAULT",
            start_time: timeValue + i * 1000 * 1000, // 1 second apart
          }),
        );
      }

      await createEventsCh(observations);

      // Fetch with limit=2 (should have cursor since we have 3 observations)
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&limit=2`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
      expect(response.body.meta.cursor).toBeDefined();
      expect(typeof response.body.meta.cursor).toBe("string");
    });

    it("should not return cursor when results less than limit", async () => {
      const traceId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create only 2 observations
      const observations = [];
      for (let i = 0; i < 2; i++) {
        const obsId = randomUUID();
        observations.push(
          createEvent({
            id: obsId,
            span_id: obsId,
            trace_id: traceId,
            project_id: projectId,
            name: `no-cursor-test-obs-${i}`,
            type: "GENERATION",
            level: "DEFAULT",
            start_time: timeValue + i * 1000 * 1000,
          }),
        );
      }

      await createEventsCh(observations);

      // Fetch with limit=5 (should not have cursor since we only have 2)
      const response = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&limit=5`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(2);
      expect(response.body.meta.cursor).toBeUndefined();
    });

    it("should paginate correctly using cursor without overlap", async () => {
      const traceId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create 5 observations with distinct timestamps
      const observations = [];
      for (let i = 0; i < 5; i++) {
        const obsId = randomUUID();
        observations.push(
          createEvent({
            id: obsId,
            span_id: obsId,
            trace_id: traceId,
            project_id: projectId,
            name: `pagination-test-obs-${i}`,
            type: "GENERATION",
            level: "DEFAULT",
            start_time: timeValue + i * 1000 * 1000, // 1 second apart
          }),
        );
      }

      await createEventsCh(observations);

      // Fetch first page with limit=2
      const page1 = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&limit=2`,
      );

      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBe(2);
      expect(page1.body.meta.cursor).toBeDefined();

      const page1Ids = page1.body.data.map((obs: any) => obs.id);

      // Fetch second page using cursor
      const page2 = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&limit=2&cursor=${page1.body.meta.cursor}`,
      );

      expect(page2.status).toBe(200);
      expect(page2.body.data.length).toBe(2);
      expect(page2.body.meta.cursor).toBeDefined(); // Should have cursor for third page

      const page2Ids = page2.body.data.map((obs: any) => obs.id);

      // Verify no overlap between pages
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);

      // Fetch third page
      const page3 = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&limit=2&cursor=${page2.body.meta.cursor}`,
      );

      expect(page3.status).toBe(200);
      expect(page3.body.data.length).toBe(1); // Only 1 remaining
      expect(page3.body.meta.cursor).toBeUndefined(); // No more pages

      const page3Ids = page3.body.data.map((obs: any) => obs.id);

      // Verify all observations retrieved exactly once
      const allIds = [...page1Ids, ...page2Ids, ...page3Ids];
      expect(allIds.length).toBe(5);
      expect(new Set(allIds).size).toBe(5); // All unique
    });

    it("should handle cursor with observations having same start_time", async () => {
      const traceId1 = randomUUID();
      const traceId2 = randomUUID();
      const traceId3 = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;
      const userId = randomUUID();

      // Create observations with SAME start_time but different trace_ids
      // This tests the xxHash32(trace_id) ordering component
      const obs1 = createEvent({
        trace_id: traceId1,
        project_id: projectId,
        name: "same-time-obs-1",
        type: "GENERATION",
        level: "DEFAULT",
        user_id: userId,
        start_time: timeValue,
      });

      const obs2 = createEvent({
        trace_id: traceId2,
        project_id: projectId,
        name: "same-time-obs-2",
        type: "GENERATION",
        level: "DEFAULT",
        user_id: userId,
        start_time: timeValue, // Same time
      });

      const obs3 = createEvent({
        trace_id: traceId3,
        project_id: projectId,
        name: "same-time-obs-3",
        type: "GENERATION",
        level: "DEFAULT",
        user_id: userId,
        start_time: timeValue, // Same time
      });

      await createEventsCh([obs1, obs2, obs3]);

      // Fetch first page
      const page1 = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?userId=${userId}&limit=2&fromStartTime=${new Date(timeValue / 1000).toISOString()}&toStartTime=${new Date(timeValue / 1000 + 1000).toISOString()}`,
      );

      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBe(2);

      const page1Ids = page1.body.data.map((obs: any) => obs.id);

      // Fetch second page using cursor
      const page2 = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?userId=${userId}&limit=2&cursor=${page1.body.meta.cursor}`,
      );

      expect(page2.status).toBe(200);
      expect(page2.body.data.length).toBeGreaterThan(0);

      const page2Ids = page2.body.data.map((obs: any) => obs.id);

      // Verify no overlap (tests that xxHash32 ordering works)
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);

      // Verify that all events were fetched
      expect([...page1Ids, ...page2Ids].sort()).toEqual(
        [obs1, obs2, obs3].map((o) => o.span_id).sort(),
      );
    });

    it("should work with cursor and other filters", async () => {
      const traceId = randomUUID();
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

      // Create observations with specific type
      const observations = [];
      for (let i = 0; i < 4; i++) {
        const obsId = randomUUID();
        observations.push(
          createEvent({
            id: obsId,
            span_id: obsId,
            trace_id: traceId,
            project_id: projectId,
            name: `cursor-filter-obs-${i}`,
            type: "SPAN", // All same type
            level: "DEFAULT",
            start_time: timeValue + i * 1000 * 1000,
          }),
        );
      }

      await createEventsCh(observations);

      // Fetch first page with type filter
      const page1 = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&type=SPAN&limit=2`,
      );

      expect(page1.status).toBe(200);
      expect(page1.body.data.length).toBe(2);
      expect(page1.body.data.every((obs: any) => obs.type === "SPAN")).toBe(
        true,
      );
      expect(page1.body.meta.cursor).toBeDefined();

      // Fetch second page with same filter and cursor
      const page2 = await makeZodVerifiedAPICall(
        GetObservationsV2Response,
        "GET",
        `/api/public/v2/observations?traceId=${traceId}&type=SPAN&limit=2&cursor=${page1.body.meta.cursor}`,
      );

      expect(page2.status).toBe(200);
      expect(page2.body.data.length).toBe(2);
      expect(page2.body.data.every((obs: any) => obs.type === "SPAN")).toBe(
        true,
      );

      // Verify no overlap
      const page1Ids = page1.body.data.map((obs: any) => obs.id);
      const page2Ids = page2.body.data.map((obs: any) => obs.id);
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });

    it("should reject invalid cursor format", async () => {
      const { makeAPICall } = await import("@/src/__tests__/test-utils");
      const response = await makeAPICall(
        "GET",
        `/api/public/v2/observations?fields=id&cursor=invalid-base64-string`,
      );

      // Should fail validation
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message");
      expect((response.body as { message: string }).message).toContain(
        "Invalid cursor format",
      );
    });
  });
});
