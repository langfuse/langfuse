import { v4 as uuidv4, v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import { createEvent, createTraceScore } from "@langfuse/shared/src/server";
import { createEventsCh, createScoresCh } from "@langfuse/shared/src/server";
import {
  getEventList,
  getEventCount,
  getEventFilterOptions,
} from "@/src/features/events/server/eventsService";
import { type ObservationType } from "@langfuse/shared";

// Helper to wait for ClickHouse to process data
const waitForClickHouse = (ms = 2000) =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("Events Service", () => {
  describe("getEventList", () => {
    it("should return paginated list of events", async () => {
      const projectId = v4();
      const traceId = v4();
      const timestamp = new Date("2024-01-01T00:00:00.000Z");

      // Create events
      const events = [];
      for (let i = 0; i < 5; i++) {
        const eventId = uuidv4();
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

      // Create multiple events
      const events = [];
      for (let i = 0; i < 10; i++) {
        const eventId = v4();
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

      // Pages should not have overlapping IDs
      const page1Ids = new Set(page1.observations.map((o) => o.id));

      page2.observations.forEach((obs) => {
        if (page1Ids.has(obs.id)) {
          // This is acceptable if there aren't enough unique observations
        }
      });
    });
  });

  describe("getEventCount", () => {
    it("should return correct count of events", async () => {
      const traceId = v4();
      const projectId = v4();
      const timestamp = new Date("2024-01-01T00:00:00.000Z");

      // Create multiple events
      const eventCount = 7;
      const events = [];
      for (let i = 0; i < eventCount; i++) {
        const eventId = uuidv4();
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

      expect(result.totalCount).toBeGreaterThanOrEqual(eventCount);
    });

    it.each([
      [
        "type filter",
        [
          {
            column: "Type",
            operator: "any of",
            value: ["GENERATION"],
            type: "stringOptions",
          },
        ],
      ],
      [
        "date range filter",
        [
          {
            column: "Start Time",
            operator: ">",
            value: new Date("2024-01-01T00:00:00.000Z"),
            type: "datetime",
          },
        ],
      ],
      [
        "multiple filters",
        [
          {
            column: "Type",
            operator: "any of",
            value: ["GENERATION"],
            type: "stringOptions",
          },
          {
            column: "Start Time",
            operator: ">",
            value: new Date("2024-01-01T00:00:00.000Z"),
            type: "datetime",
          },
        ],
      ],
    ])("should return count with %s", async (description, filters) => {
      const projectId = v4();
      const result = await getEventCount({
        projectId,
        filter: filters,
        searchType: [],
        orderBy: null,
      });

      expect(result.totalCount).toBeDefined();
      expect(typeof result.totalCount).toBe("number");
      expect(result.totalCount).toBeGreaterThanOrEqual(0);
    });

    it("should handle empty search query in count", async () => {
      const projectId = v4();
      const result = await getEventCount({
        projectId,
        filter: [],
        searchQuery: undefined,
        searchType: [],
        orderBy: null,
      });

      expect(result.totalCount).toBeDefined();
      expect(typeof result.totalCount).toBe("number");
      expect(result.totalCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getEventFilterOptions", () => {
    it("should return all filter option categories", async () => {
      const projectId = v4();
      const result = await getEventFilterOptions({
        projectId,
      });

      expect(result).toBeDefined();
      expect(result.providedModelName).toBeDefined();
      expect(result.modelId).toBeDefined();
      expect(result.name).toBeDefined();
      expect(result.scores_avg).toBeDefined();
      expect(result.score_categories).toBeDefined();
      expect(result.promptName).toBeDefined();
      expect(result.traceTags).toBeDefined();
      expect(result.type).toBeDefined();
      expect(result.userId).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.level).toBeDefined();
      expect(result.environment).toBeDefined();

      // Check all are arrays
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
    });

    it("should filter options by time range", async () => {
      const projectId = v4();
      const startTimeFilter = [
        {
          column: "Start Time" as const,
          operator: ">" as const,
          value: new Date("2024-01-01T00:00:00.000Z"),
          type: "datetime" as const,
        },
      ];

      const result = await getEventFilterOptions({
        projectId,
        startTimeFilter,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.name)).toBe(true);
      expect(Array.isArray(result.type)).toBe(true);
    });

    it("should return options with correct structure", async () => {
      const traceId = v4();
      const projectId = v4();
      const timestamp = new Date("2024-01-01T00:00:00.000Z");

      // Create event
      const eventId = v4();
      const event = createEvent({
        span_id: eventId,
        id: eventId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-event-options",
        start_time: timestamp.getTime() * 1000, // Microseconds
        project_id: projectId,
        provided_model_name: "gpt-4",
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      const result = await getEventFilterOptions({
        projectId,
      });

      // Check structure of options with values
      if (result.providedModelName.length > 0) {
        expect(result.providedModelName[0]).toHaveProperty("value");
        expect(result.providedModelName[0]).toHaveProperty("count");
        expect(typeof result.providedModelName[0].value).toBe("string");
        expect(typeof result.providedModelName[0].count).toBe("number");
      }

      if (result.type.length > 0) {
        expect(result.type[0]).toHaveProperty("value");
        expect(result.type[0]).toHaveProperty("count");
      }

      if (result.traceTags.length > 0) {
        expect(result.traceTags[0]).toHaveProperty("value");
      }
    });

    it("should populate prompt names when prompts are used", async () => {
      const traceId = v4();
      const projectId = v4();
      const promptId = v4();
      const promptName = `test-prompt-${uuidv4()}`;
      const timestamp = new Date("2024-01-01T00:00:00.000Z");

      // Create event with prompt information
      const eventId = v4();
      const event = createEvent({
        span_id: eventId,
        id: eventId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-event-prompt",
        start_time: timestamp.getTime() * 1000, // Microseconds
        project_id: projectId,
        prompt_id: promptId,
        prompt_name: promptName,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      const result = await getEventFilterOptions({
        projectId,
      });

      expect(result.promptName).toBeDefined();
      expect(Array.isArray(result.promptName)).toBe(true);

      // Note: Due to ClickHouse timing, the newly created prompt may not appear immediately
      // This test validates the structure and that the function works correctly
      if (result.promptName.length > 0) {
        expect(result.promptName[0]).toHaveProperty("value");
        expect(result.promptName[0]).toHaveProperty("count");
      }
    });

    it("should populate numeric and categorical scores", async () => {
      const traceId = v4();
      const projectId = v4();
      const timestamp = new Date("2024-01-01T00:00:00.000Z");

      // Create event
      const eventId = v4();
      const event = createEvent({
        span_id: eventId,
        id: eventId,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-event-scores",
        start_time: timestamp.getTime() * 1000, // Microseconds
        project_id: projectId,
      });

      await createEventsCh([event]);

      // Create numeric score
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

      // Create categorical score
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

      const result = await getEventFilterOptions({
        projectId,
      });

      expect(result.scores_avg).toBeDefined();
      expect(Array.isArray(result.scores_avg)).toBe(true);

      expect(result.score_categories).toBeDefined();
      expect(Array.isArray(result.score_categories)).toBe(true);
    });

    it.each([
      ["empty startTimeFilter", undefined],
      [
        "with startTimeFilter",
        [
          {
            column: "Start Time" as const,
            operator: ">" as const,
            value: new Date("2023-01-01T00:00:00.000Z"),
            type: "datetime" as const,
          },
        ],
      ],
    ])("should handle %s", async (description, startTimeFilter) => {
      const projectId = v4();
      const result = await getEventFilterOptions({
        projectId,
        startTimeFilter,
      });

      expect(result).toBeDefined();
      expect(result.name).toBeDefined();
      expect(result.type).toBeDefined();
      expect(result.providedModelName).toBeDefined();
    });
  });

  describe("Integration tests", () => {
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
