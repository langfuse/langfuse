/**
 * Events-only write-mode routing for traces.bookmark / traces.publish.
 *
 * getTraceById (repositories/events.ts) routes reads to the events table only
 * when LANGFUSE_MIGRATION_V4_WRITE_MODE=events_only; in legacy/dual the legacy
 * `traces` table is still written and is the freshest source, so reads stay
 * there. That flag is read from the parsed env at module load, and under vitest
 * the wrapper's env instance is not the same object a test could mutate at
 * runtime — so we force the mode via process.env BEFORE any module is imported.
 *
 * This is split into its own file because the env is process-wide for the file;
 * the dual-mode flag tests live in traces-trpc.servertest.ts.
 */
import { vi } from "vitest";

// The events_full table is created only by the ClickHouse dev-tables setup
// (CI's "Setup Dev Tables" step), which runs in the default deploy-mode where
// .env.dev.example enables the v4 preview opt-in. The -azure and -redis-cluster
// CI runs skip that setup, so the events table is absent and the reads below
// would error. Capture the ORIGINAL opt-in flag here, BEFORE the override forces
// it on — once forced, the parsed shared env always reports "true" and we could
// never detect the events-table-less environments.
const eventsTableAvailable = vi.hoisted(() => {
  const enabled =
    process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true";
  process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
  // events_only requires the preview opt-in (web read paths gate on it, and
  // worker/web env validation enforces the pairing).
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
  return enabled;
});

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createEvent,
  createEventsCh,
  getTraceByIdFromEventsTable,
  getTraceByIdFromTracesTable,
} from "@langfuse/shared/src/server";
import { env } from "@langfuse/shared/src/env";
import waitForExpect from "wait-for-expect";
import { randomUUID } from "crypto";

// Skip on environments without the events_full dev table (azure / redis-cluster
// CI). Mirrors the gating used across the other events-table server tests.
const maybe = eventsTableAvailable ? describe : describe.skip;

// At least one always-running test so the file does not hang on the redis
// connections opened by the tRPC caller imports when the events-table tests
// below are skipped via `maybe`.
describe("traces trpc (events_only write mode) liveness", () => {
  it("should not hang redis when the events table is unavailable", () => {});
});

