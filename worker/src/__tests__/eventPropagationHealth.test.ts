import { describe, expect, it, vi } from "vitest";

import {
  evaluateEventPropagationStuck,
  getEventPropagationHealth,
} from "../features/health";

// Pin the write mode to events_only: the propagation worker registers for any
// mode that writes to events_full (dual AND events_only), so the health gate
// must stay active for both. See worker/src/app.ts.
vi.mock("../env", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../env")>();
  return {
    ...mod,
    env: {
      ...mod.env,
      QUEUE_CONSUMER_EVENT_PROPAGATION_QUEUE_IS_ENABLED: "true",
      LANGFUSE_MIGRATION_V4_WRITE_MODE: "events_only",
    },
  };
});

vi.mock("../features/eventPropagation/handleEventPropagationJob", () => ({
  getLastRunStartedAt: vi.fn().mockResolvedValue(null),
  getLastProcessedPartition: vi.fn().mockResolvedValue(null),
}));

describe("getEventPropagationHealth", () => {
  it("keeps the liveness gate enabled in events_only write mode", async () => {
    const health = await getEventPropagationHealth();

    expect(health.enabled).toBe(true);
    expect(health.stuck).toBe(false); // no heartbeat yet -> not stuck
  });
});

describe("evaluateEventPropagationStuck", () => {
  const nowMs = 1_700_000_000_000;
  const thresholdSeconds = 15 * 60;

  it("is not stuck when the last run started recently", () => {
    const result = evaluateEventPropagationStuck({
      enabled: true,
      nowMs,
      lastRunStartedAtMs: nowMs - 60_000, // 1 min ago
      lastProcessedPartition: null,
      thresholdSeconds,
    });

    expect(result.stuck).toBe(false);
    expect(result.secondsSinceLastRun).toBe(60);
    expect(result.lastRunStartedAt).toBe(
      new Date(nowMs - 60_000).toISOString(),
    );
  });

  it("is stuck when the last run started longer ago than the threshold", () => {
    const result = evaluateEventPropagationStuck({
      enabled: true,
      nowMs,
      lastRunStartedAtMs: nowMs - 20 * 60_000, // 20 min ago > 15 min
      lastProcessedPartition: null,
      thresholdSeconds,
    });

    expect(result.stuck).toBe(true);
    expect(result.secondsSinceLastRun).toBe(1200);
  });

  it("is not stuck exactly at the threshold (strictly greater than)", () => {
    const result = evaluateEventPropagationStuck({
      enabled: true,
      nowMs,
      lastRunStartedAtMs: nowMs - thresholdSeconds * 1000,
      lastProcessedPartition: null,
      thresholdSeconds,
    });

    expect(result.secondsSinceLastRun).toBe(thresholdSeconds);
    expect(result.stuck).toBe(false);
  });

  it("is not stuck when the job has never run yet (no heartbeat key)", () => {
    const result = evaluateEventPropagationStuck({
      enabled: true,
      nowMs,
      lastRunStartedAtMs: null,
      lastProcessedPartition: null,
      thresholdSeconds,
    });

    expect(result.stuck).toBe(false);
    expect(result.secondsSinceLastRun).toBeNull();
    expect(result.lastRunStartedAt).toBeNull();
  });

  it("is never stuck when event propagation is disabled, even if very stale", () => {
    const result = evaluateEventPropagationStuck({
      enabled: false,
      nowMs,
      lastRunStartedAtMs: nowMs - 60 * 60_000, // 1 hour ago
      lastProcessedPartition: null,
      thresholdSeconds,
    });

    expect(result.stuck).toBe(false);
    expect(result.enabled).toBe(false);
  });

  it("reports the propagation delay but does NOT let it drive stuck", () => {
    // A large propagation delay ("behind") combined with a recent run start
    // ("running") must stay healthy — restart would not help a slow backlog.
    const result = evaluateEventPropagationStuck({
      enabled: true,
      nowMs,
      lastRunStartedAtMs: nowMs - 30_000, // ran 30s ago -> not stuck
      lastProcessedPartition: new Date(nowMs - 45 * 60_000).toISOString(), // 45 min behind
      thresholdSeconds,
    });

    expect(result.propagationDelaySeconds).toBe(45 * 60);
    expect(result.stuck).toBe(false);
  });

  it("leaves the propagation delay null for an unparsable cursor value", () => {
    const result = evaluateEventPropagationStuck({
      enabled: true,
      nowMs,
      lastRunStartedAtMs: nowMs - 30_000,
      lastProcessedPartition: "not-a-date",
      thresholdSeconds,
    });

    expect(result.propagationDelaySeconds).toBeNull();
  });
});
