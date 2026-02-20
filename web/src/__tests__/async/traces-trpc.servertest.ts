/** @jest-environment node */

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createTrace,
  createTracesCh,
  createTraceScore,
  createScoresCh,
  getTraceById,
  createEventsCh,
  createEvent,
  getTraceByIdFromEventsTable,
  createObservation,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import waitForExpect from "wait-for-expect";
import { randomUUID } from "crypto";
import { env } from "@/src/env.mjs";

describe("traces trpc", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

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
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
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
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  describe("traces.all", () => {
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
        page: 0,
        limit: 50,
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

    it("access trace without any authentication", async () => {
      const unAuthedSession = createInnerTRPCContext({ session: null });
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
  });

  describe("traces.getAgentGraphData", () => {
    it("should allow unauthenticated access to public trace agent graph data", async () => {
      const unAuthedSession = createInnerTRPCContext({ session: null });
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
      const unAuthedSession = createInnerTRPCContext({ session: null });
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

  describe("traces flags", () => {
    const useEventsTable = env.LANGFUSE_ENABLE_EVENTS_TABLE_FLAGS === "true";
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

      const cleanTrace = await getTraceById({
        traceId: trace.id,
        projectId,
        clickhouseFeatureTag: "tracing-test",
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
      const updatedTrace = await getTraceById({
        traceId: trace.id,
        projectId,
        clickhouseFeatureTag: "tracing-test",
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

      const cleanTrace = await getTraceById({
        traceId: trace.id,
        projectId,
        clickhouseFeatureTag: "tracing-test",
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
      const updatedTrace = await getTraceById({
        traceId: trace.id,
        projectId,
        clickhouseFeatureTag: "tracing-test",
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
