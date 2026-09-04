/**
 * Sparse trace_sessions behaviour for the events_only write mode.
 *
 * In events_only mode ingestion no longer upserts a trace_sessions row per
 * trace. trace_sessions becomes a sparse metadata side-table (rows only exist
 * once a session has been bookmarked or published). The reads must therefore:
 *  - never 404 just because the Postgres row is missing (the session exists in
 *    the events store) — covered by enforceSessionAccess + byIdWithScoresFromEvents,
 *  - and bookmark/publish must upsert (create-on-demand) rather than update.
 *
 * The write mode is read from the parsed shared env at module load, so we force
 * it via process.env BEFORE any module is imported (mirrors
 * traces-trpc-events-only.servertest.ts).
 */
import { vi } from "vitest";

// The events_full table is created only by the ClickHouse dev-tables setup,
// which runs in the default deploy-mode where .env.dev.example enables the v4
// preview opt-in. The -azure and -redis-cluster CI runs skip that setup, so the
// events table is absent. Capture the ORIGINAL opt-in flag BEFORE forcing it on
// so we can detect (and skip) those events-table-less environments.
const eventsTableAvailable = vi.hoisted(() => {
  const enabled =
    process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true";
  process.env.LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
  // events_only requires the preview opt-in (web/worker env validation enforces
  // the pairing and web read paths gate on it).
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
  getSessionMetricsFromEvents,
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
describe("sessions trpc (events_only write mode) liveness", () => {
  it("should not hang redis when the events table is unavailable", () => {});
});

maybe("sessions trpc (events_only write mode)", () => {
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

  // Seed a single root event for a session into the events table and wait until
  // the session is countable (ClickHouse insert visibility can lag).
  const seedSessionEvent = async (sessionId: string) => {
    const traceId = randomUUID();
    const startTime = new Date();
    await createEventsCh([
      createEvent({
        id: traceId,
        span_id: traceId,
        trace_id: traceId,
        project_id: projectId,
        parent_span_id: "",
        type: "SPAN",
        session_id: sessionId,
        user_id: "user-a",
        start_time: startTime.getTime() * 1000,
      }),
    ]);

    await waitForExpect(async () => {
      const rows = await getSessionMetricsFromEvents({
        projectId,
        sessionIds: [sessionId],
      });
      expect(rows[0]?.session_id).toBe(sessionId);
    });

    return { traceId, startTime };
  };

  it("forces events_only write mode", () => {
    expect(env.LANGFUSE_MIGRATION_V4_WRITE_MODE).toBe("events_only");
  });

  it("returns a session that has no trace_sessions row", async () => {
    const sessionId = randomUUID();

    // Precondition: no Postgres metadata row exists for this session.
    const before = await prisma.traceSession.findFirst({
      where: { id: sessionId, projectId },
    });
    expect(before).toBeNull();

    const { startTime } = await seedSessionEvent(sessionId);

    const result = await caller.sessions.byIdWithScoresFromEvents({
      projectId,
      sessionId,
    });

    expect(result.id).toBe(sessionId);
    expect(result.bookmarked).toBe(false);
    expect(result.public).toBe(false);
    expect(result.countTraces).toBeGreaterThanOrEqual(1);
    expect(
      Math.abs(result.minTimestamp.getTime() - startTime.getTime()),
    ).toBeLessThan(1000);
    expect(
      Math.abs(result.maxTimestamp.getTime() - startTime.getTime()),
    ).toBeLessThan(1000);
  });

  it("bookmark creates the trace_sessions row on demand and round-trips", async () => {
    const sessionId = randomUUID();
    await seedSessionEvent(sessionId);

    const before = await prisma.traceSession.findFirst({
      where: { id: sessionId, projectId },
    });
    expect(before).toBeNull();

    const mutated = await caller.sessions.bookmark({
      projectId,
      sessionId,
      bookmarked: true,
    });
    expect(mutated.id).toBe(sessionId);
    expect(mutated.bookmarked).toBe(true);

    const created = await prisma.traceSession.findFirst({
      where: { id: sessionId, projectId },
    });
    expect(created?.bookmarked).toBe(true);

    const read = await caller.sessions.byIdWithScoresFromEvents({
      projectId,
      sessionId,
    });
    expect(read.bookmarked).toBe(true);
    expect(read.public).toBe(false);
  });

  it("publish creates the trace_sessions row on demand and round-trips", async () => {
    const sessionId = randomUUID();
    await seedSessionEvent(sessionId);

    const before = await prisma.traceSession.findFirst({
      where: { id: sessionId, projectId },
    });
    expect(before).toBeNull();

    const mutated = await caller.sessions.publish({
      projectId,
      sessionId,
      public: true,
    });
    expect(mutated.id).toBe(sessionId);
    expect(mutated.public).toBe(true);

    const read = await caller.sessions.byIdWithScoresFromEvents({
      projectId,
      sessionId,
    });
    expect(read.public).toBe(true);
    expect(read.bookmarked).toBe(false);
  });
});