maybe("traces trpc (events_only write mode)", () => {
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

  // Sanity check that the forced write mode reached the parsed shared env that
  // getTraceById routes on. If this ever regresses, the assertions below would
  // silently fall back to reading the (empty) legacy table.
  it("forces events_only write mode", () => {
    expect(env.LANGFUSE_MIGRATION_V4_WRITE_MODE).toBe("events_only");
  });

  it("loads a cross-midnight trace from a clicked observation timestamp", async () => {
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
        parent_span_id: "",
        start_time: rootTimestamp.getTime() * 1000,
      }),
      createEvent({
        id: clickedId,
        span_id: clickedId,
        trace_id: traceId,
        project_id: projectId,
        parent_span_id: rootId,
        start_time: clickedTimestamp.getTime() * 1000,
        is_app_root: true,
      }),
    ]);
    await waitForExpect(async () => {
      const trace = await getTraceByIdFromEventsTable({ projectId, traceId });
      expect(trace?.id).toBe(traceId);
    });

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

  // On a fresh events_only deployment tracing data is written ONLY to the
  // events tables; the legacy `traces` table stays intentionally empty. The
  // onboarding gate must detect data in the events table, otherwise the
  // Traces UI is stuck on the "Set up tracing" screen forever (#14827).
  it("should clear the tracing onboarding gate from events-table data", async () => {
    // Fresh project: `hasTraces` flag unset, no legacy rows, no retention.
    const freshProjectId = randomUUID();
    await prisma.project.create({
      data: {
        id: freshProjectId,
        name: "events-only-onboarding",
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
                name: "events-only-onboarding",
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

      // Trace is written to the events table only - NOT the legacy table.
      const traceId = randomUUID();
      await createEventsCh([
        createEvent({
          id: traceId,
          span_id: traceId,
          trace_id: traceId,
          project_id: freshProjectId,
          parent_span_id: null,
        }),
      ]);

      // Gate must open from events-table data alone (ClickHouse insert
      // visibility can lag).
      await waitForExpect(async () => {
        expect(
          await freshCaller.traces.hasTracingConfigured({
            projectId: freshProjectId,
          }),
        ).toBe(true);
      });

      // A positive detection persists to the project's hasTraces flag so the
      // UI can stop polling ClickHouse.
      const project = await prisma.project.findUnique({
        where: { id: freshProjectId },
        select: { hasTraces: true },
      });
      expect(project?.hasTraces).toBe(true);
    } finally {
      await prisma.project.delete({ where: { id: freshProjectId } });
    }
  });

  // A trace ingested after the legacy->events cutover lives ONLY in the events
  // table. In events_only mode getTraceById must route the mutation read to the
  // events table; otherwise the legacy `traces` read returns undefined and the
  // bookmark silently no-ops.
  it("should bookmark a trace that only exists in the events table", async () => {
    const traceId = randomUUID();

    // Trace is written to the events table only - NOT the legacy table.
    await createEventsCh([
      createEvent({
        id: traceId,
        span_id: traceId,
        trace_id: traceId,
        project_id: projectId,
        parent_span_id: null,
        bookmarked: false,
      }),
    ]);

    // Precondition: legacy `traces` has no row (events_only scenario).
    const legacyTrace = await getTraceByIdFromTracesTable({
      traceId,
      projectId,
    });
    expect(legacyTrace).toBeUndefined();

    // Ensure the freshly-inserted event is queryable before mutating
    // (ClickHouse insert visibility can lag).
    await waitForExpect(async () => {
      const eventTrace = await getTraceByIdFromEventsTable({
        projectId,
        traceId,
        renderingProps: { truncated: false, shouldJsonParse: true },
      });
      expect(eventTrace?.id).toBe(traceId);
    });

    const result = await caller.traces.bookmark({
      projectId,
      traceId,
      bookmarked: true,
    });

    expect(result).toBeDefined();
    expect(result?.id).toEqual(traceId);
    expect(result?.bookmarked).toBe(true);

    await waitForExpect(async () => {
      const eventTraceFull = await getTraceByIdFromEventsTable({
        projectId,
        traceId,
        renderingProps: {
          truncated: false,
          shouldJsonParse: true,
        },
      });
      expect(eventTraceFull).toBeDefined();
      expect(eventTraceFull?.bookmarked).toBe(true);
    });
  });

  // Same routing as the bookmark case, but publish throws NOT_FOUND (rewrapped
  // as INTERNAL_SERVER_ERROR) instead of silently no-opping when the read is
  // misrouted to the empty legacy table.
  it("should make a trace public that only exists in the events table", async () => {
    const traceId = randomUUID();

    // Trace is written to the events table only - NOT the legacy table.
    await createEventsCh([
      createEvent({
        id: traceId,
        span_id: traceId,
        trace_id: traceId,
        project_id: projectId,
        parent_span_id: null,
        public: false,
      }),
    ]);

    // Precondition: legacy `traces` has no row (events_only scenario).
    const legacyTrace = await getTraceByIdFromTracesTable({
      traceId,
      projectId,
    });
    expect(legacyTrace).toBeUndefined();

    // Ensure the freshly-inserted event is queryable before mutating.
    await waitForExpect(async () => {
      const eventTrace = await getTraceByIdFromEventsTable({
        projectId,
        traceId,
        renderingProps: { truncated: false, shouldJsonParse: true },
      });
      expect(eventTrace?.id).toBe(traceId);
    });

    const result = await caller.traces.publish({
      projectId,
      traceId,
      public: true,
    });

    expect(result).toBeDefined();
    expect(result?.id).toEqual(traceId);
    expect(result?.public).toBe(true);

    await waitForExpect(async () => {
      const eventTraceFull = await getTraceByIdFromEventsTable({
        projectId,
        traceId,
        renderingProps: {
          truncated: false,
          shouldJsonParse: true,
        },
      });
      expect(eventTraceFull).toBeDefined();
      expect(eventTraceFull?.public).toBe(true);
    });
  });
});
