/**
 * SSRF connect-time pinning for the PostHog and Mixpanel analytics exporters
 * (LFE-14989).
 *
 * Contract under test (verbatim acceptance criteria):
 *   1. A host that validates as public but rebinds to a blocked IP at connect
 *      time is rejected BEFORE any data leaves the worker, for BOTH PostHog
 *      and Mixpanel.
 *   2. Egress reuses the shared secure-outbound infra (no new bespoke SSRF
 *      logic).
 *   3. A connect-time SSRF rejection makes the export job fail TERMINALLY: it
 *      surfaces as an error named "UnrecoverableError" (the marker BullMQ
 *      checks to suppress retries).
 *   4. Legitimate public hosts still send successfully (no regression).
 *
 * Infra-free: no Redis/ClickHouse/Postgres/MinIO. A localhost HTTP server plus
 * the shared secure-outbound egress under a strict whitelist stands in for a
 * public host that resolves to a blocked/loopback IP.
 *
 * WHY the PostHog test models the TOCTOU the way it does:
 *   The current handler validates the configured host as a *string* (via
 *   validateWebhookURL) and then sends over an UNPINNED fetch. So a loopback
 *   host is already rejected at validate time — that is NOT the gap. The gap
 *   is the connect-time re-resolution. This suite neutralises the string
 *   validator (models "the host validated as public") and points the send at a
 *   loopback address (models "it resolves to a blocked IP at connect"). Only a
 *   connect-time-pinned fetch blocks it; a validate-only fix leaves it RED,
 *   which is correct per criterion #1.
 *
 * See the SPEC-AMBIGUITY notes in the test-author report for why the Mixpanel
 * *client* cannot be driven to a loopback host infra-free (hardcoded
 * `*.mixpanel.com`, no injection seam) — its egress path is pinned here only
 * as a shared-infra oracle (O2), not against the real client.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostHog } from "posthog-node";
import { isUnrecoverableError } from "../errors/UnrecoverableError";

const STRICT_WHITELIST = { hosts: [], ips: [], ip_ranges: [] };

const openServers: Server[] = [];

/**
 * A localhost HTTP server. Returns both a DNS-name URL (`localhost`, so the
 * connect-time lookup hook fires and re-validates the resolved 127.0.0.1) and
 * an IP-literal URL (`127.0.0.1`, for which the connect hook does NOT fire).
 */
async function startLoopbackServer(
  onRequest: () => void,
  respond: (res: import("node:http").ServerResponse) => void = (res) =>
    res.end("ok"),
): Promise<{ nameUrl: string; literalUrl: string; port: number }> {
  const server = createServer((_req, res) => {
    onRequest();
    respond(res);
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    nameUrl: `http://localhost:${port}`,
    literalUrl: `http://127.0.0.1:${port}`,
    port,
  };
}

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// PostHog handler suite — RED until the fix lands.
// posthog-node is intentionally NOT mocked: the real SDK issues the real send
// through the handler's own outbound fetch, so connect-time pinning (or its
// absence) is exercised end to end, including the handler's error mapping.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => {
  const posthogIntegrationUpdate = vi.fn();
  // Only scores yields, so the first flush attempts the (blocked) send and the
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
  return { posthogIntegrationUpdate, oneRow, noRows, integration, db };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    posthogIntegration: {
      findFirst: vi.fn(async () => h.db.integration),
      update: h.posthogIntegrationUpdate,
    },
  },
}));

// Keep the REAL secure-outbound egress helpers; override only the data-stream
// sources, the logger, and validateWebhookURL. Neutralising validateWebhookURL
// models a host that passed string validation (the TOCTOU precondition) so the
// only remaining defense is connect-time pinning.
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    getCurrentSpan: vi.fn(() => undefined),
    recordIncrement: vi.fn(),
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
  },
  v4WritesToLegacyTables: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "events_only",
  v4WritesToEventsTable: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "legacy",
}));

// Imported after mocks are registered.
import { handlePostHogIntegrationProjectJob } from "../features/posthog/handlePostHogIntegrationProjectJob";
import {
  addSecureOutboundConnectionValidation,
  createSecureOutboundLookup,
  fetchWithSecureRedirects,
} from "@langfuse/shared/src/server";

function makeJob() {
  return {
    data: { id: "job-1", payload: { projectId: "project-1" } },
    attemptsMade: 0,
  } as unknown as Parameters<typeof handlePostHogIntegrationProjectJob>[0];
}

/** Walk an error's `cause` chain looking for the SSRF block signature. */
function causeChainIncludes(error: unknown, needle: string): boolean {
  let current: any = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (typeof current.message === "string" && current.message.includes(needle))
      return true;
    current = current.cause;
  }
  return false;
}

describe("PostHog integration project job — SSRF connect-time pinning (RED until fixed)", () => {
  beforeEach(() => {
    h.posthogIntegrationUpdate.mockClear();
    h.db.integration = h.integration();
  });

  it("rejects a validated host that connects to a blocked IP, before egress and terminally", async () => {
    let requestCount = 0;
    const { nameUrl } = await startLoopbackServer(() => {
      requestCount++;
    });
    // Passed string validation (validateWebhookURL is neutralised) but the
    // send resolves to a blocked/loopback IP at connect time.
    h.db.integration.posthogHostName = nameUrl;

    let thrown: unknown;
    try {
      await handlePostHogIntegrationProjectJob(makeJob());
    } catch (error) {
      thrown = error;
    }

    // Criterion #1: no bytes left the worker.
    expect(requestCount).toBe(0);
    // Criterion #3: the job failed terminally (BullMQ suppresses retries).
    expect(thrown).toBeDefined();
    expect(isUnrecoverableError(thrown)).toBe(true);
    // The sync cursor must not advance on a blocked run.
    expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
  }, 40_000);
});

