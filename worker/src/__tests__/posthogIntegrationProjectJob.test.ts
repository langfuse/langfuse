import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePostHogIntegrationProjectJob } from "../features/posthog/handlePostHogIntegrationProjectJob";

const mocks = vi.hoisted(() => {
  const findFirst = vi.fn();
  const update = vi.fn();
  const validateWebhookURL = vi.fn();
  const decrypt = vi.fn();
  const getCurrentSpan = vi.fn();
  const getScoresForAnalyticsIntegrations = vi.fn();
  const getTracesForAnalyticsIntegrations = vi.fn();
  const getGenerationsForAnalyticsIntegrations = vi.fn();
  const getEventsForAnalyticsIntegrations = vi.fn();
  const postHogConstructor = vi.fn();
  const postHogFlush = vi.fn();
  const postHogCapture = vi.fn();
  const env = {
    LANGFUSE_POSTHOG_FLUSH_DELAY_MS: 500,
  };

  return {
    findFirst,
    update,
    validateWebhookURL,
    decrypt,
    getCurrentSpan,
    getScoresForAnalyticsIntegrations,
    getTracesForAnalyticsIntegrations,
    getGenerationsForAnalyticsIntegrations,
    getEventsForAnalyticsIntegrations,
    postHogConstructor,
    postHogFlush,
    postHogCapture,
    env,
  };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    posthogIntegration: {
      findFirst: mocks.findFirst,
      update: mocks.update,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  QueueName: {
    PostHogIntegrationProcessingQueue: "posthogIntegrationProcessingQueue",
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getTracesForAnalyticsIntegrations: mocks.getTracesForAnalyticsIntegrations,
  getGenerationsForAnalyticsIntegrations:
    mocks.getGenerationsForAnalyticsIntegrations,
  getScoresForAnalyticsIntegrations: mocks.getScoresForAnalyticsIntegrations,
  getEventsForAnalyticsIntegrations: mocks.getEventsForAnalyticsIntegrations,
  getCurrentSpan: mocks.getCurrentSpan,
  validateWebhookURL: mocks.validateWebhookURL,
}));

vi.mock("@langfuse/shared/encryption", () => ({
  decrypt: mocks.decrypt,
}));

vi.mock("../env", () => ({
  env: mocks.env,
}));

vi.mock("../features/posthog/transformers", () => ({
  transformTraceForPostHog: vi.fn(() => ({ event: "trace" })),
  transformGenerationForPostHog: vi.fn(() => ({ event: "generation" })),
  transformScoreForPostHog: vi.fn(() => ({ event: "score" })),
  transformEventForPostHog: vi.fn(() => ({ event: "event" })),
}));

vi.mock("posthog-node", () => ({
  PostHog: mocks.postHogConstructor,
}));

type StreamKind = "scores" | "traces" | "generations" | "events";

const projectId = "project-1";

const createJob = () =>
  ({
    attemptsMade: 0,
    data: {
      id: "job-1",
      payload: { projectId },
    },
  }) as never;

const createIntegration = (exportSource = "TRACES_OBSERVATIONS_EVENTS") => ({
  projectId,
  enabled: true,
  encryptedPosthogApiKey: "encrypted-key",
  posthogHostName: "https://posthog.example.com",
  exportSource,
  lastSyncAt: new Date("2026-05-20T00:00:00.000Z"),
  project: {
    name: "Project",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
  },
});

async function* rows(count: number) {
  for (let i = 0; i < count; i++) {
    yield { id: `row-${i}` };
  }
}

const createGate = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

describe("handlePostHogIntegrationProjectJob", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.env.LANGFUSE_POSTHOG_FLUSH_DELAY_MS = 500;
    mocks.findFirst.mockResolvedValue(createIntegration());
    mocks.update.mockResolvedValue({});
    mocks.validateWebhookURL.mockResolvedValue(undefined);
    mocks.decrypt.mockReturnValue("posthog-key");
    mocks.getCurrentSpan.mockReturnValue(null);
    mocks.postHogFlush.mockResolvedValue(undefined);
    mocks.postHogConstructor.mockImplementation(() => ({
      capture: mocks.postHogCapture,
      flush: mocks.postHogFlush,
      on: vi.fn(),
    }));
  });

  it("processes selected export streams sequentially", async () => {
    const started: StreamKind[] = [];
    const gates = {
      scores: createGate(),
      traces: createGate(),
      generations: createGate(),
      events: createGate(),
    };

    const trackedRows = (kind: StreamKind) =>
      (async function* () {
        started.push(kind);
        await gates[kind].promise;
        yield { id: kind };
      })();

    mocks.getScoresForAnalyticsIntegrations.mockReturnValue(
      trackedRows("scores"),
    );
    mocks.getTracesForAnalyticsIntegrations.mockReturnValue(
      trackedRows("traces"),
    );
    mocks.getGenerationsForAnalyticsIntegrations.mockReturnValue(
      trackedRows("generations"),
    );
    mocks.getEventsForAnalyticsIntegrations.mockReturnValue(
      trackedRows("events"),
    );

    const run = handlePostHogIntegrationProjectJob(createJob());

    await vi.waitFor(() => expect(started).toEqual(["scores"]));

    gates.scores.resolve();
    await vi.waitFor(() => expect(started).toEqual(["scores", "traces"]));

    gates.traces.resolve();
    await vi.waitFor(() =>
      expect(started).toEqual(["scores", "traces", "generations"]),
    );

    gates.generations.resolve();
    await vi.waitFor(() =>
      expect(started).toEqual(["scores", "traces", "generations", "events"]),
    );

    gates.events.resolve();
    await run;

    expect(mocks.postHogConstructor).toHaveBeenCalledTimes(1);
  });

  it("waits between PostHog flush batches when a stream has more data", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));

    mocks.env.LANGFUSE_POSTHOG_FLUSH_DELAY_MS = 25;
    mocks.findFirst.mockResolvedValue(createIntegration("SCORES"));
    mocks.getScoresForAnalyticsIntegrations.mockReturnValue(rows(10_001));

    const run = handlePostHogIntegrationProjectJob(createJob());

    await vi.waitFor(() => expect(mocks.postHogFlush).toHaveBeenCalledTimes(1));
    expect(mocks.update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(24);
    expect(mocks.update).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await run;

    expect(mocks.postHogFlush).toHaveBeenCalledTimes(2);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
