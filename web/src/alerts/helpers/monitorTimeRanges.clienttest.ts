import { describe, expect, it } from "vitest";

import { windowToMs } from "@langfuse/shared/monitors";

import {
  getMonitorFilterOptionsLookbackFrom,
  getMonitorPreviewRange,
  monitorPreviewBucketCount,
} from "./monitorTimeRanges";

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

describe("getMonitorPreviewRange", () => {
  it("spans 20 window buckets ending at the last floored boundary", () => {
    const bucketMs = Number(windowToMs("5m"));
    const now = 1_700_000_123_456;
    const range = getMonitorPreviewRange("5m", now);
    expect(range.bucketMs).toBe(bucketMs);
    expect(range.to.getTime()).toBe(Math.floor(now / bucketMs) * bucketMs);
    expect(range.to.getTime() - range.from.getTime()).toBe(
      monitorPreviewBucketCount * bucketMs,
    );
  });

  it("returns the same bucketed `to` for two instants inside one window bucket", () => {
    const bucketMs = Number(windowToMs("5m"));
    const boundary = Math.floor(1_700_000_123_456 / bucketMs) * bucketMs;
    const early = getMonitorPreviewRange("5m", boundary + 1);
    const late = getMonitorPreviewRange("5m", boundary + bucketMs - 1);
    expect(early.to.getTime()).toBe(boundary);
    expect(late.to.getTime()).toBe(boundary);
  });
});

describe("getMonitorFilterOptionsLookbackFrom", () => {
  it("floors the lookback at 7d for a small window whose 20-bucket span is shorter", () => {
    const now = 1_700_000_123_456;
    const { to } = getMonitorPreviewRange("5m", now);
    const from = getMonitorFilterOptionsLookbackFrom("5m", now);
    expect(to.getTime() - from.getTime()).toBe(sevenDaysMs);
  });

  it("uses the full 20-bucket span for a large window that exceeds 7d", () => {
    const now = 1_700_000_123_456;
    const { to, bucketMs } = getMonitorPreviewRange("1d", now);
    const from = getMonitorFilterOptionsLookbackFrom("1d", now);
    expect(to.getTime() - from.getTime()).toBe(
      monitorPreviewBucketCount * bucketMs,
    );
  });
});
