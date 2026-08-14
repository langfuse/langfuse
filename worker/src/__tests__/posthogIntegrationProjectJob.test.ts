import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the PostHog integration project job's events_only legacy
 * guard (LFE-10148) and customer-fault auto-disable path. Mocked in the same
 * style as mixpanelIntegrationProjectJob.test.ts.
 */

// vi.mock factories are hoisted above module scope, so all shared mutable
// state the factories touch must live inside vi.hoisted().
const h = vi.hoisted(() => {
  async function* fakeStream(label: string) {
    yield { langfuse_id: `${label}-1` };
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
    flush = vi.fn(async () => {});
    on = vi.fn();
  },
}));

// Resolves to worker/src/env (read by exportWriteModeGuard and the score
// routing); the helpers mirror the real implementations.
vi.mock("../env", () => ({
  env: {
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy",
    NEXTAUTH_URL: "http://localhost:3000",
  },
  v4WritesToLegacyTables: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "events_only",
  v4WritesToEventsTable: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "legacy",
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

// A bad/malicious PostHog hostname is a deterministic customer-config fault
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
  // the behavior, not the namespace.
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

  it("clears lastError/lastErrorAt on a successful run", async () => {
    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.posthogIntegrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: null, lastErrorAt: null }),
      }),
    );
  });

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

  it("records the disable metric and notifies once when the claim is won", async () => {
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(disableMetrics()).toHaveLength(1);
    expect(disableNotifications()).toBe(1);
  });

  it("stays silent when the disable claim matches no row", async () => {
    h.disableClaim.matchedRows = 0;
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(disableWrites()).toHaveLength(1);
    expect(h.dispatchProjectNotification).not.toHaveBeenCalled();
    expect(disableMetrics()).toHaveLength(0);
  });

  it("completes the disable notification before the handler resolves", async () => {
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.notification.settled).toBe(true);
  });

  it("resolves and keeps the integration disabled when the notification rejects", async () => {
    h.notification.rejects = true;
    h.validateWebhookURL.mockRejectedValueOnce(badHostnameFault());

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(disableWrites()).toHaveLength(1);
    expect(h.notification.settled).toBe(true);
  });

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
