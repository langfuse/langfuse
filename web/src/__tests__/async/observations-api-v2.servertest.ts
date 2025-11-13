import { createEvent, createEventsCh } from "@langfuse/shared/src/server";
import { makeZodVerifiedAPICall } from "@/src/__tests__/test-utils";
import { GetObservationsV2Response } from "@/src/features/public-api/types/observations";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
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

    it("should filter to only top-level observations when topLevelOnly=true", async () => {
      const traceId = randomUUID();
      const parentObsId = randomUUID();
      const childObsId = randomUUID();
      const uniqueName = `toplevel-test-${randomUUID().substring(0, 8)}`;
      const timestamp = new Date();
      const timeValue = timestamp.getTime() * 1000;

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
        `/api/public/v2/observations?fields=basic&traceId=${traceId}`,
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
        `/api/public/v2/observations?fields=basic&topLevelOnly=true&traceId=${traceId}`,
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
  });

  maybe("Cursor-based pagination", () => {
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
      await new Promise((resolve) => setTimeout(resolve, 100));

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
      await new Promise((resolve) => setTimeout(resolve, 100));

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
      await new Promise((resolve) => setTimeout(resolve, 100));

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
        `/api/public/v2/observations?traceId=${traceId}&limit=2&withCursor=${page1.body.meta.cursor}`,
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
        `/api/public/v2/observations?traceId=${traceId}&limit=2&withCursor=${page2.body.meta.cursor}`,
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
      await new Promise((resolve) => setTimeout(resolve, 100));

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
        `/api/public/v2/observations?userId=${userId}&limit=2&withCursor=${page1.body.meta.cursor}`,
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
      await new Promise((resolve) => setTimeout(resolve, 100));

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
        `/api/public/v2/observations?traceId=${traceId}&type=SPAN&limit=2&withCursor=${page1.body.meta.cursor}`,
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
        `/api/public/v2/observations?fields=id&withCursor=invalid-base64-string`,
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
