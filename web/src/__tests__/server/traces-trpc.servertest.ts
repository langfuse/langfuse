import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createTrace,
  createTracesCh,
  createTraceScore,
  createSessionScore,
  createScoresCh,
  getTraceByIdFromTracesTable,
  createEventsCh,
  createEvent,
  getTraceByIdFromEventsTable,
  createObservation,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import waitForExpect from "wait-for-expect";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";
import { composeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
import { BatchExportFileFormat, BatchTableNames } from "@langfuse/shared";

describe("traces trpc", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
  const mutableEnv = env as unknown as {
    LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH: "true" | "false";
  };
  const originalLegacyIoSearchDisabled =
    mutableEnv.LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH;

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: "seed-org-id",
          name: "Test Organization",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
              hasTraces: true,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
        searchBar: false,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
      admin: true,
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  afterEach(() => {
    mutableEnv.LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH =
      originalLegacyIoSearchDisabled;
  });

  describe("traces.all", () => {
    it("ignores legacy full-text-only search when legacy IO search is disabled", async () => {
      mutableEnv.LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH = "true";
      const tag = `legacy-io-search-disabled-${randomUUID()}`;
      const matchingName = `legacy-io-search-disabled-name-${randomUUID()}`;

      const traces = [
        createTrace({
          project_id: projectId,
          name: matchingName,
          tags: [tag],
        }),
        createTrace({
          project_id: projectId,
          name: "legacy-io-search-disabled-other-trace",
          tags: [tag],
        }),
      ];

      await createTracesCh(traces);

      const result = await caller.traces.all({
        projectId,
        filter: [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: new Date(new Date().getTime() - 1000).toISOString(),
          },
          {
            column: "tags",
            operator: "any of",
            value: [tag],
            type: "arrayOptions",
          },
        ],
        searchQuery: matchingName,
        searchType: ["content"],
        page: 0,
        limit: 50,
        orderBy: {
          column: "timestamp",
          order: "DESC",
        },
      });

      expect(result.traces.map((t) => t.id).sort()).toEqual(
        traces.map((t) => t.id).sort(),
      );
    });

    it("list traces for default view", async () => {
      const trace = createTrace({
        project_id: projectId,
      });

      await createTracesCh([trace]);

      const traces = await caller.traces.all({
        projectId,
        filter: [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: new Date(new Date().getTime() - 1000).toISOString(),
          },
        ],
        searchQuery: null,
        searchType: ["id"],
        page: 0,
        limit: 50,
        orderBy: {
          column: "timestamp",
          order: "DESC",
        },
      });

      expect(traces.traces.length).toBeGreaterThan(0);
    });

    it("list traces with custom order", async () => {
      const trace = createTrace({
        project_id: projectId,
      });

      await createTracesCh([trace]);

      const traces = await caller.traces.all({
        projectId,
        filter: [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: new Date(new Date().getTime() - 1000).toISOString(),
          },
        ],
        searchQuery: null,
        searchType: ["id"],
        page: 0,
        limit: 50,
        orderBy: {
          column: "latency",
          order: "DESC",
        },
      });

      expect(traces.traces.length).toBeGreaterThan(0);
    });

    it("list traces with user id search", async () => {
      const trace = createTrace({
        project_id: projectId,
      });

      await createTracesCh([trace]);

      const traces = await caller.traces.all({
        projectId,
        filter: [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: new Date(new Date().getTime() - 1000).toISOString(),
          },
        ],
        searchQuery: "test",
        searchType: ["id", "content"],
        page: 0,
        limit: 50,
        orderBy: {
          column: "latency",
          order: "DESC",
        },
      });

      expect(traces.traces.length).toBeGreaterThan(0);
    });

    it("list traces with complex scores and observations filter", async () => {
      const trace = createTrace({
        project_id: projectId,
      });

      await createTracesCh([trace]);

      const traces = await caller.traces.all({
        projectId,
        filter: [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: new Date(new Date().getTime() - 1000).toISOString(),
          },
          {
            column: "Input Cost ($)",
            operator: ">",
            type: "number",
            value: 0,
          },
          {
            column: "Input Tokens",
            operator: "=",
            type: "number",
            value: 0,
          },
          {
            column: "Total Tokens",
            operator: "=",
            type: "number",
            value: 0,
          },
          {
            column: "Scores (numeric)",
            key: "toxicity-v2",
            operator: "=",
            type: "numberObject",
            value: 0,
          },
        ],
        searchQuery: "test",
        searchType: ["id", "content"],
        page: 0,
        limit: 50,
        orderBy: {
          column: "latency",
          order: "DESC",
        },
      });

      expect(traces.traces.length).toBe(0);
    });

    it("should filter traces by boolean score with = and <> operators", async () => {
      const scoreName = `bool_score_${randomUUID()}`;

      const traceWithTrueScore = createTrace({ project_id: projectId });
      const traceWithFalseScore = createTrace({ project_id: projectId });
      const traceWithoutScore = createTrace({ project_id: projectId });
      const traceIds = [
        traceWithTrueScore.id,
        traceWithFalseScore.id,
        traceWithoutScore.id,
      ];

      await createTracesCh([
        traceWithTrueScore,
        traceWithFalseScore,
        traceWithoutScore,
      ]);
      await createScoresCh([
        createTraceScore({
          project_id: projectId,
          trace_id: traceWithTrueScore.id,
          name: scoreName,
          value: 1,
          string_value: "True",
          data_type: "BOOLEAN",
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: traceWithFalseScore.id,
          name: scoreName,
          value: 0,
          string_value: "False",
          data_type: "BOOLEAN",
        }),
      ]);

      const baseFilter = [
        {
          column: "timestamp",
          type: "datetime" as const,
          operator: ">=" as const,
          value: new Date(new Date().getTime() - 10_000).toISOString(),
        },
        {
          column: "id",
          type: "stringOptions" as const,
          operator: "any of" as const,
          value: traceIds,
        },
      ];

      const equalsResult = await caller.traces.all({
        projectId,
        filter: [
          ...baseFilter,
          {
            column: "Scores (boolean)",
            type: "booleanObject",
            key: scoreName,
            operator: "=",
            value: true,
          },
        ],
        searchQuery: null,
        searchType: ["id"],
        page: 0,
        limit: 50,
        orderBy: {
          column: "timestamp",
          order: "DESC",
        },
      });

      expect(equalsResult.traces.map((t) => t.id)).toEqual([
        traceWithTrueScore.id,
      ]);

      // `<>` is the intended "none of / including unscored" semantics: NOT
      // has() over an empty score_booleans array is true, so traces without
      // any score of that name match too — consistent with categorical
      // filters and InMemoryFilterService.
      const notEqualsResult = await caller.traces.all({
        projectId,
        filter: [
          ...baseFilter,
          {
            column: "Scores (boolean)",
            type: "booleanObject",
            key: scoreName,
            operator: "<>",
            value: true,
          },
        ],
        searchQuery: null,
        searchType: ["id"],
        page: 0,
        limit: 50,
        orderBy: {
          column: "timestamp",
          order: "DESC",
        },
      });

      expect(notEqualsResult.traces.map((t) => t.id).sort()).toEqual(
        [traceWithFalseScore.id, traceWithoutScore.id].sort(),
      );
    });

    it("should search traces by input only", async () => {
      const trace = createTrace({
        project_id: projectId,
        // The insert type declares IO as string, but the ClickHouse client
        // serializes object fixtures on insert — keep them via casts.
        input: { query: "unique_trace_input_keyword" } as unknown as string,
        output: { result: "different output" } as unknown as string,
        name: "input-search-trace",
      });

      await createTracesCh([trace]);

      const traces = await caller.traces.all({
        projectId,
        filter: [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: new Date(new Date().getTime() - 1000).toISOString(),
          },
        ],
        searchQuery: "unique_trace_input_keyword",
        searchType: ["input"], // Search only in input
        page: 0,
        limit: 50,
        orderBy: {
          column: "timestamp",
          order: "DESC",
        },
      });

      expect(traces.traces.length).toBeGreaterThan(0);
      expect(traces.traces.some((t) => t.id === trace.id)).toBe(true);
    });

    it("should search traces by output only", async () => {
      const trace = createTrace({
        project_id: projectId,
        // See input-search test above for why these fixtures are cast.
        input: { query: "simple input" } as unknown as string,
        output: {
          result: "unique_trace_output_keyword for testing",
        } as unknown as string,
        name: "output-search-trace",
      });

      await createTracesCh([trace]);

      const traces = await caller.traces.all({
        projectId,
        filter: [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: new Date(new Date().getTime() - 1000).toISOString(),
          },
        ],
        searchQuery: "unique_trace_output_keyword",
        searchType: ["output"], // Search only in output
        page: 0,
        limit: 50,
        orderBy: {
          column: "timestamp",
          order: "DESC",
        },
      });

      expect(traces.traces.length).toBeGreaterThan(0);
      expect(traces.traces.some((t) => t.id === trace.id)).toBe(true);
    });
  });

  describe("traces.countAll", () => {
    it("count traces correctly", async () => {
      await createTracesCh(
        Array(120)
          .fill(0)
          .map(() =>
            createTrace({
              project_id: projectId,
              tags: ["count-test"],
            }),
          ),
      );

      const traces = await caller.traces.countAll({
        projectId,
        filter: [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: new Date(new Date().getTime() - 1000).toISOString(),
          },
          {
            column: "tags",
            operator: "any of",
            value: ["count-test"],
            type: "arrayOptions",
          },
        ],
        searchQuery: null,
        searchType: ["id"],
        orderBy: {
          column: "timestamp",
          order: "DESC",
        },
      });

      expect(traces.totalCount).toBe(120);
    });
  });

  describe("traces.byId", () => {
    it("access private trace", async () => {
      const trace = createTrace({
        project_id: projectId,
      });

      await createTracesCh([trace]);

      const traceRes = await caller.traces.byId({
        projectId,
        traceId: trace.id,
      });

      expect(traceRes?.id).toEqual(trace.id);
      expect(traceRes?.projectId).toEqual(projectId);
      expect(traceRes?.name).toEqual(trace.name);
      expect(traceRes?.timestamp).toEqual(new Date(trace.timestamp));
      expect(traceRes?.tags?.sort()).toEqual(trace.tags?.sort());
      expect(traceRes?.input).toBeNull();
      expect(traceRes?.output).toBeNull();
      expect(traceRes?.userId).toEqual(trace.user_id);
      expect(traceRes?.sessionId).toEqual(trace.session_id);
    });

    it("access private trace with protected superjson property", async () => {
      const trace = createTrace({
        project_id: projectId,
        metadata: { prototype: "test" },
      });

      await createTracesCh([trace]);

      const traceRes = await caller.traces.byId({
        projectId,
        traceId: trace.id,
      });

      expect(traceRes?.id).toEqual(trace.id);
      expect(traceRes?.projectId).toEqual(projectId);
      expect(traceRes?.metadata).toEqual(JSON.stringify(trace.metadata));
    });

    it("access public trace", async () => {
      const differentProjectId = randomUUID();
      const trace = createTrace({
        project_id: differentProjectId,
        public: true,
      });

      await createTracesCh([trace]);

      const traceRes = await caller.traces.byId({
        projectId: differentProjectId,
        traceId: trace.id,
      });

      expect(traceRes?.id).toEqual(trace.id);
      expect(traceRes?.projectId).toEqual(differentProjectId);
      expect(traceRes?.name).toEqual(trace.name);
      expect(traceRes?.timestamp).toEqual(new Date(trace.timestamp));
    });

    // In dual write mode, internally produced traces (e.g. code-eval execution
    // traces) exist ONLY in the events tables. Trace access must fall back to
    // the events table instead of 404ing on the legacy `traces` miss — the
    // fast-preview list showed such traces while the detail view threw
    // "Trace not found".
    // This specifically covers the dual-write fallback. Events-only routing is
    // covered in traces-trpc-events-only.servertest.ts.
    const isDualWrite = env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "dual";
    (isDualWrite ? it : it.skip)(
      "access trace that only exists in the events table",
      async () => {
        const traceId = randomUUID();
        const rootId = randomUUID();
        const clickedId = randomUUID();
        const rootTimestamp = new Date("2026-07-14T21:42:12.184Z");
        const clickedTimestamp = new Date("2026-07-15T00:27:13.935Z");

        await createEventsCh([
          createEvent({
            id: rootId,
            span_id: rootId,
            trace_id: traceId,
            project_id: projectId,
            parent_span_id: null,
            start_time: rootTimestamp.getTime() * 1000,
          }),
          createEvent({
            id: clickedId,
            span_id: clickedId,
            trace_id: traceId,
            project_id: projectId,
            parent_span_id: rootId,
            start_time: clickedTimestamp.getTime() * 1000,
          }),
        ]);

        // Precondition: legacy `traces` has no row.
        expect(
          await getTraceByIdFromTracesTable({ traceId, projectId }),
        ).toBeUndefined();

        // ClickHouse insert visibility can lag.
        await waitForExpect(async () => {
          const result = await caller.events.byTraceId({
            projectId,
            traceId,
            timestamp: clickedTimestamp,
          });
          expect(result.observations.map(({ id }) => id)).toEqual(
            expect.arrayContaining([rootId, clickedId]),
          );
          expect(result.observations).toHaveLength(2);
        });
      },
    );

    it("access trace without any authentication", async () => {
      const unAuthedSession = createInnerTRPCContext({
        session: null,
        headers: {},
      });
      const unAuthedCaller = appRouter.createCaller({
        ...unAuthedSession,
        prisma,
      });

      const trace = createTrace({
        project_id: projectId,
        public: true,
      });

      await createTracesCh([trace]);

      const traceRes = await unAuthedCaller.traces.byId({
        projectId,
        traceId: trace.id,
      });

      expect(traceRes?.id).toEqual(trace.id);
      expect(traceRes?.projectId).toEqual(projectId);
      expect(traceRes?.name).toEqual(trace.name);
      expect(traceRes?.timestamp).toEqual(new Date(trace.timestamp));
    });
  });

  describe("traces.filterOptions", () => {
    it("should include all possible categorical score values from score configs", async () => {
      // Create a trace
      const trace = createTrace({
        project_id: projectId,
      });
      await createTracesCh([trace]);

      // Create a categorical score config with multiple possible values
      const scoreConfig = await prisma.scoreConfig.create({
        data: {
          projectId: projectId,
          name: "sentiment",
          dataType: "CATEGORICAL",
          categories: [
            { label: "positive", value: 1 },
            { label: "neutral", value: 0 },
            { label: "negative", value: -1 },
          ],
        },
      });

      // Create only one actual score (subset of possible values)
      const score = createTraceScore({
        project_id: projectId,
        trace_id: trace.id,
        name: "sentiment",
        string_value: "custom",
        data_type: "CATEGORICAL",
        config_id: scoreConfig.id,
      });
      await createScoresCh([score]);

      // Get filter options
      const filterOptions = await caller.traces.filterOptions({
        projectId,
      });

      // Find the sentiment score in categorical scores
      const sentimentScore = filterOptions.score_categories.find(
        (score) => score.label === "sentiment",
      );

      expect(sentimentScore).toBeDefined();
      expect(sentimentScore?.values).toEqual(
        expect.arrayContaining(["custom", "positive", "neutral", "negative"]),
      );
      // Should include all possible values from config, not just the actual score value
      expect(sentimentScore?.values).toHaveLength(4);
    });

    it("should include observation-only score names for trace-scoped aggregates", async () => {
      const trace = createTrace({
        project_id: projectId,
      });
      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
      });
      await createTracesCh([trace]);
      await createObservationsCh([observation]);

      const observationScoreName = `observation_quality_${randomUUID()}`;
      const sessionScoreName = `session_quality_${randomUUID()}`;
      const scoreTimestamp = Date.now();

      await createScoresCh([
        createTraceScore({
          project_id: projectId,
          trace_id: trace.id,
          observation_id: observation.id,
          name: observationScoreName,
          source: "API",
          data_type: "NUMERIC",
          value: 0.7,
          timestamp: scoreTimestamp,
        }),
        createSessionScore({
          project_id: projectId,
          name: sessionScoreName,
          source: "API",
          data_type: "NUMERIC",
          value: 0.5,
          timestamp: scoreTimestamp,
        }),
      ]);

      const filterOptions = await caller.traces.filterOptions({
        projectId,
        timestampFilter: [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: new Date(scoreTimestamp - 1_000),
          },
          {
            column: "timestamp",
            type: "datetime",
            operator: "<=",
            value: new Date(scoreTimestamp + 1_000),
          },
        ],
      });

      expect(filterOptions.scores_avg).toEqual(
        expect.arrayContaining([observationScoreName]),
      );
      expect(filterOptions.scores_avg).not.toContain(sessionScoreName);
    });

    it("should include observation-only boolean score names for trace-scoped aggregates", async () => {
      const trace = createTrace({
        project_id: projectId,
      });
      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
      });
      await createTracesCh([trace]);
      await createObservationsCh([observation]);

      const observationScoreName = `observation_bool_${randomUUID()}`;
      const emptyObservationScoreName = `observation_bool_empty_${randomUUID()}`;
      const sessionScoreName = `session_bool_${randomUUID()}`;
      const scoreTimestamp = Date.now();

      await createScoresCh([
        createTraceScore({
          project_id: projectId,
          trace_id: trace.id,
          observation_id: observation.id,
          name: observationScoreName,
          source: "API",
          data_type: "BOOLEAN",
          value: 1,
          string_value: "True",
          timestamp: scoreTimestamp,
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: trace.id,
          observation_id: observation.id,
          name: emptyObservationScoreName,
          source: "API",
          data_type: "BOOLEAN",
          value: 1,
          string_value: "",
          timestamp: scoreTimestamp,
        }),
        createSessionScore({
          project_id: projectId,
          name: sessionScoreName,
          source: "API",
          data_type: "BOOLEAN",
          value: 0,
          string_value: "False",
          timestamp: scoreTimestamp,
        }),
      ]);

      const filterOptions = await caller.traces.filterOptions({
        projectId,
        timestampFilter: [
          {
            column: "timestamp",
            type: "datetime",
            operator: ">=",
            value: new Date(scoreTimestamp - 1_000),
          },
          {
            column: "timestamp",
            type: "datetime",
            operator: "<=",
            value: new Date(scoreTimestamp + 1_000),
          },
        ],
      });

      expect(filterOptions.score_booleans).toEqual(
        expect.arrayContaining([observationScoreName]),
      );
      expect(filterOptions.score_booleans).not.toContain(
        emptyObservationScoreName,
      );
      expect(filterOptions.score_booleans).not.toContain(sessionScoreName);
    });
  });

  describe("traces.metrics", () => {
    it("should aggregate observation-only scores onto the trace row", async () => {
      const trace = createTrace({
        project_id: projectId,
      });
      const firstObservation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
      });
      const secondObservation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
      });

      await createTracesCh([trace]);
      await createObservationsCh([firstObservation, secondObservation]);
      await createScoresCh([
        createTraceScore({
          project_id: projectId,
          trace_id: trace.id,
          observation_id: firstObservation.id,
          name: "quality",
          source: "API",
          data_type: "NUMERIC",
          value: 0.4,
        }),
        createTraceScore({
          project_id: projectId,
          trace_id: trace.id,
          observation_id: secondObservation.id,
          name: "quality",
          source: "API",
          data_type: "NUMERIC",
          value: 0.8,
        }),
      ]);

      const metrics = await caller.traces.metrics({
        projectId,
        traceIds: [trace.id],
        filter: [],
      });

      const aggregateKey = composeAggregateScoreKey({
        name: "quality",
        source: "API",
        dataType: "NUMERIC",
      });

      expect(metrics).toHaveLength(1);
      const aggregate = metrics[0]?.scores[aggregateKey];
      if (aggregate?.type !== "NUMERIC") {
        throw new Error(
          `Expected a NUMERIC aggregate for ${aggregateKey}, got ${aggregate?.type}`,
        );
      }
      expect(aggregate.average).toBeCloseTo(0.6, 5);
      expect(aggregate.values).toEqual(expect.arrayContaining([0.4, 0.8]));
    });
  });

  describe("batchExport.create", () => {
    it("rejects new legacy full-text batch exports when legacy IO search is disabled", async () => {
      mutableEnv.LANGFUSE_DISABLE_LEGACY_TRACING_IO_SEARCH = "true";

      await expect(
        caller.batchExport.create({
          projectId,
          name: "Legacy IO search export",
          format: BatchExportFileFormat.CSV,
          query: {
            tableName: BatchTableNames.Traces,
            filter: [],
            searchQuery: "expensive search",
            searchType: ["content"],
            orderBy: {
              column: "timestamp",
              order: "DESC",
            },
          },
        }),
      ).rejects.toThrow("Input/output search is disabled");
    });
  });

  describe("traces.getAgentGraphData", () => {
    it("should allow unauthenticated access to public trace agent graph data", async () => {
      const unAuthedSession = createInnerTRPCContext({
        session: null,
        headers: {},
      });
      const unAuthedCaller = appRouter.createCaller({
        ...unAuthedSession,
        prisma,
      });

      const trace = createTrace({
        project_id: projectId,
        public: true,
      });

      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
        type: "GENERATION",
      });

      await createTracesCh([trace]);
      await createObservationsCh([observation]);

      const minStartTime = new Date(
        new Date(trace.timestamp).getTime() - 1000,
      ).toISOString();
      const maxStartTime = new Date(
        new Date(trace.timestamp).getTime() + 1000,
      ).toISOString();

      const agentGraphData = await unAuthedCaller.traces.getAgentGraphData({
        projectId,
        traceId: trace.id,
        minStartTime,
        maxStartTime,
      });

      expect(agentGraphData).toBeDefined();
      expect(Array.isArray(agentGraphData)).toBe(true);
    });

    it("should deny unauthenticated access to private trace agent graph data", async () => {
      const unAuthedSession = createInnerTRPCContext({
        session: null,
        headers: {},
      });
      const unAuthedCaller = appRouter.createCaller({
        ...unAuthedSession,
        prisma,
      });

      const trace = createTrace({
        project_id: projectId,
        public: false,
      });

      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
        type: "GENERATION",
      });

      await createTracesCh([trace]);
      await createObservationsCh([observation]);

      const minStartTime = new Date(
        new Date(trace.timestamp).getTime() - 1000,
      ).toISOString();
      const maxStartTime = new Date(
        new Date(trace.timestamp).getTime() + 1000,
      ).toISOString();

      await expect(
        unAuthedCaller.traces.getAgentGraphData({
          projectId,
          traceId: trace.id,
          minStartTime,
          maxStartTime,
        }),
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });
  });

  describe("traces.hasTracingConfigured", () => {
    // In legacy/dual write modes the legacy `traces` table is still written and
    // is the freshest source, so the onboarding gate must open from a legacy
    // trace row alone. The events_only routing lives in
    // traces-trpc-events-only.servertest.ts.
    it("should clear the tracing onboarding gate from legacy traces-table data", async () => {
      // Fresh project: `hasTraces` flag unset, no rows, no retention.
      const freshProjectId = randomUUID();
      await prisma.project.create({
        data: {
          id: freshProjectId,
          name: "legacy-onboarding",
          orgId: "seed-org-id",
        },
      });

      const freshSession: Session = {
        ...session,
        user: {
          ...session.user!,
          organizations: [
            {
              ...session.user!.organizations[0],
              projects: [
                {
                  id: freshProjectId,
                  role: "ADMIN",
                  retentionDays: null,
                  deletedAt: null,
                  name: "legacy-onboarding",
                  hasTraces: false,
                  metadata: {},
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          ],
        },
      };
      const freshCtx = createInnerTRPCContext({
        session: freshSession,
        headers: {},
      });
      const freshCaller = appRouter.createCaller({ ...freshCtx, prisma });

      try {
        // Gate stays closed before any data is ingested.
        await expect(
          freshCaller.traces.hasTracingConfigured({
            projectId: freshProjectId,
          }),
        ).resolves.toBe(false);

        // Trace is written to the legacy table only.
        await createTracesCh([createTrace({ project_id: freshProjectId })]);

        // Gate must open from legacy traces-table data alone (ClickHouse
        // insert visibility can lag).
        await waitForExpect(async () => {
          expect(
            await freshCaller.traces.hasTracingConfigured({
              projectId: freshProjectId,
            }),
          ).toBe(true);
        });

        // A positive detection persists to the project's hasTraces flag so
        // the UI can stop polling ClickHouse.
        const project = await prisma.project.findUnique({
          where: { id: freshProjectId },
          select: { hasTraces: true },
        });
        expect(project?.hasTraces).toBe(true);
      } finally {
        await prisma.project.delete({ where: { id: freshProjectId } });
      }
    });
  });

  describe("traces flags", () => {
    const useEventsTable =
      env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true";
    it("should bookmark a trace", async () => {
      // Create a trace that is not bookmarked
      const trace = createTrace({
        project_id: projectId,
        bookmarked: false,
      });

      await createTracesCh([trace]);

      if (useEventsTable) {
        await createEventsCh([
          createEvent({
            id: trace.id,
            span_id: trace.id,
            trace_id: trace.id,
            project_id: trace.project_id,
            parent_span_id: null,
            bookmarked: false,
          }),
        ]);
      }

      const cleanTrace = await getTraceByIdFromTracesTable({
        traceId: trace.id,
        projectId,
      });

      expect(cleanTrace).toBeDefined();
      expect(cleanTrace?.bookmarked).toBe(false);

      // Bookmark the trace
      const result = await caller.traces.bookmark({
        projectId,
        traceId: trace.id,
        bookmarked: true,
      });

      expect(result).toBeDefined();
      expect(result?.id).toEqual(trace.id);
      expect(result?.bookmarked).toBe(true);

      // Verify the trace is bookmarked in the database
      const updatedTrace = await getTraceByIdFromTracesTable({
        traceId: trace.id,
        projectId,
      });

      expect(updatedTrace).toBeDefined();
      expect(updatedTrace?.bookmarked).toBe(true);

      if (useEventsTable) {
        await waitForExpect(async () => {
          // Verify events_core
          const eventTrace = await getTraceByIdFromEventsTable({
            projectId,
            traceId: trace.id,
            renderingProps: {
              truncated: true,
              shouldJsonParse: false,
            },
          });
          expect(eventTrace).toBeDefined();
          expect(eventTrace?.bookmarked).toBe(true);

          // Verify events_full
          const eventTraceFull = await getTraceByIdFromEventsTable({
            projectId,
            traceId: trace.id,
            renderingProps: {
              truncated: false,
              shouldJsonParse: true,
            },
          });
          expect(eventTraceFull).toBeDefined();
          expect(eventTraceFull?.bookmarked).toBe(true);
        });
      }
    });

    it("should make a trace public", async () => {
      // Create a trace that is not bookmarked
      const trace = createTrace({
        project_id: projectId,
        public: false,
      });

      await createTracesCh([trace]);

      if (useEventsTable) {
        await createEventsCh([
          createEvent({
            id: trace.id,
            span_id: trace.id,
            trace_id: trace.id,
            project_id: trace.project_id,
            parent_span_id: null,
            public: false,
          }),
        ]);
      }

      const cleanTrace = await getTraceByIdFromTracesTable({
        traceId: trace.id,
        projectId,
      });

      expect(cleanTrace).toBeDefined();
      expect(cleanTrace?.public).toBe(false);

      // Bookmark the trace
      const result = await caller.traces.publish({
        projectId,
        traceId: trace.id,
        public: true,
      });

      expect(result).toBeDefined();
      expect(result?.id).toEqual(trace.id);
      expect(result?.public).toBe(true);

      // Verify the trace is public in the database
      const updatedTrace = await getTraceByIdFromTracesTable({
        traceId: trace.id,
        projectId,
      });

      expect(updatedTrace).toBeDefined();
      expect(updatedTrace?.public).toBe(true);

      if (useEventsTable) {
        await waitForExpect(async () => {
          // Verify events_core
          const eventTrace = await getTraceByIdFromEventsTable({
            projectId,
            traceId: trace.id,
            renderingProps: {
              truncated: true,
              shouldJsonParse: false,
            },
          });
          expect(eventTrace).toBeDefined();
          expect(eventTrace?.public).toBe(true);

          // Verify events_full
          const eventTraceFull = await getTraceByIdFromEventsTable({
            projectId,
            traceId: trace.id,
            renderingProps: {
              truncated: false,
              shouldJsonParse: true,
            },
          });
          expect(eventTraceFull).toBeDefined();
          expect(eventTraceFull?.public).toBe(true);
        });
      }
    });
  });
});
