import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Regression tests for the Mixpanel analytics export throttling fix (issue #12786).
 *
 * The original implementation built one MixpanelClient per stream and ran all
 * streams concurrently via Promise.all, producing an unbounded export burst that
 * overwhelmed the target. This mirrors the PostHog fix in PR #13773 for Mixpanel:
 *   1. a single reused client per job,
 *   2. sequential stream execution (max concurrency 1), and
 *   3. a configurable inter-flush delay (LANGFUSE_MIXPANEL_FLUSH_DELAY_MS).
 *
 * NOTE: unlike the posthog-node SDK, the custom MixpanelClient has no background
 * flush timer, so no shutdown()/timer-cleanup is required here.
 */

// vi.mock factories are hoisted above module scope, so all shared mutable state
// the factories touch must live inside vi.hoisted().
const h = vi.hoisted(() => {
  const timeline: string[] = [];
  const constructed: unknown[] = [];
  const state = { activeStreams: 0, maxConcurrentStreams: 0 };

  // A fake async stream that records start/end on the shared timeline and yields
  // with a yield point in between, so concurrent (Promise.all) execution would
  // interleave and trip the max-concurrency assertion.
  function fakeStream(label: string) {
    return (async function* () {
      state.activeStreams++;
      state.maxConcurrentStreams = Math.max(
        state.maxConcurrentStreams,
        state.activeStreams,
      );
      timeline.push(`${label}:start`);
      await Promise.resolve();
      yield { langfuse_id: `${label}-1` };
      await Promise.resolve();
      yield { langfuse_id: `${label}-2` };
      timeline.push(`${label}:end`);
      state.activeStreams--;
    })();
  }

  const mixpanelIntegrationUpdate = vi.fn();

  return {
    timeline,
    constructed,
    state,
    fakeStream,
    mixpanelIntegrationUpdate,
  };
});

vi.mock("../features/mixpanel/mixpanelClient", () => ({
  MixpanelClient: class {
    addEvent = vi.fn();
    flush = vi.fn().mockImplementation(async () => {
      h.timeline.push("flush");
    });
    getBatchSize = vi.fn().mockReturnValue(0);
    constructor() {
      h.constructed.push(this);
    }
  },
}));

vi.mock("../features/mixpanel/transformers", () => ({
  transformTraceForMixpanel: vi.fn((e) => e),
  transformGenerationForMixpanel: vi.fn((e) => e),
  transformScoreForMixpanel: vi.fn((e) => e),
  transformEventForMixpanel: vi.fn((e) => e),
}));

vi.mock("@langfuse/shared/encryption", () => ({
  decrypt: vi.fn(() => "decrypted-token"),
}));

// Keep the throttle delay out of the unit test (real value defaults to 500ms).
// Path is relative to this test file -> resolves to worker/src/env.
vi.mock("../env", () => ({
  env: { LANGFUSE_MIXPANEL_FLUSH_DELAY_MS: 0 },
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    mixpanelIntegration: {
      findFirst: vi.fn(async () => ({
        projectId: "project-1",
        enabled: true,
        exportSource: "TRACES_OBSERVATIONS_EVENTS",
        mixpanelRegion: "api",
        encryptedMixpanelProjectToken: "enc",
        lastSyncAt: new Date("2024-01-01"),
        project: { name: "Test Project" },
      })),
      update: h.mixpanelIntegrationUpdate,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  QueueName: { MixpanelIntegrationProcessingQueue: "mixpanel" },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  getCurrentSpan: vi.fn(() => undefined),
  getTracesForAnalyticsIntegrations: vi.fn(() => h.fakeStream("traces")),
  getGenerationsForAnalyticsIntegrations: vi.fn(() =>
    h.fakeStream("generations"),
  ),
  getScoresForAnalyticsIntegrations: vi.fn(() => h.fakeStream("scores")),
  getEventsForAnalyticsIntegrations: vi.fn(() => h.fakeStream("events")),
}));

// Import after mocks are registered.
import { handleMixpanelIntegrationProjectJob } from "../features/mixpanel/handleMixpanelIntegrationProjectJob";

function makeJob() {
  return {
    data: { id: "job-1", payload: { projectId: "project-1" } },
    attemptsMade: 0,
  } as unknown as Parameters<typeof handleMixpanelIntegrationProjectJob>[0];
}

describe("handleMixpanelIntegrationProjectJob throttling (issue #12786)", () => {
  beforeEach(() => {
    h.timeline.length = 0;
    h.constructed.length = 0;
    h.state.activeStreams = 0;
    h.state.maxConcurrentStreams = 0;
    h.mixpanelIntegrationUpdate.mockClear();
  });

  it("reuses a single MixpanelClient for the whole job", async () => {
    await handleMixpanelIntegrationProjectJob(makeJob());
    expect(h.constructed.length).toBe(1);
  });

  it("runs export streams sequentially (no concurrent streams)", async () => {
    await handleMixpanelIntegrationProjectJob(makeJob());
    // Each stream must fully finish before the next starts.
    expect(h.state.maxConcurrentStreams).toBe(1);
    // Timeline never has two starts without an intervening end.
    let open = 0;
    for (const entry of h.timeline) {
      if (entry.endsWith(":start")) open++;
      if (entry.endsWith(":end")) open--;
      expect(open).toBeLessThanOrEqual(1);
    }
  });
});
