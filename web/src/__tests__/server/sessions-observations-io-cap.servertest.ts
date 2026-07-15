/**
 * Bounded I/O contract of the session-detail card queries (LFE-10958).
 *
 * Session cards are previews: `sessions.observationsForTraceFromEvents` must
 * never return unbounded payloads. Fields within the inline limit come back
 * whole (cards render exactly as before); larger fields come back as a
 * preview head plus their true length and a truncated flag, with the trace
 * peek / `sessions.observationFullIOFromEvents` as the full-reading surfaces.
 */
import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createEvent, createEventsCh } from "@langfuse/shared/src/server";
import waitForExpect from "wait-for-expect";
import { randomUUID } from "crypto";

// The events_full table is created only by the ClickHouse dev-tables setup,
// which runs in the default deploy-mode where .env.dev.example enables the v4
// preview opt-in. The -azure and -redis-cluster CI runs skip that setup, so
// the events table is absent there. Mirrors sessions-trpc-events-only gating.
const eventsTableAvailable =
  process.env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true";
const maybe = eventsTableAvailable ? describe : describe.skip;

// At least one always-running test so the file does not hang on the redis
// connections opened by the tRPC caller imports when the suite is skipped.
describe("sessions observations io cap liveness", () => {
  it("should not hang redis when the events table is unavailable", () => {});
});

// Keep in sync with the constants in web/src/server/api/routers/sessions.ts.
const INLINE_LIMIT = 300_000;
const PREVIEW_LIMIT = 4_000;
const PER_TRACE_LIMIT = 50;

maybe("sessions observations bounded I/O (events)", () => {
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

  const seedObservations = async (
    events: Array<{
      input?: string;
      output?: string;
      metadataValues?: string[];
      metadataNames?: string[];
    }>,
  ) => {
    const sessionId = randomUUID();
    const traceId = randomUUID();
    const baseTime = Date.now();

    await createEventsCh(
      events.map((event, index) =>
        createEvent({
          span_id: `${traceId}-o${index}`,
          id: `${traceId}-o${index}`,
          trace_id: traceId,
          project_id: projectId,
          parent_span_id: index === 0 ? "" : `${traceId}-o0`,
          type: "GENERATION",
          session_id: sessionId,
          user_id: "user-a",
          start_time: (baseTime + index * 100) * 1000,
          input: event.input ?? "small input",
          output: event.output ?? "small output",
          ...(event.metadataValues
            ? {
                metadata_names:
                  event.metadataNames ??
                  event.metadataValues.map((_, i) => `key-${i}`),
                metadata_values: event.metadataValues,
              }
            : {}),
        }),
      ),
    );

    await waitForExpect(async () => {
      const result = await caller.sessions.observationsForTraceFromEvents({
        projectId,
        sessionId,
        traceId,
        filter: [],
      });
      expect(result.observations.length).toBeGreaterThanOrEqual(
        Math.min(events.length, PER_TRACE_LIMIT),
      );
    });

    return { sessionId, traceId, baseTime };
  };

  it("returns under-cap fields whole and over-cap fields as preview heads with true lengths", async () => {
    const bigInput = "a".repeat(INLINE_LIMIT + 100);
    const { sessionId, traceId } = await seedObservations([
      { input: "hello", output: "world" },
      { input: bigInput, output: "small" },
    ]);

    const { observations, hasMoreObservations } =
      await caller.sessions.observationsForTraceFromEvents({
        projectId,
        sessionId,
        traceId,
        filter: [],
      });

    expect(hasMoreObservations).toBe(false);

    const small = observations.find((o) => o.id === `${traceId}-o0`);
    expect(small?.input).toBe("hello");
    expect(small?.inputTruncated).toBe(false);
    expect(small?.inputLength).toBe(5);
    expect(small?.outputTruncated).toBe(false);

    const large = observations.find((o) => o.id === `${traceId}-o1`);
    expect(large?.inputTruncated).toBe(true);
    expect(large?.inputLength).toBe(INLINE_LIMIT + 100);
    expect(typeof large?.input).toBe("string");
    expect((large?.input as string).length).toBe(PREVIEW_LIMIT);
    expect(large?.outputTruncated).toBe(false);
    expect(large?.output).toBe("small");
  });

  it("caps metadata values and flags metadataTruncated", async () => {
    const bigValue = "m".repeat(INLINE_LIMIT + 50);
    const { sessionId, traceId } = await seedObservations([
      { metadataValues: [bigValue, "tiny"], metadataNames: ["big", "small"] },
    ]);

    const { observations } =
      await caller.sessions.observationsForTraceFromEvents({
        projectId,
        sessionId,
        traceId,
        filter: [],
      });

    const observation = observations[0];
    expect(observation.metadataTruncated).toBe(true);
    const metadata = observation.metadata as Record<string, unknown>;
    expect(String(metadata.big).length).toBe(PREVIEW_LIMIT);
    expect(metadata.small).toBe("tiny");
  });

  it("caps observations per card and reports more exist", async () => {
    const { sessionId, traceId } = await seedObservations(
      Array.from({ length: PER_TRACE_LIMIT + 2 }, () => ({})),
    );

    const { observations, hasMoreObservations } =
      await caller.sessions.observationsForTraceFromEvents({
        projectId,
        sessionId,
        traceId,
        filter: [],
      });

    expect(observations.length).toBe(PER_TRACE_LIMIT);
    expect(hasMoreObservations).toBe(true);
  });

  it("trims to preview heads once the cumulative I/O budget is exhausted (valid-JSON payloads)", async () => {
    // 8 x ~290K VALID-JSON inputs: each under the inline cap, cumulatively
    // over the 2M budget from the 8th observation on (budget checked before
    // adding). Valid JSON is the realistic LLM shape and guards the budget
    // against ever depending on the value's parse state.
    const nearCap = JSON.stringify({
      messages: [{ role: "user", content: "b".repeat(289_000) }],
    });
    const { sessionId, traceId } = await seedObservations(
      Array.from({ length: 8 }, () => ({ input: nearCap, output: "ok" })),
    );

    const { observations } =
      await caller.sessions.observationsForTraceFromEvents({
        projectId,
        sessionId,
        traceId,
        filter: [],
      });

    const first = observations[0];
    expect(first.inputTruncated).toBe(false);
    // I/O on this path is returned as the raw string; the client parses.
    expect(typeof first.input).toBe("string");
    expect((first.input as string).length).toBe(nearCap.length);

    const last = observations[observations.length - 1];
    expect(last.inputTruncated).toBe(true);
    expect((last.input as string).length).toBe(PREVIEW_LIMIT);
    // The true length survives the trim so the UI can show the real size.
    expect(last.inputLength).toBe(nearCap.length);
  });

  it("serves full I/O for one observation via observationFullIOFromEvents, scoped to the session", async () => {
    const bigInput = "c".repeat(INLINE_LIMIT + 100);
    const { sessionId, traceId, baseTime } = await seedObservations([
      { input: bigInput, output: "full output" },
    ]);

    const full = await caller.sessions.observationFullIOFromEvents({
      projectId,
      sessionId,
      traceId,
      observationId: `${traceId}-o0`,
      startTime: new Date(baseTime),
    });

    expect(full.input).toBe(bigInput);
    expect(full.output).toBe("full output");

    // A different session must not grant access to the same observation:
    // the sessionId predicate is part of the authorization.
    await expect(
      caller.sessions.observationFullIOFromEvents({
        projectId,
        sessionId: randomUUID(),
        traceId,
        observationId: `${traceId}-o0`,
        startTime: new Date(baseTime),
      }),
    ).rejects.toThrow("Observation not found in session");
  });
});
