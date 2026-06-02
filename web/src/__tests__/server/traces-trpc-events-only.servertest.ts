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

vi.hoisted(() => {
  process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
  // events_only requires the preview opt-in (web read paths gate on it, and
  // worker/web env validation enforces the pairing).
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN = "true";
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

describe("traces trpc (events_only write mode)", () => {
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

  // Sanity check that the forced write mode reached the parsed shared env that
  // getTraceById routes on. If this ever regresses, the assertions below would
  // silently fall back to reading the (empty) legacy table.
  it("forces events_only write mode", () => {
    expect(env.LANGFUSE_MIGRATION_V4_WRITE_MODE).toBe("events_only");
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
      clickhouseFeatureTag: "tracing-test",
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
      clickhouseFeatureTag: "tracing-test",
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
