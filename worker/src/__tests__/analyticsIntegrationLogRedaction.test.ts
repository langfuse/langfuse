/**
 * Credential redaction at the log sink for the analytics exporters.
 *
 * A configured host can carry credentials, and the log line fires exactly
 * when that URL was rejected — including when it was rejected for carrying
 * them. Assertions walk Error objects (name/message/stack/cause) rather
 * than JSON.stringify-ing the call array: JSON.stringify renders an Error
 * as {}, and the Mixpanel sender passes the raw error as a second argument.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_HOST;
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_IPS;
  delete process.env.LANGFUSE_WEBHOOK_WHITELISTED_IP_SEGMENTS;
});

const PASSWORD = "hunter2";
const CREDENTIALED_HOST = `http://exporter:${PASSWORD}@10.0.0.1`;

const h = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const record =
    (level: string) =>
    (...args: unknown[]) => {
      calls.push([level, ...args]);
    };
  const logger = {
    error: vi.fn(record("error")),
    warn: vi.fn(record("warn")),
    info: vi.fn(record("info")),
    debug: vi.fn(record("debug")),
  };
  const noRows = () => (async function* () {})();
  const oneRow = () =>
    (async function* () {
      yield { langfuse_id: "row-1" };
    })();
  const integration = {
    projectId: "project-1",
    enabled: true,
    exportSource: "TRACES_OBSERVATIONS",
    posthogHostName: "http://exporter:hunter2@10.0.0.1/",
    encryptedPosthogApiKey: "enc",
    lastSyncAt: new Date("2024-01-01"),
    project: { name: "Test Project", createdAt: new Date("2023-01-01") },
  };
  const posthogIntegrationUpdate = vi.fn();
  const posthogIntegrationUpdateMany = vi.fn(async () => ({ count: 1 }));
  const dispatchProjectNotification = vi.fn(async () => {});
  return {
    calls,
    logger,
    noRows,
    oneRow,
    integration,
    posthogIntegrationUpdate,
    posthogIntegrationUpdateMany,
    dispatchProjectNotification,
  };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    posthogIntegration: {
      findFirst: vi.fn(async () => h.integration),
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
    logger: h.logger,
    getCurrentSpan: vi.fn(() => undefined),
    recordIncrement: vi.fn(),
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

import { handlePostHogIntegrationProjectJob } from "../features/posthog/handlePostHogIntegrationProjectJob";
import { MixpanelClient } from "../features/mixpanel/mixpanelClient";
import type { MixpanelEvent } from "../features/mixpanel/transformers";

function everythingLogged(): string {
  const parts: string[] = [];

  const visit = (value: unknown, depth: number): void => {
    if (value == null || depth > 6) return;

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      parts.push(String(value));
      return;
    }
    if (value instanceof Error) {
      parts.push(value.name, value.message, String(value.stack ?? ""));
      visit((value as Error & { cause?: unknown }).cause, depth + 1);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, depth + 1));
      return;
    }
    if (typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach((entry) =>
        visit(entry, depth + 1),
      );
    }
  };

  h.calls.forEach((call) => call.forEach((arg) => visit(arg, 0)));
  return parts.join("\n");
}

describe("analytics export credential redaction at the log sink", () => {
  beforeEach(() => {
    h.calls.length = 0;
  });

  it("never writes a configured password to any log level (PostHog)", async () => {
    await handlePostHogIntegrationProjectJob({
      data: { id: "job-1", payload: { projectId: "project-1" } },
      attemptsMade: 0,
    } as never);

    const logged = everythingLogged();

    expect(h.calls.length).toBeGreaterThan(0);
    expect(logged).toContain("10.0.0.1");
    expect(logged).not.toContain(PASSWORD);
  }, 10_000);

  it("never writes a configured password to any log level (Mixpanel)", async () => {
    const client = new MixpanelClient({
      projectToken: "t",
      region: "api",
      baseUrl: CREDENTIALED_HOST,
    });
    client.addEvent({
      event: "trace",
      properties: { token: "t", distinct_id: "1", $insert_id: 1 },
    } as unknown as MixpanelEvent);

    await expect(client.flush()).rejects.toThrow();

    const logged = everythingLogged();

    expect(h.calls.length).toBeGreaterThan(0);
    expect(logged).toMatch(/credentials|not allowed/i);
    expect(logged).not.toContain(PASSWORD);
  }, 10_000);
});
