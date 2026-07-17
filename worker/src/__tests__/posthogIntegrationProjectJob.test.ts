import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for the PostHog integration project job's events_only legacy
 * guard (LFE-10148): a persisted legacy export source on an events_only
 * deployment reads the v3 traces/observations tables, which are no longer
 * written — the job must fail loudly before exporting empty data and
 * advancing lastSyncAt. Mocked in the same style as
 * mixpanelIntegrationProjectJob.test.ts.
 */

// vi.mock factories are hoisted above module scope, so all shared mutable
// state the factories touch must live inside vi.hoisted().
const h = vi.hoisted(() => {
  async function* fakeStream(label: string) {
    yield { langfuse_id: `${label}-1` };
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
    flush = vi.fn(async () => {});
    on = vi.fn();
  },
}));

// Path is relative to this test file -> resolves to worker/src/env (the
// module the exportWriteModeGuard reads its write mode from).
vi.mock("../env", () => ({
  env: { LANGFUSE_MIGRATION_V4_WRITE_MODE: "legacy" },
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

describe("handlePostHogIntegrationProjectJob events_only legacy guard (LFE-10148)", () => {
  beforeEach(() => {
    h.posthogIntegrationUpdate.mockClear();
    h.getTraces.mockClear();
    h.getGenerations.mockClear();
    h.getScores.mockClear();
    h.getEvents.mockClear();
    h.db.integration = h.defaultIntegration();
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "legacy";
  });

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

  it("exports an EVENTS source normally on events_only", async () => {
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "events_only";
    h.db.integration = {
      ...h.defaultIntegration(),
      exportSource: "EVENTS",
    };

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.getEvents).toHaveBeenCalledTimes(1);
    expect(h.getTraces).not.toHaveBeenCalled();
    expect(h.posthogIntegrationUpdate).toHaveBeenCalledTimes(1);
  });

  it("exports a legacy source normally on dual write mode", async () => {
    (env as any).LANGFUSE_MIGRATION_V4_WRITE_MODE = "dual";

    await handlePostHogIntegrationProjectJob(makeJob());

    expect(h.getTraces).toHaveBeenCalledTimes(1);
    expect(h.posthogIntegrationUpdate).toHaveBeenCalledTimes(1);
  });
});
