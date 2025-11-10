import { v4 } from "uuid";
import { createEvent, createTraceScore } from "@langfuse/shared/src/server";
import { createEventsCh, createScoresCh } from "@langfuse/shared/src/server";
import {
  getEventList,
  getEventCount,
  getEventFilterOptions,
} from "@/src/features/events/server/eventsService";
import { type ObservationType } from "@langfuse/shared";
import { env } from "@/src/env.mjs";

// Helper to wait for ClickHouse to process data
const waitForClickHouse = (ms = 2000) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip;

describe("Events Service", () => {
  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging
    // redis connection when everything else is skipped.
  });
  maybe("getEventList", () => {
    it("should return paginated list of events", async () => {
      const projectId = v4();
      const traceId = v4();
      const timestamp = new Date("2024-01-01T00:00:00.000Z");

      // Create events
      const events = [];
      for (let i = 0; i < 5; i++) {
        const eventId = v4();
        events.push(
          createEvent({
            span_id: eventId,
            id: eventId,
            trace_id: traceId,
            type: "GENERATION",
            name: `test-event-${i}`,
            start_time: timestamp.getTime() * 1000, // Convert to microseconds
            project_id: projectId,
          }),
        );
      }

      // Insert events into ClickHouse
      await createEventsCh(events);

      // Wait for ClickHouse to process
      await waitForClickHouse();

      const result = await getEventList({
        projectId,
        filter: [],
        searchType: [],
        orderBy: null,
        page: 0,
        limit: 3,
      });

      expect(result.observations).toBeDefined();
      expect(result.observations.length).toBeGreaterThanOrEqual(0);
      if (result.observations.length > 0) {
        expect(result.observations.length).toBeLessThanOrEqual(3);
      }
    });

    it.each([
      [
        "GENERATION",
        {
          column: "Type",
          operator: "any of",
          value: ["GENERATION"],
          type: "stringOptions",
        },
      ],
      [
        "test-event",
        {
          column: "Name",
          operator: "any of",
          value: ["test-event"],
          type: "stringOptions",
        },
      ],
      [
        "DEFAULT",
        {
          column: "Level",
          operator: "any of",
          value: ["DEFAULT"],
          type: "stringOptions",
        },
      ],
    ])("should filter events by %s = %s", async (filterValue, filterState) => {
      const traceId = v4();
      const eventId = v4();
      const projectId = v4();
      const timestamp = new Date("2024-01-01T00:00:00.000Z");

      const event = createEvent({
        span_id: eventId,
        id: eventId,
        trace_id: traceId,
        type: filterValue as ObservationType,
        name: filterValue === "test-event" ? "test-event" : "other-name",
        level: filterValue === "DEFAULT" ? "DEFAULT" : "ERROR",
        start_time: timestamp.getTime() * 1000,
        project_id: projectId,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      const result = await getEventList({
        projectId,
        filter: [filterState],
        searchType: [],
        orderBy: null,
        page: 0,
        limit: 10,
      });

      expect(result.observations.length).toBeGreaterThanOrEqual(1);
      expect(result.observations.length).toBeLessThanOrEqual(10);
      expect(result.observations[0].name).toBe(
        filterValue === "test-event" ? "test-event" : "other-name",
      );
      expect(result.observations[0].type).toBe(filterValue as ObservationType);
      expect(result.observations[0].level).toBe(
        filterValue === "DEFAULT" ? "DEFAULT" : "ERROR",
      );
      expect(result.observations[0].projectId).toBe(projectId);
      expect(result.observations[0].traceId).toBe(traceId);
    });

    it("should handle pagination correctly", async () => {
      const traceId = v4();
      const timestamp = new Date("2024-01-01T00:00:00.000Z");
      const projectId = v4();

      const ids: string[] = [];

      // Create multiple events
      const events = [];
      for (let i = 0; i < 10; i++) {
        const eventId = v4();
        ids.push(eventId);
        events.push(
          createEvent({
            span_id: eventId,
            id: eventId,
            trace_id: traceId,
            type: "GENERATION",
            name: `test-event-${i}`,
            start_time: (timestamp.getTime() + i * 1000) * 1000,
            project_id: projectId,
          }),
        );
      }

      await createEventsCh(events);
      await waitForClickHouse();

      // Get first page
      const page1 = await getEventList({
        projectId,
        filter: [],
        searchType: [],
        orderBy: null,
        page: 0,
        limit: 5,
      });

      // Get second page
      const page2 = await getEventList({
        projectId,
        filter: [],
        searchType: [],
        orderBy: null,
        page: 1,
        limit: 5,
      });

      expect(page1.observations).toBeDefined();
      expect(page2.observations).toBeDefined();

      expect(page1.observations.map((o) => o.id)).not.toEqual(
        page2.observations.map((o) => o.id),
      );
      expect(page1.observations.map((o) => o.id)).toEqual(ids.slice(0, 5));
      expect(page2.observations.map((o) => o.id)).toEqual(ids.slice(5, 10));
    });
  });

  maybe("getEventCount", () => {
    it("should return correct count of events", async () => {
      const traceId = v4();
      const projectId = v4();
      const timestamp = new Date("2024-01-01T00:00:00.000Z");

      // Create multiple events
      const eventCount = 7;
      const events = [];
      for (let i = 0; i < eventCount; i++) {
        const eventId = v4();
        events.push(
          createEvent({
            span_id: eventId,
            id: eventId,
            trace_id: traceId,
            type: "GENERATION",
            name: `test-event-count-${i}`,
            start_time: (timestamp.getTime() + i * 1000) * 1000,
            project_id: projectId,
          }),
        );
      }

      await createEventsCh(events);
      await waitForClickHouse();

      const result = await getEventCount({
        projectId,
        filter: [],
        searchType: [],
        orderBy: null,
      });

      expect(result.totalCount).toBe(eventCount);
    });

    it.each([
      [
        "GENERATION",
        {
          column: "Type",
          operator: "any of",
          value: ["GENERATION"],
          type: "stringOptions",
        },
      ],
      [
        "test-event",
        {
          column: "Name",
          operator: "any of",
          value: ["test-event"],
          type: "stringOptions",
        },
      ],
      [
        "DEFAULT",
        {
          column: "Level",
          operator: "any of",
          value: ["DEFAULT"],
          type: "stringOptions",
        },
      ],
    ])(
      "should count events filtered by %s = %s",
      async (filterValue, filterState) => {
        const traceId = v4();
        const eventId = v4();
        const projectId = v4();
        const timestamp = new Date("2024-01-01T00:00:00.000Z");

        const event = createEvent({
          span_id: eventId,
          id: eventId,
          trace_id: traceId,
          type: filterValue as ObservationType,
          name: filterValue === "test-event" ? "test-event" : "other-name",
          level: filterValue === "DEFAULT" ? "DEFAULT" : "ERROR",
          start_time: timestamp.getTime() * 1000,
          project_id: projectId,
        });

        await createEventsCh([event]);
        await waitForClickHouse();

        const result = await getEventCount({
          projectId,
          filter: [filterState],
          searchType: [],
          orderBy: null,
        });

        expect(result.totalCount).toBeDefined();
        expect(typeof result.totalCount).toBe("number");
        expect(result.totalCount).toBe(1);
      },
    );
  });

  maybe("getEventFilterOptions", () => {
    it("should return correct filter options for various event types", async () => {
      const projectId = v4();
      const traceId = v4();
      const timestamp = new Date("2024-01-01T00:00:00.000Z");
      const promptId = v4();
      const promptName = `test-prompt-${v4()}`;
      const modelId = v4();

      // Create diverse events with different properties
      const events = [
        // Event with model information
        createEvent({
          span_id: v4(),
          id: v4(),
          trace_id: traceId,
          type: "GENERATION",
          name: "event-with-model",
          start_time: timestamp.getTime() * 1000,
          project_id: projectId,
          provided_model_name: "gpt-4",
          model_id: modelId,
          user_id: "user-123",
          session_id: v4(),
          version: "v1.0",
          environment: "production",
          level: "DEFAULT",
        }),
        // Event with prompt information
        createEvent({
          span_id: v4(),
          id: v4(),
          trace_id: traceId,
          type: "GENERATION",
          name: "event-with-prompt",
          start_time: (timestamp.getTime() + 1000) * 1000,
          project_id: projectId,
          prompt_id: promptId,
          prompt_name: promptName,
          level: "WARNING",
        }),
        // SPAN type event
        createEvent({
          span_id: v4(),
          id: v4(),
          trace_id: traceId,
          type: "SPAN",
          name: "span-event",
          start_time: (timestamp.getTime() + 2000) * 1000,
          project_id: projectId,
          environment: "staging",
        }),
        // EVENT type event
        createEvent({
          span_id: v4(),
          id: v4(),
          trace_id: traceId,
          type: "EVENT",
          name: "custom-event",
          start_time: (timestamp.getTime() + 3000) * 1000,
          project_id: projectId,
          level: "ERROR",
        }),
      ];

      const eventId = events[0].span_id;

      await createEventsCh(events);

      // Create scores for filter options
      const numericScore = createTraceScore({
        id: v4(),
        timestamp: timestamp.getTime(),
        project_id: projectId,
        trace_id: traceId,
        name: "accuracy",
        value: 0.95,
        source: "API",
        observation_id: eventId,
      });

      const categoricalScore = createTraceScore({
        id: v4(),
        timestamp: timestamp.getTime(),
        project_id: projectId,
        trace_id: traceId,
        name: "sentiment",
        string_value: "positive",
        source: "API",
        observation_id: eventId,
      });

      await createScoresCh([numericScore, categoricalScore]);
      await waitForClickHouse();

      // Test without time filter
      const result = await getEventFilterOptions({
        projectId,
      });

      // Verify all filter option categories exist and are arrays
      expect(result).toBeDefined();
      expect(Array.isArray(result.providedModelName)).toBe(true);
      expect(Array.isArray(result.modelId)).toBe(true);
      expect(Array.isArray(result.name)).toBe(true);
      expect(Array.isArray(result.scores_avg)).toBe(true);
      expect(Array.isArray(result.score_categories)).toBe(true);
      expect(Array.isArray(result.promptName)).toBe(true);
      expect(Array.isArray(result.traceTags)).toBe(true);
      expect(Array.isArray(result.type)).toBe(true);
      expect(Array.isArray(result.userId)).toBe(true);
      expect(Array.isArray(result.version)).toBe(true);
      expect(Array.isArray(result.sessionId)).toBe(true);
      expect(Array.isArray(result.level)).toBe(true);
      expect(Array.isArray(result.environment)).toBe(true);

      // Verify populated options have correct values
      const modelNameOption = result.providedModelName.find(
        (opt) => opt.value === "gpt-4",
      );
      expect(modelNameOption).toBeDefined();
      expect(modelNameOption?.count).toBeGreaterThanOrEqual(1);

      const modelIdOption = result.modelId.find((opt) => opt.value === modelId);
      expect(modelIdOption).toBeDefined();
      expect(modelIdOption?.count).toBeGreaterThanOrEqual(1);

      const nameOptions = result.name.map((opt) => opt.value);
      expect(nameOptions).toContain("event-with-model");
      expect(nameOptions).toContain("event-with-prompt");
      expect(nameOptions).toContain("span-event");
      expect(nameOptions).toContain("custom-event");

      const typeOptions = result.type.map((opt) => opt.value);
      expect(typeOptions).toContain("GENERATION");
      expect(typeOptions).toContain("SPAN");
      expect(typeOptions).toContain("EVENT");

      const levelOptions = result.level.map((opt) => opt.value);
      expect(levelOptions).toContain("DEFAULT");
      expect(levelOptions).toContain("WARNING");
      expect(levelOptions).toContain("ERROR");

      const environmentOptions = result.environment.map((opt) => opt.value);
      expect(environmentOptions).toContain("production");
      expect(environmentOptions).toContain("staging");

      const promptNameOption = result.promptName.find(
        (opt) => opt.value === promptName,
      );
      expect(promptNameOption).toBeDefined();

      expect(result.scores_avg).toContain("accuracy");
      expect(Array.isArray(result.score_categories)).toBe(true);

      // Test with time filter
      const resultWithTimeFilter = await getEventFilterOptions({
        projectId,
        startTimeFilter: [
          {
            column: "Start Time" as const,
            operator: ">" as const,
            value: new Date("2023-01-01T00:00:00.000Z"),
            type: "datetime" as const,
          },
        ],
      });

      expect(resultWithTimeFilter).toBeDefined();
      expect(Array.isArray(resultWithTimeFilter.name)).toBe(true);
      expect(Array.isArray(resultWithTimeFilter.type)).toBe(true);
    });
  });

  maybe("Integration tests", () => {
    it("should have consistent count between getEventCount and getEventList", async () => {
      const traceId = v4();
      const projectId = v4();
      const timestamp = new Date("2024-01-01T00:00:00.000Z");

      // Create specific number of events
      const expectedCount = 5;
      const events = [];
      for (let i = 0; i < expectedCount; i++) {
        const eventId = v4();
        events.push(
          createEvent({
            span_id: eventId,
            id: eventId,
            trace_id: traceId,
            type: "GENERATION",
            name: `test-consistency-${i}`,
            start_time: (timestamp.getTime() + i * 1000) * 1000, // Microseconds
            project_id: projectId,
          }),
        );
      }

      await createEventsCh(events);
      await waitForClickHouse();

      const filters = [
        {
          column: "Name",
          operator: "contains",
          value: "test-consistency",
          type: "string",
        },
      ];

      const countResult = await getEventCount({
        projectId,
        filter: filters,
        searchType: [],
        orderBy: null,
      });

      const listResult = await getEventList({
        projectId,
        filter: filters,
        searchType: [],
        orderBy: null,
        page: 0,
        limit: 100,
      });

      expect(listResult.observations.length).toBeLessThanOrEqual(
        countResult.totalCount,
      );
    });

    it("should handle empty project gracefully", async () => {
      const emptyProjectId = v4();

      const [count, list, options] = await Promise.all([
        getEventCount({
          projectId: emptyProjectId,
          filter: [],
          searchType: [],
          orderBy: null,
        }),
        getEventList({
          projectId: emptyProjectId,
          filter: [],
          searchType: [],
          orderBy: null,
          page: 0,
          limit: 10,
        }),
        getEventFilterOptions({
          projectId: emptyProjectId,
        }),
      ]);

      expect(count.totalCount).toBe(0);
      expect(list.observations).toHaveLength(0);
      expect(options.name).toHaveLength(0);
      expect(options.type).toHaveLength(0);
    });
  });
});
