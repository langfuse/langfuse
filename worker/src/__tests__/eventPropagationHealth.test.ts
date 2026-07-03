import { describe, expect, it } from "vitest";

import { evaluateEventPropagationStuck } from "../features/health";

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
