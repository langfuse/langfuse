/**
 * Connect-time SSRF pinning for the PostHog and Mixpanel analytics exporters.
 *
 * Both sender tests neutralise the string pre-check (that models "the host
 * validated as public") and point the send at a `localhost` NAME, whose
 * connect-time lookup re-resolves to 127.0.0.1 (that models "it rebinds at
 * connect"). Pointing them at a statically-blocked host instead would pass even
 * without connect-time pinning, which is why they are shaped this way.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUnrecoverableError } from "../errors/UnrecoverableError";
import { findOutboundUrlValidationError } from "../errors/findOutboundUrlValidationError";

// The senders read their allowlist from the environment, and vitest loads
// ../.env. A developer who allowlists localhost for local webhook testing would
// otherwise turn the block assertions below into mystery failures.
vi.hoisted(() => {
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_HOST;
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_IPS;
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_IP_SEGMENTS;
});

const openServers: Server[] = [];

async function startLoopbackServer(
  onRequest: () => void,
): Promise<{ nameUrl: string; port: number }> {
  const server = createServer((_req, res) => {
    onRequest();
    res.end("{}");
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { nameUrl: `http://localhost:${port}`, port };
}

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
  vi.restoreAllMocks();
});

const h = vi.hoisted(() => {
  const posthogIntegrationUpdate = vi.fn();
  // The atomic disable claim (enabled true->false) the PostHog handler makes
  // once it classifies the fault as the customer's.
  const posthogIntegrationUpdateMany = vi.fn(async () => ({ count: 1 }));
  const recordIncrement = vi.fn();
  const dispatchProjectNotification = vi.fn(async () => {});
  // Only scores yields, so the first flush attempts the blocked send and the
  // handler stops — bounding runtime.
  const oneRow = () =>
    (async function* () {
      yield { langfuse_id: "row-1" };
    })();
  const noRows = () => (async function* () {})();
  const integration = () => ({
    projectId: "project-1",
    enabled: true,
    exportSource: "TRACES_OBSERVATIONS",
    posthogHostName: "http://placeholder.invalid",
    encryptedPosthogApiKey: "enc",
    lastSyncAt: new Date("2024-01-01"),
    project: { name: "Test Project", createdAt: new Date("2023-01-01") },
  });
  const db = { integration: integration() as Record<string, unknown> };
  return {
    posthogIntegrationUpdate,
    posthogIntegrationUpdateMany,
    recordIncrement,
    dispatchProjectNotification,
    oneRow,
    noRows,
    integration,
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
}));

// Keep the REAL secure-outbound egress helpers; override only the data-stream
// sources, the logger, and validateWebhookURL.
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    getCurrentSpan: vi.fn(() => undefined),
    recordIncrement: h.recordIncrement,
    dispatchProjectNotification: h.dispatchProjectNotification,
    validateWebhookURL: vi.fn(async () => {}),
    getTracesForAnalyticsIntegrations: vi.fn(() => h.noRows()),
    getGenerationsForAnalyticsIntegrations: vi.fn(() => h.noRows()),
    getScoresForAnalyticsIntegrations: vi.fn(() => h.oneRow()),
    getEventsForAnalyticsIntegrations: vi.fn(() => h.noRows()),
  };
});

// Transformers must return a payload the real posthog-node capture() accepts.
vi.mock("../features/posthog/transformers", () => {
  const payload = () => ({
    distinctId: "p",
    event: "langfuse",
    properties: {},
  });
  return {
    transformTraceForPostHog: vi.fn(payload),
    transformGenerationForPostHog: vi.fn(payload),
    transformScoreForPostHog: vi.fn(payload),
    transformEventForPostHog: vi.fn(payload),
  };
});

vi.mock("@langfuse/shared/encryption", () => ({
  decrypt: vi.fn(() => "phc_decrypted"),
}));

vi.mock("../env", () => ({
  env: {
    LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy",
    LANGFUSE_POSTHOG_FLUSH_DELAY_MS: 0,
    LANGFUSE_MIXPANEL_FLUSH_DELAY_MS: 0,
    // Keep this non-zero so connect-time validation wins the race with the
    // abort while still bounding the test when the protected request stalls.
    LANGFUSE_MIXPANEL_TIMEOUT_MS: 1_000,
  },
  v4WritesToLegacyTables: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "events_only",
  v4WritesToEventsTable: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "legacy",
}));

vi.mock("posthog-node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("posthog-node")>();
  return {
    ...actual,
    PostHog: class extends actual.PostHog {
      constructor(
        apiKey: string,
        options: ConstructorParameters<typeof actual.PostHog>[1],
      ) {
        super(apiKey, {
          ...options,
          requestTimeout: 1_000,
          fetchRetryCount: 0,
        });
      }
    },
  };
});

// Imported after mocks are registered.
import {
  handlePostHogIntegrationProjectJob,
  POSTHOG_INTEGRATION_DISABLED_METRIC,
} from "../features/posthog/handlePostHogIntegrationProjectJob";
import {
  CircularRedirectError,
  fetchWithSecureRedirects,
  MaxRedirectsExceededError,
  OutboundUrlValidationError,
  RedirectValidationError,
  validateWebhookURL,
} from "@langfuse/shared/src/server";
import { rethrowIfOutboundValidationFailure } from "../features/analyticsIntegrationEgress";
import { MixpanelClient } from "../features/mixpanel/mixpanelClient";
import type { MixpanelEvent } from "../features/mixpanel/transformers";

function makeJob() {
  return {
    data: { id: "job-1", payload: { projectId: "project-1" } },
    attemptsMade: 0,
  } as unknown as Parameters<typeof handlePostHogIntegrationProjectJob>[0];
}

function causeChainIncludes(error: unknown, needle: string): boolean {
  let current: any = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (typeof current.message === "string" && current.message.includes(needle))
      return true;
    current = current.cause;
  }
  return false;
}

describe("PostHog integration project job — SSRF connect-time pinning", () => {
  beforeEach(() => {
    h.posthogIntegrationUpdate.mockClear();
    h.posthogIntegrationUpdateMany.mockClear();
    h.recordIncrement.mockClear();
    h.dispatchProjectNotification.mockClear();
    h.db.integration = h.integration();
  });

  // A blocked resolved IP is a customer-config fault, so the handler's shared
  // classifier owns the terminal decision: disable the integration, notify, and
  // RESOLVE. What this test adds over the classifier's own suite is the source
  // of the fault — a host that PASSED the string pre-check and only failed when
  // the socket resolved, which is reachable solely through connect-time pinning.
  it("blocks a validated host that resolves to a blocked IP before egress, and disables the integration", async () => {
    let requestCount = 0;
    const { nameUrl } = await startLoopbackServer(() => {
      requestCount++;
    });
    h.db.integration.posthogHostName = nameUrl;

    let thrown: unknown;
    try {
      await handlePostHogIntegrationProjectJob(makeJob());
    } catch (error) {
      thrown = error;
    }

    expect(requestCount).toBe(0);
    expect(thrown).toBeUndefined();

    // Non-vacuous: only an OutboundUrlValidationError carrying `blocked-ip` (or
    // `blocked-hostname`) produces this reason, and the pre-check is stubbed to
    // pass, so the tag can only have come from the connect-time lookup.
    expect(h.recordIncrement).toHaveBeenCalledWith(
      POSTHOG_INTEGRATION_DISABLED_METRIC,
      1,
      { reason: "ssrf_blocked_endpoint" },
    );
    expect(h.posthogIntegrationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: false } }),
    );
    expect(h.dispatchProjectNotification).toHaveBeenCalled();
  }, 40_000);
});

/**
 * A blocked redirect target is the same customer-config fault as a blocked
 * configured host, so it must disable too: the typed `code` has to survive the
 * RedirectValidationError re-wrap for the classifier to see it.
 */
