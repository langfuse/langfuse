/**
 * Mandated negative coverage for the PostHog and Mixpanel outbound-URL
 * surfaces, per `.agents/skills/security-review/references/outbound-url-validation.md`
 * ("Negative Tests (Required)"): loopback literal, IPv6 loopback, cloud
 * metadata literal, RFC1918 literal, a hostname that resolves to a private IP,
 * and a URL with embedded credentials.
 *
 * EMPTY ALLOWLIST is the premise of this whole file: it sets no allowlist env
 * var at all, so nothing may reach an internal target. (The allowlisted
 * counterpart — a legitimate host that DOES deliver — lives in
 * analyticsIntegrationOutboundUrlAllowlist.test.ts, which needs a conflicting
 * process env and therefore its own file.) The premise holds whichever env trio
 * the surface reads, so this file is deliberately free of trio names.
 *
 * The real validators run here. Unlike analyticsIntegrationSsrfPinning.test.ts,
 * `validateWebhookURL` is deliberately NOT mocked: these cases exist to prove
 * the URL-level defenses, so neutralising them would make every test vacuous.
 *
 * NOT APPLICABLE — `http://` on Cloud (the 6th case in the reference): that case
 * targets surfaces that mandate HTTPS (LLM base URL, blob storage endpoint).
 * These two exporters intentionally permit `http://` on ports 80/443 for
 * self-hosted proxies — verified: a plain `http://` public host is not rejected
 * on scheme by either sender. Asserting an HTTPS requirement here would encode
 * a rule the surface does not have. Flagged in the report rather than
 * approximated.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUnrecoverableError } from "../errors/UnrecoverableError";

const openServers: Server[] = [];

async function startLoopbackServer(onRequest: () => void) {
  const server = createServer((_req, res) => {
    onRequest();
    res.end("{}");
  });
  openServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map((s) => new Promise<void>((r) => s.close(() => r()))),
  );
});

const h = vi.hoisted(() => {
  const posthogIntegrationUpdate = vi.fn();
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

// Only the ClickHouse-backed streams, the logger and telemetry are replaced —
// every URL validator stays real.
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    getCurrentSpan: vi.fn(() => undefined),
    recordIncrement: vi.fn(),
    getTracesForAnalyticsIntegrations: vi.fn(() => h.noRows()),
    getGenerationsForAnalyticsIntegrations: vi.fn(() => h.noRows()),
    getScoresForAnalyticsIntegrations: vi.fn(() => h.oneRow()),
    getEventsForAnalyticsIntegrations: vi.fn(() => h.noRows()),
  };
});

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
    // Deliberately short: until use-time URL validation rejects an unroutable
    // internal literal up front, the RFC1918 case can only end by timing out,
    // and 30s x N cases would dominate the suite.
    LANGFUSE_MIXPANEL_TIMEOUT_MS: 3_000,
  },
  v4WritesToLegacyTables: () => true,
  v4WritesToEventsTable: () => false,
}));

import { handlePostHogIntegrationProjectJob } from "../features/posthog/handlePostHogIntegrationProjectJob";
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

/** Blocked destinations that need no listening socket to be rejected. */
const BLOCKED_DESTINATIONS: Array<[label: string, url: string]> = [
  ["loopback literal", "http://127.0.0.1/"],
  ["IPv6 loopback literal", "http://[::1]/"],
  ["cloud metadata literal", "http://169.254.169.254/"],
  ["RFC1918 literal", "http://10.0.0.1/"],
  // Hostname that resolves to a private IP — the DNS-rebinding sanity check.
  ["hostname resolving to loopback", "http://localhost/"],
];

const CREDENTIALED_URL = "http://exporter:hunter2@127.0.0.1/";

