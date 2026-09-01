/**
 * Mandated negative coverage for PostHog and Mixpanel outbound URLs:
 * loopback literals, cloud metadata, RFC1918, a hostname that resolves
 * internally, embedded credentials, and a non-HTTP scheme.
 *
 * Unlike analyticsIntegrationSsrfPinning.test.ts, validateWebhookURL is
 * not mocked: these cases prove the URL-level defenses.
 *
 * Empty allowlist is the premise. vitest loads ../.env, and a developer
 * who allowlists localhost for webhook testing would otherwise turn the
 * hostname cases into mystery failures.
 */
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUnrecoverableError } from "../errors/UnrecoverableError";

vi.hoisted(() => {
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_HOST;
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_IPS;
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_IP_SEGMENTS;
});

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
  const posthogIntegrationUpdateMany = vi.fn(async () => ({ count: 1 }));
  const recordIncrement = vi.fn();
  const dispatchProjectNotification = vi.fn(async () => {});
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

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    getCurrentSpan: vi.fn(() => undefined),
    recordIncrement: h.recordIncrement,
    dispatchProjectNotification: h.dispatchProjectNotification,
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
    LANGFUSE_MIXPANEL_TIMEOUT_MS: 3_000,
  },
  v4WritesToLegacyTables: () => true,
  v4WritesToEventsTable: () => false,
}));

import { whitelistFromEnv } from "@langfuse/shared/src/server";
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

const BLOCKED_DESTINATIONS: Array<[label: string, url: string]> = [
  ["loopback literal", "http://127.0.0.1/"],
  ["IPv6 loopback literal", "http://[::1]/"],
  ["cloud metadata literal", "http://169.254.169.254/"],
  ["RFC1918 literal", "http://10.0.0.5/"],
  ["hostname resolving to loopback", "http://localhost/"],
];

const CREDENTIALED_URL = "http://exporter:hunter2@127.0.0.1/";

describe("negative-suite premise", () => {
  it("runs with a genuinely empty allowlist", () => {
    expect(whitelistFromEnv()).toEqual({ hosts: [], ips: [], ip_ranges: [] });
  });
});

describe("PostHog export — blocked outbound destinations are rejected", () => {
  beforeEach(() => {
    h.posthogIntegrationUpdate.mockClear();
    h.posthogIntegrationUpdateMany.mockClear();
    h.recordIncrement.mockClear();
    h.dispatchProjectNotification.mockClear();
    h.db.integration = h.integration();
  });

  it.each(BLOCKED_DESTINATIONS)(
    "rejects %s, disables the integration, and does not advance the sync cursor",
    async (_label, url) => {
      h.db.integration.posthogHostName = url;

      // Customer-config faults disable and resolve rather than throw, so a
      // blocked host must not light the Failures monitor.
      await expect(
        handlePostHogIntegrationProjectJob(makeJob()),
      ).resolves.toBeUndefined();

      expect(h.posthogIntegrationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { enabled: false } }),
      );
      expect(h.posthogIntegrationUpdate).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastSyncAt: expect.anything() }),
        }),
      );
    },
  );

  it("rejects a URL with embedded credentials without leaking the password", async () => {
    h.db.integration.posthogHostName = CREDENTIALED_URL;

    await expect(
      handlePostHogIntegrationProjectJob(makeJob()),
    ).resolves.toBeUndefined();

    expect(h.posthogIntegrationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: false } }),
    );
    const persisted = h.posthogIntegrationUpdate.mock.calls.flatMap((call) =>
      JSON.stringify(call),
    );
    expect(persisted.join("\n")).not.toContain("hunter2");
  });
});

describe("Mixpanel export — blocked outbound destinations are rejected", () => {
  const addOneEvent = (client: MixpanelClient) =>
    client.addEvent({
      event: "trace",
      properties: { token: "t", distinct_id: "1", $insert_id: 1 },
    } as unknown as MixpanelEvent);

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
  }, 10_000);

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
      expect(isUnrecoverableError(thrown)).toBe(true);
      expect(causeChainIncludes(thrown, "Blocked")).toBe(true);
    },
    10_000,
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
    expect(String((thrown as Error).message)).not.toContain("hunter2");
  }, 10_000);

  it("refuses a non-HTTP(S) destination scheme", async () => {
    const client = new MixpanelClient({
      projectToken: "t",
      region: "api",
      baseUrl: "ftp://10.0.0.1",
    });
    addOneEvent(client);

    await expect(client.flush()).rejects.toThrow(/HTTP and HTTPS/);
  }, 10_000);
});
