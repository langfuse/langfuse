/**
 * Credential redaction at the LOG SINK for the analytics exporters.
 *
 * Every other credential test in this phase asserts on the THROWN message — and
 * that is precisely how the first leak survived: the configured URL was echoed
 * into a log line, not into the error. A configured host can carry credentials
 * (http://user:pass@host), and the log line fires exactly when that URL was
 * rejected, including when it was rejected FOR carrying them. So the durable
 * assertion is on what reaches the logger.
 *
 * NON-VACUITY: "the password is absent" is trivially true if nothing was logged,
 * or if the inspection cannot see where the password would be. Each case
 * therefore also asserts the sink received a recognisable line. And the
 * serializer below deliberately walks Error objects (name/message/stack/cause)
 * rather than JSON.stringify-ing the call array: JSON.stringify renders an Error
 * as {}, and the Mixpanel sender passes the raw error as a second argument, so a
 * naive stringify would report "no leak" for the one shape most likely to leak.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// A local webhook allowlist must not make a credentialed internal host
// acceptable and skip the rejection path these cases depend on.
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
  return { calls, logger, noRows, oneRow, integration };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    posthogIntegration: {
      findFirst: vi.fn(async () => h.integration),
      update: vi.fn(),
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

/**
 * Flattens everything handed to the logger into one searchable string, across
 * all levels. Walks Errors explicitly (message, stack, cause) because that is
 * where a leaked URL hides and where JSON.stringify would show nothing.
 */
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
  // Each case must stand alone. Without this the captured log accumulates, so
  // one sender's line can satisfy the other's non-vacuity control or fail its
  // leak assertion — the cases would stop being independent evidence. (Caught by
  // mutation-testing this file: a planted PostHog leak failed the Mixpanel case
  // too.)
  beforeEach(() => {
    h.calls.length = 0;
  });

  it("never writes a configured password to any log level (PostHog)", async () => {
    await expect(
      handlePostHogIntegrationProjectJob({
        data: { id: "job-1", payload: { projectId: "project-1" } },
        attemptsMade: 0,
      } as never),
    ).rejects.toThrow();

    const logged = everythingLogged();

    // Non-vacuity: something was logged, and it is the line about this host, so
    // the absence assertion below is inspecting the place a leak would appear.
    expect(h.calls.length).toBeGreaterThan(0);
    expect(logged).toContain("10.0.0.1");

    expect(logged).not.toContain(PASSWORD);
  }, 40_000);

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

    // Non-vacuity: the sender did log its refusal, so absence is meaningful.
    expect(h.calls.length).toBeGreaterThan(0);
    expect(logged).toContain("credentials");

    expect(logged).not.toContain(PASSWORD);
  }, 40_000);
});
