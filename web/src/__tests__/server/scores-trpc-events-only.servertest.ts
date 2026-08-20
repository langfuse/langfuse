/**
 * Annotation-score session targeting for the events_only write mode.
 *
 * In events_only mode ingestion no longer writes into the legacy `traces`
 * table, so the session-existence check in `scores.createAnnotationScore` /
 * `scores.updateAnnotationScore` must read trace identifiers from the events
 * store. Both handlers call `getTracesIdentifierForSession`, which is a routing
 * wrapper (repositories/events.ts) that dispatches to the events table in
 * events_only mode and to the legacy traces table otherwise. Before the wrapper
 * existed the read hit the (empty) `traces` table and every session-targeted
 * annotation score create/update threw a misleading 404.
 *
 * The write mode is read from the parsed shared env at module load, so we force
 * it via process.env BEFORE any module is imported (mirrors
 * sessions-trpc-events-only.servertest.ts).
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
import { ScoreConfigDataType } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createEvent,
  createEventsCh,
  getTracesIdentifierForSessionFromEvents,
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
describe("scores trpc (events_only write mode) liveness", () => {
  it("should not hang redis when the events table is unavailable", () => {});
});

maybe(
  "scores trpc annotation session targeting (events_only write mode)",
  () => {
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
    // the session's traces are resolvable through the events-table reader the
    // annotation handlers route to in events_only mode.
    const seedSessionEvent = async (sessionId: string) => {
      const traceId = randomUUID();
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
          start_time: Date.now() * 1000,
        }),
      ]);

      await waitForExpect(async () => {
        const traces = await getTracesIdentifierForSessionFromEvents(
          projectId,
          sessionId,
        );
        expect(traces.length).toBeGreaterThanOrEqual(1);
      });

      return traceId;
    };

    // Annotation create does not validate the config against Postgres, but update
    // does. Create one real config so both paths exercise the same input shape.
    const createConfig = async () => {
      const configId = randomUUID();
      await prisma.scoreConfig.create({
        data: {
          id: configId,
          projectId,
          name: `events-only-session-config-${configId.slice(0, 8)}`,
          dataType: ScoreConfigDataType.NUMERIC,
        },
      });
      return configId;
    };

    it("forces events_only write mode", () => {
      expect(env.LANGFUSE_MIGRATION_V4_WRITE_MODE).toBe("events_only");
    });

    it("createAnnotationScore resolves the session via the events table", async () => {
      const sessionId = randomUUID();
      await seedSessionEvent(sessionId);
      const configId = await createConfig();

      // Regression: before the routing wrapper this read the empty legacy `traces`
      // table and threw "No trace referencing session …".
      const score = await caller.scores.createAnnotationScore({
        projectId,
        name: "events-only-session-score",
        value: 1,
        stringValue: null,
        dataType: "NUMERIC",
        scoreTarget: { type: "session", sessionId },
        configId,
        environment: "default",
      });

      expect(score.sessionId).toBe(sessionId);
      expect(score.value).toBe(1);
      expect(score.source).toBe("ANNOTATION");
    });

    it("createAnnotationScore still 404s for a session with no events", async () => {
      const configId = await createConfig();

      await expect(
        caller.scores.createAnnotationScore({
          projectId,
          name: "events-only-missing-session-score",
          value: 1,
          stringValue: null,
          dataType: "NUMERIC",
          scoreTarget: { type: "session", sessionId: randomUUID() },
          configId,
          environment: "default",
        }),
      ).rejects.toThrow(/No trace referencing session/);
    });

    it("updateAnnotationScore upserts a session score via the events table", async () => {
      const sessionId = randomUUID();
      await seedSessionEvent(sessionId);
      const configId = await createConfig();

      // A score id that does not yet exist in ClickHouse, with a client-provided
      // timestamp, forces the upsert-along-ordering-key branch — the second caller
      // of getTracesIdentifierForSession.
      const score = await caller.scores.updateAnnotationScore({
        id: randomUUID(),
        projectId,
        name: "events-only-session-score",
        value: 2,
        stringValue: null,
        dataType: "NUMERIC",
        scoreTarget: { type: "session", sessionId },
        configId,
        timestamp: new Date(),
        environment: "default",
      });

      expect(score.sessionId).toBe(sessionId);
      expect(score.value).toBe(2);
    });
  },
);
