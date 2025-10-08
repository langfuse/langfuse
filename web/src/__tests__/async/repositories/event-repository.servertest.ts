import {
  createEvent,
  createEventsCh,
  getObservationsWithModelDataFromEventsTable,
  getObservationsCountFromEventsTable,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { randomUUID } from "crypto";
import { type FilterCondition } from "@langfuse/shared";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

function idFilter(id: string): FilterCondition {
  return {
    type: "string",
    column: "id",
    operator: "=",
    value: id,
  };
}

describe("Clickhouse Events Repository Test", () => {
  describe("getObservationsWithModelDataFromEventsTable", () => {
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
          Price: {
            create: [
              {
                usageType: "input",
                price: 0.03,
              },
              {
                usageType: "output",
                price: 0.06,
              },
              {
                usageType: "total",
                price: 0.09,
              },
            ],
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
      expect(observation?.internalModelId).toBeNull();
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

  describe("getObservationsCountFromEventsTable", () => {
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

  describe("Filter Tests", () => {
    describe("Timestamp Filters", () => {
      it("should filter observations by start time with >= operator", async () => {
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
            name: "old-event-gte",
            start_time: (now - 10000) * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId,
            type: "SPAN",
            name: "exact-event-gte",
            start_time: filterTime.getTime() * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId,
            type: "SPAN",
            name: "new-event-gte",
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
              operator: ">=",
              value: filterTime,
            },
          ],
          limit: 1000,
          offset: 0,
        });

        const filteredObservations = result.filter(
          (o) => o.traceId === traceId,
        );
        expect(filteredObservations.length).toBe(2);
        const names = filteredObservations.map((o) => o.name).sort();
        expect(names).toEqual(["exact-event-gte", "new-event-gte"]);
      });

      it("should filter observations by start time with <= operator", async () => {
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
            name: "old-event-lte",
            start_time: (now - 10000) * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId,
            type: "SPAN",
            name: "exact-event-lte",
            start_time: filterTime.getTime() * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId,
            type: "SPAN",
            name: "new-event-lte",
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
              operator: "<=",
              value: filterTime,
            },
          ],
          limit: 1000,
          offset: 0,
        });

        const filteredObservations = result.filter(
          (o) => o.traceId === traceId,
        );
        expect(filteredObservations.length).toBe(2);
        const names = filteredObservations.map((o) => o.name).sort();
        expect(names).toEqual(["exact-event-lte", "old-event-lte"]);
      });

      it("should filter observations by end time", async () => {
        const traceId = randomUUID();
        const now = Date.now();
        const filterTime = new Date(now - 2000);

        const events = [
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId,
            type: "SPAN",
            name: "event-no-end",
            start_time: (now - 10000) * 1000,
            end_time: null,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId,
            type: "SPAN",
            name: "event-old-end",
            start_time: (now - 10000) * 1000,
            end_time: (now - 5000) * 1000,
          }),
          createEvent({
            id: randomUUID(),
            span_id: randomUUID(),
            project_id: projectId,
            trace_id: traceId,
            type: "SPAN",
            name: "event-recent-end",
            start_time: (now - 5000) * 1000,
            end_time: now * 1000,
          }),
        ];

        await createEventsCh(events);

        const result = await getObservationsWithModelDataFromEventsTable({
          projectId,
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

        const filteredObservations = result.filter(
          (o) => o.traceId === traceId,
        );
        expect(filteredObservations.length).toBe(1);
        expect(filteredObservations[0].name).toBe("event-recent-end");
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
        const userId1 = "user-exclude-1";
        const userId2 = "user-exclude-2";
        const userId3 = "user-include";

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
              column: "userId",
              operator: "none of",
              value: [userId1, userId2],
            },
          ],
          limit: 1000,
          offset: 0,
        });

        const filteredObservations = result.filter((o) =>
          [traceId1, traceId2, traceId3].includes(o.traceId ?? ""),
        );
        expect(filteredObservations.length).toBe(1);
        expect(filteredObservations[0].name).toBe("included");
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
  });
});
