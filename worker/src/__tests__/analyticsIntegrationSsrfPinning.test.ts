/**
 * Connect-time SSRF pinning for the PostHog and Mixpanel analytics exporters.
 *
 * Both senders used to validate the configured host once and then send over an
 * unpinned fetch. That is a check-then-use (TOCTOU) gap: a host answering a
 * public IP during validation can rebind to a private/loopback address by the
 * time the socket connects. Egress now runs through the shared
 * connect-time-pinned secure-outbound infra, and a block fails terminally.
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
// sources, the logger, and validateWebhookURL.
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
    LANGFUSE_MIXPANEL_FLUSH_DELAY_MS: 0,
    // Must stay non-zero, else the Mixpanel abort timer fires at ~0ms and masks
    // the SSRF block with a spurious timeout error.
    LANGFUSE_MIXPANEL_TIMEOUT_MS: 30_000,
  },
  v4WritesToLegacyTables: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "events_only",
  v4WritesToEventsTable: (e: { LANGFUSE_MIGRATION_V4_WRITE_MODE: string }) =>
    e.LANGFUSE_MIGRATION_V4_WRITE_MODE !== "legacy",
}));

// Imported after mocks are registered.
import { handlePostHogIntegrationProjectJob } from "../features/posthog/handlePostHogIntegrationProjectJob";
import { OutboundUrlValidationError } from "@langfuse/shared/src/server";
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
    h.db.integration = h.integration();
  });

  it("rejects a validated host that connects to a blocked IP, before egress and terminally", async () => {
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
    expect(thrown).toBeDefined();
    expect(isUnrecoverableError(thrown)).toBe(true);
    // The terminal error must be caused BY the SSRF block; otherwise any
    // UnrecoverableError raised before the first socket write would satisfy the
    // assertions above and the test would go vacuous.
    expect(causeChainIncludes(thrown, "Blocked IP address detected")).toBe(
      true,
    );
    expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
  }, 40_000);
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
  }, 40_000);
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
});