describe("PostHog integration project job — SSRF block on a redirect hop", () => {
  const exporterHost = "https://exporter.analytics.example";
  const metadataUrl = "http://169.254.169.254/latest/meta-data/";

  beforeEach(() => {
    h.posthogIntegrationUpdate.mockClear();
    h.posthogIntegrationUpdateMany.mockClear();
    h.recordIncrement.mockClear();
    h.dispatchProjectNotification.mockClear();
    h.db.integration = h.integration();
  });

  const redirectOnce = () =>
    vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { Location: metadataUrl } }),
      );

  // Stub the pre-check for the harness host only (as the tests above do); the
  // redirect target goes through the real validator, so the classified fault is
  // a genuine OutboundUrlValidationError and not a shape invented here.
  async function useRealValidatorForRedirectTargets() {
    const actual = await vi.importActual<
      typeof import("@langfuse/shared/src/server")
    >("@langfuse/shared/src/server");
    const exporterOrigin = new URL(exporterHost).origin;
    vi.mocked(validateWebhookURL).mockImplementation(async (url, whitelist) => {
      // Origin equality, not a prefix: exporter.analytics.example.evil.test
      // starts with the harness host but is a different origin.
      if (new URL(url).origin === exporterOrigin) return;
      await actual.validateWebhookURL(url, whitelist);
    });
  }

  it("disables the integration when a redirect target is a blocked host", async () => {
    await useRealValidatorForRedirectTargets();
    h.db.integration.posthogHostName = exporterHost;
    // Stubbed at the socket boundary: only redirect validation can reject here.
    const fetchSpy = redirectOnce();

    let thrown: unknown;
    try {
      await handlePostHogIntegrationProjectJob(makeJob());
    } catch (error) {
      thrown = error;
    }

    // Non-vacuous: the 302 was served, so the block came from the redirect hop.
    expect(fetchSpy).toHaveBeenCalled();
    // Must not throw: that would fire the Failures monitor every cycle.
    expect(thrown).toBeUndefined();
    expect(h.recordIncrement).toHaveBeenCalledWith(
      POSTHOG_INTEGRATION_DISABLED_METRIC,
      1,
      { reason: "ssrf_blocked_endpoint" },
    );
    expect(h.posthogIntegrationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: false } }),
    );
    expect(h.dispatchProjectNotification).toHaveBeenCalled();
  }, 40_000);

  // The contract the disable rests on: the inner typed error stays reachable,
  // and stays off the enumerable surface a logger serializes.
  it("keeps the inner validation error reachable as a non-enumerable cause", async () => {
    const actual = await vi.importActual<
      typeof import("@langfuse/shared/src/server")
    >("@langfuse/shared/src/server");
    redirectOnce();

    const thrown = await fetchWithSecureRedirects(
      `${exporterHost}/batch/`,
      { method: "POST" },
      {
        maxRedirects: 3,
        redirectValidation: { validateUrl: actual.validateWebhookURL },
      },
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect((thrown as Error | undefined)?.name).toBe("RedirectValidationError");
    const cause = (thrown as { cause?: unknown } | undefined)?.cause as
      | { name?: string; code?: string }
      | undefined;
    expect(cause?.name).toBe("OutboundUrlValidationError");
    expect(cause?.code).toBe("blocked-hostname");
    expect(Object.keys(thrown as object)).not.toContain("cause");
  });
});

