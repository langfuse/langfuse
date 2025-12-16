import { v4 } from "uuid";
import { randomUUID } from "crypto";
import { createEvent, createTraceScore } from "@langfuse/shared/src/server";
import {
  createEventsCh,
  createScoresCh,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  getEventList,
  getEventCount,
  getEventFilterOptions,
} from "@/src/features/events/server/eventsService";
import { type ObservationType } from "@langfuse/shared";
import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";

const __orgIds: string[] = [];

// Helper to wait for ClickHouse to process data
const waitForClickHouse = (ms = 2000) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const maybe =
  env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true"
    ? describe
    : describe.skip;

async function prepare() {
  const { project, org } = await createOrgProjectAndApiKey();

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: true,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:hobby",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  __orgIds.push(org.id);

  return { project, org, session, ctx, caller };
}

describe("Events Service", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: {
        id: { in: __orgIds },
      },
    });
  });

  it("should kill redis connection", () => {
    // we need at least one test case to avoid hanging
    // redis connection when everything else is skipped.
  });
  maybe("getEventList", () => {
    it.each([
      {
        column: "startTime",
        eventConfigs: [
          { start_time: new Date("2024-01-01T00:00:00.000Z").getTime() * 1000 },
          { start_time: new Date("2024-01-02T00:00:00.000Z").getTime() * 1000 },
          { start_time: new Date("2024-01-03T00:00:00.000Z").getTime() * 1000 },
        ],
        expectedDescOrder: [2, 1, 0], // indices for DESC order
        expectedAscOrder: [0, 1, 2], // indices for ASC order
      },
      {
        column: "endTime",
        eventConfigs: [
          { end_time: new Date("2024-01-01T01:00:00.000Z").getTime() * 1000 },
          { end_time: new Date("2024-01-02T01:00:00.000Z").getTime() * 1000 },
          { end_time: new Date("2024-01-03T01:00:00.000Z").getTime() * 1000 },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "type",
        eventConfigs: [
          { type: "EVENT" as const },
          { type: "GENERATION" as const },
          { type: "SPAN" as const },
        ],
        expectedDescOrder: [2, 1, 0], // SPAN > GENERATION > EVENT
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "name",
        eventConfigs: [
          { name: "alpha-event" },
          { name: "beta-event" },
          { name: "gamma-event" },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "level",
        eventConfigs: [
          { level: "DEFAULT" },
          { level: "ERROR" },
          { level: "WARNING" },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "providedModelName",
        eventConfigs: [
          { provided_model_name: "claude-3" },
          { provided_model_name: "gpt-3.5-turbo" },
          { provided_model_name: "gpt-4" },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "promptName",
        eventConfigs: [
          { prompt_name: "prompt-a" },
          { prompt_name: "prompt-b" },
          { prompt_name: "prompt-c" },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "version",
        eventConfigs: [
          { version: "v1.0" },
          { version: "v2.0" },
          { version: "v3.0" },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "traceId",
        eventConfigs: [
          { trace_id: "00000000-0000-0000-0000-000000000001" },
          { trace_id: "00000000-0000-0000-0000-000000000002" },
          { trace_id: "00000000-0000-0000-0000-000000000003" },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "latency",
        eventConfigs: [
          {
            start_time: new Date("2024-01-01T00:00:00.000Z").getTime() * 1000,
            end_time: new Date("2024-01-01T00:00:01.000Z").getTime() * 1000, // 1s
          },
          {
            start_time: new Date("2024-01-01T00:00:00.000Z").getTime() * 1000,
            end_time: new Date("2024-01-01T00:00:03.000Z").getTime() * 1000, // 3s
          },
          {
            start_time: new Date("2024-01-01T00:00:00.000Z").getTime() * 1000,
            end_time: new Date("2024-01-01T00:00:05.000Z").getTime() * 1000, // 5s
          },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "timeToFirstToken",
        eventConfigs: [
          {
            start_time: new Date("2024-01-01T00:00:00.000Z").getTime() * 1000,
            completion_start_time:
              new Date("2024-01-01T00:00:00.500Z").getTime() * 1000, // 0.5s
          },
          {
            start_time: new Date("2024-01-01T00:00:00.000Z").getTime() * 1000,
            completion_start_time:
              new Date("2024-01-01T00:00:01.500Z").getTime() * 1000, // 1.5s
          },
          {
            start_time: new Date("2024-01-01T00:00:00.000Z").getTime() * 1000,
            completion_start_time:
              new Date("2024-01-01T00:00:02.500Z").getTime() * 1000, // 2.5s
          },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "inputTokens",
        eventConfigs: [
          { usage_details: { input: 100 } },
          { usage_details: { input: 200 } },
          { usage_details: { input: 300 } },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "outputTokens",
        eventConfigs: [
          { usage_details: { output: 50 } },
          { usage_details: { output: 150 } },
          { usage_details: { output: 250 } },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "totalTokens",
        eventConfigs: [
          { usage_details: { total: 150 } },
          { usage_details: { total: 350 } },
          { usage_details: { total: 550 } },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "inputCost",
        eventConfigs: [
          { cost_details: { input: 0.001 } },
          { cost_details: { input: 0.002 } },
          { cost_details: { input: 0.003 } },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "outputCost",
        eventConfigs: [
          { cost_details: { output: 0.005 } },
          { cost_details: { output: 0.01 } },
          { cost_details: { output: 0.015 } },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "totalCost",
        eventConfigs: [
          { cost_details: { total: 0.006 } },
          { cost_details: { total: 0.012 } },
          { cost_details: { total: 0.018 } },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
      {
        column: "tokensPerSecond",
        eventConfigs: [
          {
            usage_details: { output: 100 },
            start_time: new Date("2024-01-01T00:00:00.000Z").getTime() * 1000,
            end_time: new Date("2024-01-01T00:00:10.000Z").getTime() * 1000, // 10 tokens/s
          },
          {
            usage_details: { output: 200 },
            start_time: new Date("2024-01-01T00:00:00.000Z").getTime() * 1000,
            end_time: new Date("2024-01-01T00:00:10.000Z").getTime() * 1000, // 20 tokens/s
          },
          {
            usage_details: { output: 300 },
            start_time: new Date("2024-01-01T00:00:00.000Z").getTime() * 1000,
            end_time: new Date("2024-01-01T00:00:10.000Z").getTime() * 1000, // 30 tokens/s
          },
        ],
        expectedDescOrder: [2, 1, 0],
        expectedAscOrder: [0, 1, 2],
      },
    ])(
      "should sort events by $column",
      async ({ column, eventConfigs, expectedDescOrder, expectedAscOrder }) => {
        const projectId = v4();
        const baseTraceId = v4();
        const baseTimestamp = new Date("2024-01-01T00:00:00.000Z");

        // Create events with specific configurations for each test case
        const eventIds = [v4(), v4(), v4()];
        const events = eventConfigs.map((config, index) => {
          const baseConfig = {
            span_id: eventIds[index],
            id: eventIds[index],
            trace_id: ("trace_id" in config
              ? config.trace_id
              : baseTraceId) as string,
            type: ("type" in config
              ? config.type
              : "GENERATION") as ObservationType,
            name: ("name" in config ? config.name : `event-${index}`) as string,
            start_time: ("start_time" in config
              ? config.start_time
              : (baseTimestamp.getTime() + index * 1000) * 1000) as number,
            project_id: projectId,
            level: ("level" in config ? config.level : "DEFAULT") as string,
          };

          return createEvent({
            ...baseConfig,
            ...config,
          });
        });

        await createEventsCh(events);
        await waitForClickHouse();

        // Test sorting DESC
        const resultDesc = await getEventList({
          projectId,
          filter: [],
          searchType: [],
          orderBy: { column, order: "DESC" },
          page: 0,
          limit: 10,
        });

        expect(resultDesc.observations).toBeDefined();
        expect(resultDesc.observations.length).toBe(3);

        // Verify DESC order by checking event IDs
        expectedDescOrder.forEach((expectedIndex, position) => {
          expect(resultDesc.observations[position].id).toBe(
            eventIds[expectedIndex],
          );
        });

        // Test sorting ASC
        const resultAsc = await getEventList({
          projectId,
          filter: [],
          searchType: [],
          orderBy: { column, order: "ASC" },
          page: 0,
          limit: 10,
        });

        expect(resultAsc.observations).toBeDefined();
        expect(resultAsc.observations.length).toBe(3);

        // Verify ASC order by checking event IDs
        expectedAscOrder.forEach((expectedIndex, position) => {
          expect(resultAsc.observations[position].id).toBe(
            eventIds[expectedIndex],
          );
        });
      },
    );

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

      // Get first page (1-indexed pagination)
      const page1 = await getEventList({
        projectId,
        filter: [],
        searchType: [],
        orderBy: null,
        page: 1,
        limit: 5,
      });

      // Get second page
      const page2 = await getEventList({
        projectId,
        filter: [],
        searchType: [],
        orderBy: null,
        page: 2,
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

  maybe("getEventBatchIO", () => {
    it("should require authentication", async () => {
      const { project } = await prepare();

      // Create caller without session
      const unauthCtx = createInnerTRPCContext({
        session: null,
        headers: {},
      });
      const unauthCaller = appRouter.createCaller({ ...unauthCtx, prisma });

      await expect(
        unauthCaller.events.batchIO({
          projectId: project.id,
          observations: [],
        }),
      ).rejects.toThrow();
    });

    it("should fetch I/O and metadata for multiple observations", async () => {
      const { project, caller } = await prepare();
      const traceId = randomUUID();
      const observation1Id = randomUUID();
      const observation2Id = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create events with I/O and metadata
      const events = [
        createEvent({
          id: observation1Id,
          span_id: observation1Id,
          project_id: project.id,
          trace_id: traceId,
          type: "GENERATION",
          name: "test-observation-1",
          input: "Input for observation 1",
          output: "Output for observation 1",
          metadata: { key1: "value1", test: true },
          start_time: nowMicro,
        }),
        createEvent({
          id: observation2Id,
          span_id: observation2Id,
          project_id: project.id,
          trace_id: traceId,
          type: "SPAN",
          name: "test-observation-2",
          input: "Input for observation 2",
          output: "Output for observation 2",
          metadata: { key2: "value2", environment: "staging" },
          start_time: nowMicro + 1000,
        }),
      ];

      await createEventsCh(events);
      await waitForClickHouse();

      // Call batchIO endpoint
      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [
          { id: observation1Id, traceId, startTime: timestamp },
          { id: observation2Id, traceId, startTime: timestamp },
        ],
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(2);

      const io1 = result.find((r) => r.id === observation1Id);
      expect(io1).toBeDefined();
      expect(io1?.input).toBe("Input for observation 1");
      expect(io1?.output).toBe("Output for observation 1");
      expect(io1?.metadata).toBeDefined();
      expect(io1?.metadata?.key1).toBe("value1");
      expect(io1?.metadata?.test).toBe(true);

      const io2 = result.find((r) => r.id === observation2Id);
      expect(io2).toBeDefined();
      expect(io2?.input).toBe("Input for observation 2");
      expect(io2?.output).toBe("Output for observation 2");
      expect(io2?.metadata).toBeDefined();
      expect(io2?.metadata?.key2).toBe("value2");
      expect(io2?.metadata?.environment).toBe("staging");
    });

    it("should handle empty observations array", async () => {
      const { project, caller } = await prepare();

      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [],
      });

      expect(result).toBeDefined();
      expect(result).toEqual([]);
    });

    it("should validate projectId authorization", async () => {
      const { caller } = await prepare();
      const unauthorizedProjectId = randomUUID();

      // This should fail because the user doesn't have access to this project
      await expect(
        caller.events.batchIO({
          projectId: unauthorizedProjectId,
          observations: [
            {
              id: randomUUID(),
              traceId: randomUUID(),
              startTime: new Date(),
            },
          ],
        }),
      ).rejects.toThrow();
    });

    it("should return data structure for observations without explicitly set I/O", async () => {
      const { project, caller } = await prepare();
      const traceId = randomUUID();
      const observationId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create event without explicitly setting I/O
      const event = createEvent({
        id: observationId,
        span_id: observationId,
        project_id: project.id,
        trace_id: traceId,
        type: "SPAN",
        name: "test-no-explicit-io",
        // No input/output explicitly set
        start_time: nowMicro,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [{ id: observationId, traceId, startTime: timestamp }],
      });

      // Verify the response structure is correct
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(observationId);
      // Input/output fields should exist (may be null, empty, or have default values)
      expect(result[0]).toHaveProperty("input");
      expect(result[0]).toHaveProperty("output");
      expect(result[0]).toHaveProperty("metadata");
      expect(result[0]?.metadata).toBeDefined();
    });

    it("should truncate I/O to character limit", async () => {
      const { project, caller } = await prepare();
      const traceId = randomUUID();
      const observationId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create very long input and output (> 1000 chars)
      const longInput = "x".repeat(2000);
      const longOutput = "y".repeat(2000);

      const event = createEvent({
        id: observationId,
        span_id: observationId,
        project_id: project.id,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-long-io",
        input: longInput,
        output: longOutput,
        start_time: nowMicro,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [{ id: observationId, traceId, startTime: timestamp }],
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(observationId);
      // Input/output may be returned as strings or objects, ensure truncation works
      const inputLength =
        typeof result[0]?.input === "string"
          ? result[0]?.input.length
          : JSON.stringify(result[0]?.input).length;
      const outputLength =
        typeof result[0]?.output === "string"
          ? result[0]?.output.length
          : JSON.stringify(result[0]?.output).length;
      // Verify truncation occurred (should be 1000 chars, not 2000)
      expect(inputLength).toBe(1000);
      expect(outputLength).toBe(1000);
    });

    it("should handle partial results when some observations not found", async () => {
      const { project, caller } = await prepare();
      const traceId = randomUUID();
      const existingId = randomUUID();
      const nonExistentId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create only one event
      const event = createEvent({
        id: existingId,
        span_id: existingId,
        project_id: project.id,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-existing",
        input: "Existing input",
        output: "Existing output",
        start_time: nowMicro,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      // Request I/O for both existing and non-existent
      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [
          { id: existingId, traceId, startTime: timestamp },
          { id: nonExistentId, traceId, startTime: timestamp },
        ],
      });

      // Should only return the existing one
      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(existingId);
      expect(result[0]?.input).toBe("Existing input");
      expect(result[0]?.output).toBe("Existing output");
    });

    it("should handle JSON input/output correctly", async () => {
      const { project, caller } = await prepare();
      const traceId = randomUUID();
      const observationId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create event with JSON input/output
      const jsonInput = JSON.stringify({
        prompt: "Hello",
        params: { temp: 0.7 },
      });
      const jsonOutput = JSON.stringify({ response: "Hi there!", tokens: 10 });

      const event = createEvent({
        id: observationId,
        span_id: observationId,
        project_id: project.id,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-json-io",
        input: jsonInput,
        output: jsonOutput,
        start_time: nowMicro,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      const result = await caller.events.batchIO({
        projectId: project.id,
        observations: [{ id: observationId, traceId, startTime: timestamp }],
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe(observationId);
      // Input/output may be returned as strings or objects depending on storage format
      const resultInput =
        typeof result[0]?.input === "string"
          ? result[0]?.input
          : JSON.stringify(result[0]?.input);
      const resultOutput =
        typeof result[0]?.output === "string"
          ? result[0]?.output
          : JSON.stringify(result[0]?.output);
      expect(resultInput).toBe(jsonInput);
      expect(resultOutput).toBe(jsonOutput);
    });

    it("should filter by projectId correctly - should not return data from other projects", async () => {
      const { project: project1, caller } = await prepare();
      const { project: project2 } = await prepare();

      const traceId = randomUUID();
      const observationId = randomUUID();

      const nowMicro = Date.now() * 1000;
      const timestamp = new Date(nowMicro / 1000);

      // Create event in project2
      const event = createEvent({
        id: observationId,
        span_id: observationId,
        project_id: project2.id,
        trace_id: traceId,
        type: "GENERATION",
        name: "test-different-project",
        input: "Secret input",
        output: "Secret output",
        start_time: nowMicro,
      });

      await createEventsCh([event]);
      await waitForClickHouse();

      // Try to fetch with project1 (should not return anything)
      const result = await caller.events.batchIO({
        projectId: project1.id,
        observations: [{ id: observationId, traceId, startTime: timestamp }],
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(0);
    });
  });
});
