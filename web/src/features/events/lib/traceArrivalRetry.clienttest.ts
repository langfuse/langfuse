import { describe, expect, it } from "vitest";

import {
  getTraceArrivalEmptyRefetchIntervalMs,
  getTraceArrivalRetryDelayMs,
  shouldRetryTraceArrival,
  TRACE_ARRIVAL_MAX_RETRIES,
} from "@/src/features/events/lib/traceArrivalRetry";

describe("traceArrivalRetry", () => {
  it("retries four times after the first miss (0-based failureCount)", () => {
    expect(shouldRetryTraceArrival(0)).toBe(true);
    expect(shouldRetryTraceArrival(1)).toBe(true);
    expect(shouldRetryTraceArrival(2)).toBe(true);
    expect(shouldRetryTraceArrival(3)).toBe(true);
    expect(shouldRetryTraceArrival(4)).toBe(false);
    expect(TRACE_ARRIVAL_MAX_RETRIES).toBe(4);
  });

  it("uses 1s / 2s / 4s / 8s backoff capped at 8s", () => {
    expect(getTraceArrivalRetryDelayMs(0)).toBe(1_000);
    expect(getTraceArrivalRetryDelayMs(1)).toBe(2_000);
    expect(getTraceArrivalRetryDelayMs(2)).toBe(4_000);
    expect(getTraceArrivalRetryDelayMs(3)).toBe(8_000);
    expect(getTraceArrivalRetryDelayMs(4)).toBe(8_000);
  });

  it("maps empty-result dataUpdateCount onto the same backoff window", () => {
    // First empty success → schedule 1s refetch; fifth empty → stop.
    expect(getTraceArrivalEmptyRefetchIntervalMs(1)).toBe(1_000);
    expect(getTraceArrivalEmptyRefetchIntervalMs(2)).toBe(2_000);
    expect(getTraceArrivalEmptyRefetchIntervalMs(3)).toBe(4_000);
    expect(getTraceArrivalEmptyRefetchIntervalMs(4)).toBe(8_000);
    expect(getTraceArrivalEmptyRefetchIntervalMs(5)).toBe(false);
  });
});
