import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the PostHog integration project job:
 *
 * 1. The events_only legacy guard (LFE-10148): a persisted legacy export
 *    source on an events_only deployment reads the v3 traces/observations
 *    tables, which are no longer written — the job must fail loudly before
 *    exporting empty data and advancing lastSyncAt.
 *
 * 2. Export throttling (issue #12786): the original implementation built one
 *    PostHog client per stream and ran all streams concurrently via
 *    Promise.all, producing an unbounded export burst that overwhelmed the
 *    target. This mirrors the Mixpanel fix (PR #13958):
 *      a. a single reused client per job,
 *      b. sequential stream execution (max concurrency 1), and
 *      c. a configurable inter-flush delay (LANGFUSE_POSTHOG_FLUSH_DELAY_MS).
 *    Unlike the custom MixpanelClient, posthog-node keeps a background flush
 *    timer, so the job must also shutdown() the client exactly once — even
 *    when a stream fails — to avoid leaking timers in the worker process.
 *
 * Mocked in the same style as mixpanelIntegrationProjectJob.test.ts.
 */

// vi.mock factories are hoisted above module scope, so all shared mutable
// state the factories touch must live inside vi.hoisted().
const h = vi.hoisted(() => {
  const timeline: string[] = [];
  const constructed: { shutdown: unknown }[] = [];
  const state = { activeStreams: 0, maxConcurrentStreams: 0 };

  // A fake async stream that records start/end on the shared timeline and
  // tracks concurrency with a yield point in between, so concurrent
  // (Promise.all) execution would interleave and trip the max-concurrency
  // assertion.
  function fakeStream(label: string) {
    return (async function* () {
      state.activeStreams++;
      state.maxConcurrentStreams = Math.max(
        state.maxConcurrentStreams,
        state.activeStreams,
      );
      timeline.push(`${label}:start`);
      await Promise.resolve();
      yield { langfuse_id: `${label}-1` };
      await Promise.resolve();
      yield { langfuse_id: `${label}-2` };
      timeline.push(`${label}:end`);
      state.activeStreams--;
    })();
  }

  const posthogIntegrationUpdate = vi.fn();
  const getTraces = vi.fn(() => fakeStream("traces"));
  const getGenerations = vi.fn(() => fakeStream("generations"));
  const getScores = vi.fn(() => fakeStream("scores"));
  const getEvents = vi.fn(() => fakeStream("events"));

  const defaultIntegration = () => ({
    projectId: "project-1",
    enabled: true,
    exportSource: "TRACES_OBSERVATIONS",
    posthogHostName: "https://us.posthog.com",
    encryptedPosthogApiKey: "enc",
    lastSyncAt: new Date("2024-01-01"),
    project: { name: "Test Project", createdAt: new Date("2023-01-01") },
  });

  // Mutable row returned by the prisma findFirst mock so individual tests can
  // vary exportSource.
  const db = { integration: defaultIntegration() as Record<string, unknown> };

  return {
    timeline,
    constructed,
    state,
    posthogIntegrationUpdate,
    getTraces,
    getGenerations,
    getScores,
    getEvents,
    defaultIntegration,
    db,
  };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    posthogIntegration: {
      findFirst: vi.fn(async () => h.db.integration),
      update: h.posthogIntegrationUpdate,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  QueueName: { PostHogIntegrationProcessingQueue: "posthog" },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  recordIncrement: vi.fn(),
  getCurrentSpan: vi.fn(() => undefined),
  validateWebhookURL: vi.fn(async () => {}),
  getTracesForAnalyticsIntegrations: h.getTraces,
  getGenerationsForAnalyticsIntegrations: h.getGenerations,
  getScoresForAnalyticsIntegrations: h.getScores,
  getEventsForAnalyticsIntegrations: h.getEvents,
}));

vi.mock("../features/posthog/transformers", () => ({
  transformTraceForPostHog: vi.fn((e) => e),
  transformGenerationForPostHog: vi.fn((e) => e),
  transformScoreForPostHog: vi.fn((e) => e),
  transformEventForPostHog: vi.fn((e) => e),
}));

vi.mock("@langfuse/shared/encryption", () => ({
  decrypt: vi.fn(() => "phc_decrypted"),
}));

vi.mock("posthog-node", () => ({
  PostHog: class {
    capture = vi.fn();
    flush = vi.fn(async () => {
      h.timeline.push("flush");
    });
    on = vi.fn();
    shutdown = vi.fn(async () => {});
    constructor() {
      h.constructed.push(this as unknown as { shutdown: unknown });
    }
  },
}));

// Path is relative to this test file -> resolves to worker/src/env (the
// module the exportWriteModeGuard reads its write mode from). Keep the
// throttle delay at 0 to keep the unit tests fast (real default is 100ms).
vi.mock("../env", () => ({
  env: {
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy",
    LANGFUSE_POSTHOG_FLUSH_DELAY_MS: 0,
  },
}));

// Import after mocks are registered.
import { handlePostHogIntegrationProjectJob } from "../features/posthog/handlePostHogIntegrationProjectJob";
import { env } from "../env";

function makeJob() {
  return {
    data: { id: "job-1", payload: { projectId: "project-1" } },
    attemptsMade: 0,
  } as unknown as Parameters<typeof handlePostHogIntegrationProjectJob>[0];
}

function resetSharedState() {
  h.timeline.length = 0;
  h.constructed.length = 0;
  h.state.activeStreams = 0;
  h.state.maxConcurrentStreams = 0;
  h.posthogIntegrationUpdate.mockClear();
  h.getTraces.mockClear();
  h.getGenerations.mockClear();
  h.getScores.mockClear();
  h.getEvents.mockClear();
  h.db.integration = h.defaultIntegration();
  (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
}

describe("handlePostHogIntegrationProjectJob events_only legacy guard (LFE-10148)", () => {
  beforeEach(resetSharedState);

  it("throws before export and does not advance lastSyncAt on events_only + legacy source", async () => {
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    h.db.integration = {
      ...h.defaultIntegration(),
      exportSource: "TRACES_OBSERVATIONS",
    };

    await expect(handlePostHogIntegrationProjectJob(makeJob())).rejects.toThrow(
      /events_only/,
    );

    // No stream was started (guard fires before the scores export too) and
    // sync state did not advance.
    expect(h.getScores).not.toHaveBeenCalled();
    expect(h.getTraces).not.toHaveBeenCalled();
    expect(h.getGenerations).not.toHaveBeenCalled();
    expect(h.getEvents).not.toHaveBeenCalled();
    expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
  });

  it("exports an EVENTS source normally on events_only", async () => {
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    h.db.integration = {
      ...h.defaultIntegration(),
      exportSource: "EVENTS",
    };

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.getEvents).toHaveBeenCalledTimes(1);
    expect(h.getTraces).not.toHaveBeenCalled();
    expect(h.posthogIntegrationUpdate).toHaveBeenCalledTimes(1);
  });

  it("exports a legacy source normally on dual write mode", async () => {
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.getTraces).toHaveBeenCalledTimes(1);
    expect(h.posthogIntegrationUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("handlePostHogIntegrationProjectJob throttling (issue #12786)", () => {
  beforeEach(() => {
    resetSharedState();
    h.db.integration = {
      ...h.defaultIntegration(),
      exportSource: "TRACES_OBSERVATIONS_EVENTS",
    };
  });

  it("reuses a single PostHog client for the whole job", async () => {
    await handlePostHogIntegrationProjectJob(makeJob());
    expect(h.constructed.length).toBe(1);
  });

  it("runs export streams sequentially (no concurrent streams)", async () => {
    await handlePostHogIntegrationProjectJob(makeJob());
    // Each stream must fully finish before the next starts.
    expect(h.state.maxConcurrentStreams).toBe(1);
    // Timeline never has two starts without an intervening end.
    let open = 0;
    for (const entry of h.timeline) {
      if (entry.endsWith(":start")) open++;
      if (entry.endsWith(":end")) open--;
      expect(open).toBeLessThanOrEqual(1);
    }
  });

  it("shuts the client down exactly once on success", async () => {
    await handlePostHogIntegrationProjectJob(makeJob());
    expect(h.constructed.length).toBe(1);
    expect(h.constructed[0].shutdown).toHaveBeenCalledTimes(1);
  });

  it("shuts the client down when a stream fails", async () => {
    h.getScores.mockImplementationOnce(() =>
      (async function* (): AsyncGenerator<{ langfuse_id: string }> {
        yield { langfuse_id: "scores-1" };
        throw new Error("stream failed");
      })(),
    );

    await expect(handlePostHogIntegrationProjectJob(makeJob())).rejects.toThrow(
      "stream failed",
    );

    expect(h.constructed.length).toBe(1);
    expect(h.constructed[0].shutdown).toHaveBeenCalledTimes(1);
    // A failed run must not advance lastSyncAt.
    expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
  });
});