describe("PostHog export — blocked outbound destinations are rejected", () => {
  beforeEach(() => {
    h.posthogIntegrationUpdate.mockClear();
    h.db.integration = h.integration();
  });

  it.each(BLOCKED_DESTINATIONS)(
    "rejects %s and does not advance the sync cursor",
    async (_label, url) => {
      h.db.integration.posthogHostName = url;

      await expect(
        handlePostHogIntegrationProjectJob(makeJob()),
      ).rejects.toThrow();

      // A rejected destination must never look like a successful run.
      expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
    },
  );

  // Embedded credentials are called out in the reference as a recurring
  // SSRF/credential-leak vector: the URL must be refused, and the refusal must
  // not copy the secret into an error that lands in logs.
  it("rejects a URL with embedded credentials without leaking the password", async () => {
    h.db.integration.posthogHostName = CREDENTIALED_URL;

    let thrown: unknown;
    try {
      await handlePostHogIntegrationProjectJob(makeJob());
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    expect(String((thrown as Error).message)).not.toContain("hunter2");
    expect(h.posthogIntegrationUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Mixpanel. INTENTIONALLY RED until use-time URL validation lands in
// MixpanelClient.sendBatch.
//
// DO NOT "FIX" THESE BY RELAXING THEM. Today the connect-time DNS hook never
// fires for an IP literal, so an IP-literal destination is structurally
// unblockable and these assertions fail. That is the security gap, not a bad
// test.
//
// Note why each assertion is on the BLOCK, not merely on "it threw": today the
// loopback/metadata literals already throw, but only because nothing is
// listening (`TypeError: fetch failed`) — an accident of the test host. On real
// EC2 the metadata endpoint answers. Asserting "throws" would therefore pass
// today for entirely the wrong reason and keep passing while the hole stayed
// open.
// ---------------------------------------------------------------------------
describe("Mixpanel export — blocked outbound destinations are rejected", () => {
  const addOneEvent = (client: MixpanelClient) =>
    client.addEvent({
      event: "trace",
      properties: { token: "t", distinct_id: "1", $insert_id: 1 },
    } as unknown as MixpanelEvent);

  // The one blocked case where "reached the socket" is directly observable: a
  // real server on the loopback literal. Pre-fix this delivers (requestCount
  // 1); once use-time validation lands it must be refused before connecting.
  it("does not send to a loopback literal that is actually listening", async () => {
    let requestCount = 0;
    const port = await startLoopbackServer(() => {
      requestCount++;
    });

    const client = new MixpanelClient({
      projectToken: "t",
      region: "api",
      baseUrl: `http://127.0.0.1:${port}`,
    });
    addOneEvent(client);

    let thrown: unknown;
    try {
      await client.flush();
    } catch (error) {
      thrown = error;
    }

    expect(requestCount).toBe(0);
    expect(thrown).toBeDefined();
    expect(isUnrecoverableError(thrown)).toBe(true);
  }, 40_000);

  it.each(BLOCKED_DESTINATIONS)(
    "refuses %s as a terminal SSRF block",
    async (_label, url) => {
      const client = new MixpanelClient({
        projectToken: "t",
        region: "api",
        baseUrl: url.replace(/\/$/, ""),
      });
      addOneEvent(client);

      let thrown: unknown;
      try {
        await client.flush();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeDefined();
      // Must fail BECAUSE the destination is blocked — not because the host
      // happened to be unreachable from the test machine.
      expect(isUnrecoverableError(thrown)).toBe(true);
      expect(causeChainIncludes(thrown, "Blocked")).toBe(true);
    },
    40_000,
  );

  it("rejects a URL with embedded credentials without leaking the password", async () => {
    const client = new MixpanelClient({
      projectToken: "t",
      region: "api",
      baseUrl: CREDENTIALED_URL.replace(/\/$/, ""),
    });
    addOneEvent(client);

    let thrown: unknown;
    try {
      await client.flush();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
    // The password must not survive into the error text. Without an explicit
    // credential check the request still fails, but via undici's own guard,
    // which echoes the whole URL — "Request cannot be constructed from a URL
    // that includes credentials: http://exporter:hunter2@127.0.0.1/import?..."
    // — putting the secret into worker logs. This assertion is what forces the
    // refusal to come from a parser that does not echo.
    expect(String((thrown as Error).message)).not.toContain("hunter2");
  }, 40_000);

  // The exporters speak HTTP(S). A destination on any other scheme must be
  // refused rather than handed to the fetch layer.
  it("refuses a non-HTTP(S) destination scheme", async () => {
    const client = new MixpanelClient({
      projectToken: "t",
      region: "api",
      baseUrl: "ftp://10.0.0.1",
    });
    addOneEvent(client);

    await expect(client.flush()).rejects.toThrow();
  }, 40_000);
});
