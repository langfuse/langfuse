import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the PostHog integration project job:
 *
 * 1. The write-mode guards prevent a stale export source from advancing its
 *    cursor after reading from tables that the deployment no longer writes.
 *
 * 2. Export delivery controls (issue #12786) reuse one PostHog client,
 *    process streams sequentially, flush before the producer can outrun the
 *    SDK queue, and shut the client down on every exit path.
 */

// vi.mock factories are hoisted above module scope, so all shared mutable
// state the factories touch must live inside vi.hoisted().
const h = vi.hoisted(() => {
  type StreamKind = "scores" | "traces" | "generations" | "events";

  const timeline: string[] = [];
  const constructed: Array<{
    capture: ReturnType<typeof vi.fn>;
    flush: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
    options: Record<string, unknown>;
  }> = [];
  const state = {
    afterFlush: undefined as (() => void) | undefined,
    emitErrorAfterNonEmptyFlush: false,
    emittedError: false,
    emitErrorOnShutdown: false,
    shutdownError: undefined as Error | undefined,
    rowCounts: {
      scores: 2,
      traces: 2,
      generations: 2,
      events: 2,
    } satisfies Record<StreamKind, number>,
  };

  function fakeStream(label: StreamKind) {
    return (async function* () {
      timeline.push(`${label}:start`);
      try {
        for (let index = 0; index < state.rowCounts[label]; index++) {
          await Promise.resolve();
          yield { langfuse_id: `${label}-${index + 1}` };
        }
      } finally {
        timeline.push(`${label}:end`);
      }
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
    private errorHandler?: (error: Error) => void;
    flush = vi.fn(async () => {
      h.timeline.push("flush");
      h.state.afterFlush?.();
      if (
        h.state.emitErrorAfterNonEmptyFlush &&
        !h.state.emittedError &&
        this.capture.mock.calls.length > 0
      ) {
        h.state.emittedError = true;
        this.errorHandler?.(new Error("send failed"));
      }
    });
    shutdown = vi.fn(async () => {
      if (h.state.emitErrorOnShutdown) {
        this.errorHandler?.(new Error("shutdown delivery failed"));
      }
      if (h.state.shutdownError) throw h.state.shutdownError;
    });
    on = vi.fn((event: string, handler: (error: Error) => void) => {
      if (event === "error") this.errorHandler = handler;
    });
    constructor(_apiKey: string, options: Record<string, unknown> = {}) {
      h.constructed.push({
        capture: this.capture,
        flush: this.flush,
        shutdown: this.shutdown,
        options,
      });
    }
  },
}));

// Resolves to worker/src/env (read by exportWriteModeGuard and the score
// routing); the helpers mirror the real implementations.
vi.mock("../env", () => ({
  env: {
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy",
    LANGFUSE_POSTHOG_FLUSH_DELAY_MS: 0,
  },
  v4WritesToLegacyTables: (workerEnv: {
    LANGFUSE_MIGRATION_V4_WRITE_MODE: string;
  }) => workerEnv.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "events_only",
  v4WritesToEventsTable: (workerEnv: {
    LANGFUSE_MIGRATION_V4_WRITE_MODE: string;
  }) => workerEnv.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "legacy",
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
  h.state.afterFlush = undefined;
  h.state.emitErrorAfterNonEmptyFlush = false;
  h.state.emittedError = false;
  h.state.emitErrorOnShutdown = false;
  h.state.shutdownError = undefined;
  h.state.rowCounts.scores = 2;
  h.state.rowCounts.traces = 2;
  h.state.rowCounts.generations = 2;
  h.state.rowCounts.events = 2;
  h.posthogIntegrationUpdate.mockClear();
  h.getTraces.mockClear();
  h.getGenerations.mockClear();
  h.getScores.mockClear();
  h.getEvents.mockClear();
  h.db.integration = h.defaultIntegration();
  (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
  (env as any).LANGFUSE_POSTHOG_FLUSH_DELAY_MS = 0;
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

  it("exports an EVENTS source normally on events_only, routing score enrichment to events", async () => {
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    h.db.integration = {
      ...h.defaultIntegration(),
      exportSource: "EVENTS",
    };

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.getEvents).toHaveBeenCalledTimes(1);
    expect(h.getTraces).not.toHaveBeenCalled();
    expect(h.posthogIntegrationUpdate).toHaveBeenCalledTimes(1);
    expect(h.getScores).toHaveBeenCalledWith(
      "project-1",
      "Test Project",
      expect.any(Date),
      expect.any(Date),
      expect.objectContaining({ traceAttributesSource: "events" }),
    );
  });

  it("exports a legacy source normally on dual write mode, enriching scores from traces", async () => {
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.getTraces).toHaveBeenCalledTimes(1);
    expect(h.posthogIntegrationUpdate).toHaveBeenCalledTimes(1);
    expect(h.getScores).toHaveBeenCalledWith(
      "project-1",
      "Test Project",
      expect.any(Date),
      expect.any(Date),
      expect.objectContaining({ traceAttributesSource: "traces" }),
    );
  });
});

// LFE-11009: enriched sources on legacy write mode must fail loudly instead
// of silently exporting empty data while lastSyncAt advances.
describe("handlePostHogIntegrationProjectJob legacy-mode enriched guard (LFE-11009)", () => {
  beforeEach(resetSharedState);

  it.each(["EVENTS", "TRACES_OBSERVATIONS_EVENTS"])(
    "throws before export and does not advance lastSyncAt on legacy + %s source",
    async (exportSource) => {
      h.db.integration = { ...h.defaultIntegration(), exportSource };

      await expect(
        handlePostHogIntegrationProjectJob(makeJob()),
      ).rejects.toThrow(/does not write them/);

      expect(h.getScores).not.toHaveBeenCalled();
      expect(h.getEvents).not.toHaveBeenCalled();
      expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
    },
  );

  it("exports an EVENTS source normally on dual write mode", async () => {
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
    h.db.integration = { ...h.defaultIntegration(), exportSource: "EVENTS" };

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.getEvents).toHaveBeenCalledTimes(1);
    expect(h.posthogIntegrationUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("handlePostHogIntegrationProjectJob delivery controls (issue #12786)", () => {
  beforeEach(() => {
    resetSharedState();
    h.db.integration = {
      ...h.defaultIntegration(),
      exportSource: "TRACES_OBSERVATIONS_EVENTS",
    };
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
  });

  it("uses one client, runs streams sequentially, and shuts down", async () => {
    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.constructed).toHaveLength(1);
    expect(h.constructed[0].options).toMatchObject({
      flushAt: 1_000,
      maxQueueSize: 10_000,
    });
    expect(
      h.timeline.filter(
        (entry) => entry.endsWith(":start") || entry.endsWith(":end"),
      ),
    ).toEqual([
      "scores:start",
      "scores:end",
      "traces:start",
      "traces:end",
      "generations:start",
      "generations:end",
      "events:start",
      "events:end",
    ]);
    expect(h.constructed[0].shutdown).toHaveBeenCalledTimes(1);
  });

  it("flushes before producing beyond the SDK flush threshold", async () => {
    h.db.integration = {
      ...h.defaultIntegration(),
      exportSource: "TRACES_OBSERVATIONS",
    };
    h.state.rowCounts.scores = 1_001;
    h.state.rowCounts.traces = 0;
    h.state.rowCounts.generations = 0;

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.constructed).toHaveLength(1);
    const { capture, flush } = h.constructed[0];
    expect(capture).toHaveBeenCalledTimes(1_001);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(capture.mock.invocationCallOrder[999]).toBeLessThan(
      flush.mock.invocationCallOrder[0],
    );
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(
      capture.mock.invocationCallOrder[1_000],
    );
  });

  it("waits for the configured delay after a non-empty flush", async () => {
    vi.useFakeTimers();
    try {
      (env as any).LANGFUSE_POSTHOG_FLUSH_DELAY_MS = 25;
      h.state.rowCounts.scores = 1;
      h.state.rowCounts.traces = 0;
      h.state.rowCounts.generations = 0;
      h.state.rowCounts.events = 0;

      let resolveFlush!: () => void;
      const flushStarted = new Promise<void>((resolve) => {
        resolveFlush = resolve;
      });
      h.state.afterFlush = resolveFlush;
      const run = handlePostHogIntegrationProjectJob(makeJob());
      await flushStarted;
      await vi.advanceTimersByTimeAsync(0);

      expect(vi.getTimerCount()).toBe(1);
      expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(24);
      expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await run;
      expect(h.posthogIntegrationUpdate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops the stream immediately when a flush reports an error", async () => {
    h.db.integration = {
      ...h.defaultIntegration(),
      exportSource: "EVENTS",
    };
    h.state.rowCounts.scores = 0;
    h.state.rowCounts.events = 10_001;
    h.state.emitErrorAfterNonEmptyFlush = true;

    await expect(handlePostHogIntegrationProjectJob(makeJob())).rejects.toThrow(
      "send failed",
    );

    const captureCount = h.constructed.reduce(
      (count, client) => count + client.capture.mock.calls.length,
      0,
    );
    expect(captureCount).toBe(1_000);
    expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
  });

  it("preserves the stream error and cursor when shutdown also fails", async () => {
    h.state.shutdownError = new Error("shutdown failed");
    h.getScores.mockImplementationOnce(() =>
      (async function* (): AsyncGenerator<{ langfuse_id: string }> {
        yield { langfuse_id: "scores-1" };
        throw new Error("stream failed");
      })(),
    );

    await expect(handlePostHogIntegrationProjectJob(makeJob())).rejects.toThrow(
      "stream failed",
    );

    expect(h.constructed).toHaveLength(1);
    expect(h.constructed[0].shutdown).toHaveBeenCalledTimes(1);
    expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
  });

  it("does not advance the cursor when shutdown reports a delivery error", async () => {
    h.state.emitErrorOnShutdown = true;

    await expect(handlePostHogIntegrationProjectJob(makeJob())).rejects.toThrow(
      "shutdown delivery failed",
    );

    expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
  });
});