describe("Mixpanel sender — SSRF connect-time pinning", () => {
  it("rejects a validated host that connects to a blocked IP, before egress and terminally", async () => {
    let requestCount = 0;
    const { nameUrl, port } = await startLoopbackServer(() => {
      requestCount++;
    });

    // Negative control: the pre-fix path (bare global fetch) reaches the server,
    // so a later count of 0 proves the pinning blocked the send rather than the
    // harness being unreachable.
    await fetch(`http://localhost:${port}/import?strict=1`, {
      method: "POST",
      body: "[]",
    });
    expect(requestCount).toBe(1);

    const client = new MixpanelClient({
      projectToken: "t",
      region: "api",
      baseUrl: nameUrl,
    });
    client.addEvent({
      event: "trace",
      properties: { token: "t", distinct_id: "1", $insert_id: 1 },
    } as unknown as MixpanelEvent);

    let thrown: unknown;
    try {
      await client.flush();
    } catch (error) {
      thrown = error;
    }

    expect(requestCount).toBe(1);
    expect(thrown).toBeDefined();
    expect(isUnrecoverableError(thrown)).toBe(true);
    expect(causeChainIncludes(thrown, "Blocked IP address detected")).toBe(
      true,
    );
  }, 5_000);
});

describe("outbound validation classification", () => {
  it("treats a DNS lookup failure as retryable and a blocked IP as terminal", () => {
    const wrap = (cause: Error) =>
      Object.assign(new TypeError("fetch failed"), { cause });

    expect(
      findOutboundUrlValidationError(
        wrap(
          new OutboundUrlValidationError(
            "dns-lookup-failed",
            "DNS lookup failed for exporter.example.com",
          ),
        ),
      ),
    ).toBeUndefined();

    expect(
      findOutboundUrlValidationError(
        wrap(
          new OutboundUrlValidationError(
            "blocked-ip",
            "Blocked IP address detected: 127.0.0.1",
          ),
        ),
      ),
    ).toBeDefined();
  });

  // A redirect loop or exhausted budget can never succeed on retry — the job
  // would re-read the same events from ClickHouse and hit the same chain every
  // attempt — so both must classify as terminal on the very first attempt.
  it("treats an exhausted redirect budget and a redirect loop as terminal", () => {
    expect(
      findOutboundUrlValidationError(
        new MaxRedirectsExceededError(10, ["http://a/", "http://b/"]),
      ),
    ).toBeDefined();

    expect(
      findOutboundUrlValidationError(
        new CircularRedirectError(["http://a/", "http://b/", "http://a/"]),
      ),
    ).toBeDefined();
  });
});

/**
 * Everything a structured logger or tracer can pull off a thrown error: its
 * enumerable own fields (winston copies those into the JSON log line), its
 * message, its stack, and the same again for each `cause` a chain-walking
 * reporter follows. A credential must appear in none of them.
 */
function serializableSurface(error: unknown): string {
  const parts: string[] = [];
  let current: any = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    parts.push(JSON.stringify({ ...current }));
    if (typeof current.message === "string") parts.push(current.message);
    if (typeof current.stack === "string") parts.push(current.stack);
    current = current.cause;
  }
  return parts.join("\n");
}

