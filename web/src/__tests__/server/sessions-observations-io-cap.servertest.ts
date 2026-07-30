/**
 * Bounded I/O contract of the session-detail card queries (LFE-10958).
 *
 * Session cards are previews: `sessions.observationsForTraceFromEvents` must
 * never return unbounded payloads. Fields within the inline limit come back
 * whole (cards render exactly as before); larger fields come back as a
 * preview head plus their true length and a truncated flag, with the trace
 * peek / `sessions.observationFullIOFromEvents` as the full-reading surfaces.
 *
 * The procedure returns a BARE ARRAY of observations (backward-compatible with
 * clients that call `.find` on the response directly, LFE-10958 regression).
 * "More observations exist" is signalled in-band: up to
 * SESSION_OBSERVATIONS_PER_TRACE_LIMIT + 1 real observations come back, and
 * the extra (+1) row is the client's "has more" sentinel.
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

// The client derives "more exist" from the +1 sentinel: the response is a bare
// array of up to PER_TRACE_LIMIT + 1 real observations, so more than
// PER_TRACE_LIMIT real rows means the trace has more than the card shows.
const hasMore = (observations: { id: string }[], traceId: string) =>
  observations.filter((o) => o.id !== `t-${traceId}`).length > PER_TRACE_LIMIT;

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
      expect(result.length).toBeGreaterThanOrEqual(
        Math.min(events.length, PER_TRACE_LIMIT + 1),
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

    const observations = await caller.sessions.observationsForTraceFromEvents({
      projectId,
      sessionId,
      traceId,
      filter: [],
    });

    expect(hasMore(observations, traceId)).toBe(false);

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

    const observations = await caller.sessions.observationsForTraceFromEvents({
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

  it("caps observations per card and signals more exist via the +1 sentinel", async () => {
    const { sessionId, traceId } = await seedObservations(
      Array.from({ length: PER_TRACE_LIMIT + 2 }, () => ({})),
    );

    const observations = await caller.sessions.observationsForTraceFromEvents({
      projectId,
      sessionId,
      traceId,
      filter: [],
    });

    // The response is bounded to the display limit plus one sentinel row; the
    // sentinel is what tells the client "more observations exist".
    expect(observations.length).toBe(PER_TRACE_LIMIT + 1);
    expect(hasMore(observations, traceId)).toBe(true);
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

    const observations = await caller.sessions.observationsForTraceFromEvents({
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

  it("does not let the synthetic trace row consume a card slot or trip hasMore", async () => {
    // 50 real observations + the synthetic trace-level row (id `t-<traceId>`,
    // the shape handleEventPropagationJob writes): all 50 real observations
    // must come back alongside the synthetic row, and the +1 sentinel must not
    // appear — the synthetic row is trace metadata, not observation number 51.
    const { sessionId, traceId, baseTime } = await seedObservations(
      Array.from({ length: PER_TRACE_LIMIT }, () => ({})),
    );
    await createEventsCh([
      createEvent({
        span_id: `t-${traceId}`,
        id: `t-${traceId}`,
        trace_id: traceId,
        project_id: projectId,
        parent_span_id: "",
        type: "SPAN",
        session_id: sessionId,
        user_id: "user-a",
        start_time: (baseTime - 50) * 1000,
        input: "trace level input",
        output: "trace level output",
      }),
    ]);

    await waitForExpect(async () => {
      const result = await caller.sessions.observationsForTraceFromEvents({
        projectId,
        sessionId,
        traceId,
        filter: [],
      });
      expect(result.length).toBe(PER_TRACE_LIMIT + 1);
    });

    const observations = await caller.sessions.observationsForTraceFromEvents({
      projectId,
      sessionId,
      traceId,
      filter: [],
    });

    expect(observations.some((o) => o.id === `t-${traceId}`)).toBe(true);
    expect(observations.filter((o) => o.id !== `t-${traceId}`).length).toBe(
      PER_TRACE_LIMIT,
    );
    expect(hasMore(observations, traceId)).toBe(false);
  });

  it("collapses un-merged span versions to one observation (newest wins)", async () => {
    const sessionId = randomUUID();
    const traceId = randomUUID();
    const spanId = `${traceId}-o0`;
    const baseTime = Date.now();

    // Create + update pair for ONE span: two ReplacingMergeTree row versions
    // sharing span_id, distinguished by event_ts. Until the background merge
    // runs, both rows are physically present — the card's row counting must
    // see one observation, with the newest version's payload.
    const shared = {
      span_id: spanId,
      id: spanId,
      trace_id: traceId,
      project_id: projectId,
      parent_span_id: "",
      type: "GENERATION",
      session_id: sessionId,
      user_id: "user-a",
      start_time: baseTime * 1000,
    } as const;
    await createEventsCh([
      createEvent({
        ...shared,
        input: "prompt",
        output: "",
        event_ts: baseTime * 1000,
      }),
      createEvent({
        ...shared,
        input: "prompt",
        output: "completed answer",
        event_ts: (baseTime + 5000) * 1000,
      }),
    ]);

    await waitForExpect(async () => {
      const result = await caller.sessions.observationsForTraceFromEvents({
        projectId,
        sessionId,
        traceId,
        filter: [],
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    const observations = await caller.sessions.observationsForTraceFromEvents({
      projectId,
      sessionId,
      traceId,
      filter: [],
    });

    expect(observations.length).toBe(1);
    expect(hasMore(observations, traceId)).toBe(false);
    expect(observations[0].output).toBe("completed answer");
  });

  it("does not flag metadata truncation when a capped value is shadowed by a small winner", async () => {
    // Duplicate metadata key where the client-visible winner (first original
    // occurrence) is small and an oversized duplicate is shadowed: the flag
    // must stay false — the reader can see everything the card shows.
    const bigValue = "m".repeat(INLINE_LIMIT + 50);
    const { sessionId, traceId } = await seedObservations([
      {
        metadataNames: ["k", "k"],
        metadataValues: ["small-winner", bigValue],
      },
    ]);

    const observations = await caller.sessions.observationsForTraceFromEvents({
      projectId,
      sessionId,
      traceId,
      filter: [],
    });

    const observation = observations[0];
    expect((observation.metadata as Record<string, unknown>).k).toBe(
      "small-winner",
    );
    expect(observation.metadataTruncated).toBe(false);
  });

  it("counts metadata toward the cumulative budget and drops it past the ceiling", async () => {
    // Tiny I/O but ~290K of metadata per observation: 8 observations exceed
    // the 2M budget on metadata weight alone; past the ceiling metadata is
    // dropped and flagged instead of shipped.
    const bigMeta = "m".repeat(290_000);
    const { sessionId, traceId } = await seedObservations(
      Array.from({ length: 8 }, () => ({
        input: "in",
        output: "out",
        metadataNames: ["payload"],
        metadataValues: [bigMeta],
      })),
    );

    const observations = await caller.sessions.observationsForTraceFromEvents({
      projectId,
      sessionId,
      traceId,
      filter: [],
    });

    const first = observations[0];
    expect(first.metadataTruncated).toBe(false);
    expect(
      String((first.metadata as Record<string, unknown>).payload).length,
    ).toBe(290_000);

    const last = observations[observations.length - 1];
    expect(last.metadataTruncated).toBe(true);
    expect(last.metadata).toEqual({});
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
