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

  // How many rows the atomic disable claim matches. 0 simulates a lost claim:
  // either a concurrent run already flipped enabled, or the customer corrected
  // the hostname mid-run so the run's `where` predicate no longer matches.
  const disableClaim = { matchedRows: 1 };

  // Observable completion of the terminal notification. `settled` flips only
  // after a macrotask, so a caller that fires the dispatch without awaiting it
  // returns while `settled` is still false — that gap is what distinguishes an
  // awaited dispatch from a fire-and-forget one.
  const notification = { settled: false, rejects: false };

  // Stand-in for the Prisma namespace class. The record-not-found predicate is
  // instanceof-based, so a duck-typed `{ code: "P2025" }` would not satisfy it
  // — tests must throw a real instance of this class.
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, { code }: { code: string }) {
      super(message);
      this.name = "PrismaClientKnownRequestError";
      this.code = code;
    }
  }

  // Lets a test fail the lastError/lastErrorAt persist write without disturbing
  // the tests that need it to resolve.
  const persist = { failWith: undefined as unknown };

  const posthogIntegrationUpdate = vi.fn(async () => {
    if (persist.failWith !== undefined) throw persist.failWith;
  });
  // The atomic disable (enabled true->false) uses updateMany. Only the disable
  // write is claim-controlled; any other updateMany keeps matching.
  const posthogIntegrationUpdateMany = vi.fn(
    async (args?: { data?: Record<string, unknown> }) => ({
      count: args?.data?.enabled === false ? disableClaim.matchedRows : 1,
    }),
  );
  // Hostname preflight (throws OutboundUrlValidationError on a bad
  // hostname) and the customer notification, both controllable per test.
  const validateWebhookURL = vi.fn(async () => {});
  const recordIncrement = vi.fn();
  const dispatchProjectNotification = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      if (notification.rejects) throw new Error("notification dispatch failed");
    } finally {
      notification.settled = true;
    }
  });
  const getTraces = vi.fn(() => fakeStream("traces"));
  const getGenerations = vi.fn(() => fakeStream("generations"));
  const getScores = vi.fn(() => fakeStream("scores"));
  const getEvents = vi.fn(() => fakeStream("events"));

  // Minimal stand-in for the shared class. The classifier duck-types on
  // `.name === "OutboundUrlValidationError"` + `.code` (it does not use
  // instanceof), so this shape is sufficient for the mocked server barrel.
  class OutboundUrlValidationError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "OutboundUrlValidationError";
      this.code = code;
    }
  }

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
    posthogIntegrationUpdateMany,
    PrismaClientKnownRequestError,
    persist,
    disableClaim,
    notification,
    validateWebhookURL,
    recordIncrement,
    dispatchProjectNotification,
    OutboundUrlValidationError,
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
      updateMany: h.posthogIntegrationUpdateMany,
    },
  },
  // The record-not-found predicate lives in its own module but imports Prisma
  // from this specifier, so this factory intercepts it too. Without this
  // export the predicate throws a TypeError instead of returning a boolean.
  Prisma: {
    PrismaClientKnownRequestError: h.PrismaClientKnownRequestError,
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  QueueName: { PostHogIntegrationProcessingQueue: "posthog" },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  recordIncrement: h.recordIncrement,
  getCurrentSpan: vi.fn(() => undefined),
  validateWebhookURL: h.validateWebhookURL,
  dispatchProjectNotification: h.dispatchProjectNotification,
  OutboundUrlValidationError: h.OutboundUrlValidationError,
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
  h.persist.failWith = undefined;
  // mockClear, not mockReset: the implementations above are claim/notification
  // aware and must survive between tests; only the recorded calls reset.
  h.posthogIntegrationUpdateMany.mockClear();
  h.disableClaim.matchedRows = 1;
  h.notification.settled = false;
  h.notification.rejects = false;
  h.recordIncrement.mockClear();
  h.validateWebhookURL.mockReset();
  h.validateWebhookURL.mockImplementation(async () => {});
  h.dispatchProjectNotification.mockClear();
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
    expect(h.timeline).toEqual([
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
    h.state.rowCounts.events = 1_001;
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

// A deterministic customer-config fault (bad/malicious hostname
// rejected by validateWebhookURL) must be classified as the customer's problem
// — the job RESOLVES (not thrown, so the type:failed counter never increments
// and the Failures monitor stays quiet), the integration is auto-disabled,
// lastError/lastErrorAt are persisted, and the customer is notified once with
// disabled=true. Transient/infra faults still throw, retry, and trip the
// monitor unchanged.
describe("handlePostHogIntegrationProjectJob customer-fault auto-disable", () => {
  beforeEach(() => {
    resetSharedState();
    // A known-good source + write-mode combo so the pre-export write-mode
    // guards pass and the handler reaches the hostname preflight.
    h.db.integration = {
      ...h.defaultIntegration(),
      exportSource: "TRACES_OBSERVATIONS",
    };
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";
  });

  // Every `data` payload written across update + updateMany, so assertions
  // don't over-constrain which Prisma method carries which column.
  const writeData = (): Array<Record<string, unknown>> =>
    [
      ...h.posthogIntegrationUpdate.mock.calls,
      ...h.posthogIntegrationUpdateMany.mock.calls,
    ].map(
      (call) =>
        (call[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {},
    );

  const disableNotifications = (): number =>
    h.dispatchProjectNotification.mock.calls.filter((call) => {
      const arg = call[0] as { event?: { disabled?: unknown } } | undefined;
      return arg?.event?.disabled === true;
    }).length;

  // The atomic disable writes: updateMany calls carrying `enabled: false`.
  const disableWrites = (): Array<{
    where?: Record<string, unknown>;
    data?: Record<string, unknown>;
  }> =>
    h.posthogIntegrationUpdateMany.mock.calls
      .map((call) => call[0] as { where?: any; data?: any } | undefined)
      .filter((arg): arg is { where?: any; data?: any } => Boolean(arg))
      .filter((arg) => arg.data?.enabled === false);

  // Counter emitted when an integration is auto-disabled. Matched on the
  // metric-name fragment rather than the full string so the assertion tracks
  // the behavior, not the namespace. The winning-claim test below asserts this
  // filter yields exactly one call, which keeps the "not recorded" assertions
  // from passing vacuously if the metric were ever renamed away.
  const disableMetrics = (): unknown[][] =>
    h.recordIncrement.mock.calls.filter(
      ([name]) =>
        typeof name === "string" && name.includes("integration_disabled"),
    );

  const badHostnameFault = () =>
    new h.OutboundUrlValidationError(
      "blocked-hostname",
      "Blocked hostname detected",
    );

  // Load-bearing: the core journey. A blocked-hostname fault must resolve (no
  // throw) AND flip enabled to false AND persist the error AND notify once.
  it("resolves and auto-disables on a blocked-hostname validation fault", async () => {
    h.validateWebhookURL.mockRejectedValueOnce(
      new h.OutboundUrlValidationError(
        "blocked-hostname",
        "Blocked hostname detected",
      ),
    );

    // Must not throw — a throw would increment type:failed and fire the monitor.
    await handlePostHogIntegrationProjectJob(makeJob());

    expect(writeData().some((data) => data.enabled === false)).toBe(true);
    expect(
      writeData().some(
        (data) =>
          typeof data.lastError === "string" &&
          (data.lastError as string).length > 0,
      ),
    ).toBe(true);
    expect(writeData().some((data) => data.lastErrorAt instanceof Date)).toBe(
      true,
    );
    expect(disableNotifications()).toBe(1);
  });

  // Load-bearing: the throw site rewraps into `new Error(msg, { cause })`, so
  // the handler must classify off the cause chain — a wrapped validation error
  // still disables.
  it("classifies through a wrapped cause chain and still disables", async () => {
    h.validateWebhookURL.mockRejectedValueOnce(
      new Error("posthog export failed", {
        cause: new h.OutboundUrlValidationError(
          "blocked-hostname",
          "Blocked hostname detected",
        ),
      }),
    );

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(writeData().some((data) => data.enabled === false)).toBe(true);
    expect(disableNotifications()).toBe(1);
  });

  // A disallowed protocol or port is as deterministic as a blocked hostname —
  // no retry can fix `ftp://` or `:8080`. These reach the handler as coded
  // errors only because validateWebhookURL raises OutboundUrlValidationError
  // for them; while it threw a bare Error, they were unclassifiable and
  // retried forever. Real coded-vs-uncoded coverage lives in
  // webhook-validation.test.ts, since this suite mocks the validator.
  it.each([
    ["protocol-not-allowed", "Only HTTP and HTTPS protocols are allowed"],
    ["port-not-allowed", "Only ports 80 and 443 are allowed"],
  ] as const)("resolves and auto-disables on %s", async (code, message) => {
    h.validateWebhookURL.mockRejectedValueOnce(
      new h.OutboundUrlValidationError(code, message),
    );

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(writeData().some((data) => data.enabled === false)).toBe(true);
    expect(disableNotifications()).toBe(1);
  });

  // Load-bearing negative controls: transient/infra faults are NOT customer
  // faults — the handler must rethrow (so BullMQ retries and the monitor
  // fires), leave enabled unchanged, and never notify.
  it.each([
    [
      "a dns-lookup-failed validation fault",
      () =>
        new h.OutboundUrlValidationError(
          "dns-lookup-failed",
          "DNS lookup failed for host.example",
        ),
    ],
    [
      "a generic ClickHouse-style error",
      () => new Error("ClickHouse read failed"),
    ],
  ] as const)(
    "rethrows on %s, leaves enabled unchanged, and does not notify",
    async (_label, makeError) => {
      h.validateWebhookURL.mockRejectedValueOnce(makeError());

      await expect(
        handlePostHogIntegrationProjectJob(makeJob()),
      ).rejects.toThrow();

      expect(writeData().some((data) => data.enabled === false)).toBe(false);
      expect(h.dispatchProjectNotification).not.toHaveBeenCalled();
    },
  );

  // Cheap addition (Semantics table success row): a healthy run clears any
  // prior error state so a fixed + re-enabled integration reads as healthy.
  it("clears lastError/lastErrorAt on a successful run", async () => {
    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.posthogIntegrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: null, lastErrorAt: null }),
      }),
    );
  });

  // Load-bearing: the disable predicate must pin the hostname this run actually
  // validated. Without it, a run carrying stale config would disable a hostname
  // the customer already corrected mid-run. Asserted on the real argument, so a
  // predicate that silently drops the host guard goes red.
  it("scopes the atomic disable to the hostname this run validated", async () => {
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(disableWrites()).toHaveLength(1);
    expect(disableWrites()[0].where).toEqual({
      projectId: "project-1",
      enabled: true,
      posthogHostName: "https://us.posthog.com",
    });
  });

  // Positive control for the two "not recorded / not notified" assertions
  // below: proves the disable-metric filter and the notification counter both
  // observe something real on the winning path.
  it("records the disable metric and notifies once when the claim is won", async () => {
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(disableMetrics()).toHaveLength(1);
    expect(disableNotifications()).toBe(1);
  });

  // Load-bearing: the notify-once guarantee under a lost claim. count === 0
  // means either a concurrent run already flipped enabled or the customer
  // corrected the hostname mid-run; in both cases this run must stay silent
  // rather than claim a state it did not write.
  it("stays silent when the disable claim matches no row", async () => {
    h.disableClaim.matchedRows = 0;
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());

    // Still a deliberate resolve: a lost claim is not a job failure.
    await handlePostHogIntegrationProjectJob(makeJob());

    expect(disableWrites()).toHaveLength(1);
    expect(h.dispatchProjectNotification).not.toHaveBeenCalled();
    expect(disableMetrics()).toHaveLength(0);
  });

  // Load-bearing: fail-fast resolves the job and the scheduler only enqueues
  // enabled integrations, so a dispatch left in flight has no retry path and
  // would leave the customer silently disabled. The notification mock settles
  // one macrotask late, so this flag is still false if the dispatch is fired
  // without being awaited.
  it("completes the disable notification before the handler resolves", async () => {
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.notification.settled).toBe(true);
  });

  // Load-bearing: awaiting the dispatch must not turn the deliberate resolve
  // into a job failure — the notify helper swallows its own errors, and the
  // disable stands regardless of whether the customer could be reached.
  it("resolves and keeps the integration disabled when the notification rejects", async () => {
    h.notification.rejects = true;
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(disableWrites()).toHaveLength(1);
    expect(h.notification.settled).toBe(true);
  });

  // Load-bearing: the integration can be deleted while the run is in flight, so
  // the persist races the delete and throws P2025. There is nothing to persist
  // and nobody to notify — the job is obsolete, so it must resolve quietly
  // rather than disable a row that no longer exists or fail the job.
  it("drops the obsolete job when the integration is deleted mid-run", async () => {
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());
    h.persist.failWith = new h.PrismaClientKnownRequestError(
      "An operation failed because it depends on one or more records that were required but not found.",
      { code: "P2025" },
    );

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.posthogIntegrationUpdate).toHaveBeenCalledTimes(1);
    expect(disableWrites()).toHaveLength(0);
    expect(disableMetrics()).toHaveLength(0);
    expect(h.dispatchProjectNotification).not.toHaveBeenCalled();
  });

  // Load-bearing contrast to the case above: any other persist failure means we
  // do NOT know the fault was recorded, so the run must not claim it as handled
  // — rethrow and let BullMQ retry and reclassify. Without this, a swallowed DB
  // outage would silently drop the customer fault.
  it("rethrows when persisting the error fails for any other reason", async () => {
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());
    h.persist.failWith = new Error("database unavailable");

    await expect(
      handlePostHogIntegrationProjectJob(makeJob()),
    ).rejects.toThrow();

    expect(disableWrites()).toHaveLength(0);
    expect(disableMetrics()).toHaveLength(0);
    expect(h.dispatchProjectNotification).not.toHaveBeenCalled();
  });
});