function captureRethrow(error: unknown): unknown {
  try {
    rethrowIfOutboundValidationFailure(error, {
      logSubject: "Mixpanel outbound send",
      jobSubject: "Mixpanel export",
    });
  } catch (caught) {
    return caught;
  }
  return undefined;
}

describe("terminal outbound failure reporting", () => {
  // The rejected redirect target is embedded verbatim in the validation error —
  // in its message, its stack, and its enumerable `redirectUrl` field — so a
  // credentialed Location header would otherwise reach the log line and
  // BullMQ's persisted failedReason.
  const credentialedRedirect = () =>
    Object.assign(new TypeError("fetch failed"), {
      cause: new RedirectValidationError(
        "Blocked IP address detected: 169.254.169.254",
        "http://exporter:hunter2@169.254.169.254/",
        0,
        new OutboundUrlValidationError(
          "blocked-ip",
          "Blocked IP address detected: 169.254.169.254",
        ),
      ),
    });

  it("redacts credentials from a rejected redirect target", () => {
    const thrown = captureRethrow(credentialedRedirect());

    expect(isUnrecoverableError(thrown)).toBe(true);
    const message = (thrown as Error).message;
    expect(message).not.toContain("hunter2");
    expect(message).toContain("http://***@169.254.169.254/");
    // The diagnostic reason must survive redaction, otherwise the operator
    // cannot tell a blocked IP from a rejected scheme.
    expect(message).toContain("Blocked IP address detected: 169.254.169.254");
  });

  it("keeps credentials out of every field a logger or tracer can serialize", () => {
    const thrown = captureRethrow(credentialedRedirect());

    // Redacting only the message is not enough: the queue's generic `failed`
    // handler passes the whole error to the logger and to traceException, so a
    // raw error retained as an enumerable `cause` leaks the URL anyway.
    expect(serializableSurface(thrown)).not.toContain("hunter2");
    expect(serializableSurface(thrown)).not.toContain(
      "exporter:hunter2@169.254.169.254",
    );
    // Non-vacuous: the redacted reason really is reachable on that surface.
    expect(serializableSurface(thrown)).toContain(
      "Blocked IP address detected: 169.254.169.254",
    );
  });

  it("does not expose the retained cause as an enumerable field", () => {
    const thrown = captureRethrow(credentialedRedirect());

    expect((thrown as Error).cause).toBeDefined();
    expect(Object.keys(thrown as object)).not.toContain("cause");
  });

  it("leaves a credential-free message untouched and stays a no-op for other errors", () => {
    expect(() =>
      rethrowIfOutboundValidationFailure(new Error("connection reset"), {
        logSubject: "Mixpanel outbound send",
        jobSubject: "Mixpanel export",
      }),
    ).not.toThrow();

    expect(() =>
      rethrowIfOutboundValidationFailure(
        new OutboundUrlValidationError(
          "blocked-ip",
          "Blocked IP address detected: 127.0.0.1",
        ),
        { logSubject: "Mixpanel outbound send", jobSubject: "Mixpanel export" },
      ),
    ).toThrow("Blocked IP address detected: 127.0.0.1");
  });

  // Neither a redirect loop nor an exhausted budget was ever checked for
  // safety — outbound-url/fetch.ts detects both before validating the hop that
  // would have closed the loop or exceeded the budget — so the message must
  // not claim a security block, and must not claim the destination was safe
  // either.
  it("labels an exhausted redirect budget distinctly from an SSRF block, and calls the destination unverified", () => {
    const thrown = captureRethrow(
      new MaxRedirectsExceededError(10, ["http://a/", "http://b/"]),
    );

    expect(isUnrecoverableError(thrown)).toBe(true);
    const message = (thrown as Error).message;
    expect(message).toContain("too many redirects");
    expect(message).toContain("final destination not verified");
    expect(message).not.toContain("blocked by SSRF protection");
  });

  it("labels a redirect loop distinctly from an SSRF block, and calls the destination unverified", () => {
    const thrown = captureRethrow(
      new CircularRedirectError(["http://a/", "http://b/", "http://a/"]),
    );

    expect(isUnrecoverableError(thrown)).toBe(true);
    const message = (thrown as Error).message;
    expect(message).toContain("redirect loop");
    expect(message).toContain("final destination not verified");
    expect(message).not.toContain("blocked by SSRF protection");
  });

  it("keeps calling an actual policy block a security block", () => {
    const thrown = captureRethrow(
      new OutboundUrlValidationError(
        "blocked-ip",
        "Blocked IP address detected: 127.0.0.1",
      ),
    );

    expect((thrown as Error).message).toContain("blocked by SSRF protection");
  });
});
