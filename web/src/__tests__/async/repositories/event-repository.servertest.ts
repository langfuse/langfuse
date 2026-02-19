import {
  createEvent,
  createEventsCh,
  getObservationsWithModelDataFromEventsTable,
  getObservationsCountFromEventsTable,
  getObservationByIdFromEventsTable,
  getObservationsFromEventsTableForPublicApi,
  getObservationsCountFromEventsTableForPublicApi,
  updateEvents,
  getTraceByIdFromEventsTable,
  getObservationsBatchIOFromEventsTable,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import { type FilterCondition } from "@langfuse/shared";
import waitForExpect from "wait-for-expect";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip;

function idFilter(id: string): FilterCondition {
  return {
    type: "string",
    column: "id",
    operator: "=",
    value: id,
  };
}

describe("Clickhouse Events Repository Test", () => {
  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging
    // redis connection when everything else is skipped.
  });

  maybe("getObservationsWithModelDataFromEventsTable", () => {
    it("should return observations with model data", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();
      const modelId = randomUUID();

      // Create a model with pricing
      await prisma.model.create({
        data: {
          id: modelId,
          projectId,
          modelName: `gpt-4-${modelId}`,
          matchPattern: `(?i)^(gpt-?4-${modelId})$`,
          startDate: new Date("2023-01-01"),
          unit: "TOKENS",

          pricingTiers: {
            create: {
              isDefault: true,
              conditions: [],
              name: "Standard",
              priority: 0,
              prices: {
                create: [
                  {
                    usageType: "input",
                    price: 0.03,
                    modelId,
                  },
                  {
                    usageType: "output",
                    price: 0.06,
                    modelId,
                  },
                  {
                    usageType: "total",
                    price: 0.09,
                    modelId,
                  },
                ],
              },
            },
          },
        },
      });

      const nowMicro = Date.now() * 1000;
      // Create event with model reference
      const event = createEvent({
        id: generationId,
        span_id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: `test-generation-${generationId}`,
        input: "Hello world, this is a test input",
        output: "This is a test response output",
        model_id: modelId,
        provided_model_name: `gpt-4-${modelId}`,
        start_time: nowMicro,
        end_time: nowMicro + 2000000, // +2 seconds
        completion_start_time: nowMicro + 2000000, // +2 seconds
      });

      await createEventsCh([event]);

      // Query observations
      const result = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [idFilter(generationId)],
        limit: 1000,
        offset: 0,
        selectIOAndMetadata: true,
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      const observation = result.find((o) => o.id === generationId);
      expect(observation).toBeDefined();
      expect(observation?.id).toBe(generationId);
      expect(observation?.traceId).toBe(traceId);
      expect(observation?.name).toBe(`test-generation-${generationId}`);
      expect(observation?.type).toBe("GENERATION");
      expect(observation?.internalModelId).toBe(modelId);
      expect(Number(observation?.inputPrice)).toBeCloseTo(0.03, 5);
      expect(Number(observation?.outputPrice)).toBeCloseTo(0.06, 5);
      expect(Number(observation?.totalPrice)).toBeCloseTo(0.09, 5);
      expect(observation?.latency).toBeGreaterThan(0);
      expect(observation?.timeToFirstToken).toBeGreaterThan(0);

      // Cleanup
      await prisma.model.delete({ where: { id: modelId } });
    });

    it("should return observations without model data when model is not found", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();

      const event = createEvent({
        id: generationId,
        span_id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-generation-no-model",
        input: "Test input",
        output: "Test output",
        model_id: null,
        provided_model_name: "unknown-model",
      });

      await createEventsCh([event]);

      const result = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [idFilter(generationId)],
        limit: 1000,
        offset: 0,
        selectIOAndMetadata: true,
      });

      const observation = result.find((o) => o.id === generationId);
      expect(observation).toBeDefined();
      expect(observation?.id).toBe(generationId);
      // Model data should be null or empty string
      expect(observation?.internalModelId || null).toBeNull();
      expect(observation?.inputPrice).toBeNull();
      expect(observation?.outputPrice).toBeNull();
      expect(observation?.totalPrice).toBeNull();
    });

    it("should respect limit and offset parameters", async () => {
      const traceId = randomUUID();
      const events = Array.from({ length: 5 }, (_, i) =>
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: projectId,
          trace_id: traceId,
          type: "SPAN",
          name: `test-event-${i}`,
          start_time: Date.now() + i * 1000,
        }),
      );

      await createEventsCh(events);

      const result1 = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [],
        limit: 2,
        offset: 0,
      });

      const result2 = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [],
        limit: 2,
        offset: 2,
      });

      expect(result1.length).toBeLessThanOrEqual(2);
      expect(result2.length).toBeLessThanOrEqual(2);
    });

    it("should handle events without end_time (null latency)", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();

      const event = createEvent({
        id: generationId,
        span_id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "no-end-time",
        end_time: null,
      });

      await createEventsCh([event]);

      const result = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [idFilter(generationId)],
        limit: 1000,
        offset: 0,
      });

      const observation = result.find((o) => o.id === generationId);
      expect(observation).toBeDefined();
      expect(observation?.latency).toBeNull();
    });

    it("should handle events without completion_start_time (null ttft)", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();

      const event = createEvent({
        id: generationId,
        span_id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "no-completion-start",
        completion_start_time: null,
      });

      await createEventsCh([event]);

      const result = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [idFilter(generationId)],
        limit: 1000,
        offset: 0,
      });

      const observation = result.find((o) => o.id === generationId);
      expect(observation).toBeDefined();
      expect(observation?.timeToFirstToken).toBeNull();
    });

    it("should respect selectIOAndMetadata parameter", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();

      const event = createEvent({
        id: generationId,
        span_id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "io-metadata-test",
        input: "Test input content",
        output: "Test output content",
        metadata: { key: "value" },
      });

      await createEventsCh([event]);

      const resultWithIO = await getObservationsWithModelDataFromEventsTable({
        projectId,
        filter: [idFilter(generationId)],
        limit: 1000,
        offset: 0,
        selectIOAndMetadata: true,
      });

      const resultWithoutIO = await getObservationsWithModelDataFromEventsTable(
        {
          projectId,
          filter: [idFilter(generationId)],
          limit: 1000,
          offset: 0,
          selectIOAndMetadata: false,
        },
      );

      expect(resultWithIO.length).toBeGreaterThanOrEqual(1);
      expect(resultWithoutIO.length).toBeGreaterThanOrEqual(1);
      expect(resultWithIO[0]?.input).toBeDefined();
      expect(resultWithoutIO[0]?.output).toBeDefined();
    });
  });

  maybe("getObservationsCountFromEventsTable", () => {
    it("should return 0 for non-existent project", async () => {
      const nonExistentProjectId = randomUUID();

      const count = await getObservationsCountFromEventsTable({
        projectId: nonExistentProjectId,
        filter: [],
      });

      expect(count).toBe(0);
    });

    it("should match the length of observations returned by getObservationsWithModelDataFromEventsTable", async () => {
      const uniqueProjectId = randomUUID();
      const uniqueTraceId = randomUUID();
      const events = Array.from({ length: 5 }, (_, i) =>
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: uniqueTraceId,
          type: "GENERATION",
          name: `matching-count-test-${i}`,
        }),
      );

      await createEventsCh(events);

      // Use the unique project ID to isolate our test data (no filters needed)
      const observations = await getObservationsWithModelDataFromEventsTable({
        projectId: uniqueProjectId,
        filter: [],
        limit: 100,
        offset: 0,
      });

      const count = await getObservationsCountFromEventsTable({
        projectId: uniqueProjectId,
        filter: [],
      });

      expect(count).toBe(5);
      expect(observations.length).toBe(5);
    });
  });

  maybe("Filter Tests", () => {
    describe("Timestamp Filters", () => {
      it("should filter observations by start time with >= operator", async () => {
        const uniqueProjectId = randomUUID();
        const traceId = randomUUID();
        const now = Date.now();
        const filterTime = new Date(now - 5000);

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: uniqueProjectId,
            trace_id: traceId,
            type: "SPAN",
            name: "old-event-gte",
            start_time: (now - 10000) * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: uniqueProjectId,
            trace_id: traceId,
            type: "SPAN",
            name: "exact-event-gte",
            start_time: filterTime.getTime() * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: uniqueProjectId,
            trace_id: traceId,
            type: "SPAN",
            name: "new-event-gte",
            start_time: now * 1000,
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId: uniqueProjectId,
          filter: [
            {
              type: "datetime",
              column: "startTime",
              operator: ">=",
              value: filterTime,
            },
          ],
          limit: 1000,
          offset: 0,
        });

        expect(result.length).toBe(2);
        const names = result.map((o) => o.name).sort();
        expect(names).toEqual(["exact-event-gte", "new-event-gte"]);
      });

      it("should filter observations by start time with <= operator", async () => {
        const uniqueProjectId = randomUUID();
        const traceId = randomUUID();
        const now = Date.now();
        const filterTime = new Date(now - 5000);

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: uniqueProjectId,
            trace_id: traceId,
            type: "SPAN",
            name: "old-event-lte",
            start_time: (now - 10000) * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: uniqueProjectId,
            trace_id: traceId,
            type: "SPAN",
            name: "exact-event-lte",
            start_time: filterTime.getTime() * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: uniqueProjectId,
            trace_id: traceId,
            type: "SPAN",
            name: "new-event-lte",
            start_time: now * 1000,
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId: uniqueProjectId,
          filter: [
            {
              type: "datetime",
              column: "startTime",
              operator: "<=",
              value: filterTime,
            },
          ],
          limit: 1000,
          offset: 0,
        });

        expect(result.length).toBe(2);
        const names = result.map((o) => o.name).sort();
        expect(names).toEqual(["exact-event-lte", "old-event-lte"]);
      });

      it("should filter observations by end time", async () => {
        const uniqueProjectId = randomUUID();
        const traceId = randomUUID();
        const now = Date.now();
        const filterTime = new Date(now - 2000);

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: uniqueProjectId,
            trace_id: traceId,
            type: "SPAN",
            name: "event-no-end",
            start_time: (now - 10000) * 1000,
            end_time: null,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: uniqueProjectId,
            trace_id: traceId,
            type: "SPAN",
            name: "event-old-end",
            start_time: (now - 10000) * 1000,
            end_time: (now - 5000) * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: uniqueProjectId,
            trace_id: traceId,
            type: "SPAN",
            name: "event-recent-end",
            start_time: (now - 5000) * 1000,
            end_time: now * 1000,
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId: uniqueProjectId,
          filter: [
            {
              type: "datetime",
              column: "endTime",
              operator: ">",
              value: filterTime,
            },
          ],
          limit: 1000,
          offset: 0,
        });

        expect(result.length).toBe(1);
        expect(result[0].name).toBe("event-recent-end");
      });
    });

    describe("Trace ID Filters", () => {
      it("should filter observations by multiple trace IDs with 'any of' operator", async () => {
        const traceId1 = randomUUID();
        const traceId2 = randomUUID();
        const traceId3 = randomUUID();

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId1,
            type: "SPAN",
            name: "trace-1-event",
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId2,
            type: "SPAN",
            name: "trace-2-event",
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId3,
            type: "SPAN",
            name: "trace-3-event",
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId,
          filter: [
            {
              type: "stringOptions",
              column: "traceId",
              operator: "any of",
              value: [traceId1, traceId2],
            },
          ],
          limit: 1000,
          offset: 0,
        });

        const filteredObservations = result.filter((o) =>
          [traceId1, traceId2, traceId3].includes(o.traceId ?? ""),
        );
        expect(filteredObservations.length).toBe(2);
        const traceIds = filteredObservations.map((o) => o.traceId).sort();
        expect(traceIds).toEqual([traceId1, traceId2].sort());
      });
    });

    describe("User ID Filters", () => {
      it("should filter observations by single user ID with stringOptions", async () => {
        const traceId1 = randomUUID();
        const traceId2 = randomUUID();
        const userId1 = "user-123";
        const userId2 = "user-456";

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId1,
            user_id: userId1,
            type: "SPAN",
            name: "user-1-event",
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId2,
            user_id: userId2,
            type: "SPAN",
            name: "user-2-event",
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId,
          filter: [
            {
              type: "stringOptions",
              column: "userId",
              operator: "any of",
              value: [userId1],
            },
          ],
          limit: 1000,
          offset: 0,
        });

        const filteredObservations = result.filter(
          (o) => o.traceId === traceId1 || o.traceId === traceId2,
        );
        expect(filteredObservations.length).toBe(1);
        expect(filteredObservations[0].name).toBe("user-1-event");
      });

      it("should filter observations by multiple user IDs with 'any of' operator", async () => {
        const traceId1 = randomUUID();
        const traceId2 = randomUUID();
        const traceId3 = randomUUID();
        const userId1 = "user-alpha";
        const userId2 = "user-beta";
        const userId3 = "user-gamma";

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId1,
            user_id: userId1,
            type: "SPAN",
            name: "user-alpha-event",
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId2,
            user_id: userId2,
            type: "SPAN",
            name: "user-beta-event",
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId3,
            user_id: userId3,
            type: "SPAN",
            name: "user-gamma-event",
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId,
          filter: [
            {
              type: "stringOptions",
              column: "userId",
              operator: "any of",
              value: [userId1, userId2],
            },
          ],
          limit: 1000,
          offset: 0,
        });

        const filteredObservations = result.filter((o) =>
          [traceId1, traceId2, traceId3].includes(o.traceId ?? ""),
        );
        expect(filteredObservations.length).toBe(2);
        const names = filteredObservations.map((o) => o.name).sort();
        expect(names).toEqual(["user-alpha-event", "user-beta-event"]);
      });

      it("should filter observations by user ID with 'none of' operator", async () => {
        const traceId1 = randomUUID();
        const traceId2 = randomUUID();
        const traceId3 = randomUUID();
        const userId1 = `user-exclude-1-${randomUUID()}`;
        const userId2 = `user-exclude-2-${randomUUID()}`;
        const userId3 = `user-include-${randomUUID()}`;

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId1,
            user_id: userId1,
            type: "SPAN",
            name: "excluded-1",
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId2,
            user_id: userId2,
            type: "SPAN",
            name: "excluded-2",
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId3,
            user_id: userId3,
            type: "SPAN",
            name: "included",
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId,
          filter: [
            {
              type: "stringOptions",
              column: "traceId",
              operator: "any of",
              value: [traceId1, traceId2, traceId3],
            },
            {
              type: "stringOptions",
              column: "userId",
              operator: "none of",
              value: [userId1, userId2],
            },
          ],
          limit: 1000,
          offset: 0,
        });

        expect(result.length).toBe(1);
        expect(result[0].name).toBe("included");
        expect(result[0].traceId).toBe(traceId3);
      });

      it("should handle observations with null user IDs", async () => {
        const traceId1 = randomUUID();
        const traceId2 = randomUUID();
        const userId = "user-with-id";

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId1,
            user_id: userId,
            type: "SPAN",
            name: "event-with-user",
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId2,
            user_id: null,
            type: "SPAN",
            name: "event-without-user",
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId,
          filter: [
            {
              type: "stringOptions",
              column: "userId",
              operator: "any of",
              value: [userId],
            },
          ],
          limit: 1000,
          offset: 0,
        });

        const filteredObservations = result.filter(
          (o) => o.traceId === traceId1 || o.traceId === traceId2,
        );
        expect(filteredObservations.length).toBe(1);
        expect(filteredObservations[0].name).toBe("event-with-user");
      });
    });

    describe("Combined Filters", () => {
      it("should filter observations by timestamp AND user ID", async () => {
        const traceId1 = randomUUID();
        const traceId2 = randomUUID();
        const traceId3 = randomUUID();
        const userId1 = "combined-user-1";
        const userId2 = "combined-user-2";
        const now = Date.now();
        const filterTime = new Date(now - 5000);

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId1,
            user_id: userId1,
            type: "SPAN",
            name: "old-user-1",
            start_time: (now - 10000) * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId2,
            user_id: userId1,
            type: "SPAN",
            name: "new-user-1",
            start_time: now * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId3,
            user_id: userId2,
            type: "SPAN",
            name: "new-user-2",
            start_time: now * 1000,
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId,
          filter: [
            {
              type: "datetime",
              column: "startTime",
              operator: ">",
              value: filterTime,
            },
            {
              type: "stringOptions",
              column: "userId",
              operator: "any of",
              value: [userId1],
            },
          ],
          limit: 1000,
          offset: 0,
        });

        const filteredObservations = result.filter((o) =>
          [traceId1, traceId2, traceId3].includes(o.traceId ?? ""),
        );
        expect(filteredObservations.length).toBe(1);
        expect(filteredObservations[0].name).toBe("new-user-1");
      });
    });
    describe("Metadata filters", () => {
      it("should filter observations by stringObject", async () => {
        const traceId = randomUUID();
        const now = Date.now();
        const filterTime = new Date(now - 5000);

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId,
            type: "SPAN",
            name: "md1",
            metadata: { source: "api-server", region: "us-east" },
            start_time: now * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId,
            type: "SPAN",
            name: "md2",
            metadata: { source: "UI", region: "us-east" },
            start_time: now * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId,
            type: "SPAN",
            name: "md3",
            metadata: { source: "UI", region: "us-west" },
            start_time: now * 1000,
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId,
          filter: [
            {
              type: "stringObject",
              column: "metadata",
              operator: "contains",
              key: "source",
              value: "api",
            },
            {
              type: "datetime",
              column: "startTime",
              operator: ">=",
              value: filterTime,
            },
            {
              type: "string",
              column: "traceId",
              operator: "=",
              value: traceId,
            },
          ],
          limit: 1000,
          offset: 0,
        });

        expect(result.length).toBe(1);
        expect(result[0].name).toBe("md1");
      });
    });
  });

  maybe("getObservationByIdFromEventsTable", () => {
    it("should return observation by id with input and output", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const event = createEvent({
        id: generationId,
        span_id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-generation-byid",
        input: "Test input for byId",
        output: "Test output for byId",
        provided_model_name: "gpt-4",
        start_time: nowMicro,
        end_time: nowMicro + 1000000,
      });

      await createEventsCh([event]);

      const observation = await getObservationByIdFromEventsTable({
        id: generationId,
        projectId,
        fetchWithInputOutput: true,
      });

      expect(observation).toBeDefined();
      expect(observation?.id).toBe(generationId);
      expect(observation?.traceId).toBe(traceId);
      expect(observation?.name).toBe("test-generation-byid");
      expect(observation?.type).toBe("GENERATION");
      expect(observation?.input).toBeDefined();
      expect(observation?.output).toBeDefined();
    });

    it("should return observation by id without input and output", async () => {
      const traceId = randomUUID();
      const spanId = randomUUID();

      const event = createEvent({
        id: spanId,
        span_id: spanId,
        project_id: projectId,
        trace_id: traceId,
        type: "SPAN",
        name: "test-span-byid",
        input: "Should not be returned",
        output: "Should not be returned",
      });

      await createEventsCh([event]);

      const observation = await getObservationByIdFromEventsTable({
        id: spanId,
        projectId,
        fetchWithInputOutput: false,
      });

      expect(observation).toBeDefined();
      expect(observation?.id).toBe(spanId);
      expect(observation?.input).toBeNull();
      expect(observation?.output).toBeNull();
    });

    it("should return observation by id with truncated input and output", async () => {
      const traceId = randomUUID();
      const generationId = randomUUID();

      const longInput = "x".repeat(50000);
      const longOutput = "y".repeat(50000);

      const event = createEvent({
        id: generationId,
        span_id: generationId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-generation-truncated",
        input: longInput,
        output: longOutput,
        provided_model_name: "gpt-4",
      });

      await createEventsCh([event]);

      const observation = await getObservationByIdFromEventsTable({
        id: generationId,
        projectId,
        fetchWithInputOutput: true,
        renderingProps: {
          truncated: true,
          shouldJsonParse: false,
        },
      });

      expect(observation).toBeDefined();
      expect(observation?.id).toBe(generationId);
      expect(observation?.input).toBeDefined();
      expect(observation?.output).toBeDefined();
      // Input and output should be truncated
      if (typeof observation?.input === "string") {
        expect(observation.input.length).toBeLessThan(longInput.length);
      }
      if (typeof observation?.output === "string") {
        expect(observation.output.length).toBeLessThan(longOutput.length);
      }
    });

    it("should filter by traceId when provided", async () => {
      const traceId1 = randomUUID();
      const traceId2 = randomUUID();
      const spanId = randomUUID();

      // Create observation in trace1
      const event = createEvent({
        id: spanId,
        span_id: spanId,
        project_id: projectId,
        trace_id: traceId1,
        type: "SPAN",
        name: "test-span-trace-filter",
      });

      await createEventsCh([event]);

      // Should find with correct traceId
      const observation = await getObservationByIdFromEventsTable({
        id: spanId,
        projectId,
        traceId: traceId1,
      });

      expect(observation).toBeDefined();
      expect(observation?.traceId).toBe(traceId1);

      // Should not find with wrong traceId
      await expect(
        getObservationByIdFromEventsTable({
          id: spanId,
          projectId,
          traceId: traceId2,
        }),
      ).rejects.toThrow();
    });

    it("should filter by type when provided", async () => {
      const traceId = randomUUID();
      const spanId = randomUUID();

      const event = createEvent({
        id: spanId,
        span_id: spanId,
        project_id: projectId,
        trace_id: traceId,
        type: "SPAN",
        name: "test-type-filter",
      });

      await createEventsCh([event]);

      // Should find with correct type
      const observation = await getObservationByIdFromEventsTable({
        id: spanId,
        projectId,
        type: "SPAN",
      });

      expect(observation).toBeDefined();
      expect(observation?.type).toBe("SPAN");

      // Should not find with wrong type
      await expect(
        getObservationByIdFromEventsTable({
          id: spanId,
          projectId,
          type: "GENERATION",
        }),
      ).rejects.toThrow();
    });

    it("should throw error when observation not found", async () => {
      const nonExistentId = randomUUID();

      await expect(
        getObservationByIdFromEventsTable({
          id: nonExistentId,
          projectId,
        }),
      ).rejects.toThrow("Observation with id");
    });

    it("should filter by startTime when provided", async () => {
      const traceId = randomUUID();
      const spanId = randomUUID();

      const startTime = new Date("2024-01-15T12:00:00Z");
      const startTimeMicro = startTime.getTime() * 1000;

      const event = createEvent({
        id: spanId,
        span_id: spanId,
        project_id: projectId,
        trace_id: traceId,
        type: "SPAN",
        name: "test-starttime-filter",
        start_time: startTimeMicro,
      });

      await createEventsCh([event]);

      // Should find with correct startTime
      const observation = await getObservationByIdFromEventsTable({
        id: spanId,
        projectId,
        startTime,
      });

      expect(observation).toBeDefined();

      // Should not find with different date
      const wrongDate = new Date("2024-01-16T12:00:00Z");
      await expect(
        getObservationByIdFromEventsTable({
          id: spanId,
          projectId,
          startTime: wrongDate,
        }),
      ).rejects.toThrow();
    });
  });

  maybe("getObservationsFromEventsTableForPublicApi", () => {
    it("should return observations with pagination", async () => {
      const uniqueProjectId = randomUUID();
      const traceId = randomUUID();

      const events = Array.from({ length: 5 }, (_, i) =>
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: traceId,
          type: "GENERATION",
          name: `pub-api-test-${i}`,
          start_time: (Date.now() + i * 1000) * 1000,
        }),
      );

      await createEventsCh(events);

      const result = await getObservationsFromEventsTableForPublicApi({
        projectId: uniqueProjectId,
        page: 1,
        limit: 3,
      });

      expect(result).toBeDefined();
      expect(result.length).toBeLessThanOrEqual(3);

      // Fetching the second page
      const resultPage2 = await getObservationsFromEventsTableForPublicApi({
        projectId: uniqueProjectId,
        page: 2,
        limit: 3,
      });

      expect(resultPage2).toBeDefined();
      expect(resultPage2.length).toBeLessThanOrEqual(2);

      // Count should ignore pagination
      const count = await getObservationsCountFromEventsTableForPublicApi({
        projectId: uniqueProjectId,
        page: 1,
        limit: 3,
      });

      expect(count).toBe(5);
    });

    it("should filter by traceId", async () => {
      const uniqueProjectId = randomUUID();
      const traceId1 = randomUUID();
      const traceId2 = randomUUID();

      const events = [
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: traceId1,
          type: "GENERATION",
          name: "trace-1-obs",
        }),
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: traceId2,
          type: "GENERATION",
          name: "trace-2-obs",
        }),
      ];

      await createEventsCh(events);

      const result = await getObservationsFromEventsTableForPublicApi({
        projectId: uniqueProjectId,
        page: 1,
        limit: 10,
        traceId: traceId1,
      });

      expect(result.length).toBe(1);
      expect(result[0]?.traceId).toBe(traceId1);
      expect(result[0]?.name).toBe("trace-1-obs");
    });

    it("should filter by type", async () => {
      const uniqueProjectId = randomUUID();
      const traceId = randomUUID();

      const events = [
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: traceId,
          type: "GENERATION",
          name: "generation-obs",
        }),
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: traceId,
          type: "SPAN",
          name: "span-obs",
        }),
      ];

      await createEventsCh(events);

      const result = await getObservationsFromEventsTableForPublicApi({
        projectId: uniqueProjectId,
        page: 1,
        limit: 10,
        type: "GENERATION",
      });

      expect(result.length).toBe(1);
      expect(result[0]?.type).toBe("GENERATION");
      expect(result[0]?.name).toBe("generation-obs");
    });

    it("should filter by level", async () => {
      const uniqueProjectId = randomUUID();
      const traceId = randomUUID();

      const events = [
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: traceId,
          type: "EVENT",
          level: "ERROR",
          name: "error-obs",
        }),
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: traceId,
          type: "EVENT",
          level: "DEFAULT",
          name: "default-obs",
        }),
      ];

      await createEventsCh(events);

      const result = await getObservationsFromEventsTableForPublicApi({
        projectId: uniqueProjectId,
        page: 1,
        limit: 10,
        level: "ERROR",
      });

      expect(result.length).toBe(1);
      expect(result[0]?.level).toBe("ERROR");
      expect(result[0]?.name).toBe("error-obs");
    });

    it("should filter by time range", async () => {
      const uniqueProjectId = randomUUID();
      const traceId = randomUUID();
      const now = Date.now();
      const fromTime = new Date(now - 5000).toISOString();
      const toTime = new Date(now + 5000).toISOString();

      const events = [
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: traceId,
          type: "SPAN",
          name: "old-obs",
          start_time: (now - 10000) * 1000,
        }),
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: traceId,
          type: "SPAN",
          name: "recent-obs",
          start_time: now * 1000,
        }),
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: traceId,
          type: "SPAN",
          name: "future-obs",
          start_time: (now + 10000) * 1000,
        }),
      ];

      await createEventsCh(events);

      const result = await getObservationsFromEventsTableForPublicApi({
        projectId: uniqueProjectId,
        page: 1,
        limit: 10,
        fromStartTime: fromTime,
        toStartTime: toTime,
      });

      expect(result.length).toBe(1);
      expect(result[0]?.name).toBe("recent-obs");
    });

    it("should combine multiple filters", async () => {
      const uniqueProjectId = randomUUID();
      const userId = "test-user";

      // Create events in different traces so userId filtering works at trace level
      const trace1 = randomUUID();
      const trace2 = randomUUID();

      const events = [
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: trace1,
          user_id: userId,
          type: "GENERATION",
          level: "ERROR",
          name: "matching-obs",
        }),
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: trace1,
          user_id: userId,
          type: "SPAN",
          level: "ERROR",
          name: "wrong-type",
        }),
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: uniqueProjectId,
          trace_id: trace2,
          user_id: "other-user",
          type: "GENERATION",
          level: "ERROR",
          name: "wrong-user",
        }),
      ];

      await createEventsCh(events);

      const result = await getObservationsFromEventsTableForPublicApi({
        projectId: uniqueProjectId,
        page: 1,
        limit: 10,
        userId,
        type: "GENERATION",
        level: "ERROR",
      });

      // Should only return "matching-obs" because:
      // - userId filters at trace level (excludes trace2 with "other-user")
      // - type="GENERATION" excludes "wrong-type" (SPAN)
      expect(result.length).toBe(1);
      expect(result[0]?.name).toBe("matching-obs");
    });

    it("should enrich observations with model data", async () => {
      const traceId = randomUUID();
      const modelId = randomUUID();

      // Create a model with pricing
      await prisma.model.create({
        data: {
          id: modelId,
          projectId: projectId,
          modelName: `test-model-${modelId}`,
          matchPattern: `(?i)^(test-model-${modelId})$`,
          startDate: new Date("2023-01-01"),
          unit: "TOKENS",
          pricingTiers: {
            create: {
              isDefault: true,
              conditions: [],
              name: "Standard",
              priority: 0,
              prices: {
                create: [
                  {
                    usageType: "input",
                    price: 0.01,
                    modelId,
                  },
                  {
                    usageType: "output",
                    price: 0.02,
                    modelId,
                  },
                ],
              },
            },
          },
        },
      });

      const event = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "model-enriched-obs",
        model_id: modelId,
        provided_model_name: `test-model-${modelId}`,
      });

      await createEventsCh([event]);

      const result = await getObservationsFromEventsTableForPublicApi({
        projectId: projectId,
        traceId: traceId,
        page: 1,
        limit: 10,
      });

      expect(result.length).toBe(1);
      expect(result[0]?.internalModelId).toBe(modelId);
      expect(Number(result[0]?.inputPrice)).toBeCloseTo(0.01, 5);
      expect(Number(result[0]?.outputPrice)).toBeCloseTo(0.02, 5);

      // Cleanup
      await prisma.model.delete({ where: { id: modelId } });
    });
  });

  maybe("Update methods", () => {
    it("should allow to set/unset bookmarked", async () => {
      const traceId = randomUUID();
      const traceId2 = randomUUID();
      const rootSpanId = randomUUID();
      const rootEvent = createEvent({
        id: rootSpanId,
        span_id: rootSpanId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "root-event",
        bookmarked: false,
        parent_span_id: "",
      });
      const rootEvent2 = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: traceId2,
        type: "GENERATION",
        name: "root-event2",
        bookmarked: true,
        parent_span_id: "",
      });

      const events = Array(3)
        .keys()
        .map((i) => {
          const id = randomUUID();
          return createEvent({
            id: id,
            span_id: id,
            project_id: projectId,
            trace_id: traceId,
            type: "GENERATION",
            name: "event-" + i,
            bookmarked: false,
            parent_span_id: rootSpanId,
          });
        });

      await createEventsCh([rootEvent, rootEvent2, ...events]);

      var result = await getTraceByIdFromEventsTable({ projectId, traceId });
      expect(result).toBeDefined();
      expect(result?.bookmarked).toBe(false);

      async function checkTraceIdsBookmarked(
        traceId: string,
        bookmarkedExp: boolean,
      ) {
        await waitForExpect(async () => {
          // Verify events_core
          const eventTrace = await getTraceByIdFromEventsTable({
            projectId,
            traceId: traceId,
            renderingProps: {
              truncated: true,
              shouldJsonParse: false,
            },
          });
          expect(eventTrace).toBeDefined();
          expect(eventTrace?.bookmarked).toBe(bookmarkedExp);

          // Verify events_full
          const eventTraceFull = await getTraceByIdFromEventsTable({
            projectId,
            traceId: traceId,
            renderingProps: {
              truncated: false,
              shouldJsonParse: true,
            },
          });
          expect(eventTraceFull).toBeDefined();
          expect(eventTraceFull?.bookmarked).toBe(bookmarkedExp);
        });
      }

      // Model setting bookmark as true on the root span
      await updateEvents(
        projectId,
        { traceIds: [traceId], rootOnly: true },
        { bookmarked: true },
      );

      await checkTraceIdsBookmarked(traceId, true);

      // Non-root event on bookmarked
      await createEventsCh([
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: projectId,
          trace_id: traceId,
          type: "GENERATION",
          name: "event-hijack",
          bookmarked: true,
          parent_span_id: rootSpanId,
        }),
      ]);

      // Removing bookmark on all span in a trace
      // including the non-root, added above
      await updateEvents(
        projectId,
        { traceIds: [traceId] },
        { bookmarked: false },
      );

      await checkTraceIdsBookmarked(traceId, false);

      // Trace id 2 should remain bookmarked
      await checkTraceIdsBookmarked(traceId2, true);
    });

    it("should allow to set/unset public", async () => {
      const traceId = randomUUID();
      const traceId2 = randomUUID();
      const rootSpanId = randomUUID();
      const rootEvent = createEvent({
        id: rootSpanId,
        span_id: rootSpanId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "root-event",
        public: false,
        parent_span_id: "",
      });
      const rootEvent2 = createEvent({
        id: randomUUID(),
        span_id: randomUUID(),
        project_id: projectId,
        trace_id: traceId2,
        type: "GENERATION",
        name: "root-event2",
        public: true,
        parent_span_id: "",
      });

      async function checkTraceIdsPublic(traceId: string, publicExp: boolean) {
        await waitForExpect(async () => {
          // Verify events_core
          const eventTrace = await getTraceByIdFromEventsTable({
            projectId,
            traceId: traceId,
            renderingProps: {
              truncated: true,
              shouldJsonParse: false,
            },
          });
          expect(eventTrace).toBeDefined();
          expect(eventTrace?.public).toBe(publicExp);

          // Verify events_full
          const eventTraceFull = await getTraceByIdFromEventsTable({
            projectId,
            traceId: traceId,
            renderingProps: {
              truncated: false,
              shouldJsonParse: true,
            },
          });
          expect(eventTraceFull).toBeDefined();
          expect(eventTraceFull?.public).toBe(publicExp);
        });
      }

      await createEventsCh([rootEvent, rootEvent2]);

      await checkTraceIdsPublic(traceId, false);

      await updateEvents(projectId, { traceIds: [traceId] }, { public: true });

      await checkTraceIdsPublic(traceId, true);

      await updateEvents(projectId, { traceIds: [traceId] }, { public: false });

      await checkTraceIdsPublic(traceId, false);

      // Non-root event with public
      await createEventsCh([
        createEvent({
          id: randomUUID(),
          span_id: randomUUID(),
          project_id: projectId,
          trace_id: traceId,
          type: "GENERATION",
          name: "event-hijack",
          public: true,
          parent_span_id: rootSpanId,
        }),
      ]);

      await checkTraceIdsPublic(traceId, true);

      // Clearing public on non-root
      await updateEvents(projectId, { traceIds: [traceId] }, { public: false });

      await checkTraceIdsPublic(traceId, false);

      // Trace id 2 should remain public
      await checkTraceIdsPublic(traceId2, true);
    });
  });

  maybe("getObservationsBatchIOFromEventsTable", () => {
    it("should fetch I/O and metadata for multiple observations", async () => {
      const traceId = randomUUID();
      const observation1Id = randomUUID();
      const observation2Id = randomUUID();
      const observation3Id = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create events with different I/O content and metadata
      const events = [
        createEvent({
          id: observation1Id,
          span_id: observation1Id,
          project_id: projectId,
          trace_id: traceId,
          type: "GENERATION",
          name: "test-observation-1",
          input: "This is input for observation 1",
          output: "This is output for observation 1",
          metadata: { key1: "value1", source: "test" },
          start_time: nowMicro,
        }),
        createEvent({
          id: observation2Id,
          span_id: observation2Id,
          project_id: projectId,
          trace_id: traceId,
          type: "SPAN",
          name: "test-observation-2",
          input: "This is input for observation 2",
          output: "This is output for observation 2",
          metadata: { key2: "value2", environment: "production" },
          start_time: nowMicro + 1000,
        }),
        createEvent({
          id: observation3Id,
          span_id: observation3Id,
          project_id: projectId,
          trace_id: traceId,
          type: "GENERATION",
          name: "test-observation-3",
          input: "This is input for observation 3",
          output: "This is output for observation 3",
          metadata: { key3: "value3" },
          start_time: nowMicro + 2000,
        }),
      ];

      await createEventsCh(events);

      // Batch fetch I/O and metadata
      const result = await getObservationsBatchIOFromEventsTable({
        projectId,
        observations: [
          { id: observation1Id, traceId },
          { id: observation2Id, traceId },
          { id: observation3Id, traceId },
        ],
        minStartTime: timestamp,
        maxStartTime: timestamp,
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(3);

      // Check observation 1
      const io1 = result.find((r) => r.id === observation1Id);
      expect(io1).toBeDefined();
      expect(io1?.input).toBe("This is input for observation 1");
      expect(io1?.output).toBe("This is output for observation 1");
      expect(io1?.metadata).toBeDefined();
      expect(io1?.metadata?.key1).toBe("value1");
      expect(io1?.metadata?.source).toBe("test");

      // Check observation 2
      const io2 = result.find((r) => r.id === observation2Id);
      expect(io2).toBeDefined();
      expect(io2?.input).toBe("This is input for observation 2");
      expect(io2?.output).toBe("This is output for observation 2");
      expect(io2?.metadata).toBeDefined();
      expect(io2?.metadata?.key2).toBe("value2");
      expect(io2?.metadata?.environment).toBe("production");

      // Check observation 3
      const io3 = result.find((r) => r.id === observation3Id);
      expect(io3).toBeDefined();
      expect(io3?.input).toBe("This is input for observation 3");
      expect(io3?.output).toBe("This is output for observation 3");
      expect(io3?.metadata).toBeDefined();
      expect(io3?.metadata?.key3).toBe("value3");
    });

    it("should handle empty observation array", async () => {
      const result = await getObservationsBatchIOFromEventsTable({
        projectId,
        observations: [],
      });

      expect(result).toBeDefined();
      expect(result).toEqual([]);
    });

    it("should handle partial results when some observations not found", async () => {
      const traceId = randomUUID();
      const existingId = randomUUID();
      const nonExistentId = randomUUID();
      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create only one event
      const event = createEvent({
        id: existingId,
        span_id: existingId,
        project_id: projectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-existing",
        input: "Existing input",
        output: "Existing output",
        start_time: nowMicro,
      });

      await createEventsCh([event]);

      // Request I/O for both existing and non-existent
      const result = await getObservationsBatchIOFromEventsTable({
        projectId,
        observations: [
          { id: existingId, traceId },
          { id: nonExistentId, traceId },
        ],
        minStartTime: timestamp,
        maxStartTime: timestamp,
      });

      // Should only return the existing one
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(existingId);
      expect(result[0]?.input).toBe("Existing input");
      expect(result[0]?.output).toBe("Existing output");
    });

    it("should filter by projectId correctly", async () => {
      const differentProjectId = randomUUID();
      const traceId = randomUUID();
      const observationId = randomUUID();
      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create event in different project
      const event = createEvent({
        id: observationId,
        span_id: observationId,
        project_id: differentProjectId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-different-project",
        input: "Secret input",
        output: "Secret output",
        start_time: nowMicro,
      });

      await createEventsCh([event]);

      // Try to fetch with wrong projectId
      const result = await getObservationsBatchIOFromEventsTable({
        projectId, // Using default projectId, not differentProjectId
        observations: [{ id: observationId, traceId }],
        minStartTime: timestamp,
        maxStartTime: timestamp,
      });

      // Should not return anything since projectId doesn't match
      expect(result).toBeDefined();
      expect(result.length).toBe(0);
    });
  });
});
