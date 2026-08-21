import type { Session } from "next-auth";
import type { Mock } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createObservation,
  createObservationsCh,
  createScoresCh,
  createTrace,
  createTraceScore,
  createTracesCh,
  getTracesIdentifierForSession,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";

// getTracesIdentifierForSession is spied so the trace-cap test below can
// force a synthetic trace list without inserting SESSION_TRACES_LIMIT+1 rows
// into ClickHouse; every other test falls through to the real implementation.
vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual("@langfuse/shared/src/server");
  return {
    ...actual,
    getTracesIdentifierForSession: vi.fn(
      (actual as any).getTracesIdentifierForSession,
    ),
  };
});

// Keep in sync with SESSION_TRACES_LIMIT in web/src/server/api/routers/sessions.ts.
const SESSION_TRACES_LIMIT = 2_000;

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
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: "Test Project",
              hasTraces: false,
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

  describe("sessions.byIdWithScores", () => {
    it("access private session", async () => {
      const sessionId = randomUUID();

      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId,
        },
      });

      const trace = createTrace({
        project_id: projectId,
        session_id: sessionId,
      });

      const trace2 = createTrace({
        project_id: projectId,
        session_id: sessionId,
      });

      await createTracesCh([trace, trace2]);

      const observation = createObservation({
        project_id: projectId,
        trace_id: trace.id,
      });

      const observation2 = createObservation({
        project_id: projectId,
        trace_id: trace2.id,
      });

      const observation3 = createObservation({
        project_id: projectId,
        trace_id: trace2.id,
      });

      await createObservationsCh([observation, observation2, observation3]);

      const sessionRes = await caller.sessions.byIdWithScores({
        projectId,
        sessionId,
      });

      expect(sessionRes).toEqual({
        id: sessionId,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
        projectId: projectId,
        environment: "default",
        bookmarked: false,
        public: false,
        scores: [],
        traces: expect.arrayContaining([
          expect.objectContaining({
            id: trace.id,
            userId: trace.user_id,
            name: trace.name,
            timestamp: new Date(trace.timestamp),
            scores: [],
            environment: "default",
          }),
          expect.objectContaining({
            id: trace2.id,
            userId: trace2.user_id,
            name: trace2.name,
            timestamp: new Date(trace2.timestamp),
            scores: [],
            environment: "default",
          }),
        ]),
        totalCost: expect.any(Number),
        users: expect.arrayContaining([trace.user_id, trace2.user_id]),
        tracesTruncated: false,
      });
    });

    it("associates each trace with only its own scores via a single-pass map, not a per-trace filter over all scores", async () => {
      // Regression test: sessions.byIdWithScores used to build each trace's
      // scores with `validatedScores.filter((s) => s.traceId === t.id)`
      // inside the per-trace map, i.e. O(traces * scores). It must instead
      // build one Map<traceId, Score[]> in a single pass and look each trace
      // up in O(1). This test does not measure complexity directly; it
      // exercises several traces each with a distinct, non-overlapping set of
      // scores (plus a session-level score with no traceId, and a trace with
      // no scores) and asserts every trace ends up with exactly its own
      // scores and nothing from any other trace — the invariant a per-trace
      // filter and a traceId->scores map both must uphold identically.
      const sessionId = randomUUID();

      await prisma.traceSession.create({
        data: { id: sessionId, projectId },
      });

      const traceCount = 5;
      const scoresPerTrace = 4;
      const traces = Array.from({ length: traceCount }, () =>
        createTrace({ project_id: projectId, session_id: sessionId }),
      );
      // One trace deliberately has zero scores.
      const traceWithNoScores = traces[traces.length - 1];

      await createTracesCh(traces);

      const scores = traces.flatMap((t) =>
        t.id === traceWithNoScores.id
          ? []
          : Array.from({ length: scoresPerTrace }, () =>
              createTraceScore({
                project_id: projectId,
                trace_id: t.id,
                observation_id: null,
              }),
            ),
      );
      await createScoresCh(scores);

      const sessionRes = await caller.sessions.byIdWithScores({
        projectId,
        sessionId,
      });

      expect(sessionRes.tracesTruncated).toBe(false);
      expect(sessionRes.traces).toHaveLength(traceCount);

      for (const trace of traces) {
        const returnedTrace = sessionRes.traces.find((t) => t.id === trace.id);
        expect(returnedTrace).toBeDefined();
        const expectedScoreIds = scores
          .filter((s) => s.trace_id === trace.id)
          .map((s) => s.id)
          .sort();
        const actualScoreIds = (returnedTrace!.scores as { id: string }[])
          .map((s) => s.id)
          .sort();
        expect(actualScoreIds).toEqual(expectedScoreIds);
      }
    });
  });

  describe("sessions.byIdWithScores trace cap", () => {
    it("caps the number of traces processed and signals truncation when a session has more traces than the cap", async () => {
      const sessionId = randomUUID();

      await prisma.traceSession.create({
        data: { id: sessionId, projectId },
      });

      const overCapCount = SESSION_TRACES_LIMIT + 1;
      const now = Date.now();
      const syntheticTraces = Array.from({ length: overCapCount }, (_, i) => ({
        id: `synthetic-trace-${i}`,
        userId: "",
        name: "synthetic",
        timestamp: new Date(now - i * 1000),
        environment: "default",
      }));

      (getTracesIdentifierForSession as Mock).mockResolvedValueOnce(
        syntheticTraces,
      );

      const sessionRes = await caller.sessions.byIdWithScores({
        projectId,
        sessionId,
      });

      expect(sessionRes.tracesTruncated).toBe(true);
      expect(sessionRes.traces).toHaveLength(SESSION_TRACES_LIMIT);
    });
  });

  describe("sessions.all", () => {
    it("should handle large usage filters correctly", async () => {
      // We expect that this doesn't throw an error due to a number overflow

      // When
      const sessions = await caller.sessions.all({
        projectId,
        limit: 50,
        page: 0,
        orderBy: {
          column: "createdAt",
          order: "DESC",
        },
        filter: [
          {
            column: "Usage",
            operator: ">=",
            value: 3182169638,
            type: "number",
          },
        ],
      });

      // Then
      expect(sessions.sessions).toBeDefined();
    });

    it("should return empty when filtering by session_id and mismatched environment", async () => {
      // Setup - create a session with non-default environment
      const sessionId = randomUUID();
      const testEnvironment = "staging";

      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId,
          environment: testEnvironment,
        },
      });

      const trace = createTrace({
        project_id: projectId,
        session_id: sessionId,
        environment: testEnvironment,
      });
      await createTracesCh([trace]);

      // When - filter by correct session_id but wrong environment
      const sessions = await caller.sessions.all({
        projectId,
        limit: 50,
        page: 0,
        orderBy: {
          column: "createdAt",
          order: "DESC",
        },
        filter: [
          {
            column: "ID",
            operator: "=",
            value: sessionId,
            type: "string",
          },
          {
            column: "environment",
            operator: "=",
            value: "production",
            type: "string",
          },
        ],
      });

      // Then - should return empty result
      expect(sessions.sessions).toEqual([]);
    });
  });

  describe("sessions.countAll", () => {
    it("should count sessions", async () => {
      // Setup
      const sessionId = randomUUID();

      await prisma.traceSession.create({
        data: {
          id: sessionId,
          projectId,
        },
      });

      const trace = createTrace({
        project_id: projectId,
        session_id: sessionId,
      });
      await createTracesCh([trace]);

      // When
      const sessions = await caller.sessions.countAll({
        projectId,
        filter: null,
        orderBy: null,
      });

      // Then
      expect(sessions.totalCount).toBeGreaterThan(0);
    });
  });
});