// ---------------------------------------------------------------------------
// Shared secure-outbound egress contract — executable oracle for the fix
// (criterion #2). These pass today; they encode the exact behaviour the fixed
// senders must inherit and act as the green plumbing baseline for the harness.
// ---------------------------------------------------------------------------
describe("shared secure-outbound egress contract (oracle for the fix)", () => {
  const secureFetch = (whitelist: typeof STRICT_WHITELIST) =>
    ((input: any, init: any) =>
      fetch(
        input,
        addSecureOutboundConnectionValidation(init ?? {}, {
          whitelist,
          logContext: "PostHog integration",
        }),
      )) as any;

  // O1 — the purest TOCTOU: a public-looking hostname whose connect-time
  // resolution returns a blocked IP is rejected by the connect-time lookup.
  it("connect-time lookup rejects a host that resolves to a blocked IP (rebind)", async () => {
    const rebindLookup = createSecureOutboundLookup(
      { whitelist: STRICT_WHITELIST, logContext: "PostHog integration" },
      // Base resolver: a public-looking name rebinds to loopback at connect.
      ((_hostname: string, _options: unknown, cb: any) =>
        cb(null, "127.0.0.1", 4)) as any,
    );

    const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      rebindLookup("public-rebind.test", {}, (e) => resolve(e));
    });

    expect(err).not.toBeNull();
    expect(err?.message).toContain("Blocked IP address detected");
  });

  // O2 — Mixpanel-shaped path: a raw global fetch, once wrapped with the
  // shared connection validation, is blocked before egress.
  it("raw fetch (Mixpanel-shaped) to a loopback host is blocked before egress", async () => {
    let requestCount = 0;
    const { nameUrl } = await startLoopbackServer(() => {
      requestCount++;
    });

    await expect(
      fetch(
        nameUrl,
        addSecureOutboundConnectionValidation(
          {},
          { whitelist: STRICT_WHITELIST, logContext: "Mixpanel integration" },
        ),
      ),
    ).rejects.toMatchObject({
      message: "fetch failed",
      cause: expect.objectContaining({
        message: "Blocked IP address detected",
      }),
    });
    expect(requestCount).toBe(0);
  });

  // O3 — PostHog SDK path: real posthog-node with the wrapped fetch is blocked
  // before egress and surfaces the SSRF block on its cause chain.
  it("posthog-node with the wrapped fetch is blocked before egress", async () => {
    let requestCount = 0;
    const { nameUrl } = await startLoopbackServer(() => {
      requestCount++;
    });
    const client = new PostHog("phc_oracle", {
      host: nameUrl,
      flushAt: 1_000,
      maxQueueSize: 10_000,
      fetchRetryCount: 0,
      fetchRetryDelay: 0,
      fetch: secureFetch(STRICT_WHITELIST),
    });
    client.capture({ distinctId: "p", event: "e", properties: {} });

    let flushError: unknown;
    try {
      await client.flush();
    } catch (error) {
      flushError = error;
    }
    await client.shutdown().catch(() => {});

    expect(flushError).toBeDefined();
    expect(causeChainIncludes(flushError, "Blocked IP address detected")).toBe(
      true,
    );
    expect(requestCount).toBe(0);
  });

  // O4 — criterion #4: a legitimate host (modelled by whitelisting localhost)
  // still sends. Pinning must not regress normal delivery.
  it("a whitelisted (legitimate) host still sends successfully", async () => {
    let requestCount = 0;
    const { nameUrl } = await startLoopbackServer(() => {
      requestCount++;
    });
    const client = new PostHog("phc_oracle", {
      host: nameUrl,
      flushAt: 1_000,
      maxQueueSize: 10_000,
      fetchRetryCount: 0,
      fetchRetryDelay: 0,
      fetch: secureFetch({ hosts: ["localhost"], ips: [], ip_ranges: [] }),
    });
    client.capture({ distinctId: "p", event: "e", properties: {} });
    await client.flush();
    await client.shutdown().catch(() => {});

    expect(requestCount).toBeGreaterThan(0);
  });

  // O5 — redirect defense: the connect-time hook does NOT fire for IP literals
  // (verified: a direct fetch to a 127.0.0.1 literal reaches the server), so a
  // redirect to a private/link-local literal is only stopped by redirect-target
  // URL validation. The origin uses an IP literal so its own connect is not
  // pre-blocked, isolating the redirect check.
  it("redirect to a private IP literal is rejected by the redirect-target validator", async () => {
    // validateWebhookURL is neutralised at file scope for the handler suite;
    // use the REAL one here — it is the exact redirect validator the
    // integration uses.
    const { validateWebhookURL } = await vi.importActual<
      typeof import("@langfuse/shared/src/server")
    >("@langfuse/shared/src/server");

    const { literalUrl: origin } = await startLoopbackServer(
      () => undefined,
      (res) => {
        res.writeHead(302, { Location: "http://169.254.169.254/" });
        res.end();
      },
    );

    await expect(
      fetchWithSecureRedirects(
        origin,
        {},
        {
          maxRedirects: 5,
          redirectValidation: {
            validateUrl: validateWebhookURL,
            whitelist: STRICT_WHITELIST,
            logContext: "PostHog integration",
          },
        },
      ),
    ).rejects.toMatchObject({ name: "RedirectValidationError" });
  });
});
